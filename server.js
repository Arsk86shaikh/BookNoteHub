import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import multer from 'multer';

const app = express();
const PORT = process.env.PORT || 3000;

// Create __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERROR: Missing Supabase credentials!');
    console.error('Please ensure your .env file contains:');
    console.error('SUPABASE_URL=https://your-project.supabase.co');
    console.error('SUPABASE_ANON_KEY=your-anon-key');
    process.exit(1);
}

console.log('✅ Supabase URL loaded:', supabaseUrl);
console.log('✅ Supabase Key loaded: ***' + supabaseKey.slice(-10));

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================
// DATA INITIALIZATION
// ============================================================
const dataFilePath = path.join(__dirname, 'data.json');
let data = { 
    welcomeCards: [], 
    offerCards: [], 
    suggestions: [], 
    books: [], 
    featuredBooks: [] 
};

try {
    if (fs.existsSync(dataFilePath)) {
        const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
        data = JSON.parse(fileContent);
        console.log("✅ Data loaded from data.json");
    } else {
        console.warn('⚠️ data.json not found. Using defaults.');
    }
} catch (err) {
    console.error('❌ Error loading data.json:', err.message);
}

// ============================================================
// MIDDLEWARE CONFIGURATION
// ============================================================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/download/', express.static(path.join(__dirname, 'uploads/images')));

// Session configuration
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'your_secret_key_change_in_production',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24, // 24 hours
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        }
    })
);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
console.log("✅ Views directory:", path.join(__dirname, "views"));

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        console.log('🔒 Unauthorized access attempt');
        return res.redirect('/signin');
    }
    next();
};

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    console.log('🔒 Authentication required');
    res.redirect('/signin');
};

// ============================================================
// MULTER FILE UPLOAD CONFIGURATION
// ============================================================
const storage = multer.memoryStorage(); // Use memory storage for direct upload to Supabase

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'coverImage') {
            if (!file.mimetype.startsWith('image/')) {
                return cb(new Error('Only image files allowed for cover'));
            }
        }
        if (file.fieldname === 'pdfFile') {
            if (file.mimetype !== 'application/pdf') {
                return cb(new Error('Only PDF files allowed'));
            }
        }
        cb(null, true);
    }
});

// ============================================================
// PUBLIC ROUTES
// ============================================================

// Home page
app.get('/', (req, res) => {
    const user = req.session?.user || null;
    res.render('index', { books: [], data, user });
});

// Signup page
app.get('/signup', (req, res) => {
    res.render('signup', { message: req.query.message || '' });
});

// Signin page
app.get('/signin', (req, res) => {
    res.render('signin', { message: req.query.message || '' });
});

// Logout
app.get('/logout', (req, res) => {
    const username = req.session.user?.username;
    req.session.destroy((err) => {
        if (err) {
            console.error('❌ Logout error:', err);
            return res.status(500).send('Error logging out');
        }
        console.log(`👋 User logged out: ${username}`);
        res.redirect('/');
    });
});

// ============================================================
// AUTHENTICATION ROUTES
// ============================================================

// Handle signup
app.post('/signup', async (req, res) => {
    const { username, password, confirmPassword } = req.body;
    console.log('📝 Signup attempt:', { username, password: password ? '***' : 'missing', confirmPassword: confirmPassword ? '***' : 'missing' });

    try {
        // Validation
        if (!username || !password || !confirmPassword) {
            console.log('❌ Validation failed: Missing fields');
            return res.render('signup', { message: 'Please fill in all fields.' });
        }

        if (password !== confirmPassword) {
            console.log('❌ Validation failed: Passwords do not match');
            return res.render('signup', { message: 'Passwords do not match.' });
        }

        if (password.length < 6) {
            console.log('❌ Validation failed: Password too short');
            return res.render('signup', { message: 'Password must be at least 6 characters.' });
        }

        console.log('✅ Validation passed');

        // Check if username exists
        console.log('🔍 Checking if username exists...');
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();

        if (checkError) {
            console.error('❌ Error checking username:', checkError);
            if (checkError.code !== 'PGRST116') {
                throw checkError;
            }
        }

        if (existingUser) {
            console.log('❌ Username already exists');
            return res.render('signup', { message: 'Username already exists.' });
        }

        console.log('✅ Username available');

        // Hash password
        console.log('🔒 Hashing password...');
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('✅ Password hashed successfully');

        // Create user
        console.log('💾 Attempting to insert user into database...');
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{ 
                username: username.trim(), 
                password: hashedPassword 
            }])
            .select()
            .single();

        if (insertError) {
            console.error('❌ Insert error:', insertError);
            console.error('❌ Insert error details:', JSON.stringify(insertError, null, 2));
            throw insertError;
        }

        if (!newUser) {
            console.error('❌ No user data returned after insert');
            throw new Error('Failed to create user - no data returned');
        }

        console.log('✅ User created successfully:', newUser);
        req.session.user = { id: newUser.id, username: newUser.username };
        
        console.log('✅ Redirecting to signin page...');
        return res.redirect('/signin?message=Account created! Please sign in.');

    } catch (error) {
        console.error('❌ Signup error:', error);
        console.error('❌ Error stack:', error.stack);
        return res.render('signup', { message: 'Error creating account. Please try again.' });
    }
});

