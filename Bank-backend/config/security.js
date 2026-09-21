const { isIP } = require('node:net');

function validateEnvironment(env = process.env) {
    const production = env.NODE_ENV === 'production';
    const errors = [];
    if (env.NODE_ENV && !['development', 'test', 'production'].includes(env.NODE_ENV)) errors.push('NODE_ENV must be development, test or production');
    if (production) {
        const secret = env.JWT_SECRET || '';
        if (secret.length < 64 || new Set(secret).size < 12 || /secret|changeme|placeholder|replace|example|development|test-only/i.test(secret) || /^(.{1,32})\1+$/.test(secret)) {
            errors.push('JWT_SECRET must be an explicitly configured high-entropy secret of at least 64 characters');
        }
        for (const key of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'CLIENT_URL']) {
            if (typeof env[key] !== 'string' || !env[key].trim()) errors.push(`${key} is required in production`);
        }
    }
    for (const key of ['PORT', 'DB_PORT']) {
        if (env[key] !== undefined && (!/^\d+$/.test(env[key]) || +env[key] < 1 || +env[key] > 65535)) errors.push(`${key} must be a valid port`);
    }
    const origins = (env.CLIENT_URL || (production ? '' : 'http://localhost:5173')).split(',').map(s => s.trim()).filter(Boolean);
    if (production && !origins.length) errors.push('CLIENT_URL must contain at least one allowed origin');
    for (const origin of origins) {
        try {
            const url = new URL(origin);
            if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:')) throw new Error();
        } catch { errors.push('CLIENT_URL must contain exact HTTP origins (HTTPS in production), without paths or wildcards'); }
    }
    const trustProxy = env.TRUST_PROXY ? env.TRUST_PROXY.split(',').map(s => s.trim()) : false;
    if (trustProxy) for (const value of trustProxy) {
        const [address, prefix, extra] = value.split('/');
        const version = isIP(address);
        if (!version || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || +prefix < 1 || +prefix > (version === 4 ? 32 : 128)))) errors.push('TRUST_PROXY must list explicit proxy IP addresses or restricted CIDRs');
    }
    if (errors.length) throw new Error(`Invalid security configuration: ${[...new Set(errors)].join('; ')}`);
    return { production, origins, trustProxy, port: Number(env.PORT || 5000) };
}

function corsOptions(origins) {
    return {
        credentials: false,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type'],
        origin(origin, done) {
            if (!origin || origins.includes(origin)) return done(null, true);
            const error = new Error('Origin not allowed'); error.status = 403; done(error);
        }
    };
}
module.exports = { validateEnvironment, corsOptions };
