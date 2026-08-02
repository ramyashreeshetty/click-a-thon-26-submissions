-- express_checkout (20260802T022058_01_express_checkout)
CREATE TABLE IF NOT EXISTS silver.express_checkout_events
(
    event_name LowCardinality(String),
    event_id String,
    timestamp DateTime64(3),
    ingested_at DateTime DEFAULT now(),
    job_id String,
    app_version LowCardinality(String),
    application_id String,
    city LowCardinality(String),
    client_lib LowCardinality(String),
    currency Nullable(String),
    destination LowCardinality(String),
    device LowCardinality(String),
    geo LowCardinality(String),
    device_type LowCardinality(String),
    os Nullable(String),
    eligible Nullable(Bool),
    saved_method_type Nullable(String),
    otp_attempts Nullable(UInt8),
    otp_success Nullable(Bool),
    payment_amount Nullable(Float64),
    payment_currency Nullable(String),
    payment_latency_ms Nullable(UInt32),
    shown_amount Nullable(Float64),
    user_id String,
    raw_json String,
    geoip_country_code LowCardinality(String)
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, event_id)
TTL timestamp + INTERVAL 18 MONTH;

-- group_family (20260802T022106_02_group_family)
CREATE TABLE IF NOT EXISTS silver.group_family_events
(
    event_name LowCardinality(String),
    event_id String,
    timestamp DateTime64(3),
    job_id String,
    app_version LowCardinality(String),
    application_id String,
    city LowCardinality(String),
    client_lib LowCardinality(String),
    destination LowCardinality(String),
    device_type LowCardinality(String),
    docs_complete Nullable(Bool),
    geoip_country_code LowCardinality(String),
    group_id String,
    group_size UInt8,
    os Nullable(String),
    relation Nullable(String),
    traveller_index Nullable(UInt8),
    travellers_submitted Nullable(UInt8),
    user_id String,
    raw_json String,
    ingested_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, event_id)
TTL timestamp + INTERVAL 18 MONTH;

-- status_sharing (20260802T022114_03_status_sharing)
CREATE TABLE IF NOT EXISTS silver.status_sharing_events
(
    event_name LowCardinality(String),
    event_id String,
    timestamp DateTime64(3),
    job_id String,
    app_version Nullable(String),
    application_id Nullable(String),
    channel Nullable(String),
    city Nullable(String),
    client_lib Nullable(String),
    cta Nullable(String),
    destination LowCardinality(String),
    device_type Nullable(String),
    geoip_country_code Nullable(String),
    os Nullable(String),
    recipient_is_new_user Nullable(Bool),
    share_id String,
    status_shared Nullable(String),
    user_id Nullable(String),
    raw_json String,
    ingested_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, share_id, event_id)
TTL timestamp + INTERVAL 18 MONTH;

-- abandoned_checkout_recovery (20260802T022122_04_abandoned_checkout_recovery)
CREATE TABLE IF NOT EXISTS silver.abandoned_checkout_recovery_events
(
    event_name LowCardinality(String),
    event_id String,
    timestamp DateTime64(3),
    ingested_at DateTime DEFAULT now(),
    job_id String,
    app_version LowCardinality(String),
    application_id String,
    channel Nullable(String),
    city LowCardinality(String),
    client_lib LowCardinality(String),
    destination LowCardinality(String),
    device_type LowCardinality(String),
    drop_step LowCardinality(String),
    geoip_country_code LowCardinality(String),
    hours_since_drop Nullable(Int64),
    os Nullable(String),
    user_id String,
    raw_json String
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, event_id)
TTL timestamp + INTERVAL 18 MONTH;

-- instant_forex (20260802T022130_05_instant_forex)
CREATE TABLE IF NOT EXISTS silver.instant_forex_events
(
    event_name LowCardinality(String),
    event_id String,
    timestamp DateTime64(3),
    job_id String,
    addon_value_inr Nullable(Float64),
    amount Nullable(Float64),
    app_version LowCardinality(String),
    application_id String,
    city LowCardinality(String),
    client_lib LowCardinality(String),
    destination LowCardinality(String),
    device_type LowCardinality(String),
    from_currency LowCardinality(String),
    fx_rate Nullable(Float64),
    geoip_country_code LowCardinality(String),
    os Nullable(String),
    to_currency LowCardinality(String),
    user_id String,
    raw_json String,
    ingested_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, event_id)
TTL timestamp + INTERVAL 18 MONTH;

-- promo_coupon_checkout (20260802T031310_06_promo_coupon_checkout)
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
