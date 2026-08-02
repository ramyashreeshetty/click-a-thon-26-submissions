# Architecture — Foreground-Only Concurrency at Streaming Scale

## Overview

Real-time concurrent viewer counting for SonyLIV, built entirely on ClickHouse. The system ingests streaming events, computes minute-level concurrency excluding backgrounded/paused periods, and serves dashboard queries at sub-second latency.

---

## System Architecture

### End-to-End Data Flow

```
┌───────────────────┐
│  Kafka / Pulsar   │  Video session events (~50K/sec at peak)
│    (hosted)       │  play, pause, heartbeat, bg, fg, start, end, error
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│   ClickPipes      │  Managed Kafka connector
│                   │  Batches 1K-10K msgs, retries, offset mgmt
└────────┬──────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────┐
│                     CLICKHOUSE CLUSTER                              │
│                                                                    │
│  ┌──────────────────── INGESTION ────────────────────────────┐    │
│  │                                                            │    │
│  │  raw_events_ingest ──── MV ────► fact_events              │    │
│  │  (Null engine)      enrichment   (ReplacingMergeTree)     │    │
│  │                         │                                  │    │
│  │                         ▼                                  │    │
│  │               dict_content (RAM)                           │    │
│  │               O(1) lookup: title, video_type, category     │    │
│  │               auto-refresh from dim_content (60-300s)      │    │
│  │                                                            │    │
│  │  raw_sessions_pending (tracks which sessions changed)      │    │
│  └────────────────────────┬───────────────────────────────────┘    │
│                           │                                        │
│                           ▼                                        │
│  ┌──────────────────── COMPUTATION ──────────────────────────┐    │
│  │  Refreshable MV (every 30s, per changed session)           │    │
│  │                                                            │    │
│  │  1. DEDUP ─► 2. CLASSIFY ─► 3. SORT ─► 4. GATES          │    │
│  │     exact       47 events     per sess     fg (FG/BG)      │    │
│  │     dupes       → 9 signals   ts+tiebrk    playing (P/R/Pa)│    │
│  │                                             ended (END)     │    │
│  │                                                │            │    │
│  │  7. DEDUPE ◄── 6. EXPLODE ◄── 5. SEGMENT ◄────┘            │    │
│  │  (session,min)   → minutes     [ts, min(next, ts+90s)]     │    │
│  │       │                        active = fg∧playing∧¬ended   │    │
│  │       ▼                                                     │    │
│  │  8. RUNS ──► 9. DELTAS                                     │    │
│  │  merge          +1 at run start                             │    │
│  │  contiguous     -1 at run end                               │    │
│  │  minutes        pre-aggregated per key                      │    │
│  └─────────────────────┬──────────────────────────────────────┘    │
│                        │                                           │
│                        ▼                                           │
│  ┌──────────────────── SERVING ──────────────────────────────┐    │
│  │                                                            │    │
│  │  fact_concurrency_deltas (ReplacingMergeTree)              │    │
│  │  ORDER BY (minute, video_session_id)                       │    │
│  │                                                            │    │
│  │  Query: sum(delta) OVER (ORDER BY minute) = concurrency    │    │
│  │  Filters: platform, country, video_type, content_id        │    │
│  │  Latency: <100ms                                           │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                    │
└──────────────────────────┬─────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│                        CONSUMERS                                    │
│                                                                    │
│  • Real-time dashboard (minute-by-minute concurrency curve)        │
│  • Peak/average queries with any filter combo                      │
│  • LibreChat + MCP (conversational: "peak on Android last hour?")  │
│  • ClickStack (ingestion lag, query performance monitoring)        │
└────────────────────────────────────────────────────────────────────┘
```

### State Machine (per session)

```
Event:   START  PLAY  HB  HB  BG   HB  HB  FG   HB  PAUSE  HB  RESUME  HB  END
         ─────────────────────────────────────────────────────────────────────────
fg:        1     1    1   1   0    0   0   1    1    1      1     1      1    1
playing:   0     1    1   1   1    1   1   1    1    0      0     1      1    1
ended:     0     0    0   0   0    0   0   0    0    0      0     0      0    1
         ─────────────────────────────────────────────────────────────────────────
ACTIVE:    ✗     ✓    ✓   ✓   ✗    ✗   ✗   ✓    ✓    ✗      ✗     ✓      ✓    ✗
                ╰──────────╯            ╰──────╯                  ╰──────╯
                  run 1                  run 2                      run 3

Deltas:        +1         -1          +1        -1               +1        -1
```

Three gates carried forward independently:
- **fg**: FG→1, BG→0 (default 1)
- **playing**: PLAY/RESUME→1, PAUSE→0 (default 0)
- **ended**: END→1 (absorbing, permanent)

Active = fg=1 AND playing=1 AND ended=0 AND fresh (≤90s since last event)

### AI Layer (LibreChat Integration)

