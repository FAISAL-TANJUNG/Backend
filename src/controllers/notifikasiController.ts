import { Request, Response } from 'express';
import * as OneSignal from 'onesignal-node';
import db from '../config/database';

const ONESIGNAL_APP_ID = '6fe75bb0-fd12-4fc5-b126-779035c9603b';

// Inisialisasi Client OneSignal untuk Push Notification Instan
const client = new OneSignal.Client(
    ONESIGNAL_APP_ID, 
    'os_v2_app_n7tvxmh5cjh4lmjgo6idlslahnwntg6zhplueofpbycrinyeklkwptl5vxfbpmdinprmwtpxxhfltpdvgpwvcf5vbkuig7etrvfh37y'
);

/* ======================================================
    0. UPDATE DEVICE TOKEN PENGHUNI & PEMILIK (DENGAN CODESYNC LOGOUT)
====================================================== */
export const updateDeviceToken = async (req: Request, res: Response) => {
    const { id, role, device_token } = req.body;
    
    try {
        if (!id || !role) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'ID dan Role wajib diisi.' 
            });
        }

        let querySql = '';
        let tokenParam = device_token ? device_token : null;
        let queryParams = [tokenParam, id];

        if (role === 'Penghuni') {
            querySql = `UPDATE tb_penghuni SET device_token = ? WHERE id_penghuni = ?`;
        } else if (role === 'Pemilik') {
            querySql = `UPDATE tb_user SET device_token = ? WHERE id_user = ?`;
        } else {
            return res.status(400).json({ status: 'error', message: 'Role tidak valid.' });
        }

        const [result]: any = await db.query(querySql, queryParams);

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                status: 'error', 
                message: `Data ${role} tidak ditemukan.` 
            });
        }

        console.log(`[DB TOKEN LOG]: Berhasil update status device_token untuk ${role} ID: ${id}`);

        res.json({ 
            status: 'success', 
            message: `Device token untuk ${role} berhasil diperbarui di database.` 
        });
    } catch (error: any) {
        console.error("[UPDATE TOKEN ERROR]:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/* ======================================================
    1. BUAT TAGIHAN BARU & LANGSUNG KIRIM NOTIFIKASI (INSTAN)
====================================================== */
export const tambahTagihan = async (req: Request, res: Response) => {
    const { id_penghuni, jenis_periode, nominal, jatuh_tempo } = req.body;
    let connection;

    try {
        if (!id_penghuni || !jenis_periode || !nominal || !jatuh_tempo) {
            return res.status(400).json({ status: 'error', message: 'Data input tidak lengkap.' });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const waktuSekarang = new Date();
        const opsiJakarta = { timeZone: "Asia/Jakarta" };
        
        const tglSekarangMurni = new Date(waktuSekarang.toLocaleDateString("en-CA", opsiJakarta));
        const deadlineDateRaw = new Date(jatuh_tempo);
        const tglDeadlineMurni = new Date(deadlineDateRaw.toLocaleDateString("en-CA", opsiJakarta));

        const formatTanggalIndo = (date: Date) => {
            return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };

        const tglJatuhTempoIndo = formatTanggalIndo(tglDeadlineMurni);
        const tglHariIniIndo = formatTanggalIndo(tglSekarangMurni);

        const [penghuniData]: any = await connection.query(
            `SELECT username, nama_lengkap, device_token FROM tb_penghuni WHERE id_penghuni = ? LIMIT 1`,
            [id_penghuni]
        );

        if (penghuniData.length === 0) {
            await connection.rollback();
            return res.status(404).json({ status: 'error', message: 'Penghuni tidak ditemukan.' });
        }

        const namaSapaan = penghuniData[0].username ? penghuniData[0].username : penghuniData[0].nama_lengkap;
        const deviceTokenDb = penghuniData[0].device_token;

        const selisihHari = Math.round((tglDeadlineMurni.getTime() - tglSekarangMurni.getTime()) / (1000 * 3600 * 24));

        const [resultTagihan]: any = await connection.query(
            `INSERT INTO tb_tagihan (id_penghuni, jenis_periode, nominal, denda, jatuh_tempo, status_bayar, created_at, last_notified_at) 
             VALUES (?, ?, ?, 0.00, ?, 'Belum Bayar', ?, ?)`,
            [id_penghuni, jenis_periode, nominal, jatuh_tempo, waktuSekarang, waktuSekarang]
        );
        const idTagihanBaru = resultTagihan.insertId;

        let title = "";
        let message = "";

        if (selisihHari < 0) {
            title = "⚠️ TAGIHAN MENUNGGAK";
            message = `Halo (${namaSapaan}), tagihan anda sudah lewat jatuh tempo dari tanggal ${tglJatuhTempoIndo} sampai sekarang tanggal ${tglHariIniIndo}, denda perhari 5 rb mohon dilunasi.`;
        } else {
            title = "🔔 Informasi Tagihan Baru";
            message = `Halo (${namaSapaan}), tagihan baru anda sudah tersedia sebagai berikut: Periode ${jenis_periode}, Batas Jatuh Tempo ${tglJatuhTempoIndo}. Mohon dilunasi sebelum lewat batas waktu.`;
        }

        await connection.query(
            `INSERT INTO tb_notifikasi (id_penghuni, judul, pesan, is_read, created_at, id_tagihan_ref) 
             VALUES (?, ?, ?, 0, ?, ?)`,
            [id_penghuni, title, message, waktuSekarang, idTagihanBaru]
        );

        await connection.commit();

        const payloadNotification: any = {
            contents: { 'en': message },
            headings: { 'en': title },
            collapse_id: `tagihan_${idTagihanBaru}`,
            android_accent_color: "FF0056B3",
            priority: 10
        };

        if (deviceTokenDb) {
            payloadNotification.include_subscription_ids = [deviceTokenDb];
        } else {
            payloadNotification.include_external_user_ids = [String(id_penghuni).trim()];
        }

        client.createNotification(payloadNotification)
        .then((response) => {
            console.log(`[INSTANT PUSH SUCCESS]: Sukses kirim ke user ID ${id_penghuni}`, response.body);
        }).catch((err) => {
            console.error(`[INSTANT PUSH ERROR]: Gagal kirim ke user ID ${id_penghuni}`, err?.body || err?.message || err);
        });

        res.status(201).json({ 
            status: 'success', 
            message: 'Tagihan berhasil dibuat dan notifikasi langsung dikirim ke HP penghuni.',
            id_tagihan: idTagihanBaru
        });

    } catch (error: any) {
        if (connection) await connection.rollback();
        console.error("[TAMBAH TAGIHAN ERROR]:", error);
        res.status(500).json({ status: 'error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

/* ======================================================
    2. AMBIL HISTORI NOTIFIKASI
====================================================== */
export const getNotifikasi = async (req: Request, res: Response) => {
    const { id_penghuni } = req.params;
    
    try {
        const queryNotif = `
            SELECT n.*, t.nominal, t.denda, t.jatuh_tempo, t.status_bayar
            FROM tb_notifikasi n
            LEFT JOIN tb_tagihan t ON n.id_tagihan_ref = t.id_tagihan
            WHERE n.id_penghuni = ? 
            ORDER BY n.created_at DESC 
            LIMIT 50`;

        const queryUnread = `
            SELECT COUNT(*) as total 
            FROM tb_notifikasi 
            WHERE id_penghuni = ? AND is_read = 0`;

        const [[rows], [unreadResult]]: any = await Promise.all([
            db.query(queryNotif, [id_penghuni]),
            db.query(queryUnread, [id_penghuni])
        ]);

        res.json({ 
            status: 'success', 
            unread: unreadResult[0].total, 
            data: rows 
        });
    } catch (error: any) {
        console.error("[GET NOTIFIKASI ERROR]:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/* ======================================================
    3. TANDAI SATU NOTIFIKASI SUDAH DIBACA
====================================================== */
export const tandaiSudahDibaca = async (req: Request, res: Response) => {
    const { id_notifikasi } = req.params;
    
    try {
        const [result]: any = await db.query(
            `UPDATE tb_notifikasi SET is_read = 1 WHERE id_notifikasi = ?`, 
            [id_notifikasi]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: 'error', message: 'Notifikasi tidak ditemukan' });
        }

        res.json({ status: 'success', message: 'Notifikasi telah dibaca' });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/* ======================================================
    4. TANDAI SEMUA SUDAH DIBACA
====================================================== */
export const tandaiSemuaSudahDibaca = async (req: Request, res: Response) => {
    const { id_penghuni } = req.params;
    
    try {
        await db.query(
            `UPDATE tb_notifikasi SET is_read = 1 WHERE id_penghuni = ? AND is_read = 0`, 
            [id_penghuni]
        );
        res.json({ status: 'success', message: 'Semua notifikasi telah dibaca' });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/* ======================================================
    5. AMBIL TAGIHAN AKTIF (Sinkronisasi App)
====================================================== */
export const getTagihanAktif = async (req: Request, res: Response) => {
    const { id_penghuni } = req.params;
    
    try {
        const [rows]: any = await db.query(
            `SELECT t.*, p.nama_lengkap 
             FROM tb_tagihan t
             JOIN tb_penghuni p ON t.id_penghuni = p.id_penghuni
             WHERE t.id_penghuni = ? AND t.status_bayar != 'Lunas'
             ORDER BY t.jatuh_tempo ASC`,
            [id_penghuni]
        );

        res.json({ status: 'success', data: rows });
    } catch (error: any) {
        console.error("[GET TAGIHAN AKTIF ERROR]:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/* ======================================================
    6. KIRIM PUSH NOTIFIKASI INSTAN SAAT PEMBAYARAN LUNAS
====================================================== */
export const kirimNotifikasiLunasInstan = async (idTagihan: number) => {
    let connection;
    try {
        if (!idTagihan) return;

        connection = await db.getConnection();

        // 1. Ambil data tagihan, transaksi terakhir, beserta token device penghuni
        const [dataSewa]: any = await connection.query(
            `SELECT t.id_tagihan, t.id_penghuni, t.jenis_periode, t.status_bayar,
                    p.nama_lengkap, p.username, p.device_token,
                    tx.metode_pembayaran, tx.rincian_pembayaran, tx.total, tx.nominal, tx.tgl_bayar
             FROM tb_tagihan t
             JOIN tb_penghuni p ON t.id_penghuni = p.id_penghuni
             LEFT JOIN tb_transaksi tx ON t.id_tagihan = tx.id_tagihan
             WHERE t.id_tagihan = ?
             ORDER BY tx.tgl_bayar DESC LIMIT 1`,
            [idTagihan]
        );

        if (dataSewa.length === 0) {
            console.log(`[REALTIME PUSH]: Tagihan ID ${idTagihan} tidak ditemukan.`);
            return;
        }

        const s = dataSewa[0];

        // Validasi ekstra: Pastikan datanya memang benar-benar sudah berstatus Lunas
        if (s.status_bayar.toLowerCase() !== 'lunas') {
            console.log(`[REALTIME PUSH]: Pembatalan push instan, status tagihan ID ${idTagihan} belum Lunas.`);
            return;
        }

        const namaSapaan = s.username ? s.username : s.nama_lengkap;
        const totalBayarMurni = s.total || s.nominal || 0;
        const formatTotal = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalBayarMurni);
        
        const waktuBayar = s.tgl_bayar ? new Date(s.tgl_bayar) : new Date();
        const jamFix = waktuBayar.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }) + " WIB";

        // 2. Deteksi metode pembayaran
        let viaPembayaran = 'Online Midtrans';
        const metode = s.metode_pembayaran ? s.metode_pembayaran.toLowerCase() : 'midtrans';

        if (metode === 'cash') {
            viaPembayaran = 'TUNAI (Cash)';
        } else if (metode === 'midtrans' && s.rincian_pembayaran) {
            const rincianRaw = String(s.rincian_pembayaran).toUpperCase();
            viaPembayaran = rincianRaw.includes('BCA') ? 'Transfer VA BCA' :
                            rincianRaw.includes('BNI') ? 'Transfer VA BNI' :
                            rincianRaw.includes('BRI') ? 'Transfer VA BRI' :
                            rincianRaw.includes('QRIS') ? 'Scan QRIS' :
                            rincianRaw.includes('GOPAY') ? 'E-Wallet GoPay' :
                            rincianRaw.includes('SHOPEEPAY') ? 'E-Wallet ShopeePay' : `Online Midtrans (${rincianRaw})`;
        }

        const title = metode === 'cash' ? "✅ Pembayaran Cash Diterima" : "✅ Pembayaran Midtrans Berhasil";
        const message = `Terima kasih Kak ${namaSapaan}! Pembayaran untuk periode ${s.jenis_periode} sejumlah ${formatTotal} via ${viaPembayaran} sukses divalidasi lunas pada jam ${jamFix}.`;

        // 3. Cek riwayat agar tidak double input notifikasi di tb_notifikasi
        const [checkNotifExists]: any = await connection.query(
            `SELECT id_notifikasi FROM tb_notifikasi WHERE id_tagihan_ref = ? AND (judul LIKE '%Diterima%' OR judul LIKE '%Berhasil%') LIMIT 1`,
            [idTagihan]
        );

        if (checkNotifExists.length === 0) {
            await connection.query(
                `INSERT INTO tb_notifikasi (id_penghuni, judul, pesan, is_read, created_at, id_tagihan_ref) 
                 VALUES (?, ?, ?, 0, NOW(), ?)`,
                [s.id_penghuni, title, message, idTagihan]
            );
            console.log(`[REALTIME ADD SYSTEM]: Sukses mencatat history inbox lunas untuk Tagihan ID: ${idTagihan}`);
        }

        // 4. Siapkan payload notification OneSignal Node SDK
        const payloadNotification: any = {
            contents: { 'en': message },
            headings: { 'en': title },
            collapse_id: `lunas_${idTagihan}_${Date.now()}`,
            android_accent_color: "FF00A65A", // Warna hijau tanda sukses lunas
            priority: 10
        };

        if (s.device_token) {
            payloadNotification.include_subscription_ids = [s.device_token];
        } else {
            payloadNotification.include_external_user_ids = [String(s.id_penghuni).trim()];
        }

        // 5. Eksekusi kirim ke banner HP pengguna
        client.createNotification(payloadNotification)
        .then((response) => {
            console.log(`[REALTIME PUSH SUCCESS]: Sukses kirim notifikasi lunas ke HP Penghuni ID: ${s.id_penghuni}`, response.body);
        }).catch((err) => {
            console.error(`[REALTIME PUSH ERROR]: Gagal kirim push lunas ke HP Penghuni ID: ${s.id_penghuni}`, err?.body || err?.message || err);
        });

    } catch (error: any) {
        console.error("[KIRIM NOTIFIKASI LUNAS ERROR]:", error);
    } finally {
        if (connection) connection.release();
    }
};