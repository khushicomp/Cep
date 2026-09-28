const mysql = require("mysql2");
const { databaseOptions, initializePool } = require('./database-options');

// Callback-compatible pool: existing db.query(sql, values, callback) calls remain valid.
const db = mysql.createPool({
    ...databaseOptions(),
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 100,
    connectTimeout: 10000,
    enableKeepAlive: true
});

initializePool(db);

module.exports=db;
