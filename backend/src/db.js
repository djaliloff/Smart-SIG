const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  options: '-c search_path=app_data,public',
});

pool.on('connect', (client) => {
  client.query("SET search_path TO app_data, public");
});

pool.on('error', (err) => {
  console.error('❌ Unexpected DB pool error:', err);
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log(`⚡ Query [${duration}ms]: ${text.substring(0, 80)}...`);
    }
    return res;
  } catch (err) {
    console.error('❌ DB Query Error:', err.message);
    throw err;
  }
};

module.exports = { query, pool };
