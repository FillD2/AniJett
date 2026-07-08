-- AniJett Migration v4: Security hardening
-- Run this against an existing database to apply the v3 → v4 changes.
-- WARNING: refresh_tokens are cleared — all users must re-login after this migration.

-- ======================== TRIGGER FUNCTION ========================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ======================== REFRESH TOKENS: hash the stored token ========================
-- Rename token → token_hash to reflect that we now store a SHA-256 hash.
-- Existing plaintext tokens are invalid after this change — clear the table.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'refresh_tokens' AND column_name = 'token'
    ) THEN
        ALTER TABLE refresh_tokens RENAME COLUMN token TO token_hash;
    END IF;
END $$;

TRUNCATE TABLE refresh_tokens;

DROP INDEX IF EXISTS idx_refresh_token;
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens(token_hash);

-- ======================== EPISODES TABLE ========================
CREATE TABLE IF NOT EXISTS episodes (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    anime_id      UUID         NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    season        INTEGER      NOT NULL CHECK (season >= 1),
    episode       INTEGER      NOT NULL CHECK (episode >= 1),
    title         VARCHAR(500),
    description   TEXT,
    video_url     TEXT,
    qualities     JSONB        NOT NULL DEFAULT '[]',
    duration_sec  INTEGER      CHECK (duration_sec IS NULL OR duration_sec >= 0),
    thumbnail_url TEXT,
    intro_start   INTEGER      NOT NULL DEFAULT 0 CHECK (intro_start >= 0),
    intro_end     INTEGER      NOT NULL DEFAULT 0 CHECK (intro_end >= 0),
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE (anime_id, season, episode)
);

CREATE INDEX IF NOT EXISTS idx_episodes_anime ON episodes(anime_id);

-- ======================== EMAIL VERIFICATION TABLE ========================
CREATE TABLE IF NOT EXISTS email_verification (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) NOT NULL CHECK (email LIKE '%@%'),
    code       VARCHAR(6)   NOT NULL CHECK (LENGTH(code) >= 4),
    expires_at TIMESTAMP    NOT NULL,
    used       BOOLEAN      NOT NULL DEFAULT false,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verify_email   ON email_verification(email);
CREATE INDEX IF NOT EXISTS idx_email_verify_expires ON email_verification(expires_at);

-- ======================== UPDATED_AT TRIGGERS ========================
CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER trg_anime_updated_at
    BEFORE UPDATE ON anime
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER trg_episodes_updated_at
    BEFORE UPDATE ON episodes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER trg_bookmarks_updated_at
    BEFORE UPDATE ON bookmarks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER trg_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER trg_reactions_updated_at
    BEFORE UPDATE ON comment_reactions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER trg_ratings_updated_at
    BEFORE UPDATE ON ratings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ======================== ADDITIONAL INDEXES ========================
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_anime_rating         ON anime(rating_avg DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_user         ON ratings(user_id);
