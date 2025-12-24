import express from "express";
import booksController from "../controllers/books.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", booksController.getAllBooks);
router.get("/publish", authMiddleware, booksController.publishPage);
router.post("/publish", authMiddleware, booksController.addBook);

export default router;
