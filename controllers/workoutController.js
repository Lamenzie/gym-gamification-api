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
  const { workoutId, exerciseId, weight, repetitions } = req.body;

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

    res.status(201).json({
      message: "Série úspěšně zaznamenána!",
      set: newSet.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při ukládání série" });
  }
};
