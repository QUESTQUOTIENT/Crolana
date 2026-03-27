import { Router } from 'express';
import {
  generateTokenContract,
  compileTokenContract,
  saveTokenDeployment,
  getTokenTemplatesHandler,
  validateTokenHandler,
  generateTokenV2,
} from '../controllers/tokenController.js';

const router = Router();

router.post('/generate',      generateTokenContract);
router.post('/generate-v2',   generateTokenV2);
router.post('/compile',       compileTokenContract);
router.post('/save-deployment', saveTokenDeployment);
router.get('/templates',      getTokenTemplatesHandler);
router.post('/validate',      validateTokenHandler);

export default router;
