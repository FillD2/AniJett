const router = require('express').Router();
const { body, query, param, validationResult } = require('express-validator');
const db = require('../db');
const { authOptional, authRequired, adminOnly } = require('../middleware/auth');

const validateRequest = (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: 'Validation failed', details: errors.array() });
        return false;
    }
    return true;
};

// ======================== GET /api/anime ========================
// Params: page, limit, search, status, type, genre, year, sort
router.get('/', authOptional, async (req, res) => {
    try {
        const page    = Math.max(1, parseInt(req.query.page) || 1);
        const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit) || 24));
        const offset  = (page - 1) * limit;
        const search  = req.query.search?.trim() || '';
        const status  = req.query.status || '';
        const type    = req.query.type || '';
        const genre   = req.query.genre || '';
        const year    = parseInt(req.query.year) || 0;
        const popular = req.query.popular === 'true';

        const ALLOWED_SORTS = {
            'rating': 'rating_avg DESC',
            'new': 'created_at DESC',
            'year': 'year DESC',
            'views': 'views DESC',
            'title': 'title ASC',
        };
        const sortKey = req.query.sort || 'new';
        const sortClause = ALLOWED_SORTS[sortKey] || ALLOWED_SORTS['new'];

        let conditions = [];
        let params = [];
        let idx = 1;

        if (search) {
            conditions.push(`(title ILIKE $${idx} OR title_en ILIKE $${idx})`);
            params.push(`%${search}%`); idx++;
        }
        if (status) {
            conditions.push(`status = $${idx}`); params.push(status); idx++;
        }
        if (type) {
            conditions.push(`type = $${idx}`); params.push(type); idx++;
        }
        if (genre) {
            conditions.push(`$${idx} = ANY(genres)`); params.push(genre); idx++;
        }
        if (year) {
            conditions.push(`year = $${idx}`); params.push(year); idx++;
        }
        if (popular) {
            conditions.push(`is_popular = true`);
        }

        const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const countResult = await db.query(
            `SELECT COUNT(*) FROM anime ${whereClause}`, params
        );
        const total = parseInt(countResult.rows[0].count);

        // Fetch with user's bookmark status if authenticated
        let selectExtra = '';
        let extraParams = [];
        if (req.user) {
            extraParams = [req.user.id];
            selectExtra = `, (SELECT status FROM bookmarks WHERE user_id = $${idx} AND anime_id = a.id) AS bookmark_status`;
            idx++;
        }

        const { rows } = await db.query(
            `SELECT a.id, a.title, a.title_ru, a.title_en, a.status, a.type, a.genres, a.year,
                    a.season, a.episodes, a.episode_duration, a.studios, a.rating_avg, a.rating_count,
                    a.views, a.is_popular, a.poster_url, a.banner_url, a.created_at ${selectExtra}
             FROM anime a ${whereClause}
             ORDER BY ${sortClause}
             LIMIT $${idx} OFFSET $${idx + 1}`,
            [...params, ...extraParams, limit, offset]
        );

        res.json({
            data: rows,
            pagination: {
                page, limit, total,
                pages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1,
            }
        });
    } catch (err) {
        console.error('GET /anime error:', err);
        res.status(500).json({ error: 'Failed to fetch anime' });
    }
});

// ======================== GET /api/anime/:id ========================
router.get('/:id', authOptional, async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT a.*,
                    u.username AS created_by_username,
                    (SELECT json_agg(row)
                     FROM (SELECT json_build_object('id', c.id, 'text', c.text, 'created_at', c.created_at,
                                                    'username', cu.username, 'avatar', cu.avatar) AS row
                           FROM comments c JOIN users cu ON cu.id = c.user_id
                           WHERE c.anime_id = a.id AND c.is_deleted = false
                           ORDER BY c.created_at DESC LIMIT 5) sub) AS recent_comments
             FROM anime a
             LEFT JOIN users u ON u.id = a.created_by
             WHERE a.id = $1`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Anime not found' });

        // Increment view counter
        db.query('UPDATE anime SET views = views + 1 WHERE id = $1', [req.params.id]).catch(() => {});

        let result = rows[0];
        // Attach user's bookmark & rating if authenticated
        if (req.user) {
            const [bm, rt] = await Promise.all([
                db.query('SELECT status, episodes_watched FROM bookmarks WHERE user_id = $1 AND anime_id = $2', [req.user.id, req.params.id]),
                db.query('SELECT score FROM ratings WHERE user_id = $1 AND anime_id = $2', [req.user.id, req.params.id]),
            ]);
            result.user_bookmark = bm.rows[0] || null;
            result.user_rating = rt.rows[0]?.score || null;
        }

        res.json(result);
    } catch (err) {
        console.error('GET /anime/:id error:', err);
        res.status(500).json({ error: 'Failed to fetch anime' });
    }
});

// ======================== POST /api/anime (admin) ========================
router.post('/', authRequired, adminOnly, [
    body('title').trim().notEmpty().isLength({ max: 500 }),
    body('status').isIn(['ongoing', 'completed', 'announced', 'dropped']),
    body('type').optional().isIn(['tv', 'movie', 'ova', 'ona', 'special']),
    body('year').optional().isInt({ min: 1960, max: 2100 }),
    body('episodes').optional().isInt({ min: 1 }),
], async (req, res) => {
    if (!validateRequest(req, res)) return;
    try {
        const {
            title, title_en, title_alt, description, episodes, episode_duration,
            status, type, genres, studios, year, season, is_popular,
            poster_url, banner_url, trailer_url
        } = req.body;
        const { rows } = await db.query(
            `INSERT INTO anime (title, title_en, title_alt, description, episodes, episode_duration,
                                status, type, genres, studios, year, season, is_popular,
                                poster_url, banner_url, trailer_url, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             RETURNING *`,
            [title, title_en, title_alt || [], description, episodes, episode_duration,
             status || 'ongoing', type || 'tv', genres || [], studios || [],
             year, season, is_popular || false, poster_url, banner_url, trailer_url, req.user.id]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('POST /anime error:', err);
        res.status(500).json({ error: 'Failed to create anime' });
    }
});

// ======================== PUT /api/anime/:id (admin) ========================
router.put('/:id', authRequired, adminOnly, async (req, res) => {
    try {
        const fields = ['title','title_en','title_alt','description','episodes','episode_duration',
                        'status','type','genres','studios','year','season','is_popular',
                        'poster_url','banner_url','trailer_url'];
        const updates = [];
        const values = [];
        let idx = 1;
        for (const field of fields) {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = $${idx}`);
                values.push(req.body[field]);
                idx++;
            }
        }
        if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
        updates.push(`updated_at = NOW()`);
        values.push(req.params.id);
        const { rows } = await db.query(
            `UPDATE anime SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );
        if (!rows[0]) return res.status(404).json({ error: 'Anime not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error('PUT /anime/:id error:', err);
        res.status(500).json({ error: 'Failed to update anime' });
    }
});

// ======================== DELETE /api/anime/:id (admin) ========================
router.delete('/:id', authRequired, adminOnly, async (req, res) => {
    try {
        const { rows } = await db.query('DELETE FROM anime WHERE id = $1 RETURNING id', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Anime not found' });
        res.json({ message: 'Anime deleted' });
    } catch (err) {
        console.error('DELETE /anime/:id error:', err);
        res.status(500).json({ error: 'Failed to delete anime' });
    }
});

module.exports = router;
