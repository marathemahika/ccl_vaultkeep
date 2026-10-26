-- =====================================================================
-- VaultKeep PostgreSQL schema
-- Run with:  psql "$DATABASE_URL" -f database/schema.sql
-- Safe to re-run: objects are created only if they do not already exist.
-- Requires PostgreSQL 13+ (gen_random_uuid() is built in).
-- =====================================================================

BEGIN;

-- ---------- Enum types ----------------------------------------------
DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('active', 'inactive', 'released');
  -- active   : owner is checking in normally
  -- inactive : check-in overdue; nominees notified; grace period running
  -- released : grace period over; nominees may access released documents
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_category AS ENUM
    ('property', 'insurance', 'will', 'financial', 'identity', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE actor_type AS ENUM ('owner', 'nominee', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Shared trigger: keep updated_at current -----------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- users (vault owners) ------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text        NOT NULL,
  password_hash         text        NOT NULL,            -- bcrypt/argon2 hash, never plaintext
  full_name             text        NOT NULL,

  status                account_status NOT NULL DEFAULT 'active',
  checkin_interval_days integer     NOT NULL DEFAULT 30  CHECK (checkin_interval_days BETWEEN 1 AND 365),
  grace_period_days     integer     NOT NULL DEFAULT 7   CHECK (grace_period_days BETWEEN 0 AND 90),
  last_checkin_at       timestamptz NOT NULL DEFAULT now(),
  inactive_flagged_at   timestamptz,                      -- when the monitor flagged the account
  access_release_at     timestamptz,                      -- inactive_flagged_at + grace period
  access_released_at    timestamptz,                      -- when status actually became 'released'

  failed_login_count    integer     NOT NULL DEFAULT 0,
  locked_until          timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));
