const router = require('express').Router();
const db = require('../db');
const { authRequired } = require('../middleware/auth');

router.use(authRequired);

// ======================== GET /api/notifications ========================
router.get('/', async (req, res) => {
    try {
        const page      = Math.max(1, parseInt(req.query.page) || 1);
        const limit     = Math.min(50, parseInt(req.query.limit) || 20);
        const offset    = (page - 1) * limit;
        const unreadOnly = req.query.unread === 'true';

        const conditions = ['user_id = $1'];
        const params     = [req.user.id];
        if (unreadOnly) conditions.push('is_read = false');
        const where = conditions.join(' AND ');

        // Run count (filtered), unread count (always full), and data queries in parallel.
        // Counts are independent of pagination — correct even on empty pages.
        const [totalResult, unreadResult, dataResult] = await Promise.all([
            db.query(`SELECT COUNT(*) AS total FROM notifications WHERE ${where}`, params),
            db.query(
                'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = $1 AND is_read = false',
                [req.user.id]
            ),
            db.query(
                `SELECT * FROM notifications WHERE ${where}
                 ORDER BY created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            ),
        ]);

        const total       = parseInt(totalResult.rows[0].total);
        const unreadCount = parseInt(unreadResult.rows[0].unread);

        res.json({
            data:         dataResult.rows,
            unread_count: unreadCount,
            pagination:   { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error('[notifications] GET error:', err.message);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// ======================== PUT /api/notifications/read-all ========================
// Declared before /:id to avoid route shadowing
router.put('/read-all', async (req, res) => {
    try {
        const { rowCount } = await db.query(
            'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
            [req.user.id]
        );
        res.json({ message: 'All notifications marked as read', updated: rowCount });
    } catch (err) {
        console.error('[notifications] read-all error:', err.message);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

// ======================== PUT /api/notifications/:id/read ========================
router.put('/:id/read', async (req, res) => {
    try {
        const { rows } = await db.query(
            'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Notification not found' });
        res.json({ message: 'Marked as read' });
    } catch (err) {
        console.error('[notifications] mark-read error:', err.message);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// ======================== DELETE /api/notifications ========================
// Declared before /:id to avoid route shadowing
router.delete('/', async (req, res) => {
    try {
        await db.query('DELETE FROM notifications WHERE user_id = $1', [req.user.id]);
        res.json({ message: 'All notifications cleared' });
    } catch (err) {
        console.error('[notifications] clear-all error:', err.message);
        res.status(500).json({ error: 'Failed to clear notifications' });
    }
});

// ======================== DELETE /api/notifications/:id ========================
router.delete('/:id', async (req, res) => {
    try {
        const { rows } = await db.query(
            'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Notification not found' });
        res.json({ message: 'Notification deleted' });
    } catch (err) {
        console.error('[notifications] delete error:', err.message);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

module.exports = router;
