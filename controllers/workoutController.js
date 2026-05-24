const db = require("../config/db");
const badgeService = require("../services/badgeService");

// --- 1. ZALOŽENÍ NOVÉHO TRÉNINKU ---
exports.createWorkout = async (req, res) => {
  const { notes } = req.body;
  const userId = req.user.id;

  try {
    const newWorkout = await db.query(
      'INSERT INTO "Workout" ("UserId", "Notes") VALUES ($1, $2) RETURNING *',
      [userId, notes],
    );

    res.status(201).json({
      message: "Trénink úspěšně založen!",
      workout: newWorkout.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při zakládání tréninku" });
  }
};

// --- 2. ODCVIČENÍ SÉRIE A ÚTOK NA MONSTRUM ---
exports.logSet = async (req, res) => {
  const { workoutId, exerciseId, weight, repetitions, attackType } = req.body;
  const userId = req.user.id;

  try {
    // 1. Získání profilu hráče VČETNĚ DAT O SOUČASNÉM MONSTRU
    const userProgress = await db.query(
      `SELECT up."CurrentMonsterHP", up."ActiveMonsterTierId", up."MagicBooks", up."XP", up."Level", up."TotalMagicBonus",
                    mt."BaseHP", mt."CoinsReward", mt."XPReward", mt."MonsterId", mt."TierLevel"
             FROM "UserProgress" up
             JOIN "MonsterTier" mt ON up."ActiveMonsterTierId" = mt."Id"
             WHERE up."UserId" = $1`,
      [userId],
    );

    if (userProgress.rows.length === 0)
      return res.status(404).json({ error: "Profil nenalezen" });

    let {
      CurrentMonsterHP,
      ActiveMonsterTierId,
      XP,
      Level,
      TotalMagicBonus,
      BaseHP,
      CoinsReward,
      XPReward,
      MonsterId,
      TierLevel,
    } = userProgress.rows[0];

    // 1.1 Sečtení bonusů z vybavení
    const equipRes = await db.query(
      `SELECT COALESCE(SUM(e."BonusDMG"), 0) as "EquipDMG", COALESCE(SUM(e."BonusCoins"), 0) as "EquipCoins", COALESCE(SUM(e."BonusXP"), 0) as "EquipXP"
             FROM "UserInventory" ui JOIN "Equipment" e ON ui."EquipmentId" = e."Id"
             WHERE ui."UserId" = $1 AND ui."IsEquipped" = true`,
      [userId],
    );

    let EquipDMG = parseFloat(equipRes.rows[0].EquipDMG);
    let EquipCoins = parseFloat(equipRes.rows[0].EquipCoins);
    let EquipXP = parseFloat(equipRes.rows[0].EquipXP);

    // 2. Výpočet základního damage
    const baseDamage = weight * repetitions;
    const defenses = ["MELEE", "RANGED", "SHIELD"];
    const monsterDefense =
      defenses[Math.floor(Math.random() * defenses.length)];

    // 3. Bojová matice a Bonusy
    let multiplier = 1.0;
    if (attackType === "MELEE")
      multiplier =
        monsterDefense === "SHIELD"
          ? 1.5
          : monsterDefense === "RANGED"
            ? 0.5
            : 1.0;
    else if (attackType === "RANGED")
      multiplier =
        monsterDefense === "MELEE"
          ? 1.5
          : monsterDefense === "SHIELD"
            ? 0.5
            : 1.0;
    else if (attackType === "MAGIC")
      multiplier = monsterDefense === "MELEE" ? 0.5 : 1.5;

    let finalDamage = baseDamage * multiplier;
    finalDamage =
      attackType === "MAGIC"
        ? finalDamage * (1 + parseFloat(TotalMagicBonus || 0))
        : finalDamage * (1 + EquipDMG);
    finalDamage = Math.round(finalDamage);

    // 4. Výpočet odměn a HP zlomků (Zlaťáky po 25%)
    let xpEarned = Math.round(finalDamage / 10);
    let coinsEarned = 0;
    let isDead = false;

    const prevHpPct = CurrentMonsterHP / BaseHP;
    CurrentMonsterHP -= finalDamage;
    const newHpPct = CurrentMonsterHP / BaseHP;

    const partialCoins = Math.round((CoinsReward || 0) * 0.25);

    if (prevHpPct >= 0.75 && newHpPct < 0.75) coinsEarned += partialCoins;
    if (prevHpPct >= 0.5 && newHpPct < 0.5) coinsEarned += partialCoins;
    if (prevHpPct >= 0.25 && newHpPct < 0.25) coinsEarned += partialCoins;

    // 5. Smrt monstra a CHYTRÝ VÝBĚR NOVÉHO (Postupný Tiering)
    if (CurrentMonsterHP <= 0) {
      isDead = true;
      if (prevHpPct >= 0) coinsEarned += partialCoins; 
      xpEarned += XPReward || 0; 

      await db.query(
        `INSERT INTO "UserDefeatedMonster" ("UserId", "MonsterId", "TierLevel") 
         VALUES ($1, $2, $3) 
         ON CONFLICT ("UserId", "MonsterId", "TierLevel") DO NOTHING`,
        [userId, MonsterId, TierLevel],
      );

      const availableTargetsRes = await db.query(
        `WITH MaxDefeated AS (
           SELECT "MonsterId", MAX("TierLevel") as "MaxTier"
           FROM "UserDefeatedMonster"
           WHERE "UserId" = $1
           GROUP BY "MonsterId"
         )
         SELECT mt."Id", mt."BaseHP"
         FROM "MonsterTier" mt
         LEFT JOIN MaxDefeated md ON mt."MonsterId" = md."MonsterId"
         WHERE 
           (md."MaxTier" IS NULL AND mt."TierLevel" = 1)
           OR 
           (md."MaxTier" IS NOT NULL AND mt."TierLevel" = md."MaxTier" + 1)`,
        [userId]
      );

      if (availableTargetsRes.rows.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableTargetsRes.rows.length);
        const nextMonster = availableTargetsRes.rows[randomIndex];

        ActiveMonsterTierId = nextMonster.Id;
        CurrentMonsterHP = nextMonster.BaseHP;
      } else {
        await db.query(`DELETE FROM "UserDefeatedMonster" WHERE "UserId" = $1`, [userId]);
        
        const resetRes = await db.query(
          `SELECT "Id", "BaseHP" FROM "MonsterTier" ORDER BY "Id" ASC LIMIT 1`,
        );
        ActiveMonsterTierId = resetRes.rows[0].Id;
        CurrentMonsterHP = resetRes.rows[0].BaseHP;
      }
    }

    coinsEarned = Math.round(coinsEarned * (1 + EquipCoins));
    xpEarned = Math.round(xpEarned * (1 + EquipXP));

    const totalXP = XP + xpEarned;
    const newLevel = Math.floor(Math.sqrt(totalXP / 100)) + 1;
    const isLevelUp = newLevel > Level;

    await db.query(
      `UPDATE "UserProgress" SET "CurrentMonsterHP" = $1, "XP" = $2, "Level" = $3, "ActiveMonsterTierId" = $4, "Coins" = "Coins" + $5 WHERE "UserId" = $6`,
      [
        CurrentMonsterHP,
        totalXP,
        newLevel,
        ActiveMonsterTierId,
        coinsEarned,
        userId,
      ],
    );

    let weResult = await db.query(
      `SELECT "Id" FROM "WorkoutExercise" WHERE "WorkoutId" = $1 AND "ExerciseId" = $2`,
      [workoutId, exerciseId],
    );
    let workoutExerciseId;
    if (weResult.rows.length === 0) {
      weResult = await db.query(
        `INSERT INTO "WorkoutExercise" ("WorkoutId", "ExerciseId", "OrderIndex", "IsFightingMonster") VALUES ($1, $2, 1, true) RETURNING "Id"`,
        [workoutId, exerciseId],
      );
    }
    workoutExerciseId = weResult.rows[0].Id;

    await db.query(
      `INSERT INTO "WorkoutSet" ("WorkoutExerciseId", "SetIndex", "Weight", "Repetitions", "Volume", "AttackType", "MonsterDefense", "DamageDealt") VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
      [
        workoutExerciseId,
        weight,
        repetitions,
        baseDamage,
        attackType,
        monsterDefense,
        finalDamage,
      ],
    );

    const killedCount = isDead ? 1 : 0;
    await db.query(
      `UPDATE "Workout" SET "TotalDamage" = COALESCE("TotalDamage", 0) + $1, "TotalXP" = COALESCE("TotalXP", 0) + $2, "TotalCoins" = COALESCE("TotalCoins", 0) + $3, "MonstersKilled" = COALESCE("MonstersKilled", 0) + $4 WHERE "Id" = $5`,
      [finalDamage, xpEarned, coinsEarned, killedCount, workoutId],
    );

    res.status(200).json({
      message: `Útok: ${attackType} vs ${monsterDefense}`,
      baseDamage,
      multiplier,
      finalDamage,
      xpEarned,
      coinsEarned,
      monsterDefense,
      isDead,
      newMonsterHp: CurrentMonsterHP,
      isLevelUp,
      newLevel,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při zapisování série a útoku." });
  }
};

// --- 3. UKONČENÍ TRÉNINKU ---
exports.finishWorkout = async (req, res) => {
  const { workoutId, name, isPublic } = req.body; 
  const userId = req.user.id;

  try {
    const result = await db.query(
      'UPDATE "Workout" SET "Name" = $1, "IsPublic" = $2, "EndTime" = NOW() WHERE "Id" = $3 AND "UserId" = $4 RETURNING *',
      [name || "Můj trénink", isPublic || false, workoutId, userId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Trénink nenalezen nebo k němu nemáš přístup." });
    }

    await badgeService.checkAndAwardAllBadges(userId);

    res.status(200).json({
      message: "Trénink úspěšně ukončen a uložen!",
      workout: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při ukončování tréninku" });
  }
};

// --- 4. NAČTENÍ HISTORIE TRÉNINKŮ (Výpis do Deníku) ---
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const historyRes = await db.query(
      `SELECT * FROM "Workout"
       WHERE "UserId" = $1 AND "EndTime" IS NOT NULL
       ORDER BY "EndTime" DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    // Backend pošle čistá data z databáze, nic nepřičítáme!
    res.json({ workouts: historyRes.rows });
  } catch (error) {
    console.error("Chyba historie:", error);
    res.status(500).json({ error: "Chyba při načítání historie" });
  }
};

// --- 5. DETAIL KONKRÉTNÍHO TRÉNINKU (Pro Modal okno) ---
exports.getWorkoutDetail = async (req, res) => {
  const { workoutId } = req.params;
  const userId = req.user.id;

  try {
    const workoutCheck = await db.query(
      `SELECT "Id" FROM "Workout" WHERE "Id" = $1 AND "UserId" = $2`,
      [workoutId, userId],
    );
    if (workoutCheck.rows.length === 0) {
      return res
        .status(403)
        .json({ error: "Přístup odepřen nebo trénink neexistuje." });
    }

    const detailRes = await db.query(
      `
            SELECT 
                we."Id" as "WorkoutExerciseId",
                e."Name" as "ExerciseName",
                ws."SetIndex",
                ws."Weight",
                ws."Repetitions",
                ws."DamageDealt",
                ws."AttackType"
            FROM "WorkoutExercise" we
            LEFT JOIN "Exercise" e ON we."ExerciseId" = e."Id"
            JOIN "WorkoutSet" ws ON we."Id" = ws."WorkoutExerciseId"
            WHERE we."WorkoutId" = $1
            ORDER BY we."OrderIndex" ASC, ws."SetIndex" ASC
        `,
      [workoutId],
    );

    const exercisesMap = {};
    detailRes.rows.forEach((row) => {
      if (!exercisesMap[row.WorkoutExerciseId]) {
        exercisesMap[row.WorkoutExerciseId] = {
          id: row.WorkoutExerciseId,
          name: row.ExerciseName || "Neznámý cvik",
          sets: [],
        };
      }
      exercisesMap[row.WorkoutExerciseId].sets.push({
        setIndex: row.SetIndex,
        weight: row.Weight,
        repetitions: row.Repetitions,
        damageDealt: row.DamageDealt,
        attackType: row.AttackType,
      });
    });

    res.status(200).json({ exercises: Object.values(exercisesMap) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při načítání detailu tréninku." });
  }
};

// --- 6. NAČTENÍ AKTIVNÍHO MONSTRA ---
exports.getActiveMonster = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await db.query(
      `
              SELECT up."CurrentMonsterHP", up."ActiveMonsterTierId", 
                     m."Name" as "MonsterName", m."SpriteName",
                     mt."TierLevel", mt."BaseHP" as "MaxHP"
              FROM "UserProgress" up
              LEFT JOIN "MonsterTier" mt ON up."ActiveMonsterTierId" = mt."Id"
              LEFT JOIN "Monster" m ON mt."MonsterId" = m."Id"
              WHERE up."UserId" = $1
            `,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Profil hráče nenalezen." });
    }

    const data = result.rows[0];

    res.status(200).json({
      monsterName:
        data.MonsterName || `Monstrum (Tier ${data.ActiveMonsterTierId})`,
      currentHp: data.CurrentMonsterHP,
      maxHp: data.MaxHP || 5000,
      spriteName: data.SpriteName, 
      tierLevel: data.TierLevel, 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při načítání monstra." });
  }
};

// --- 7. NAČTENÍ VŠECH CVIKŮ (Pro výběr do tréninku) ---
exports.getAllExercises = async (req, res) => {
  try {
    const result = await db.query(`
            SELECT "Id", "Name", "Description", "MuscleGroup"
            FROM "Exercise" 
            ORDER BY "Name" ASC
        `);

    res.status(200).json({ exercises: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při načítání seznamu cviků." });
  }
};

// --- 8. ZÁPIS DO WARNING LOGU ---
exports.logWarning = async (req, res) => {
  const { workoutId, type, message, newValue } = req.body;
  const userId = req.user.id;

  try {
    // Využije tabulku WarningLog
    await db.query(
      `INSERT INTO "WarningLog" ("UserId", "WorkoutId", "Type", "Message", "NewValue") VALUES ($1, $2, $3, $4, $5)`,
      [userId, workoutId, type, message, newValue]
    );
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Chyba zápisu WarningLogu:", err);
    res.status(500).json({ error: "Nelze uložit varování" });
  }
};