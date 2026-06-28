import { Request, Response, Router } from 'express';
import db from '../../config/database'; 
const router = Router();

router.post('/api/auth/update-token', async (req: Request, res: Response) => {
  const { id, role, device_token } = req.body;

  try {
    if (role === 'Penghuni') {
      await db.query(
        'UPDATE tb_penghuni SET device_token = ? WHERE id_penghuni = ?',
        [device_token, id]
      );
    } else {
      await db.query(
        'UPDATE tb_user SET device_token = ? WHERE id_user = ?',
        [device_token, id]
      );
    }
    
    return res.json({ status: 'success', message: 'Token updated' });
  } catch (error: any) {
    console.error("Update Token Error:", error);
    return res.status(500).json({ 
      status: 'error', 
      message: error.message || 'Internal Server Error' 
    });
  }
});

export default router;