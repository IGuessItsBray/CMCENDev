require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');
const { USER_ROLES } = require('../config/roles');

async function setUserRole() {
    const username = process.argv[2];
    const role = process.argv[3];

    const contentAreas = process.argv[4]
        ? process.argv[4]
            .split(',')
            .map(area => area.trim())
            .filter(Boolean)
        : [];

    if (!username || !role) {
        throw new Error(
            'Usage: node scripts/set-user-role.js <username> <role> [contentAreas]'
        );
    }

    if (!USER_ROLES.includes(role)) {
        throw new Error(
            `Invalid role. Choose: ${USER_ROLES.join(', ')}`
        );
    }

    await mongoose.connect(process.env.MONGO_URI);

    const user = await User.findOneAndUpdate(
        { username },
        {
            $set: {
                role,
                contentAreas: role === 'author'
                    ? contentAreas
                    : []
            }
        },
        {
            new: true,
            runValidators: true
        }
    ).select('username email accountName role contentAreas');

    if (!user) {
        throw new Error(`User "${username}" was not found`);
    }

    console.table([{
        username: user.username,
        email: user.email,
        accountName: user.accountName,
        role: user.role,
        contentAreas: user.contentAreas.join(', ')
    }]);
}

setUserRole()
    .catch(error => {
        console.error('Could not update user:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });