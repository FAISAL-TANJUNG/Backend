import { Request, Response } from 'express';
import db from '../config/database';

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
    HELPER: HITUNG TANGGAL BERIKUTNYA
====================================================== */
const hitungNextDatePasti = (tglTerakhir: string | Date, jenis: string) => {
    const d = new Date(tglTerakhir);
    const p = jenis.trim();

    if (p === '1 Tahun') d.setFullYear(d.getFullYear() + 1);
    else if (p === '6 Bulan') d.setMonth(d.getMonth() + 6);
    else if (p === '3 Bulan') d.setMonth(d.getMonth() + 3);
    else if (p === 'Bulanan') d.setMonth(d.getMonth() + 1);
    else if (p === 'Mingguan') d.setDate(d.getDate() + 7);
    else if (p === 'Harian') d.setDate(d.getDate() + 1);

    return d.toISOString().split('T')[0];
};

/* ======================================================
    HELPER: HITUNG DENDA REAL-TIME (Rp 5.000 / Hari)
====================================================== */
const hitungDendaRealTime = (jatuhTempo: string | Date) => {
    const hariIni = getWIBDateObject();
    const deadline = getWIBDateObject(jatuhTempo);

    if (hariIni > deadline) {
        const selisihWaktu = hariIni.getTime() - deadline.getTime();
        const selisihHari = Math.floor(selisihWaktu / (1000 * 3600 * 24));
        return selisihHari * 5000;
    }
    return 0;
};

/* ======================================================
    FIXER: MASS UPDATE SEMUA JATUH TEMPO HARIAN YANG BERGESER
====================================================== */
const perbaikiJatuhTempoHarianSalah = async (connection: any) => {
    try {
        // 1. Cari semua tagihan harian Belum Lunas yang jatuh temponya minus/tidak sinkron dengan tanggal masuk
        const [wrongBills]: any = await connection.query(`
            SELECT t.id_tagihan, t.jatuh_tempo, p.tanggal_masuk 
            FROM tb_tagihan t
            INNER JOIN tb_penghuni p ON t.id_penghuni = p.id_penghuni
            WHERE t.jenis_periode = 'Harian' 
              AND t.status_bayar != 'Lunas'
              AND t.jatuh_tempo <= DATE(p.tanggal_masuk)
        `);

        if (wrongBills.length > 0) {
            console.log(`[FIXER] Menemukan ${wrongBills.length} data tagihan Harian yang bergeser kemarin. Memproses pembaruan massal...`);
            
            for (const bill of wrongBills) {
                // Ambil tanggal yang saat ini salah di database, lalu majukan 1 hari penuh
                const tglSalahObj = getWIBDateObject(bill.jatuh_tempo);
                tglSalahObj.setDate(tglSalahObj.getDate() + 1);

                const year = tglSalahObj.getFullYear();
                const month = String(tglSalahObj.getMonth() + 1).padStart(2, '0');
                const day = String(tglSalahObj.getDate()).padStart(2, '0');
                const fixedTempoStr = `${year}-${month}-${day}`;

                // 2. Update massal: Ubah jatuh_tempo lama ke yang baru agar sinkron sampai ke tagihan turunannya
                await connection.query(
                    "UPDATE tb_tagihan SET jatuh_tempo = ? WHERE id_tagihan = ?",
                    [fixedTempoStr, bill.id_tagihan]
                );
                console.log(`[FIXER MASSAL] ID Tagihan ${bill.id_tagihan} sukses digeser maju menjadi: ${fixedTempoStr}`);
            }
        }
    } catch (error: any) {
        console.error(`[FIXER ERROR] Gagal melakukan mass update harian: ${error.message}`);
    }
};

/* ======================================================
    CORE: LOGIKA PELUNASAN (ADMIN CASH)
====================================================== */
export const prosesPelunasanTagihan = async (id_tagihan: any, connection: any) => {
    const [billData]: any = await connection.execute(
        "SELECT * FROM tb_tagihan WHERE id_tagihan = ?", [id_tagihan]
    );

    if (billData.length === 0) throw new Error('Data tagihan tidak ditemukan');

    const b = billData[0];
    const dendaAkhir = hitungDendaRealTime(b.jatuh_tempo);
    const totalAkhir = Number(b.nominal) + dendaAkhir;

    // 1. Update status menjadi Lunas
    await connection.execute(
        "UPDATE tb_tagihan SET status_bayar = 'Lunas', tanggal_bayar = NOW(), denda = ?, total = ? WHERE id_tagihan = ?", 
        [dendaAkhir, totalAkhir, id_tagihan]
    );

    // 2. Update transaksi Cash agar status settlement
    await connection.execute(
        "UPDATE tb_transaksi SET status_midtrans = 'settlement', rincian_pembayaran = 'Pembayaran Tunai Divalidasi' WHERE id_tagihan = ? AND id_transaksi LIKE 'CASH%'",
        [id_tagihan]
    );

    // 3. GENERATE TAGIHAN BARU (Triggered by Lunas)
    const nextTempoStr = hitungNextDatePasti(b.jatuh_tempo, b.jenis_periode);
    const [exists]: any = await connection.query(
        "SELECT id_tagihan FROM tb_tagihan WHERE id_penghuni = ? AND jatuh_tempo = ?", 
        [b.id_penghuni, nextTempoStr]
    );

    if (exists.length === 0) {
        await connection.execute(
            `INSERT INTO tb_tagihan (id_penghuni, username, nama_lengkap, jenis_periode, nominal, denda, total, jatuh_tempo, status_bayar, is_tagihan_awal, created_at) 
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'Belum Bayar', 0, NOW())`,
            [b.id_penghuni, b.username, b.nama_lengkap, b.jenis_periode, b.nominal, b.nominal, nextTempoStr]
        );
    }
};

