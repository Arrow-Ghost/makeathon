-- Apply manually to the Neon database before deploying the rate-limited endpoint.
-- This table stores SHA-256 hashes of client IP addresses and minute counters.
-- Ensure the runtime database role has SELECT, INSERT, and UPDATE privileges.
CREATE TABLE IF NOT EXISTS subscription_rate_limits (
  address_hash char(64) NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (address_hash, window_start)
);

-- Optional maintenance, run periodically (for example, weekly):
-- DELETE FROM subscription_rate_limits
-- WHERE window_start < now() - interval '2 days';
