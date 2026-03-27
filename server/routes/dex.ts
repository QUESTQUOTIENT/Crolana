import { Router } from 'express';
import { getQuote, getPairInfo, getTokenInfo } from '../controllers/dexController.js';

const router = Router();

router.get('/quote', getQuote);
router.get('/pair', getPairInfo);
router.get('/token', getTokenInfo);

export default router;