/* ======================================================
    1. LIHAT SEMUA TAGIHAN + AUTO-DETECT MENUNGGAK
====================================================== */
export const getAllTagihan = async (req: Request, res: Response) => {
    try {
        // Pemicu Fixer Massal: Memperbaiki seluruh baris tagihan harian yang tidak sesuai sebelum ditarik
        await perbaikiJatuhTempoHarianSalah(db);

        const hariIniStr = getWIBDateObject().toISOString().split('T')[0];

        // AUTO-GENERATE: Cek tagihan terakhir tiap user, jika sudah LEWAT tempo & belum Lunas
        const [overdueBills]: any = await db.query(`
            SELECT t1.* FROM tb_tagihan t1
            INNER JOIN (
                SELECT id_penghuni, MAX(jatuh_tempo) as max_t 
                FROM tb_tagihan GROUP BY id_penghuni
            ) t2 ON t1.id_penghuni = t2.id_penghuni AND t1.jatuh_tempo = t2.max_t
            WHERE t1.jatuh_tempo <= ? AND t1.status_bayar != 'Lunas'
        `, [hariIniStr]);

        for (const bill of overdueBills) {
            const nextTempo = hitungNextDatePasti(bill.jatuh_tempo, bill.jenis_periode);
            const [exists]: any = await db.query(
                "SELECT id_tagihan FROM tb_tagihan WHERE id_penghuni = ? AND jatuh_tempo = ?", 
                [bill.id_penghuni, nextTempo]
            );

            if (exists.length === 0) {
                await db.query(
                    `INSERT INTO tb_tagihan (id_penghuni, username, nama_lengkap, jenis_periode, nominal, denda, total, jatuh_tempo, status_bayar, is_tagihan_awal, created_at) 
                     VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'Belum Bayar', 0, NOW())`,
                    [bill.id_penghuni, bill.username, bill.nama_lengkap, bill.jenis_periode, bill.nominal, bill.nominal, nextTempo]
                );
                console.log(`[AUTO-OVERDUE] Tagihan baru dibuat untuk ${bill.nama_lengkap} periode ${nextTempo}`);
            }
        }

        // Ambil data final lengkap untuk komponen Card UI
        const [rows]: any = await db.query(`
            SELECT t.*, p.username, p.nama_lengkap, p.tanggal_masuk 
            FROM tb_tagihan t
            LEFT JOIN tb_penghuni p ON t.id_penghuni = p.id_penghuni
            ORDER BY t.jatuh_tempo DESC
        `);

        const dataFinal = rows.map((item: any) => {
            const statusRaw = (item.status_bayar || '').toLowerCase();
            const isLocked = ['lunas', 'menunggu validasi', 'dibatalkan', 'cancel'].includes(statusRaw);
            
            let dendaFinal = item.denda;
            let statusFinal = item.status_bayar;

            if (!isLocked) {
                dendaFinal =
                    Number(item.denda_base) > 0
                        ? Number(item.denda_base)
                        : hitungDendaRealTime(item.jatuh_tempo);
            
                statusFinal = dendaFinal > 0 ? 'Menunggak' : 'Belum Bayar';
            }

            return {
                ...item,
                denda: Number(dendaFinal),
                status_bayar: statusFinal, 
                total: Number(item.nominal) + Number(dendaFinal)
            };
        });

        res.status(200).json({ status: 'success', data: dataFinal });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/* ======================================================
    2. GENERATE TAGIHAN AWAL (PENGHUNI BARU) - FIXED TIMEZONE
====================================================== */
export const generateTagihanDariPenghuni = async (req: Request, res: Response) => {
    const { id_penghuni, nominal } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows]: any = await connection.query(
            'SELECT username, nama_lengkap, tanggal_masuk, periode, nominal as harga_kamar FROM tb_penghuni WHERE id_penghuni = ?',
            [id_penghuni]
        );
        if (rows.length === 0) return res.status(404).json({ status: 'error', message: 'Penghuni tidak ditemukan' });

        const p = rows[0];
        const nominalFinal = nominal || p.harga_kamar || 400000;
        
        const tglMasukObj = getWIBDateObject(p.tanggal_masuk);
        const periodeTrimmed = (p.periode || '').trim();

        // Otomatis tambah 1 hari pada pembuatan awal tipe Harian
        if (periodeTrimmed === 'Harian') {
            tglMasukObj.setDate(tglMasukObj.getDate() + 1);
        }

        const year = tglMasukObj.getFullYear();
        const month = String(tglMasukObj.getMonth() + 1).padStart(2, '0');
        const day = String(tglMasukObj.getDate()).padStart(2, '0');
        const tempoStr = `${year}-${month}-${day}`;

        const [exists]: any = await connection.query(
            "SELECT id_tagihan FROM tb_tagihan WHERE id_penghuni = ? AND jatuh_tempo = ?", [id_penghuni, tempoStr]
        );

        if (exists.length === 0) {
            await connection.query(
                `INSERT INTO tb_tagihan (id_penghuni, username, nama_lengkap, jenis_periode, nominal, denda, total, jatuh_tempo, status_bayar, is_tagihan_awal) 
                 VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'Belum Bayar', 1)`,
                [id_penghuni, p.username, p.nama_lengkap, p.periode, nominalFinal, nominalFinal, tempoStr]
            );
        }

        await connection.commit();
        res.status(201).json({ status: 'success', message: 'Tagihan awal berhasil dibuat.' });
    } catch (error: any) {
        await connection.rollback();
        res.status(500).json({ status: 'error', message: error.message });
    } finally {
        connection.release();
    }
};

