import express from 'express';
import * as readingListController from '../controllers/readingList.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/readingList', requireAuth, readingListController.getReadingList);
router.post('/readingList', requireAuth, readingListController.addToReadingList);
router.post('/removeFromReadingList', requireAuth, readingListController.removeFromReadingList);

export default router;