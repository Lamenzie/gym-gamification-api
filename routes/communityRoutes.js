const express = require("express");
const router = express.Router();
const communityController = require("../controllers/communityController");
const auth = require("../middleware/authMiddleware");

router.get("/search", auth, communityController.searchUsers);
router.get("/feed", auth, communityController.getFeed);
router.get("/profile/:id", auth, communityController.getPublicProfile);

router.post("/follow/:id", auth, communityController.toggleFollow);

router.get("/leaderboard", auth, communityController.getLeaderboard);
router.get("/my-stats", auth, communityController.getMyCommunityStats);

// Pro tvůj profil
router.get("/followers", auth, communityController.getFollowers);
router.get("/following", auth, communityController.getFollowing);

// Pro cizí profil
router.get("/followers/:id", auth, communityController.getFollowers);
router.get("/following/:id", auth, communityController.getFollowing);

module.exports = router;
