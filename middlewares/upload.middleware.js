import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath;
        if (file.fieldname === 'coverImage') {
            uploadPath = path.join(__dirname, '..', 'uploads', 'images');
        } else if (file.fieldname === 'pdfFile') {
            uploadPath = path.join(__dirname, '..', 'uploads', 'pdfs');
        }
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});

export const upload = multer({ storage });