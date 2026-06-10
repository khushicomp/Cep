require("dotenv").config();
const mysql = require("mysql2/promise");

async function runMigrations() {
    let connection;
    try {
        console.log("Connecting securely to the database...");    
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: true
        });

        console.log("Running Schema Migrations for Users, Tasks, and Entries...");

        // USERS: Add fields
        try {
            await connection.query(`
                ALTER TABLE users 
                ADD COLUMN branch_code VARCHAR(20) NULL,
                ADD COLUMN branch_name VARCHAR(150) NULL,
                ADD COLUMN phone VARCHAR(20) NULL,
                ADD COLUMN joining_date DATE NULL,
                ADD COLUMN is_active TINYINT(1) DEFAULT 1,
                ADD COLUMN can_view_own_branch TINYINT(1) DEFAULT 1,
                ADD COLUMN can_view_all_branches TINYINT(1) DEFAULT 0,
                ADD COLUMN can_edit_reports TINYINT(1) DEFAULT 0,
                ADD COLUMN can_delete_reports TINYINT(1) DEFAULT 0;
            `);
            console.log("Added new columns to users table.");
        } catch (e) {
            console.log("Users alter error (might exist already):", e.message);
        }

        // DAILY BUSINESS ENTRIES: Add fields
        try {
            await connection.query(`
                ALTER TABLE daily_business_entries 
                ADD COLUMN branch_code VARCHAR(20) NULL,
                ADD COLUMN branch_name VARCHAR(150) NULL,
                ADD COLUMN manager_name VARCHAR(100) NULL,
                ADD COLUMN total_entries INT DEFAULT 0,
                ADD COLUMN submitted_at DATETIME NULL;
            `);
            console.log("Added new columns to daily_business_entries table.");
        } catch (e) {
            console.log("Entries alter error:", e.message);
        }

        // TASKS: Add fields
        try {
            await connection.query(`
                ALTER TABLE tasks 
                ADD COLUMN branch_id INT NULL,
                ADD COLUMN branch_code VARCHAR(20) NULL,
                ADD COLUMN branch_name VARCHAR(150) NULL,
                ADD COLUMN description TEXT NULL,
                ADD COLUMN priority VARCHAR(20) DEFAULT 'medium',
                ADD COLUMN due_date DATE NULL,
                ADD COLUMN status VARCHAR(20) DEFAULT 'pending',
                ADD COLUMN completed_at DATETIME NULL,
                ADD COLUMN time_spent INT DEFAULT 0;
            `);
            console.log("Added new columns to tasks table.");
        } catch (e) {
            console.log("Tasks alter error:", e.message);
        }

        // Now, let's sync up existing users with branch_code and branch_name from branches table
        console.log("Syncing users with branch_code and branch_name...");
        await connection.query(`
            UPDATE users u
            JOIN branches b ON u.branch_id = b.branch_id
            SET u.branch_code = b.branch_code, u.branch_name = b.branch_name;
        `);
        
        // Sync Admin permissions
        await connection.query(`
            UPDATE users SET can_view_all_branches = 1 WHERE role = 'ADMIN';
        `);

        // Set all branches constraint if it's the admin office (AUCB001)
        await connection.query(`
            UPDATE users SET can_view_all_branches = 1 WHERE branch_code = 'AUCB001';
        `);

        // Sync Tasks with Branch Info from the manager who assigned them
        await connection.query(`
            UPDATE tasks t
            JOIN users u ON t.assigned_by = u.user_id
            SET t.branch_id = u.branch_id, t.branch_code = u.branch_code, t.branch_name = u.branch_name;
        `);

        console.log("Migrations applied successfully!");
        
    } catch (err) {
        console.error("Migration unexpected error:", err);
    } finally {
        if(connection) {
            await connection.end();
            console.log("Database connection closed.");
        }
    }
}

runMigrations();
