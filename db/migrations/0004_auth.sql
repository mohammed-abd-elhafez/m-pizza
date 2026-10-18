-- 0004_auth: opaque revocable sessions (customers and staff), OTP challenges, staff account switch.

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                      -- sha256 of the bearer token; the token itself is never stored
  subject_type TEXT NOT NULL CHECK (subject_type IN ('customer','staff')),
  subject_id INT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_subject_idx ON sessions(subject_type, subject_id);

CREATE TABLE otp_requests (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL CHECK (phone ~ '^\+201[0125][0-9]{8}$'),
  code_digest TEXT NOT NULL,                        -- HMAC of the code; the code itself is never stored
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX otp_requests_phone_idx ON otp_requests(phone, created_at DESC);

ALTER TABLE staff_users ADD COLUMN is_active BOOL NOT NULL DEFAULT TRUE;
