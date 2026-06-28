import { Request, Response } from 'express';
// @ts-ignore
import midtransClient from 'midtrans-client';
import db from '../config/database';
import { prosesPelunasanTagihan } from './tagihanController';
import { kirimNotifikasiLunasInstan } from './notifikasiController';

// Konfigurasi Midtrans Snap
const snap = new midtransClient.Snap({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

/**
 * HELPER: Fungsi internal untuk simpan ke tb_transaksi
 * Sesuai struktur 15 kolom Kos Bu Suliati
 */
const saveToTransactionTable = async (connection: any, data: any) => {
    const query = `
        INSERT INTO tb_transaksi (
            id_transaksi, nominal, id_penghuni, id_tagihan,
            tgl_bayar, status_midtrans, metode_pembayaran, rincian_pembayaran,
            denda, total, jenis_periode, tgl_masuk,
            tgl_jatuh_tempo_awal, tgl_jatuh_tempo_baru, jenis_periode_masuk
        ) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await connection.execute(query, [
        data.orderId,
        data.nominalPokok,
        data.idPenghuni,
        data.idTagihan,
        data.statusMidtrans,
        data.metode,
        data.rincian,
        data.denda,
        data.totalBayar,
        data.jenisPeriode,
        data.tglMasukAsli,
        data.jatuhTempo,
        data.jatuhTempoBaru || null,
        data.jenisPeriode
    ]);
};

/**
 * [GET] Mengambil Semua Riwayat Transaksi
 */
export const getAllPayments = async (req: Request, res: Response) => {
    try {
        const id_penghuni = req.query.id_penghuni as string | undefined;
        const params: any[] = [];

        let query = `
            SELECT 
                t.*, 
                p.nama_lengkap as nama_penghuni,
                p.tanggal_masuk as tgl_masuk_penghuni
            FROM tb_transaksi t
            LEFT JOIN tb_penghuni p ON t.id_penghuni = p.id_penghuni
        `;

        if (id_penghuni && id_penghuni.trim() !== "") {
            query += ` WHERE t.id_penghuni = ? `;
            params.push(id_penghuni);
        }

        query += ` ORDER BY t.tgl_bayar DESC`;

        const [rows]: any = await db.query(query, params);

        res.status(200).json({ status: 'success', data: rows });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * [POST] Membuat Transaksi (Cash & Midtrans)
 * FIX: Logika ID Suffix untuk mencegah Error 400 Midtrans
 */
export const createPayment = async (req: Request, res: Response) => {
    const { id_tagihan, nominal, denda, total_bayar, nama_lengkap, metode, jenis_periode } = req.body;

    const methodStr = (metode || 'midtrans').toLowerCase();
    const dendaValue = Number(denda) || 0;
    const nominalPokok = Number(nominal) || 0;
    const finalAmount = Number(total_bayar) || (nominalPokok + dendaValue);

    if (!id_tagihan || finalAmount <= 0) {
        return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. BUAT ID BERSIH UNTUK DATABASE
        // Contoh: "MIDTRANS-15" atau "CASH-15"
        const dbOrderId = `${methodStr.toUpperCase()}-${id_tagihan}`;
        
        // 2. BUAT ID KHUSUS MIDTRANS (Ditambah Timestamp agar Midtrans tidak error 400)
        // Contoh: "MIDTRANS-15-1718291029"
        const midtransOrderId = `${dbOrderId}-${Date.now()}`;

        // Cek apakah di database sudah ada row dengan ID bersih ini
        const [existing]: any = await connection.execute(
            `SELECT id_transaksi FROM tb_transaksi WHERE id_transaksi = ? LIMIT 1`,
            [dbOrderId]
        );

        const [tagihan]: any = await connection.execute(
            `SELECT tg.*, p.tanggal_masuk 
             FROM tb_tagihan tg 
             JOIN tb_penghuni p ON tg.id_penghuni = p.id_penghuni 
             WHERE tg.id_tagihan = ?`, 
            [id_tagihan]
        );

        if (tagihan.length === 0) throw new Error('Data tagihan tidak ditemukan');
        const dataTg = tagihan[0];

        // Objek data yang dikirim menggunakan ID BERSIH (dbOrderId)
        const commonData = {
            orderId: dbOrderId, 
            idTagihan: id_tagihan,
            nominalPokok: nominalPokok,
            totalBayar: finalAmount,
            idPenghuni: dataTg.id_penghuni,
            denda: dendaValue,
            tglMasukAsli: dataTg.tanggal_masuk,
            jatuhTempo: dataTg.jatuh_tempo,
            jenisPeriode: jenis_periode || dataTg.jenis_periode,
            jatuhTempoBaru: dataTg.jatuh_tempo_berikutnya
        };

        if (methodStr === 'cash') {
            if (existing.length === 0) {
                await saveToTransactionTable(connection, {
                    ...commonData,
                    statusMidtrans: 'pending', 
                    metode: 'cash',
                    rincian: 'Menunggu Validasi'
                });
            }

            await connection.execute(
                "UPDATE tb_tagihan SET status_bayar = 'Menunggu Validasi', denda = ?, total = ? WHERE id_tagihan = ?",
                [dendaValue, finalAmount, id_tagihan]
            );

            await connection.commit();
            return res.status(201).json({ status: 'success', message: 'Laporan cash terkirim.' });
        
        } else {
            // --- LOGIKA MIDTRANS ---
            const parameter = {
                transaction_details: {
                    order_id: midtransOrderId, // <--- KIRIM ID TIMESTAMP KE MIDTRANS
                    gross_amount: Math.round(finalAmount)
                },
                customer_details: { first_name: nama_lengkap || 'Customer' },
                item_details: [
                    {
                        id: `SEWA-${id_tagihan}`,
                        price: Math.round(nominalPokok),
                        quantity: 1,
                        name: `Sewa Kos (${commonData.jenisPeriode})`
                    },
                    ...(dendaValue > 0 ? [{
                        id: `DENDA-${id_tagihan}`,
                        price: Math.round(dendaValue),
                        quantity: 1,
                        name: "Denda Keterlambatan"
                    }] : [])
                ],
                enabled_payments: ["gopay", "shopeepay", "permata_va", "bca_va", "bni_va", "bri_va", "other_va"]
            };

            const transaction = await snap.createTransaction(parameter);

            if (existing.length === 0) {
                // Hanya INSERT ke database jika memang belum ada sebelumnya
                await saveToTransactionTable(connection, {
                    ...commonData,
                    statusMidtrans: 'pending',
                    metode: 'midtrans',
                    rincian: 'Pembayaran Tertunda'
                });
            } else {
                // Jika sudah ada, kita cukup UPDATE nilai total/denda jaga-jaga jika berubah
                await connection.execute(
                    `UPDATE tb_transaksi SET denda = ?, total = ? WHERE id_transaksi = ?`,
                    [dendaValue, finalAmount, dbOrderId]
                );
            }

            await connection.commit();
            return res.json({ 
                status: 'success', 
                token: transaction.token, 
                redirect_url: transaction.redirect_url 
            });
        }
    } catch (error: any) {
        if (connection) await connection.rollback();
        res.status(500).json({ status: 'error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * [POST] Webhook Notifikasi Midtrans
 * Diperbaiki untuk memotong Timestamp dari ID Midtrans agar cocok dengan Database
 */
export const handleNotification = async (req: Request, res: Response) => {
    const statusResponse = req.body;
    const midtransOrderId = statusResponse.order_id; // Bisa "MIDTRANS-15" atau "MIDTRANS-15-1718291029"
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    let rincian: string | null = null;
    if (statusResponse.payment_type === 'bank_transfer') {
        rincian = statusResponse.va_numbers?.[0]?.bank?.toUpperCase() || 'VA';
    } else {
        rincian = statusResponse.payment_type?.toUpperCase() || 'ONLINE';
    }

    // 1. POTONG TIMESTAMP UNTUK MENDAPATKAN ID DATABASE BERSIH
    const parts = midtransOrderId.split('-');
    let dbOrderId = midtransOrderId;
    let idTagihan = null;

    if (parts.length >= 3) {
        dbOrderId = `${parts[0]}-${parts[1]}`; // Menjadi "MIDTRANS-15"
        idTagihan = parts[1]; // Menjadi "15"
    } else if (parts.length === 2) {
        idTagihan = parts[1];
    }

    const connection = await db.getConnection(); 
    let kirimPushRealtime = false; // Flag penanda jika pembayaran sukses

    try {
        await connection.beginTransaction();

        const isSuccess = transactionStatus === 'settlement' || 
                         (transactionStatus === 'capture' && fraudStatus === 'accept');

        const statusUpdate = isSuccess ? 'settlement' : transactionStatus;

        // --- FIX: Gunakan IN (?, ?) agar support ID Bersih (data baru) maupun ID Panjang (data lama) ---
        await connection.query(
            'UPDATE tb_transaksi SET status_midtrans = ?, rincian_pembayaran = ? WHERE id_transaksi IN (?, ?)', 
            [statusUpdate, rincian, dbOrderId, midtransOrderId]
        );

        if (statusUpdate === 'settlement' && idTagihan) {
            // Update tagihan menjadi lunas
            await prosesPelunasanTagihan(idTagihan, connection);
            
            // Update tanggal bayar (Juga menggunakan IN agar support data lama)
            await connection.query(
                'UPDATE tb_transaksi SET tgl_bayar = NOW() WHERE id_transaksi IN (?, ?)',
                [dbOrderId, midtransOrderId]
            );

            // Aktifkan trigger untuk kirim notifikasi karena settlement sukses
            kirimPushRealtime = true;
        }

        await connection.commit();
        res.status(200).json({ status: 'OK' });
        
        // Panggil secara instan & real-time di sini!
        if (idTagihan) {
            await kirimNotifikasiLunasInstan(Number(idTagihan));
        }

        // 🔥 TERBARU: Kirim push notification setelah database sukses melakukan COMMIT
        // Diletakkan di luar block transaksi agar tidak mengunci (lock) database jika OneSignal lambat.
        if (kirimPushRealtime && idTagihan) {
            try {
                // Memanggil fungsi eksternal pengingat bawaan backend kamu
                await prosesPelunasanTagihan(false, idTagihan);

                console.log(
                    `[REALTIME PUSH]: Berhasil mengirim notifikasi pembayaran lunas untuk Tagihan ID: ${idTagihan}`
                );
            } catch (err) {
                console.error('[REALTIME PUSH ERROR]:', err);
            }
        }

    } catch (error: any) {
        if (connection) await connection.rollback();
        console.error('Webhook Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};