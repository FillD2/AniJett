const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

// All bookmark routes require auth
router.use(authRequired);

// ======================== GET /api/bookmarks ========================
router.get('/', async (req, res) => {
    try {
        const status = req.query.status || '';
        const type   = req.query.type || 'anime'; // 'anime' | 'manga' (future)

        let conditions = ['b.user_id = $1'];
        let params = [req.user.id];
        let idx = 2;

        if (status && status !== 'all') {
            conditions.push(`b.status = $${idx}`);
            params.push(status); idx++;
        }

        const { rows } = await db.query(
            `SELECT b.id, b.status, b.episodes_watched, b.created_at, b.updated_at,
                    a.id AS anime_id, a.title, a.title_en, a.type, a.status AS anime_status,
                    a.episodes, a.rating_avg, a.poster_url, a.year, a.genres
             FROM bookmarks b
             JOIN anime a ON a.id = b.anime_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY b.updated_at DESC`,
            params
        );
        res.json(rows);
    } catch (err) {
        console.error('GET /bookmarks error:', err);
        res.status(500).json({ error: 'Failed to fetch bookmarks' });
    }
});

// ======================== POST /api/bookmarks ========================
// Add or update bookmark
router.post('/', [
    body('anime_id').isUUID(),
    body('status').isIn(['watching','planned','completed','dropped','onhold','notinterested','favorite']),
    body('episodes_watched').optional().isInt({ min: 0 }),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    try {
        const { anime_id, status, episodes_watched = 0 } = req.body;

        // Check anime exists
        const { rows: animeRows } = await db.query('SELECT id FROM anime WHERE id = $1', [anime_id]);
        if (!animeRows[0]) return res.status(404).json({ error: 'Anime not found' });

        const { rows } = await db.query(
            `INSERT INTO bookmarks (user_id, anime_id, status, episodes_watched)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, anime_id)
             DO UPDATE SET status = $3, episodes_watched = $4, updated_at = NOW()
             RETURNING *`,
            [req.user.id, anime_id, status, episodes_watched]
        );
        res.json(rows[0]);
    } catch (err) {
        console.error('POST /bookmarks error:', err);
        res.status(500).json({ error: 'Failed to save bookmark' });
    }
});

// ======================== DELETE /api/bookmarks/:animeId ========================
router.delete('/:animeId', async (req, res) => {
    try {
        const { rows } = await db.query(
            'DELETE FROM bookmarks WHERE user_id = $1 AND anime_id = $2 RETURNING id',
            [req.user.id, req.params.animeId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Bookmark not found' });
        res.json({ message: 'Bookmark removed' });
    } catch (err) {
        console.error('DELETE /bookmarks error:', err);
        res.status(500).json({ error: 'Failed to remove bookmark' });
    }
});

// ======================== GET /api/bookmarks/stats ========================
router.get('/stats', async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT status, COUNT(*) AS count
             FROM bookmarks WHERE user_id = $1
             GROUP BY status`,
            [req.user.id]
        );
        const stats = rows.reduce((acc, row) => {
            acc[row.status] = parseInt(row.count);
            return acc;
        }, {});
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

module.exports = router;
