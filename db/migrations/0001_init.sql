-- 0001_init: catalog, branches, customers, orders. All money is integer piastres.

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name_ar TEXT NOT NULL, name_en TEXT,
  sort_order INT NOT NULL DEFAULT 0, is_active BOOL NOT NULL DEFAULT TRUE
);

CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES categories(id),
  name_ar TEXT NOT NULL, name_en TEXT,
  description_ar TEXT, description_en TEXT,
  image_url TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('pizza','side','drink','dessert')),
  is_available BOOL NOT NULL DEFAULT TRUE
);

CREATE TABLE item_sizes (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES items(id),
  label TEXT NOT NULL,
  price_piastres INT NOT NULL CHECK (price_piastres >= 0),
  UNIQUE (item_id, label)
);

CREATE TABLE crusts (
  id SERIAL PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT,
  price_delta_piastres INT NOT NULL DEFAULT 0 CHECK (price_delta_piastres >= 0)
);

CREATE TABLE toppings (
  id SERIAL PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT,
  price_delta_piastres INT NOT NULL CHECK (price_delta_piastres >= 0),
  is_available BOOL NOT NULL DEFAULT TRUE
);

CREATE TABLE item_default_toppings (
  item_id INT NOT NULL REFERENCES items(id),
  topping_id INT NOT NULL REFERENCES toppings(id),
  PRIMARY KEY (item_id, topping_id)
);

CREATE TABLE branches (
  id SERIAL PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT,
  phone TEXT, lat NUMERIC, lng NUMERIC, is_open BOOL NOT NULL DEFAULT TRUE
);

CREATE TABLE delivery_zones (
  id SERIAL PRIMARY KEY,
  branch_id INT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  polygon_geojson JSONB,
  radius_m INT CHECK (radius_m > 0),
  fee_piastres INT NOT NULL CHECK (fee_piastres >= 0),
  min_order_piastres INT NOT NULL DEFAULT 0 CHECK (min_order_piastres >= 0),
  eta_minutes INT,
  CHECK (polygon_geojson IS NOT NULL OR radius_m IS NOT NULL)
);

CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE CHECK (phone ~ '^\+201[0125][0-9]{8}$'),
  name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE addresses (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  lat NUMERIC NOT NULL, lng NUMERIC NOT NULL,
  landmark_text TEXT NOT NULL,
  building TEXT, floor TEXT, apartment TEXT, notes TEXT
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  branch_id INT NOT NULL REFERENCES branches(id),
  service TEXT NOT NULL CHECK (service IN ('delivery','pickup')),
  address_id INT REFERENCES addresses(id),
  status TEXT NOT NULL DEFAULT 'PLACED' CHECK (status IN
    ('PLACED','ACCEPTED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','PICKED_UP','CANCELLED')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod','online')),
  payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN
    ('UNPAID','PAID','COD_PENDING','COD_COLLECTED','REFUNDED')),
  subtotal_piastres INT NOT NULL CHECK (subtotal_piastres >= 0),
  delivery_fee_piastres INT NOT NULL CHECK (delivery_fee_piastres >= 0),
  total_piastres INT NOT NULL CHECK (total_piastres = subtotal_piastres + delivery_fee_piastres),
  note TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((service = 'delivery') = (address_id IS NOT NULL)),
  UNIQUE (customer_id, idempotency_key)
);
CREATE INDEX orders_status_idx ON orders(branch_id, status);
CREATE INDEX orders_customer_idx ON orders(customer_id, created_at DESC);

CREATE TABLE order_lines (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id),
  crust_id INT REFERENCES crusts(id),
  is_half_and_half BOOL NOT NULL DEFAULT FALSE,
  qty INT NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price_piastres INT NOT NULL CHECK (unit_price_piastres >= 0),
  note TEXT
);

-- One row per half; normal pizzas have a single 'whole' row. Size is per half (price snapshot kept on the line).
CREATE TABLE order_line_halves (
  id SERIAL PRIMARY KEY,
  order_line_id INT NOT NULL REFERENCES order_lines(id),
  half TEXT NOT NULL CHECK (half IN ('whole','left','right')),
  item_id INT NOT NULL REFERENCES items(id),
  size_id INT NOT NULL REFERENCES item_sizes(id),
  UNIQUE (order_line_id, half)
);

CREATE TABLE order_line_toppings (
  order_line_id INT NOT NULL REFERENCES order_lines(id),
  half TEXT NOT NULL CHECK (half IN ('whole','left','right')),
  topping_id INT NOT NULL REFERENCES toppings(id),
  action TEXT NOT NULL CHECK (action IN ('add','remove')),
  price_delta_piastres INT NOT NULL CHECK (price_delta_piastres >= 0),
  PRIMARY KEY (order_line_id, half, topping_id)
);

CREATE TABLE order_events (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id),
  from_status TEXT, to_status TEXT NOT NULL,
  actor TEXT NOT NULL, reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL CHECK (provider IN ('paymob','fawry','cod')),
  provider_ref TEXT,
  amount_piastres INT NOT NULL CHECK (amount_piastres >= 0),
  status TEXT NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)   -- webhook replay protection
);

CREATE TABLE staff_users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('kitchen','admin')),
  branch_id INT REFERENCES branches(id)
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT,
  outcome TEXT NOT NULL, request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
