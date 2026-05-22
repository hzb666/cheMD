import type { ChemicalLexiconEntry } from "./types";

export const DEFAULT_CHEMICAL_LEXICON = [
  {
    id: "solvent.thf",
    canonicalName: "tetrahydrofuran",
    aliases: ["tetrahydrofuran", "THF"],
    category: "solvent",
    formula: "C4H8O"
  },
  {
    id: "solvent.dcm",
    canonicalName: "dichloromethane",
    aliases: ["dichloromethane", "methylene chloride", "DCM", "CH2Cl2"],
    category: "solvent",
    formula: "CH2Cl2"
  },
  {
    id: "solvent.ethyl-acetate",
    canonicalName: "ethyl acetate",
    aliases: ["ethyl acetate", "EtOAc", "EA"],
    category: "solvent",
    formula: "C4H8O2"
  },
  {
    id: "solvent.methanol",
    canonicalName: "methanol",
    aliases: ["methanol", "MeOH"],
    category: "solvent",
    formula: "CH4O"
  },
  {
    id: "solvent.ethanol",
    canonicalName: "ethanol",
    aliases: ["ethanol", "EtOH"],
    category: "solvent",
    formula: "C2H6O"
  },
  {
    id: "solvent.acetonitrile",
    canonicalName: "acetonitrile",
    aliases: ["acetonitrile", "MeCN", "CH3CN"],
    category: "solvent",
    formula: "C2H3N"
  },
  {
    id: "solvent.dmf",
    canonicalName: "N,N-dimethylformamide",
    aliases: ["N,N-dimethylformamide", "dimethylformamide", "DMF"],
    category: "solvent",
    formula: "C3H7NO"
  },
  {
    id: "solvent.dmso",
    canonicalName: "dimethyl sulfoxide",
    aliases: ["dimethyl sulfoxide", "DMSO"],
    category: "solvent",
    formula: "C2H6OS"
  },
  {
    id: "solvent.toluene",
    canonicalName: "toluene",
    aliases: ["toluene", "PhMe"],
    category: "solvent",
    formula: "C7H8"
  },
  {
    id: "workup.brine",
    canonicalName: "brine",
    aliases: ["brine", "saturated sodium chloride solution", "sat. NaCl aq."],
    category: "workup"
  },
  {
    id: "workup.sodium-bicarbonate",
    canonicalName: "saturated sodium bicarbonate solution",
    aliases: [
      "saturated sodium bicarbonate solution",
      "sat. sodium bicarbonate solution",
      "sat. NaHCO3 aq.",
      "NaHCO3 aq."
    ],
    category: "workup",
    formula: "NaHCO3"
  },
  {
    id: "reagent.sodium-borohydride",
    canonicalName: "sodium borohydride",
    aliases: ["sodium borohydride", "NaBH4"],
    category: "reagent",
    formula: "NaBH4"
  },
  {
    id: "reagent.n-buli",
    canonicalName: "n-butyllithium",
    aliases: ["n-butyllithium", "n-BuLi", "n BuLi"],
    category: "reagent"
  },
  {
    id: "reagent.lah",
    canonicalName: "lithium aluminium hydride",
    aliases: ["lithium aluminium hydride", "lithium aluminum hydride", "LAH", "LiAlH4"],
    category: "reagent",
    formula: "LiAlH4"
  },
  {
    id: "catalyst.pd-c",
    canonicalName: "palladium on carbon",
    aliases: ["palladium on carbon", "Pd/C"],
    category: "catalyst"
  },
  {
    id: "base.triethylamine",
    canonicalName: "triethylamine",
    aliases: ["triethylamine", "TEA", "Et3N"],
    category: "base",
    formula: "C6H15N"
  },
  {
    id: "base.dipea",
    canonicalName: "N,N-diisopropylethylamine",
    aliases: ["N,N-diisopropylethylamine", "DIPEA", "Hunig's base", "Huenig's base"],
    category: "base"
  },
  {
    id: "acid.hcl",
    canonicalName: "hydrochloric acid",
    aliases: ["hydrochloric acid", "HCl"],
    category: "acid",
    formula: "HCl"
  },
  {
    id: "drying-agent.sodium-sulfate",
    canonicalName: "sodium sulfate",
    aliases: ["sodium sulfate", "Na2SO4"],
    category: "drying_agent",
    formula: "Na2SO4"
  },
  {
    id: "drying-agent.magnesium-sulfate",
    canonicalName: "magnesium sulfate",
    aliases: ["magnesium sulfate", "MgSO4"],
    category: "drying_agent",
    formula: "MgSO4"
  },
  {
    id: "gas.nitrogen",
    canonicalName: "nitrogen",
    aliases: ["nitrogen", "N2"],
    category: "gas",
    formula: "N2"
  },
  {
    id: "gas.argon",
    canonicalName: "argon",
    aliases: ["argon", "Ar"],
    category: "gas",
    formula: "Ar"
  }
] satisfies readonly ChemicalLexiconEntry[];
