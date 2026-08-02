# MagnateBits

## Track

Atlys — *"From feature spec to insight: agents that instrument, analyze, and explain."*

## Project

**Atlys Agents** — a feature spec goes in; a production ClickHouse table, a refreshed
context layer, and PM-readable insights come out, in one traced run.

## Team Members

- Barun Acharya ([@daemon1024](https://github.com/daemon1024))
- Priyanshu Raj Shrivastava
- Shivanshu

## What it does

```bash
python run_pipeline.py --spec <spec.md> --events <events.ndjson>
```

Three agents behind one command:

- **Instrumentation** — profiles the raw events deterministically, proposes production
  DDL (LLM), lints it, dry-runs it, **pauses for human approval**, then executes, loads,
  and measures whether each materialized view earned its keep.
- **Context** — a versioned context layer stored *in ClickHouse*, which reconciles each
  new table and runs contradiction checks that are settled by SQL, not opinion.
- **Analytics** — plans queries from a template catalog, executes them in ClickHouse,
  and interprets only the aggregates. Every asserted number is then checked against the
  queries the finding cites; anything unmatched is demoted with an `UNVERIFIED` caveat.

Nothing is written against a known spec: column types, entity key, funnel order and
segment dimensions are all derived at runtime. A test fails the build if any source file
names one of the practice specs.

## Hosted Demo

⚠️ **Not hosted.** The stack runs locally (Docker ClickHouse + Streamlit console +
LibreChat). Every connection parameter is environment-driven — `ch.py` hardcodes no host
and `data/load.sh` already accepts a `--secure` client — so pointing at ClickHouse Cloud
is a `.env` change rather than a code change, but **we have not deployed or tested that
path** and will not claim otherwise.

The video below covers the flows a hosted demo would show. To run it yourself:
[`solution/RUN.md`](solution/RUN.md) — one command from a clean clone.

## Demo Video

https://www.loom.com/share/7faf11555a8f495192d81a9006a0c58e

## Architecture

Full write-up: **[`ARCHITECTURE.md`](ARCHITECTURE.md)** (data-flow diagram + module map).

**Where the context layer lives, and why — a ClickHouse table, not a vector store.**
`context_entry_log` (append-only, versioned) plus a `context_current` view. Rationale:
contradiction detection becomes deterministic SQL because the context sits in the same
engine as `system.columns`, so *"the docs claim column X exists"* is settled by a query
returning zero rows rather than by an LLM opinion; versioning, diffs and changelog fall
out of an append-only log for free; and every entry carries the `run_id` linking it to
its trace.

We *also* ship in-ClickHouse vector retrieval (`vector_rag.py` — `cosineDistance` + an
HNSW `vector_similarity` index + a text index), now the default because the layer grew
past what belongs in every prompt. The embedding is a deterministic local hashing
function, so *which* entries were retrieved stays reproducible. Still no external vector
database.

**Langfuse.** `tracing.py` is the only module that imports Langfuse; one trace per run,
spans mirroring the pipeline stages. The mechanism that matters:
`llm.complete_json(..., context_version=...)` takes `context_version` as a **mandatory**
argument, so no traced LLM call can exist without recording which context snapshot fed
it. That makes context-freshness *checkable* rather than asserted — on the sealed-spec
run the trace shows `propose_ddl` reading **v18** and, after reconciliation added the new
table, `analytics.*` reading **v19**.

**LibreChat + MCP.** `atlys_mcp/` exposes 8 tools, each tagged with native
`ToolAnnotations` so a host can tell a read from a write; `run_pipeline` additionally
requires `confirm=true` server-side. Wiring is committed:
[`solution/deploy/librechat.yaml`](solution/deploy/librechat.yaml),
[`solution/deploy/docker-compose.yml`](solution/deploy/docker-compose.yml),
[`solution/.env.example`](solution/.env.example) (secrets redacted).

**ClickStack** — not integrated.

**LLM providers.** Claude Sonnet 5 via the authenticated `claude -p` CLI (subscription
auth, no API key) for all three agents; Anthropic SDK as an env-flip alternative; a
deterministic offline mock for evaluation; Ollama Cloud for the LibreChat *chat* surface
only (tool calls always go to Claude).

## Graded outputs

| What | Where |
|---|---|
| Generated DDL — 5 known specs **and** the 6th | `solution/artifacts/runs/<run_id>/schema.sql` + `proposal.json` |
| **Sealed 6th-spec bundle** (schema + insight summary + trace) | [`sealed-spec-6th/`](sealed-spec-6th/) |
| Analytics over the **8 existing tables** + the 4 standard probes | [`probe-outputs/PROBE_RESULTS.md`](probe-outputs/PROBE_RESULTS.md) |
| Context layer + before/after changelog | `solution/out/context/CHANGELOG.md` |
| **Langfuse traces, exported as JSON** | [`traces/`](traces/) |

### Sealed 6th spec — run `29b74c8f`

All five stages ok, 192.4s, **5,363/5,363 rows loaded, 0 rejected**, 12 queries 0 failed,
context **v18 → v19**, 8 contradictions.

**Trace:** https://us.cloud.langfuse.com/project/cmsa37gfi164uad0dvkq6ygqo/traces/1e202f5aab976efd00e4b8311a25be47
(also exported: [`traces/sealed_spec_pipeline.json`](traces/sealed_spec_pipeline.json))

The spec's branching shape was handled with no per-spec code: `coupon_applied` and
`coupon_rejected` are mutually exclusive (measured — **zero** entities have both), so
`coupon_rejected` is excluded from the ordered funnel while staying in the schema and
queryable. Without that, `windowFunnel` forces every later step to zero, which reads as a
catastrophic drop-off rather than a modelling error.

### Standard probe set — 4/4, 73/73 figures grounded

| # | Prompt | Grounded | Conf | Trace |
|---|---|---|---|---|
| 1 | Funnel issues, with the why | 20/20 | 0.78 | [json](traces/probe_1.json) |
| 2 | Losing conversions, by segment | 32/32 | 0.72 | [json](traces/probe_2.json) |
| 3 | Regressions/trends last quarter | 15/15 | 0.62 | [json](traces/probe_3.json) |
| 4 | Base context wrong/stale/contradictory | 6/6 | 0.75 | [json](traces/probe_4.json) |

The 8 tables are one-table-per-event while every template expects an `event`
discriminator, so `probe.py` presents them to the *existing* stack as one event stream —
a view over their 30 genuinely-shared columns (2,479,858 rows). All 22 templates, the
confidence scoring, the grounding and the metric policy then apply unchanged: the probe
answers come from the same machinery as the feature-spec answers, not a parallel path.

**Headline:** the two dominant leaks are `auth_completed` (13.1% through-rate) and
`document_uploaded` (12.6%), both **uniform across every device/OS/geo cut** — structural,
not segment-specific — with the funnel's longest step gap (~1.9h median) immediately
before document upload. Probe 4 independently found a stale context entry: the
business-overview diagram states a 4-step funnel where the instrumented reality is 8.

## How we built it

Python 3.12/3.13 · ClickHouse · Langfuse · MCP + LibreChat · Streamlit.

Things we'd point a reviewer at:

- **Numeric grounding** (`grounding.py`) — built after a real incident where a fluent
  finding claimed a median of $0 while its own cited queries returned 37,536/29,926/26,127.
- **Calibrated confidence** (`confidence.py`) — a published 4-component score computed in
  Python from evidence, never self-reported by the model.
- **Metric policy** (`metric_policy.py`) — while a definition conflict is open on a metric,
  no unqualified number for it may be emitted. Catches the planted conversion-rate
  contradiction in `base_context.md`.
- **Measured MV decisions** — materialized views are kept or dropped on a *measured*
  reduction factor; [`solution/docs/SCHEMA_CATALOG.md`](solution/docs/SCHEMA_CATALOG.md)
  lists the ones proposed, built, measured and **rejected**, each with the ratio that
  killed it.
- **Human approval gate** before any DDL executes.
- **241 tests**, including a grep guard that fails if any source file names a known spec.
- [`solution/docs/EVALUATION.md`](solution/docs/EVALUATION.md) — the verification stack and
  every statistical formula used, with a real eval run.

## How to run it

**[`solution/RUN.md`](solution/RUN.md)** — prerequisites, every env var, one command,
verification, troubleshooting. Short version:

```bash
cd solution
make init      # venv, deps, ClickHouse, 8 tables loaded, context bootstrapped, 241 tests
./.venv/bin/python run_pipeline.py \
    --spec ../specs/06_unseen/spec.md --events ../specs/06_unseen/events.ndjson --rebuild
```

The 5 known specs and the sealed 6th live in the organisers' repo under `Atlys/specs/`;
their raw `events.ndjson` are not duplicated here.

---

### Outstanding

Stated plainly rather than omitted:

- **Hosted demo link** — not deployed (see above). The video covers the flows.
- **`pitch-deck.pdf`** — to follow; [`solution/pitch.md`](solution/pitch.md) is the source
  material.
- **ClickStack** — not integrated.
