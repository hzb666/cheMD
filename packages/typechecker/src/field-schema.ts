import {
  getEnumFieldValues,
  getQuantityFieldClass
} from "@chemd/core/compat";
import type { QuantityClass } from "@chemd/core";

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
