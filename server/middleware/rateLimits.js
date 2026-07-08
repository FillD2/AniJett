/**
 * Centralized rate limiters for AniJett API.
 * Import and apply in index.js / individual routes as needed.
 */
const rateLimit = require('express-rate-limit');

const W15 = 15 * 60 * 1000; // 15 minutes
const W1H = 60 * 60 * 1000; // 1 hour

const make = (windowMs, max, message) =>
    rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: message },
    });

module.exports = {
    /** General API limiter: 300 req / 15 min */
    apiLimiter: make(W15, 300, 'Too many requests, please try again later.'),

    /** Login / Register — 15 req / 15 min */
    authLimiter: make(W15, 15, 'Too many auth attempts, please try again later.'),

    /** Send verification code — 5 req / 15 min (brute-force / spam protection) */
    sendCodeLimiter: make(W15, 5, 'Too many code requests. Please wait before requesting another code.'),

    /** Verify code — 10 req / 15 min */
    verifyCodeLimiter: make(W15, 10, 'Too many verification attempts. Please try again later.'),

    /** Token refresh — 30 req / 15 min */
    refreshLimiter: make(W15, 30, 'Too many token refresh attempts. Please try again later.'),

    /** Comment posting — 20 req / 15 min */
    commentLimiter: make(W15, 20, 'You are posting comments too fast. Please slow down.'),

    /** Comment reactions — 60 req / 15 min */
    reactionLimiter: make(W15, 60, 'Too many reaction requests. Please slow down.'),

    /** Password recovery / code resend — 3 req / hour */
    recoveryLimiter: make(W1H, 3, 'Too many recovery attempts. Please wait before trying again.'),
};
