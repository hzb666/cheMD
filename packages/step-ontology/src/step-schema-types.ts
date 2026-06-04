import type { QuantityClass } from "@chemd/core";

import type { StepEffect, StepFamily } from "./types";

export type StepParamType =
  | "string"
  | "quantity"
  | "reference"
  | "enum"
  | "boolean";

export type StepCapability =
  | "stirring"
  | "cooling"
  | "heating"
  | "inert_gas"
  | "vacuum"
  | "filtration"
  | "chromatography"
  | "analytical_tlc"
  | "nmr"
  | "hplc";

export interface StepParamSchema {
  name: string;
  type: StepParamType;
  quantityClass?: QuantityClass;
  targetKind?: string[];
  aliases?: string[];
  values?: string[];
}

export type StepRequirement =
  | { kind: "field"; field: string }
  | { kind: "anyOf"; fields: string[] }
  | { kind: "oneOf"; fields: string[] };

export interface StepDefault {
  field: string;
  value: string | number | boolean;
  reason: string;
}

export interface CapabilityRule {
  capability: StepCapability;
  when?: {
    param: string;
    equals: string[];
  };
}

export interface ConfirmationRule {
  strategy: "none" | "manual_required";
  reason?: string;
}

export interface StepFamilySchema {
  family: StepFamily;
  params: StepParamSchema[];
  required: StepRequirement[];
  defaults?: StepDefault[];
  capabilities?: CapabilityRule[];
  effects?: StepEffect[];
  safetyTags?: string[];
  robotRunnable?: boolean;
  confirmation?: ConfirmationRule;
  unknownParams?: "allow" | "error";
}
