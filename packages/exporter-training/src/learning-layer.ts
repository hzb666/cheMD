import type { LearningLayerV1 } from "./types";

export const buildLearningLayer = (): LearningLayerV1 => ({
  retrieval_chunks: [],
  prediction_instances: []
});
