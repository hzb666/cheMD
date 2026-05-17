import { describe, expect, it } from "vitest";

import {
  canUseGatewayForCompleteWorkspaceSemantics,
  createWorkspaceSourceRevision,
  deriveWorkspaceDataGatewayState,
  workspaceIndexRowsToFiles,
} from "./workspace-data-gateway";
import type { WorkspaceIndexRow } from "../contracts";

const row = (path: string, overrides: Partial<WorkspaceIndexRow> = {}): WorkspaceIndexRow => ({
  id: `workspace-test:${path}`,
  name: path.split("/").at(-1) ?? path,
  path,
  kind: "file",
  chemdKind: "document",
  bytes: 12,
  modifiedAtMs: 123,
  revisionKey: `meta:12:123:${path}`,
  ...overrides,
});

describe("workspace data gateway helpers", () => {
  it("maps manifest rows back to workspace file entries without source text", () => {
    const files = workspaceIndexRowsToFiles([
      row("experiments/a.chemd"),
      row("assets/image.txt", { chemdKind: "asset" }),
    ]);

    expect(files).toEqual([
      {
        id: "workspace-test:experiments/a.chemd",
        name: "a.chemd",
        path: "experiments/a.chemd",
        kind: "file",
        chemdKind: "document",
      },
      {
        id: "workspace-test:assets/image.txt",
        name: "image.txt",
        path: "assets/image.txt",
        kind: "file",
        chemdKind: "asset",
      },
    ]);
  });

  it("marks partial state when the backend reports a next cursor", () => {
    expect(deriveWorkspaceDataGatewayState({
      rows: [row("a.chemd")],
      summary: {
        totalCount: 3,
        returnedCount: 1,
        documentCount: 3,
        cursor: 0,
        limit: 1,
      },
      nextCursor: 1,
    })).toBe("partial");
  });

  it("only exposes complete semantic coverage for ready gateway state", () => {
    expect(canUseGatewayForCompleteWorkspaceSemantics("ready")).toBe(true);
    expect(canUseGatewayForCompleteWorkspaceSemantics("partial")).toBe(false);
    expect(canUseGatewayForCompleteWorkspaceSemantics("degraded")).toBe(false);
  });

  it("builds current-source revisions from workspace path source and manifest metadata", () => {
    const first = createWorkspaceSourceRevision({
      workspaceId: "workspace-test",
      path: "a.chemd",
      source: "alpha",
      modifiedAtMs: 123,
      manifestRevisionKey: "meta:5:123",
    });
    const second = createWorkspaceSourceRevision({
      workspaceId: "workspace-test",
      path: "a.chemd",
      source: "beta",
      modifiedAtMs: 123,
      manifestRevisionKey: "meta:5:123",
    });

    expect(first.sourceRevision).not.toBe(second.sourceRevision);
    expect(first.manifestRevisionKey).toBe("meta:5:123");
    expect(first.modifiedAtMs).toBe(123);
  });
});
