export const sampleSource = `module exp_2026_03_30_001

/*md
Water marker: :chem[H2O]
Yield: @res_main.yield
*/
meta {
  id: "exp-2026-03-30-001"
  title: "Ethanol oxidation to acetic acid"
  date: "2026-03-30"
  render_profile: publication_acs
  primary_reaction: @chem_rxn_main
  primary_result: @res_main
}

molecule chem_mol_main {
  name: "ethanol"
  smiles: "CCO"
}

molecule oxygen {
  name: "oxygen"
  smiles: "O=O"
}

molecule acetic_acid {
  name: "acetic acid"
  smiles: "CC(=O)O"
}

/// Oxidation demo reaction for the playground.
reaction chem_rxn_main {
  reactants: [@chem_mol_main, @oxygen]
  products: [@acetic_acid]
  catalyst: "Cu catalyst"
  atmosphere: "air"
  temperature: 80 C
  time: 4 h
}

procedure proc_main for @chem_rxn_main {
  evidence: [@res_main, @ana_tlc_main]
  step heat_main = heat(temperature: 80 C, duration: 4 h)
  step analyze_main = analyze(type: tlc, depends_on: [heat_main])
}

analysis ana_tlc_main for @chem_rxn_main {
  type: tlc
  time: 0.5 h
  eluent: "PE/EA = 4:1"
  result: "TLC combination board for sm / product / reaction labels"
  data: "TLC lane matrix for default playground preview"
}

result res_main for @chem_rxn_main {
  status: complete
  yield: 63%
  conversion: 78%
  selectivity: 91%
  purity: 98%
  notes: "TLC demo shows product formation and high purity."
}
`;