```
┌─────────────────┐
│ User question    │  "Peak concurrency on Android last hour?"
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌───────────────────────────┐
│  Genre Router   │────►│ Typed Tool Layer           │
│  (no LLM)      │     │ (no raw SQL on this path)  │
│                 │     │ lookup/billing/trend/diag   │
└────────┬────────┘     └─────────────┬─────────────┘
         │                            │
         │              ┌─────────────▼─────────────┐
         │              │ ClickHouse                  │
         │              │ fact_concurrency_deltas     │
         │              └─────────────┬─────────────┘
         │                            │
         │              ┌─────────────▼─────────────┐
         │              │ Answer + optional chart     │
         │              └───────────────────────────┘
         │
         │  ┌────────────────────────────────────┐
         └─►│ Langfuse (full trace per question) │
            └────────────────────────────────────┘

Fallback: ClickHouse MCP Server (read-only SQL, exploration path)
```

---

## State Machine Detail

```
Per session, events are sorted and three gates are carried forward independently:

Event stream:  START  PLAY  HB  HB  BG  HB  HB  FG  HB  PAUSE  HB  RESUME  HB  END
               ──────────────────────────────────────────────────────────────────────
fg:              1     1    1   1   0   0   0   1   1    1      1     1      1    1
playing:         0     1    1   1   1   1   1   1   1    0      0     1      1    1
ended:           0     0    0   0   0   0   0   0   0    0      0     0      0    1
               ──────────────────────────────────────────────────────────────────────
ACTIVE:          ✗     ✓    ✓   ✓   ✗   ✗   ✗   ✓   ✓    ✗      ✗     ✓      ✓    ✗
                      ╰──────────╯           ╰──────╯                 ╰──────╯
                        run 1                 run 2                     run 3

Delta output:   +1 at PLAY minute
                -1 at BG minute
                +1 at FG minute
                -1 at PAUSE minute
                +1 at RESUME minute
                -1 at END minute

Each segment capped at 90s (auto-closes if no next event within 90s)
```

---

## Active Concurrency Definition

A session is **actively watching** at time `t` if ALL of the following hold:

| Gate | Condition | Signal |
|------|-----------|--------|
| **Foreground** | Last BG/FG marker at or before `t` is FG | `fg = 1` |
| **Playing** | Last PLAY/PAUSE/RESUME marker at or before `t` is PLAY/RESUME | `playing = 1` |
| **Not ended** | No VideoSessionEnd at or before `t` | `ended = 0` |
| **Fresh** | `t` is within 90s of the event that opened this segment | liveness cap |

```
active(t) = fg(t)=1 AND playing(t)=1 AND ended(t)=0 AND fresh(t)
```

### Why three independent gates?

The gates are NOT collapsed into one "active/inactive" state. This matters:

```
PLAY → BG → FG (backgrounded while playing, returns without re-pressing play)
```

- `playing` stays 1 through the whole sequence
- `fg` goes 0 then back to 1
- After FG: `fg=1 AND playing=1` → **ACTIVE again** without needing a new PLAY event

A collapsed single-state machine would require PLAY after every FG, undercounting by ~3%.

### Why 90s liveness cap?

Heartbeats arrive every ~30-40s. A gap of 90s = ~2 missed heartbeats → session is dead/killed/disconnected. Measured: 99.3% of legitimate heartbeat gaps are under 90s.

---

## Key Design Decisions

### 1. Null Engine as Ingestion Endpoint

**Decision:** ClickPipes writes to a Null engine table. An MV handles enrichment and type conversion.

**Why:** Decouples raw Kafka format from typed storage. Source format changes only affect the MV, not the pipeline. Zero storage cost for the landing table.

### 2. Content Dictionary (not JOIN)

**Decision:** `dictGetOrDefault` for content enrichment inside the MV.

**Why:** O(1) RAM lookup vs JOIN. Auto-refreshes every 60-300s. `OrDefault → 'unknown'` handles missing content (1,089 rows with blank metadata) without dropping sessions.

### 3. ReplacingMergeTree for Deltas (not SummingMergeTree)

**Decision:** Each refresh replaces the previous computation per session.

**Why:** Full recompute per changed session means we INSERT the complete corrected delta set. `ReplacingMergeTree(computed_at)` keeps the newest. No stale leftovers from prior computations. Queries use `FINAL` for guaranteed dedup.

### 4. Full Recompute per Changed Session

**Decision:** Recompute entire session state on each 30s tick, not incremental deltas.

**Why:**
- Always correct — no accumulated state drift
- Self-healing — late arrivals resolve on next refresh
- Simple — one query, no bookkeeping
- Fast enough — 2-3s for 10K sessions at current scale

### 5. Pre-Aggregation Before INSERT

**Decision:** `GROUP BY ... HAVING delta_sessions != 0` before writing to ReplacingMergeTree.

**Why:** ReplacingMergeTree keeps ONE row per ORDER BY key. Two sessions emitting +1 at the same (minute, dims) must be summed before INSERT, or one gets silently dropped.

### 6. Tie-Break Priority

**Decision:** Deterministic ordering for same-millisecond events.

