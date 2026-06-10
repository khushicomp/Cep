require("dotenv").config();
const mysql = require("mysql2/promise");

const branches = [
    {
        branchCode: "AUCB001",
        branchName: "Administrative Office, Akola",
        branchAddress: "Jankalyan, 58-59, Toshniwal Layout, Near Govt. Milk Scheme, Murtizapur Road, Akola",
        branchCity: "Akola",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444001",
        branchEmail: "aucb_main@akolaurban.bank.in",
        branchPhone: "2453850-54",
        branchType: "Administrative Office",
        isActive: 1
    },
    {
        branchCode: "AUCB002",
        branchName: "Main Branch, Akola",
        branchAddress: "Jankalyan, Old Cotton Market, Tilak Road, Akola",
        branchCity: "Akola",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444001",
        branchEmail: "aucb_main@akolaurban.bank.in",
        branchPhone: "9923588834",
        branchType: "Main Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB003",
        branchName: "Ramdaspeth Branch, Akola",
        branchAddress: "Datta Mandir Chauk, Ramdaspeth, Akola",
        branchCity: "Akola",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444001",
        branchEmail: "aucb_ramdaspeth@akolaurban.bank.in",
        branchPhone: "9923588204",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB004",
        branchName: "Karanja Branch",
        branchAddress: "Main Road, Cotton Market, Near Krushi Utpanna Bazar Samiti, Karanja",
        branchCity: "Karanja",
        branchDistrict: "Washim",
        branchState: "Maharashtra",
        branchPincode: "444105",
        branchEmail: "aucb_karnja@akolaurban.bank.in",
        branchPhone: "9923588192",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB005",
        branchName: "Tajnapeth Branch, Akola",
        branchAddress: "Near HDFC Bank, Zila Parishad Road, Akola",
        branchCity: "Akola",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444001",
        branchEmail: "aucb_tajnapeth@akolaurban.bank.in",
        branchPhone: "9923588845",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB006",
        branchName: "Mangrulpir Branch",
        branchAddress: "In front of S.B.I., Main Road, Mangrulpir",
        branchCity: "Mangrulpir",
        branchDistrict: "Washim",
        branchState: "Maharashtra",
        branchPincode: "444403",
        branchEmail: "aucb_mangrulpir@akolaurban.bank.in",
        branchPhone: "9923794198",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB007",
        branchName: "Sindhi Camp Branch, Akola",
        branchAddress: "Poonam Complex, Income Tax Chawk, Gorakshan Road, Akola",
        branchCity: "Akola",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444004",
        branchEmail: "aucb_sindhicamp@akolaurban.bank.in",
        branchPhone: "9923033319",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB008",
        branchName: "Balapur Branch",
        branchAddress: "Near State Bank of India, Balapur",
        branchCity: "Balapur",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444302",
        branchEmail: "aucb_balapur@akolaurban.bank.in",
        branchPhone: "9923588197",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB009",
        branchName: "Murtizapur Branch",
        branchAddress: "Station Road, Murtizapur",
        branchCity: "Murtizapur",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444107",
        branchEmail: "aucb_murtizapur@akolaurban.bank.in",
        branchPhone: "9923588190",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB010",
        branchName: "Hiwarkhed Branch",
        branchAddress: "Main Road, Opposite Zilla Parishad School, Hiwarkhed",
        branchCity: "Hiwarkhed",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444103",
        branchEmail: "aucb_hiwarkhed@akolaurban.bank.in",
        branchPhone: "9765988191",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB011",
        branchName: "Akot Branch",
        branchAddress: "Lakkad Ganj, Hiwarkhed Road, Akot",
        branchCity: "Akot",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444101",
        branchEmail: "aucb_akot@akolaurban.bank.in",
        branchPhone: "9923588198",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB012",
        branchName: "Malegaon Branch",
        branchAddress: "Shri Navasthale's Building, Main Road, Malegaon",
        branchCity: "Malegaon",
        branchDistrict: "Washim",
        branchState: "Maharashtra",
        branchPincode: "444503",
        branchEmail: "aucb_malegaon@akolaurban.bank.in",
        branchPhone: "9923588191",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB013",
        branchName: "Wadegaon Branch",
        branchAddress: "Shri Jairam Kale Complex, Near Bus Stand, Wadegaon Tq. Balapur",
        branchCity: "Wadegaon",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444502",
        branchEmail: "aucb_wadegaon@akolaurban.bank.in",
        branchPhone: "9765988190",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB014",
        branchName: "Telhara Branch",
        branchAddress: "Near Maheshwari Bhavan, Main Road, Telhara",
        branchCity: "Telhara",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444108",
        branchEmail: "aucb_telhara@akolaurban.bank.in",
        branchPhone: "9923588203",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB015",
        branchName: "Sitabuldi Nagpur Branch",
        branchAddress: "Sagar Towers, 2nd Floor, Beside Nareshchandra Co., Pandit Malviya Road, Sitabuldi, Nagpur",
        branchCity: "Nagpur",
        branchDistrict: "Nagpur",
        branchState: "Maharashtra",
        branchPincode: "440012",
        branchEmail: "aucb_sitabuldi@akolaurban.bank.in",
        branchPhone: "9823075126",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB016",
        branchName: "Jalgaon Branch",
        branchAddress: "Natraj Hall, Opposite Padmalaya Govt. Rest House, Jaykisan Wadi, Jalgaon",
        branchCity: "Jalgaon",
        branchDistrict: "Jalgaon",
        branchState: "Maharashtra",
        branchPincode: "425001",
        branchEmail: "aucb_jalgaon@akolaurban.bank.in",
        branchPhone: "9923588147",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB017",
        branchName: "Jaisthambh Amravati Branch",
        branchAddress: "Mahavir Plaza Complex, Jaisthambh Chauk, Amravati",
        branchCity: "Amravati",
        branchDistrict: "Amravati",
        branchState: "Maharashtra",
        branchPincode: "444601",
        branchEmail: "aucb_jaisthambh@akolaurban.bank.in",
        branchPhone: "9823040944",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB018",
        branchName: "Yavatmal Branch",
        branchAddress: "Sharda Sadan, Awadhootwadi, Godhani Road, Yavatmal",
        branchCity: "Yavatmal",
        branchDistrict: "Yavatmal",
        branchState: "Maharashtra",
        branchPincode: "445001",
        branchEmail: "aucb_yavatmal@akolaurban.bank.in",
        branchPhone: "9823044623",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB019",
        branchName: "Daryapur Branch",
        branchAddress: "Banosa Road, Daryapur",
        branchCity: "Daryapur",
        branchDistrict: "Amravati",
        branchState: "Maharashtra",
        branchPincode: "444803",
        branchEmail: "aucb_daryapur@akolaurban.bank.in",
        branchPhone: "9923588200",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB020",
        branchName: "Rajapeth Amravati Branch",
        branchAddress: "Deorankar Nagar, Near Samarth Highschool Badnera Road, Rajapeth",
        branchCity: "Amravati",
        branchDistrict: "Amravati",
        branchState: "Maharashtra",
        branchPincode: "444605",
        branchEmail: "aucb_rajapeth@akolaurban.bank.in",
        branchPhone: "9923795198",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB021",
        branchName: "Kalbadevi Mumbai Branch",
        branchAddress: "Karnani House, 19/21-23 Ground Floor, Vithoba Lane VitthalWadi, Kalbadevi Road, Mumbai",
        branchCity: "Mumbai",
        branchDistrict: "Mumbai",
        branchState: "Maharashtra",
        branchPincode: "400002",
        branchEmail: "aucb_kalbadevi@akolaurban.bank.in",
        branchPhone: "9923588841",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB022",
        branchName: "Gandhibag Nagpur Branch",
        branchAddress: "2nd Floor, Ahilya Complex, Near Medical Market, Near Agrasen Chauk, Gandhibag, Nagpur",
        branchCity: "Nagpur",
        branchDistrict: "Nagpur",
        branchState: "Maharashtra",
        branchPincode: "440002",
        branchEmail: "aucb_gandhibag@akolaurban.bank.in",
        branchPhone: "9823076701",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB023",
        branchName: "APMC Branch, Akola",
        branchAddress: "Ganga Nagar 2, Khamgaon Road, Akola",
        branchCity: "Akola",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444001",
        branchEmail: "aucb_apmc@akolaurban.bank.in",
        branchPhone: "9923588846",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB024",
        branchName: "Chandrapur Branch",
        branchAddress: "C/o. Ramkrishna Appartment, Ganj Ward, Chandrapur",
        branchCity: "Chandrapur",
        branchDistrict: "Chandrapur",
        branchState: "Maharashtra",
        branchPincode: "442402",
        branchEmail: "aucb_chandrapur@akolaurban.bank.in",
        branchPhone: "9823146827",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB025",
        branchName: "Wardha Branch",
        branchAddress: "C/o. Radhe Complex, Socialiest Chauk, Wardha",
        branchCity: "Wardha",
        branchDistrict: "Wardha",
        branchState: "Maharashtra",
        branchPincode: "442001",
        branchEmail: "aucb_wardha@akolaurban.bank.in",
        branchPhone: "9823085401",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB026",
        branchName: "Nanded Branch",
        branchAddress: "Ground Floor, Patil Plaza, Taj Patil Hotel, Vishnu Complex, Vip Road",
        branchCity: "Nanded",
        branchDistrict: "Nanded",
        branchState: "Maharashtra",
        branchPincode: "431605",
        branchEmail: "aucb_nanded@akolaurban.bank.in",
        branchPhone: "9823146832",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB027",
        branchName: "Dabki Road Branch, Akola",
        branchAddress: "Near Bhikamchand Khandelwal High School, Godbole Plots, Dabki Road, Akola",
        branchCity: "Akola",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444002",
        branchEmail: "aucb_dabki_road@akolaurban.bank.in",
        branchPhone: "9923588840",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB028",
        branchName: "Civil Line Branch, Akola",
        branchAddress: "Mahalaxmi Complex, Opposite Bagdi Hospital, Amankha Plot, Akola",
        branchCity: "Akola",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444001",
        branchEmail: "aucb_civil_line@akolaurban.bank.in",
        branchPhone: "9923588839",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB029",
        branchName: "CH.Sambhaji Nagar Branch",
        branchAddress: "Gopichand Complex, Opposite Apana Hospital, Jalna Road, CH.Sambhaji Nagar",
        branchCity: "CH.Sambhaji Nagar",
        branchDistrict: "CH.Sambhaji Nagar",
        branchState: "Maharashtra",
        branchPincode: "431001",
        branchEmail: "aucb_aurangabad@akolaurban.bank.in",
        branchPhone: "9823018610",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB030",
        branchName: "Nashik Branch",
        branchAddress: "Unity Campus, Shop No-1, Old Pandit Colony, Opp. KTM College, Gangapur Road, Nashik - 422002",
        branchCity: "Nashik",
        branchDistrict: "Nashik",
        branchState: "Maharashtra",
        branchPincode: "422002",
        branchEmail: "aucb_nasik@akolaurban.bank.in",
        branchPhone: "9823080401",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB031",
        branchName: "Bramhan Sabha Jatharpeth Branch, Akola",
        branchAddress: "'Hiraman', Near Dr.Narendra Pawade Clinic, Jatharpeth Chauk, Akola",
        branchCity: "Akola",
        branchDistrict: "Akola",
        branchState: "Maharashtra",
        branchPincode: "444005",
        branchEmail: "aucb_bsec@akolaurban.bank.in",
        branchPhone: "9923588779",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB032",
        branchName: "Subhash Nagar Branch, Indore",
        branchAddress: "13, Netaji Subhash Marg, Indore",
        branchCity: "Indore",
        branchDistrict: "Indore",
        branchState: "Madhya Pradesh",
        branchPincode: "452007",
        branchEmail: "aucb_subhashmarg@akolaurban.bank.in",
        branchPhone: "8369676927",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB033",
        branchName: "Malharganj Branch, Indore",
        branchAddress: "19/2, Daliya Patti, Malharganj, Indore",
        branchCity: "Indore",
        branchDistrict: "Indore",
        branchState: "Madhya Pradesh",
        branchPincode: "452002",
        branchEmail: "aucb_malharganj@akolaurban.bank.in",
        branchPhone: "9850855749",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB034",
        branchName: "H.I.G. Colony Branch, Indore",
        branchAddress: "F-43, H.I.G. Colony, Indore",
        branchCity: "Indore",
        branchDistrict: "Indore",
        branchState: "Madhya Pradesh",
        branchPincode: "452010",
        branchEmail: "aucb_higcolony@akolaurban.bank.in",
        branchPhone: "9420101811",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB035",
        branchName: "Sanyogitaganj Branch, Indore",
        branchAddress: "47/2, Murai Mohalla, Chhavni, Indore",
        branchCity: "Indore",
        branchDistrict: "Indore",
        branchState: "Madhya Pradesh",
        branchPincode: "452007",
        branchEmail: "aucb_sanyogitaganj@akolaurban.bank.in",
        branchPhone: "9420103937",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB036",
        branchName: "Washim Branch",
        branchAddress: "Patni Chowk Sindi Colony Main Road Washim",
        branchCity: "Washim",
        branchDistrict: "Washim",
        branchState: "Maharashtra",
        branchPincode: "444505",
        branchEmail: "aucb_washim@akolaurban.bank.in",
        branchPhone: "07252-234232",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB037",
        branchName: "Pune Branch",
        branchAddress: "Wasundhara plaza, Bramhwrund colony, near bharat Petrol Pump, DP Road pimple nilakh Pune",
        branchCity: "Pune",
        branchDistrict: "Pune",
        branchState: "Maharashtra",
        branchPincode: "411027",
        branchEmail: "aucb_pune@akolaurban.bank.in",
        branchPhone: "020-29527526",
        branchType: "Branch",
        isActive: 1
    },
    {
        branchCode: "AUCB038",
        branchName: "Wani Branch",
        branchAddress: "Tilak Nagar, Nandepera Road, Wani",
        branchCity: "Wani",
        branchDistrict: "Wani",
        branchState: "Maharashtra",
        branchPincode: "445304",
        branchEmail: "aucb_wani@akolaurban.bank.in",
        branchPhone: "07239-299011",
        branchType: "Branch",
        isActive: 1
    }
];

