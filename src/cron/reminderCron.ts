import { Request, Response } from 'express';
import axios from 'axios'; 
import db from '../config/database';

const ONESIGNAL_APP_ID = '6fe75bb0-fd12-4fc5-b126-779035c9603b';
const ONESIGNAL_REST_KEY = 'os_v2_app_n7tvxmh5cjh4lmjgo6idlslahnwntg6zhplueofpbycrinyeklkwptl5vxfbpmdinprmwtpxxhfltpdvgpwvcf5vbkuig7etrvfh37y';

export const prosesPengingatTagihan = async (isFirstRun: boolean = true, idTagihanSpesifik: number | null = null) => {
    let connection;
    try {
        connection = await db.getConnection();
        const sekarang = new Date();
        const opsiJakarta = { timeZone: "Asia/Jakarta" };
        
        const tglSekarangMurni = new Date(sekarang.toLocaleDateString("en-CA", opsiJakarta));

        const formatTanggalIndo = (date: Date) => {
            return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };

        const tglHariIniIndo = formatTanggalIndo(tglSekarangMurni);

        let querySql = `
            SELECT t.id_tagihan, t.id_penghuni, t.jatuh_tempo, t.jenis_periode, 
                   t.nominal, t.denda, t.status_bayar, t.total,
                   t.last_notified_at, t.created_at,
                   p.nama_lengkap, p.username, p.device_token
            FROM tb_tagihan t
            JOIN tb_penghuni p ON t.id_penghuni = p.id_penghuni
            WHERE p.device_token IS NOT NULL
        `;
        
        const queryParams: any[] = [];
        
        if (idTagihanSpesifik) {
            querySql += ` AND t.id_tagihan = ?`;
            queryParams.push(idTagihanSpesifik);
            console.log(`[LOG SYSTEM]: Berjalan realtime untuk ID Tagihan: ${idTagihanSpesifik}`);
        } else {
            console.log(`[LOG SYSTEM]: Berjalan otomatis (Cron Job) menyisir seluruh tagihan aktif...`);
        }

        const [tagihanList]: any = await connection.query(querySql, queryParams);

        console.log(`[LOG SYSTEM]: Memeriksa ${tagihanList.length} tagihan kost dari perangkat aktif...`);
        
        for (const tagihan of tagihanList) {
            const deadline = new Date(tagihan.jatuh_tempo);
            const tglDeadlineMurni = new Date(deadline.toLocaleDateString("en-CA", opsiJakarta));
            
            const selisihHari = Math.round((tglDeadlineMurni.getTime() - tglSekarangMurni.getTime()) / (1000 * 3600 * 24));
            const tglJatuhTempoIndo = formatTanggalIndo(tglDeadlineMurni);

            const tglDibuat = new Date(tagihan.created_at);
            const tglDibuatMurni = new Date(tglDibuat.toLocaleDateString("en-CA", opsiJakarta));
            const hariBerjalan = Math.round((tglSekarangMurni.getTime() - tglDibuatMurni.getTime()) / (1000 * 3600 * 24));

            let shouldNotify = false;
            let title = "";
            let message = "";
            
            const namaSapaan = tagihan.username ? tagihan.username : tagihan.nama_lengkap;
            const formatNominal = new Intl.NumberFormat('id-ID').format(tagihan.nominal);

            const [checkInbox]: any = await connection.query(
                `SELECT id_notifikasi FROM tb_notifikasi WHERE id_tagihan_ref = ? LIMIT 1`,
                [tagihan.id_tagihan]
            );
            const isInboxKosong = checkInbox.length === 0;

            // 🔥 FIX: Amankan parsing last_notified_at menjadi Objek Date asli agar fungsi .getDate() tidak crash
            const tglLastNotified = tagihan.last_notified_at ? new Date(tagihan.last_notified_at) : null;

            if (tagihan.status_bayar === 'Lunas') {
                const [checkLunasNotif]: any = await connection.query(
                    `SELECT id_notifikasi FROM tb_notifikasi 
                     WHERE id_tagihan_ref = ? AND (judul LIKE '%Diterima%' OR judul LIKE '%Berhasil%') LIMIT 1`,
                    [tagihan.id_tagihan]
                );

                if (checkLunasNotif.length === 0) {
                    const [transaksiData]: any = await connection.query(
                        `SELECT metode_pembayaran, rincian_pembayaran, tgl_bayar, total, nominal 
                         FROM tb_transaksi WHERE id_tagihan = ? ORDER BY tgl_bayar DESC LIMIT 1`,
                        [tagihan.id_tagihan]
                    );

                    const tx = transaksiData[0] || null;
                    const metodeFix = tx ? tx.metode_pembayaran : 'midtrans';
                    const totalBayarFix = tx ? (tx.total || tx.nominal) : (tagihan.total || (Number(tagihan.nominal) + Number(tagihan.denda || 0)));
                    
                    const waktuBayar = tx ? new Date(tx.tgl_bayar) : new Date();
                    const jamFix = waktuBayar.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }) + " WIB";
                    const formatTotalBayar = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalBayarFix);

                    let viaPembayaran = 'Online Midtrans'; 

                    if (metodeFix === 'midtrans' && tx && tx.rincian_pembayaran) {
                        const rincianRaw = typeof tx.rincian_pembayaran === 'string' 
                            ? tx.rincian_pembayaran.toLowerCase() 
                            : JSON.stringify(tx.rincian_pembayaran).toLowerCase();

                        try {
                            const midtransJson = typeof tx.rincian_pembayaran === 'string' 
                                ? JSON.parse(tx.rincian_pembayaran) 
                                : tx.rincian_pembayaran;

                            const paymentType = midtransJson.payment_type ? midtransJson.payment_type.toLowerCase() : '';
                            
                            if (paymentType === 'bank_transfer') {
                                if (midtransJson.va_numbers && midtransJson.va_numbers[0]) {
                                    viaPembayaran = `Transfer VA ${midtransJson.va_numbers[0].bank.toUpperCase()}`;
                                } else if (midtransJson.permata_va_number) {
                                    viaPembayaran = 'Transfer VA PERMATA';
                                } else {
                                    viaPembayaran = 'Transfer Bank (VA)';
                                }
                            } else if (paymentType === 'gopay') {
                                viaPembayaran = 'E-Wallet GoPay';
                            } else if (paymentType === 'shopeepay') {
                                viaPembayaran = 'E-Wallet ShopeePay';
                            } else if (paymentType === 'qris') {
                                const issuer = midtransJson.issuer ? ` (${midtransJson.issuer.toUpperCase()})` : '';
                                viaPembayaran = `Scan QRIS${issuer}`;
                            } else if (paymentType === 'cstore') {
                                const store = midtransJson.store ? midtransJson.store.toUpperCase() : 'MINIMARKET';
                                viaPembayaran = `Gerai ${store}`;
                            } else if (paymentType === 'echannel') {
                                viaPembayaran = 'Mandiri Bill Payment';
                            } else {
                                if (rincianRaw.includes('bca')) viaPembayaran = 'Transfer VA BCA';
                                else if (rincianRaw.includes('bri')) viaPembayaran = 'Transfer VA BRI';
                                else if (rincianRaw.includes('bni')) viaPembayaran = 'Transfer VA BNI';
                                else if (rincianRaw.includes('gopay')) viaPembayaran = 'E-Wallet GoPay';
                                else if (rincianRaw.includes('shopeepay') || rincianRaw.includes('spay')) viaPembayaran = 'E-Wallet ShopeePay';
                                else if (rincianRaw.includes('qris')) viaPembayaran = 'Scan QRIS';
                                else viaPembayaran = 'Online Midtrans';
                            }
                        } catch (e) {
                            if (rincianRaw.includes('bca')) viaPembayaran = 'Transfer VA BCA';
                            else if (rincianRaw.includes('bri')) viaPembayaran = 'Transfer VA BRI';
                            else if (rincianRaw.includes('bni')) viaPembayaran = 'Transfer VA BNI';
                            else if (rincianRaw.includes('mandiri') || rincianRaw.includes('echannel')) viaPembayaran = 'Mandiri Bill Payment';
                            else if (rincianRaw.includes('gopay')) viaPembayaran = 'E-Wallet GoPay';
                            else if (rincianRaw.includes('shopeepay') || rincianRaw.includes('spay')) viaPembayaran = 'E-Wallet ShopeePay';
                            else if (rincianRaw.includes('qris')) viaPembayaran = 'Scan QRIS';
                            else if (rincianRaw.includes('alfamart') || rincianRaw.includes('alfa')) viaPembayaran = 'Gerai ALFAMART';
                            else if (rincianRaw.includes('indomaret') || rincianRaw.includes('indo')) viaPembayaran = 'Gerai INDOMARET';
                            else viaPembayaran = 'Online Midtrans';
                        }
                    } else if (metodeFix === 'cash') {
                        viaPembayaran = 'TUNAI (Cash)';
                    }

                    shouldNotify = true;
                    title = metodeFix === 'cash' ? "✅ Pembayaran Cash Diterima" : "✅ Pembayaran Midtrans Berhasil";
                    message = `Terima kasih Kak ${namaSapaan}! Pembayaran untuk periode ${tagihan.jenis_periode} sejumlah ${formatTotalBayar} via ${viaPembayaran} sukses divalidasi lunas pada jam ${jamFix}.`;
                }
            } 
            else if (selisihHari < 0) {
                shouldNotify = true;
                title = "⚠️ TAGIHAN MENUNGGAK";
                message = `Halo Kak ${namaSapaan}, tagihan anda sudah lewat jatuh tempo dari tanggal ${tglJatuhTempoIndo} sampai sekarang tanggal ${tglHariIniIndo}, denda perhari 5 rb mohon dilunasi.`;
            } else {
                switch (tagihan.jenis_periode) {
                    case 'Harian':
                        // 🔥 PERBAIKAN: Menggunakan tglLastNotified yang sudah aman berbentuk objek tanggal
                        if (isInboxKosong || (isFirstRun && tglLastNotified === null)) { 
                            shouldNotify = true;
                            title = "🔔 Info Sewa Harian";
                            message = `Halo Kak ${namaSapaan}, berikut informasi tagihan awal untuk sewa harian anda di kamar. Waktu sewa berlaku sampai besok siang ya Kak. Selamat beristirahat! 😊`;
                        } else if (sekarang.getHours() === 20 && tglLastNotified?.getDate() !== sekarang.getDate()) { 
                            shouldNotify = true;
                            title = "⏳ Pengingat Tengah Periode";
                            message = `Halo Kak ${namaSapaan}, sekadar informasi sewa anda akan berakhir 14 jam lagi. Kalau ada rencana mau lanjut untuk besok, boleh kabari kami ya Kak.`;
                        } else if (selisihHari === 0 && sekarang.getHours() === 10) { 
                            shouldNotify = true;
                            title = "📅 Hari Terakhir Sewa";
                            message = `Halo Kak ${namaSapaan}, sewa kos anda akan berakhir 2 jam lagi. Mohon dibantu konfirmasi untuk kelanjutan kamar atau penyelesaian tagihannya hari ini ya Kak, terima kasih banyak atas kenyamanannya bersama kami.`;
                        }
                        break;
                    case 'Mingguan':
                        if (hariBerjalan === 0 || isInboxKosong) {
                            shouldNotify = true;
                            title = "🔔 Info Sewa Mingguan";
                            message = `Halo Kak ${namaSapaan}, berikut informasi tagihan awal untuk sewa mingguan anda sebesar Rp ${formatNominal} dengan tanggal jatuh tempo pada ${tglJatuhTempoIndo}. Semoga minggunya menyenangkan!`;
                        } else if (selisihHari === 3) {
                            shouldNotify = true;
                            title = "⏳ Pengingat Tengah Periode";
                            message = `Halo Kak ${namaSapaan}, sekadar informasi sewa anda akan berakhir 3 hari lagi. Kami infokan santai agar Kakak bisa mempersiapkan waktunya.`;
                        } else if (selisihHari === 0) {
                            shouldNotify = true;
                            title = "📅 Hari Terakhir Sewa";
                            message = `Halo Kak ${namaSapaan}, sewa kos anda akan berakhir hari ini. Mohon dibantu untuk penyelesaian pembayarannya hari ini ya Kak, agar administrasi kamar tetap berjalan lancar. Terima kasih banyak atas kerjasamanya.`;
                        }
                        break;
                    case 'Bulanan':
                        if (hariBerjalan === 4) {
                            shouldNotify = true;
                            title = "🔔 Info Sewa Bulanan";
                            message = `Halo Kak ${namaSapaan}, berikut informasi tagihan awal untuk sewa bulanan anda yang berjalan sampai tanggal ${tglJatuhTempoIndo}. Terima kasih sudah memilih kos kami!`;
                        } else if (selisihHari === 15) {
                            shouldNotify = true;
                            title = "⏳ Pengingat Tengah Periode";
                            message = `Halo Kak ${namaSapaan}, sekadar informasi sewa anda akan berakhir 15 hari lagi pada tanggal ${tglJatuhTempoIndo} nanti. Semoga urusannya bulan ini dilancarkan selalu.`;
                        } else if (selisihHari === 0) {
                            shouldNotify = true;
                            title = "📅 Hari Terakhir Sewa";
                            message = `Halo Kak ${namaSapaan}, sewa kos anda akan berakhir hari ini. Jika ada waktu luang, mohon dibantu untuk pelunasan tagihan bulanannya hari ini ya Kak. Bantuan Kakak sangat berarti untuk kenyamanan bersama di kos ini.`;
                        }
                        break;
                    case '3 Bulan':
                        if (hariBerjalan === 0 || isInboxKosong) {
                            shouldNotify = true;
                            title = "🔔 Info Sewa 3 Bulanan";
                            message = `Halo Kak ${namaSapaan}, berikut informasi tagihan awal untuk sewa 3 bulanan anda yang akan aktif sampai tanggal ${tglJatuhTempoIndo}. Kalau ada kendala fasilitas, langsung kabari kami ya.`;
                        } else if (selisihHari === 45) {
                            shouldNotify = true;
                            title = "⏳ Pengingat Tengah Periode";
                            message = `Halo Kak ${namaSapaan}, sekadar informasi sewa anda akan berakhir 45 hari lagi. Kami infokan jauh-jauh hari supaya Kakak lebih nyaman mengatur anggarannya.`;
                        } else if (selisihHari === 0) {
                            shouldNotify = true;
                            title = "📅 Hari Terakhir Sewa";
                            message = `Halo Kak ${namaSapaan}, sewa kos anda akan berakhir hari ini. Mohon kesediaannya untuk melakukan perpanjangan atau pembayaran hari ini ya Kak. Terima kasih banyak sudah menjadi penghuni yang baik selama ini.`;
                        }
                        break;
                    case '6 Bulan':
                        if (hariBerjalan === 0 || isInboxKosong) {
                            shouldNotify = true;
                            title = "🔔 Info Sewa 6 Bulanan";
                            message = `Halo Kak ${namaSapaan}, berikut informasi tagihan awal untuk sewa 6 bulanan anda periode ini hingga tanggal ${tglJatuhTempoIndo}. Terima kasih banyak atas kepercayaannya.`;
                        } else if (selisihHari === 90) {
                            shouldNotify = true;
                            title = "⏳ Pengingat Tengah Periode";
                            message = `Halo Kak ${namaSapaan}, sekadar informasi sewa anda akan berakhir 90 hari lagi pada tanggal ${tglJatuhTempoIndo}. Semoga segala aktivitasnya di semester ini berjalan lancar.`;
                        } else if (selisihHari === 0) {
                            shouldNotify = true;
                            title = "📅 Hari Terakhir Sewa";
                            message = `Halo Kak ${namaSapaan}, sewa kos anda akan berakhir hari ini. Kami sangat senang Kakak betah di sini, mohon dibantu untuk konfirmasi pembayaran periode baru hari ini ya Kak. Terima kasih banyak.`;
                        }
                        break;
                    case '1 Tahun':
                        if (hariBerjalan === 0 || isInboxKosong) {
                            shouldNotify = true;
                            title = "🔔 Info Sewa Tahunan";
                            message = `Halo Kak ${namaSapaan}, berikut informasi tagihan awal untuk sewa tahunan anda yang tercatat hingga tanggal ${tglJatuhTempoIndo}. Semoga tahun ini membawa banyak berkah untuk Kakak.`;
                        } else if (selisihHari === 180) {
                            shouldNotify = true;
                            title = "⏳ Pengingat Tengah Periode";
                            message = `Halo Kak ${namaSapaan}, sekadar informasi sewa anda akan berakhir 180 hari lagi. Waktu berjalan cepat ya Kak, kami infokan berkala agar Kakak bisa mempersiapkannya dengan santai.`;
                        } else if (selisihHari === 0) {
                            shouldNotify = true;
                            title = "📅 Hari Terakhir Sewa";
                            message = `Halo Kak ${namaSapaan}, sewa kos anda akan berakhir hari ini. Terima kasih yang sebesar-besarnya atas kebersamaan kita selama setahun ini. Mohon dibantu untuk pelunasan sewa tahun depannya hari ini ya Kak, sehat selalu!`;
                        }
                        break;
                }
            }

            if (shouldNotify && message !== "") {
                const waktu = new Date();
                try {
                    const [existingLunas]: any = await connection.query(
                        `SELECT id_notifikasi FROM tb_notifikasi 
                         WHERE id_tagihan_ref = ? AND judul IN ('✅ Pembayaran Cash Diterima', '✅ Pembayaran Midtrans Berhasil') LIMIT 1`,
                        [tagihan.id_tagihan]
                    );

                    if (title.includes("✅")) {
                        if (existingLunas.length === 0) {
                            await connection.query(
                                `INSERT INTO tb_notifikasi (id_penghuni, judul, pesan, is_read, created_at, id_tagihan_ref) 
                                 VALUES (?, ?, ?, 0, ?, ?)`,
                                [tagihan.id_penghuni, title, message, waktu, tagihan.id_tagihan]
                            );
                            console.log(`[REALTIME ADD SYSTEM]: Sukses mendeteksi tagihan lunas baru. Baris baru ditambahkan untuk Tagihan ID: ${tagihan.id_tagihan}`);
                        }
                    } else {
                        const [existingNotif]: any = await connection.query(
                            `SELECT id_notifikasi FROM tb_notifikasi 
                             WHERE id_tagihan_ref = ? AND is_read = 0 AND judul NOT LIKE '%Lunas%' AND judul NOT LIKE '%Diterima%' AND judul NOT LIKE '%Berhasil%' LIMIT 1`,
                            [tagihan.id_tagihan]
                        );

                        if (existingNotif.length > 0) {
                            await connection.query(
                                `UPDATE tb_notifikasi SET judul = ?, pesan = ?, created_at = ? WHERE id_notifikasi = ?`,
                                [title, message, waktu, existingNotif[0].id_notifikasi]
                            );
                        } else {
                            await connection.query(
                                `INSERT INTO tb_notifikasi (id_penghuni, judul, pesan, is_read, created_at, id_tagihan_ref) 
                                 VALUES (?, ?, ?, 0, ?, ?)`,
                                [tagihan.id_penghuni, title, message, waktu, tagihan.id_tagihan]
                            );
                        }
                    }

                    await connection.query(
                        `UPDATE tb_tagihan SET last_notified_at = ? WHERE id_tagihan = ?`, 
                        [waktu, tagihan.id_tagihan]
                    );

                    if (tagihan.device_token) {
                        await axios.post(
                            'https://onesignal.com/api/v1/notifications',
                            {
                                app_id: ONESIGNAL_APP_ID,
                                include_subscription_ids: [tagihan.device_token],
                                target_channel: "push",
                                headings: { en: title },
                                contents: { en: message },
                                collapse_id: title.includes("✅") ? `lunas_${tagihan.id_tagihan}_${Date.now()}` : `tagihan_${tagihan.id_tagihan}_${Date.now()}`,
                                android_accent_color: title.includes("✅") ? "FF00A65A" : "FF0056B3",
                                priority: 10
                            },
                            {
                                headers: {
                                    'Content-Type': 'application/json; charset=utf-8',
                                    'Authorization': `Basic ${ONESIGNAL_REST_KEY}`
                                }
                            }
                        );
                        console.log(`[ONESIGNAL PUSH SUCCESS]: Push sukses terkirim untuk Tagihan ID: ${tagihan.id_tagihan}.`);
                    }

                } catch (err: any) {
                    console.error(`[ONESIGNAL ERROR] Gagal memproses data push ke ID ${tagihan.id_penghuni}:`, err?.response?.data || err?.message || err);
                }
            }
        }
    } catch (error) {
        console.error("Database Error:", error);
    } finally {
        if (connection) connection.release();
    }
};

export const initCronJobs = () => {
    console.log("[LOG SYSTEM]: Menjalankan pemicu sinkronisasi notifikasi tagihan instan...");
    prosesPengingatTagihan(true); 
};