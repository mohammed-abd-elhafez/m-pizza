-- 0008_security_and_scale: support the unpaid-order expiry worker without scanning unrelated orders.
CREATE INDEX orders_unpaid_expiry_idx
  ON orders (created_at, id)
  WHERE payment_method = 'online'
    AND payment_status = 'UNPAID'
    AND status = 'PLACED';
