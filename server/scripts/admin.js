require('dotenv').config();
const mongoose = require('mongoose');
const { searchUser } = require('./search-user');
const { promoteUser } = require('./promote-user');
const { signAdminToken } = require('./generate-admin-token');

async function run() {
  const [,, command, arg1, arg2] = process.argv;
  
  try {
    // 1. Establish connection before doing anything
    await mongoose.connect(process.env.MONGO_URI);
    
    // 2. Generate the token while connected
    const token = await signAdminToken(); 

    // 3. Execute requested task
    if (command === 'search') {
      await searchUser(arg1, token);
    } else if (command === 'promote') {
      await promoteUser(arg1, arg2, token);
    } else {
      console.log("Usage: node admin.js [search|promote] [arg1] [arg2]");
    }
  } catch (err) {
    console.error("Admin CLI Error:", err);
  } finally {
    // 4. Always close the connection
    await mongoose.disconnect();
  }
}

run();