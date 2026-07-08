const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { authOptional, authRequired, adminOnly } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');

// ======================== GET /api/episodes/:animeId/:season/:episode ========================
// Public — get a single episode
router.get('/:animeId/:season/:episode', authOptional, async (req, res) => {
    try {
        const { animeId, season, episode } = req.params;
        const { rows } = await db.query(
            `SELECT id, anime_id, season, episode, title, description,
                    video_url, qualities, duration_sec, thumbnail_url,
                    intro_start, intro_end
             FROM episodes
             WHERE anime_id = $1 AND season = $2 AND episode = $3`,
            [animeId, parseInt(season), parseInt(episode)]
        );
        res.json(rows[0] || null);
    } catch (err) {
        console.error('[episodes] GET single error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ======================== GET /api/episodes/:animeId ========================
// Public — list all episodes for an anime (optionally filter by season)
router.get('/:animeId', authOptional, async (req, res) => {
    try {
        const { animeId } = req.params;
        const season = req.query.season ? parseInt(req.query.season) : null;

        const params = [animeId];
        let q = `SELECT id, season, episode, title, thumbnail_url, duration_sec, intro_start, intro_end
                 FROM episodes WHERE anime_id = $1`;
        if (season) {
            q += ' AND season = $2';
            params.push(season);
        }
        q += ' ORDER BY season ASC, episode ASC';

        const { rows } = await db.query(q, params);
        res.json(rows);
    } catch (err) {
        console.error('[episodes] LIST error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ======================== POST /api/episodes/:animeId ========================
// Admin only — add or update an episode
router.post('/:animeId', authRequired, adminOnly, [
    param('animeId').isUUID(),
    body('season').isInt({ min: 1 }),
    body('episode').isInt({ min: 1 }),
    body('video_url').optional().isURL({ require_tld: false }),
    body('title').optional().isString().trim().isLength({ max: 500 }),
    body('qualities').optional().isArray(),
], async (req, res) => {
    if (!validateRequest(req, res)) return;
    try {
        const { animeId } = req.params;
        const {
            season, episode, title, description,
            video_url, qualities, duration_sec,
            thumbnail_url, intro_start, intro_end,
        } = req.body;

        const { rows } = await db.query(`
            INSERT INTO episodes
                (anime_id, season, episode, title, description, video_url,
                 qualities, duration_sec, thumbnail_url, intro_start, intro_end)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (anime_id, season, episode) DO UPDATE SET
                title        = EXCLUDED.title,
                description  = EXCLUDED.description,
                video_url    = EXCLUDED.video_url,
                qualities    = EXCLUDED.qualities,
                duration_sec = EXCLUDED.duration_sec,
                thumbnail_url= EXCLUDED.thumbnail_url,
                intro_start  = EXCLUDED.intro_start,
                intro_end    = EXCLUDED.intro_end,
                updated_at   = NOW()
            RETURNING *
        `, [
            animeId, season, episode,
            title        || null,
            description  || null,
            video_url    || null,
            JSON.stringify(qualities || []),
            duration_sec || null,
            thumbnail_url|| null,
            intro_start  || 0,
            intro_end    || 0,
        ]);
        res.json(rows[0]);
    } catch (err) {
        console.error('[episodes] POST error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ======================== DELETE /api/episodes/:animeId/:season/:episode ========================
// Admin only — remove an episode
router.delete('/:animeId/:season/:episode', authRequired, adminOnly, async (req, res) => {
    try {
        const { animeId, season, episode } = req.params;
        const { rowCount } = await db.query(
            'DELETE FROM episodes WHERE anime_id=$1 AND season=$2 AND episode=$3',
            [animeId, parseInt(season), parseInt(episode)]
        );
        if (!rowCount) return res.status(404).json({ error: 'Episode not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('[episodes] DELETE error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
