DESKRIPSI APLIKASI

Aplikasi ini mendigitalisasi dan mengotomatisasi manajemen kos berbasis Android menggunakan framework React Native. 
Fokus utamanya adalah mengotomatisasi sistem pembayaran multi-periode yang fleksibel bagi penghuni, mulai dari jangka waktu harian, 
mingguan, bulanan, 3 bulanan, 6 bulanan, hingga 1 tahun. Melalui sistem ini, penghuni dapat mengecek tagihan, bukti pembayaran, 
dan mencetak bukti transaksi secara mandiri. Sementara bagi pemilik, aplikasi ini mempermudah pemantauan kamar, verifikasi real-time, pengiriman tagihan otomatis, 
serta pencetakan laporan keuangan secara digital untuk menggantikan pencatatan manual.


PANDUAN PENGGUNAAN 

Alur Pendaftaran Penghuni Kos
1. Tampilan awal aplikasi ketika dibuka.
2. Calon penghuni kos melakukan pendaftaran akun terlebih dahulu.
3. Setelah berhasil mendaftar akun, login kembali menggunakan akun yang telah dibuat.
4. Di tampilan beranda akan muncul pop-up untuk tindak lanjut sewa kos, di mana ada instruksi untuk memilih periode sewa dan konfirmasi ke admin.
5. Setelah menekan tombol konfirmasi ke admin, pengguna akan diarahkan ke aplikasi WhatsApp untuk mengirim pesan konfirmasi penyewaan.
6. Tunggu admin menginput data penghuni ke sistem dan memberikan balasan konfirmasi via WhatsApp.
7. Setelah itu, pengguna cek lagi di aplikasi; pada menu beranda akan muncul data penghuni beserta tagihannya.
8. Di menu tagihan juga sudah tersedia tagihan untuk periode awal sewa.
   
Alur Pembayaran Midtrans (Penghuni Kos)
1. Masuk ke beranda, pengguna bisa langsung bayar dari sini atau pergi ke menu tagihan.
2. Di menu tagihan, klik tombol "Bayar Sekarang" pada tagihan yang tersedia.
3. Pilih metode Pembayaran Midtrans (tersedia juga panduan transaksi di bawah tombol opsi pembayaran).
4. Setelah mengeklik tombol, akan muncul pop-up ringkasan data transaksi Midtrans, lalu klik tombol "Buka Pembayaran Midtrans".
5. Setelah itu akan muncul tampilan peringatan, klik "Lanjut Pilih Bayar".
6. Di tampilan berikutnya, pilih metode pembayaran yang sesuai dengan kebutuhan (bank transfer atau e-wallet).
7. Salin nomor virtual account atau kode bayar untuk melakukan transaksi di aplikasi pihak kedua (m-banking/e-wallet).
8. Setelah transaksi selesai, status dari sistem akan memunculkan tampilan transaksi berhasil, lalu klik "Kembali ke Beranda".
9. Cek kembali di menu tagihan apakah statusnya sudah berubah menjadi "Lunas".
10. Riwayat transaksi baik yang lunas maupun tertunda/gagal bisa dilihat di menu "Bukti".

Alur Pembayaran Tunai/Cash (Penghuni Kos)
1. Penghuni kos login dan masuk ke beranda (bisa langsung bayar dari sini atau ke menu tagihan).
2. Di menu tagihan, klik tombol "Bayar Sekarang".
3. Pilih metode "Pembayaran Tunai/Cash Langsung" (langkah-langkah alurnya tersedia di bagian bawah).
4. Setelah mengeklik tombol bayar tunai, muncul pop-up lalu klik tombol "Ya, Saya Sudah Bayar Tunai".
5. Muncul pemberitahuan untuk menunggu validasi dari pemilik kos. Serahkan uang tunainya ke pemilik, lalu klik tombol "OKE SAYA TUNGGU".
6. Jika dicek di menu tagihan penghuni, status tagihannya berubah menjadi "Menunggu Validasi".
7. Pemilik kos login, masuk ke menu tagihan, dan memeriksa pembayaran tunai. Jika uang sudah diterima, pemilik klik tombol "Validasi Pembayaran".
8. Pemilik klik tombol "Ya, Validasi" untuk memverifikasi pembayaran agar statusnya berubah menjadi "Lunas".
9. Penghuni memeriksa kembali menu tagihan di aplikasinya; jika sudah divalidasi maka statusnya berubah menjadi "Lunas".
10. Penghuni bisa cek menu "Bukti" untuk melihat riwayat pembayaran kos dan mengeklik tombol "Unduh Bukti Pembayaran".
11. Sistem akan menampilkan kuitansi pembayaran kos dalam bentuk file PDF.

Alur Tambah Kamar (Pemilik Kos)
1. Pemilik kos login terlebih dahulu dan pilih role "Pemilik".
2. Masuk ke menu kamar dan klik ikon tambah (+) di pojok kanan bawah.
3. Pada tampilan formulir, isi data kamar mulai dari nomor, harga sewa, fasilitas, hingga status.
4. Nomor kamar default tersedia dari A1-A10. Jika sudah terpakai semua nomor tersebut akan disembunyikan; klik tombol "Tambah Nomor Kamar" untuk membuat nomor baru.
5. Pilih harga, centang fasilitas yang tersedia, tentukan status kamar, lalu klik tombol "Simpan" di pojok kanan bawah.
6. Akan muncul pemberitahuan berhasil disimpan, lalu klik tombol "Selesai".
7. Terakhir, cek menu kamar untuk melihat hasil penambahan kamar baru.

