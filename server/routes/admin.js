/**
 * Admin Routes — Anime Auto-Import from Jikan (MyAnimeList) API
 * No API key needed. Rate limit: 3 req/s, 60/min.
 */
const router = require('express').Router();
const db = require('../db');
const { authRequired, adminOnly } = require('../middleware/auth');

router.use(authRequired, adminOnly);

const JIKAN = 'https://api.jikan.moe/v4';

// Jikan status → our status
const mapStatus = (s) => {
    if (!s) return 'ongoing';
    const lower = s.toLowerCase();
    if (lower.includes('finished') || lower.includes('completed')) return 'completed';
    if (lower.includes('airing') || lower.includes('ongoing'))     return 'ongoing';
    if (lower.includes('not yet'))                                  return 'announced';
    return 'ongoing';
};

// Jikan type → our type
const mapType = (t) => {
    if (!t) return 'tv';
    const m = { tv: 'tv', movie: 'movie', ova: 'ova', ona: 'ona', special: 'special' };
    return m[t.toLowerCase()] || 'tv';
};

// Jikan season → our season
const mapSeason = (s) => {
    const valid = ['winter','spring','summer','fall'];
    return valid.includes(s?.toLowerCase()) ? s.toLowerCase() : null;
};

// Map Jikan anime object → our schema
const mapAnime = (item) => ({
    title:            item.title || '',
    title_en:         item.title_english || item.title || '',
    title_alt:        [item.title_japanese].filter(Boolean),
    description:      item.synopsis || '',
    episodes:         item.episodes || null,
    episode_duration: item.duration ? parseInt(item.duration) || null : null,
    status:           mapStatus(item.status),
    type:             mapType(item.type),
    genres:           (item.genres || []).map(g => g.name),
    studios:          (item.studios || []).map(s => s.name),
    year:             item.year || (item.aired?.prop?.from?.year) || null,
    season:           mapSeason(item.season),
    is_popular:       (item.score || 0) >= 8 || (item.members || 0) >= 200000,
    rating_avg:       item.score ? parseFloat(item.score) : 0,
    poster_url:       item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
    banner_url:       null,
    trailer_url:      item.trailer?.url || null,
    mal_id:           item.mal_id,
});

// Insert or update anime from Jikan data
const upsertAnime = async (data, createdBy) => {
    const {
        title, title_en, title_alt, description, episodes, episode_duration,
        status, type, genres, studios, year, season, is_popular,
        rating_avg, poster_url, trailer_url,
    } = data;
    const { rows } = await db.query(
        `INSERT INTO anime (title, title_en, title_alt, description, episodes, episode_duration,
                            status, type, genres, studios, year, season, is_popular,
                            rating_avg, poster_url, trailer_url, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT DO NOTHING
         RETURNING id, title`,
        [title, title_en, title_alt || [], description, episodes, episode_duration,
         status, type, genres || [], studios || [], year, season, is_popular,
         rating_avg, poster_url, trailer_url, createdBy]
    );
    return rows[0] || null;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ======================== GET /api/admin/anime/search ========================
// Search Jikan — preview results without importing
router.get('/anime/search', async (req, res) => {
    const q      = req.query.q?.trim();
    const page   = parseInt(req.query.page) || 1;
    const limit  = Math.min(25, parseInt(req.query.limit) || 10);

    if (!q) return res.status(400).json({ error: 'Query parameter "q" required' });

    try {
        const url = `${JIKAN}/anime?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}&sfw=true`;
        const fetch = (await import('node-fetch')).default;
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });

        if (!resp.ok) {
            const errText = await resp.text();
            return res.status(502).json({ error: 'Jikan API error', details: errText });
        }

        const json = await resp.json();
        const results = (json.data || []).map(item => ({
            mal_id:      item.mal_id,
            title:       item.title,
            title_en:    item.title_english,
            type:        item.type,
            status:      item.status,
            episodes:    item.episodes,
            year:        item.year,
            score:       item.score,
            poster_url:  item.images?.jpg?.image_url,
            genres:      (item.genres || []).map(g => g.name),
        }));

        res.json({ data: results, pagination: json.pagination });
    } catch (err) {
        console.error('Admin search error:', err);
        res.status(500).json({ error: 'Failed to search Jikan API', details: err.message });
    }
});

