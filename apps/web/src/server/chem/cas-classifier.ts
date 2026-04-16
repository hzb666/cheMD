export const CAS_NUMBER_PATTERN = /^\d{2,7}-\d{2}-\d$/;
export const CAS_LIKE_PATTERN = /^[\d-]+$/;

export type CasClassification =
  | {
      kind: "non-cas";
    }
  | {
      kind: "cas";
      cas: string;
    }
  | {
      kind: "invalid";
      message: string;
    };

const calculateCasChecksum = (value: string): number => {
  const digits = value.replaceAll("-", "");
  const checksumDigit = digits.charCodeAt(digits.length - 1) - 48;
  const payloadDigits = digits.slice(0, -1);

  let sum = 0;
  for (let index = payloadDigits.length - 1, multiplier = 1; index >= 0; index -= 1, multiplier += 1) {
    sum += (payloadDigits.charCodeAt(index) - 48) * multiplier;
  }

  return sum % 10 === checksumDigit ? checksumDigit : -1;
};

export const classifyCasNumber = (value: string): CasClassification => {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes("-") || !CAS_LIKE_PATTERN.test(trimmed)) {
    return { kind: "non-cas" };
  }

  if (!CAS_NUMBER_PATTERN.test(trimmed)) {
    return {
      kind: "invalid",
      message: `CAS "${trimmed}" must match the NNNNNNN-NN-N format.`
    };
  }

  if (calculateCasChecksum(trimmed) === -1) {
    return {
      kind: "invalid",
      message: `CAS "${trimmed}" has an invalid checksum.`
    };
  }

  return {
    kind: "cas",
    cas: trimmed
  };
};