/* ======================================================
    3. UPDATE STATUS (ADMIN VALIDASI)
====================================================== */
export const updateStatusTagihan = async (req: Request, res: Response) => {
    const { id } = req.params; 
    const { status_bayar } = req.body; 
    const connection = await db.getConnection(); 
    try {
        await connection.beginTransaction();
        const normalizedStatus = (status_bayar || '').toLowerCase();

        if (normalizedStatus === 'lunas') {
            await prosesPelunasanTagihan(id, connection);
        } else {
            const [bill]: any = await connection.query("SELECT nominal, jatuh_tempo FROM tb_tagihan WHERE id_tagihan = ?", [id]);
            const dendaSaatIni = hitungDendaRealTime(bill[0].jatuh_tempo);
            
            await connection.query(
                "UPDATE tb_tagihan SET status_bayar = ?, denda = ?, total = ? WHERE id_tagihan = ?", 
                [status_bayar, dendaSaatIni, Number(bill[0].nominal) + dendaSaatIni, id]
            );
        }
        
        await connection.commit();
        res.json({ status: 'success', message: 'Status diperbarui.' });
    } catch (error: any) {
        if (connection) await connection.rollback();
        res.status(500).json({ status: 'error', message: error.message });
    } finally {
        connection.release();
    }
};

/* ======================================================
    4. HAPUS TAGIHAN
====================================================== */
export const deleteTagihan = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM tb_tagihan WHERE id_tagihan = ?', [id]);
        res.json({ status: 'success', message: `Tagihan ID ${id} berhasil dihapus` });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};


/* ======================================================
    5. UPDATE MANUAL / POTONG DENDA DINAMIS (FIXED ENUM)
====================================================== */
export const editDataTagihanManual = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { denda, total, status_bayar } = req.body;
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        const [billExists]: any = await connection.query(
            "SELECT nominal, status_bayar FROM tb_tagihan WHERE id_tagihan = ?", 
            [id]
        );

        if (billExists.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Data tagihan tidak ditemukan' });
        }

        const b = billExists[0];
        const dendaBaru = denda !== undefined ? Number(denda) : 0;
        const totalBaru = total !== undefined ? Number(total) : Number(b.nominal) + dendaBaru;
        
        // 1. Tentukan status dasar
        let statusMentah = dendaBaru > 0 ? 'Menunggak' : (status_bayar || b.status_bayar || 'Belum Bayar');
        
        // 2. Paksa format string agar sesuai dengan ENUM database (Capital Case)
        let statusBaru = 'Belum Bayar';
        if (statusMentah.toLowerCase() === 'menunggak') {
            statusBaru = 'Menunggak';
        } else if (statusMentah.toLowerCase() === 'lunas') {
            statusBaru = 'Lunas';
        }
    
        // 3. 🔥 UPDATE: tanggal_masuk_record diubah menjadi NOW() agar mereset tanggal denda harian
        await connection.query(
            `UPDATE tb_tagihan
             SET denda = ?,
                 denda_base = ?,
                 total = ?,
                 status_bayar = ?,
                 tanggal_masuk_record = NOW()
             WHERE id_tagihan = ?`,
            [dendaBaru, dendaBaru, totalBaru, statusBaru, id]
        );

        await connection.commit();
        res.status(200).json({ status: 'success', message: `Denda berhasil diperbarui.` });
    } catch (error: any) {
        if (connection) await connection.rollback();
        console.error("🔥 Error Update Denda:", error.message);
        res.status(500).json({ status: 'error', message: error.message });
    } finally {
        connection.release();
    }
};