**Why:** 161K same-ms ties in the data. Without fixed ordering, same input → different output on different runs. Rule: openers before closers (START=1, PLAY=2, FG=3, RESUME=4, PAUSE=5, BG=6, ERR=7, END=8).

---

## Tables

| Table | Engine | Purpose |
|-------|--------|---------|
| `events_ingest` | Null | Kafka landing (stores nothing) |
| `content_dim` | ReplacingMergeTree | Content metadata |
| `content_dict` | Dictionary (HASHED) | O(1) RAM enrichment |
| `events_raw` | ReplacingMergeTree | Enriched, deduped events |
| `fact_concurrency_deltas` | ReplacingMergeTree | +1/-1 per session per run boundary |

## Materialized Views

| MV | Trigger | Purpose |
|----|---------|---------|
| `events_ingest_mv` | INSERT to events_ingest | Type conversion + enrichment |
| `mv_compute_concurrency` | REFRESH EVERY 30s | State machine → delta computation |

---

## Query Patterns

### Peak Concurrency

```sql
SELECT max(concurrent) AS peak
FROM (
    SELECT minute, sum(d) OVER (ORDER BY minute) AS concurrent
    FROM (
        SELECT minute, sum(delta_sessions) AS d
        FROM fact_concurrency_deltas FINAL
        WHERE toDate(minute) = '2026-07-26'
        GROUP BY minute
        ORDER BY minute WITH FILL
            FROM toDateTime('2026-07-26 00:00:00')
            TO toDateTime('2026-07-27 00:00:00')
            STEP INTERVAL 1 MINUTE
    )
)
WHERE minute >= '2026-07-26 10:00:00'
  AND minute < '2026-07-26 11:00:00';
```

### Rule: Seed from Day Start, Filter Output

Running sum must start from day start (not query window start). Filter the OUTPUT range to get correct cumulative values mid-day.

---

## Edge Cases Handled

| Case | Handling |
|------|----------|
| Backgrounded sessions | fg gate → immediately excluded |
| Paused sessions | playing gate → immediately excluded |
| Pocket heartbeats (bg + HBs) | fg=0 → not active despite heartbeats |
| 43-hour zombie sessions | 90s cap auto-closes |
| Duplicate events (4,210) | DISTINCT dedup step |
| Same-ms ties (161K) | Deterministic tie-break |
| Short pause+resume (<1 min) | Dedup to distinct minutes → one continuous minute |
| Session crosses midnight | No date boundary in computation |
| Mid-session platform drift | Dims pinned at first event |
| Missing content metadata | `dictGetOrDefault → 'unknown'` |
| Late event arrival | Next 30s refresh picks it up |
| ClickPipes batch sizes | Recompute handles arbitrary batches |

---

## Validation

### Training Data (2026-07-26, 10K sessions)

| Metric | Value |
|--------|-------|
| Peak | 2,697 |
| Peak minute | 10:56 |
| Occupied minutes | 3,649 |
| Avg (occupied) | 34.87 |
| ANDROID_PHONE peak at | 10:56 |
| IPHONE peak at | 10:55 |

### Unseen Day (2026-07-31, 106K sessions — `rohitdevtestingv8`)

![Concurrency Curve](Images/concurrency-curve.png)

| Metric | Value |
|--------|-------|
| **Events processed** | 6,911,299 |
| **Sessions processed** | 106,301 |
| **Peak concurrent** | **18,253** |
| **Peak minute** | 11:16 UTC |
| **Occupied minutes** | 556 |
| **Avg concurrent (occupied)** | 1,611.88 |
| **Delta rows generated** | 317,201 |
| **Net balance** | -1 (balanced) |

### Per-Platform Peaks (unseen day, top 10)

| Platform | Peak | Peak Minute |
|----------|------|-------------|
| ANDROID_PHONE | 5,905 | 11:16 |
| JIO_ANDROID_TV | 4,800 | 11:25 |
| SONY_ANDROID_TV | 2,595 | 11:25 |
| SAMSUNG_HTML_TV | 946 | 11:23 |
| Web | 873 | 11:13 |
| LG_HTML_TV | 723 | 11:16 |
| IPHONE | 680 | 11:16 |
| FIRE_TV | 632 | 11:26 |
| XIAOMI_ANDROID_TV | 537 | 11:17 |
| ANDROID_TAB | 234 | 11:16 |

Note: Sum of platform peaks (19,499) > true peak (18,253) because platforms peak at different minutes — confirms the query computes the union peak correctly.

---

## Scaling

| Scale | Approach | Compute time |
|-------|----------|-------------|
| 10K sessions (current) | Full recompute all sessions | 2-3s |
| 100K sessions | Recompute only changed sessions | ~5-10s |
| 1M sessions | Changed sessions + session recency filter | ~15-20s |
| 10M sessions | Shard by session hash + parallel refresh | Distributed |

Properties that hold at any scale:
- **Idempotent** — recomputing always yields the same answer
- **Self-healing** — late arrivals resolved on next refresh
- **No external deps** — no cron, no checkpoint, no consumer-lag tracking
