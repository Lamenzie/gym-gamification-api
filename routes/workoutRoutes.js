const express = require("express");
const router = express.Router();
const workoutController = require("../controllers/workoutController");
const auth = require("../middleware/authMiddleware");

router.post("/start", auth, workoutController.createWorkout);
router.post("/log-set", auth, workoutController.logSet);
router.put("/finish", auth, workoutController.finishWorkout);
router.get("/history", auth, workoutController.getMyWorkouts);
router.get('/active-monster', auth, workoutController.getActiveMonster);

module.exports = router;
