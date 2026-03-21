/**
 * server/routes/analytics.ts
 * Updated with collection, revenue, and holder endpoints.
 */

import { Router } from 'express';
import {
  getAnalyticsData,
  getCollectionAnalytics,
  getRevenueAnalytics,
  getHolderAnalytics,
} from '../controllers/analyticsController.js';

const router = Router();

// On-chain analytics (by contract address)
router.get('/', getAnalyticsData);

// DB-backed analytics
router.get('/collection', getCollectionAnalytics);
router.get('/revenue', getRevenueAnalytics);
router.get('/holders', getHolderAnalytics);

export default router;
