-- AniJett Database Schema v3

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ======================== TRIGGER: auto-update updated_at ========================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ======================== USERS ========================
CREATE TABLE IF NOT EXISTS users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(50)  UNIQUE NOT NULL CHECK (LENGTH(TRIM(username)) >= 3),
    email         VARCHAR(255) UNIQUE NOT NULL CHECK (email LIKE '%@%'),
    password_hash VARCHAR(255) NOT NULL CHECK (LENGTH(password_hash) > 0),
    avatar        VARCHAR(500),
    bio           TEXT         CHECK (LENGTH(bio) <= 1000),
    role          VARCHAR(20)  NOT NULL DEFAULT 'user'
                      CHECK (role IN ('user', 'admin', 'moderator')),
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    last_login    TIMESTAMP
);

CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ======================== REFRESH TOKENS ========================
-- token_hash stores the SHA-256 hash of the raw JWT refresh token.
-- The raw token is sent to the client; only the hash is persisted here.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT      UNIQUE NOT NULL CHECK (LENGTH(token_hash) > 0),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ======================== EMAIL VERIFICATION ========================
CREATE TABLE IF NOT EXISTS email_verification (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) NOT NULL CHECK (email LIKE '%@%'),
    code       VARCHAR(6)   NOT NULL CHECK (LENGTH(code) >= 4),
    expires_at TIMESTAMP    NOT NULL,
    used       BOOLEAN      NOT NULL DEFAULT false,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ======================== ANIME ========================
CREATE TABLE IF NOT EXISTS anime (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    title            VARCHAR(500) NOT NULL CHECK (LENGTH(TRIM(title)) > 0),
    title_en         VARCHAR(500),
    title_alt        TEXT[]       DEFAULT '{}',
    description      TEXT,
    episodes         INTEGER      CHECK (episodes IS NULL OR episodes >= 1),
    episode_duration INTEGER      CHECK (episode_duration IS NULL OR episode_duration >= 0),
    status           VARCHAR(20)  NOT NULL DEFAULT 'ongoing'
                         CHECK (status IN ('ongoing', 'completed', 'announced', 'dropped')),
    type             VARCHAR(20)  NOT NULL DEFAULT 'tv'
                         CHECK (type IN ('tv', 'movie', 'ova', 'ona', 'special')),
    genres           TEXT[]       NOT NULL DEFAULT '{}',
    studios          TEXT[]       NOT NULL DEFAULT '{}',
    year             INTEGER      CHECK (year IS NULL OR (year >= 1917 AND year <= 2100)),
    season           VARCHAR(10)  CHECK (season IN ('winter', 'spring', 'summer', 'fall')),
    rating_avg       DECIMAL(4,2) NOT NULL DEFAULT 0
                         CHECK (rating_avg >= 0 AND rating_avg <= 10),
    rating_count     INTEGER      NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    views            INTEGER      NOT NULL DEFAULT 0 CHECK (views >= 0),
    is_popular       BOOLEAN      NOT NULL DEFAULT false,
    poster_url       VARCHAR(500),
    banner_url       VARCHAR(500),
    trailer_url      VARCHAR(500),
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by       UUID         REFERENCES users(id) ON DELETE SET NULL
);

CREATE OR REPLACE TRIGGER trg_anime_updated_at
    BEFORE UPDATE ON anime
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ======================== EPISODES ========================
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

CREATE OR REPLACE TRIGGER trg_episodes_updated_at
    BEFORE UPDATE ON episodes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ======================== BOOKMARKS ========================
CREATE TABLE IF NOT EXISTS bookmarks (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anime_id         UUID        NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    status           VARCHAR(20) NOT NULL
                         CHECK (status IN ('watching','planned','completed','dropped','onhold','notinterested','favorite')),
    episodes_watched INTEGER     NOT NULL DEFAULT 0 CHECK (episodes_watched >= 0),
    created_at       TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP   NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, anime_id)
);

CREATE OR REPLACE TRIGGER trg_bookmarks_updated_at
    BEFORE UPDATE ON bookmarks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ======================== COMMENTS (with threading) ========================
CREATE TABLE IF NOT EXISTS comments (
    id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anime_id   UUID      NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    parent_id  UUID      REFERENCES comments(id) ON DELETE CASCADE,
    text       TEXT      NOT NULL CHECK (LENGTH(TRIM(text)) >= 1 AND LENGTH(text) <= 2000),
    is_deleted BOOLEAN   NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ======================== COMMENT REACTIONS ========================
CREATE TABLE IF NOT EXISTS comment_reactions (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id UUID        NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reaction   VARCHAR(30) NOT NULL
                   CHECK (reaction IN ('fire', 'horror', 'poop', 'heart', 'laugh', 'sad')),
    created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, comment_id)
);

CREATE OR REPLACE TRIGGER trg_reactions_updated_at
    BEFORE UPDATE ON comment_reactions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ======================== RATINGS ========================
CREATE TABLE IF NOT EXISTS ratings (
    id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anime_id   UUID      NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    score      INTEGER   NOT NULL CHECK (score >= 1 AND score <= 10),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, anime_id)
);

CREATE OR REPLACE TRIGGER trg_ratings_updated_at
    BEFORE UPDATE ON ratings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ======================== NOTIFICATIONS ========================
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(50)  NOT NULL CHECK (LENGTH(TRIM(type)) > 0),
    title      VARCHAR(255) NOT NULL CHECK (LENGTH(TRIM(title)) > 0),
    message    TEXT         NOT NULL,
    data       JSONB        NOT NULL DEFAULT '{}',
    is_read    BOOLEAN      NOT NULL DEFAULT false,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ======================== SUBSCRIPTIONS ========================
CREATE TABLE IF NOT EXISTS subscriptions (
    id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anime_id   UUID      NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, anime_id)
);

-- ======================== PUSH SUBSCRIPTIONS ========================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT      UNIQUE NOT NULL CHECK (LENGTH(endpoint) > 0),
    p256dh     TEXT      NOT NULL CHECK (LENGTH(p256dh) > 0),
    auth_key   TEXT      NOT NULL CHECK (LENGTH(auth_key) > 0),
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ======================== INDEXES ========================
CREATE INDEX IF NOT EXISTS idx_bookmarks_user       ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_anime      ON bookmarks(anime_id);
CREATE INDEX IF NOT EXISTS idx_comments_anime       ON comments(anime_id);
CREATE INDEX IF NOT EXISTS idx_comments_user        ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent      ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_reactions_comment    ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user       ON comment_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_anime        ON ratings(anime_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user         ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_subscriptions_user   ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_anime_status         ON anime(status);
CREATE INDEX IF NOT EXISTS idx_anime_year           ON anime(year);
CREATE INDEX IF NOT EXISTS idx_anime_popular        ON anime(is_popular);
CREATE INDEX IF NOT EXISTS idx_anime_rating         ON anime(rating_avg DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash   ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_user         ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_user            ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_episodes_anime       ON episodes(anime_id);
CREATE INDEX IF NOT EXISTS idx_email_verify_email   ON email_verification(email);
CREATE INDEX IF NOT EXISTS idx_email_verify_expires ON email_verification(expires_at);
