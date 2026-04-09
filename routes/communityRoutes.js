const express = require("express");
const router = express.Router();
const communityController = require("../controllers/communityController");
const auth = require("../middleware/authMiddleware");

router.get("/search", auth, communityController.searchUsers);
router.get("/feed", auth, communityController.getFeed);
router.get("/profile/:id", auth, communityController.getPublicProfile);

router.post("/follow/:id", auth, communityController.toggleFollow);

module.exports = router;
