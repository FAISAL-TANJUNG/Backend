import { Request, Response } from 'express';
import db from '../config/database';

export const addKamar = async (req: Request, res: Response) => {
    const { no_kamar, harga_sewa, status_kamar, fasilitas } = req.body;

    try {
        // Validasi wajib isi
        if (!no_kamar || no_kamar.trim() === '') {
            return res.status(400).json({
                status: 'error',
                message: 'Nomor kamar wajib diisi.'
            });
        }

        if (!harga_sewa || Number(harga_sewa) <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Harga sewa wajib diisi.'
            });
        }

        if (!status_kamar || status_kamar.trim() === '') {
            return res.status(400).json({
                status: 'error',
                message: 'Status kamar wajib dipilih.'
            });
        }

        if (!fasilitas || fasilitas.trim() === '') {
            return res.status(400).json({
                status: 'error',
                message: 'Minimal pilih satu fasilitas.'
            });
        }

        // Cek nomor kamar sudah ada
        const [cek]: any = await db.query(
            'SELECT id_kamar FROM tb_kamar WHERE UPPER(no_kamar)=UPPER(?)',
            [no_kamar]
        );

        if (cek.length > 0) {
            return res.status(409).json({
                status: 'error',
                message: `Nomor kamar ${no_kamar.toUpperCase()} sudah digunakan.`
            });
        }

        // Simpan data
        const [result] = await db.query(
            'INSERT INTO tb_kamar (no_kamar, harga_sewa, status_kamar, fasilitas) VALUES (?, ?, ?, ?)',
            [
                no_kamar.toUpperCase(),
                Number(harga_sewa),
                status_kamar,
                fasilitas
            ]
        );

        res.status(201).json({
            status: 'success',
            message: 'Data kamar berhasil ditambahkan.',
            data: {
                id_kamar: (result as any).insertId,
                no_kamar: no_kamar.toUpperCase()
            }
        });

    } catch (error: any) {
        console.error(error);

        // Jika ada UNIQUE INDEX pada no_kamar
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                status: 'error',
                message: 'Nomor kamar sudah digunakan.'
            });
        }

        res.status(500).json({
            status: 'error',
            message: 'Terjadi kesalahan pada server. Silakan coba lagi.'
        });
    }
};

// 2. LIHAT SEMUA KAMAR
export const getAllKamar = async (req: Request, res: Response) => {
    try {
        // SELECT hanya kolom yang ada di database sekarang
        const [rows]: any = await db.query('SELECT id_kamar, no_kamar, harga_sewa, status_kamar, fasilitas FROM tb_kamar');
        
        res.json({ 
            status: 'success', 
            data: rows 
        });
    } catch (error: any) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Gagal mengambil data kamar', 
            error: error.message 
        });
    }
};

// 3. EDIT KAMAR
export const updateKamar = async (req: Request, res: Response) => {
    const { id } = req.params; 
    const { no_kamar, harga_sewa, status_kamar, fasilitas } = req.body;
    
    try {
        // Cek apakah kamar ada
        const [existing]: any = await db.query('SELECT id_kamar FROM tb_kamar WHERE id_kamar = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Kamar tidak ditemukan' });
        }

        await db.query(
            'UPDATE tb_kamar SET no_kamar = ?, harga_sewa = ?, status_kamar = ?, fasilitas = ? WHERE id_kamar = ?',
            [no_kamar, Number(harga_sewa) || 0, status_kamar, fasilitas || '', id]
        );

        res.json({
            status: 'success',
            message: `Kamar dengan ID ${id} berhasil diperbarui`,
            data: { no_kamar }
        });
    } catch (error: any) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Gagal memperbarui kamar', 
            error: error.message 
        });
    }
};

// 4. UPDATE STATUS KAMAR SAJA
export const updateStatusKamar = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status_kamar } = req.body;

    try {
        await db.query(
            'UPDATE tb_kamar SET status_kamar = ? WHERE id_kamar = ?',
            [status_kamar, id]
        );

        res.json({
            status: 'success',
            message: `Status kamar ID ${id} berhasil diperbarui`
        });
    } catch (error: any) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Gagal memperbarui status', 
            error: error.message 
        });
    }
};

// 5. HAPUS KAMAR
export const deleteKamar = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        await db.query('DELETE FROM tb_kamar WHERE id_kamar = ?', [id]);
        res.json({
            status: 'success',
            message: `Kamar dengan ID ${id} berhasil dihapus`
        });
    } catch (error: any) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Gagal menghapus kamar', 
            error: error.message 
        });
    }
};