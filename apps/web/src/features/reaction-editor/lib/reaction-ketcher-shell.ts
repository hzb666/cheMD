import {
  createReactionBridgeValue,
  normalizeReactionDraft,
  normalizeReactionFrameValue
} from "../hooks/useReactionBridge";
import { createReactionSourceKey } from "./reaction-draft-store";
import type { ReactionEditorDraft, ReactionFrameValue } from "../types";

export interface ReactionKetcherShellValue {
  bridgeMode: "shell";
  syncToken: string;
  editorValue: ReactionFrameValue;
}

export const createReactionKetcherShellValue = (
  value: ReactionEditorDraft
): ReactionKetcherShellValue => ({
  bridgeMode: "shell",
  syncToken: createReactionSourceKey(value),
  editorValue: createReactionBridgeValue(value)
});

export const normalizeReactionKetcherShellValue = (
  value: ReactionKetcherShellValue
): ReactionKetcherShellValue => ({
  bridgeMode: "shell",
  syncToken: value.syncToken,
  editorValue: normalizeReactionFrameValue(value.editorValue)
});

export const exportReactionDraftFromKetcherShell = async (
  value: ReactionKetcherShellValue
): Promise<ReactionEditorDraft> => normalizeReactionDraft(value.editorValue);
