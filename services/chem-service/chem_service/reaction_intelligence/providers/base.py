from __future__ import annotations

from typing import Protocol

from chem_service.reaction_intelligence.contracts import (
    ProviderStatus,
    ReactionIntelligenceArtifact,
    ReactionIntelligenceJob,
)

REACTION_INTELLIGENCE_SCHEMA_VERSION = "chemd-reaction-intelligence/v0.1"


class ReactionIntelligenceProvider(Protocol):
    provider_key: str

    def run(self, job: ReactionIntelligenceJob) -> ReactionIntelligenceArtifact:
        ...


def empty_artifact(job_id: str) -> ReactionIntelligenceArtifact:
    return ReactionIntelligenceArtifact(
        schema_version=REACTION_INTELLIGENCE_SCHEMA_VERSION,
        job_id=job_id,
    )


def provider_skipped(provider: str, job_id: str, warning: str) -> ReactionIntelligenceArtifact:
    return ReactionIntelligenceArtifact(
        schema_version=REACTION_INTELLIGENCE_SCHEMA_VERSION,
        job_id=job_id,
        provider_statuses=[
            ProviderStatus(
                provider=provider,
                status="skipped",
                warnings=[warning],
            )
        ],
        warnings=[warning],
    )


def provider_failed(provider: str, job_id: str, warning: str) -> ReactionIntelligenceArtifact:
    return ReactionIntelligenceArtifact(
        schema_version=REACTION_INTELLIGENCE_SCHEMA_VERSION,
        job_id=job_id,
        provider_statuses=[
            ProviderStatus(
                provider=provider,
                status="failed",
                warnings=[warning],
            )
        ],
        warnings=[warning],
    )