// ======================== POST /api/admin/anime/import/search ========================
// Import anime by search query (imports top results)
router.post('/anime/import/search', async (req, res) => {
    const { q, limit = 10 } = req.body;
    if (!q) return res.status(400).json({ error: 'Query "q" required' });

    try {
        const fetch = (await import('node-fetch')).default;
        const url = `${JIKAN}/anime?q=${encodeURIComponent(q)}&limit=${Math.min(25, limit)}&sfw=true`;
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!resp.ok) return res.status(502).json({ error: 'Jikan API error' });

        const json = await resp.json();
        const imported = [], skipped = [];

        for (const item of json.data || []) {
            const mapped = mapAnime(item);
            const result = await upsertAnime(mapped, req.user.id);
            if (result) imported.push({ id: result.id, title: result.title });
            else skipped.push(mapped.title);
            await sleep(400); // respect rate limit
        }

        res.json({ imported, skipped, total_imported: imported.length });
    } catch (err) {
        console.error('Import search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ======================== POST /api/admin/anime/import/top ========================
// Import top anime from MyAnimeList (by score)
router.post('/anime/import/top', async (req, res) => {
    const { page = 1, limit = 25 } = req.body;

    try {
        const fetch = (await import('node-fetch')).default;
        const url = `${JIKAN}/top/anime?page=${page}&limit=${Math.min(25, limit)}`;
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!resp.ok) return res.status(502).json({ error: 'Jikan API error' });

        const json = await resp.json();
        const imported = [], skipped = [];

        for (const item of json.data || []) {
            const mapped = mapAnime(item);
            const result = await upsertAnime(mapped, req.user.id);
            if (result) imported.push({ id: result.id, title: result.title });
            else skipped.push(mapped.title);
            await sleep(400);
        }

        res.json({ imported, skipped, total_imported: imported.length });
    } catch (err) {
        console.error('Import top error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ======================== POST /api/admin/anime/import/seasonal ========================
// Import current/specific season
router.post('/anime/import/seasonal', async (req, res) => {
    const { year, season, limit = 25 } = req.body;

    try {
        const fetch = (await import('node-fetch')).default;
        let url;
        if (year && season) {
            url = `${JIKAN}/seasons/${year}/${season}?limit=${Math.min(25, limit)}`;
        } else {
            url = `${JIKAN}/seasons/now?limit=${Math.min(25, limit)}`;
        }

        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!resp.ok) return res.status(502).json({ error: 'Jikan API error' });

        const json = await resp.json();
        const imported = [], skipped = [];

        for (const item of json.data || []) {
            const mapped = mapAnime(item);
            const result = await upsertAnime(mapped, req.user.id);
            if (result) imported.push({ id: result.id, title: result.title });
            else skipped.push(mapped.title);
            await sleep(400);
        }

        res.json({ imported, skipped, total_imported: imported.length, season: season || 'current' });
    } catch (err) {
        console.error('Import seasonal error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ======================== GET /api/admin/stats ========================
router.get('/stats', async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT
                (SELECT COUNT(*) FROM anime)         AS anime_total,
                (SELECT COUNT(*) FROM users)         AS users_total,
                (SELECT COUNT(*) FROM comments WHERE is_deleted = false) AS comments_total,
                (SELECT COUNT(*) FROM bookmarks)     AS bookmarks_total,
                (SELECT COUNT(*) FROM ratings)       AS ratings_total,
                (SELECT COUNT(*) FROM subscriptions) AS subscriptions_total
        `);
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

module.exports = router;
