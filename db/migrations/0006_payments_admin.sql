-- 0006_payments_admin: payment state integrity and audit entries for admin changes.
ALTER TABLE payments
  ADD CONSTRAINT payments_status_check CHECK (status IN ('pending','succeeded','failed','refunded','mismatch'));
ALTER TABLE payments ALTER COLUMN provider_ref SET NOT NULL;
ALTER TABLE payments ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Zones may only be removed while no order depends on them being named; orders keep their own fee snapshot,
-- so this only needs an index to look up usage by branch quickly.
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);
