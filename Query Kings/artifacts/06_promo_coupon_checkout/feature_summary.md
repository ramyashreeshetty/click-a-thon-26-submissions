# 6th spec — Promo / Coupon at Checkout

**Job:** `20260802T031310_06_promo_coupon_checkout`
**Table:** `silver.promo_coupon_checkout_events`
**Rows loaded:** 5363
**Langfuse trace ID:** `d563ad2162501bba645baba60f239412`
**Langfuse URL:** http://localhost:3000/project/schema-kings/traces?search=d563ad2162501bba645baba60f239412&searchType=id&searchType=content

## Product-facing summary

Feature instrumented from the sealed unseen spec. Silver table `silver.promo_coupon_checkout_events` holds coupon funnel events
(coupon_field_shown, coupon_entered, coupon_applied, coupon_rejected, discount_shown, checkout_with_coupon). Success event: `checkout_with_coupon`.

## Context diff (agent)

# Context Diff

## Added Feature

- Feature: Promo / Coupon at Checkout
- Slug: `promo_coupon_checkout`
- Table: `silver.promo_coupon_checkout_events`
- Primary entity: `application_id`
- Workflow type: `funnel`
- Events: `coupon_field_shown` -> `coupon_entered` -> `coupon_applied` -> `coupon_rejected` -> `discount_shown` -> `checkout_with_coupon`

## Trace

Replace localhost Langfuse URL with a Cloud share / export before final submission if needed.
Paste a Cloud public/share link below when available:

- Instrumentation trace: `d563ad2162501bba645baba60f239412`
- Insight ask (if run): _add after `pnpm cli ask` on this feature_
