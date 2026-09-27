-- Run once on your Tiger Data service. No patient data is included.
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE TABLE IF NOT EXISTS pulse_measurements (
 user_id text NOT NULL,
 record_id text NOT NULL,
 measured_at timestamptz NOT NULL,
 source text NOT NULL,
 metric text NOT NULL,
 method text NOT NULL DEFAULT '',
 aggregation text NOT NULL DEFAULT '',
 value double precision NOT NULL,
 PRIMARY KEY (user_id, record_id, metric, measured_at)
);
SELECT create_hypertable('pulse_measurements', 'measured_at', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS pulse_user_time ON pulse_measurements (user_id, measured_at DESC);
CREATE MATERIALIZED VIEW IF NOT EXISTS pulse_daily
WITH (timescaledb.continuous) AS
 SELECT user_id, source, metric, method, aggregation,
        time_bucket(INTERVAL '1 day', measured_at) AS day,
        COUNT(*) AS samples, AVG(value) AS average, MIN(value) AS minimum, MAX(value) AS maximum
 FROM pulse_measurements
 GROUP BY user_id, source, metric, method, aggregation, day
 WITH NO DATA;
-- PulseSense explicitly refreshes after a user sync or deletion, before serving rollups.
