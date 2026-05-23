const db = require("../config/db");

exports.checkAndAwardAllBadges = async (userId) => {
  try {
    let newBadgesAwarded = [];

    // 1. Zjistíme, jaké odznaky už uživatel má, ať mu je nedáváme dvakrát
    const userBadgesRes = await db.query(
      'SELECT "BadgeId" FROM "UserBadge" WHERE "UserId" = $1',
      [userId],
    );
    const ownedBadgeIds = userBadgesRes.rows.map((row) => row.BadgeId);

    // Pomocná funkce pro přidání odznaku
    const awardBadge = async (badgeId, rewardCoins) => {
      if (!ownedBadgeIds.includes(badgeId)) {
        await db.query(
          'INSERT INTO "UserBadge" ("UserId", "BadgeId", "EarnedAt") VALUES ($1, $2, NOW())',
          [userId, badgeId],
        );
        if (rewardCoins > 0) {
          await db.query(
            'UPDATE "UserProgress" SET "Coins" = "Coins" + $1 WHERE "UserId" = $2',
            [rewardCoins, userId],
          );
        }
        newBadgesAwarded.push(badgeId);
        ownedBadgeIds.push(badgeId); // Přidáme do lokálního pole, ať to v jednom běhu nedáme 2x
      }
    };

    // --- A. KONTROLA ZABITÝCH MONSTER ---
    // OPRAVENO NA: UserDefeatedMonster
    const killsRes = await db.query(
      'SELECT COUNT(*) FROM "UserDefeatedMonster" WHERE "UserId" = $1',
      [userId],
    );
    const totalKills = parseInt(killsRes.rows[0].count, 10);

    if (totalKills >= 1) await awardBadge(1, 50);
    if (totalKills >= 10) await awardBadge(2, 150);
    if (totalKills >= 25) await awardBadge(3, 300);
    if (totalKills >= 36) await awardBadge(4, 1000);

    // --- B. KONTROLA DOKONČENÝCH TRÉNINKŮ ---
    const workoutsRes = await db.query(
      'SELECT COUNT(*) FROM "Workout" WHERE "UserId" = $1 AND "EndTime" IS NOT NULL',
      [userId],
    );
    const totalWorkouts = parseInt(workoutsRes.rows[0].count, 10);

    if (totalWorkouts >= 10) await awardBadge(5, 100);
    if (totalWorkouts >= 50) await awardBadge(6, 250);
    if (totalWorkouts >= 100) await awardBadge(7, 500);

    // --- C. KONTROLA SUPLEMENTŮ ---
    const suppsRes = await db.query(
      'SELECT COUNT(*) FROM "SupplementLog" WHERE "UserId" = $1',
      [userId],
    );
    const totalSupps = parseInt(suppsRes.rows[0].count, 10);

    if (totalSupps >= 20) await awardBadge(8, 150);

    // --- D. KONTROLA STREAKU ---
    const progressRes = await db.query(
      'SELECT "WeeklyStreak" FROM "UserProgress" WHERE "UserId" = $1',
      [userId],
    );
    if (progressRes.rows.length > 0) {
      const streak = progressRes.rows[0].WeeklyStreak;
      if (streak >= 7) await awardBadge(9, 200);
    }

    return newBadgesAwarded;
  } catch (error) {
    console.error("Chyba ve službě pro odznaky:", error);
    return [];
  }
};
