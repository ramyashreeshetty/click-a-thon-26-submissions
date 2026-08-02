# Ask 1

**Question:** Where are we losing conversions, and for which segments (device / geo / destination)?
**Job:** `20260802T023025_ask_where_are_we_losing_conversions_and_for_which_se`
**Trace ID:** `85d0becda8d2be0a0e529a46583087fd`
**Trace URL:** http://localhost:3000/project/schema-kings/traces?search=85d0becda8d2be0a0e529a46583087fd&searchType=id&searchType=content

## Short answer

Pre-purchase funnel (unique users): destination_card_clicked=1,000,000 → application_started=154,413 → document_uploaded=20,446 → purchase_completed=7,054. Overall destination_card_clicked → purchase_completed: 0.71% (1,000,000 → 7,054).

## Key findings

- Base funnel (unique users): destination_card_clicked=1,000,000 → application_started=154,413 → document_uploaded=20,446 → purchase_completed=7,054
- destination_card_clicked → application_started: 15.44% (1,000,000 → 154,413)
- application_started → document_uploaded: 13.24% (154,413 → 20,446)

## Recommended actions

- Cross-check segment findings against documented known issues before calling a product regression.
- Prioritize the weakest device/OS/geo segment from aggregate evidence before global changes.

## Evidence

```json
[
  {
    "claim": "Q4 (8 rows): device=Desktop, os=Windows, total=348, conversions=348; device=Desktop, os=Mac OS X, total=151, conversions=151; device=Mobile, os=Windows, total=861, conversions=861",
    "query_id": "Q4",
    "confidence": "medium"
  },
  {
    "claim": "Conversion rate is low for Desktop devices",
    "query_id": "Q4",
    "confidence": "high"
  },
  {
    "claim": "Conversion rate is low for Mobile devices",
    "query_id": "Q4",
    "confidence": "high"
  }
]
```
