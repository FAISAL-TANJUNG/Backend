import { Request, Response } from 'express';
import db from '../../config/database'; 

/* ======================================================
    HELPER: KUNCI ZONA WAKTU KE WIB (GMT+07:00)
====================================================== */
const getWIBDateObject = (dateInput?: string | Date) => {
    const date = dateInput ? new Date(dateInput) : new Date();
    const dateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
    return new Date(`${dateStr}T00:00:00+07:00`);
};

/* ======================================================
    HELPER: HITUNG TANGGAL BERIKUTNYA (+1 HARI PASTI)
====================================================== */
const hitungNextDatePasti = (tglTerakhir: string | Date) => {
    const d = new Date(tglTerakhir);
    d.setDate(d.getDate() + 1); // Kunci rumus tambah 1 hari murni
    return d.toISOString().split('T')[0];
};

/* ======================================================
    HELPER: HITUNG DENDA REAL-TIME (Rp 5.000 / Hari)
====================================================== */
const hitungDendaRealTime = (jatuhTempo: string | Date, tanggalReset?: string | Date, dendaBase: number = 0) => {
    const hariIni = getWIBDateObject();
    const deadline = tanggalReset ? getWIBDateObject(tanggalReset) : getWIBDateObject(jatuhTempo);

    if (hariIni > deadline) {
        const selisihWaktu = hariIni.getTime() - deadline.getTime();
        const selisihHari = Math.floor(selisihWaktu / (1000 * 3600 * 24));
        return (selisihHari * 5000) + Number(dendaBase);
    }
    return Number(dendaBase);
};

/* ======================================================
    SERVICE: UPDATE & PERBAIKAN TAGIHAN HARIAN BERANTAI
====================================================== */
export const perbaikanTagihanHarian = async (req: Request, res: Response) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Ambil semua tagihan harian yang Belum Lunas, urutkan dari yang TERLAMA (ASC)
        // Ini penting agar perbaikan tanggal pertamanya menjadi acuan induk buat tagihan berikutnya
        const [tagihanHarian]: any = await connection.query(
            `SELECT id_tagihan, id_penghuni, jatuh_tempo, nominal, status_bayar 
             FROM tb_tagihan 
             WHERE jenis_periode = 'Harian' AND status_bayar != 'Lunas'
             ORDER BY jatuh_tempo ASC`
        );

        const hariIniStr = getWIBDateObject().toISOString().split('T')[0];
        let jumlahDiperbarui = 0;

        for (const tagihan of tagihanHarian) {
            // Ambil objek tanggal murni WIB dan langsung terapkan rumus "+1 Hari" dari tanggal masuk/sistem yang error
            const tglTempoObj = getWIBDateObject(tagihan.jatuh_tempo);
            
            // 🔥 RUMUS UTAMA: Paksa tambah 1 hari murni untuk memperbaiki tanggal yang sempat mundur
            tglTempoObj.setDate(tglTempoObj.getDate() + 1); 
            const tglTempoBaruStr = tglTempoObj.toISOString().split('T')[0];

            // Hitung ulang denda berdasarkan tanggal jatuh tempo baru yang sudah sehat (+1 hari)
            const dendaAktif = hitungDendaRealTime(tglTempoBaruStr, undefined, 0);
            const totalAktif = Number(tagihan.nominal) + dendaAktif;
            const statusFix = dendaAktif > 0 ? 'Menunggak' : 'Belum Bayar';

            // 2. Update tagihan ini menggunakan tanggal baru hasil penambahan +1 hari
            await connection.query(
                `UPDATE tb_tagihan 
                 SET jatuh_tempo = ?, denda = ?, total = ?, status_bayar = ? 
                 WHERE id_tagihan = ?`,
                [tglTempoBaruStr, dendaAktif, totalAktif, statusFix, tagihan.id_tagihan]
            );

            // 3. REGENERASI & PENGEKORAN TAGIHAN BERIKUTNYA
            // Jika hari ini masih lebih maju daripada tanggal yang baru diperbarui
            if (hariIniStr > tglTempoBaruStr) {
                // Jalankan tracker tanggal berantai yang nilainya dinamis mengikuti tglTempoBaruStr
                let trackerTempoBerantai = hitungNextDatePasti(tglTempoBaruStr);

                // Lakukan looping berkelanjutan, membuat baris baru yang secara otomatis mengikuti tanggal di atasnya
                while (trackerTempoBerantai <= hariIniStr) {
                    const [exists]: any = await connection.query(
                        "SELECT id_tagihan FROM tb_tagihan WHERE id_penghuni = ? AND jatuh_tempo = ?",
                        [tagihan.id_penghuni, trackerTempoBerantai]
                    );

                    if (exists.length === 0) {
                        const [rowsPenghuni]: any = await connection.query(
                            'SELECT username, nama_lengkap FROM tb_penghuni WHERE id_penghuni = ?',
                            [tagihan.id_penghuni]
                        );

                        if (rowsPenghuni.length > 0) {
                            const p = rowsPenghuni[0];
                            await connection.query(
                                `INSERT INTO tb_tagihan (id_penghuni, username, nama_lengkap, jenis_periode, nominal, denda, total, jatuh_tempo, status_bayar, is_tagihan_awal, created_at) 
                                 VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'Belum Bayar', 0, NOW())`,
                                [tagihan.id_penghuni, p.username, p.nama_lengkap, 'Harian', tagihan.nominal, tagihan.nominal, trackerTempoBerantai]
                            );
                            console.log(`[BERANTAI HARIAN] Berhasil generate tagihan mengekor baru tanggal: ${trackerTempoBerantai}`);
                        }
                    }
                    // Tagihan lain di bawahnya otomatis mengikuti rantai tambah 1 hari dari tracker ini
                    trackerTempoBerantai = hitungNextDatePasti(trackerTempoBerantai);
                }
            }
            jumlahDiperbarui++;
        }

        await connection.commit();
        res.status(200).json({
            status: 'success',
            message: `Berhasil menerapkan rumus +1 hari berantai. ${jumlahDiperbarui} tagihan berhasil disesuaikan.`
        });
    } catch (error: any) {
        await connection.rollback();
        res.status(500).json({ status: 'error', message: error.message });
    } finally {
        connection.release();
    }
};