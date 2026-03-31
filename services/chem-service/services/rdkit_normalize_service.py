"""RDKit normalize service."""

from __future__ import annotations

try:
    from rdkit import Chem
    from rdkit.Chem.MolStandardize import rdMolStandardize

    _RDKIT_AVAILABLE = True
except ImportError:  # pragma: no cover
    _RDKIT_AVAILABLE = False


class RdkitNormalizeService:
    """Canonicalise and validate a chemical structure using RDKit."""

    def normalize(self, *, smiles: str | None = None, molfile: str | None = None) -> dict:
        """Normalize a structure.

        Args:
            smiles: SMILES string (used when *molfile* is absent).
            molfile: V2000/V3000 molfile (takes priority over *smiles*).

        Returns:
            A dict with ``canonical_smiles``, ``normalized_molfile``,
            ``warnings`` keys.
        """
        warnings: list[str] = []

        if not _RDKIT_AVAILABLE:
            warnings.append("RDKit is not installed – returning input unchanged")
            return {
                "canonical_smiles": smiles or "",
                "normalized_molfile": molfile,
                "warnings": warnings,
            }

        mol = None
        if molfile:
            mol = Chem.MolFromMolBlock(molfile, removeHs=False)
            if mol is None:
                warnings.append("Could not parse molfile; falling back to SMILES")

        if mol is None and smiles:
            mol = Chem.MolFromSmiles(smiles)
            if mol is None:
                warnings.append("Could not parse SMILES")
                return {
                    "canonical_smiles": smiles,
                    "normalized_molfile": molfile,
                    "warnings": warnings,
                }

        if mol is None:
            warnings.append("No valid structure provided")
            return {
                "canonical_smiles": smiles or "",
                "normalized_molfile": molfile,
                "warnings": warnings,
            }

        # Standardize
        try:
            standardizer = rdMolStandardize.Standardizer()
            mol = standardizer.standardize(mol)
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"Standardization warning: {exc}")

        canonical_smiles = Chem.MolToSmiles(mol)
        normalized_molfile = Chem.MolToMolBlock(mol)

        return {
            "canonical_smiles": canonical_smiles,
            "normalized_molfile": normalized_molfile,
            "warnings": warnings,
        }
