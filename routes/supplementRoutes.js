const express = require("express");
const router = express.Router();

// Načtení controlleru a middleware pro ověření uživatele
const supplementController = require("../controllers/supplementController");
const auth = require("../middleware/authMiddleware"); // Uprav cestu k auth, pokud ji máš jinde

// GET: Získání dnešních suplementů
router.get("/today", auth, supplementController.getTodaySupplements);

// POST: Zapnutí/Vypnutí suplementu
router.post("/toggle", auth, supplementController.toggleSupplement);

module.exports = router;
