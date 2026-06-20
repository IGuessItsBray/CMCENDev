require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');

async function listUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const users = await User.find()
      .select('username email accountName role contentAreas createdAt')
      .sort({ createdAt: -1 })
      .lean();

    console.table(
      users.map(user => ({
        username: user.username,
        email: user.email,
        accountName: user.accountName,
        role: user.role,
        contentAreas: user.contentAreas?.join(', ') || '',
        createdAt: user.createdAt
          ? user.createdAt.toISOString()
          : 'unknown'
      }))
    );

    console.log(`\nTotal users: ${users.length}`);
  } catch (error) {
    console.error('Could not list users:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

listUsers();