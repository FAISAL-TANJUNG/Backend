// --- Model untuk tb_user ---
export interface User {
  id_user?: number;
  username: string;
  nama_lengkap: string;
  no_hp: string;
  jenis_kelamin: 'Laki-laki' | 'Perempuan';
  password?: string;
  role: string;
  created_at?: string | Date;
}

// --- Model untuk tb_kamar ---
export interface Kamar {
  id_kamar?: number;
  no_kamar: string;
  harga_sewa: number; // decimal(12,2) -> number
  status_kamar: string;
  fasilitas?: string | null; // Nullable
}

// --- Model untuk tb_penghuni ---
export interface Penghuni {
  id_penghuni?: number;
  username: string;
  no_kamar: string;
  nama_lengkap: string;
  no_hp: string;
  tanggal_masuk: string | Date;
  jenis_kelamin: string;
  status: string;
  periode: string;
  nominal?: number | null; // decimal(12,2)
  device_token?: string | null;
}

// --- Model untuk tb_tagihan ---
export interface Tagihan {
  id_tagihan?: number;
  id_penghuni?: number;
  username?: string | null;
  nama_lengkap: string;
  jenis_periode: string;
  nominal: number;
  denda?: number; // Default 0.00
  total?: number; // Hasil hitung nominal + denda
  jatuh_tempo: string | Date;
  status_bayar: string;
  tanggal_bayar?: string | Date | null;
  is_tagihan_awal?: number; // tinyint(1) -> 0 atau 1
  tanggal_masuk_record?: string | Date | null;
  last_notified_at?: string | Date | null;
  created_at?: string | Date;
}

// --- Model untuk tb_transaksi ---
export interface Transaksi {
  id_transaksi: string; // Primary Key (Varchar)
  nominal: number;
  id_penghuni: number;
  id_tagihan?: number | null;
  tgl_bayar?: string | Date | null;
  status_midtrans: string; // varchar(30) - sesuaikan dengan respons Midtrans
  metode_pembayaran?: 'cash' | 'midtrans' | null;
  rincian_pembayaran?: string | null;
  denda?: number;
  total?: number;
  jenis_periode?: string | null;
  tgl_masuk?: string | Date | null;
  tgl_jatuh_tempo_awal?: string | Date | null;
  tgl_jatuh_tempo_baru?: string | Date | null;
  jenis_periode_masuk?: string | null;
}

// --- Model untuk tb_pembayaran ---
export interface Pembayaran {
  id_pembayaran?: number;
  id_transaksi: string; // Relasi ke PK tb_transaksi
  metode: string;
}

// --- Model untuk tb_notifikasi (Asumsi struktur tabel) ---
export interface Notifikasi {
  id_notifikasi?: number;
  id_penghuni: number;
  judul: string;
  pesan: string;
  is_read?: number; // Biasa gunakan tinyint(1)
  created_at?: string | Date;
}