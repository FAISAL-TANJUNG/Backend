import express, { Application } from 'express';
import cors from 'cors';
import apiRoutes from './routes/apiRoutes'; 
import { initCronJobs } from './cron/reminderCron'; 

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());

// Menggunakan prefiks /api untuk semua rute
app.use('/api', apiRoutes);

/**
 * MENJALANKAN MESIN CRON JOB
 * initCronJobs akan menjalankan sinkronisasi notifikasi & pengingat OneSignal.
 * Pengecekan dilakukan setiap jam ('0 * * * *').
 */
initCronJobs();

const PORT = process.env.PORT || 3000;

// === PERUBAHAN DI SINI: Tambahkan '0.0.0.0' agar bisa diakses dari HP Android ===
app.listen(Number(PORT), '0.0.0.0', () => {
    // Memastikan waktu logging menggunakan zona Asia/Jakarta (WIB)
    const serverTimeWIB = new Date().toLocaleString("id-ID", { 
        timeZone: "Asia/Jakarta",
        dateStyle: 'long',
        timeStyle: 'medium'
    });

    console.log('====================================================');
    console.log(`🚀 Server Kos Suliati running on port ${PORT}`);
    console.log(`🌐 Akses dari Jaringan Luar: http://192.168.100.13:${PORT}`);
    console.log(`🕒 Waktu Server (WIB): ${serverTimeWIB}`);
    console.log(`📅 Cron Tagihan (Locking Tgl): AKTIF`);
    console.log(`🔔 Reminder OneSignal & Notif: AKTIF`);
    console.log(`💳 Log Notif Pembayaran (Midtrans & Cash): AKTIF (Real-time)`); // <-- Log baru ditambahkan
    console.log(`🔄 Inbox Management & Tab Filter: AKTIF (Sync Real-time)`);   // <-- Log diperbarui
    console.log(`💡 Status: Menunggu jadwal pengecekan otomatis...`);
    console.log('====================================================');
});