-- Used by the EventBridge/Lambda inactivity monitor
CREATE INDEX IF NOT EXISTS users_active_checkin_idx
  ON users (last_checkin_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS users_release_due_idx
  ON users (access_release_at) WHERE status = 'inactive';

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- nominees -------------------------------------------------
-- A nominee is a person the owner trusts. They log in with a one-time
-- access code that is only sent (via SNS) once access is released.
CREATE TABLE IF NOT EXISTS nominees (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id               uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name              text        NOT NULL,
  email                  text        NOT NULL,
  relationship           text,
  access_code_hash       text,                             -- hash of one-time code (cleared on use)
  access_code_expires_at timestamptz,
  access_code_used_at    timestamptz,                      -- set when the code is consumed
  notified_inactive_at   timestamptz,                      -- "owner inactive" notice sent
  notified_released_at   timestamptz,                      -- "access granted" notice sent
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Upgrade path for databases created by an earlier version of this file.
ALTER TABLE nominees ADD COLUMN IF NOT EXISTS access_code_used_at timestamptz;
-- Replace the case-sensitive UNIQUE (owner_id, email) with the index below.
ALTER TABLE nominees DROP CONSTRAINT IF EXISTS nominees_owner_id_email_key;

-- One nominee per email per owner, ignoring case ("Name@x.com" = "name@x.com").
-- If this fails on an existing database, you have case-variant duplicates:
-- find them with  SELECT owner_id, lower(email), count(*) FROM nominees
--                 GROUP BY 1,2 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS nominees_owner_email_lower_uq
  ON nominees (owner_id, lower(email));

-- ONE-TIME ACCESS CODE: how the backend must use these columns
--   Issue (resets any earlier use):
--     UPDATE nominees SET access_code_hash = $hash,
--            access_code_expires_at = now() + interval '15 minutes',
--            access_code_used_at = NULL
--      WHERE id = $nominee_id;
--   Consume (atomic compare-and-set; exactly one caller can ever get a row back):
--     UPDATE nominees SET access_code_used_at = now(), access_code_hash = NULL
--      WHERE id = $nominee_id
--        AND access_code_hash = $stored_hash          -- the value you just verified
--        AND access_code_used_at IS NULL
--        AND access_code_expires_at > now()
--     RETURNING id, owner_id;
--   0 rows returned = code already used, expired or replaced -> reject.

-- Target for composite foreign keys (see document_releases): lets PostgreSQL
-- verify that a (nominee_id, owner_id) pair really exists.
CREATE UNIQUE INDEX IF NOT EXISTS nominees_id_owner_uq ON nominees (id, owner_id);
CREATE INDEX IF NOT EXISTS nominees_owner_idx ON nominees (owner_id);
CREATE INDEX IF NOT EXISTS nominees_email_lower_idx ON nominees (lower(email));

DROP TRIGGER IF EXISTS nominees_set_updated_at ON nominees;
CREATE TRIGGER nominees_set_updated_at BEFORE UPDATE ON nominees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- documents (metadata only; file bytes live in S3) ---------
-- Envelope encryption: KMS GenerateDataKey returns a per-file data key.
-- The file is encrypted with the plaintext key (AES-256-GCM), the plaintext
-- key is discarded, and ONLY the KMS-encrypted copy is stored here.
CREATE TABLE IF NOT EXISTS documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title               text        NOT NULL,
  category            document_category NOT NULL DEFAULT 'other',
  original_filename   text        NOT NULL,
  content_type        text        NOT NULL,
  size_bytes          bigint      NOT NULL CHECK (size_bytes >= 0),   -- plaintext size
  sha256_hex          char(64)    NOT NULL,                           -- integrity of plaintext

  s3_bucket           text        NOT NULL,
  s3_key              text        NOT NULL,
  encrypted_data_key  bytea       NOT NULL,   -- ciphertext blob returned by KMS
  iv                  bytea       NOT NULL,   -- 12-byte GCM nonce
  auth_tag            bytea       NOT NULL,   -- 16-byte GCM tag
  kms_key_id          text        NOT NULL,   -- key ARN/alias used (supports rotation)

  deleted_at          timestamptz,            -- soft delete
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (s3_bucket, s3_key)
);

-- Target for composite foreign keys (see document_releases).
CREATE UNIQUE INDEX IF NOT EXISTS documents_id_owner_uq ON documents (id, owner_id);
CREATE INDEX IF NOT EXISTS documents_owner_idx
  ON documents (owner_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS documents_set_updated_at ON documents;
CREATE TRIGGER documents_set_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- document_releases (which nominee may see which document) -
-- owner_id is stored here so that PostgreSQL itself guarantees the document
-- and the nominee belong to the SAME owner:
--   (document_id, owner_id) must exist in documents(id, owner_id)
--   (nominee_id,  owner_id) must exist in nominees(id,  owner_id)
-- A row pairing owner A's document with owner B's nominee is therefore
-- impossible, no matter what the application code does.
CREATE TABLE IF NOT EXISTS document_releases (
  document_id  uuid        NOT NULL,
  nominee_id   uuid        NOT NULL,
  owner_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, nominee_id),
  CONSTRAINT document_releases_document_owner_fk
    FOREIGN KEY (document_id, owner_id)
    REFERENCES documents (id, owner_id) ON DELETE CASCADE,
  CONSTRAINT document_releases_nominee_owner_fk
    FOREIGN KEY (nominee_id, owner_id)
    REFERENCES nominees (id, owner_id) ON DELETE CASCADE
);

-- Upgrade path: if document_releases was created by the earlier version of this
-- file (no owner_id, simple foreign keys), convert it in place.
DO $$
DECLARE bad_rows integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'document_releases'::regclass
                   AND conname = 'document_releases_document_owner_fk') THEN

    ALTER TABLE document_releases ADD COLUMN IF NOT EXISTS owner_id uuid;
    UPDATE document_releases dr SET owner_id = d.owner_id
      FROM documents d WHERE d.id = dr.document_id AND dr.owner_id IS NULL;

    -- Remove cross-owner rows (the exact bug being fixed) before adding constraints.
    DELETE FROM document_releases dr
      WHERE NOT EXISTS (SELECT 1 FROM nominees n
                        WHERE n.id = dr.nominee_id AND n.owner_id = dr.owner_id);
    GET DIAGNOSTICS bad_rows = ROW_COUNT;
    IF bad_rows > 0 THEN
      RAISE NOTICE 'Removed % cross-owner document_releases row(s)', bad_rows;
    END IF;

    ALTER TABLE document_releases ALTER COLUMN owner_id SET NOT NULL;
    ALTER TABLE document_releases DROP CONSTRAINT IF EXISTS document_releases_document_id_fkey;
    ALTER TABLE document_releases DROP CONSTRAINT IF EXISTS document_releases_nominee_id_fkey;
    ALTER TABLE document_releases ADD CONSTRAINT document_releases_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE document_releases ADD CONSTRAINT document_releases_document_owner_fk
      FOREIGN KEY (document_id, owner_id) REFERENCES documents (id, owner_id) ON DELETE CASCADE;
    ALTER TABLE document_releases ADD CONSTRAINT document_releases_nominee_owner_fk
      FOREIGN KEY (nominee_id, owner_id) REFERENCES nominees (id, owner_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS document_releases_nominee_idx ON document_releases (nominee_id);
CREATE INDEX IF NOT EXISTS document_releases_owner_idx   ON document_releases (owner_id);

-- ---------- check_ins -------------------------------------------------
CREATE TABLE IF NOT EXISTS check_ins (
  id             bigserial PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checked_in_at  timestamptz NOT NULL DEFAULT now(),
  method         text        NOT NULL DEFAULT 'manual',   -- 'manual' | 'login'
  ip_address     inet
);

CREATE INDEX IF NOT EXISTS check_ins_user_time_idx ON check_ins (user_id, checked_in_at DESC);

-- ---------- audit_log (append-only) ----------------------------------
-- No foreign keys on purpose: audit rows must survive deletion of the
-- user/document they describe.
CREATE TABLE IF NOT EXISTS audit_log (
  id           bigserial PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  actor_type   actor_type  NOT NULL,
  actor_id     uuid,                    -- user id / nominee id / NULL for system
  owner_id     uuid,                    -- whose vault was affected
  document_id  uuid,
  action       text        NOT NULL,    -- e.g. 'auth.login', 'document.upload', 'document.download'
  success      boolean     NOT NULL DEFAULT true,
  ip_address   inet,
  user_agent   text,
  details      jsonb       NOT NULL DEFAULT '{}'::jsonb   -- never store secrets/plaintext here
);

CREATE INDEX IF NOT EXISTS audit_owner_time_idx  ON audit_log (owner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_action_time_idx ON audit_log (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_failed_idx      ON audit_log (occurred_at DESC) WHERE success = false;

-- Tamper resistance at the database level.
CREATE OR REPLACE FUNCTION audit_log_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_changes();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_changes();

-- ---------- Helper views for the Lambda inactivity monitor -----------
-- Accounts whose check-in window has passed and are not yet flagged.
CREATE OR REPLACE VIEW v_overdue_accounts AS
SELECT id, email, full_name, last_checkin_at, checkin_interval_days, grace_period_days
FROM users
WHERE status = 'active'
  AND last_checkin_at + make_interval(days => checkin_interval_days) < now();

-- Flagged accounts whose grace period has ended and are ready to release.
CREATE OR REPLACE VIEW v_release_due_accounts AS
SELECT id, email, full_name, inactive_flagged_at, access_release_at
FROM users
WHERE status = 'inactive'
  AND access_release_at <= now();

COMMIT;