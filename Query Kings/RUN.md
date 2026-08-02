# RUN.md — Schema Kings

Env vars and **one command** to run the pipeline end to end.

Install prerequisites first — see [README.md](./README.md#how-to-run-it).

**Platforms:** `./run-local.sh` is bash — works on **macOS** and **Linux**. On Windows, **WSL2 only** — native PowerShell / CMD / Git Bash will **not** work. The script checks Docker, Node 22+, pnpm, and `.env` before doing anything.

---

## One command (end to end)

Once `backend/.env` is filled (see below):

```bash
cd source_code
chmod +x run-local.sh   # once, if needed
./run-local.sh
```

That single script:

1. Starts ClickHouse + Langfuse (`docker compose`)
2. Waits for ClickHouse
3. `pnpm install` + `pnpm cli setup` (8 base tables + context bootstrap)
4. Runs instrumentation for all 5 known specs + the 6th unseen (`06_promo_coupon_checkout`)
5. Starts the report UI at http://127.0.0.1:8787

6th spec alone (Cloud or already-set-up local):

```bash
cd source_code/backend
pnpm cli run ../specs/06_promo_coupon_checkout
```

Flags:

```bash
./run-local.sh --setup-only   # Docker + setup only (no specs / no UI)
./run-local.sh --no-serve     # setup + all specs, then exit
```

Useful URLs after it runs:

- Report UI: http://127.0.0.1:8787
- Langfuse: http://localhost:3000
- ClickHouse: http://localhost:8123

Ask from the UI or:

```bash
cd source_code/backend
pnpm cli ask "Where are we losing conversions, and for which segments (device / geo / destination)?"
```

---

## Environment (required before the one command)

```bash
cd source_code/backend
cp .env.example .env
# edit: set GROQ_API_KEY — ClickHouse + Langfuse defaults already match docker-compose
```

Values in `.env.example` are real local defaults (not placeholders):

| Variable                                            | Default                                                 | Source                              |
| --------------------------------------------------- | ------------------------------------------------------- | ----------------------------------- |
| `CLICKHOUSE_*`                                      | `schema_kings` @ `localhost:8123`                       | `docker-compose.yml` app ClickHouse |
| `CLICKHOUSE_DOCKER_CONTAINER`                       | `schema-kings-clickhouse`                               | compose `container_name`            |
| `LANGFUSE_PUBLIC_KEY` / `SECRET_KEY` / `PROJECT_ID` | `lf_pk_schema_kings_local` / `lf_sk_…` / `schema-kings` | compose `LANGFUSE_INIT_*` seed      |
| `LANGFUSE_BASE_URL`                                 | `http://localhost:3000`                                 | Langfuse web                        |
| `GROQ_API_KEY`                                      | _(you must set)_                                        | Groq console                        |

Langfuse UI login: `local@schema-kings.dev` / `schemakingslocal`

If Langfuse was started **before** the init seed existed, recreate Langfuse volumes once (keeps app ClickHouse data):

```bash
cd source_code
docker compose --profile langfuse down -v
docker compose --profile langfuse up -d
# sync Langfuse keys from backend/.env.example into backend/.env if needed
```

---

## CLI cheat sheet

| Command                      | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `./run-local.sh`             | **One command** e2e                                 |
| `./clean-local.sh`           | Reset Docker volumes                                |
| `pnpm cli setup`             | Load/validate base tables + bootstrap context       |
| `pnpm cli run <spec-folder>` | Instrumentation → `ops.job_artifacts` in ClickHouse |
| `pnpm cli ask "…"`           | Analytics → same                                    |
| `pnpm cli report [job_id]`   | HTML report from ClickHouse                         |
| `pnpm cli serve`             | UI + Ask (ClickHouse-backed)                        |

Job artifacts live in ClickHouse `ops.job_artifacts` (not on disk).

### Clean / reset

Wipes ClickHouse + Langfuse Docker volumes (including `ops.job_artifacts`). Does **not** touch source, specs, Parquet, or `backend/.env`.

```bash
cd source_code
./clean-local.sh
./run-local.sh
```
