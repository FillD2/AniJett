const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

// ======================== GET /api/push/vapid-public-key ========================
// Frontend needs the public VAPID key to subscribe
router.get('/vapid-public-key', (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(503).json({ error: 'Push notifications not configured' });
    res.json({ publicKey: key });
});

// ======================== POST /api/push/subscribe ========================
router.post('/subscribe', authRequired, [
    body('subscription').isObject(),
    body('subscription.endpoint').isURL(),
    body('subscription.keys.p256dh').notEmpty(),
    body('subscription.keys.auth').notEmpty(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid subscription', details: errors.array() });

    const { endpoint, keys, expirationTime } = req.body.subscription;
    const userAgent = req.headers['user-agent']?.slice(0, 200) || '';

    try {
        await db.query(
            `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (endpoint) DO UPDATE
             SET user_id = $1, p256dh = $3, auth_key = $4, user_agent = $5`,
            [req.user.id, endpoint, keys.p256dh, keys.auth, userAgent]
        );
        res.json({ message: 'Subscribed to push notifications' });
    } catch (err) {
        console.error('Push subscribe error:', err);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

// ======================== DELETE /api/push/unsubscribe ========================
router.delete('/unsubscribe', authRequired, async (req, res) => {
    const { endpoint } = req.body;
    try {
        if (endpoint) {
            await db.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user.id, endpoint]);
        } else {
            await db.query('DELETE FROM push_subscriptions WHERE user_id = $1', [req.user.id]);
        }
        res.json({ message: 'Unsubscribed' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

module.exports = router;
