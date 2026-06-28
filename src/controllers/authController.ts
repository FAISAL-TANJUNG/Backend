import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../config/database';

/**
 * =========================
 * REGISTER USER
 * =========================
 */
export const register = async (req: Request, res: Response) => {
  const {
    username,
    password,
    role,
    nama_lengkap,
    no_hp,
    jenis_kelamin,
  } = req.body;

  try {
    // Validasi role
    const validRoles = ['Penghuni', 'Pemilik'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        status: 'error',
        message: 'Role tidak valid.',
      });
    }

    // Validasi data
    if (!username || username.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Username wajib diisi.',
      });
    }

    if (!nama_lengkap || nama_lengkap.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Nama lengkap wajib diisi.',
      });
    }

    if (!no_hp || no_hp.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Nomor handphone wajib diisi.',
      });
    }

    if (!jenis_kelamin || jenis_kelamin.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Jenis kelamin wajib dipilih.',
      });
    }

    if (!password || password.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Password wajib diisi.',
      });
    }

    // Cek username atau nomor HP
    const [existing]: any = await db.query(
      `SELECT username, no_hp
       FROM tb_user
       WHERE username = ? OR no_hp = ?`,
      [username.trim(), no_hp.trim()]
    );

    if (existing.length > 0) {
      if (existing[0].username === username.trim()) {
        return res.status(409).json({
          status: 'error',
          message: 'Username sudah digunakan.',
        });
      }

      if (existing[0].no_hp === no_hp.trim()) {
        return res.status(409).json({
          status: 'error',
          message: 'Nomor handphone sudah terdaftar.',
        });
      }
    }

    // Enkripsi password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Simpan user
    await db.query(
      `INSERT INTO tb_user
      (username, nama_lengkap, no_hp, jenis_kelamin, password, role)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        username.trim(),
        nama_lengkap.trim(),
        no_hp.trim(),
        jenis_kelamin,
        hashedPassword,
        role,
      ]
    );

    return res.status(201).json({
      status: 'success',
      message: `User berhasil didaftarkan sebagai ${role}.`,
    });

  } catch (error: any) {
    console.error(error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        status: 'error',
        message: 'Username atau nomor handphone sudah digunakan.',
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan pada server. Silakan coba lagi.',
    });
  }
};
/**
 * =========================
 * LOGIN USER (DENGAN UPDATE DEVICE TOKEN)
 * =========================
 */
export const login = async (req: Request, res: Response) => {
  const { username, password, role, device_token } = req.body;

  try {
    const query = `
      SELECT u.*, p.id_penghuni 
      FROM tb_user u 
      LEFT JOIN tb_penghuni p ON u.username = p.username 
      WHERE u.username = ?
    `;
    
    const [rows]: any = await db.query(query, [username]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User tidak ditemukan',
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({
        status: 'error',
        message: 'Password salah',
      });
    }

    if (role && user.role !== role) {
      return res.status(403).json({
        status: 'error',
        message: `Akun Anda terdaftar sebagai ${user.role}. Anda tidak bisa masuk sebagai ${role}.`,
      });
    }

    if (user.role === 'Penghuni' && user.id_penghuni && device_token) {
      await db.query(
        'UPDATE tb_penghuni SET device_token = ? WHERE id_penghuni = ?',
        [device_token, user.id_penghuni]
      );
      console.log(`[AUTH] Device token diperbarui untuk: ${user.username}`);
    }

    const token = jwt.sign(
      { id: user.id_user, role: user.role },
      process.env.JWT_SECRET || 'secret_kos',
      { expiresIn: '1d' }
    );

    res.json({
      status: 'success',
      message: 'Login berhasil',
      token,
      role: user.role,
      username: user.username,
      nama_lengkap: user.nama_lengkap,
      no_hp: user.no_hp,
      jenis_kelamin: user.jenis_kelamin,
      id_user: user.id_user,
      id_penghuni: user.id_penghuni || null,
      created_at: user.created_at
    });
  } catch (error: any) {
    console.error('Login Error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * =========================
 * GET ALL USERS
 * =========================
 */
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const [rows]: any = await db.query(`
      SELECT 
        id_user,
        username,
        nama_lengkap,
        no_hp,
        jenis_kelamin,
        role,
        created_at
      FROM tb_user
      ORDER BY id_user DESC
    `);

    res.json({
      status: 'success',
      total: rows.length,
      data: rows,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil data user',
      error: error.message,
    });
  }
};

/**
 * ============================================
 * FUNGSI BARU: VERIFIKASI DATA LUPA KATA SANDI
 * ============================================
 */
export const verifikasiLupaSandi = async (req: Request, res: Response) => {
  const { username, no_kamar, no_hp } = req.body;

  if (!username || !no_kamar || !no_hp) {
    return res.status(400).json({
      status: 'error',
      message: 'Username, nomor kamar, dan nomor HP wajib diisi.',
    });
  }

  try {
    // Mencocokkan data akun user dengan relasi data kamar di tabel penghuni
    const query = `
      SELECT u.id_user 
      FROM tb_user u
      INNER JOIN tb_penghuni p ON u.username = p.username
      WHERE LOWER(u.username) = ? AND p.no_kamar = ? AND u.no_hp = ?
    `;

    const [rows]: any = await db.query(query, [username.toLowerCase().trim(), no_kamar.trim(), no_hp.trim()]);

    if (rows.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'Data yang Anda masukkan salah atau tidak terdaftar!',
      });
    }

    res.json({
      status: 'success',
      message: 'Verifikasi identitas berhasil.',
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Gagal melakukan verifikasi data data lokal',
      error: error.message,
    });
  }
};

/**
 * ============================================
 * FUNGSI BARU: SIMPAN RESET KATA SANDI BARU
 * ============================================
 */
export const resetKataSandiBaru = async (req: Request, res: Response) => {
  const { username, password_baru } = req.body;

  if (!username || !password_baru) {
    return res.status(400).json({
      status: 'error',
      message: 'Username dan Password baru wajib diisi.',
    });
  }

  try {
    // Lakukan hashing untuk keamanan password baru
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password_baru, salt);

    // Update data di tabel utama tb_user
    const [result]: any = await db.query(
      'UPDATE tb_user SET password = ? WHERE LOWER(username) = ?',
      [hashedPassword, username.toLowerCase().trim()]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Gagal memperbarui sandi, user tidak ditemukan.',
      });
    }

    res.json({
      status: 'success',
      message: 'Kata sandi Anda berhasil diperbarui, silakan login kembali.',
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Gagal mereset kata sandi baru',
      error: error.message,
    });
  }
};