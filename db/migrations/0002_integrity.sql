-- 0002_integrity: enforce at the DB the invariants the domain relies on, add missing FK indexes.

-- A half's size must belong to that half's item.
ALTER TABLE item_sizes ADD CONSTRAINT item_sizes_id_item_uniq UNIQUE (id, item_id);
ALTER TABLE order_line_halves
  ADD CONSTRAINT order_line_halves_size_item_fk
  FOREIGN KEY (size_id, item_id) REFERENCES item_sizes (id, item_id);

-- Order status events and audit rows are append-only.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER order_events_append_only BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE INDEX order_events_order_idx ON order_events(order_id, created_at);
CREATE INDEX order_lines_order_idx ON order_lines(order_id);
CREATE INDEX addresses_customer_idx ON addresses(customer_id);
CREATE INDEX items_category_idx ON items(category_id);
CREATE INDEX delivery_zones_branch_idx ON delivery_zones(branch_id);
CREATE INDEX payments_order_idx ON payments(order_id);
