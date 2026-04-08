require('dotenv').config();
const mysql = require('mysql2');
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.query('SELECT * FROM daily_business_entries', (err, results) => {
    if (err) console.error(err);
    console.log("=== ENTRIES ===");
    console.log(JSON.stringify(results, null, 2));

    db.query('SELECT * FROM daily_business_items', (err2, results2) => {
        if (err2) console.error(err2);
        console.log("=== ITEMS ===");
        console.log(JSON.stringify(results2, null, 2));
        process.exit();
    });
});
