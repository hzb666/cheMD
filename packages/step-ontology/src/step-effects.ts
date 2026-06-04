import type { StepEffect, StepFamily } from "./types";

const EFFECTS_BY_FAMILY: Record<StepFamily, StepEffect[]> = {
  add: ["adds_material"],
  analyze: ["produces_analysis"],
  charge: ["creates_mixture"],
  concentrate: ["removes_solvent"],
  cool: ["changes_temperature"],
  dry: ["dries_material"],
  extract: ["creates_biphasic_system"],
  filter: ["filters_solid"],
  heat: ["changes_temperature"],
  hold: ["maintains_conditions"],
  mix: ["creates_mixture"],
  observe: ["records_observation"],
  purge: ["uses_inert_atmosphere"],
  purify: ["requires_purification"],
  quench: ["quenches_reaction", "produces_gas"],
  sample: ["requires_sampling"],
  separate_layers: ["separates_phases"],
  store: ["stores_material"],
  transfer: ["transfers_material"],
  wash: ["creates_biphasic_system"]
};

export const getStandardEffectsForFamily = (family: StepFamily): StepEffect[] =>
  EFFECTS_BY_FAMILY[family];

export const mergeStepEffects = (
  family: StepFamily,
  effects: readonly StepEffect[] = []
): StepEffect[] => [...new Set([...getStandardEffectsForFamily(family), ...effects])];
