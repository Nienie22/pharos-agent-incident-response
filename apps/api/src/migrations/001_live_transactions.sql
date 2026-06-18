CREATE TABLE IF NOT EXISTS incidents (
  id text PRIMARY KEY,
  chain_id bigint NOT NULL,
  subject text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'detected'
    CHECK (state IN ('detected', 'registering', 'registered', 'proposed', 'executing', 'executed', 'closing', 'closed', 'failed')),
  plan_hash text,
  closure_document jsonb,
  closure_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  plan_hash text PRIMARY KEY,
  incident_id text NOT NULL REFERENCES incidents(id),
  chain_id bigint NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'created'
    CHECK (state IN ('created', 'registering', 'registered', 'proposing', 'proposed', 'approved', 'executing', 'executed', 'closing', 'closed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plans_incident_id_idx ON plans (incident_id);

CREATE TABLE IF NOT EXISTS approval_intents (
  id text PRIMARY KEY,
  chain_id bigint NOT NULL,
  plan_hash text NOT NULL,
  signer text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  signature text,
  status text NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'verified', 'pending', 'confirmed', 'failed', 'expired')),
  tx_hash text,
  receipt jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, signer, nonce)
);

CREATE INDEX IF NOT EXISTS approval_intents_plan_hash_idx ON approval_intents (plan_hash);

CREATE TABLE IF NOT EXISTS transactions (
  id text PRIMARY KEY,
  purpose text NOT NULL,
  reference_id text NOT NULL,
  chain_id bigint NOT NULL,
  sender text NOT NULL,
  nonce numeric(78, 0) NOT NULL,
  tx_hash text,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'pending', 'confirmed', 'failed')),
  block_number numeric(78, 0),
  block_hash text,
  gas_used numeric(78, 0),
  receipt jsonb,
  decoded_logs jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, tx_hash),
  UNIQUE (chain_id, sender, nonce)
);

CREATE INDEX IF NOT EXISTS transactions_reference_idx ON transactions (reference_id, purpose);

CREATE TABLE IF NOT EXISTS relayer_nonces (
  chain_id bigint NOT NULL,
  sender text NOT NULL,
  next_nonce numeric(78, 0) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, sender)
);
