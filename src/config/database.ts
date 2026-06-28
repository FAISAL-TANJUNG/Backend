import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const db = mysql.createPool({
  // Coba ganti 'localhost' menjadi '127.0.0.1' jika masih gagal
  host: process.env.DB_HOST || '127.0.0.1', 
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'db_kos_suliati',
  port: 3306, // Port default MySQL
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+07:00', // Pastikan ini ada
  dateStrings: true    // Agar MySQL kirim string "2026-05-20" bukan objek Date
});

export default db;