const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const auth = require("../middleware/authMiddleware");

router.get("/profile", auth, userController.getProfile);
router.get("/bestiary", auth, userController.getBestiary);
router.get("/library", auth, userController.getLibrary);

router.put("/update", auth, userController.updateProfile);
router.put("/avatar", auth, userController.updateAvatar);

router.post("/buy-book", auth, userController.buyMagicBook);
router.post("/buy-book/:bookId", auth, userController.buyBook);

router.put("/password", auth, userController.changePassword);
router.delete("/account", auth, userController.deleteAccount);

module.exports = router;
