const db = require("../config/db");
const bcrypt = require("bcrypt");

exports.getProfile = async (req, res) => {
  const userId = req.user.id;

  try {
    const profileQuery = await db.query(
      `
            SELECT 
                u."UserName",
                up."BaseBodyId",
                up."AvatarConfig", 
                up."DailySupplements",
                up."XP", 
                up."Level", 
                up."CurrentMonsterHP",
                up."Coins",
                up."MagicBooks",
                up."TotalMagicBonus",
                mt."BaseHP" as "MaxMonsterHP", 
                mt."Label" as "MonsterTierName",
                mt."TierLevel",
                m."SpriteName",
                m."Name" as "MonsterBaseName",
                m."BaseType",
                (SELECT COALESCE(SUM(e."BonusDMG"), 0) FROM "UserInventory" ui JOIN "Equipment" e ON ui."EquipmentId" = e."Id" WHERE ui."UserId" = up."UserId" AND ui."IsEquipped" = true) as "EquipDMG",
                (SELECT COALESCE(SUM(e."BonusCoins"), 0) FROM "UserInventory" ui JOIN "Equipment" e ON ui."EquipmentId" = e."Id" WHERE ui."UserId" = up."UserId" AND ui."IsEquipped" = true) as "EquipCoins",
                (SELECT COALESCE(SUM(e."BonusXP"), 0) FROM "UserInventory" ui JOIN "Equipment" e ON ui."EquipmentId" = e."Id" WHERE ui."UserId" = up."UserId" AND ui."IsEquipped" = true) as "EquipXP"
            FROM "UserProgress" up
            JOIN "User" u ON up."UserId" = u."Id"
            LEFT JOIN "MonsterTier" mt ON up."ActiveMonsterTierId" = mt."Id"
            LEFT JOIN "Monster" m ON mt."MonsterId" = m."Id"
            WHERE up."UserId" = $1
        `,
      [userId],
    );

    if (profileQuery.rows.length === 0) {
      return res.status(404).json({ error: "Profil nenalezen" });
    }

    const badgesRes = await db.query(
      `SELECT b."Id", b."Name", b."Description", b."Type"
     FROM "UserBadge" ub
     JOIN "Badge" b ON ub."BadgeId" = b."Id"
     WHERE ub."UserId" = $1`,
      [userId],
    );

    // Přiřazení dat z profileQuery, ne z nedefinované 'profile' proměnné
    const profileData = profileQuery.rows[0];

    profileData.EquipDMG = parseFloat(profileData.EquipDMG || 0);
    profileData.EquipCoins = parseFloat(profileData.EquipCoins || 0);
    profileData.EquipXP = parseFloat(profileData.EquipXP || 0);

    // Přidání odznaků
    profileData.badges = badgesRes.rows;

    res.status(200).json({
      message: "Profil úspěšně načten",
      profile: profileData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při načítání profilu" });
  }
};

// Profile update (Avatar, Nickname, Suplements)
exports.updateProfile = async (req, res) => {
  const userId = req.user.id;
  const { userName, avatarConfig, dailySupplements } = req.body;

  try {
    if (userName) {
      await db.query('UPDATE "User" SET "UserName" = $1 WHERE "Id" = $2', [
        userName,
        userId,
      ]);
    }

    if (avatarConfig || dailySupplements !== undefined) {
      await db.query(
        `
                    UPDATE "UserProgress" 
                    SET "AvatarConfig" = COALESCE($1, "AvatarConfig"),
                        "DailySupplements" = COALESCE($2, "DailySupplements")
                    WHERE "UserId" = $3
                `,
        [
          avatarConfig ? JSON.stringify(avatarConfig) : null,
          dailySupplements,
          userId,
        ],
      );
    }

    res.status(200).json({ message: "Profil úspěšně aktualizován!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při aktualizaci profilu" });
  }
};

exports.updateAvatar = async (req, res) => {
  const userId = req.user.id;
  const { baseBodyId } = req.body;

  if (!baseBodyId) {
    return res.status(400).json({ error: "Chybí ID avatara." });
  }

  try {
    await db.query(
      `UPDATE "UserProgress" SET "BaseBodyId" = $1 WHERE "UserId" = $2`,
      [baseBodyId, userId],
    );
    res.status(200).json({ message: "Avatar úspěšně změněn!", baseBodyId });
  } catch (error) {
    console.error("Chyba při updatu avatara:", error);
    res.status(500).json({ error: "Nepodařilo se uložit avatara." });
  }
};

exports.buyMagicBook = async (req, res) => {
  const userId = req.user.id;
  const BOOK_PRICE = 100; // Cena jedné knihy

  try {
    // Spustíme transakci
    await db.query("BEGIN");

    // 1. Zkontrolujeme stav konta
    const userRes = await db.query(
      `SELECT "Coins", "MagicBooks" FROM "UserProgress" WHERE "UserId" = $1`,
      [userId],
    );

    const { Coins, MagicBooks } = userRes.rows[0];

    if (Coins < BOOK_PRICE) {
      await db.query("ROLLBACK");
      return res.status(400).json({ error: "Nedostatek zlaťáků!" });
    }

    // 2. Odečteme mince a přidáme knihu
    const updatedRes = await db.query(
      `UPDATE "UserProgress" 
            SET "Coins" = "Coins" - $1, "MagicBooks" = "MagicBooks" + 1 
            WHERE "UserId" = $2 
            RETURNING "Coins", "MagicBooks"`,
      [BOOK_PRICE, userId],
    );

    await db.query("COMMIT");

    res.status(200).json({
      message: "Kniha zakoupena!",
      newCoins: updatedRes.rows[0].Coins,
      newBooks: updatedRes.rows[0].MagicBooks,
    });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Chyba při nákupu." });
  }
};

exports.getBestiary = async (req, res) => {
  const userId = req.user.id;
  try {
    // 1. Získáme všechna dostupná monstra
    const monstersRes = await db.query(`
            SELECT "Id", "Name", "SpriteName", "Lore"
            FROM "Monster"
            ORDER BY "Id" ASC
        `);
    const allMonsters = monstersRes.rows;

    // 2. Získáme historii poražených monster pro tohoto uživatele
    // POZNÁMKA: Pokud ještě nemáš tabulku "UserDefeatedMonster" vytvořenou,
    // tato query selže. Pokud ji nemáš, řekni mi to!
    const defeatedRes = await db.query(
      `
            SELECT "MonsterId", "TierLevel"
            FROM "UserDefeatedMonster"
            WHERE "UserId" = $1
        `,
      [userId],
    );

    // 3. Přemapujeme data pro frontend
    const defeatedMonsters = defeatedRes.rows.map((record) => ({
      monsterId: record.MonsterId,
      tierLevel: record.TierLevel,
    }));

    // 4. Odešleme klientovi
    res.status(200).json({
      allMonsters: allMonsters,
      defeatedMonsters: defeatedMonsters,
    });
  } catch (err) {
    console.error("Chyba při načítání bestiáře:", err);
    res.status(500).json({ error: "Chyba při načítání bestiáře." });
  }
};

// 1. Získání seznamu všech knih v obchodě
exports.getLibrary = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await db.query(
      `
            SELECT 
                b.*,
                CASE WHEN ub."Id" IS NOT NULL THEN true ELSE false END as "IsOwned",
                CASE WHEN up."Level" >= b."RequiredLevel" THEN true ELSE false END as "LevelMet"
            FROM "MagicBook" b
            LEFT JOIN "UserOwnedBook" ub ON b."Id" = ub."BookId" AND ub."UserId" = $1
            JOIN "UserProgress" up ON up."UserId" = $1
            ORDER BY b."RequiredLevel" ASC, b."Price" ASC
        `,
      [userId],
    );

    res.status(200).json({ books: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při načítání knihovny." });
  }
};

// 2. Nákup konkrétní knihy
exports.buyBook = async (req, res) => {
  const userId = req.user.id;
  const { bookId } = req.params;

  try {
    await db.query("BEGIN");

    // Získání dat o knize a uživateli
    const bookRes = await db.query(
      'SELECT * FROM "MagicBook" WHERE "Id" = $1',
      [bookId],
    );
    const userRes = await db.query(
      'SELECT "Coins", "Level" FROM "UserProgress" WHERE "UserId" = $1',
      [userId],
    );

    if (bookRes.rows.length === 0) throw new Error("Kniha neexistuje.");

    const book = bookRes.rows[0];
    const user = userRes.rows[0];

    // Validace: Level, Peníze, Vlastnictví
    if (user.Level < book.RequiredLevel) {
      return res
        .status(400)
        .json({ error: `Tato kniha vyžaduje Level ${book.RequiredLevel}!` });
    }
    if (user.Coins < book.Price) {
      return res.status(400).json({ error: "Nedostatek zlaťáků!" });
    }

    const ownedCheck = await db.query(
      'SELECT "Id" FROM "UserOwnedBook" WHERE "UserId" = $1 AND "BookId" = $2',
      [userId, bookId],
    );
    if (ownedCheck.rows.length > 0) {
      return res.status(400).json({ error: "Tuto knihu již vlastníš." });
    }

    // Provedení transakce
    await db.query(
      'INSERT INTO "UserOwnedBook" ("UserId", "BookId") VALUES ($1, $2)',
      [userId, bookId],
    );

    // Aktualizace peněz a přičtení bonusu k magii v UserProgress
    await db.query(
      `
            UPDATE "UserProgress" 
            SET "Coins" = "Coins" - $1, 
                "TotalMagicBonus" = "TotalMagicBonus" + $2 
            WHERE "UserId" = $3
        `,
      [book.Price, book.DamageBonus, userId],
    );

    await db.query("COMMIT");
    res.status(200).json({
      message: `Kniha ${book.Title} zakoupena!`,
      bonusAdded: book.DamageBonus,
    });
  } catch (err) {
    await db.query("ROLLBACK");
    res.status(500).json({ error: err.message || "Chyba při nákupu." });
  }
};

// Změna hesla
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    // 1. Najdeme uživatele a jeho zahešované heslo
    const userRes = await db.query(
      'SELECT "PasswordHash" FROM "User" WHERE "Id" = $1',
      [userId],
    );
    if (userRes.rows.length === 0)
      return res.status(404).json({ error: "Uživatel nenalezen" });

    // 2. Ověření: Zadal uživatel správné aktuální heslo?
    const validPassword = await bcrypt.compare(
      currentPassword,
      userRes.rows[0].PasswordHash,
    );
    if (!validPassword)
      return res.status(401).json({ error: "Nesprávné aktuální heslo!" });

    // 3. Zahešování nového hesla a uložení
    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    await db.query('UPDATE "User" SET "PasswordHash" = $1 WHERE "Id" = $2', [
      hashedNewPassword,
      userId,
    ]);
    res.json({ message: "Heslo bylo úspěšně změněno!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Chyba při změně hesla." });
  }
};

// Smazání účtu
exports.deleteAccount = async (req, res) => {
  const { currentPassword } = req.body;
  const userId = req.user.id;

  try {
    const userRes = await db.query(
      'SELECT "PasswordHash" FROM "User" WHERE "Id" = $1',
      [userId],
    );
    if (userRes.rows.length === 0)
      return res.status(404).json({ error: "Uživatel nenalezen" });

    // Dvoufázové ověření před smazáním
    const validPassword = await bcrypt.compare(
      currentPassword,
      userRes.rows[0].PasswordHash,
    );
    if (!validPassword)
      return res
        .status(401)
        .json({ error: "Pro smazání účtu musíš zadat správné heslo!" });

    // Trvalé smazání uživatele (Pokud máš v DB nastaveno ON DELETE CASCADE u ostatních tabulek, smaže se s ním i jeho progress a monstra)
    await db.query('DELETE FROM "User" WHERE "Id" = $1', [userId]);
    res.json({ message: "Účet byl trvale smazán." });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error:
        "Chyba při mazání účtu. (Zkontroluj, zda mají provázané tabulky ON DELETE CASCADE)",
    });
  }
};
