import { Router } from 'express';

// Import Controller Autentikasi
import { 
  register, 
  login, 
  getAllUsers, 
  verifikasiLupaSandi, 
  resetKataSandiBaru 
} from '../controllers/authController';

// Import Controller Pembayaran (Cash & Midtrans)
import { 
  createPayment, 
  handleNotification, 
  getAllPayments 
} from '../controllers/paymentController';

// Import Controller Kamar
import { 
  addKamar, 
  getAllKamar, 
  updateKamar, 
  deleteKamar, 
  updateStatusKamar 
} from '../controllers/kamarController';

// Import Controller Penghuni & Profil (Pastikan getProfileById sudah di-export)
import { 
  addPenghuni, 
  getAllPenghuni, 
  updatePenghuni, 
  deletePenghuni, 
  getProfileById 
} from '../controllers/penghuniController';

// Import Controller Tagihan
import { 
  getAllTagihan, 
  generateTagihanDariPenghuni, 
  deleteTagihan,
  updateStatusTagihan,
  editDataTagihanManual 
} from '../controllers/tagihanController';

import {
  generateLaporanHTML,
  generateInvoiceHTML,
  generateLaporanPerUser,
  generateLaporanSemuaUser
} from '../controllers/laporanController';

// Import Controller Notifikasi & Alarm
import {  
    updateDeviceToken,
    tambahTagihan, 
    getNotifikasi, 
    tandaiSudahDibaca, 
    tandaiSemuaSudahDibaca,
    getTagihanAktif
} from '../controllers/notifikasiController';

// Import Service Perbaikan Tanggal Harian
import { perbaikanTagihanHarian } from '../services/tanggal_harian/updatetanggal';
const router = Router();

router.put('/tagihan/update-manual/:id', editDataTagihanManual);

// API Perbaikan Tanggal Tagihan Harian
router.put('/tagihan/perbaikan-harian', perbaikanTagihanHarian);

// --- 1. ENDPOINT AUTENTIKASI ---
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/users', getAllUsers);
router.post('/auth/verifikasi-lupa-sandi', verifikasiLupaSandi);
router.post('/auth/reset-password-baru', resetKataSandiBaru);

// --- 2. ENDPOINT MANAJEMEN KAMAR ---
router.get('/kamar/all', getAllKamar);
router.post('/kamar/add', addKamar); 
router.put('/kamar/update/:id', updateKamar);
router.delete('/kamar/delete/:id', deleteKamar);
router.put('/kamar/update-status/:id', updateStatusKamar); 

// --- 3. ENDPOINT MANAJEMEN PENGHUNI & PROFIL ---
router.get('/penghuni/all', getAllPenghuni);
router.post('/penghuni/add', addPenghuni); 
router.put('/penghuni/update/:id', updatePenghuni);
router.delete('/penghuni/delete/:id', deletePenghuni);

/** * ENDPOINT PROFIL UTAMA
 * Mendukung data Pemilik dan Penghuni agar tidak error "Sesi Berakhir".
 * Frontend React Native memanggil: /api/penghuni/:id?role=Pemilik
 */
router.get('/penghuni/:id', getProfileById);

// --- 4. ENDPOINT MANAJEMEN TAGIHAN ---
router.get('/tagihan/all', getAllTagihan);
router.post('/tagihan/generate', generateTagihanDariPenghuni);
router.delete('/tagihan/delete/:id', deleteTagihan);
router.put('/tagihan/update-status/:id', updateStatusTagihan);
router.get('/tagihan/aktif/:id_penghuni', getTagihanAktif); // Sinkronisasi Alarm

// --- 5. ENDPOINT PEMBAYARAN (CASH & MIDTRANS) ---
router.post('/payment/create', createPayment);
router.get('/payment/all', getAllPayments);
router.post('/payment/notification', handleNotification);

router.get('/transaksi/all', getAllPayments);

// --- 6. ENDPOINT LAPORAN & KUITANSI (INVOICE) ---
// --- 6. ENDPOINT LAPORAN & KUITANSI (INVOICE) ---
router.get('/laporan/generate-pdf', generateLaporanHTML);
router.get('/laporan/invoice/:id_transaksi', generateInvoiceHTML);

// Rekap histori transaksi per penghuni (1 PDF)
router.get(
  '/laporan/transaksi/penghuni/:id_penghuni',
  generateLaporanPerUser
);

// Rekap histori seluruh penghuni (1 penghuni = 1 halaman PDF)
router.get(
  '/laporan/transaksi/semua',
  generateLaporanSemuaUser
);

// --- 7. ENDPOINT NOTIFIKASI ---
router.get('/notifikasi/:id_penghuni', getNotifikasi);
router.put('/notifikasi/read/:id_notifikasi', tandaiSudahDibaca);
router.put('/notifikasi/read-all/:id_penghuni', tandaiSemuaSudahDibaca); 
// Rute untuk membuat tagihan baru (Otomatis kirim push notification instan ke HP penghuni)
router.post('/tagihan/tambah', tambahTagihan);
router.put('/penghuni/update-token', updateDeviceToken);

export default router;