const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect()
    .then(() => console.log('🟢 Úspěšně připojeno k Supabase PostgreSQL!'))
    .catch(err => console.error('🔴 Chyba připojení k databázi:', err.stack));

module.exports = pool;