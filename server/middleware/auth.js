const jwt = require('jsonwebtoken');
const db = require('../db');

// ======================== ENV VALIDATION ========================
// Fail fast — never run with missing or insecure JWT secrets.
(function validateSecrets() {
    const missing = [];
    if (!process.env.JWT_SECRET)         missing.push('JWT_SECRET');
    if (!process.env.JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');

    if (missing.length) {
        console.error(`\n❌ FATAL: Missing required environment variables: ${missing.join(', ')}`);
        console.error('   Set them as Replit secrets, then restart the server.');
        console.error("   Generate strong values: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"");
        process.exit(1);
    }

    for (const [name, val] of [
        ['JWT_SECRET', process.env.JWT_SECRET],
        ['JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET],
    ]) {
        if (val.length < 32) {
            console.error(`\n❌ FATAL: ${name} is too short (minimum 32 characters).`);
            console.error("   Generate a strong value: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"");
            process.exit(1);
        }
    }
})();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_EXPIRES_IN = '15m';
const JWT_REFRESH_EXPIRES_IN = '7d';

/**
 * Generate access + refresh token pair for a user.
 * @param {string} userId
 */
const generateTokens = (userId) => {
    const accessToken  = jwt.sign({ userId }, JWT_SECRET,         { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
    return { accessToken, refreshToken };
};

/**
 * Require a valid JWT — attaches req.user or returns 401/403.
 */
const authRequired = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.slice(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { rows } = await db.query(
            'SELECT id, username, email, role, avatar, bio, is_active FROM users WHERE id = $1',
            [decoded.userId]
        );
        if (!rows[0])           return res.status(401).json({ error: 'User not found' });
        if (!rows[0].is_active) return res.status(403).json({ error: 'Account is disabled' });
        req.user = rows[0];
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
};

/**
 * Optional auth — attaches req.user if a valid token is present, otherwise continues.
 */
const authOptional = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();
    const token = authHeader.slice(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { rows } = await db.query(
            'SELECT id, username, email, role, avatar FROM users WHERE id = $1 AND is_active = true',
            [decoded.userId]
        );
        if (rows[0]) req.user = rows[0];
    } catch {
        // Invalid / expired token is silently ignored for optional auth
    }
    next();
};

/**
 * Moderator-or-admin guard — use after authRequired.
 */
const adminOnly = (req, res, next) => {
    if (!req.user || !['admin', 'moderator'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
};

/**
 * Strict admin-only guard — use after authRequired.
 */
const strictAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

module.exports = {
    authRequired,
    authOptional,
    adminOnly,
    strictAdmin,
    generateTokens,
    JWT_SECRET,
    JWT_REFRESH_SECRET,
};
