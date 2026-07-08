require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const db = require('./db');
const {
    apiLimiter,
    authLimiter,
    sendCodeLimiter,
    verifyCodeLimiter,
    refreshLimiter,
} = require('./middleware/rateLimits');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Replit's proxy (needed for rate limiting and real IPs)
app.set('trust proxy', 1);

// ======================== SECURITY HEADERS ========================
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
}));

// ======================== CORS ========================
app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

// ======================== RATE LIMITING ========================
app.use('/api/', apiLimiter);
app.use('/api/auth/login',       authLimiter);
app.use('/api/auth/register',    authLimiter);
app.use('/api/auth/send-code',   sendCodeLimiter);
app.use('/api/auth/verify-code', verifyCodeLimiter);
app.use('/api/auth/refresh',     refreshLimiter);

// ======================== BODY PARSING ========================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ======================== API ROUTES ========================
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/anime',         require('./routes/anime'));
app.use('/api/bookmarks',     require('./routes/bookmarks'));
app.use('/api/comments',      require('./routes/comments'));
app.use('/api/ratings',       require('./routes/ratings'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/push',          require('./routes/push'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/episodes',      require('./routes/episodes'));

// ======================== HEALTH CHECK ========================
app.get('/api/health', async (req, res) => {
    let dbOk = false;
    try {
        await db.query('SELECT 1');
        dbOk = true;
    } catch {}
    res.json({
        status: 'ok',
        db: dbOk ? 'connected' : 'error',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
    });
});

// ======================== STATIC SPA ========================
const staticRoot = path.join(__dirname, '..');
app.use(express.static(staticRoot, {
    index: false,
    maxAge: 0,
    etag: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    },
}));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(staticRoot, 'index.html'));
});

// ======================== GLOBAL ERROR HANDLER ========================
app.use((err, req, res, next) => {
    const isProd = process.env.NODE_ENV === 'production';
    console.error('[ERROR]', isProd ? err.message : (err.stack || err.message));
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
        error: isProd ? 'Internal server error' : (err.message || 'Internal server error'),
    });
});

// ======================== START ========================
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n🚀 AniJett server running at http://0.0.0.0:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

    try {
        await db.query('SELECT NOW()');
        console.log('   Database: connected ✓');
    } catch (err) {
        console.error('   Database: connection failed ✗', err.message);
    }

    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        const webpush = require('web-push');
        webpush.setVapidDetails(
            process.env.VAPID_SUBJECT || 'mailto:admin@anijett.ru',
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
        console.log('   Push notifications: enabled ✓');
    } else {
        console.log('   Push notifications: disabled (set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY to enable)');
    }
});

module.exports = app;
