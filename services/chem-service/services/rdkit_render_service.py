"""RDKit render service."""

from __future__ import annotations

try:
    from rdkit import Chem
    from rdkit.Chem.Draw import rdMolDraw2D

    _RDKIT_AVAILABLE = True
except ImportError:  # pragma: no cover
    _RDKIT_AVAILABLE = False

_FALLBACK_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">'
    '<text x="10" y="100" font-size="14" fill="#6b7280">RDKit not available</text>'
    "</svg>"
)


class RdkitRenderService:
    """Render a chemical structure to SVG using RDKit."""

    def render(
        self,
        *,
        smiles: str | None = None,
        molfile: str | None = None,
        width: int = 400,
        height: int = 300,
    ) -> dict:
        """Render a structure as SVG.

        Args:
            smiles: SMILES string (used when *molfile* is absent).
            molfile: V2000/V3000 molfile (takes priority over *smiles*).
            width: Output image width in pixels.
            height: Output image height in pixels.

        Returns:
            A dict with ``svg`` and ``warnings`` keys.
        """
        warnings: list[str] = []

        if not _RDKIT_AVAILABLE:
            warnings.append("RDKit is not installed – returning placeholder SVG")
            return {"svg": _FALLBACK_SVG, "warnings": warnings}

        mol = None
        if molfile:
            mol = Chem.MolFromMolBlock(molfile, removeHs=False)
            if mol is None:
                warnings.append("Could not parse molfile; falling back to SMILES")

        if mol is None and smiles:
            mol = Chem.MolFromSmiles(smiles)
            if mol is None:
                warnings.append("Could not parse SMILES")
                return {"svg": _FALLBACK_SVG, "warnings": warnings}

        if mol is None:
            warnings.append("No valid structure provided")
            return {"svg": _FALLBACK_SVG, "warnings": warnings}

        drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
        drawer.DrawMolecule(mol)
        drawer.FinishDrawing()
        svg = drawer.GetDrawingText()

        return {"svg": svg, "warnings": warnings}
