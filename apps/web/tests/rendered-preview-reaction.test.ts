import { describe, expect, it } from "vitest";

import { buildReactionRenderRequestPayload } from "../src/features/chem-preview/hooks/useRenderedPreview";

describe("rendered preview reaction hydration", () => {
  it("includes renderOptions with transparent background in reaction hydration payload", () => {
    expect(
      buildReactionRenderRequestPayload(
        {
          reactants: ["CCO"],
          products: ["CC(=O)O"],
          conditions: ["air"]
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
            backgroundColor: "#00000000"
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
            transparentBackground: true
          }
        }
      )
    ).toEqual({
      type: "reaction",
      reactants: ["CCO"],
      products: ["CC(=O)O"],
      conditions: ["air"],
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
          backgroundColor: "#00000000"
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
          transparentBackground: true
        }
      }
    });
  });
});
