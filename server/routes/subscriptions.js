const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

router.use(authRequired);

// ======================== GET /api/subscriptions ========================
router.get('/', async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT s.id, s.created_at,
                    a.id AS anime_id, a.title, a.title_en, a.status AS anime_status,
                    a.poster_url, a.episodes, a.year, a.type
             FROM subscriptions s
             JOIN anime a ON a.id = s.anime_id
             WHERE s.user_id = $1
             ORDER BY s.created_at DESC`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('GET /subscriptions error:', err);
        res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
});

// ======================== POST /api/subscriptions ========================
router.post('/', [
    body('anime_id').isUUID(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    try {
        const { anime_id } = req.body;

        const { rows: animeCheck } = await db.query('SELECT id, title FROM anime WHERE id = $1', [anime_id]);
        if (!animeCheck[0]) return res.status(404).json({ error: 'Anime not found' });

        const { rows } = await db.query(
            `INSERT INTO subscriptions (user_id, anime_id)
             VALUES ($1, $2)
             ON CONFLICT (user_id, anime_id) DO NOTHING
             RETURNING *`,
            [req.user.id, anime_id]
        );

        if (!rows[0]) {
            return res.status(409).json({ error: 'Already subscribed' });
        }

        res.status(201).json({ ...rows[0], anime_title: animeCheck[0].title });
    } catch (err) {
        console.error('POST /subscriptions error:', err);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// ======================== DELETE /api/subscriptions/:animeId ========================
router.delete('/:animeId', async (req, res) => {
    try {
        const { rows } = await db.query(
            'DELETE FROM subscriptions WHERE user_id = $1 AND anime_id = $2 RETURNING id',
            [req.user.id, req.params.animeId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Subscription not found' });
        res.json({ message: 'Unsubscribed' });
    } catch (err) {
        console.error('DELETE /subscriptions error:', err);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

// ======================== GET /api/subscriptions/check/:animeId ========================
router.get('/check/:animeId', async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT id FROM subscriptions WHERE user_id = $1 AND anime_id = $2',
            [req.user.id, req.params.animeId]
        );
        res.json({ subscribed: rows.length > 0 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to check subscription' });
    }
});

module.exports = router;
