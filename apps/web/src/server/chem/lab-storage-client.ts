interface LabStorageInventoryItem {
  id: number;
  name: string;
  storage_location: string | null;
  remaining_quantity: number | null;
  unit: string | null;
  status: string;
  borrower_id: number | null;
}

export interface LabStorageInventoryResponse {
  cas_number: string;
  exists_in_inventory: boolean;
  total_remaining: number;
  in_stock_count: number;
  borrowed_count: number;
  items: LabStorageInventoryItem[];
}

interface LabStorageInventoryListResponse {
  data: Array<{
    id: number;
    name: string;
    storage_location: string | null;
    remaining_quantity: number | null;
    unit: string | null;
    status: string;
    borrower_id: number | null;
  }>;
  total: number;
}

interface LabStorageInventoryTotalResponse {
  cas_number: string;
  total_remaining: number;
}

interface LabStorageSession {
  cookieHeader: string;
  expiresAt: number;
}

const LAB_STORAGE_BASE_URL =
  process.env.LAB_STORAGE_BASE_URL?.trim() || "https://lab.thejiaogroup.cn/api";

const LAB_STORAGE_USERNAME = process.env.LAB_STORAGE_USERNAME?.trim();
const LAB_STORAGE_PASSWORD = process.env.LAB_STORAGE_PASSWORD?.trim();
const LAB_STORAGE_DEVICE_ID = process.env.LAB_STORAGE_DEVICE_ID?.trim() || "chemd-lab-storage-proxy";
const LAB_STORAGE_DEVICE_NAME = process.env.LAB_STORAGE_DEVICE_NAME?.trim() || "chemd server proxy";

const LAB_STORAGE_REFRESH_SKEW_MS = 5 * 60 * 1000;

let cachedSession: LabStorageSession | null = null;
let inflightSessionPromise: Promise<LabStorageSession> | null = null;

const parseMaxAgeSeconds = (setCookieHeader: string): number => {
  const match = setCookieHeader.match(/;\s*Max-Age=(\d+)/i);
  const parsed = match ? Number.parseInt(match[1] ?? "", 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 72 * 60 * 60;
};

const parseAccessTokenCookieHeader = (setCookieHeader: string): string => {
  const cookiePair = setCookieHeader.split(";", 1)[0]?.trim() ?? "";
  if (!cookiePair.startsWith("access_token=")) {
    throw new Error("LabStorageManager login did not return an access_token cookie");
  }
  return cookiePair;
};

const requireLabStorageCredentials = (): { username: string; password: string } => {
  if (!LAB_STORAGE_USERNAME || !LAB_STORAGE_PASSWORD) {
    throw new Error(
      "LabStorageManager credentials are not configured. Set LAB_STORAGE_USERNAME and LAB_STORAGE_PASSWORD."
    );
  }

  return {
    username: LAB_STORAGE_USERNAME,
    password: LAB_STORAGE_PASSWORD
  };
};

const readCachedSession = (): LabStorageSession | null => {
  // 仅缓存 access_token，会话外的库存结果始终直查下游。
  if (!cachedSession) {
    return null;
  }

  if (Date.now() >= cachedSession.expiresAt - LAB_STORAGE_REFRESH_SKEW_MS) {
    cachedSession = null;
    return null;
  }

  return cachedSession;
};

const loginLabStorage = async (fetchImpl: typeof fetch): Promise<LabStorageSession> => {
  const { username, password } = requireLabStorageCredentials();
  const response = await fetchImpl(`${LAB_STORAGE_BASE_URL}/users/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      username,
      password,
      device_id: LAB_STORAGE_DEVICE_ID,
      device_name: LAB_STORAGE_DEVICE_NAME
    })
  });

  if (!response.ok) {
    throw new Error(`LabStorageManager login failed (${response.status})`);
  }

  const setCookieHeader = response.headers.get("set-cookie")?.trim() ?? "";
  if (!setCookieHeader) {
    throw new Error("LabStorageManager login response did not include a session cookie");
  }

  const maxAgeSeconds = parseMaxAgeSeconds(setCookieHeader);
  return {
    cookieHeader: parseAccessTokenCookieHeader(setCookieHeader),
    expiresAt: Date.now() + maxAgeSeconds * 1000
  };
};

const getLabStorageSession = async (fetchImpl: typeof fetch): Promise<LabStorageSession> => {
  const cached = readCachedSession();
  if (cached) {
    return cached;
  }

  if (inflightSessionPromise) {
    return inflightSessionPromise;
  }

  inflightSessionPromise = loginLabStorage(fetchImpl)
    .then((session) => {
      cachedSession = session;
      return session;
    })
    .finally(() => {
      inflightSessionPromise = null;
    });

  return inflightSessionPromise;
};

const requestLabStorage = async (
  path: string,
  fetchImpl: typeof fetch,
  retryOnUnauthorized: boolean
): Promise<Response> => {
  const session = await getLabStorageSession(fetchImpl);
  const response = await fetchImpl(`${LAB_STORAGE_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      Cookie: session.cookieHeader
    }
  });

  if (response.status === 401 && retryOnUnauthorized) {
    // 首次 401 清空本地 token 并重登一次，兜底服务端提前失效。
    cachedSession = null;
    return requestLabStorage(path, fetchImpl, false);
  }

  return response;
};

