# Graded artifacts (Atlys §3)

Exported from a live pipeline report (`frontend/dist/report-data.json`).

| Path                        | Contents                                                         |
| --------------------------- | ---------------------------------------------------------------- |
| `ddl/`                      | Generated `CREATE TABLE` SQL for specs 01–06                     |
| `context/`                  | Changelog + per-feature diffs (freshness proof) + contradictions |
| `analytics/`                | Analytics Agent ask outputs present in the report                |
| `06_promo_coupon_checkout/` | 6th-spec schema + summary + trace id                             |

## Still add (if missing)

1. Run / export the **4 standard probes** into `analytics/` if not all present yet.
2. Swap Langfuse `localhost` URLs for **Cloud share links** (esp. 6th-spec trace).
3. Optional: product-facing insight ask specifically about the coupon feature into `06_promo_coupon_checkout/`.
