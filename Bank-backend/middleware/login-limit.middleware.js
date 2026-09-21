const { rateLimit } = require('express-rate-limit');

function createLoginLimiter(options = {}) {
    return rateLimit({
        windowMs: 5 * 60 * 1000,
        limit: 30,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        // Default IPv6 subnet-aware IP key. Count successes too to cap total bcrypt work.
        message: { message: 'Too many login attempts. Please try again later.' },
        ...options
    });
}
module.exports = { createLoginLimiter };
