const { Pool } = require("pg");

// Žádné tahání z .env, dáváme to tam natvrdo, aby neměl na výběr
const pool = new Pool({
  connectionString: "postgresql://postgres.jfcxgfdfdcoyhiewmzkj:GymGamificationFai2026@aws-1-eu-central-2.pooler.supabase.com:6543/postgres",
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("connect", () => {
  console.log("✅ Úspěšně připojeno k Supabase databázi!");
});

pool.on("error", (err) => {
  console.error("🔴 Neočekávaná chyba databáze:", err);
});

module.exports = pool;