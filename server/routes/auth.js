const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const db = require('../db');
const { authRequired, generateTokens, JWT_REFRESH_SECRET } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const { sendVerificationCode } = require('../utils/mailer');

const SALT_ROUNDS = 12;

// ======================== HELPERS ========================

/**
 * Hash a refresh token with SHA-256 before storing.
 * The raw token is sent to the client; only the hash lives in the DB.
 */
const hashToken = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');

/** Persist a hashed refresh token for a user. */
const saveRefreshToken = async (userId, refreshToken) => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [userId, hashToken(refreshToken), expiresAt]
    );
};

/** Generate a random 4-digit verification code. */
const generateCode = () => String(Math.floor(1000 + Math.random() * 9000));

// ======================== POST /api/auth/send-code ========================
// Sends a 4-digit verification code to email before registration.
router.post('/send-code', [
    body('email').isEmail().normalizeEmail().withMessage('Введите корректный email'),
], async (req, res) => {
    if (!validateRequest(req, res)) return;
    const { email } = req.body;

    try {
        // Reject if email already registered
        const { rows: existing } = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Этот email уже зарегистрирован' });
        }

        // DB-level rate limit: max 3 codes per email per hour
        const { rows: recent } = await db.query(
            `SELECT COUNT(*) AS cnt FROM email_verification
             WHERE email = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
            [email]
        );
        if (parseInt(recent[0].cnt) >= 3) {
            return res.status(429).json({ error: 'Слишком много попыток. Подождите час.' });
        }

        // Invalidate previous unused codes for this email
        await db.query(
            'UPDATE email_verification SET used = true WHERE email = $1 AND used = false',
            [email]
        );

        const code = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

        await db.query(
            'INSERT INTO email_verification (email, code, expires_at) VALUES ($1, $2, $3)',
            [email, code, expiresAt]
        );

        await sendVerificationCode(email, code);

        res.json({ message: 'Код отправлен на ваш email' });
    } catch (err) {
        console.error('[auth] send-code error:', err.message);
        res.status(500).json({ error: 'Не удалось отправить код. Проверьте email или попробуйте позже.' });
    }
});

// ======================== POST /api/auth/verify-code ========================
// Checks if a code is valid without consuming it.
router.post('/verify-code', [
    body('email').isEmail().normalizeEmail(),
    body('code').isLength({ min: 4, max: 6 }).withMessage('Введите код'),
], async (req, res) => {
    if (!validateRequest(req, res)) return;
    const { email, code } = req.body;
    try {
        const { rows } = await db.query(
            `SELECT id FROM email_verification
             WHERE email = $1 AND code = $2 AND used = false AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [email, code]
        );
        if (rows.length === 0) {
            return res.status(400).json({ error: 'Неверный или истёкший код' });
        }
        res.json({ valid: true });
    } catch (err) {
        console.error('[auth] verify-code error:', err.message);
        res.status(500).json({ error: 'Ошибка проверки кода' });
    }
});

// ======================== POST /api/auth/register ========================
router.post('/register', [
    body('username').trim().isLength({ min: 3, max: 50 }).matches(/^[a-zA-Zа-яА-Я0-9_]+$/u)
        .withMessage('Username: 3-50 символов, только буквы/цифры/подчёркивание'),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6, max: 100 })
        .withMessage('Пароль должен содержать не менее 6 символов'),
    body('code').isLength({ min: 4, max: 6 }).withMessage('Введите код подтверждения'),
], async (req, res) => {
    if (!validateRequest(req, res)) return;
    const { username, email, password, code } = req.body;
    try {
        // Verify email code
        const { rows: codeRows } = await db.query(
            `SELECT id FROM email_verification
             WHERE email = $1 AND code = $2 AND used = false AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [email, code]
        );
        if (codeRows.length === 0) {
            return res.status(400).json({ error: 'Неверный или истёкший код подтверждения' });
        }
        const verificationId = codeRows[0].id;

        // Check uniqueness
        const { rows: existing } = await db.query(
            'SELECT id FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Email или ник уже заняты' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const { rows } = await db.query(
            `INSERT INTO users (username, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, username, email, role, avatar, created_at`,
            [username, email, passwordHash]
        );
        const user = rows[0];

        // Mark code as used
        await db.query('UPDATE email_verification SET used = true WHERE id = $1', [verificationId]);

        const { accessToken, refreshToken } = generateTokens(user.id);
        await saveRefreshToken(user.id, refreshToken);

        // Welcome notification
        await db.query(
            `INSERT INTO notifications (user_id, type, title, message)
             VALUES ($1, 'system', 'Добро пожаловать!', $2)`,
            [user.id, `Привет, ${user.username}! Рады видеть тебя на AniJett.`]
        );

        res.status(201).json({ user, accessToken, refreshToken });
    } catch (err) {
        console.error('[auth] register error:', err.message);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ======================== POST /api/auth/login ========================
router.post('/login', [
    body('login').trim().notEmpty().withMessage('Email or username required'),
    body('password').notEmpty(),
], async (req, res) => {
    if (!validateRequest(req, res)) return;
    const { login, password } = req.body;
    try {
        const { rows } = await db.query(
            `SELECT id, username, email, password_hash, role, avatar, is_active
             FROM users WHERE email = $1 OR username = $1`,
            [login]
        );
        const user = rows[0];
        // Use generic message to avoid user enumeration
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        if (!user.is_active) return res.status(403).json({ error: 'Account is disabled' });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

        const { accessToken, refreshToken } = generateTokens(user.id);
        await saveRefreshToken(user.id, refreshToken);

        const { password_hash, ...safeUser } = user;
        res.json({ user: safeUser, accessToken, refreshToken });
    } catch (err) {
        console.error('[auth] login error:', err.message);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ======================== POST /api/auth/refresh ========================
router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    try {
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        const tokenHash = hashToken(refreshToken);

        const { rows } = await db.query(
            'SELECT id FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()',
            [tokenHash, decoded.userId]
        );
        if (!rows[0]) return res.status(401).json({ error: 'Invalid or expired refresh token' });

        // Rotate: delete old hash, issue new token pair
        await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
        const tokens = generateTokens(decoded.userId);
        await saveRefreshToken(decoded.userId, tokens.refreshToken);

        res.json(tokens);
    } catch (err) {
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

// ======================== POST /api/auth/logout ========================
router.post('/logout', async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        const tokenHash = hashToken(refreshToken);
        await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]).catch(() => {});
    }
    res.json({ message: 'Logged out' });
});

// ======================== GET /api/auth/me ========================
router.get('/me', authRequired, async (req, res) => {
    const { rows } = await db.query(
        `SELECT id, username, email, role, avatar, bio, created_at, last_login,
                (SELECT COUNT(*) FROM bookmarks WHERE user_id = $1) AS bookmark_count,
                (SELECT COUNT(*) FROM comments  WHERE user_id = $1 AND is_deleted = false) AS comment_count
         FROM users WHERE id = $1`,
        [req.user.id]
    );
    res.json(rows[0]);
});

module.exports = router;
