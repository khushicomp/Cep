require("dotenv").config();
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

async function seedTestUsers() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash("Test@123", salt);

        const testUsers = [
            { name: "Admin User", email: "admin@akolaurban.bank.in", password: hash, role: "ADMIN", branch_id: 1, phone: "9999999999", joining_date: new Date(), is_active: 1, can_view_all_branches: 1 },
            { name: "Pune Manager", email: "manager.pune@akolaurban.bank.in", password: hash, role: "MANAGER", branch_id: 37, phone: "8888888888", joining_date: new Date(), is_active: 1, can_view_all_branches: 0 },
            { name: "Mumbai Manager", email: "manager.mumbai@akolaurban.bank.in", password: hash, role: "MANAGER", branch_id: 21, phone: "8888888887", joining_date: new Date(), is_active: 1, can_view_all_branches: 0 },
            { name: "Akola Manager", email: "manager.akola@akolaurban.bank.in", password: hash, role: "MANAGER", branch_id: 2, phone: "7777777777", joining_date: new Date(), is_active: 1, can_view_all_branches: 0 }
        ];

        console.log("Seeding test users...");
        for (const user of testUsers) {
             const [existing] = await connection.query("SELECT * FROM users WHERE email = ?", [user.email]);
             if (existing.length === 0) {
                 await connection.query(`
                    INSERT INTO users (name, email, password, role, branch_id, phone, joining_date, is_active, can_view_all_branches) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 `, [user.name, user.email, user.password, user.role, user.branch_id, user.phone, user.joining_date, user.is_active, user.can_view_all_branches]);
             }
        }
        console.log("Test users created successfully! Password for all is: Test@123");
        console.log("For full branch/employee seeding, use: node scripts/seed-all-users.js");
        
    } catch (err) {
        console.error("Error setting up users:", err);
    } finally {
        if(connection) await connection.end();
    }
}
seedTestUsers();