const sumRemainingQuantity = (items: LabStorageInventoryListResponse["data"]): number =>
  items.reduce((total, item) => total + (typeof item.remaining_quantity === "number" ? item.remaining_quantity : 0), 0);

const mapInventoryItems = (
  items: LabStorageInventoryListResponse["data"]
): LabStorageInventoryResponse["items"] =>
  items.map((item) => ({
    id: item.id,
    name: item.name,
    storage_location: item.storage_location,
    remaining_quantity: item.remaining_quantity,
    unit: item.unit,
    status: item.status,
    borrower_id: item.borrower_id
  }));

const buildInventoryFallbackResponse = (
  casNumber: string,
  listPayload: LabStorageInventoryListResponse | null,
  totalPayload: LabStorageInventoryTotalResponse | null
): LabStorageInventoryResponse => {
  const items = Array.isArray(listPayload?.data) ? listPayload.data : [];
  const mappedItems = mapInventoryItems(items);

  return {
    cas_number: casNumber,
    exists_in_inventory: (typeof listPayload?.total === "number" ? listPayload.total : mappedItems.length) > 0,
    total_remaining:
      typeof totalPayload?.total_remaining === "number" ? totalPayload.total_remaining : sumRemainingQuantity(items),
    in_stock_count: mappedItems.filter((item) => item.status === "in_stock").length,
    borrowed_count: mappedItems.filter((item) => item.status === "borrowed").length,
    items: mappedItems
  };
};

const requestLabStorageInventoryFallback = async (
  casNumber: string,
  fetchImpl: typeof fetch,
  retryOnUnauthorized: boolean
): Promise<LabStorageInventoryResponse> => {
  const listResponse = await requestLabStorage(
    `/inventory?cas_filter=${encodeURIComponent(casNumber)}&limit=100`,
    fetchImpl,
    retryOnUnauthorized
  );
  if (!listResponse.ok) {
    throw new Error(`LabStorageManager inventory list fallback failed (${listResponse.status})`);
  }

  const listPayload = (await listResponse.json().catch(() => null)) as LabStorageInventoryListResponse | null;
  const totalResponse = await requestLabStorage(
    `/inventory/cas/${encodeURIComponent(casNumber)}/total`,
    fetchImpl,
    retryOnUnauthorized
  );
  const totalPayload = totalResponse.ok
    ? ((await totalResponse.json().catch(() => null)) as LabStorageInventoryTotalResponse | null)
    : null;

  return buildInventoryFallbackResponse(casNumber, listPayload, totalPayload);
};

const requestLabStorageInventory = async (
  casNumber: string,
  fetchImpl: typeof fetch,
  retryOnUnauthorized: boolean
): Promise<LabStorageInventoryResponse> => {
  const response = await requestLabStorage(
    `/inventory/cas/${encodeURIComponent(casNumber)}`,
    fetchImpl,
    retryOnUnauthorized
  );

  if (!response.ok) {
    if (response.status >= 500) {
      // 聚合接口 5xx 时降级为 list+total 双请求，保持响应字段不变。
      return requestLabStorageInventoryFallback(casNumber, fetchImpl, retryOnUnauthorized);
    }
    throw new Error(`LabStorageManager inventory lookup failed (${response.status})`);
  }

  return response.json() as Promise<LabStorageInventoryResponse>;
};

export const fetchLabStorageInventoryByCas = async (
  casNumber: string,
  options: {
    fetchImpl?: typeof fetch;
  } = {}
): Promise<LabStorageInventoryResponse> =>
  requestLabStorageInventory(casNumber, options.fetchImpl ?? fetch, true);
