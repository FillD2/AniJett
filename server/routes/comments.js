const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');
const { commentLimiter, reactionLimiter } = require('../middleware/rateLimits');
const { sendNotification, processMentions } = require('../utils/push');

const ALLOWED_REACTIONS = ['fire', 'horror', 'poop', 'heart', 'laugh', 'sad'];

/**
 * Fetch reactions for an array of comment IDs in a single query.
 * Returns a map: { commentId: { counts: {}, user_reaction: string|null } }
 */
const getReactions = async (commentIds, userId = null) => {
    if (!commentIds.length) return {};
    const { rows } = await db.query(
        `SELECT comment_id,
                reaction,
                COUNT(*) AS count,
                bool_or(user_id = $2) AS reacted_by_user
         FROM comment_reactions
         WHERE comment_id = ANY($1)
         GROUP BY comment_id, reaction`,
        [commentIds, userId || '00000000-0000-0000-0000-000000000000']
    );

    return rows.reduce((map, row) => {
        if (!map[row.comment_id]) map[row.comment_id] = { counts: {}, user_reaction: null };
        map[row.comment_id].counts[row.reaction] = parseInt(row.count);
        if (row.reacted_by_user) map[row.comment_id].user_reaction = row.reaction;
        return map;
    }, {});
};

// ======================== GET /api/comments/:animeId ========================
router.get('/:animeId', authOptional, async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page) || 1);
        const limit  = Math.min(50, parseInt(req.query.limit) || 20);
        const offset = (page - 1) * limit;
        const userId = req.user?.id || null;

        // Fetch count + top-level comments in one round-trip by using window function
        const { rows: topLevel } = await db.query(
            `SELECT c.id, c.text, c.created_at, c.updated_at, c.parent_id,
                    u.id AS user_id, u.username, u.avatar, u.role,
                    COUNT(*) OVER() AS total_count
             FROM comments c
             JOIN users u ON u.id = c.user_id
             WHERE c.anime_id = $1 AND c.is_deleted = false AND c.parent_id IS NULL
             ORDER BY c.created_at DESC
             LIMIT $2 OFFSET $3`,
            [req.params.animeId, limit, offset]
        );

        const total = topLevel.length ? parseInt(topLevel[0].total_count) : 0;

        if (!topLevel.length) {
            return res.json({ data: [], pagination: { page, limit, total, pages: 0 } });
        }

        const topIds = topLevel.map(c => c.id);

        // Fetch replies for these top-level comments
        const { rows: replies } = await db.query(
            `SELECT c.id, c.text, c.created_at, c.updated_at, c.parent_id,
                    u.id AS user_id, u.username, u.avatar, u.role
             FROM comments c
             JOIN users u ON u.id = c.user_id
             WHERE c.parent_id = ANY($1) AND c.is_deleted = false
             ORDER BY c.created_at ASC`,
            [topIds]
        );

        const allIds = [...topIds, ...replies.map(r => r.id)];
        const reactionsMap = await getReactions(allIds, userId);

        // Attach reactions to replies and group by parent
        const replyGroups = {};
        for (const reply of replies) {
            const r = reactionsMap[reply.id];
            const enriched = {
                ...reply,
                reactions:     r?.counts || {},
                user_reaction: r?.user_reaction || null,
            };
            if (!replyGroups[reply.parent_id]) replyGroups[reply.parent_id] = [];
            replyGroups[reply.parent_id].push(enriched);
        }

        const data = topLevel.map(({ total_count, ...c }) => ({
            ...c,
            reactions:     reactionsMap[c.id]?.counts || {},
            user_reaction: reactionsMap[c.id]?.user_reaction || null,
            replies:       replyGroups[c.id] || [],
        }));

        res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (err) {
        console.error('[comments] GET error:', err.message);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

// ======================== POST /api/comments/:animeId ========================
router.post('/:animeId', commentLimiter, authRequired, [
    body('text').trim().isLength({ min: 1, max: 2000 }).withMessage('Comment: 1–2000 characters'),
    body('parent_id').optional().isUUID(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const { text, parent_id } = req.body;
    try {
        const { rows: animeRows } = await db.query('SELECT id, title FROM anime WHERE id = $1', [req.params.animeId]);
        if (!animeRows[0]) return res.status(404).json({ error: 'Anime not found' });

        let parentComment = null;
        if (parent_id) {
            const { rows } = await db.query(
                'SELECT id, user_id FROM comments WHERE id = $1 AND anime_id = $2 AND is_deleted = false',
                [parent_id, req.params.animeId]
            );
            if (!rows[0]) return res.status(404).json({ error: 'Parent comment not found' });
            parentComment = rows[0];
        }

        const { rows } = await db.query(
            `INSERT INTO comments (user_id, anime_id, text, parent_id)
             VALUES ($1, $2, $3, $4)
             RETURNING id, text, created_at, parent_id`,
            [req.user.id, req.params.animeId, text, parent_id || null]
        );
        const comment = {
            ...rows[0],
            user_id:       req.user.id,
            username:      req.user.username,
            avatar:        req.user.avatar,
            role:          req.user.role,
            reactions:     {},
            user_reaction: null,
            replies:       [],
        };

        // Notify parent comment author on reply (async, non-blocking)
        if (parentComment && parentComment.user_id !== req.user.id) {
            sendNotification(parentComment.user_id, {
                type:    'reply',
                title:   'Ответ на ваш комментарий',
                message: `${req.user.username} ответил на ваш комментарий к аниме «${animeRows[0].title}»`,
                data:    { animeId: req.params.animeId, commentId: rows[0].id },
            }).catch(err => console.error('[comments] notify reply error:', err.message));
        }

        // Process @mentions (async, non-blocking)
        processMentions(text, req.user.id, {
            animeId:   req.params.animeId,
            commentId: rows[0].id,
        }).catch(err => console.error('[comments] processMentions error:', err.message));

        res.status(201).json(comment);
    } catch (err) {
        console.error('[comments] POST error:', err.message);
        res.status(500).json({ error: 'Failed to post comment' });
    }
});

// ======================== POST /api/comments/:id/react ========================
// One reaction per user. Same reaction = toggle off. Different = switch.
router.post('/:id/react', reactionLimiter, authRequired, [
    body('reaction').isIn(ALLOWED_REACTIONS)
        .withMessage(`Reaction must be one of: ${ALLOWED_REACTIONS.join(', ')}`),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const { reaction } = req.body;
    try {
        const { rows: commentRows } = await db.query(
            'SELECT id FROM comments WHERE id = $1 AND is_deleted = false',
            [req.params.id]
        );
        if (!commentRows[0]) return res.status(404).json({ error: 'Comment not found' });

        const { rows: existing } = await db.query(
            'SELECT reaction FROM comment_reactions WHERE user_id = $1 AND comment_id = $2',
            [req.user.id, req.params.id]
        );

        let action;
        if (existing[0]?.reaction === reaction) {
            await db.query(
                'DELETE FROM comment_reactions WHERE user_id = $1 AND comment_id = $2',
                [req.user.id, req.params.id]
            );
            action = 'removed';
        } else {
            await db.query(
                `INSERT INTO comment_reactions (user_id, comment_id, reaction)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, comment_id)
                 DO UPDATE SET reaction = $3, updated_at = NOW()`,
                [req.user.id, req.params.id, reaction]
            );
            action = existing[0] ? 'switched' : 'added';
        }

        const { rows: counts } = await db.query(
            'SELECT reaction, COUNT(*) AS count FROM comment_reactions WHERE comment_id = $1 GROUP BY reaction',
            [req.params.id]
        );
        const reactions  = counts.reduce((acc, r) => { acc[r.reaction] = parseInt(r.count); return acc; }, {});
        const user_reaction = action === 'removed' ? null : reaction;

        res.json({ action, reactions, user_reaction });
    } catch (err) {
        console.error('[comments] react error:', err.message);
        res.status(500).json({ error: 'Failed to save reaction' });
    }
});

// ======================== PUT /api/comments/:id ========================
router.put('/:id', authRequired, [
    body('text').trim().isLength({ min: 1, max: 2000 }),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    try {
        const { rows } = await db.query(
            `UPDATE comments SET text = $1, updated_at = NOW()
             WHERE id = $2 AND user_id = $3 AND is_deleted = false
             RETURNING id, text, updated_at`,
            [req.body.text, req.params.id, req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Comment not found or not yours' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[comments] PUT error:', err.message);
        res.status(500).json({ error: 'Failed to update comment' });
    }
});

// ======================== DELETE /api/comments/:id ========================
router.delete('/:id', authRequired, async (req, res) => {
    try {
        let q, params;
        if (['admin', 'moderator'].includes(req.user.role)) {
            q      = 'UPDATE comments SET is_deleted = true WHERE id = $1 RETURNING id';
            params = [req.params.id];
        } else {
            q      = 'UPDATE comments SET is_deleted = true WHERE id = $1 AND user_id = $2 RETURNING id';
            params = [req.params.id, req.user.id];
        }
        const { rows } = await db.query(q, params);
        if (!rows[0]) return res.status(404).json({ error: 'Comment not found or not yours' });
        res.json({ message: 'Comment deleted' });
    } catch (err) {
        console.error('[comments] DELETE error:', err.message);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

module.exports = router;
