CREATE TABLE IF NOT EXISTS silver.promo_coupon_checkout_events
(
    event_name LowCardinality(String),
    event_id String,
    timestamp DateTime64(3),
    job_id String,
    app_version LowCardinality(String),
    application_id String,
    cart_value Float64,
    city LowCardinality(String),
    client_lib LowCardinality(String),
    coupon_code Nullable(String),
    currency LowCardinality(String),
    destination LowCardinality(String),
    device LowCardinality(String),
    device_type LowCardinality(String),
    geo LowCardinality(String),
    geoip_country_code LowCardinality(String),
    os Nullable(String),
    reject_reason Nullable(String),
    discount_type Nullable(String),
    discount_amount Nullable(Float64),
    final_value Nullable(Float64),
    user_id String,
    raw_json String,
    ingested_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, event_id)
TTL timestamp + INTERVAL 18 MONTH;
