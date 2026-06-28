import { Request, Response } from 'express';
import db from '../config/database';
// @ts-ignore
import PDFDocument from 'pdfkit-table';

// Helper format Rupiah biasa
const formatIDR = (val: number) => {
    return 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(val || 0);
};

// =================================================================
// 1. GENERATE LAPORAN UTAMA KOS BU SULIATI (A4 PDF VIA PDFKIT-TABLE)
// =================================================================
export const generateLaporanHTML = async (req: Request, res: Response): Promise<void> => {
    try {
        // 1. TANGKAP FILTER DARI QUERY PARAMS
        const showCardKamar = req.query.card_kamar !== 'false';
        const showCardPenghuni = req.query.card_penghuni !== 'false';
        const showCardPemasukan = req.query.card_pemasukan !== 'false';
        const showCardTagihan = req.query.card_tagihan !== 'false';
        const showPeriode = req.query.periode !== 'false';
        const showTahunan = req.query.tahunan !== 'false';
        const showMingguan = req.query.mingguan !== 'false';
        const showHarian = req.query.harian !== 'false'; 

        const now = new Date();
        const tglHariIni = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const selectedYear = req.query.tahun_aktif ? parseInt(req.query.tahun_aktif as string) : now.getFullYear();
        const currentMonth = now.getMonth();

        const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
        const periodeLabels = ['Harian', 'Mingguan', 'Bulanan', '3 Bulan', '6 Bulan', '1 Tahun'];

        // 2. QUERY DATA DARI DATABASE
        const [kamar]: any = await db.query('SELECT * FROM tb_kamar ORDER BY no_kamar ASC');
        const [penghuni]: any = await db.query('SELECT * FROM tb_penghuni ORDER BY nama_lengkap ASC');
        const [transaksi]: any = await db.query(`
            SELECT t.*, p.nama_lengkap, p.periode FROM tb_transaksi t 
            JOIN tb_penghuni p ON t.id_penghuni = p.id_penghuni 
            WHERE t.status_midtrans = 'settlement' OR t.metode_pembayaran = 'cash'
            ORDER BY t.tgl_bayar DESC
        `);
        const [tunggakanRaw]: any = await db.query(`
            SELECT tg.*, p.nama_lengkap, p.periode FROM tb_tagihan tg
            JOIN tb_penghuni p ON tg.id_penghuni = p.id_penghuni
            WHERE tg.status_bayar != 'Lunas' ORDER BY tg.jatuh_tempo ASC
        `);

        // Inisialisasi PDF Dokumen A4
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=Laporan_Kos_Final.pdf');
        doc.pipe(res);

        // Helper Header Laporan Otomatis tiap halaman baru dibuat
        const writeHeader = (subTitle: string) => {
            doc.fontSize(14).font('Helvetica-Bold').text(`LAPORAN KOS BU SULIATI - ${subTitle}`, { align: 'center' });
            doc.fontSize(8).font('Helvetica').text(`Tanggal Cetak: ${now.toLocaleDateString('id-ID', { dateStyle: 'full' })}`, { align: 'center' });
            doc.moveDown(2);
        };

        let isFirstPage = true;
        const addNewPageIfNeeded = (title: string) => {
            if (!isFirstPage) {
                doc.addPage();
            }
            isFirstPage = false;
            writeHeader(title);
        };

        // --- HALAMAN 1: DATA PENGHUNI ---
        if (showCardPenghuni) {
            addNewPageIfNeeded("DATA PENGHUNI");
            const listP: string[][] = penghuni.map((p: any, i: number) => [
                (i + 1).toString(),
                p.nama_lengkap || '-',
                p.username || '-',
                (p.no_kamar || '-').toString(),
                p.no_hp || '-',
                p.jenis_kelamin === 'Laki-laki' ? 'L' : 'P',
                p.tanggal_masuk ? new Date(p.tanggal_masuk).toLocaleDateString('id-ID') : '-',
                p.periode || '-',
                (p.status?.toLowerCase() === 'aktif' ? 'AKTIF' : 'TIDAK AKTIF')
            ]);

            await doc.table({
                headers: ['No', 'Nama Lengkap', 'Username', 'Kamar', 'No HP', 'JK', 'Tgl Masuk', 'Periode', 'Status'],
                rows: listP
            });
        }

        // --- HALAMAN 2: DISTRIBUSI PERIODE ---
        if (showPeriode) {
            addNewPageIfNeeded("DISTRIBUSI PERIODE SEWA");
            const listPeriode: string[][] = periodeLabels.map(label => {
                const listNama = penghuni.filter((p: any) => p.periode === label).map((p: any) => p.nama_lengkap);
                return [
                    `Periode ${label}`,
                    listNama.join(', ') || '-',
                    `${listNama.length} Orang`
                ];
            });
            listPeriode.push(['TOTAL KESELURUHAN PENGHUNI', '', `${penghuni.length} Orang`]);

            await doc.table({
                headers: ['Jenis Periode', 'Nama-Nama Penghuni', 'Jumlah'],
                rows: listPeriode
            });
        }

        // --- HALAMAN 3: UNIT KAMAR ---
        if (showCardKamar) {
            addNewPageIfNeeded("DATA UNIT KAMAR");
            const listKamar: string[][] = kamar.map((k: any, i: number) => [
                (i + 1).toString(),
                (k.no_kamar || '-').toString(),
                k.fasilitas || '-',
                formatIDR(k.harga_sewa),
                (k.status_kamar || '-').toUpperCase()
            ]);
            const totalSewaKamar = kamar.reduce((a: number, b: any) => a + Number(b.harga_sewa), 0);
            listKamar.push(['TOTAL NILAI SEWA UNIT', '', '', formatIDR(totalSewaKamar), '']);

            await doc.table({
                headers: ['No', 'No Kamar', 'Fasilitas', 'Harga Sewa', 'Status'],
                rows: listKamar
            });
        }

        // --- HALAMAN 4: TRANSAKSI BERHASIL ---
        if (showCardPemasukan) {
            addNewPageIfNeeded("DATA TRANSAKSI BERHASIL");
            let sumSewa = 0, sumTelat = 0, sumDenda = 0, sumTotal = 0;

            const listTransaksi: string[][] = transaksi.map((t: any, i: number) => {
                const hrgSewaAwal = Number(t.nominal || 0);
                const totalBayar = Number(t.total || hrgSewaAwal);
                let dendaFix = totalBayar > hrgSewaAwal ? totalBayar - hrgSewaAwal : 0;
                let telatHari = dendaFix > 0 ? Math.floor(dendaFix / 5000) : 0;

                sumSewa += hrgSewaAwal; sumTelat += telatHari; sumDenda += dendaFix; sumTotal += totalBayar;

                return [
                    (i + 1).toString(), t.nama_lengkap || '-', t.periode || '-',
                    formatIDR(hrgSewaAwal), `${telatHari} Hari`, formatIDR(dendaFix), formatIDR(totalBayar)
                ];
            });
            listTransaksi.push(['TOTAL KESELURUHAN', '', '', formatIDR(sumSewa), `${sumTelat} Hr`, formatIDR(sumDenda), formatIDR(sumTotal)]);

            await doc.table({
                headers: ['No', 'Nama', 'Periode', 'Sewa Awal', 'Telat', 'Denda', 'Total Bayar'],
                rows: listTransaksi
            });
        }

        // --- HALAMAN 5: STATISTIK PENDAPATAN (TAHUNAN, MINGGUAN, HARIAN) ---
        if (showTahunan || showMingguan || showHarian) {
            addNewPageIfNeeded("STATISTIK PENDAPATAN");
            const trStat = transaksi.map((t: any) => ({ total: Number(t.total || t.nominal), tgl: new Date(t.tgl_bayar || t.created_at) }));

            // A. Kategori Tahunan
            if (showTahunan) {
                doc.fontSize(10).font('Helvetica-Bold').text(`PENDAPATAN TAHUNAN ${selectedYear}`, { underline: true });
                doc.moveDown(0.5);
                const listT: string[][] = monthNames.map((n, i) => {
                    const v = trStat.filter(t => t.tgl.getFullYear() === selectedYear && t.tgl.getMonth() === i).reduce((a, b) => a + b.total, 0);
                    return [n, formatIDR(v)];
                });
                const totalT = trStat.filter(t => t.tgl.getFullYear() === selectedYear).reduce((a, b) => a + b.total, 0);
                listT.push(['TOTAL TAHUNAN', formatIDR(totalT)]);

                await doc.table({ headers: ['Bulan', 'Total Pendapatan'], rows: listT });
                doc.moveDown(2);
            }

            // B. Kategori Mingguan
            if (showMingguan) {
                doc.fontSize(10).font('Helvetica-Bold').text(`PENDAPATAN MINGGUAN (${monthNames[currentMonth]})`, { underline: true });
                doc.moveDown(0.5);
                let totalM = 0;
                const listM: string[][] = [0, 1, 2, 3, 4].map(i => {
                    const v = trStat.filter(t => t.tgl.getMonth() === currentMonth && Math.min(Math.floor((t.tgl.getDate() - 1) / 7), 4) === i).reduce((a, b) => a + b.total, 0);
                    totalM += v;
                    return [`Minggu ${i + 1}`, formatIDR(v)];
                });
                listM.push(['TOTAL MINGGUAN', formatIDR(totalM)]);

                await doc.table({ headers: ['Minggu Ke', 'Total Pendapatan'], rows: listM });
                doc.moveDown(2);
            }

            // C. Kategori Harian (SUDAH FIX BEBAS ERROR TYPE)
            if (showHarian) {
                doc.fontSize(10).font('Helvetica-Bold').text(`PENDAPATAN HARIAN (7 HARI TERAKHIR)`, { underline: true });
                doc.moveDown(0.5);
                
                const listH: string[][] = [];
                let totalHarianAngka = 0;

                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(now.getDate() - i);
                    const labelHari = `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]}`;
                    
                    const v = trStat
                        .filter(t => t.tgl.getDate() === d.getDate() && t.tgl.getMonth() === d.getMonth() && t.tgl.getFullYear() === d.getFullYear())
                        .reduce((a, b) => a + b.total, 0);
                    
                    totalHarianAngka += v;
                    listH.push([labelHari, formatIDR(v)]);
                }
                listH.push(['TOTAL HARIAN RUNNING', formatIDR(totalHarianAngka)]);

                await doc.table({ headers: ['Hari & Tanggal', 'Total Pendapatan'], rows: listH });
            }
        }

        // --- HALAMAN 6 & 7: TAGIHAN MENUNGGAK & BELUM BAYAR ---
        if (showCardTagihan) {
            addNewPageIfNeeded("DATA PENGHUNI MENUNGGAK");
            const listMngRaw = tunggakanRaw.filter((tg: any) => tglHariIni > new Date(tg.jatuh_tempo));
            let totalMngHari = 0, totalMngSewa = 0, totalMngDenda = 0, totalMngAll = 0;

            const listMng: string[][] = listMngRaw.map((tg: any) => {
                const hari = Math.floor((tglHariIni.getTime() - new Date(tg.jatuh_tempo).getTime()) / (1000 * 3600 * 24));
                const sewa = Number(tg.nominal || 0);
                const denda = hari * 5000;
                const total = sewa + denda;

                totalMngHari += hari; totalMngSewa += sewa; totalMngDenda += denda; totalMngAll += total;

                return [
                    tg.nama_lengkap || '-', tg.periode || '-', new Date(tg.jatuh_tempo).toLocaleDateString('id-ID'),
                    `${hari} Hari`, formatIDR(sewa), formatIDR(denda), formatIDR(total)
                ];
            });
            listMng.push(['TOTAL', '', '', `${totalMngHari} Hr`, formatIDR(totalMngSewa), formatIDR(totalMngDenda), formatIDR(totalMngAll)]);

            await doc.table({
                headers: ['Nama', 'Periode', 'Jatuh Tempo', 'Telat', 'Sewa', 'Denda', 'Total'],
                rows: listMng
            });

            // BELUM BAYAR
            doc.addPage();
            writeHeader("DATA TAGIHAN BELUM BAYAR (BERJALAN)");
            const listBBRaw = tunggakanRaw.filter((tg: any) => tglHariIni <= new Date(tg.jatuh_tempo));
            let totalBBSewa = 0;

            const listBB: string[][] = listBBRaw.map((tg: any) => {
                const sewa = Number(tg.nominal || 0);
                totalBBSewa += sewa;
                return [
                    tg.nama_lengkap || '-', tg.periode || '-', new Date(tg.jatuh_tempo).toLocaleDateString('id-ID'),
                    formatIDR(sewa), 'Rp 0', formatIDR(sewa)
                ];
            });
            listBB.push(['TOTAL TAGIHAN BERJALAN', '', '', formatIDR(totalBBSewa), 'Rp 0', formatIDR(totalBBSewa)]);

            await doc.table({
                headers: ['Nama', 'Periode', 'Jatuh Tempo', 'Sewa', 'Denda', 'Total'],
                rows: listBB
            });
        }

        doc.end();
    } catch (error: any) { 
        res.status(500).send('Error: ' + error.message); 
    }
};

