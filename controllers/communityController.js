const db = require("../config/db");

// 1. Searching Users
exports.searchUsers = async (req, res) => {
  const searchQuery = req.query.q;
  const currentUserId = req.user.id;

  if (!searchQuery || searchQuery.length < 3) {
    return res.status(400).json({ error: "Zadejte alespoň 3 znaky pro vyhledávání." });
  }

  try {
    const users = await db.query(
      `SELECT 
          u."Id", 
          u."UserName", 
          up."Level",
          CASE WHEN f."FollowingId" IS NOT NULL THEN true ELSE false END as "isFollowing"
      FROM "User" u
      LEFT JOIN "UserProgress" up ON u."Id" = up."UserId"
      LEFT JOIN "Follower" f ON f."FollowingId" = u."Id" AND f."FollowerId" = $2
      WHERE u."UserName" ILIKE $1 AND u."Id" != $2
      LIMIT 10`,
      [`%${searchQuery}%`, currentUserId]
    );

    res.status(200).json({ results: users.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při vyhledávání" });
  }
};

// 2. Button Follow/Unfollow
exports.toggleFollow = async (req, res) => {
  const followerId = req.user.id;
  const followingId = req.params.id;

  if (followerId === followingId) {
    return res.status(400).json({ error: "Nemůžeš sledovat sám sebe." });
  }

  try {
    const existingFollow = await db.query(
      'SELECT * FROM "Follower" WHERE "FollowerId" = $1 AND "FollowingId" = $2',
      [followerId, followingId]
    );

    if (existingFollow.rows.length > 0) {
      await db.query(
        'DELETE FROM "Follower" WHERE "FollowerId" = $1 AND "FollowingId" = $2',
        [followerId, followingId]
      );
      return res.status(200).json({ message: "Sledování zrušeno." });
    } else {
      await db.query(
        'INSERT INTO "Follower" ("FollowerId", "FollowingId") VALUES ($1, $2)',
        [followerId, followingId]
      );
      return res.status(201).json({ message: "Nyní uživatele sleduješ!" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při úpravě sledování" });
  }
};

// 3. Community Feed
exports.getFeed = async (req, res) => {
  const userId = req.user.id;

  try {
    const feed = await db.query(
      `SELECT w."Id" as "WorkoutId", w."Name" as "WorkoutName", w."EndTime", u."UserName", u."Id" as "UserId"
      FROM "Workout" w
      JOIN "User" u ON w."UserId" = u."Id"
      JOIN "Follower" f ON f."FollowingId" = u."Id"
      WHERE f."FollowerId" = $1 AND w."IsPublic" = true AND w."EndTime" IS NOT NULL
      ORDER BY w."EndTime" DESC
      LIMIT 20`,
      [userId]
    );

    res.status(200).json({ feed: feed.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při načítání feedu" });
  }
};

// 4. Public profile
exports.getPublicProfile = async (req, res) => {
  const targetUserId = req.params.id;
  try {
    const profile = await db.query(
      `SELECT u."UserName", up."Level", up."XP", up."WeeklyStreak"
      FROM "User" u
      JOIN "UserProgress" up ON u."Id" = up."UserId"
      WHERE u."Id" = $1`,
      [targetUserId]
    );

    if (profile.rows.length === 0) {
      return res.status(404).json({ error: "Uživatel nenalezen" });
    }

    res.status(200).json({ profile: profile.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chyba při načítání cizího profilu" });
  }
};

// 5. Žebříček nejlepších hráčů (Leaderboard)
exports.getLeaderboard = async (req, res) => {
    try {
        const leaderboard = await db.query(`
            SELECT u."Id", u."UserName", up."Level", up."XP"
            FROM "User" u
            JOIN "UserProgress" up ON u."Id" = up."UserId"
            ORDER BY up."XP" DESC
            LIMIT 50
        `);
        res.status(200).json({ leaderboard: leaderboard.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Chyba při načítání žebříčku." });
    }
};

// 6. Moje komunitní statistiky (Pro hlavní stránku Profilu)
exports.getMyCommunityStats = async (req, res) => {
    const userId = req.user.id;
    try {
        const stats = await db.query(`
            SELECT 
                u."UserName", 
                up."Level", 
                up."XP",
                (SELECT COUNT(*) FROM "Follower" WHERE "FollowingId" = $1) as "FollowersCount",
                (SELECT COUNT(*) FROM "Follower" WHERE "FollowerId" = $1) as "FollowingCount"
            FROM "User" u
            LEFT JOIN "UserProgress" up ON u."Id" = up."UserId"
            WHERE u."Id" = $1
        `, [userId]);
        
        res.status(200).json(stats.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Chyba při načítání statistik profilu." });
    }
};

// 7. Kdo mě sleduje (Followers)
exports.getFollowers = async (req, res) => {
    const userId = req.user.id;
    try {
        const followers = await db.query(`
            SELECT u."Id", u."UserName", up."Level"
            FROM "Follower" f
            JOIN "User" u ON f."FollowerId" = u."Id"
            LEFT JOIN "UserProgress" up ON u."Id" = up."UserId"
            WHERE f."FollowingId" = $1
            ORDER BY u."UserName" ASC
        `, [userId]);
        
        res.status(200).json({ users: followers.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Chyba při načítání sledujících." });
    }
};

// 8. Koho sleduji já (Following)
exports.getFollowing = async (req, res) => {
    const userId = req.user.id;
    try {
        const following = await db.query(`
            SELECT u."Id", u."UserName", up."Level"
            FROM "Follower" f
            JOIN "User" u ON f."FollowingId" = u."Id"
            LEFT JOIN "UserProgress" up ON u."Id" = up."UserId"
            WHERE f."FollowerId" = $1
            ORDER BY u."UserName" ASC
        `, [userId]);
        
        res.status(200).json({ users: following.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Chyba při načítání sledovaných." });
    }
};