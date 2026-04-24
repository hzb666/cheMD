import { describe, expect, it, vi } from "vitest";

import { initializeEditorInstance } from "../src/features/chem-editor/components/EmbeddedChemEditorHost";

describe("initializeEditorInstance", () => {
  it("hydrates the existing structure before subscribing to editor change events", async () => {
    const steps: string[] = [];
    const syncDraftFromEditor = vi.fn(async () => {
      steps.push("sync");
    });

    const changeEvent = {
      add: vi.fn((handler: () => void) => {
        steps.push("bind");
        handler();
      })
    };

    const result = await initializeEditorInstance({
      instance: {
        editor: {
          zoom: () => 1,
          centerStruct: vi.fn()
        },
        changeEvent,
        setMolecule: vi.fn(async (structure: string) => {
          steps.push(`set:${structure}`);
        })
      },
      draft: {
        kind: "molecule",
        smiles: "CCO"
      },
      structureInput: "CCO",
      syncDraftFromEditor
    });

    expect(result.appliedValue).toBe("CCO");
    expect(steps).toEqual(["set:CCO", "bind", "sync"]);
  });

  it("still binds change events when the incoming draft has no structure payload yet", async () => {
    const syncDraftFromEditor = vi.fn(async () => undefined);
    const add = vi.fn();
    const setMolecule = vi.fn();

    const result = await initializeEditorInstance({
      instance: {
        editor: undefined,
        changeEvent: {
          add
        },
        setMolecule
      },
      draft: {
        kind: "molecule",
        smiles: ""
      },
      structureInput: "",
      syncDraftFromEditor
    });

    expect(result.appliedValue).toBeNull();
    expect(setMolecule).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledTimes(1);
  });
});
