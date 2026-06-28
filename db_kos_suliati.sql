-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Waktu pembuatan: 27 Jun 2026 pada 20.38
-- Versi server: 10.4.32-MariaDB
-- Versi PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `db_kos_suliati`
--

-- --------------------------------------------------------

--
-- Struktur dari tabel `tb_kamar`
--

CREATE TABLE `tb_kamar` (
  `id_kamar` int(11) NOT NULL,
  `no_kamar` varchar(10) NOT NULL,
  `harga_sewa` decimal(12,2) NOT NULL,
  `status_kamar` varchar(20) NOT NULL,
  `fasilitas` varchar(250) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `tb_kamar`
--

INSERT INTO `tb_kamar` (`id_kamar`, `no_kamar`, `harga_sewa`, `status_kamar`, `fasilitas`) VALUES
(1, 'A1', 400000.00, 'Terpakai', 'Meja & Kursi, WIFI Gratis');

-- --------------------------------------------------------

--
-- Struktur dari tabel `tb_notifikasi`
--

CREATE TABLE `tb_notifikasi` (
  `id_notifikasi` int(11) NOT NULL,
  `id_penghuni` int(11) NOT NULL,
  `judul` varchar(255) NOT NULL,
  `pesan` text NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `id_tagihan_ref` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Struktur dari tabel `tb_pembayaran`
--

CREATE TABLE `tb_pembayaran` (
  `id_pembayaran` int(11) NOT NULL,
  `id_transaksi` varchar(50) NOT NULL,
  `metode` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Struktur dari tabel `tb_penghuni`
--

CREATE TABLE `tb_penghuni` (
  `id_penghuni` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `no_kamar` varchar(10) NOT NULL,
  `nama_lengkap` varchar(50) NOT NULL,
  `no_hp` varchar(15) NOT NULL,
  `tanggal_masuk` date NOT NULL,
  `jenis_kelamin` varchar(20) NOT NULL,
  `status` varchar(20) NOT NULL,
  `periode` varchar(25) NOT NULL,
  `nominal` decimal(12,2) DEFAULT NULL,
  `device_token` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `tb_penghuni`
--

INSERT INTO `tb_penghuni` (`id_penghuni`, `username`, `no_kamar`, `nama_lengkap`, `no_hp`, `tanggal_masuk`, `jenis_kelamin`, `status`, `periode`, `nominal`, `device_token`) VALUES
(1, 'sal', 'A1', 'Sall', '089569263895', '2026-06-27', 'Laki-laki', 'Aktif', 'Bulanan', 400000.00, '46905f0e-fcd4-4c57-be0b-846acbf2bf32');

-- --------------------------------------------------------

--
-- Struktur dari tabel `tb_tagihan`
--

CREATE TABLE `tb_tagihan` (
  `id_tagihan` int(11) NOT NULL,
  `id_penghuni` int(11) DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `nama_lengkap` varchar(50) NOT NULL,
  `jenis_periode` varchar(25) NOT NULL,
  `nominal` decimal(12,2) NOT NULL,
  `denda` decimal(12,2) DEFAULT 0.00,
  `denda_base` int(11) DEFAULT 0,
  `total` decimal(12,2) DEFAULT NULL,
  `jatuh_tempo` date NOT NULL,
  `status_bayar` varchar(20) NOT NULL,
  `tanggal_bayar` datetime DEFAULT NULL,
  `is_tagihan_awal` tinyint(1) DEFAULT 0,
  `tanggal_masuk_record` datetime DEFAULT NULL,
  `last_notified_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `tb_tagihan`
--

INSERT INTO `tb_tagihan` (`id_tagihan`, `id_penghuni`, `username`, `nama_lengkap`, `jenis_periode`, `nominal`, `denda`, `denda_base`, `total`, `jatuh_tempo`, `status_bayar`, `tanggal_bayar`, `is_tagihan_awal`, `tanggal_masuk_record`, `last_notified_at`, `created_at`) VALUES
(1, 1, 'sal', 'Sall', 'Bulanan', 400000.00, 0.00, 0, 400000.00, '2026-07-27', 'Lunas', '2026-06-28 01:33:41', 0, NULL, NULL, '2026-06-28 01:32:02'),
(2, 1, 'sal', 'Sall', 'Bulanan', 400000.00, 0.00, 0, 400000.00, '2026-08-27', 'Belum Bayar', NULL, 0, NULL, NULL, '2026-06-28 01:33:41');

-- --------------------------------------------------------

--
-- Struktur dari tabel `tb_transaksi`
--

CREATE TABLE `tb_transaksi` (
  `id_transaksi` varchar(50) NOT NULL,
  `nominal` decimal(12,2) NOT NULL,
  `id_penghuni` int(11) NOT NULL,
  `id_tagihan` int(11) DEFAULT NULL,
  `tgl_bayar` datetime DEFAULT NULL,
  `status_midtrans` varchar(30) NOT NULL,
  `metode_pembayaran` enum('cash','midtrans') DEFAULT 'cash',
  `rincian_pembayaran` varchar(50) DEFAULT NULL,
  `denda` decimal(12,2) DEFAULT 0.00,
  `total` decimal(12,2) DEFAULT NULL,
  `jenis_periode` varchar(25) DEFAULT NULL,
  `tgl_masuk` date DEFAULT NULL,
  `tgl_jatuh_tempo_awal` date DEFAULT NULL,
  `tgl_jatuh_tempo_baru` date DEFAULT NULL,
  `jenis_periode_masuk` varchar(25) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `tb_transaksi`
--

INSERT INTO `tb_transaksi` (`id_transaksi`, `nominal`, `id_penghuni`, `id_tagihan`, `tgl_bayar`, `status_midtrans`, `metode_pembayaran`, `rincian_pembayaran`, `denda`, `total`, `jenis_periode`, `tgl_masuk`, `tgl_jatuh_tempo_awal`, `tgl_jatuh_tempo_baru`, `jenis_periode_masuk`) VALUES
('MIDTRANS-1', 400000.00, 1, 1, '2026-06-28 01:33:41', 'settlement', 'midtrans', 'BCA', 0.00, 400000.00, 'Bulanan', '2026-06-27', '2026-07-27', NULL, 'Bulanan');

-- --------------------------------------------------------

--
-- Struktur dari tabel `tb_user`
--

CREATE TABLE `tb_user` (
  `id_user` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `nama_lengkap` varchar(100) NOT NULL,
  `no_hp` varchar(15) NOT NULL,
  `jenis_kelamin` enum('Laki-laki','Perempuan') NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(20) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `tb_user`
--

INSERT INTO `tb_user` (`id_user`, `username`, `nama_lengkap`, `no_hp`, `jenis_kelamin`, `password`, `role`, `created_at`) VALUES
(1, 'rey', 'Reyhan', '081238800995', 'Laki-laki', '$2b$10$kfHQiMXMms7OAW6sI.bbsefygm1IMWefKnn0QEzCWhGI1kxnNMcze', 'Penghuni', '2026-06-27 18:29:49'),
(2, 'sal', 'Sall', '089569263895', 'Laki-laki', '$2b$10$q2E24QPcHivt.pg10HT8yuqGl5jx0umDN6ZRClo7CRAcBv3k37ZkS', 'Penghuni', '2026-06-27 18:30:09'),
(3, 'cen', 'Cen', '084123569238', 'Laki-laki', '$2b$10$wgatlZi3WgO5Lr6zY5eBz.CfFAAdYUV13KXpLBXjCBW9j1.VA4LHy', 'Pemilik', '2026-06-27 18:30:41');

--
-- Indexes for dumped tables
--

--
-- Indeks untuk tabel `tb_kamar`
--
ALTER TABLE `tb_kamar`
  ADD PRIMARY KEY (`id_kamar`),
  ADD UNIQUE KEY `no_kamar` (`no_kamar`);

--
-- Indeks untuk tabel `tb_notifikasi`
--
ALTER TABLE `tb_notifikasi`
  ADD PRIMARY KEY (`id_notifikasi`),
  ADD KEY `fk_notifikasi_penghuni` (`id_penghuni`);

--
-- Indeks untuk tabel `tb_pembayaran`
--
ALTER TABLE `tb_pembayaran`
  ADD PRIMARY KEY (`id_pembayaran`),
  ADD KEY `id_transaksi` (`id_transaksi`);

--
-- Indeks untuk tabel `tb_penghuni`
--
ALTER TABLE `tb_penghuni`
  ADD PRIMARY KEY (`id_penghuni`),
  ADD KEY `no_kamar` (`no_kamar`);

--
-- Indeks untuk tabel `tb_tagihan`
--
ALTER TABLE `tb_tagihan`
  ADD PRIMARY KEY (`id_tagihan`),
  ADD KEY `fk_penghuni_tagihan` (`id_penghuni`);

--
-- Indeks untuk tabel `tb_transaksi`
--
ALTER TABLE `tb_transaksi`
  ADD PRIMARY KEY (`id_transaksi`),
  ADD KEY `fk_penghuni_transaksi` (`id_penghuni`);

--
-- Indeks untuk tabel `tb_user`
--
ALTER TABLE `tb_user`
  ADD PRIMARY KEY (`id_user`);

--
-- AUTO_INCREMENT untuk tabel yang dibuang
--

--
-- AUTO_INCREMENT untuk tabel `tb_kamar`
--
ALTER TABLE `tb_kamar`
  MODIFY `id_kamar` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT untuk tabel `tb_notifikasi`
--
ALTER TABLE `tb_notifikasi`
  MODIFY `id_notifikasi` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_pembayaran`
--
ALTER TABLE `tb_pembayaran`
  MODIFY `id_pembayaran` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_penghuni`
--
ALTER TABLE `tb_penghuni`
  MODIFY `id_penghuni` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT untuk tabel `tb_tagihan`
--
ALTER TABLE `tb_tagihan`
  MODIFY `id_tagihan` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT untuk tabel `tb_user`
--
ALTER TABLE `tb_user`
  MODIFY `id_user` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- Ketidakleluasaan untuk tabel pelimpahan (Dumped Tables)
--

--
-- Ketidakleluasaan untuk tabel `tb_notifikasi`
--
ALTER TABLE `tb_notifikasi`
  ADD CONSTRAINT `fk_notifikasi_penghuni` FOREIGN KEY (`id_penghuni`) REFERENCES `tb_penghuni` (`id_penghuni`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Ketidakleluasaan untuk tabel `tb_pembayaran`
--
ALTER TABLE `tb_pembayaran`
  ADD CONSTRAINT `tb_pembayaran_ibfk_1` FOREIGN KEY (`id_transaksi`) REFERENCES `tb_transaksi` (`id_transaksi`) ON DELETE CASCADE;

--
-- Ketidakleluasaan untuk tabel `tb_penghuni`
--
ALTER TABLE `tb_penghuni`
  ADD CONSTRAINT `tb_penghuni_ibfk_1` FOREIGN KEY (`no_kamar`) REFERENCES `tb_kamar` (`no_kamar`) ON UPDATE CASCADE;

--
-- Ketidakleluasaan untuk tabel `tb_tagihan`
--
ALTER TABLE `tb_tagihan`
  ADD CONSTRAINT `fk_penghuni_tagihan` FOREIGN KEY (`id_penghuni`) REFERENCES `tb_penghuni` (`id_penghuni`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Ketidakleluasaan untuk tabel `tb_transaksi`
--
ALTER TABLE `tb_transaksi`
  ADD CONSTRAINT `fk_penghuni_transaksi` FOREIGN KEY (`id_penghuni`) REFERENCES `tb_penghuni` (`id_penghuni`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
