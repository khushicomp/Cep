require("dotenv").config();
const mysql = require("mysql2");

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err);
        process.exit(1);
    }
    console.log("Connected to database. Creating tables...");

    const createEntriesTable = `
        CREATE TABLE IF NOT EXISTS daily_business_entries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            branch_id INT NOT NULL,
            manager_id INT NOT NULL,
            entry_date DATE NOT NULL,
            total_amount DECIMAL(15, 2) DEFAULT 0,
            status VARCHAR(50) DEFAULT 'draft',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );
    `;

    const createItemsTable = `
        CREATE TABLE IF NOT EXISTS daily_business_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            entry_id INT NOT NULL,
            sr_no INT NOT NULL,
            account_type VARCHAR(100) NOT NULL,
            status VARCHAR(50) NOT NULL,
            amount DECIMAL(15, 2) DEFAULT 0,
            remark TEXT,
            FOREIGN KEY (entry_id) REFERENCES daily_business_entries(id) ON DELETE CASCADE
        );
    `;

    db.query(createEntriesTable, (err1) => {
        if (err1) {
            console.error("Error creating daily_business_entries:", err1);
            db.end();
            process.exit(1);
        }
        console.log("Table daily_business_entries created or already exists.");

        db.query(createItemsTable, (err2) => {
            if (err2) {
                console.error("Error creating daily_business_items:", err2);
            } else {
                console.log("Table daily_business_items created or already exists.");
            }
            db.end();
            process.exit(0);
        });
    });
});
