const db = require("../config/db");

exports.getProfile = async (req, res) => {
  const userId = req.user.id;

  try {
    const profileQuery = await db.query(
      `
           SELECT 
                u."UserName",
                up."AvatarConfig", 
                up."DailySupplements",
                up."XP", 
                up."Level", 
                up."CurrentMonsterHP",
                mt."BaseHP" as "MaxMonsterHP", 
                mt."Label" as "MonsterTierName", 
                m."Name" as "MonsterBaseName",
                m."BaseType"
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

    res.status(200).json({
      message: "Profil úspěšně načten",
      profile: profileQuery.rows[0],
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
