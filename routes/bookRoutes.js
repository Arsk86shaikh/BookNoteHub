// ====================================
// FILE: routes/bookRoutes.js (or add to your existing routes file)
// ====================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Book = require('../models/Book'); // Your Book model
const User = require('../models/User'); // Your User model

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'coverImage') {
            cb(null, 'public/uploads/covers/');
        } else if (file.fieldname === 'pdfFile') {
            cb(null, 'public/uploads/pdfs/');
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: function (req, file, cb) {
        if (file.fieldname === 'coverImage') {
            const filetypes = /jpeg|jpg|png|webp/;
            const mimetype = filetypes.test(file.mimetype);
            const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
            
            if (mimetype && extname) {
                return cb(null, true);
            }
            cb(new Error('Only image files are allowed for cover!'));
        } else if (file.fieldname === 'pdfFile') {
            if (file.mimetype === 'application/pdf') {
                return cb(null, true);
            }
            cb(new Error('Only PDF files are allowed!'));
        }
    }
});

// Helper function to get default avatar based on username
function getDefaultAvatar(username) {
    const firstLetter = username.charAt(0).toLowerCase();
    if (firstLetter >= 'a' && firstLetter <= 'g') {
        return 'https://cdn-icons-png.flaticon.com/512/2921/2921826.png';
    } else if (firstLetter >= 'h' && firstLetter <= 'm') {
        return 'https://cdn-icons-png.flaticon.com/512/2921/2921837.png';
    } else if (firstLetter >= 'n' && firstLetter <= 't') {
        return 'https://cdn-icons-png.flaticon.com/512/2921/2921828.png';
    } else {
        return 'https://cdn-icons-png.flaticon.com/512/2921/2921840.png';
    }
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/signin');
}

// ====================================
// PUBLISH ROUTES
// ====================================

// GET /publish - Show publish form
router.get('/publish', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        res.render('publish', {
            user: user,
            title: 'Publish New Book',
            message: null,
            success: false
        });
    } catch (error) {
        console.error('Error loading publish page:', error);
        res.redirect('/');
    }
});

// POST /publish - Handle book publishing
router.post('/publish', isAuthenticated, upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'pdfFile', maxCount: 1 }
]), async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        
        // Validate required fields
        if (!req.body.title || !req.body.author || !req.body.description) {
            return res.render('publish', {
                user: user,
                title: 'Publish New Book',
                message: 'Please fill in all required fields',
                success: false
            });
        }

        // Check if files were uploaded
        if (!req.files.coverImage || !req.files.pdfFile) {
            return res.render('publish', {
                user: user,
                title: 'Publish New Book',
                message: 'Please upload both cover image and PDF file',
                success: false
            });
        }

        // Get user avatar
        const userAvatar = user.profile_image || getDefaultAvatar(user.username);

        // Create new book
        const newBook = new Book({
            title: req.body.title,
            author: req.body.author,
            description: req.body.description,
            coverImage: '/uploads/covers/' + req.files.coverImage[0].filename,
            pdfLink: '/uploads/pdfs/' + req.files.pdfFile[0].filename,
            publicationDate: req.body.publicationDate || new Date(),
            isPublic: req.body.isPublic === 'on', // Checkbox value
            publisher: user._id,
            publisherUsername: user.username,
            publisherAvatar: userAvatar,
            likes: [],
            comments: [],
            saves: [],
            views: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await newBook.save();

        res.render('publish', {
            user: user,
            title: 'Publish New Book',
            message: null,
            success: true
        });

    } catch (error) {
        console.error('Error publishing book:', error);
        const user = await User.findById(req.session.userId);
        res.render('publish', {
            user: user,
            title: 'Publish New Book',
            message: 'Error publishing book. Please try again.',
            success: false
        });
    }
});

// ====================================
// API ROUTES FOR BOOK INTERACTIONS
// ====================================

// POST /api/books/:bookId/like - Like/Unlike a book
router.post('/api/books/:bookId/like', isAuthenticated, async (req, res) => {
    try {
        const book = await Book.findById(req.params.bookId);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        const userId = req.session.userId;
        const user = await User.findById(userId);
        
        // Check if user already liked the book
        const likeIndex = book.likes.findIndex(like => like.userId.toString() === userId);
        
        if (likeIndex > -1) {
            // Unlike
            book.likes.splice(likeIndex, 1);
        } else {
            // Like
            book.likes.push({
                userId: userId,
                username: user.username,
                timestamp: new Date()
            });
        }
        
        await book.save();
        
        res.json({ 
            success: true,
            liked: likeIndex === -1,
            likesCount: book.likes.length 
        });
    } catch (error) {
        console.error('Error liking book:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/books/:bookId/save - Save/Unsave to reading list
router.post('/api/books/:bookId/save', isAuthenticated, async (req, res) => {
    try {
        const book = await Book.findById(req.params.bookId);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        const userId = req.session.userId;
        
        // Check if book is already saved
        const saveIndex = book.saves.findIndex(save => save.userId.toString() === userId);
        
        if (saveIndex > -1) {
            // Remove from saves
            book.saves.splice(saveIndex, 1);
            
            // Remove from user's reading list
            await User.findByIdAndUpdate(userId, {
                $pull: { readingList: book._id }
            });
        } else {
            // Add to saves
            book.saves.push({
                userId: userId,
                timestamp: new Date()
            });
            
            // Add to user's reading list
            await User.findByIdAndUpdate(userId, {
                $addToSet: { readingList: book._id }
            });
        }
        
        await book.save();
        
        res.json({ 
            success: true,
            saved: saveIndex === -1
        });
    } catch (error) {
        console.error('Error saving book:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/books/:bookId/comment - Add comment
router.post('/api/books/:bookId/comment', isAuthenticated, async (req, res) => {
    try {
        const book = await Book.findById(req.params.bookId);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        const userId = req.session.userId;
        const user = await User.findById(userId);
        const userAvatar = user.profile_image || getDefaultAvatar(user.username);
        
        const newComment = {
            userId: userId,
            username: user.username,
            userAvatar: userAvatar,
            text: req.body.comment,
            timestamp: new Date()
        };
        
        book.comments.push(newComment);
        await book.save();
        
        res.json({ 
            success: true,
            comment: newComment
        });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/books/public - Get all public books
router.get('/api/books/public', async (req, res) => {
    try {
        const publicBooks = await Book.find({ isPublic: true })
            .sort({ publicationDate: -1 })
            .limit(50);
        
        res.json({ success: true, books: publicBooks });
    } catch (error) {
        console.error('Error fetching public books:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ====================================
// STOREBOOK ROUTES (User's own books)
// ====================================

// GET /storebook - Show user's published books
router.get('/storebook', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const books = await Book.find({ publisher: user._id })
            .sort({ createdAt: -1 });
        
        res.render('storebook', {
            user: user,
            title: 'My Books',
            books: books,
            totalBooks: books.length,
            message: null
        });
    } catch (error) {
        console.error('Error loading storebook:', error);
        res.redirect('/');
    }
});

// POST /storebook/remove - Remove a book
router.post('/storebook/remove', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const bookTitle = req.body.title;
        
        // Find and delete the book
        await Book.findOneAndDelete({
            title: bookTitle,
            publisher: user._id
        });
        
        const remainingBooks = await Book.find({ publisher: user._id })
            .sort({ createdAt: -1 });
        
        res.render('storebook', {
            user: user,
            title: 'My Books',
            books: remainingBooks,
            totalBooks: remainingBooks.length,
            message: 'Book removed successfully'
        });
    } catch (error) {
        console.error('Error removing book:', error);
        res.redirect('/storebook');
    }
});

module.exports = router;