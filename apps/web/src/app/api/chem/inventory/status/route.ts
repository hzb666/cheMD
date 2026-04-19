import { readLabStorageConnectionStatus } from "@/server/chem/lab-storage-client";

export const runtime = "nodejs";

export const GET = async (): Promise<Response> =>
  Response.json(await readLabStorageConnectionStatus());
