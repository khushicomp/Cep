require('dotenv').config();
const jwt = require('jsonwebtoken');

// Create token
const token = jwt.sign({ user_id: 1, role: 'MANAGER', branch_id: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function run() {
    try {
        console.log("Token:", token);
        const response = await fetch('http://localhost:5000/api/business/entry/1', {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        console.log('Delete response:', data);
    } catch (err) {
        console.error('Delete failed:', err.message);
    }
}
run();