// =================================================================
// 2. UNDUH BUKTI TRANSAKSI / KWITANSI ELEKTRONIK (CUSTOM COMPACT SIZE)
// =================================================================
export const generateInvoiceHTML = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id_transaksi } = req.params;

        const query = `
            SELECT t.*, p.nama_lengkap, p.tanggal_masuk as tgl_masuk_penghuni
            FROM tb_transaksi t
            JOIN tb_penghuni p ON t.id_penghuni = p.id_penghuni
            WHERE t.id_transaksi = ?
        `;
        const [rows]: any = await db.query(query, [id_transaksi]);
        const data = rows[0];

        if (!data) {
            res.status(404).send('Data transaksi tidak ditemukan');
            return;
        }

        const isSuccess = data.status_midtrans === 'settlement' || data.status_midtrans === 'capture' || data.metode_pembayaran === 'cash';
        const totalBayar = Number(data.total) || 0;
        
        const hitungHariTerlambat = (tglBayar: any, tglTempo: any) => {
            if (!tglBayar || !tglTempo) return 0;
            const d1 = new Date(tglBayar).setHours(0, 0, 0, 0);
            const d2 = new Date(tglTempo).setHours(0, 0, 0, 0);
            return d1 <= d2 ? 0 : Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
        };

        const hariTerlambatReal = hitungHariTerlambat(data.tgl_bayar, data.tgl_jatuh_tempo_awal);
        let nominalDendaTampil = Number(data.denda) || 0;
        if (nominalDendaTampil === 0 && hariTerlambatReal > 0) nominalDendaTampil = hariTerlambatReal * 5000;
        const hargaSewaAsli = totalBayar - nominalDendaTampil;
        const tglMasukAsli = data.tgl_masuk_penghuni || data.tgl_masuk;

        const getKeteranganRincian = () => {
            if (!isSuccess) return 'Pembayaran Tertunda';
            if (data.metode_pembayaran === 'cash') return 'Pembayaran di Tempat';
            return data.rincian_pembayaran || 'Sistem Online';
        };

        // Menggunakan ukuran kuitansi proporsional [400x580]
        const doc = new PDFDocument({ size: [400, 580], margin: 30 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Kuitansi-${id_transaksi}.pdf`);
        doc.pipe(res);

        const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0).replace('IDR', 'Rp');
        const formatDate = (dateString: string | Date) => {
            if (!dateString || dateString === "0000-00-00" || dateString === "null") return '-';
            return new Date(dateString).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        };
        const formatTimeOnly = (dateString: string | Date) => {
            if (!dateString || dateString === "0000-00-00") return '--:--';
            return new Date(dateString).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
        };

        // ==========================================
        // 1. HEADER (Font besar, tebal, abu-abu soft)
        // ==========================================
        doc.moveDown(0.5);
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a202c').text('KWITANSI BUKTI PEMBAYARAN', { align: 'center', characterSpacing: 0.5 });
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#4a5568').text('SEWA KOS BU SULIATI', { align: 'center', characterSpacing: 0.3 });
        doc.moveDown(0.6);

        // Info sub-header kecil berwarna abu-abu tipis
        const dateStr = data.tgl_bayar ? formatDate(data.tgl_bayar) : '-';
        const timeStr = data.tgl_bayar ? formatTimeOnly(data.tgl_bayar) : '--:--';
        doc.fontSize(8.5).font('Helvetica').fillColor('#718096').text(`Tanggal bayar: ${dateStr}`, { align: 'center' });
        doc.text(`Jam: ${timeStr} WIB`, { align: 'center' });
        
        doc.moveDown(0.4);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#2d3748').text(`ID Transaksi: ${data.id_transaksi}`, { align: 'center' });

        // Garis pemisah tebal gelap
        doc.moveDown(0.8);
        doc.moveTo(30, doc.y).lineTo(370, doc.y).strokeColor('#2d3748').lineWidth(1.5).stroke();
        doc.moveDown(1.2);

        // ==========================================
        // 2. GRID INFORMASI PENYEWA (Kiri & Kanan Pas)
        // ==========================================
        const tglMasukKostStr = tglMasukAsli ? formatDate(tglMasukAsli) : '-';
        const tglTempoStr = data.tgl_jatuh_tempo_awal ? formatDate(data.tgl_jatuh_tempo_awal) : '-';
        const metodeTeks = data.metode_pembayaran === 'cash' ? 'Tunai (Cash)' : 'Midtrans (Online)';

        const renderRowGrid = (label: string, value: string) => {
            const currentY = doc.y;
            doc.fontSize(9.5).font('Helvetica').fillColor('#718096').text(label, 30, currentY);
            doc.font('Helvetica-Bold').fillColor('#1a202c').text(value, 200, currentY, { align: 'right', width: 170 });
            doc.moveDown(0.7);
        };

        renderRowGrid('Nama Lengkap', data.nama_lengkap || '-');
        renderRowGrid('Tanggal Masuk Kost', tglMasukKostStr);
        renderRowGrid('Jenis Periode', data.jenis_periode || 'Bulanan');
        renderRowGrid('Jatuh Tempo', tglTempoStr);
        renderRowGrid('Metode Pembayaran', metodeTeks);

        doc.moveDown(0.4);

        // ==========================================
        // 3. PAYMENT BOX (Rounded Grey Box + Stamp)
        // ==========================================
        const startBoxY = doc.y;
        
        // Gambar background box abu-abu pudar ujung bulat (Radius 12)
        doc.fillColor('#f7fafc').roundedRect(30, startBoxY, 340, 115, 12).fill();
        
        // --- PROSES MENGGAMBAR STEMPEL LUNAS (Miring di Tengah-Tengah Box) ---
        if (isSuccess) {
            doc.save(); // Simpan koordinat normal
            
            // Atur transformasi rotasi -10 derajat tepat di pusat kotak box
            doc.translate(200, startBoxY + 57);
            doc.rotate(-10);
            
            // Gambar double box stempel transparan abu-abu lembut
            doc.lineWidth(1.5).strokeColor('#cbd5e1').rect(-65, -22, 130, 36).stroke();
            doc.lineWidth(0.5).strokeColor('#cbd5e1').rect(-62, -19, 124, 30).stroke();
            
            // Teks di dalam stempel
            doc.fillColor('#94a3b8').fontSize(15).font('Helvetica-Bold').text('LUNAS', -65, -13, { align: 'center', width: 130 });
            doc.fontSize(6.5).font('Helvetica-Bold').text('BU SULIATI', -65, 3, { align: 'center', width: 130 });
            
            doc.restore(); // Kembalikan koordinat dokumen normal
        }

        // Teks di dalam Box Rincian (Mengambang di atas background abu-abu)
        doc.fontSize(9.5).font('Helvetica').fillColor('#718096').text('Rincian', 45, startBoxY + 15);
        doc.font('Helvetica-Bold').fillColor('#1a202c').text(getKeteranganRincian(), 200, startBoxY + 15, { align: 'right', width: 155 });

        doc.font('Helvetica').fillColor('#718096').text('Sewa Kos', 45, startBoxY + 35);
        doc.font('Helvetica-Bold').fillColor('#1a202c').text(formatIDR(hargaSewaAsli), 200, startBoxY + 35, { align: 'right', width: 155 });

        // Label Denda Dinamis (Menampilkan informasi jumlah hari jika terlambat)
        const dendaLabelText = hariTerlambatReal > 0 ? `Denda (${hariTerlambatReal} Hari)` : 'Denda';
        doc.font('Helvetica').fillColor('#718096').text(dendaLabelText, 45, startBoxY + 55);
        doc.font('Helvetica-Bold').fillColor('#1a202c').text(`+ ${formatIDR(nominalDendaTampil)}`, 200, startBoxY + 55, { align: 'right', width: 155 });

        // Garis putus-putus tipis pemisah total di dalam box
        doc.strokeColor('#cbd5e1').lineWidth(0.8).dash(3, { space: 2 }).moveTo(45, startBoxY + 77).lineTo(355, startBoxY + 77).stroke();
        doc.undash();

        // Baris TOTAL BESAR
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a202c').text('TOTAL', 45, startBoxY + 88);
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a202c').text(formatIDR(totalBayar), 200, startBoxY + 87, { align: 'right', width: 155 });

        // ==========================================
        // 4. FOOTER LEGALITAS
        // ==========================================
        doc.moveDown(5);
        doc.fontSize(8).font('Helvetica').fillColor('#a0aec0').text('Bukti ini diterbitkan secara elektronik dan sah sebagai alat bukti pembayaran.', 30, 520, { align: 'center', width: 340 });
        doc.font('Helvetica').text('Terima kasih.', { align: 'center', width: 340 });

        doc.end();

    } catch (error: any) {
        res.status(500).send('Error: ' + error.message);
    }
};

/* =================================================================
    🔥 3. REKAP HISTORI TRANSAKSI PER USER (DARI AWAL SEWA - PDF A4)
====================================================== */
export const generateLaporanPerUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id_penghuni } = req.params;
        const now = new Date();

        // 1. Ambil data biodata murni penghuni
        const [userRows]: any = await db.query(
            `SELECT nama_lengkap, username, no_kamar, no_hp, tanggal_masuk, periode, status 
             FROM tb_penghuni WHERE id_penghuni = ? LIMIT 1`, 
            [id_penghuni]
        );
        const profil = userRows[0];

        if (!profil) {
            res.status(404).send('Error: Data profil penghuni tidak ditemukan.');
            return;
        }

        // 2. Tarik semua histori transaksi sukses milik user beserta tanggal jatuh tempo awal
        const [txRows]: any = await db.query(
            `SELECT id_transaksi, tgl_bayar, tgl_jatuh_tempo_awal, jenis_periode, nominal, denda, total, metode_pembayaran, status_midtrans
             FROM tb_transaksi 
             WHERE id_penghuni = ? AND (status_midtrans = 'settlement' OR status_midtrans = 'capture' || metode_pembayaran = 'cash')
             ORDER BY tgl_bayar ASC`,
            [id_penghuni]
        );

        // Inisialisasi dokumen kertas A4
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Rekap_Transaksi_${profil.nama_lengkap.replace(/\s+/g, '_')}.pdf`);
        doc.pipe(res);

        // --- HEADER DOKUMEN ---
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text('REKAPITULASI RIWAYAT TRANSAKSI PENYEWA', { align: 'center' });
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('KOS BU SULIATI MALANG', { align: 'center' });
        doc.fontSize(8.5).font('Helvetica').fillColor('#64748B').text(`Dicetak pada: ${now.toLocaleDateString('id-ID', { dateStyle: 'long' })}`, { align: 'center' });
        doc.moveDown(1.5);

        // --- GRID BIODATA INFORMASI USER ---
        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(30, doc.y).lineTo(565, doc.y).stroke();
        doc.moveDown(0.8);
        
        const renderHeaderLine = (label: string, value: string) => {
            const curY = doc.y;
            doc.fontSize(9.5).font('Helvetica').fillColor('#475569').text(label, 35, curY);
            doc.font('Helvetica-Bold').fillColor('#1e293b').text(`:  ${value}`, 150, curY);
            doc.moveDown(0.5);
        };

        renderHeaderLine('Nama Lengkap', profil.nama_lengkap || '-');
        renderHeaderLine('Username Akun', `@${profil.username || '-'}`);
        renderHeaderLine('Nomor Kamar', `Kamar Nomor ${profil.no_kamar || '-'}`);
        renderHeaderLine('Kontak WhatsApp', profil.no_hp || '-');
        renderHeaderLine('Tanggal Masuk', profil.tanggal_masuk ? new Date(profil.tanggal_masuk).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-');
        renderHeaderLine('Skema Periode', profil.periode || 'Bulanan');
        renderHeaderLine('Status Akun', (profil.status || '').toUpperCase());

        doc.moveDown(0.5);
        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(30, doc.y).lineTo(565, doc.y).stroke();
        doc.moveDown(1.2);

        // KETERANGAN TARIF DENDA DI ATAS TABEL
        doc.fontSize(9).font('Helvetica-Oblique').fillColor('#ef4444').text('* Catatan: Keterlambatan dikenakan denda aturan tetap sebesar Rp 5.000 / Hari', 30, doc.y);
        doc.moveDown(0.8);

        // --- VARIABEL AKUMULASI HITUNGAN TOTAL ---
        let totalPokokSewa = 0;
        let totalDendaKeseluruhan = 0;
        let totalAkumulasiDana = 0;

        // Pemetaan data baris tabel
        const listRowsTable: string[][] = txRows.map((tx: any, index: number) => {
            const nominalSewa = Number(tx.nominal || 0);
            const totalBayar = Number(tx.total || nominalSewa);
            const dendaFix = totalBayar > nominalSewa ? (totalBayar - nominalSewa) : 0;
            const jumlahHariTerlambat = dendaFix > 0 ? Math.floor(dendaFix / 5000) : 0;

            totalPokokSewa += nominalSewa;
            totalDendaKeseluruhan += dendaFix;
            totalAkumulasiDana += totalBayar;

            // Format tanggal bayar riil
            const tglBayarStr = tx.tgl_bayar 
                ? new Date(tx.tgl_bayar).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) 
                : '-';

            // 🔥 HITUNG / AMBIL DATA JATUH TEMPO SEBELUMNYA
            let tglTempoStr = '-';
            if (tx.tgl_jatuh_tempo_awal) {
                tglTempoStr = new Date(tx.tgl_jatuh_tempo_awal).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
            } else if (tx.tgl_bayar) {
                // Kalkulasi mundur otomatis jika kolom DB kosong: Tanggal bayar dikurangi hari terlambat
                const hitungMundur = new Date(tx.tgl_bayar);
                hitungMundur.setDate(hitungMundur.getDate() - jumlahHariTerlambat);
                tglTempoStr = hitungMundur.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
            }

            const viaTeks = tx.metode_pembayaran === 'cash' ? 'Tunai' : 'Online';

            return [
                (index + 1).toString(),
                tx.id_transaksi || '-',
                tglTempoStr, // Kolom Jatuh Tempo Sebelumnya
                tglBayarStr,
                tx.jenis_periode || '-',
                viaTeks,
                formatIDR(nominalSewa),
                formatIDR(dendaFix),
                jumlahHariTerlambat > 0 ? `${jumlahHariTerlambat} Hari` : '-',
                formatIDR(totalBayar)
            ];
        });

        // --- KONFIGURASI TABEL RATAKANAN KIRI & LOCK POSISI ---
        // Total Lebar 535pt pas untuk Margin 30pt kiri & kanan (A4 width = 595pt)
        // Ukuran kolom: [20, 85, 60, 60, 50, 45, 55, 55, 45, 60]
        await doc.table({
            headers: ['No', 'ID Transaksi', 'Jatuh Tempo', 'Tgl Bayar', 'Periode', 'Metode', 'Nominal Sewa', 'Denda', 'Hari', 'Total Bayar'],
            rows: listRowsTable,
            options: {
                x: 30, 
                width: 535,
                prepareHeader: () => doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a"),
                prepareRow: (row, i) => doc.font("Helvetica").fontSize(8).fillColor("#334155"),
                columnsSize: [20, 85, 60, 60, 50, 45, 55, 55, 45, 60]
            }
        });

        // --- BAGIAN RINGKASAN TOTAL BAWAH TABEL ---
        doc.moveDown(0.5);
        const startXInfo = 330;
        const startXValue = 470;

        const renderTotalLine = (label: string, value: number, isBold: boolean = false) => {
            const currentY = doc.y;
            doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(isBold ? '#0f172a' : '#475569');
            doc.text(label, startXInfo, currentY, { width: 140, align: 'left' });
            doc.text(formatIDR(value), startXValue, currentY, { width: 95, align: 'right' });
            doc.moveDown(0.6);
        };

        doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(startXInfo, doc.y).lineTo(565, doc.y).stroke();
        doc.moveDown(0.5);

        renderTotalLine('Total Pengeluaran Sewa', totalPokokSewa);
        renderTotalLine('Total Akumulasi Denda', totalDendaKeseluruhan);
        
        doc.strokeColor('#94a3b8').lineWidth(1.5).moveTo(startXInfo, doc.y).lineTo(565, doc.y).stroke();
        doc.moveDown(0.5);
        renderTotalLine('Total Keseluruhan', totalAkumulasiDana, true);

        // --- FOOTER LEGALITAS LISENSI KOS ---
        doc.moveDown(3);
        doc.fontSize(8.5).font('Helvetica-Oblique').fillColor('#94a3b8').text('Laporan ini valid sah dikeluarkan oleh Manajemen Aplikasi Kos Bu Suliati.', { align: 'center' });

        doc.end();
    } catch (error: any) {
        console.error("[LAPORAN USER ERROR]:", error);
        res.status(500).send('Gagal memproses PDF: ' + error.message);
    }
};

