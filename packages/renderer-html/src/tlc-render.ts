import type { AnalysisNode, NormalizedTlcAnalysis } from "@chemd/core";

import { escapeHtml, renderBlockTitle, renderFieldList } from "./shared";

const TLC_BASELINE_PERCENT = 84;
const TLC_SOLVENT_FRONT_PERCENT = 16;
const TLC_DEFAULT_RANK = 3;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const resolveRank = (rank?: number | null): number =>
  clamp(rank ?? TLC_DEFAULT_RANK, 1, 5);

const formatPercent = (value: number): string => `${Number(value.toFixed(2))}%`;

const getVerticalPosition = (rf?: number | null): string => {
  if (typeof rf !== "number" || Number.isNaN(rf)) {
    return formatPercent((TLC_BASELINE_PERCENT + TLC_SOLVENT_FRONT_PERCENT) / 2);
  }

  const clampedRf = clamp(rf, 0, 1);
  const travel = TLC_BASELINE_PERCENT - TLC_SOLVENT_FRONT_PERCENT;
  return formatPercent(TLC_BASELINE_PERCENT - (clampedRf * travel));
};

const renderSpot = (
  spot: NonNullable<NormalizedTlcAnalysis>["lanes"][number]["spots"][number]
): string =>
  `<span class="chemd-tlc-spot" data-shape="${escapeHtml(spot.shape)}" data-size-rank="${resolveRank(spot.size_rank)}" data-intensity-rank="${resolveRank(spot.intensity_rank)}" style="top:${getVerticalPosition(spot.rf)}"></span>`;

const renderMessRegion = (
  region: NonNullable<NormalizedTlcAnalysis>["lanes"][number]["mess_regions"][number]
): string =>
  `<span class="chemd-tlc-mess" data-size-rank="${resolveRank(region.size_rank)}" data-intensity-rank="${resolveRank(region.intensity_rank)}" style="top:${getVerticalPosition(region.rf ?? null)}"></span>`;

const renderLane = (
  lane: NonNullable<NormalizedTlcAnalysis>["lanes"][number]
): string => {
  const content = [
    ...lane.mess_regions.map(renderMessRegion),
    ...lane.spots.map(renderSpot),
    ...(lane.has_base ? ['<span class="chemd-tlc-base-spot"></span>'] : [])
  ].join("");

  return `<div class="chemd-tlc-lane" data-lane-id="${escapeHtml(lane.lane_id)}">
    <div class="chemd-tlc-lane-track">${content}</div>
    <span class="chemd-tlc-lane-tick"></span>
    <span class="chemd-tlc-lane-label">${escapeHtml(lane.lane_label_raw)}</span>
  </div>`;
};

const renderPlate = (analysis: NormalizedTlcAnalysis | null | undefined): string => {
  if (!analysis) {
    return "";
  }

  const laneCount = Math.max(1, analysis.lanes.length);
  const lanes = analysis.lanes.map(renderLane).join("");

  return `<div class="chemd-tlc">
    <div class="chemd-tlc-scroll">
      <div class="chemd-tlc-plate" role="img" aria-label="${escapeHtml(`TLC plate with ${laneCount} lanes`)}" style="--chemd-tlc-lane-count:${laneCount};">
        <span class="chemd-tlc-solvent-front"></span>
        <span class="chemd-tlc-baseline"></span>
        <div class="chemd-tlc-lanes">${lanes}</div>
      </div>
    </div>
  </div>`;
};

const renderTlcFields = (node: AnalysisNode): string =>
  renderFieldList([
    ["Type", node.type_name],
    ["Related", node.ref],
    ["Time", node.time],
    ["Eluent", node.eluent],
    ["Plate", node.plate],
    ["Visualization", node.visualization],
    ["Result", node.result],
    ["Instrument", node.instrument],
    ["Solvent", node.solvent],
    ["Frequency", node.frequency],
    ["Method", node.method],
    ["Data", node.data],
    ["Notes", node.notes]
  ]);

export const renderTlcAnalysis = (
  node: AnalysisNode,
  normalizedTlc?: NormalizedTlcAnalysis | null
): string =>
  `<section class="chemd-block chemd-block--analysis chemd-block--analysis-tlc" data-node-id="${escapeHtml(node.id ?? "")}" data-analysis-type="tlc">
    ${renderBlockTitle("Analysis", node.id)}
    ${renderPlate(normalizedTlc)}
    ${renderTlcFields(node)}
  </section>`;
