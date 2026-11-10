-- Registration portal (/register) and admin dashboard (/admin).
-- Apply manually to the Neon database before deploying the registration endpoints.
-- The runtime database role needs SELECT, INSERT, UPDATE and DELETE on these tables
-- and USAGE on their sequences.

-- One row per person, keyed by the email they verified with a one-time code.
CREATE TABLE IF NOT EXISTS participants (
  id                   serial PRIMARY KEY,
  email                text NOT NULL UNIQUE,
  email_verified_at    timestamptz NOT NULL DEFAULT now(),
  full_name            text NOT NULL,
  phone                text NOT NULL,
  gender               text NOT NULL,
  dob                  date NOT NULL,
  participant_type     text NOT NULL CHECK (participant_type IN ('student', 'professional', 'researcher')),
  affiliation          text NOT NULL CHECK (affiliation IN ('internal', 'external')),
  org_name             text NOT NULL,
  org_address          text,
  education_level      text,
  degree               text,
  branch               text,
  year_of_study        smallint,
  graduation_year      smallint,
  cgpa                 numeric(4, 2) CHECK (cgpa BETWEEN 0 AND 10),
  vit_campus           text,
  vit_reg_no           text,
  vit_email            text,
  residence            text CHECK (residence IN ('hosteler', 'day_scholar')),
  hostel_block         text,
  hostel_room          text,
  special_requirements text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id                    serial PRIMARY KEY,
  name                  text NOT NULL,
  invite_code           text NOT NULL UNIQUE,
  leader_id             integer NOT NULL REFERENCES participants (id),
  track                 text,
  problem_statement     text,
  components            jsonb NOT NULL DEFAULT '[]'::jsonb,
  components_updated_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS teams_name_lower_key ON teams (lower(name));

-- A person belongs to at most one team (the UNIQUE on participant_id).
CREATE TABLE IF NOT EXISTS team_members (
  team_id        integer NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  participant_id integer NOT NULL UNIQUE REFERENCES participants (id) ON DELETE CASCADE,
  joined_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, participant_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  team_id      integer PRIMARY KEY REFERENCES teams (id) ON DELETE CASCADE,
  title        text NOT NULL,
  abstract     text NOT NULL,
  repo_url     text,
  demo_url     text,
  document_url text,
  submitted_by integer REFERENCES participants (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Sign-in: one pending code per address, stored as a SHA-256 hash.
CREATE TABLE IF NOT EXISTS email_codes (
  email      text PRIMARY KEY,
  code_hash  char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sessions: the cookie holds a random token; only its SHA-256 hash is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash char(64) PRIMARY KEY,
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_email_idx ON sessions (email);

-- Fixed-window counters shared across serverless instances (keys are SHA-256 hashes).
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket        text NOT NULL,
  key_hash      char(64) NOT NULL,
  window_start  timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (bucket, key_hash, window_start)
);

-- Expired codes, sessions and counters are deleted by the API itself from time to time.
