-- AniJett v2 Migration: reactions, replies, push subscriptions

-- Add parent_id for comment threading/replies
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES comments(id) ON DELETE CASCADE;

-- Remove old likes counter (replaced by reactions system)
ALTER TABLE comments DROP COLUMN IF EXISTS likes;

-- One reaction per user per comment; switching reaction uses UPSERT
CREATE TABLE IF NOT EXISTS comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    reaction VARCHAR(30) NOT NULL CHECK (reaction IN ('fire', 'horror', 'poop', 'heart', 'laugh', 'sad')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, comment_id)
);

-- Web Push subscriptions (browser push notifications)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_reactions_comment  ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user     ON comment_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent    ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_push_user          ON push_subscriptions(user_id);
