import { Request, Response } from 'express';
import db from '../config/database';

/* ======================================================
   1. LIHAT SEMUA PENGHUNI
====================================================== */
export const getAllPenghuni = async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT * FROM tb_penghuni');
    res.json({ status: 'success', data: rows });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/* ======================================================
   🔥 FUNGSI HELPER: SINKRONISASI ATURAN HARGA FRONTEND
====================================================== */
const hitungDataTagihan = (hargaDasar: number, periode: string, tglMasuk: Date) => {
  const dasar = Number(hargaDasar);
  const jatuhTempo = new Date(tglMasuk);
  
  // 🌟 Gunakan hargaDasar (input dari form) jika ada, jika tidak ada/0 baru pakai fallback default
  let nominalFinal = dasar > 0 ? dasar : (periode === 'Harian' ? 25000 : periode === 'Mingguan' ? 125000 : 0);

  switch (periode) {
    case 'Harian':
      jatuhTempo.setDate(jatuhTempo.getDate() + 1);
      // nominalFinal sudah otomatis mengikuti nilai 'dasar' di atas
      break;
    case 'Mingguan':
      jatuhTempo.setDate(jatuhTempo.getDate() + 7);
      // nominalFinal sudah otomatis mengikuti nilai 'dasar' di atas
      break;
    case 'Bulanan':
      jatuhTempo.setMonth(jatuhTempo.getMonth() + 1);
      break;
    case '3 Bulan':
      jatuhTempo.setMonth(jatuhTempo.getMonth() + 3);
      break;
    case '6 Bulan':
      jatuhTempo.setMonth(jatuhTempo.getMonth() + 6);
      break;
    case '1 Tahun':
      jatuhTempo.setFullYear(jatuhTempo.getFullYear() + 1);
      break;
    default:
      jatuhTempo.setMonth(jatuhTempo.getMonth() + 1);
  }

  return { nominalFinal, jatuhTempo };
};

