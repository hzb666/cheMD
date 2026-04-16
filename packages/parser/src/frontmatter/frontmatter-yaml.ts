import { isMap, isScalar, isSeq } from "yaml";

export const getYamlMapKey = (keyNode: unknown): string | undefined => {
  if (isScalar(keyNode) && typeof keyNode.value === "string") {
    return keyNode.value;
  }

  if (isScalar(keyNode) && keyNode.value !== undefined && keyNode.value !== null) {
    return String(keyNode.value);
  }

  return undefined;
};

export const toPlainYamlValue = (node: unknown): unknown => {
  if (node === undefined || node === null) {
    return "";
  }

  if (isScalar(node)) {
    return node.value;
  }

  if (isSeq(node)) {
    return node.items.map((item) => toPlainYamlValue(item));
  }

  if (isMap(node)) {
    const value: Record<string, unknown> = {};

    for (const item of node.items) {
      const key = getYamlMapKey(item.key);

      if (!key) {
        continue;
      }

      value[key] = toPlainYamlValue(item.value);
    }

    return value;
  }

  return "";
};
