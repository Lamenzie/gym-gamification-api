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

    const progressQuery = await db.query(
      'SELECT "ActiveMonsterTierId", "CurrentMonsterHP" FROM "UserProgress" WHERE "UserId" = $1',
      [userId],
    );
    const progress = progressQuery.rows[0];

    let earnedXP = Math.floor(volume / 10);
    let responseMessage = "Série zaznamenána!";

    // FIGHT or FARMING
    if (isFightingMonster && progress && progress.ActiveMonsterTierId) {
      // FIGHT
      const newHP = progress.CurrentMonsterHP - volume;

      if (newHP <= 0) {
        earnedXP += 500;
        await db.query(
          'UPDATE "UserProgress" SET "XP" = "XP" + $1, "CurrentMonsterHP" = 12000, "ActiveMonsterTierId" = 2 WHERE "UserId" = $2',
          [earnedXP, userId],
        );
        responseMessage = `Kritický zásah! Monstrum padlo! Získáváš ${earnedXP} XP.`;
      } else {
        await db.query(
          'UPDATE "UserProgress" SET "XP" = "XP" + $1, "CurrentMonsterHP" = $2 WHERE "UserId" = $3',
          [earnedXP, newHP, userId],
        );
        responseMessage = `Zasáhl jsi monstrum za ${volume} damage, zbývá mu ${newHP} HP, dostáváš ${earnedXP} XP.`;
      }
    } else {
      // FARMING
      await db.query(
        'UPDATE "UserProgress" SET "XP" = "XP" + $1 WHERE "UserId" = $2',
        [earnedXP, userId],
      );
      responseMessage = `Série zaznamenána v režimu tréninku. Získáváš čistých ${earnedXP} XP.`;
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
