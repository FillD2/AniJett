const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');

// ======================== POST /api/ratings ========================
// Set or update user's rating for an anime
router.post('/', authRequired, [
    body('anime_id').isUUID(),
    body('score').isInt({ min: 1, max: 10 }).withMessage('Score must be 1–10'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const { anime_id, score } = req.body;
    try {
        const { rows: animeCheck } = await db.query('SELECT id FROM anime WHERE id = $1', [anime_id]);
        if (!animeCheck[0]) return res.status(404).json({ error: 'Anime not found' });

        // Upsert rating
        const { rows } = await db.query(
            `INSERT INTO ratings (user_id, anime_id, score)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, anime_id)
             DO UPDATE SET score = $3, updated_at = NOW()
             RETURNING *`,
            [req.user.id, anime_id, score]
        );

        // Recalculate average on anime
        const { rows: avg } = await db.query(
            `SELECT AVG(score)::DECIMAL(4,2) AS avg, COUNT(*) AS cnt
             FROM ratings WHERE anime_id = $1`,
            [anime_id]
        );
        await db.query(
            'UPDATE anime SET rating_avg = $1, rating_count = $2 WHERE id = $3',
            [avg[0].avg, avg[0].cnt, anime_id]
        );

        res.json({ rating: rows[0], anime_avg: parseFloat(avg[0].avg), anime_count: parseInt(avg[0].cnt) });
    } catch (err) {
        console.error('POST /ratings error:', err);
        res.status(500).json({ error: 'Failed to save rating' });
    }
});

// ======================== DELETE /api/ratings/:animeId ========================
router.delete('/:animeId', authRequired, async (req, res) => {
    try {
        const { rows } = await db.query(
            'DELETE FROM ratings WHERE user_id = $1 AND anime_id = $2 RETURNING id',
            [req.user.id, req.params.animeId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Rating not found' });

        // Recalculate
        const { rows: avg } = await db.query(
            'SELECT AVG(score)::DECIMAL(4,2) AS avg, COUNT(*) AS cnt FROM ratings WHERE anime_id = $1',
            [req.params.animeId]
        );
        await db.query(
            'UPDATE anime SET rating_avg = $1, rating_count = $2 WHERE id = $3',
            [avg[0].avg || 0, avg[0].cnt, req.params.animeId]
        );
        res.json({ message: 'Rating removed' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove rating' });
    }
});

// ======================== GET /api/ratings/:animeId ========================
router.get('/:animeId', authOptional, async (req, res) => {
    try {
        const { rows: avgRows } = await db.query(
            `SELECT AVG(score)::DECIMAL(4,2) AS avg, COUNT(*) AS count,
                    json_object_agg(score::text, cnt) AS distribution
             FROM (
               SELECT score, COUNT(*) AS cnt FROM ratings WHERE anime_id = $1 GROUP BY score
             ) sub`,
            [req.params.animeId]
        );

        let userScore = null;
        if (req.user) {
            const { rows } = await db.query(
                'SELECT score FROM ratings WHERE user_id = $1 AND anime_id = $2',
                [req.user.id, req.params.animeId]
            );
            userScore = rows[0]?.score || null;
        }

        res.json({
            avg: parseFloat(avgRows[0]?.avg) || 0,
            count: parseInt(avgRows[0]?.count) || 0,
            distribution: avgRows[0]?.distribution || {},
            user_score: userScore,
        });
    } catch (err) {
        console.error('GET /ratings error:', err);
        res.status(500).json({ error: 'Failed to fetch ratings' });
    }
});

module.exports = router;
