const db = require("../config/db");

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
        // 1. Získání profilu hráče
        const userProgress = await db.query(
            `SELECT "CurrentMonsterHP", "ActiveMonsterTierId", "MagicBooks", "XP", "Level", "TotalMagicBonus" 
            FROM "UserProgress" WHERE "UserId" = $1`,
            [userId]
        );

        if (userProgress.rows.length === 0) return res.status(404).json({ error: 'Profil nenalezen' });

        let { CurrentMonsterHP, ActiveMonsterTierId, MagicBooks, XP, Level, TotalMagicBonus } = userProgress.rows[0];

        // 1.1 Sečtení bonusů z právě VYBAVENÝCH předmětů
        const equipRes = await db.query(`
            SELECT 
                COALESCE(SUM(e."BonusDMG"), 0) as "EquipDMG",
                COALESCE(SUM(e."BonusCoins"), 0) as "EquipCoins",
                COALESCE(SUM(e."BonusXP"), 0) as "EquipXP"
            FROM "UserInventory" ui
            JOIN "Equipment" e ON ui."EquipmentId" = e."Id"
            WHERE ui."UserId" = $1 AND ui."IsEquipped" = true
        `, [userId]);

        let { EquipDMG, EquipCoins, EquipXP } = equipRes.rows[0];
        EquipDMG = parseFloat(EquipDMG);
        EquipCoins = parseFloat(EquipCoins);
        EquipXP = parseFloat(EquipXP);

        // 2. Výpočet základního damage
        const baseDamage = weight * repetitions;
        
        // 3. Rozhodnutí monstra
        const defenses = ['MELEE', 'RANGED', 'SHIELD'];
        const monsterDefense = defenses[Math.floor(Math.random() * defenses.length)];

        // 4. Bojová matice a Aplikace Bonusů
        let multiplier = 1.0;

        // A. Zjištění slabiny/odolnosti
        if (attackType === 'MELEE') {
            if (monsterDefense === 'SHIELD') multiplier = 1.5;
            if (monsterDefense === 'RANGED') multiplier = 0.5;
        } else if (attackType === 'RANGED') {
            if (monsterDefense === 'MELEE') multiplier = 1.5;
            if (monsterDefense === 'SHIELD') multiplier = 0.5;
        } else if (attackType === 'MAGIC') {
            if (monsterDefense === 'SHIELD' || monsterDefense === 'RANGED') multiplier = 1.5;
            if (monsterDefense === 'MELEE') multiplier = 0.5;
        }

        let finalDamage = baseDamage * multiplier;

        // B. Aplikace statů z Vybavení a Knih
        if (attackType === 'MAGIC') {
            const magicBonusMultiplier = 1 + parseFloat(TotalMagicBonus || 0);
            finalDamage = finalDamage * magicBonusMultiplier;
        } else {
            // MELEE a RANGED útoky čerpají z fyzických zbraní
            const physicalBonusMultiplier = 1 + EquipDMG;
            finalDamage = finalDamage * physicalBonusMultiplier;
        }

        finalDamage = Math.round(finalDamage);

        // Zisk XP za samotný úder
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
                
                // Získání základu z monstra
                let baseCoins = currentMonster.CoinsReward || 0;
                let baseXP = currentMonster.XPReward || 0;

                // Aplikace bonusů za zbroj (EquipCoins a EquipXP)
                coinsEarned = Math.round(baseCoins * (1 + EquipCoins));
                xpEarned += Math.round(baseXP * (1 + EquipXP)); 

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

        // 8.1 AKTUALIZACE STATISTIK PRO HISTORII TRÉNINKU
        const killedCount = isDead ? 1 : 0;
        await db.query(
            `UPDATE "Workout" 
            SET "TotalDamage" = COALESCE("TotalDamage", 0) + $1,
            "TotalXP" = COALESCE("TotalXP", 0) + $2,
            "TotalCoins" = COALESCE("TotalCoins", 0) + $3,
            "MonstersKilled" = COALESCE("MonstersKilled", 0) + $4
            WHERE "Id" = $5`,
            [finalDamage, xpEarned, coinsEarned, killedCount, workoutId]
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
exports.getMyWorkouts = async (req, res) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        // TADY JSOU TY 4 NOVÉ SLOUPCE PRO KARTY V APLIKACI
        const history = await db.query(
        `
            SELECT 
                "Id", 
                "Name", 
                "EndTime", 
                "IsPublic", 
                "CreatedAt",
                "TotalDamage",
                "TotalXP",
                "TotalCoins",
                "MonstersKilled"
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
            workouts: history.rows, // Toto je klíč `workouts`, na který frontend čeká
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Chyba při načítání historie tréninků" });
    }
};

// --- 5. DETAIL KONKRÉTNÍHO TRÉNINKU (Pro Modal okno) ---
exports.getWorkoutDetail = async (req, res) => {
    const { workoutId } = req.params;
    const userId = req.user.id;

    try {
        const workoutCheck = await db.query(`SELECT "Id" FROM "Workout" WHERE "Id" = $1 AND "UserId" = $2`, [workoutId, userId]);
        if (workoutCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Přístup odepřen nebo trénink neexistuje.' });
        }

        const detailRes = await db.query(`
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
        `, [workoutId]);

        const exercisesMap = {};
        detailRes.rows.forEach(row => {
            if (!exercisesMap[row.WorkoutExerciseId]) {
                exercisesMap[row.WorkoutExerciseId] = {
                    id: row.WorkoutExerciseId,
                    name: row.ExerciseName || "Neznámý cvik",
                    sets: []
                };
            }
            exercisesMap[row.WorkoutExerciseId].sets.push({
                setIndex: row.SetIndex,
                weight: row.Weight,
                repetitions: row.Repetitions,
                damageDealt: row.DamageDealt,
                attackType: row.AttackType
            });
        });

        res.status(200).json({ exercises: Object.values(exercisesMap) });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Chyba při načítání detailu tréninku.' });
    }
};

// --- 6. NAČTENÍ AKTIVNÍHO MONSTRA ---
exports.getActiveMonster = async (req, res) => {
    const userId = req.user.id;

    try {
        const result = await db.query(`
            SELECT up."CurrentMonsterHP", up."ActiveMonsterTierId", m."Name" as "MonsterName", mt."HP" as "MaxHP"
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
            maxHp: data.MaxHP || 5000 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Chyba při načítání monstra.' });
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
        res.status(500).json({ error: 'Chyba při načítání seznamu cviků.' });
    }
};