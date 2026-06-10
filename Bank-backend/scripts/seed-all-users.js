require("dotenv").config({ path: "../.env" }); // Assuming this is run from the scripts directory, but we also support running from root
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const path = require("path");

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const branchDataRaw = [
    { code: "AUCB001", name: "Administrative Office, Akola", city: "Akola", district: "Akola" },
    { code: "AUCB002", name: "Main Branch, Akola", city: "Akola", district: "Akola" },
    { code: "AUCB003", name: "Ramdaspeth Branch, Akola", city: "Ramdaspeth", district: "Akola" },
    { code: "AUCB004", name: "Karanja Branch", city: "Karanja", district: "Washim" },
    { code: "AUCB005", name: "Tajnapeth Branch, Akola", city: "Tajnapeth", district: "Akola" },
    { code: "AUCB006", name: "Mangrulpir Branch", city: "Mangrulpir", district: "Washim" },
    { code: "AUCB007", name: "Sindhi Camp Branch, Akola", city: "Sindhicamp", district: "Akola" },
    { code: "AUCB008", name: "Balapur Branch", city: "Balapur", district: "Akola" },
    { code: "AUCB009", name: "Murtizapur Branch", city: "Murtizapur", district: "Akola" },
    { code: "AUCB010", name: "Hiwarkhed Branch", city: "Hiwarkhed", district: "Akola" },
    { code: "AUCB011", name: "Akot Branch", city: "Akot", district: "Akola" },
    { code: "AUCB012", name: "Malegaon Branch", city: "Malegaon", district: "Washim" },
    { code: "AUCB013", name: "Wadegaon Branch", city: "Wadegaon", district: "Akola" },
    { code: "AUCB014", name: "Telhara Branch", city: "Telhara", district: "Akola" },
    { code: "AUCB015", name: "Sitabuldi Nagpur Branch", city: "Nagpur", district: "Nagpur" },
    { code: "AUCB016", name: "Jalgaon Branch", city: "Jalgaon", district: "Jalgaon" },
    { code: "AUCB017", name: "Jaisthambh Amravati Branch", city: "Amravati", district: "Amravati" },
    { code: "AUCB018", name: "Yavatmal Branch", city: "Yavatmal", district: "Yavatmal" },
    { code: "AUCB019", name: "Daryapur Branch", city: "Daryapur", district: "Amravati" },
    { code: "AUCB020", name: "Rajapeth Amravati Branch", city: "Rajapeth", district: "Amravati" },
    { code: "AUCB021", name: "Kalbadevi Mumbai Branch", city: "Mumbai", district: "Mumbai" },
    { code: "AUCB022", name: "Gandhibag Nagpur Branch", city: "Gandhibag", district: "Nagpur" },
    { code: "AUCB023", name: "APMC Branch, Akola", city: "APMC", district: "Akola" },
    { code: "AUCB024", name: "Chandrapur Branch", city: "Chandrapur", district: "Chandrapur" },
    { code: "AUCB025", name: "Wardha Branch", city: "Wardha", district: "Wardha" },
    { code: "AUCB026", name: "Nanded Branch", city: "Nanded", district: "Nanded" },
    { code: "AUCB027", name: "Dabki Road Branch, Akola", city: "Dabkiroad", district: "Akola" },
    { code: "AUCB028", name: "Civil Line Branch, Akola", city: "Civilline", district: "Akola" },
    { code: "AUCB029", name: "CH.Sambhaji Nagar Branch", city: "Aurangabad", district: "Aurangabad" },
    { code: "AUCB030", name: "Nashik Branch", city: "Nashik", district: "Nashik" },
    { code: "AUCB031", name: "Bramhan Sabha Jatharpeth Branch, Akola", city: "Jatharpeth", district: "Akola" },
    { code: "AUCB032", name: "Subhash Nagar Branch, Indore", city: "Indore1", district: "Indore" },
    { code: "AUCB033", name: "Malharganj Branch, Indore", city: "Indore2", district: "Indore" },
    { code: "AUCB034", name: "H.I.G. Colony Branch, Indore", city: "Indore3", district: "Indore" },
    { code: "AUCB035", name: "Sanyogitaganj Branch, Indore", city: "Indore4", district: "Indore" },
    { code: "AUCB036", name: "Washim Branch", city: "Washim", district: "Washim" },
    { code: "AUCB037", name: "Pune Branch", city: "Pune", district: "Pune" },
    { code: "AUCB038", name: "Wani Branch", city: "Wani", district: "Wani" }
];

