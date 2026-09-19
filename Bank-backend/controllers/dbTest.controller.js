const db = require("../config/db");

exports.dbTest = (req,res) => {
    db.query("SELECT * FROM users", (err, results) => {
        if(err) {
            return res.status(500).json({ message: "Internal server error" });
        }
        res.json(results);
    });
};