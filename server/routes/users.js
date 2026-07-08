const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

// ======================== GET /api/users/me ========================
router.get('/me', authRequired, async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT u.id, u.username, u.email, u.avatar, u.bio, u.role,
                    u.created_at, u.last_login,
                    (SELECT COUNT(*) FROM bookmarks WHERE user_id = u.id) AS bookmarks_total,
                    (SELECT COUNT(*) FROM bookmarks WHERE user_id = u.id AND status = 'watching') AS watching,
                    (SELECT COUNT(*) FROM bookmarks WHERE user_id = u.id AND status = 'completed') AS completed,
                    (SELECT COUNT(*) FROM bookmarks WHERE user_id = u.id AND status = 'planned') AS planned,
                    (SELECT COUNT(*) FROM comments WHERE user_id = u.id AND is_deleted = false) AS comments_total,
                    (SELECT COUNT(*) FROM ratings WHERE user_id = u.id) AS ratings_total,
                    (SELECT COUNT(*) FROM subscriptions WHERE user_id = u.id) AS subscriptions_total,
                    (SELECT COUNT(*) FROM notifications WHERE user_id = u.id AND is_read = false) AS unread_notifications
             FROM users u WHERE u.id = $1`,
            [req.user.id]
        );
        res.json(rows[0]);
    } catch (err) {
        console.error('GET /users/me error:', err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// ======================== PUT /api/users/me ========================
router.put('/me', authRequired, [
    body('username').optional().trim().isLength({ min: 3, max: 50 }).matches(/^[a-zA-Zа-яА-Я0-9_]+$/u),
    body('bio').optional().isLength({ max: 500 }),
    body('avatar').optional().isURL().withMessage('Avatar must be a valid URL'),
    body('new_password').optional().isLength({ min: 6 }),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    try {
        const { username, bio, avatar, current_password, new_password } = req.body;

        // If changing password, verify current password
        if (new_password) {
            if (!current_password) return res.status(400).json({ error: 'Current password required' });
            const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
            const valid = await bcrypt.compare(current_password, rows[0].password_hash);
            if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Check username uniqueness if changing
        if (username && username !== req.user.username) {
            const { rows } = await db.query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, req.user.id]);
            if (rows.length > 0) return res.status(409).json({ error: 'Username already taken' });
        }

        const updates = [];
        const values = [];
        let idx = 1;

        if (username !== undefined) { updates.push(`username = $${idx}`); values.push(username); idx++; }
        if (bio !== undefined)      { updates.push(`bio = $${idx}`);      values.push(bio);      idx++; }
        if (avatar !== undefined)   { updates.push(`avatar = $${idx}`);   values.push(avatar);   idx++; }
        if (new_password) {
            const hash = await bcrypt.hash(new_password, 12);
            updates.push(`password_hash = $${idx}`);
            values.push(hash); idx++;
        }

        if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

        updates.push('updated_at = NOW()');
        values.push(req.user.id);

        const { rows } = await db.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}
             RETURNING id, username, email, avatar, bio, role, updated_at`,
            values
        );
        res.json(rows[0]);
    } catch (err) {
        console.error('PUT /users/me error:', err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ======================== GET /api/users/:id (public profile) ========================
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT u.id, u.username, u.avatar, u.bio, u.role, u.created_at,
                    (SELECT COUNT(*) FROM bookmarks WHERE user_id = u.id) AS bookmarks_total,
                    (SELECT COUNT(*) FROM comments WHERE user_id = u.id AND is_deleted = false) AS comments_total,
                    (SELECT json_agg(json_build_object('id', a.id, 'title', a.title, 'poster_url', a.poster_url))
                     FROM bookmarks b JOIN anime a ON a.id = b.anime_id
                     WHERE b.user_id = u.id AND b.status = 'favorite' LIMIT 6) AS favorites
             FROM users u WHERE u.id = $1 AND u.is_active = true`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error('GET /users/:id error:', err);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

module.exports = router;