/* ======================================================
   2. TAMBAH PENGHUNI
====================================================== */
export const addPenghuni = async (req: Request, res: Response) => {
  const {
    username, no_kamar, tanggal_masuk, status, periode, nominal,
    nama_lengkap, no_hp, jenis_kelamin 
  } = req.body;

  try {
    // 1. Ambil data asli dari tb_user berdasarkan username
    const [userData]: any = await db.query(
      'SELECT nama_lengkap, no_hp, jenis_kelamin FROM tb_user WHERE username = ?',
      [username]
    );

    if (userData.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Username tidak ditemukan di sistem' });
    }

    const finalNama = userData[0].nama_lengkap || nama_lengkap;
    const finalHp = userData[0].no_hp || no_hp;
    const finalJK = userData[0].jenis_kelamin || jenis_kelamin;

    const hargaKamarInput = Number(nominal) || 0;
    const tglMasukDate = new Date(tanggal_masuk);
    const { nominalFinal, jatuhTempo } = hitungDataTagihan(hargaKamarInput, periode, tglMasukDate);

    // 2. Insert ke tb_penghuni (Gunakan nominalInput modifikasi yang dikirim frontend)
    const [result]: any = await db.query(
      `INSERT INTO tb_penghuni 
       (username, no_kamar, nama_lengkap, no_hp, tanggal_masuk, jenis_kelamin, status, periode, nominal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, no_kamar, finalNama, finalHp, tanggal_masuk, finalJK, status, periode, hargaKamarInput]
    );

    const newIdPenghuni = result.insertId;

    // 3. Buat Tagihan Otomatis
    await db.query(
      `INSERT INTO tb_tagihan 
       (id_penghuni, username, nama_lengkap, jenis_periode, nominal, jatuh_tempo, status_bayar)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newIdPenghuni, username, finalNama, periode, nominalFinal, jatuhTempo, 'Belum Bayar']
    );

    // 4. Update Status Kamar Menjadi Terpakai jika status 'Aktif'
    if (status === 'Aktif') {
      await db.query('UPDATE tb_kamar SET status_kamar = "Terpakai" WHERE no_kamar = ?', [no_kamar]);
    }

    res.status(201).json({
      status: 'success',
      message: 'Penghuni berhasil ditambahkan dengan data profil dari akun user',
      data: { id_penghuni: newIdPenghuni },
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/* ======================================================
   3. UPDATE PENGHUNI
====================================================== */
export const updatePenghuni = async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    username, no_kamar, nama_lengkap, no_hp,
    tanggal_masuk, jenis_kelamin, status, periode, nominal,
  } = req.body;

  try {
    const hargaKamarInput = Number(nominal) || 0;
    const tglMasukDate = new Date(tanggal_masuk);
    const { nominalFinal, jatuhTempo } = hitungDataTagihan(hargaKamarInput, periode, tglMasukDate);

    // 1. Update data tb_penghuni
    await db.query(
      `UPDATE tb_penghuni SET
        username = ?, no_kamar = ?, nama_lengkap = ?, no_hp = ?,
        tanggal_masuk = ?, jenis_kelamin = ?, status = ?, periode = ?, nominal = ?
       WHERE id_penghuni = ?`,
      [username, no_kamar, nama_lengkap, no_hp, tanggal_masuk, jenis_kelamin, status, periode, hargaKamarInput, id]
    );

    // 2. Jika Status Menjadi 'Tidak Aktif'
    if (status === 'Tidak Aktif') {
      await db.query(
        `UPDATE tb_tagihan SET status_bayar = 'Dibatalkan' 
         WHERE id_penghuni = ? AND status_bayar = 'Belum Bayar'`,
        [id]
      );
      await db.query(`UPDATE tb_kamar SET status_kamar = 'Tersedia' WHERE no_kamar = ?`, [no_kamar]);

      return res.json({ status: 'success', message: 'Penghuni dinonaktifkan' });
    } 
    
    // 3. Jika Status Diaktifkan Kembali
    else {
      await db.query(
        `UPDATE tb_tagihan SET
          username = ?, nama_lengkap = ?, jenis_periode = ?, nominal = ?, jatuh_tempo = ?, status_bayar = 'Belum Bayar'
         WHERE id_penghuni = ? AND (status_bayar = 'Belum Bayar' OR status_bayar = 'Dibatalkan')`,
        [username, nama_lengkap, periode, nominalFinal, jatuhTempo, id]
      );
      await db.query(`UPDATE tb_kamar SET status_kamar = 'Terpakai' WHERE no_kamar = ?`, [no_kamar]);

      return res.json({ status: 'success', message: 'Penghuni diaktifkan kembali' });
    }
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/* ======================================================
    4. HAPUS PENGHUNI
====================================================== */
export const deletePenghuni = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
      // 1. Ambil no_kamar dari penghuni yang akan dihapus
      const [penghuni]: any = await db.query('SELECT no_kamar FROM tb_penghuni WHERE id_penghuni = ?', [id]);
      if (penghuni.length === 0) {
          return res.status(404).json({ status: 'error', message: 'Data tidak ditemukan' });
      }
      const noKamar = penghuni[0].no_kamar;

      // 2. Hapus tagihan yang belum lunas & hapus penghuni
      await db.query('DELETE FROM tb_tagihan WHERE id_penghuni = ? AND status_bayar != "Lunas"', [id]);
      await db.query('DELETE FROM tb_penghuni WHERE id_penghuni = ?', [id]);

      // 🔥 3. UPDATE OTOMATIS: Ubah status kamar menjadi Tersedia kembali
      await db.query('UPDATE tb_kamar SET status_kamar = "Tersedia" WHERE no_kamar = ?', [noKamar]);

      res.status(200).json({ status: 'success', message: `Penghuni dihapus & Kamar ${noKamar} tersedia` });
  } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
  }
};
/* ======================================================
   5. AMBIL DATA PROFIL BERDASARKAN ID
====================================================== */
export const getProfileById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role } = req.query;

  try {
    let query = '';
    
    if (role === 'Pemilik') {
      query = `
        SELECT 
          id_user, 
          username, 
          nama_lengkap, 
          no_hp, 
          jenis_kelamin, 
          role, 
          created_at as tanggal_masuk, 
          password 
        FROM tb_user 
        WHERE id_user = ?`;
    } 
    else {
      query = `
        SELECT 
          p.*, 
          u.password, 
          u.role as user_role,
          u.username as user_username
        FROM tb_penghuni p
        JOIN tb_user u ON p.username = u.username
        WHERE p.id_penghuni = ?`;
    }

    const [rows]: any = await db.query(query, [id]);

    if (rows.length === 0) {
      const [userFallback]: any = await db.query(
        `SELECT 
          id_user as id_penghuni, 
          username, 
          nama_lengkap, 
          no_hp, 
          jenis_kelamin, 
          role, 
          password,
          created_at as tanggal_masuk 
         FROM tb_user WHERE id_user = ? OR username = ?`,
        [id, id]
      );

      if (userFallback.length === 0) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Profil tidak ditemukan di sistem' 
        });
      }
      return res.json(userFallback[0]);
    }

    res.json(rows[0]); 

  } catch (error: any) {
    console.error("Error at getProfileById:", error.message);
    res.status(500).json({ 
      status: 'error', 
      message: 'Terjadi kesalahan pada server saat memuat profil' 
    });
  }
};