async function seedAllBranchUsers() {
    let connection;
    try {
        console.log('🔗 Connecting to MySQL...');
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'bank_task_db'
        });
        console.log('✅ Connected to MySQL');
        
        // Get all branches from DB
        const [dbBranches] = await connection.query("SELECT * FROM branches");
        if (dbBranches.length === 0) {
            console.error('❌ No branches found! Please run setup_branches.js first.');
            process.exit(1);
        }
        console.log(`✅ Found ${dbBranches.length} branches in database`);
        
        const branchMap = {};
        dbBranches.forEach(b => {
            branchMap[b.branch_code] = b;
        });
        
        // Hash password
        const defaultPassword = 'Test@123';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        console.log('🔐 Password hashed: Test@123');
        
        const allUsers = [];
        
        // 1. CREATE ADMIN
        console.log('\n👤 Creating Admin User...');
        const adminBranch = branchMap['AUCB001'];
        if (adminBranch) {
            allUsers.push({
                name: 'Admin User',
                email: 'admin@akolaurban.bank.in',
                password: hashedPassword,
                role: 'ADMIN',
                branch_id: adminBranch.branch_id,
                branch_code: adminBranch.branch_code,
                branch_name: adminBranch.branch_name,
                phone: '+91-9876543210',
                joining_date: new Date(),
                is_active: 1,
                can_view_all_branches: 1
            });
            console.log('   ✓ Admin: admin@akolaurban.bank.in');
        } else {
             console.log("⚠️ Could not find AUCB001 branch in database!");
        }
        
        // 2. CREATE 38 MANAGERS
        console.log('\n👥 Creating 38 Branch Managers...');
        
        const managerData = [
            { code: 'AUCB002', email: 'manager.akola@akolaurban.bank.in', name: 'Suresh Patil' },
            { code: 'AUCB003', email: 'manager.ramdaspeth@akolaurban.bank.in', name: 'Rajesh Deshmukh' },
            { code: 'AUCB004', email: 'manager.karanja@akolaurban.bank.in', name: 'Mohan Khandare' },
            { code: 'AUCB005', email: 'manager.tajnapeth@akolaurban.bank.in', name: 'Vijay Kale' },
            { code: 'AUCB006', email: 'manager.mangrulpir@akolaurban.bank.in', name: 'Nitin Shelke' },
            { code: 'AUCB007', email: 'manager.sindhicamp@akolaurban.bank.in', name: 'Prakash Bhosale' },
            { code: 'AUCB008', email: 'manager.balapur@akolaurban.bank.in', name: 'Santosh Wagh' },
            { code: 'AUCB009', email: 'manager.murtizapur@akolaurban.bank.in', name: 'Mahesh Jadhav' },
            { code: 'AUCB010', email: 'manager.hiwarkhed@akolaurban.bank.in', name: 'Dinesh Shinde' },
            { code: 'AUCB011', email: 'manager.akot@akolaurban.bank.in', name: 'Ramesh Pawar' },
            { code: 'AUCB012', email: 'manager.malegaon@akolaurban.bank.in', name: 'Balaji Shinde' },
            { code: 'AUCB013', email: 'manager.wadegaon@akolaurban.bank.in', name: 'Ganesh Kulkarni' },
            { code: 'AUCB014', email: 'manager.telhara@akolaurban.bank.in', name: 'Anil Gaikwad' },
            { code: 'AUCB015', email: 'manager.nagpur@akolaurban.bank.in', name: 'Amit Deshmukh' },
            { code: 'AUCB016', email: 'manager.jalgaon@akolaurban.bank.in', name: 'Kiran Shah' },
            { code: 'AUCB017', email: 'manager.amravati@akolaurban.bank.in', name: 'Rahul Joshi' },
            { code: 'AUCB018', email: 'manager.yavatmal@akolaurban.bank.in', name: 'Sunil Deshpande' },
            { code: 'AUCB019', email: 'manager.daryapur@akolaurban.bank.in', name: 'Pradeep Wankhede' },
            { code: 'AUCB020', email: 'manager.rajapeth@akolaurban.bank.in', name: 'Vikram Bhoyar' },
            { code: 'AUCB021', email: 'manager.mumbai@akolaurban.bank.in', name: 'Mayur Patel' },
            { code: 'AUCB022', email: 'manager.gandhibag@akolaurban.bank.in', name: 'Vinay Thakur' },
            { code: 'AUCB023', email: 'manager.apmc@akolaurban.bank.in', name: 'Sanjay More' },
            { code: 'AUCB024', email: 'manager.chandrapur@akolaurban.bank.in', name: 'Vivek Chopra' },
            { code: 'AUCB025', email: 'manager.wardha@akolaurban.bank.in', name: 'Pravin Waghmare' },
            { code: 'AUCB026', email: 'manager.nanded@akolaurban.bank.in', name: 'Nikhil Rathod' },
            { code: 'AUCB027', email: 'manager.dabkiroad@akolaurban.bank.in', name: 'Sachin Kamble' },
            { code: 'AUCB028', email: 'manager.civilline@akolaurban.bank.in', name: 'Ashok Rane' },
            { code: 'AUCB029', email: 'manager.aurangabad@akolaurban.bank.in', name: 'Sagar Pawar' },
            { code: 'AUCB030', email: 'manager.nashik@akolaurban.bank.in', name: 'Akshay Desai' },
            { code: 'AUCB031', email: 'manager.jatharpeth@akolaurban.bank.in', name: 'Dilip Sawant' },
            { code: 'AUCB032', email: 'manager.indore1@akolaurban.bank.in', name: 'Manish Agrawal' },
            { code: 'AUCB033', email: 'manager.indore2@akolaurban.bank.in', name: 'Vishal Sharma' },
            { code: 'AUCB034', email: 'manager.indore3@akolaurban.bank.in', name: 'Ankit Gupta' },
            { code: 'AUCB035', email: 'manager.indore4@akolaurban.bank.in', name: 'Gaurav Malhotra' },
            { code: 'AUCB036', email: 'manager.washim@akolaurban.bank.in', name: 'Deepak Patil' },
            { code: 'AUCB037', email: 'manager.pune@akolaurban.bank.in', name: 'Rajesh Kumar' },
            { code: 'AUCB038', email: 'manager.wani@akolaurban.bank.in', name: 'Rohan Jain' }
        ];
        
        managerData.forEach(m => {
            const branch = branchMap[m.code];
            if (branch) {
                allUsers.push({
                    name: m.name,
                    email: m.email,
                    password: hashedPassword,
                    role: 'MANAGER',
                    branch_id: branch.branch_id,
                    branch_code: branch.branch_code,
                    branch_name: branch.branch_name,
                    phone: '+91-98765' + Math.floor(Math.random() * 90000 + 10000),
                    joining_date: new Date(),
                    is_active: 1,
                    can_view_all_branches: 0
                });
                console.log(`   ✓ ${branch.branch_name}: ${m.email}`);
            }
        });
        
        // 3. CREATE EMPLOYEES
        console.log('\n👨💼 Creating Employees for key branches...');
        
        const employeeData = [
            { code: 'AUCB002', email: 'employee1.akola@akolaurban.bank.in', name: 'Vikram Joshi' },
            { code: 'AUCB002', email: 'employee2.akola@akolaurban.bank.in', name: 'Sneha Pawar' },
            { code: 'AUCB003', email: 'employee1.ramdaspeth@akolaurban.bank.in', name: 'Pooja Raut' },
            { code: 'AUCB003', email: 'employee2.ramdaspeth@akolaurban.bank.in', name: 'Aditya Desai' },
            { code: 'AUCB007', email: 'employee1.sindhicamp@akolaurban.bank.in', name: 'Neha Kulkarni' },
            { code: 'AUCB007', email: 'employee2.sindhicamp@akolaurban.bank.in', name: 'Rohit Sharma' },
            { code: 'AUCB015', email: 'employee1.nagpur@akolaurban.bank.in', name: 'Priya Kulkarni' },
            { code: 'AUCB015', email: 'employee2.nagpur@akolaurban.bank.in', name: 'Arjun Patil' },
            { code: 'AUCB021', email: 'employee1.mumbai@akolaurban.bank.in', name: 'Rohan Shah' },
            { code: 'AUCB021', email: 'employee2.mumbai@akolaurban.bank.in', name: 'Neha Mehta' },
            { code: 'AUCB030', email: 'employee1.nashik@akolaurban.bank.in', name: 'Kavita Deshmukh' },
            { code: 'AUCB030', email: 'employee2.nashik@akolaurban.bank.in', name: 'Sanjay Thakur' },
            { code: 'AUCB037', email: 'employee1.pune@akolaurban.bank.in', name: 'Amit Sharma' },
            { code: 'AUCB037', email: 'employee2.pune@akolaurban.bank.in', name: 'Priya Desai' },
            
            { code: 'AUCB016', email: 'employee1.jalgaon@akolaurban.bank.in', name: 'Sachin Patil' },
            { code: 'AUCB017', email: 'employee1.amravati@akolaurban.bank.in', name: 'Megha Joshi' },
            { code: 'AUCB018', email: 'employee1.yavatmal@akolaurban.bank.in', name: 'Kiran More' },
            { code: 'AUCB032', email: 'employee1.indore1@akolaurban.bank.in', name: 'Ravi Gupta' },
            { code: 'AUCB022', email: 'employee1.gandhibag@akolaurban.bank.in', name: 'Swati Jain' },
            { code: 'AUCB029', email: 'employee1.aurangabad@akolaurban.bank.in', name: 'Pankaj Rao' }
        ];
        
        employeeData.forEach(e => {
            const branch = branchMap[e.code];
            if (branch) {
                allUsers.push({
                    name: e.name,
                    email: e.email,
                    password: hashedPassword,
                    role: 'EMPLOYEE',
                    branch_id: branch.branch_id,
                    branch_code: branch.branch_code,
                    branch_name: branch.branch_name,
                    phone: '+91-98765' + Math.floor(Math.random() * 90000 + 10000),
                    joining_date: new Date(),
                    is_active: 1,
                    can_view_all_branches: 0
                });
                console.log(`   ✓ ${branch.branch_name}: ${e.email}`);
            }
        });
        
        // Clear existing test users
        console.log('\n🗑️  Clearing existing test users...');
        await connection.query("SET FOREIGN_KEY_CHECKS = 0;");
        await connection.query("DELETE FROM users;");
        await connection.query("ALTER TABLE users AUTO_INCREMENT = 1;");
        await connection.query("SET FOREIGN_KEY_CHECKS = 1;");
        
        // Insert all users
        console.log('💾 Inserting users into database...');
        
        let adminCount = 0;
        let managerCount = 0;
        let employeeCount = 0;
        
        for (const u of allUsers) {
            await connection.query(`
                INSERT INTO users (name, email, password, role, branch_id, branch_code, branch_name, phone, joining_date, is_active, can_view_all_branches)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                u.name, u.email, u.password, u.role, u.branch_id, u.branch_code, u.branch_name, 
                u.phone, u.joining_date, u.is_active, u.can_view_all_branches
            ]);
            
            if (u.role === 'ADMIN') adminCount++;
            if (u.role === 'MANAGER') managerCount++;
            if (u.role === 'EMPLOYEE') employeeCount++;
        }
        
        console.log('\n✅ Successfully created users!');
        console.log(`   - Total users: ${allUsers.length}`);
        console.log(`   - Admins: ${adminCount}`);
        console.log(`   - Managers: ${managerCount}`);
        console.log(`   - Employees: ${employeeCount}`);
        
        console.log('\n📋 TEST CREDENTIALS (All passwords: Test@123)\n');
        
        console.log('ADMIN:');
        console.log('   - admin@akolaurban.bank.in\n');
        
        console.log('MANAGERS (38 branches):');
        managerData.forEach(m => {
            console.log(`   - ${m.email}`);
        });
        
        console.log('\nEMPLOYEES (20 employees):');
        employeeData.forEach(e => {
            console.log(`   - ${e.email}`);
        });
        
        console.log('\n🧪 TESTING GUIDE:');
        console.log('   Test Branch Isolation:');
        console.log('   1. Login as: manager.pune@akolaurban.bank.in / Test@123');
        console.log('   2. Submit entry, logout');
        console.log('   3. Login as: manager.mumbai@akolaurban.bank.in / Test@123');
        console.log('   4. Verify you CANNOT see Pune data ✓\n');
        
        console.log('   Test Admin Oversight:');
        console.log('   1. Login as: admin@akolaurban.bank.in / Test@123');
        console.log('   2. View "All Branches" dashboard');
        console.log('   3. Verify you CAN see ALL 38 branches ✓\n');
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        if(connection) {
            await connection.end();
            console.log('✅ Database connection closed');
        }
        console.log('🎉 Setup complete!\n');
    }
}

seedAllBranchUsers();