/* =================================================================
    🔥 4. REKAP SEMUA TRANSAKSI KOS (PER PENGHUNI / HALAMAN - PDF A4)
====================================================== */
export const generateLaporanSemuaUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const now = new Date();

        // 1. Ambil semua data penghuni yang memiliki riwayat transaksi sukses/cash
        const [penghuniRows]: any = await db.query(
            `SELECT DISTINCT p.id_penghuni, p.nama_lengkap, p.username, p.no_kamar, p.no_hp, p.tanggal_masuk, p.periode, p.status 
             FROM tb_penghuni p
             INNER JOIN tb_transaksi t ON p.id_penghuni = t.id_penghuni
             WHERE t.status_midtrans = 'settlement' OR t.status_midtrans = 'capture' OR t.metode_pembayaran = 'cash'`
        );

        if (penghuniRows.length === 0) {
            res.status(404).send('Error: Tidak ada data transaksi dari seluruh penghuni.');
            return;
        }

        // Inisialisasi dokumen kertas A4
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Rekap_Semua_Transaksi_Kos_${now.getFullYear()}.pdf`);
        doc.pipe(res);

        // Looping cetak data per penghuni (Satu penghuni per halaman)
        for (let i = 0; i < penghuniRows.length; i++) {
            const profil = penghuniRows[i];

            // Tarik histori transaksi sukses milik user ini
            const [txRows]: any = await db.query(
                `SELECT id_transaksi, tgl_bayar, tgl_jatuh_tempo_awal, jenis_periode, nominal, denda, total, metode_pembayaran, status_midtrans
                 FROM tb_transaksi 
                 WHERE id_penghuni = ? AND (status_midtrans = 'settlement' OR status_midtrans = 'capture' || metode_pembayaran = 'cash')
                 ORDER BY tgl_bayar ASC`,
                [profil.id_penghuni]
            );

            // Jika masuk ke user kedua dan seterusnya, buat halaman baru (Biar tidak digabung)
            if (i > 0) {
                doc.addPage({ margin: 30, size: 'A4' });
            }

            // --- HEADER DOKUMEN ---
            doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text('REKAPITULASI RIWAYAT TRANSAKSI PENYEWA', { align: 'center' });
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('KOS BU SULIATI MALANG', { align: 'center' });
            doc.fontSize(8.5).font('Helvetica').fillColor('#64748B').text(`Dicetak pada: ${now.toLocaleDateString('id-ID', { dateStyle: 'long' })}`, { align: 'center' });
            doc.moveDown(1.5);

            // --- GRID BIODATA INFORMASI USER ---
            doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(30, doc.y).lineTo(565, doc.y).stroke();
            doc.moveDown(0.8);
            
            const renderHeaderLine = (label: string, value: string) => {
                const curY = doc.y;
                doc.fontSize(9.5).font('Helvetica').fillColor('#475569').text(label, 35, curY);
                doc.font('Helvetica-Bold').fillColor('#1e293b').text(`:  ${value}`, 150, curY);
                doc.moveDown(0.5);
            };

            renderHeaderLine('Nama Lengkap', profil.nama_lengkap || '-');
            renderHeaderLine('Username Akun', `@${profil.username || '-'}`);
            renderHeaderLine('Nomor Kamar', `Kamar Nomor ${profil.no_kamar || '-'}`);
            renderHeaderLine('Kontak WhatsApp', profil.no_hp || '-');
            renderHeaderLine('Tanggal Masuk', profil.tanggal_masuk ? new Date(profil.tanggal_masuk).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-');
            renderHeaderLine('Skema Periode', profil.periode || 'Bulanan');
            renderHeaderLine('Status Akun', (profil.status || '').toUpperCase());

            doc.moveDown(0.5);
            doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(30, doc.y).lineTo(565, doc.y).stroke();
            doc.moveDown(1.2);

            // KETERANGAN TARIF DENDA DI ATAS TABEL
            doc.fontSize(9).font('Helvetica-Oblique').fillColor('#ef4444').text('* Catatan: Keterlambatan dikenakan denda aturan tetap sebesar Rp 5.000 / Hari', 30, doc.y);
            doc.moveDown(0.8);

            // --- VARIABEL AKUMULASI HITUNGAN TOTAL ---
            let totalPokokSewa = 0;
            let totalDendaKeseluruhan = 0;
            let totalAkumulasiDana = 0;

            const listRowsTable: string[][] = txRows.map((tx: any, index: number) => {
                const nominalSewa = Number(tx.nominal || 0);
                const totalBayar = Number(tx.total || nominalSewa);
                const dendaFix = totalBayar > nominalSewa ? (totalBayar - nominalSewa) : 0;
                const jumlahHariTerlambat = dendaFix > 0 ? Math.floor(dendaFix / 5000) : 0;

                totalPokokSewa += nominalSewa;
                totalDendaKeseluruhan += dendaFix;
                totalAkumulasiDana += totalBayar;

                const tglBayarStr = tx.tgl_bayar 
                    ? new Date(tx.tgl_bayar).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) 
                    : '-';

                let tglTempoStr = '-';
                if (tx.tgl_jatuh_tempo_awal) {
                    tglTempoStr = new Date(tx.tgl_jatuh_tempo_awal).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
                } else if (tx.tgl_bayar) {
                    const hitungMundur = new Date(tx.tgl_bayar);
                    hitungMundur.setDate(hitungMundur.getDate() - jumlahHariTerlambat);
                    tglTempoStr = hitungMundur.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
                }

                const viaTeks = tx.metode_pembayaran === 'cash' ? 'Tunai' : 'Online';

                return [
                    (index + 1).toString(),
                    tx.id_transaksi || '-',
                    tglTempoStr,
                    tglBayarStr,
                    tx.jenis_periode || '-',
                    viaTeks,
                    formatIDR(nominalSewa),
                    formatIDR(dendaFix),
                    jumlahHariTerlambat > 0 ? `${jumlahHariTerlambat} Hari` : '-',
                    formatIDR(totalBayar)
                ];
            });

            // CETAK TABEL (Mengunci koordinat X=30 agar presisi dan rata kiri-kanan)
            await doc.table({
                headers: ['No', 'ID Transaksi', 'Jatuh Tempo', 'Tgl Bayar', 'Periode', 'Metode', 'Nominal Sewa', 'Denda', 'Hari', 'Total Bayar'],
                rows: listRowsTable,
                options: {
                    x: 30, 
                    width: 535,
                    prepareHeader: () => doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a"),
                    prepareRow: (row, i) => doc.font("Helvetica").fontSize(8).fillColor("#334155"),
                    columnsSize: [20, 85, 60, 60, 50, 45, 55, 55, 45, 60]
                }
            });

            // --- RINGKASAN TOTAL BAWAH TABEL ---
            doc.moveDown(0.5);
            const startXInfo = 330;
            const startXValue = 470;

            const renderTotalLine = (label: string, value: number, isBold: boolean = false) => {
                const currentY = doc.y;
                doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(isBold ? '#0f172a' : '#475569');
                doc.text(label, startXInfo, currentY, { width: 140, align: 'left' });
                doc.text(formatIDR(value), startXValue, currentY, { width: 95, align: 'right' });
                doc.moveDown(0.6);
            };

            doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(startXInfo, doc.y).lineTo(565, doc.y).stroke();
            doc.moveDown(0.5);

            renderTotalLine('Total Pengeluaran Sewa', totalPokokSewa);
            renderTotalLine('Total Akumulasi Denda', totalDendaKeseluruhan);
            
            doc.strokeColor('#94a3b8').lineWidth(1.5).moveTo(startXInfo, doc.y).lineTo(565, doc.y).stroke();
            doc.moveDown(0.5);
            renderTotalLine('Total Keseluruhan', totalAkumulasiDana, true);

            // FOOTER DI SETIAP AKHIR HALAMAN USER
            doc.moveDown(2);
            doc.fontSize(8.5).font('Helvetica-Oblique').fillColor('#94a3b8').text('Laporan ini valid sah dikeluarkan oleh Manajemen Aplikasi Kos Bu Suliati.', { align: 'center' });
        }

        doc.end();
    } catch (error: any) {
        console.error("[LAPORAN ALL USER ERROR]:", error);
        res.status(500).send('Gagal memproses PDF: ' + error.message);
    }
};