async function setupBranches() {
    let connection;
    try {
        console.log("Connecting securely to the database...");    
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log("Re-creating branches table...");
        
        // Temporarily disable foreign key checks so we can drop the table if needed
        await connection.query("SET FOREIGN_KEY_CHECKS = 0;");
        await connection.query("DROP TABLE IF EXISTS branches;");
        await connection.query(`
            CREATE TABLE branches (
                branch_id INT AUTO_INCREMENT PRIMARY KEY,
                branch_code VARCHAR(20) UNIQUE NOT NULL,
                branch_name VARCHAR(150) NOT NULL,
                branch_address TEXT,
                branch_city VARCHAR(100),
                branch_district VARCHAR(100),
                branch_state VARCHAR(100),
                branch_pincode VARCHAR(10),
                branch_email VARCHAR(100),
                branch_phone VARCHAR(50),
                branch_type VARCHAR(50) DEFAULT 'Branch',
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log("Branches table created successfully!");

        console.log("Inserting 38 branches...");
        
        for (const branch of branches) {
            await connection.query(`
                INSERT INTO branches (
                    branch_code, branch_name, branch_address, branch_city, 
                    branch_district, branch_state, branch_pincode, branch_email, 
                    branch_phone, branch_type, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                branch.branchCode, branch.branchName, branch.branchAddress,
                branch.branchCity, branch.branchDistrict, branch.branchState,
                branch.branchPincode, branch.branchEmail, branch.branchPhone,
                branch.branchType, branch.isActive
            ]);
        }
        
        console.log("All 38 branches inserted successfully!");
        
    } catch (err) {
        console.error("Error setting up branches:", err);
    } finally {
        if(connection) {
            await connection.query("SET FOREIGN_KEY_CHECKS = 1;");
            await connection.end();
            console.log("Database connection closed.");
        }
    }
}

setupBranches();
