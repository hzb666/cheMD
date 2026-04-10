import type { ResolvedWritebackTarget, WritebackTargetFields } from "./dto";

const buildResolvedTarget = (
  preferredBlockId: string | undefined,
  blockId: string | undefined,
  fallbackBlockId: string | undefined
): ResolvedWritebackTarget => ({
  blockId: preferredBlockId ?? blockId ?? fallbackBlockId!,
  action: preferredBlockId || blockId ? "update_existing" : "create_new"
});

export const hasWritebackTarget = (targets: WritebackTargetFields): boolean =>
  Boolean(targets.blockId || targets.fallbackBlockId || targets.moleculeBlockId || targets.reactionBlockId);

// reaction 结果优先写回专属 reaction block；
// 没给 reaction block 时才回退到通用 block，再退到 create_new 的 fallback block。
export const resolveReactionWritebackTarget = (
  targets: WritebackTargetFields
): ResolvedWritebackTarget =>
  buildResolvedTarget(targets.reactionBlockId, targets.blockId, targets.fallbackBlockId);

// molecule 回退只认 molecule 专属 block 和通用 block；
// 这样不会把分子兜底结果误写进 reaction 专属位置。
export const resolveMoleculeWritebackTarget = (
  targets: WritebackTargetFields
): ResolvedWritebackTarget =>
  buildResolvedTarget(targets.moleculeBlockId, targets.blockId, targets.fallbackBlockId);

// OCR 整体失败时优先回到调用方最初指向的 block；
// 若原本就是 create_new，再落到 fallback block，最后才退到专属 target。
export const resolveFailedWritebackTarget = (
  targets: WritebackTargetFields
): ResolvedWritebackTarget => ({
  blockId:
    targets.blockId
    ?? targets.fallbackBlockId
    ?? targets.moleculeBlockId
    ?? targets.reactionBlockId!,
  action: targets.blockId || targets.moleculeBlockId || targets.reactionBlockId
    ? "update_existing"
    : "create_new"
});
