const webpush = require('web-push');
const db = require('../db');

const initVapid = () => {
    const publicKey  = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject    = process.env.VAPID_SUBJECT || 'mailto:admin@anijett.ru';
    if (publicKey && privateKey) {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        return true;
    }
    return false;
};

initVapid();

/**
 * Send a push notification + create an in-app notification for a user.
 * Fire-and-forget safe: errors are caught and logged.
 *
 * @param {string} userId
 * @param {{ type: string, title: string, message: string, data?: object }} payload
 */
const sendNotification = async (userId, { type, title, message, data = {} }) => {
    // 1. Create in-app notification record
    try {
        await db.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, type, title, message, JSON.stringify(data)]
        );
    } catch (err) {
        console.error('[push] Failed to create in-app notification:', err.message);
    }

    // 2. Send browser push notifications (skip if VAPID not configured)
    if (!process.env.VAPID_PUBLIC_KEY) return;

    let rows;
    try {
        ({ rows } = await db.query(
            'SELECT id, endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id = $1',
            [userId]
        ));
    } catch (err) {
        console.error('[push] Failed to fetch subscriptions:', err.message);
        return;
    }

    const payload = JSON.stringify({ title, body: message, data, icon: '/icons/icon-192.png' });

    await Promise.allSettled(
        rows.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
                    payload
                );
            } catch (err) {
                // Subscription expired or gone — clean it up
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await db.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {});
                }
            }
        })
    );
};

/**
 * Parse @mentions from comment text and notify mentioned users.
 * Fixed N+1: fetches author once, then batches user lookups.
 *
 * @param {string} text - Comment text
 * @param {string} authorId - ID of the comment author
 * @param {{ animeId?: string, commentId?: string }} context
 * @returns {Promise<string[]>} Array of mentioned user IDs
 */
const processMentions = async (text, authorId, { animeId, commentId } = {}) => {
    const raw = text.match(/@([\wа-яёА-ЯЁ\d_]+)/giu) || [];
    const usernames = [...new Set(raw.map(m => m.slice(1).toLowerCase()))];
    if (!usernames.length) return [];

    // Fetch author name once (not inside the loop)
    const { rows: authorRows } = await db.query(
        'SELECT username FROM users WHERE id = $1',
        [authorId]
    );
    const authorName = authorRows[0]?.username || 'Someone';

    // Fetch all mentioned users in one query
    const { rows: mentionedUsers } = await db.query(
        `SELECT id, username FROM users
         WHERE LOWER(username) = ANY($1) AND id != $2 AND is_active = true`,
        [usernames, authorId]
    );

    if (!mentionedUsers.length) return [];

    // Send notifications in parallel
    await Promise.allSettled(
        mentionedUsers.map(user =>
            sendNotification(user.id, {
                type:    'mention',
                title:   'Вас упомянули',
                message: `${authorName} упомянул вас в комментарии`,
                data:    { animeId, commentId },
            })
        )
    );

    return mentionedUsers.map(u => u.id);
};

module.exports = { sendNotification, processMentions, initVapid };
