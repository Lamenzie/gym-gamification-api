const express = require('express');
const router = express.Router();
const workoutController = require('../controllers/workoutController');
const auth = require ('../middleware/authMiddleware');

router.post('/start', auth, workoutController.createWorkout);

module.exports = router;