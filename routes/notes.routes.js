import express from 'express';
import * as notesController from '../controllers/notes.controller.js';

const router = express.Router();

router.get('/notes', notesController.getNotes);

export default router;