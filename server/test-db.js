// test-db.js
require('dotenv').config();
const mongoose = require('mongoose');

async function testConnection() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("SUCCESS: Database connection established!");
        
        // Try to list collections in the 'cmcen-demo' database
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log("Current collections:", collections.map(c => c.name));
        
        process.exit(0);
    } catch (error) {
        console.error("CONNECTION FAILED:", error.message);
        process.exit(1);
    }
}

testConnection();