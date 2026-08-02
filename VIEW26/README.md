# FeatureLens

FeatureLens is an Atlys Click-a-thon agent loop for evolving physical instrumentation and business meaning together. It implements three standalone Go agents, a versioned ClickHouse-backed Feature Context Graph, governed LLM insight synthesis, Langfuse OpenTelemetry traces, a Streamable HTTP MCP surface for LibreChat, and a lightweight React run console.

Each completed feature publishes a decision bundle with governed funnel, trend, and segment queries; KPI cards; ranked role-aware actions; and SQL-to-chart provenance. The portfolio Analytics Agent can also answer across all published features, preserve follow-up scope, generate evidence-backed charts, and expose every source query in the trace.

## Run locally

```bash
cp .env.example .env
set -a && source .env && set +a
(cd backend && go run ./cmd/featurelens)
npm run dev
```

Open `http://localhost:3000`. If ClickHouse credentials are absent, the UI and workflow run in explicit simulation mode. Schema approval is still mandatory.

## Enable LLM insight synthesis

Set `LLM_API_KEY` and `LLM_MODEL` for any OpenAI-compatible chat endpoint. `LLM_BASE_URL` defaults to `https://api.openai.com/v1`. When either value is absent—or a generation is invalid or unavailable—the Analytics Agent preserves the deterministic governed insight and reports fallback provenance.

The LLM never receives raw event rows. ClickHouse executes the ontology-linked SQL plan and the model receives only the analysis contract, a compact versioned context slice, aggregate evidence, limitations, and the deterministic draft. Generation spans are exported through the existing Langfuse OpenTelemetry pipeline.

## Use Langfuse evaluations in Trace Explorer

Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and the regional `LANGFUSE_BASE_URL` on the Go service. `LANGFUSE_TRACING_ENVIRONMENT` and `LANGFUSE_RELEASE` are recommended so production quality can be compared across deployments.

Trace Explorer keeps its local governed execution path and enriches it with Langfuse observations, automated evaluation scores, annotations, generation cost, token usage, and model metadata. The browser never receives Langfuse credentials: it reads through `GET /api/traces/{trace_id}/langfuse` and submits product feedback through `POST /api/traces/{trace_id}/feedback`. Feedback is stored as typed `user_helpful` and `issue_category` Langfuse scores on the final-answer observation.

For observation-level LLM-as-a-Judge evaluation, target the stable `analytics.llm_synthesize` generation for evidence-grounding checks and `analytics.portfolio_conversation` for final-answer relevance and actionability. Their governed input and output are exported as first-class Langfuse observation I/O.

## Connect LibreChat

Start the Go backend on port `8080`, ensure Docker Desktop is running, then launch the local LibreChat runtime:

Add `OPENROUTER_KEY` to `.local/librechat/.env` after the first start. To trace LibreChat conversations alongside the Go agents, add `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL` to the same ignored file. Then run:

```bash
./scripts/run-librechat-local.sh
```

Open `http://localhost:3080` and register the first local account, which LibreChat makes the administrator. The upstream LibreChat checkout and its data stay under the git-ignored `.local/librechat` directory; this repository only maintains the integration override and [`librechat.yaml`](./librechat.yaml).

LibreChat receives seven governed FeatureLens tools from `http://host.docker.internal:8080/mcp`, including multi-feature portfolio conversation. The enforced FeatureLens model spec attaches those tools automatically and removes model-engineering controls from the Product Manager experience. LibreChat is the conversational surface; the Instrumentation, Context, and Analytics agents remain standalone Go services and ClickHouse remains the evidence store. In local development, **Open Power Chat** automatically opens the local LibreChat instance. Set `NEXT_PUBLIC_LIBRECHAT_URL` to override that URL for another environment.

## Replay all five known features

The supplied dataset is intentionally not copied into this repository. Point the sequential runner at it:

```bash
export ATLYS_DATASET_DIR=/path/to/click-a-thon-2026/Atlys
./scripts/replay-atlys-fixtures.sh
```

The replay defaults to the retained ClickHouse feature tables and their authoritative schema versions, so it never appends browser samples to existing evidence. Set `FEATURELENS_USE_EXISTING_DATA=false` only when initially loading the fixture files into empty target tables. Each run checks the context before and after addition, event coverage, role-aware contracts, version citations, and preservation of all earlier semantics. See [`docs/CONTEXT_MODEL.md`](./docs/CONTEXT_MODEL.md) and [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Test an unseen feature

Choose **Unseen feature** in the release inbox and upload a Markdown specification plus an NDJSON event file. The browser preflight requires an `event` (or `event_name`) and `timestamp` on every row, then submits the package without feature-specific schema or prompt hints. The Instrumentation Agent profiles it and proposes DDL; the run pauses at the human approval gate before ClickHouse is changed.

Use **Reset baseline** to clear agent runs and versioned control-plane tables and republish context v0. The reset requires a typed confirmation and is rejected while a run is active. Raw `atlys` tables and generated `*_events_v*` feature tables are always preserved, so the five-feature evolution can be replayed from the same evidence.

After a reset, launching one of the five known releases rehydrates its complete retained event table and authoritative schema directly inside the Go service. Exact row-count and event-ID fingerprint checks make this replay read-only and idempotent; illustrative browser samples are never appended to production-backed tables.

## Verify

```bash
(cd backend && go test ./...)
npm test
```

To validate live Ask FeatureLens answers against independently recomputed retained-table truth:

```bash
(cd backend && go run ./cmd/validate-ask)
```

The runner checks numerical evidence, requested-dimension coverage, SQL allowlists, trace/version provenance, prose percentages, ranked-answer anchors, and fail-closed boundaries. See [`docs/ASK_GROUNDING_EVAL.md`](./docs/ASK_GROUNDING_EVAL.md) for the test matrix and release policy.
