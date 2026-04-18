import type {
  Diagnostic,
  ObjectNode,
  TemplateNode,
  TemplateParamSpec,
  UseNode
} from "@chemd/core";

const QUANTITY_UNITS: Record<string, Set<string>> = {
  amount: new Set(["mmol", "mol"]),
  mass: new Set(["mg", "g", "kg"]),
  volume: new Set(["ml", "mL", "l", "L"]),
  temperature: new Set(["C", "°C", "℃", "K", "F"]),
  time: new Set(["h", "hr", "hrs", "min", "mins", "分钟", "小时"]),
  pressure: new Set(["bar", "atm", "psi"]),
  concentration: new Set(["M", "mM"]),
  equivalent: new Set(["equiv", "eq"]),
  percent: new Set(["%", "percent"])
};

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

const normalizeUnit = (unit: string): string => unit.trim().toLowerCase();

const isQuantityValue = (rawValue: string, quantityClass: string | undefined): boolean => {
  const match = rawValue.trim().match(/^-?\d+(?:\.\d+)?\s*([a-zA-Z%°℃]+)$/);
  if (!match) {
    return false;
  }

  if (!quantityClass) {
    return true;
  }

  const units = QUANTITY_UNITS[quantityClass];
  return Boolean(units && [...units].some((unit) => normalizeUnit(unit) === normalizeUnit(match[1])));
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
