require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const diagnosticsRoutes = require('./routes/diagnostics');
const eventRoutes = require('./routes/events');
const retirementMessageRoutes = require('./routes/retirement-messages');
const uploadRoutes = require('./routes/uploads');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/api', authRoutes);
app.use('/api', diagnosticsRoutes);
app.use('/api', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/retirement-messages', retirementMessageRoutes);

// wait for MongoDB before listening
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    app.listen(process.env.PORT || 3000, () => {
      console.log(
        `Server running on port ${process.env.PORT || 3000}`
      );
    });
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
}

startServer();
