import { describe, expect, it } from "vitest";

import { buildMoleculeRenderRequestPayload } from "../src/features/chem-preview/hooks/useRenderedPreview";

describe("rendered preview molecule hydration", () => {
  it("includes renderOptions in the molecule hydration request payload", () => {
    expect(
      buildMoleculeRenderRequestPayload(
        {
          smiles: "CCO",
          molfile: "mock-molfile"
        },
        {
          profileId: "publication-acs",
          structure: {
            bondLength: 32,
            bondLineWidth: 1.4,
            multipleBondOffset: 0.18,
            hashSpacing: 2.2,
            fontSize: 10,
            atomLabelPadding: 0,
            monochrome: true,
            backgroundColor: "#ffffff"
          },
          reaction: {
            arrowLength: 72,
            componentGap: 24,
            plusGap: 18,
            showConditionsBelowArrow: false
          },
          export: {
            imageFormat: "svg",
            margin: 12,
            dpi: 600,
            transparentBackground: false
          }
        }
      )
    ).toEqual({
      type: "molecule",
      smiles: "CCO",
      molfile: "mock-molfile",
      renderOptions: {
        profileId: "publication-acs",
        structure: {
          bondLength: 32,
          bondLineWidth: 1.4,
          multipleBondOffset: 0.18,
          hashSpacing: 2.2,
          fontSize: 10,
          atomLabelPadding: 0,
          monochrome: true,
          backgroundColor: "#ffffff"
        },
        reaction: {
          arrowLength: 72,
          componentGap: 24,
          plusGap: 18,
          showConditionsBelowArrow: false
        },
        export: {
          imageFormat: "svg",
          margin: 12,
          dpi: 600,
          transparentBackground: false
        }
      }
    });
  });
});
