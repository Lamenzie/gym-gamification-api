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
  const {
    workoutId,
    exerciseId,
    weight,
    repetitions,
    isFightingMonster = true,
  } = req.body;
  const userId = req.user.id;

  try {
    let workoutExercise = await db.query(
      'SELECT "Id" FROM "WorkoutExercise" WHERE "WorkoutId" = $1 AND "ExerciseId" = $2',
      [workoutId, exerciseId],
    );

    if (workoutExercise.rows.length === 0) {
      const newWe = await db.query(
        'INSERT INTO "WorkoutExercise" ("WorkoutId", "ExerciseId", "OrderIndex") VALUES ($1, $2, 1) RETURNING "Id"',
        [workoutId, exerciseId],
      );
      workoutExercise = newWe;
    }
    const workoutExerciseId = workoutExercise.rows[0].Id;

    const volume = weight * repetitions;
    const newSet = await db.query(
      'INSERT INTO "WorkoutSet" ("WorkoutExerciseId", "Weight", "Repetitions", "Volume", "SetIndex") VALUES ($1, $2, $3, $4, 1) RETURNING *',
      [workoutExerciseId, weight, repetitions, volume],
    );

    // RPG System
    const progressQuery = await db.query(
      'SELECT "ActiveMonsterTierId", "CurrentMonsterHP" FROM "UserProgress" WHERE "UserId" = $1',
      [userId],
    );
    const progress = progressQuery.rows[0];

    let earnedXP = Math.floor(volume / 10);
    let responseMessage = "Série zaznamenána.";

  // 3.A: Zjištění a zápis Personal Rekordu (PR)
      let isNewPR = false;
      let prType = ""; // Pro lepší hlášku v odpovědi
      const prQuery = await db.query('SELECT * FROM "PersonalRecord" WHERE "UserId" = $1 AND "ExerciseId" = $2', [userId, exerciseId]);
      
      if (prQuery.rows.length === 0) {
          // Cvičí to poprvé = automaticky je to PR
          isNewPR = true;
          prType = "První zápis";
          await db.query('INSERT INTO "PersonalRecord" ("UserId", "ExerciseId", "MaxWeight", "MaxVolume") VALUES ($1, $2, $3, $4)', [userId, exerciseId, weight, volume]);
      } else {
          const currentPR = prQuery.rows[0];
          let newMaxWeight = currentPR.MaxWeight;
          let newMaxVolume = currentPR.MaxVolume;
          let shouldUpdatePR = false;

          // 1. Zkouška na Max Váhu (Tvoje pravidlo č. 2)
          if (weight > currentPR.MaxWeight) {
              isNewPR = true;
              shouldUpdatePR = true;
              newMaxWeight = weight;
              prType = "Nová Max Váha";
          }

          // 2. Zkouška na Max Objem s 50% pojistkou (Tvoje pravidlo č. 1)
          if (volume > currentPR.MaxVolume && weight >= (currentPR.MaxWeight * 0.5)) {
              isNewPR = true;
              shouldUpdatePR = true;
              newMaxVolume = volume;
              prType = prType === "" ? "Nový Max Objem" : "Max Váha + Max Objem";
          }

          // Pokud padl jakýkoliv rekord, uložíme ho do DB
          if (shouldUpdatePR) {
              await db.query(
                  'UPDATE "PersonalRecord" SET "MaxVolume" = $1, "MaxWeight" = $2, "UpdatedAt" = NOW() WHERE "Id" = $3', 
                  [newMaxVolume, newMaxWeight, currentPR.Id]
              );
          }
      }

      // 3.B: Samotný boj s podmínkou překonání PR
      if (isFightingMonster && progress && progress.ActiveMonsterTierId) {
          if (isNewPR) {
              // PR - DMG
              const newHP = progress.CurrentMonsterHP - volume;

              if (newHP <= 0) {
                  earnedXP += 500; 
                  await db.query('UPDATE "UserProgress" SET "XP" = "XP" + $1, "CurrentMonsterHP" = 12000, "ActiveMonsterTierId" = 2 WHERE "UserId" = $2', [earnedXP, userId]);
                  responseMessage = `🔥 PR (${prType})! Monstrum dostalo ${volume} damage a padlo! Získáváš ${earnedXP} XP.`;
              } else {
                  await db.query('UPDATE "UserProgress" SET "XP" = "XP" + $1, "CurrentMonsterHP" = $2 WHERE "UserId" = $3', [earnedXP, newHP, userId]);
                  responseMessage = `🔥 PR (${prType})! Uštědřil jsi ${volume} damage, monstru zbývá ${newHP} HP. Získáváš ${earnedXP} XP.`;
              }
          } else {
              // NO PR - NO DMG
              await db.query('UPDATE "UserProgress" SET "XP" = "XP" + $1 WHERE "UserId" = $2', [earnedXP, userId]);
              responseMessage = `Série odcvičena. Nepřekonal jsi své maximum, monstrum se ti vysmálo (0 damage). Získáváš ${earnedXP} XP za snahu.`;
          }
      } else {
          // Just XP
          await db.query('UPDATE "UserProgress" SET "XP" = "XP" + $1 WHERE "UserId" = $2', [earnedXP, userId]);
          responseMessage = `Série v režimu tréninku. Získáváš ${earnedXP} XP.`;
      }

    res.status(201).json({
      message: responseMessage,
      set: newSet.rows[0],
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Chyba při ukládání série a výpočtu damage" });
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
