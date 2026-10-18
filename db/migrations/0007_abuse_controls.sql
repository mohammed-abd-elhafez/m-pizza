-- 0007_abuse_controls: per-account login throttling data and a payment state for money that must be returned.

ALTER TABLE payments DROP CONSTRAINT payments_status_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending','succeeded','failed','refunded','mismatch','needs_refund'));

CREATE TABLE staff_login_failures (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX staff_login_failures_idx ON staff_login_failures(username, created_at DESC);
