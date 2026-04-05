const db = require('../config/db');

exports.createWorkout = async (req, res) => {
    const { notes } = req.body;
    const userId = req.user.id; 

    try {
        const newWorkout = await db.query(
            'INSERT INTO "Workout" ("UserId", "Notes") VALUES ($1, $2) RETURNING *',
            [userId, notes]
        );

        res.status(201).json({ 
            message: 'Trénink úspěšně založen!', 
            workout: newWorkout.rows[0] 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Chyba při zakládání tréninku' });
    }
};