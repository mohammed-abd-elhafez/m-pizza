-- 0003_tracking_token: unguessable per-order capability used by customers to track an order without an account.

ALTER TABLE orders ADD COLUMN tracking_token TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE orders ADD CONSTRAINT orders_tracking_token_uniq UNIQUE (tracking_token);
