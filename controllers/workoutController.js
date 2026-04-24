const db = require("../config/db");

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

exports.logSet = async (req, res) => {
    const { workoutId, exerciseId, weight, repetitions, attackType } = req.body;
    const userId = req.user.id;

    try {
        // 1. Získání profilu hráče
        const userProgress = await db.query(
            `SELECT "CurrentMonsterHP", "ActiveMonsterTierId", "MagicBooks", "XP", "Level" FROM "UserProgress" WHERE "UserId" = $1`,
            [userId]
        );

        if (userProgress.rows.length === 0) return res.status(404).json({ error: 'Profil nenalezen' });

        let { CurrentMonsterHP, ActiveMonsterTierId, MagicBooks, XP, Level } = userProgress.rows[0];

        // 2. Výpočet základního damage
        const baseDamage = weight * repetitions;
        
        // 3. Rozhodnutí monstra
        const defenses = ['MELEE', 'RANGED', 'SHIELD'];
        const monsterDefense = defenses[Math.floor(Math.random() * defenses.length)];

        // 4. Bojová matice
        let multiplier = 1.0;

        if (attackType === 'MELEE') {
            if (monsterDefense === 'SHIELD') multiplier = 1.5;
            if (monsterDefense === 'RANGED') multiplier = 0.5;
        } else if (attackType === 'RANGED') {
            if (monsterDefense === 'MELEE') multiplier = 1.5;
            if (monsterDefense === 'SHIELD') multiplier = 0.5;
        } else if (attackType === 'MAGIC') {
            const magicBonusMultiplier = 1 + parseFloat(userProgress.rows[0].TotalMagicBonus || 0);
            
            if (monsterDefense === 'SHIELD' || monsterDefense === 'RANGED') {
                multiplier = 1.5 * magicBonusMultiplier;
            }
            if (monsterDefense === 'MELEE') multiplier = 0.5;
        }

        const finalDamage = Math.round(baseDamage * multiplier);
        let xpEarned = Math.round(finalDamage / 10);
        let coinsEarned = 0;
        let isDead = false;

        // 5. Aplikace poškození
        CurrentMonsterHP -= finalDamage;

        // 6. Smrt monstra a výběr nového
        if (CurrentMonsterHP <= 0) {
            isDead = true;

            const currentMonsterRes = await db.query(
                `SELECT "MonsterId", "CoinsReward", "XPReward" FROM "MonsterTier" WHERE "Id" = $1`,
                [ActiveMonsterTierId]
            );

            if (currentMonsterRes.rows.length > 0) {
                const currentMonster = currentMonsterRes.rows[0];
                coinsEarned = currentMonster.CoinsReward; 
                xpEarned += currentMonster.XPReward; 

                await db.query(
                    `INSERT INTO "UserDefeatedMonster" ("UserId", "MonsterId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [userId, currentMonster.MonsterId]
                );
            }

            const newMonsterRes = await db.query(
                `SELECT "Id", "HP" FROM "MonsterTier" WHERE "Id" != $1 ORDER BY RANDOM() LIMIT 1`,
                [ActiveMonsterTierId]
            );

            if (newMonsterRes.rows.length > 0) {
                ActiveMonsterTierId = newMonsterRes.rows[0].Id;
                CurrentMonsterHP = newMonsterRes.rows[0].HP;
            } else {
                CurrentMonsterHP = 5000; 
            }
        }

        // 7. Aktualizace progrese hráče
        // 7. Aktualizace progrese hráče (Level-up logika)
        const totalXP = XP + xpEarned;
        const newLevel = Math.floor(Math.sqrt(totalXP / 100)) + 1;
        const isLevelUp = newLevel > Level;

        await db.query(
            `UPDATE "UserProgress" 
              SET "CurrentMonsterHP" = $1, "XP" = $2, "Level" = $3, "ActiveMonsterTierId" = $4, "Coins" = "Coins" + $5
              WHERE "UserId" = $6`,
            [CurrentMonsterHP, totalXP, newLevel, ActiveMonsterTierId, coinsEarned, userId]
        );

        // 8. Uložení setu s novými atributy
        let weResult = await db.query(
            `SELECT "Id" FROM "WorkoutExercise" WHERE "WorkoutId" = $1 AND "ExerciseId" = $2`,
            [workoutId, exerciseId]
        );

        let workoutExerciseId;
        if (weResult.rows.length === 0) {
            weResult = await db.query(
                `INSERT INTO "WorkoutExercise" ("WorkoutId", "ExerciseId", "OrderIndex", "IsFightingMonster") 
                  VALUES ($1, $2, 1, true) RETURNING "Id"`,
                [workoutId, exerciseId]
            );
        }
        workoutExerciseId = weResult.rows[0].Id;

        await db.query(
            `INSERT INTO "WorkoutSet" ("WorkoutExerciseId", "SetIndex", "Weight", "Repetitions", "Volume", "AttackType", "MonsterDefense", "DamageDealt")
              VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
            [workoutExerciseId, weight, repetitions, baseDamage, attackType, monsterDefense, finalDamage]
        );

        // 9. Vrácení výsledku pro vizualizaci na frontendu
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
            isLevelUp: isLevelUp,
            newLevel: newLevel
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Chyba při zapisování série a útoku.' });
    }
};

// Training finish + save
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

    res.status(200).json({
      message: "Trénink úspěšně ukončen a uložen!",
      workout: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při ukončování tréninku" });
  }
};

// History training (with Paging by 10 trainings)
exports.getMyWorkouts = async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const history = await db.query(
      `
            SELECT "Id", "Name", "EndTime", "IsPublic", "CreatedAt"
            FROM "Workout"
            WHERE "UserId" = $1 AND "EndTime" IS NOT NULL
            ORDER BY "EndTime" DESC
            LIMIT $2 OFFSET $3
        `,
      [userId, limit, offset],
    );

    res.status(200).json({
      page: page,
      limit: limit,
      returnedCount: history.rows.length,
      workouts: history.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při načítání historie tréninků" });
  }
};

// Načtení aktivního monstra pro konkrétního uživatele
exports.getActiveMonster = async (req, res) => {
    const userId = req.user.id;

    try {
        // Získáme HP z progresu a pokusíme se připojit jméno monstra z číselníků
        const result = await db.query(`
            SELECT up."CurrentMonsterHP", up."ActiveMonsterTierId", m."Name" as "MonsterName"
            FROM "UserProgress" up
            LEFT JOIN "MonsterTier" mt ON up."ActiveMonsterTierId" = mt."Id"
            LEFT JOIN "Monster" m ON mt."MonsterId" = m."Id"
            WHERE up."UserId" = $1
        `, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Profil hráče nenalezen.' });
        }

        const data = result.rows[0];
        
        res.status(200).json({
            monsterName: data.MonsterName || `Monstrum (Tier ${data.ActiveMonsterTierId})`,
            currentHp: data.CurrentMonsterHP,
            maxHp: 5000 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Chyba při načítání monstra.' });
    }
};
