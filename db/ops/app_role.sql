-- Least-privilege role for the running API. Run as the database owner (see `npm run db:app-role`); it is NOT a migration.
-- The API connects as `__APP_ROLE__`; migrations, staff-account management and the demo seed use the owner role.
-- Re-run after adding tables or columns that the API must write: every grant here is explicit on purpose.
--
-- The role can do what the application does and nothing else: it cannot create/alter/drop objects, TRUNCATE,
-- delete orders or audit rows, change order totals, edit the state-transition table, read migration bookkeeping,
-- or create/modify staff accounts (so a compromised API cannot promote itself to admin).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '__APP_ROLE__') THEN
    CREATE ROLE __APP_ROLE__ LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO __APP_ROLE__', current_database());
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM __APP_ROLE__;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM __APP_ROLE__;
REVOKE CREATE ON SCHEMA public FROM __APP_ROLE__;
GRANT USAGE ON SCHEMA public TO __APP_ROLE__;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO __APP_ROLE__;

-- Catalog: read everywhere; the admin screens edit these columns only.
GRANT SELECT ON categories, items, item_sizes, crusts, toppings, item_default_toppings, branches, delivery_zones TO __APP_ROLE__;
GRANT INSERT ON items, item_sizes, delivery_zones TO __APP_ROLE__;
GRANT UPDATE (category_id, name_ar, name_en, description_ar, description_en, image_url, is_available) ON items TO __APP_ROLE__;
GRANT UPDATE (price_piastres) ON item_sizes TO __APP_ROLE__;
GRANT UPDATE (price_delta_piastres, is_available) ON toppings TO __APP_ROLE__;
GRANT UPDATE (price_delta_piastres) ON crusts TO __APP_ROLE__;
GRANT UPDATE (name, radius_m, fee_piastres, min_order_piastres, eta_minutes) ON delivery_zones TO __APP_ROLE__;
GRANT DELETE ON delivery_zones TO __APP_ROLE__;
GRANT UPDATE (is_open) ON branches TO __APP_ROLE__;

-- Customers and orders: orders are append-mostly; only status and payment status ever change.
GRANT SELECT, INSERT ON customers, addresses, orders, order_lines, order_line_halves, order_line_toppings, order_events TO __APP_ROLE__;
GRANT UPDATE (phone) ON customers TO __APP_ROLE__;            -- needed by the upsert on phone
GRANT UPDATE (status, payment_status) ON orders TO __APP_ROLE__;
GRANT SELECT ON allowed_transitions TO __APP_ROLE__;           -- read by the status-guard trigger

-- Payments.
GRANT SELECT, INSERT ON payments TO __APP_ROLE__;
GRANT UPDATE (status, raw_payload, updated_at) ON payments TO __APP_ROLE__;

-- Authentication: staff accounts are read-only for the API.
GRANT SELECT ON staff_users TO __APP_ROLE__;
GRANT SELECT, INSERT ON sessions, otp_requests, staff_login_failures TO __APP_ROLE__;
GRANT UPDATE (revoked_at) ON sessions TO __APP_ROLE__;
GRANT UPDATE (attempts, consumed_at) ON otp_requests TO __APP_ROLE__;

-- Audit trail: write-only.
GRANT INSERT ON audit_log TO __APP_ROLE__;

-- Deliberately NOT granted: schema_migrations, any DDL, TRUNCATE, DELETE on orders/events/audit/sessions,
-- INSERT/UPDATE/DELETE on staff_users, UPDATE of order totals, addresses or request hashes.
