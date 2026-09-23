function credentialConfig(env = process.env) {
    const integer = (key, fallback, min, max) => {
        const value = env[key] === undefined || env[key] === '' ? String(fallback) : env[key];
        if (!/^\d+$/.test(value) || +value < min || +value > max) throw new Error(`Invalid ${key}`);
        return +value;
    };
    return {
        setupSeconds: integer('SETUP_TOKEN_SECONDS', 86400, 900, 86400),
        resetSeconds: integer('RESET_TOKEN_SECONDS', 1800, 300, 3600),
        bcryptCost: integer('PASSWORD_BCRYPT_COST', 12, 10, 14)
    };
}
module.exports = { credentialConfig };
