const db = require("../config/db");

exports.getProfile = async (req, res) => {
  const userId = req.user.id;

  try {
    const profileQuery = await db.query(
      `
            SELECT 
                up."XP", 
                up."Level", 
                up."CurrentMonsterHP",
                mt."BaseHP" as "MaxMonsterHP", 
                mt."Label" as "MonsterTierName", 
                m."Name" as "MonsterBaseName",
                m."BaseType"
            FROM "UserProgress" up
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
