const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// REGISTRACE
exports.register = async (req, res) => {
  const { userName, email, password } = req.body;

  try {
    const userExists = await db.query(
      'SELECT * FROM "User" WHERE "Email" = $1',
      [email],
    );
    if (userExists.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "Uživatel s tímto emailem už existuje" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await db.query(
      'INSERT INTO "User" ("UserName", "Email", "PasswordHash") VALUES ($1, $2, $3) RETURNING "Id", "UserName", "Email"',
      [userName, email, passwordHash],
    );

    // ... (tady nahoře máš hashování hesla a INSERT do tabulky "User")

    // 1. Získáme první dostupné monstrum (Tier 1) pro nováčka
    const monsterRes = await db.query(
      'SELECT "Id", "BaseHP" FROM "MonsterTier" ORDER BY "Id" ASC LIMIT 1',
    );
    const initialMonsterId = monsterRes.rows[0]?.Id || null;
    const initialMonsterHP = monsterRes.rows[0]?.BaseHP || 0;

    // 2. Vytvoříme profil hráče a rovnou mu monstrum přiřadíme
    await db.query(
      `INSERT INTO "UserProgress" 
    ("UserId", "XP", "Level", "WeeklyStreak", "ActiveMonsterTierId", "CurrentMonsterHP") 
    VALUES ($1, 0, 1, 0, $2, $3)`,
      [newUser.rows[0].Id, initialMonsterId, initialMonsterHP],
    );

    // ... (tady dole je res.status(201).json(...))

    res
      .status(201)
      .json({ message: "Registrace úspěšná!", user: newUser.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba serveru při registraci" });
  }
};

// PŘIHLÁŠENÍ
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await db.query('SELECT * FROM "User" WHERE "Email" = $1', [
      email,
    ]);
    if (user.rows.length === 0) {
      return res.status(400).json({ error: "Neplatný email nebo heslo" });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.rows[0].PasswordHash,
    );
    if (!validPassword) {
      return res.status(400).json({ error: "Neplatný email nebo heslo" });
    }

    const token = jwt.sign(
      { id: user.rows[0].Id, email: user.rows[0].Email },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.json({
      message: "Přihlášení úspěšné!",
      token,
      user: { id: user.rows[0].Id, userName: user.rows[0].UserName },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba serveru při přihlášení" });
  }
};
