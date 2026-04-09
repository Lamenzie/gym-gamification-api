const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const auth = require("../middleware/authMiddleware");

router.get("/profile", auth, userController.getProfile);
router.put("/update", auth, userController.updateProfile);

module.exports = router;
