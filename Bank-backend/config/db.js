const mysql = require("mysql2");

// Callback-compatible pool: existing db.query(sql, values, callback) calls remain valid.
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 100,
    connectTimeout: 10000,
    enableKeepAlive: true
});

module.exports=db;
