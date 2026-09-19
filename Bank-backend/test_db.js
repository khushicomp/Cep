require('dotenv').config();
const mysql = require('mysql2');
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.query('SELECT * FROM daily_business_entries', (err, results) => {
    if (err) console.error("Database utility operation failed");
    console.log("=== ENTRIES ===");
    console.log("Database query completed");

    db.query('SELECT * FROM daily_business_items', (err2, results2) => {
        if (err2) console.error("Database utility operation failed");
        console.log("=== ITEMS ===");
        console.log("Database query completed");
        process.exit();
    });
});
