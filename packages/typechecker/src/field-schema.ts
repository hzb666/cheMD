import {
  getEnumFieldValues,
  getQuantityFieldClass,
  type QuantityClass
} from "@chemd/core";

export const getTypecheckerQuantityFieldClass = (
  blockType: string,
  fieldName: string,
  fallback: QuantityClass
): QuantityClass =>
  getQuantityFieldClass(blockType, fieldName) ?? fallback;

export const getTypecheckerEnumFieldValues = (
  blockType: string,
  fieldName: string
): string[] =>
  getEnumFieldValues(blockType, fieldName);
