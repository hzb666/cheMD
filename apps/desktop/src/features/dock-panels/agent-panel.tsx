import {
  Activity,
  Bot,
  Lightbulb,
  PlayCircle,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import type { AgentRun, PatchProposal } from "@chemd/agent-tools";
import { getAuditTimeline } from "@chemd/agent-tools";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type {
  AgentMessage,
  DocumentMode,
  QuickFixCandidate,
} from "../../types";
import type {
  SidecarStatus,
  PostgresStatus,
  LocalStoreStatus,
} from "../../contracts";
import {
  agentStatusLabel,
  auditEventLabel,
  formatRange,
} from "../../utils";

// ─── Components ─────────────────────────────────────────────────────────

export const AgentRunHeader = ({
  agentRun,
  agentMessage,
}: {
  agentRun: AgentRun | null;
  agentMessage: AgentMessage | null;
}) => (
  <>
    <div className="flex items-center gap-2 text-sm font-medium">
      <Bot size={15} />
      <span>Agent run</span>
      <Badge variant="outline" data-status={agentRun?.status ?? "created"}>
        {agentRun ? agentStatusLabel[agentRun.status] : "Idle"}
      </Badge>
    </div>
    {agentMessage ? (
      <p
        className="text-sm text-muted-foreground"
        data-tone={agentMessage.tone}
      >
        {agentMessage.text}
      </p>
    ) : null}
  </>
);

export const AgentEmptyState = ({
  mode,
  hasQuickFixes,
}: {
  mode: DocumentMode;
  hasQuickFixes: boolean;
}) =>
  mode === "workspace" && hasQuickFixes ? null : (
    <p className="text-sm text-muted-foreground">
      {mode !== "workspace"
        ? "Open a local workspace to let Agent propose edits against real files."
        : "No language-service quick fixes are available for this buffer."}
    </p>
  );

export const AgentQuickFixList = ({
  mode,
  quickFixes,
  onProposeQuickFix,
}: {
  mode: DocumentMode;
  quickFixes: QuickFixCandidate[];
  onProposeQuickFix: (candidate: QuickFixCandidate) => void;
}) => (
  <div className="flex flex-col gap-1">
    {quickFixes.length > 0 ? (
      quickFixes.map((candidate) => (
        <Button
          key={candidate.quickFix.id}
          variant="outline"
          size="sm"
          disabled={mode !== "workspace"}
          onClick={() => onProposeQuickFix(candidate)}
        >
          <Lightbulb size={14} />
          <span>{candidate.quickFix.title}</span>
        </Button>
      ))
    ) : (
      <span className="text-sm text-muted-foreground">
        No quick fixes available.
      </span>
    )}
  </div>
);

export const AgentPatchProposalCard = ({
  proposal,
  canApprove,
  canApply,
  canReject,
  onApprovePatch,
  onApplyPatch,
  onRejectPatch,
}: {
  proposal?: PatchProposal;
  canApprove: boolean;
  canApply: boolean;
  canReject: boolean;
  onApprovePatch: () => void;
  onApplyPatch: () => void;
  onRejectPatch: () => void;
}) =>
  proposal ? (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Wrench size={14} />
          <span>{proposal.title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{proposal.rationale}</p>
        <ul className="flex flex-col gap-1 text-xs">
          {proposal.edits.map((edit, index) => (
            <li
              key={`${proposal.patchProposalId}-${index}`}
              className="flex items-center gap-2"
            >
              <span className="text-muted-foreground">
                {formatRange(edit.range)}
              </span>
              <code className="truncate">
                {edit.replacement.split(/\r?\n/, 1)[0] || "empty replacement"}
              </code>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canApprove}
            onClick={onApprovePatch}
          >
            <ShieldCheck size={14} />
            Approve
          </Button>
          <Button size="sm" disabled={!canApply} onClick={onApplyPatch}>
            <PlayCircle size={14} />
            Apply
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canReject}
            onClick={onRejectPatch}
          >
            <XCircle size={14} />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  ) : null;

export const AgentTimeline = ({
  agentRun,
}: {
  agentRun: AgentRun | null;
}) => {
  const timeline = agentRun ? getAuditTimeline(agentRun) : [];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Activity size={14} />
        <span>Timeline</span>
      </div>
      {timeline.length > 0 ? (
        timeline.map((event) => (
          <div
            key={event.eventId}
            className="flex flex-col gap-0.5 text-xs"
            data-type={event.type}
          >
            <span className="font-medium">
              {auditEventLabel[event.type]}
            </span>
            <p className="text-muted-foreground">{event.summary}</p>
            <time
              className="text-muted-foreground"
              dateTime={event.at ?? undefined}
            >
              {event.at ? new Date(event.at).toLocaleTimeString() : "now"}
            </time>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          No agent run has started.
        </p>
      )}
    </div>
  );
};

export const AgentLedger = ({
  agentRun,
}: {
  agentRun: AgentRun | null;
}) =>
  agentRun ? (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>{agentRun.toolCalls.length} tools</span>
      <Separator orientation="vertical" className="h-3" />
      <span>{agentRun.evidence.length} evidence</span>
      <Separator orientation="vertical" className="h-3" />
      <span>{agentRun.patchDecisions.length} decisions</span>
    </div>
  ) : null;

export const SettingsDockPanel = ({
  mode,
  sidecarStatus,
  postgresStatus,
  localStoreStatus,
}: {
  mode: DocumentMode;
  sidecarStatus: SidecarStatus;
  postgresStatus: PostgresStatus;
  localStoreStatus: LocalStoreStatus;
}) => (
  <Card>
    <CardContent>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Mode</dt>
          <dd>{mode}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sidecar</dt>
          <dd>{sidecarStatus.state}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Postgres</dt>
          <dd>{postgresStatus.state}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Local Store</dt>
          <dd>{localStoreStatus.state}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Postgres source</dt>
          <dd>{postgresStatus.source ?? "not selected"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Local path</dt>
          <dd>{localStoreStatus.storagePath ?? "not initialized"}</dd>
        </div>
      </dl>
    </CardContent>
  </Card>
);