Alur Tambah Penghuni (Pemilik Kos)
1. Pemilik kos login terlebih dahulu dan memilih role sebagai "Pemilik".
2. Masuk ke menu "Penghuni" dan klik ikon tambah (+) di pojok kanan bawah.
3. Setelah itu akan muncul form pengisian untuk data penghuni baru.
4. Pemilik kos cukup memilih akun user yang diambil dari daftar hasil registrasi calon penghuni kos yang sudah ada.
5. Setelah memilih akun, kolom nama lengkap, nomor HP, dan gender akan otomatis terisi dari database. Data ini, beserta status unit kamar, periode sewa, dan tanggal masuk bisa disesuaikan lagi. Jika sudah sesuai, klik tombol "Simpan" di pojok kanan bawah.
6. Muncul pemberitahuan bahwa data penghuni berhasil ditambahkan.
7. Terakhir, cek menu "Penghuni" untuk melihat hasil data penghuni baru tersebut.


FITUR UTAMA

Sistem Pembayaran Multi-Periode 
Aplikasi ini mendukung otomatisasi tagihan dengan berbagai pilihan jangka waktu sewa yang bisa dipilih oleh penghuni, meliputi:
1. Harian & Mingguan
2. Bulanan & 3 Bulanan
3. 6 Bulanan & 1 Tahun

Fitur untuk Penghuni Kos
1. Pendaftaran & Pemesanan Kamar: Registrasi akun mandiri, pemilihan periode sewa, dan integrasi konfirmasi kelanjutan sewa via WhatsApp ke admin/pemilik.
2. Manajemen Tagihan: Mengecek tagihan aktif untuk periode awal maupun periode berjalan secara mandiri.
3. Pembayaran Digital (Midtrans): Pembayaran otomatis secara real-time menggunakan Virtual Account (bank transfer) atau e-wallet. Status tagihan otomatis berubah menjadi "Lunas" setelah transaksi sukses.
4. Pembayaran Tunai (Cash): Opsi pelaporan jika penghuni membayar tunai langsung ke pemilik. Status akan berubah menjadi "Menunggu Validasi" hingga pemilik menyetujuinya.
5. Riwayat & Kuitansi Digital: Menu khusus untuk melihat riwayat transaksi (lunas, tertunda, atau gagal) serta fitur untuk mengunduh bukti pembayaran dalam bentuk file PDF.

Fitur untuk Pemilik Kos
1. Manajemen Kamar: Menambah unit kamar baru, mengatur harga sewa, memilih fasilitas, dan memantau status ketersediaan kamar.
2. Manajemen Penghuni: Menambahkan penghuni baru dengan menghubungkannya langsung ke akun pengguna yang sudah registrasi. Data profil akan terisi otomatis dan pemilik tinggal menyesuaikan unit kamar serta tanggal masuk.
3. Verifikasi & Validasi Real-Time: Memvalidasi pembayaran tunai dari penghuni secara digital agar statusnya berubah menjadi lunas di sistem.
4. Pencetakan Laporan Keuangan: Otomatisasi pengiriman tagihan dan pencetakan laporan keuangan digital untuk menggantikan pencatatan buku fisik (PDF).

Sisi Teknis (Backend & Infrastruktur)
1. Menggunakan TypeScript sebagai bahasa utama dan framework React Native untuk sisi aplikasi.
2. Sudah mendukung kontainerisasi menggunakan Docker (Dockerfile & docker-compose.yml) untuk mempermudah deployment backend.
3. Menggunakan basis data MySQL


CARA MENGGUNAKAN DOCKER

Langkah 1: Mengaktifkan Docker Desktop

1. Buka aplikasi Docker Desktop.
2. Tunggu beberapa saat sampai ikon paus di pojok kiri bawah berubah warna menjadi Hijau (artinya Docker sudah aktif dan siap digunakan).

Langkah 2: Membuka Project di Visual Studio Code

3. Buka aplikasi Visual Studio Code (VS Code).
4. Buka folder backend 
5. Buka terminal baru di VS Code kemudian pilih New Terminal

Langkah 3: Menyalakan Backend (Docker Up)

6. Di terminal VS Code, ketik perintah: docker-compose up lalu tekan Enter untuk menyalakan semua layanan (database dan server).
7. (Atau kamu juga bisa mengetik perintah: docker-compose up -d jika ingin menjalankannya di latar belakang agar terminal bisa tetap dipakai mengetik perintah lain).
8. Tunggu prosesnya sampai selesai. Jika sudah, backend kamu sekarang sudah aktif dan berjalan.

Langkah 4: Mematikan Backend (Docker Down)

9. Jika sudah selesai digunakan dan ingin mematikan backend agar menghemat RAM komputer, ketik perintah: docker-compose down di terminal VS Code lalu tekan Enter.
10. Aplikasi Docker akan berhenti dengan aman, dan kamu bisa menutup VS Code serta aplikasi Docker Desktop.
