-- 0005_hardening: enforce order invariants in the database, not only in application code.

-- Idempotency: every order carries the fingerprint of the request that created it.
ALTER TABLE orders ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE orders ADD COLUMN request_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ALTER COLUMN request_hash DROP DEFAULT;

-- Child rows must reference rows that exist for the same line/half and the same customer.
ALTER TABLE order_line_toppings
  ADD CONSTRAINT order_line_toppings_half_fk
  FOREIGN KEY (order_line_id, half) REFERENCES order_line_halves (order_line_id, half);
ALTER TABLE order_line_toppings
  ADD CONSTRAINT order_line_toppings_remove_is_free CHECK (action = 'add' OR price_delta_piastres = 0);

ALTER TABLE addresses ADD CONSTRAINT addresses_id_customer_uniq UNIQUE (id, customer_id);
ALTER TABLE orders
  ADD CONSTRAINT orders_address_owner_fk
  FOREIGN KEY (address_id, customer_id) REFERENCES addresses (id, customer_id);

ALTER TABLE order_events
  ADD CONSTRAINT order_events_status_check CHECK (
    to_status IN ('PLACED','ACCEPTED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','PICKED_UP','CANCELLED')
    AND (from_status IS NULL OR from_status IN
      ('PLACED','ACCEPTED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','PICKED_UP','CANCELLED'))
  );

-- Payment method and payment status must agree.
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_consistent CHECK (
    (payment_method = 'cod' AND payment_status IN ('COD_PENDING','COD_COLLECTED','REFUNDED')) OR
    (payment_method = 'online' AND payment_status IN ('UNPAID','PAID','REFUNDED'))
  );

-- Audit tables cannot be emptied either.
CREATE TRIGGER order_events_no_truncate BEFORE TRUNCATE ON order_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- The only legal order status moves (mirrors domain/order-state-machine.ts).
CREATE TABLE allowed_transitions (
  service TEXT NOT NULL CHECK (service IN ('delivery','pickup')),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  PRIMARY KEY (service, from_status, to_status)
);
INSERT INTO allowed_transitions (service, from_status, to_status) VALUES
  ('delivery','PLACED','ACCEPTED'), ('delivery','ACCEPTED','PREPARING'), ('delivery','PREPARING','READY'),
  ('delivery','READY','OUT_FOR_DELIVERY'), ('delivery','OUT_FOR_DELIVERY','DELIVERED'),
  ('pickup','PLACED','ACCEPTED'), ('pickup','ACCEPTED','PREPARING'), ('pickup','PREPARING','READY'),
  ('pickup','READY','PICKED_UP'),
  ('delivery','PLACED','CANCELLED'), ('delivery','ACCEPTED','CANCELLED'), ('delivery','PREPARING','CANCELLED'),
  ('delivery','READY','CANCELLED'), ('delivery','OUT_FOR_DELIVERY','CANCELLED'),
  ('pickup','PLACED','CANCELLED'), ('pickup','ACCEPTED','CANCELLED'), ('pickup','PREPARING','CANCELLED'),
  ('pickup','READY','CANCELLED');

CREATE FUNCTION guard_order_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM allowed_transitions
       WHERE service = OLD.service AND from_status = OLD.status AND to_status = NEW.status
    ) THEN
      RAISE EXCEPTION 'illegal order status transition % -> % (%)', OLD.status, NEW.status, OLD.service;
    END IF;
    -- An online order may not be worked on before payment is confirmed.
    IF NEW.payment_method = 'online' AND NEW.payment_status <> 'PAID' AND NEW.status <> 'CANCELLED' THEN
      RAISE EXCEPTION 'online order % is not paid', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_status_guard BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION guard_order_status();
