require("dotenv").config();
const mysql = require("mysql2");

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

const today = new Date().toISOString().split('T')[0];

console.log("Checking daily entries:");
db.query("SELECT * FROM daily_business_entries", (err, res) => {
    if (err) console.error(err);
    console.log(res);

    console.log("\nChecking branches:");
    db.query("SELECT * FROM branches", (err2, res2) => {
        if (err2) console.error(err2);
        console.log(res2);

        console.log("\nRunning Admin Query:");
        const sql = `
            SELECT 
                b.branch_id, 
                b.branch_name, 
                u.name as manager_name,
                COUNT(i.id) as total_entries,
                IFNULL(e.total_amount, 0) as total_amount,
                e.id as entry_id,
                e.status
            FROM branches b
            LEFT JOIN users u ON b.branch_id = u.branch_id AND u.role = 'MANAGER'
            LEFT JOIN daily_business_entries e ON b.branch_id = e.branch_id AND e.entry_date = ?
            LEFT JOIN daily_business_items i ON e.id = i.entry_id
            GROUP BY b.branch_id, e.id
        `;
        db.query(sql, [today], (err3, res3) => {
            if (err3) console.error(err3);
            console.log(res3);
            db.end();
            process.exit();
        });
    });
});
