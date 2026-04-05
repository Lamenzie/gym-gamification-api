require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');

// Init App
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware 
app.use(cors()); 
app.use(express.json());

// Test ENDPOINT
app.get('/', (req, res) => {
    res.send('Gym Gamification API běží jako hodinky! 🚀');
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/workouts', require('./routes/workoutRoutes'));

// Start Server
app.listen(PORT, () => {
    console.log(`✅ Server naslouchá na portu ${PORT}`);
});