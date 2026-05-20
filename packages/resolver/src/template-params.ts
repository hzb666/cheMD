import type {
  Diagnostic,
  ObjectNode,
  TemplateNode,
  TemplateParamSpec,
  UseNode
} from "@chemd/core";
import { getQuantityClassUnits, isQuantityClass, normalizeQuantityUnitKey } from "@chemd/core";

const hasOwn = <TValue>(record: Record<string, TValue>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

const createDefaultParamSpecs = (template: TemplateNode): TemplateParamSpec[] =>
  template.params.map((name) => ({
    name,
    raw: name,
    type: { kind: "string" }
  }));

const getParamSpecs = (template: TemplateNode): TemplateParamSpec[] =>
  template.paramSpecs && template.paramSpecs.length > 0
    ? template.paramSpecs
    : createDefaultParamSpecs(template);

const normalizeReferenceId = (value: string): string =>
  value.trim().replace(/^@/, "").split(".")[0] ?? "";

const reportMissingParam = (
  template: TemplateNode,
  param: TemplateParamSpec,
  diagnostics: Diagnostic[]
) => {
  diagnostics.push({
    code: "E_TEMPLATE_PARAM_MISSING",
    severity: "error",
    message: `Missing template parameter "${param.name}" for template ${template.name}`,
    nodeId: template.name
  });
};

const reportTypeMismatch = (
  template: TemplateNode,
  param: TemplateParamSpec,
  expected: string,
  actual: string,
  diagnostics: Diagnostic[]
) => {
  diagnostics.push({
    code: "E_TEMPLATE_PARAM_TYPE_MISMATCH",
    severity: "error",
    message: `Template parameter "${param.name}" expected ${expected}, got ${actual}`,
    nodeId: template.name
  });
};

const validateReferenceParam = (
  template: TemplateNode,
  param: TemplateParamSpec,
  rawValue: string,
  objectIndex: Record<string, ObjectNode>,
  diagnostics: Diagnostic[]
) => {
  if (param.type.kind !== "ref") {
    return;
  }

  const target = objectIndex[normalizeReferenceId(rawValue)];
  if (!target || target.type !== param.type.targetKind) {
    reportTypeMismatch(
      template,
      param,
      `ref<${param.type.targetKind}>`,
      target ? `ref<${target.type}>` : "unresolved reference",
      diagnostics
    );
  }
};

const isQuantityValue = (rawValue: string, quantityClass: string | undefined): boolean => {
  const match = rawValue.trim().match(/^-?\d+(?:\.\d+)?\s+(°\s*C|℃|[a-zA-Z]+(?:\s*\/\s*[a-zA-Z%]+|\s*%)?|%)$/);
  if (!match) {
    return false;
  }

  if (!quantityClass) {
    return true;
  }

  if (!isQuantityClass(quantityClass)) {
    return false;
  }

  const unitKey = normalizeQuantityUnitKey(match[1]);
  return getQuantityClassUnits(quantityClass).some((unit) => normalizeQuantityUnitKey(unit.unit) === unitKey);
};

const validateQuantityParam = (
  template: TemplateNode,
  param: TemplateParamSpec,
  rawValue: string,
  diagnostics: Diagnostic[]
) => {
  if (param.type.kind !== "quantity") {
    return;
  }

  if (!isQuantityValue(rawValue, param.type.quantityClass)) {
    reportTypeMismatch(
      template,
      param,
      param.type.quantityClass ? `quantity<${param.type.quantityClass}>` : "quantity",
      JSON.stringify(rawValue),
      diagnostics
    );
  }
};

const validateParam = (
  template: TemplateNode,
  param: TemplateParamSpec,
  useNode: UseNode,
  objectIndex: Record<string, ObjectNode>,
  diagnostics: Diagnostic[]
) => {
  if (!hasOwn(useNode.values, param.name) || !useNode.values[param.name]?.trim()) {
    reportMissingParam(template, param, diagnostics);
    return;
  }

  const rawValue = useNode.values[param.name];
  validateReferenceParam(template, param, rawValue, objectIndex, diagnostics);
  validateQuantityParam(template, param, rawValue, diagnostics);
};

export const validateTemplateParams = (
  template: TemplateNode,
  useNode: UseNode,
  objectIndex: Record<string, ObjectNode>,
  diagnostics: Diagnostic[]
) => {
  for (const param of getParamSpecs(template)) {
    validateParam(template, param, useNode, objectIndex, diagnostics);
  }
};