// Handle signin
app.post('/signin', async (req, res) => {
    const { username, password } = req.body;
    console.log('🔐 Signin attempt:', { username });

    try {
        if (!username || !password) {
            return res.render('signin', { message: 'Please enter both fields.' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, password')
            .eq('username', username)
            .maybeSingle();

        if (error) throw error;

        if (!user) {
            return res.render('signin', { message: 'Invalid credentials.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.render('signin', { message: 'Invalid credentials.' });
        }

        req.session.user = { id: user.id, username: user.username };
        console.log('✅ User signed in:', username);
        res.redirect('/');

    } catch (error) {
        console.error('❌ Signin error:', error);
        res.render('signin', { message: 'Error signing in. Please try again.' });
    }
});

// ============================================================
// BOOK MANAGEMENT ROUTES
// ============================================================

// View user's books
app.get('/storebook', requireAuth, async (req, res) => {
    const user = req.session.user;

    try {
        const { data: booksData, error: booksError } = await supabase
            .from('books')
            .select('id, title, author, description, cover_image, publication_date, pdf_file')
            .eq('user_id', user.id);

        if (booksError) throw booksError;

        const { count, error: countError } = await supabase
            .from('books')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        if (countError) throw countError;

        const books = booksData.map(book => ({
            ...book,
            coverImage: book.cover_image || '/uploads/images/default-cover.jpg',
            pdfLink: book.pdf_file || null,
        }));

        res.render('storebook', { user, message: null, books, totalBooks: count || 0 });
    } catch (error) {
        console.error('❌ Error fetching books:', error);
        res.render('storebook', {
            user,
            message: 'Failed to load books.',
            books: [],
            totalBooks: 0,
        });
    }
});

// Remove book
app.post('/storebook/remove', requireAuth, async (req, res) => {
    const { title } = req.body;
    const user = req.session.user;

    try {
        const { error } = await supabase
            .from('books')
            .delete()
            .eq('user_id', user.id)
            .eq('title', title);

        if (error) throw error;

        console.log(`🗑️ Book removed: ${title}`);
        res.redirect('/storebook');
    } catch (error) {
        console.error('❌ Error removing book:', error);
        res.status(500).send('Failed to remove book.');
    }
});

// Publish book page
app.get('/publish', isAuthenticated, (req, res) => {
    const user = req.session.user;
    const success = req.query.success;
    res.render('publish', { message: null, success, user });
});

// Handle book publishing with Supabase Storage
app.post('/publish', requireAuth, upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'pdfFile', maxCount: 1 }
]), async (req, res) => {
    const { title, author, description, publicationDate } = req.body;

    if (!title || !author || !description || !publicationDate) {
        return res.render('publish', {
            user: req.session.user,
            message: 'All fields are required.',
        });
    }

    if (!req.files?.coverImage || !req.files?.pdfFile) {
        return res.render('publish', {
            user: req.session.user,
            message: 'Please upload both cover image and PDF file.',
        });
    }

    try {
        const userId = req.session.user.id;
        const timestamp = Date.now();

        // Upload cover image to Supabase Storage
        console.log('📤 Uploading cover image...');
        const coverImageFile = req.files.coverImage[0];
        const coverImagePath = `${userId}/${timestamp}-${coverImageFile.originalname}`;
        
        const { data: coverData, error: coverError } = await supabase.storage
            .from('book-covers')
            .upload(coverImagePath, coverImageFile.buffer || fs.readFileSync(coverImageFile.path), {
                contentType: coverImageFile.mimetype,
                upsert: false
            });

        if (coverError) {
            console.error('❌ Cover upload error:', coverError);
            throw coverError;
        }

        // Get public URL for cover image
        const { data: coverUrlData } = supabase.storage
            .from('book-covers')
            .getPublicUrl(coverImagePath);
        
        const coverImageUrl = coverUrlData.publicUrl;
        console.log('✅ Cover uploaded:', coverImageUrl);

        // Upload PDF to Supabase Storage
        console.log('📤 Uploading PDF...');
        const pdfFile = req.files.pdfFile[0];
        const pdfPath = `${userId}/${timestamp}-${pdfFile.originalname}`;
        
        const { data: pdfData, error: pdfError } = await supabase.storage
            .from('book-pdfs')
            .upload(pdfPath, pdfFile.buffer || fs.readFileSync(pdfFile.path), {
                contentType: pdfFile.mimetype,
                upsert: false
            });

        if (pdfError) {
            console.error('❌ PDF upload error:', pdfError);
            // Cleanup: delete the cover image if PDF fails
            await supabase.storage.from('book-covers').remove([coverImagePath]);
            throw pdfError;
        }

        // Get public URL for PDF
        const { data: pdfUrlData } = supabase.storage
            .from('book-pdfs')
            .getPublicUrl(pdfPath);
        
        const pdfFileUrl = pdfUrlData.publicUrl;
        console.log('✅ PDF uploaded:', pdfFileUrl);

        // Insert book record into database
        const { error: dbError } = await supabase
            .from('books')
            .insert([{
                title,
                author,
                description,
                publication_date: publicationDate,
                cover_image: coverImageUrl,
                pdf_file: pdfFileUrl,
                user_id: userId
            }]);

        if (dbError) {
            // Cleanup: delete uploaded files if database insert fails
            await supabase.storage.from('book-covers').remove([coverImagePath]);
            await supabase.storage.from('book-pdfs').remove([pdfPath]);
            throw dbError;
        }

        // Delete local files after successful upload
        if (coverImageFile.path) fs.unlinkSync(coverImageFile.path);
        if (pdfFile.path) fs.unlinkSync(pdfFile.path);

        console.log('📚 Book published successfully:', title);
        res.redirect('/publish?success=true');

    } catch (error) {
        console.error('❌ Error publishing book:', error);
        res.status(500).render('publish', {
            user: req.session.user,
            message: 'Failed to publish book: ' + error.message,
        });
    }
});

// ============================================================
// READING LIST ROUTES
// ============================================================

// View reading list
app.get('/readingList', requireAuth, async (req, res) => {
    const user = req.session.user;

    try {
        const { data: booksData, error } = await supabase
            .from('read_list')
            .select('book_id, title, author, coverimage, publishdate, description, pdflink')
            .eq('user_id', user.id);

        if (error) throw error;

        const books = booksData.map(book => ({
            book_id: book.book_id,
            title: book.title,
            author: book.author,
            coverImage: book.coverimage,
            publishDate: book.publishdate,
            description: book.description,
            pdfLink: book.pdflink
        }));

        res.render('readingList', { books, user });
    } catch (err) {
        console.error('❌ Error fetching reading list:', err);
        res.status(500).send('Failed to fetch reading list');
    }
});

// Add to reading list
app.post('/readingList', requireAuth, async (req, res) => {
    let { bookId, title, author, coverImage, publishDate, description, pdfLink } = req.body;

    try {
        if (!publishDate || publishDate.trim() === '') {
            publishDate = null;
        }

        const { error } = await supabase
            .from('read_list')
            .insert([{
                user_id: req.session.user.id,
                book_id: bookId || null,
                title: title || null,
                author: author || null,
                coverimage: coverImage || null,
                publishdate: publishDate,
                description: description || null,
                pdflink: pdfLink || null
            }]);

        if (error) throw error;

        console.log('➕ Book added to reading list:', title);
        res.redirect('/readingList');
    } catch (err) {
        console.error('❌ Error adding book:', err);
        res.status(500).send('Failed to add book.');
    }
});

// Remove from reading list
app.post('/removeFromReadingList', requireAuth, async (req, res) => {
    const { title } = req.body;

    try {
        const { error } = await supabase
            .from('read_list')
            .delete()
            .eq('user_id', req.session.user.id)
            .eq('title', title);

        if (error) throw error;

        console.log('➖ Book removed from reading list:', title);
        res.redirect('/readingList');
    } catch (err) {
        console.error('❌ Error removing book:', err);
        res.status(500).send('Failed to remove book.');
    }
});

// ============================================================
// BOOK SEARCH ROUTES
// ============================================================

// Search books from Open Library API
app.get('/books', async (req, res) => {
    const { title } = req.query;
    const user = req.session?.user || null;

    try {
        const searchResponse = await axios.get('https://openlibrary.org/search.json', {
            params: { title },
        });

        const books = searchResponse.data.docs.map((book) => ({
            id: book.key,
            title: book.title,
            author: book.author_name ? book.author_name[0] : 'Unknown',
            genre: 'Not Available',
            description: book.first_publish_year ? `First Published: ${book.first_publish_year}` : 'No description',
            coverImage: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : '/default-cover.jpg',
            pdfLink: book.has_fulltext ? `https://openlibrary.org${book.key}/fulltext` : null,
        }));

        const randomResponse = await axios.get('https://openlibrary.org/search.json', {
            params: { title: 'A' },
        });

        const randomBooks = randomResponse.data.docs.slice(0, 100).map((book) => ({
            id: book.key,
            title: book.title,
            author: book.author_name ? book.author_name[0] : 'Unknown',
            genre: 'Not Available',
            description: book.first_publish_year ? `First Published: ${book.first_publish_year}` : 'No description',
            coverImage: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : '/default-cover.jpg',
            pdfLink: book.has_fulltext ? `https://openlibrary.org${book.key}/fulltext` : null,
        }));

        res.render('books', { books, randomBooks, data, user, title });
    } catch (error) {
        console.error('❌ Error fetching books:', error);
        res.status(500).send('Error fetching books');
    }
});

// ============================================================
// ERROR HANDLERS
// ============================================================

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).send('Something went wrong!');
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
});