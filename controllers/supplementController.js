const db = require("../config/db");
const badgeService = require("../services/badgeService");

// Získání dnešních zalogovaných suplementů (vrací pole IDček, např. [1, 3])
exports.getTodaySupplements = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await db.query(
      'SELECT "SupplementTypeId" FROM "SupplementLog" WHERE "UserId" = $1 AND "Date" = CURRENT_DATE',
      [userId],
    );

    const loggedIds = result.rows.map((r) => r.SupplementTypeId);
    res.status(200).json({ loggedSupplementIds: loggedIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při načítání suplementů." });
  }
};

// Zapnutí / Vypnutí suplementu pro dnešní den
exports.toggleSupplement = async (req, res) => {
  const userId = req.user.id;
  const { supplementTypeId } = req.body; // 1 = Kreatin, 2 = Protein, 3 = Vitamíny

  try {
    // Kontrola, zda už dnes log existuje
    const existing = await db.query(
      'SELECT * FROM "SupplementLog" WHERE "UserId" = $1 AND "SupplementTypeId" = $2 AND "Date" = CURRENT_DATE',
      [userId, supplementTypeId],
    );

    if (existing.rows.length > 0) {
      // Pokud existuje, uživatel ho odškrtnul -> smažeme záznam
      await db.query(
        'DELETE FROM "SupplementLog" WHERE "UserId" = $1 AND "SupplementTypeId" = $2 AND "Date" = CURRENT_DATE',
        [userId, supplementTypeId],
      );
      res.status(200).json({ success: true, status: "removed" });
    } else {
      // Pokud neexistuje, uživatel ho zaškrtnul -> přidáme záznam
      await db.query(
        'INSERT INTO "SupplementLog" ("UserId", "SupplementTypeId", "Date") VALUES ($1, $2, CURRENT_DATE)',
        [userId, supplementTypeId],
      );

      // Spustíme náš společný badge mozek (zkontroluje milník Alchymisty)
      await badgeService.checkAndAwardAllBadges(userId);

      res.status(200).json({ success: true, status: "added" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při ukládání suplementu." });
  }
};
