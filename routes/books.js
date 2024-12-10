const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === "coverImage") {
            cb(null, 'uploads/images');
        } else if (file.fieldname === "pdfFile") {
            cb(null, 'uploads/pdfs');
        }
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });

// GET route to render the form
router.get('/new', (req, res) => {
    res.render('newBook');
});

// POST route to handle form submission
router.post('/', upload.fields([{ name: 'coverImage' }, { name: 'pdfFile' }]), (req, res) => {
    const { title, author, description, publicationDate } = req.body;
    const coverImage = req.files.coverImage ? req.files.coverImage[0].path : null;
    const pdfFile = req.files.pdfFile ? req.files.pdfFile[0].path : null;

    if (!coverImage || !pdfFile) {
        return res.status(400).send('All fields are required, including file uploads.');
    }

    const newBook = {
        title,
        author,
        description,
        publicationDate,
        coverImage,
        pdfFile
    };

    // Simulate saving to a database
    console.log('New Book:', newBook);

    res.send('Book published successfully!');
});

module.exports = router;
