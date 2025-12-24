import express from 'express';
import * as booksController from '../controllers/books.controller.js';
import { requireAuth, isAuthenticated } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = express.Router();

router.get('/storebook', requireAuth, booksController.getStorebook);
router.post('/storebook/remove', requireAuth, booksController.removeBook);
router.get('/publish', isAuthenticated, booksController.getPublish);
router.post('/publish', requireAuth, upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'pdfFile', maxCount: 1 }
]), booksController.postPublish);
router.get('/books', booksController.searchBooks);

export default router;