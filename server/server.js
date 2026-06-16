require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// Connect to MongoDB using the URI from your .env file
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect', err));

// Example API Route
app.get('/api/data', async (req, res) => {
    // Perform database queries here
    res.json({ message: "Data fetched securely" });
});

app.listen(3000, () => console.log('Server running on port 3000'));