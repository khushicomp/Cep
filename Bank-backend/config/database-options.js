const { isIP } = require('node:net');
const { X509Certificate } = require('node:crypto');

// Preserve the reviewed India-local report DATETIME / audit display convention.
// Credential DATETIME(6) values remain UTC through explicit SQL UTC functions.
const SESSION_SQL = "SET SESSION time_zone = '+05:30'";
function databaseOptions(env = process.env) {
    const fail = () => { throw new Error('Invalid database connection configuration'); };
    const mode = env.DB_SSL_MODE || 'disabled';
    if (!['disabled', 'verify'].includes(mode) ||
        ((env.NODE_ENV === 'production' || env.DEPLOYMENT_ENV === 'staging') && mode !== 'verify') ||
        (env.DB_TIMEZONE && env.DB_TIMEZONE !== '+05:30') ||
        (env.DB_PORT && (!/^\d+$/.test(env.DB_PORT) || +env.DB_PORT < 1 || +env.DB_PORT > 65535)) ||
        env.DB_SSL_REJECT_UNAUTHORIZED !== undefined || env.DB_SSL_VERIFY_IDENTITY !== undefined) fail();
    const options = { host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASSWORD,
        database: env.DB_NAME, port: Number(env.DB_PORT || 3306), timezone: '+05:30',
        connectTimeout: 10000, multipleStatements: false, enableKeepAlive: true };
    if (mode === 'disabled') {
        if (env.DB_SSL_CA) fail();
    } else {
        if (!env.DB_HOST || isIP(env.DB_HOST) || env.DB_HOST.length > 253 ||
            !env.DB_HOST.split('.').every(label => /^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) fail();
        try {
            const ca = env.DB_SSL_CA;
            if (typeof ca !== 'string' || /PRIVATE KEY/.test(ca)) fail();
            const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
            if (!certificates?.length || ca.replace(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g, '').trim()) fail();
            certificates.forEach(value => new X509Certificate(value));
            options.ssl = { ca, rejectUnauthorized: true, verifyIdentity: true };
        } catch { fail(); }
    }
    return options;
}
async function openConnection(env = process.env) {
    let connection;
    try {
        connection = await require('mysql2/promise').createConnection({ ...databaseOptions(env), dateStrings: true });
        await connection.query({ sql: SESSION_SQL, timeout: 10000 });
        return connection;
    } catch {
        if (connection) connection.destroy();
        throw new Error('Database connection initialization failed');
    }
}
function initializePool(pool) {
    const initialized = new WeakSet();
    const acquire = pool.getConnection.bind(pool);
    // Pool query/execute and promise wrappers all acquire through this method.
    pool.getConnection = callback => acquire((error, connection) => {
        if (error) return callback(error);
        if (initialized.has(connection)) return callback(null, connection);
        connection.query({ sql: SESSION_SQL, timeout: 10000 }, error => {
            if (error) {
                connection.destroy();
                return callback(new Error('Database session initialization failed'));
            }
            initialized.add(connection);
            callback(null, connection);
        });
    });
    return pool;
}
module.exports = { databaseOptions, openConnection, initializePool, SESSION_SQL };
