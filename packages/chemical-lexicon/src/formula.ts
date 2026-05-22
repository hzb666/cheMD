const ELEMENT_SYMBOLS = new Set([
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne",
  "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
  "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
  "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn",
  "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
  "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb",
  "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
  "Tl", "Pb", "Bi"
]);

export const FORMULA_CANDIDATE_PATTERN = /\b(?:[A-Z][a-z]?\d*){2,}(?:[+-])?\b/g;

export const isFormulaLike = (input: string): boolean => {
  const formula = input.replace(/[+-]$/u, "");
  let index = 0;
  let elementCount = 0;
  let hasDigit = false;

  while (index < formula.length) {
    const upper = formula[index];
    if (!upper || upper < "A" || upper > "Z") {
      return false;
    }

    const next = formula[index + 1];
    const symbol = next && next >= "a" && next <= "z"
      ? `${upper}${next}`
      : upper;
    if (!ELEMENT_SYMBOLS.has(symbol)) {
      return false;
    }

    index += symbol.length;
    elementCount += 1;

    while (index < formula.length && formula[index] >= "0" && formula[index] <= "9") {
      hasDigit = true;
      index += 1;
    }
  }

  return elementCount >= 2 && hasDigit;
};
