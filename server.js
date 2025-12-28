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
    process.exit(1);
}

console.log('✅ Supabase URL loaded:', supabaseUrl);
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

app.use(
    session({
        secret: process.env.SESSION_SECRET || 'your_secret_key_change_in_production',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        }
    })
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/signin');
    }
    next();
};

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/signin');
};

// ============================================================
// MULTER FILE UPLOAD CONFIGURATION
// ============================================================
const storage = multer.memoryStorage();

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
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
// HELPER FUNCTION
// ============================================================
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

// ============================================================
// PUBLIC ROUTES
// ============================================================

// Home page - FIXED WITH PUBLIC BOOKS
app.get('/', async (req, res) => {
    try {
        const user = req.session?.user || null;
        
        // Fetch public books from Supabase
        const { data: publicBooksData, error } = await supabase
            .from('books')
            .select('*, users!books_user_id_fkey(username, profile_image)')
            .eq('is_public', true)
            .order('publication_date', { ascending: false })
            .limit(20);

        if (error) {
            console.error('❌ Error fetching public books:', error);
        }

        // Transform the data to match the expected format
        const publicBooks = (publicBooksData || []).map(book => ({
            _id: book.id,
            title: book.title,
            author: book.author,
            description: book.description,
            coverImage: book.cover_image,
            pdfLink: book.pdf_file,
            publicationDate: book.publication_date,
            isPublic: book.is_public,
            publisher: book.user_id,
            publisherUsername: book.users?.username || 'Unknown',
            publisherAvatar: book.users?.profile_image || getDefaultAvatar(book.users?.username || 'User'),
            likes: book.likes || [],
            comments: book.comments || [],
            saves: book.saves || [],
            views: book.views || 0
        }));

        console.log(`✅ Loaded ${publicBooks.length} public books`);

        res.render('index', { 
            books: [], 
            data, 
            user,
            publicBooks: publicBooks
        });
    } catch (error) {
        console.error('❌ Error in home route:', error);
        res.render('index', { 
            books: [], 
            data, 
            user: null,
            publicBooks: []
        });
    }
});

// Middleware to load full user data
const loadUserData = async (req, res, next) => {
    if (req.session.user) {
        try {
            const { data: userData, error } = await supabase
                .from('users')
                .select('id, username, profile_image, email, bio, created_at')
                .eq('id', req.session.user.id)
                .single();

            if (userData && !error) {
                req.session.user = userData;
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }
    next();
};

app.use(loadUserData);

// Profile routes
app.get('/profile', requireAuth, async (req, res) => {
    const user = req.session.user;
    
    try {
        const { count: totalBooks } = await supabase
            .from('books')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        const { count: readingListCount } = await supabase
            .from('read_list')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        res.render('profile', {
            user: userData,
            totalBooks: totalBooks || 0,
            readingListCount: readingListCount || 0,
            message: null
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.render('profile', {
            user,
            totalBooks: 0,
            readingListCount: 0,
            message: { type: 'error', text: 'Failed to load profile data' }
        });
    }
});

app.post('/profile/update', requireAuth, async (req, res) => {
    const { username, email, bio } = req.body;
    const userId = req.session.user.id;

    try {
        const { data, error } = await supabase
            .from('users')
            .update({ username, email, bio })
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;

        req.session.user.username = username;
        res.redirect('/profile?message=Profile updated successfully');
    } catch (error) {
        console.error('Error updating profile:', error);
        res.redirect('/profile?error=Failed to update profile');
    }
});

app.post('/profile/upload-avatar', requireAuth, upload.single('avatar'), async (req, res) => {
    try {
        const userId = req.session.user.id;
        const file = req.file;

        if (!file) {
            return res.json({ success: false, message: 'No file uploaded' });
        }

        const fileName = `avatar-${userId}-${Date.now()}.${file.mimetype.split('/')[1]}`;

        const { data, error } = await supabase.storage
            .from('avatars')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: true,
                cacheControl: '3600'
            });

        if (error) throw error;

        const { data: urlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);

        const publicUrl = urlData.publicUrl;

        const { error: updateError } = await supabase
            .from('users')
            .update({ profile_image: publicUrl })
            .eq('id', userId);

        if (updateError) throw updateError;

        req.session.user.profile_image = publicUrl;
        req.session.save();

        res.json({ success: true, url: publicUrl });

    } catch (error) {
        console.error('❌ Error uploading avatar:', error);
        res.json({ 
            success: false, 
            message: error.message || 'Failed to upload avatar'
        });
    }
});

// Auth routes
app.get('/signup', (req, res) => {
    res.render('signup', { message: req.query.message || '' });
});

app.get('/signin', (req, res) => {
    res.render('signin', { message: req.query.message || '' });
});

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

app.post('/signup', async (req, res) => {
    const { username, password, confirmPassword } = req.body;

    try {
        if (!username || !password || !confirmPassword) {
            return res.render('signup', { message: 'Please fill in all fields.' });
        }

        if (password !== confirmPassword) {
            return res.render('signup', { message: 'Passwords do not match.' });
        }

        if (password.length < 6) {
            return res.render('signup', { message: 'Password must be at least 6 characters.' });
        }

        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();

        if (existingUser) {
            return res.render('signup', { message: 'Username already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{ 
                username: username.trim(), 
                password: hashedPassword 
            }])
            .select()
            .single();

        if (insertError) throw insertError;

        return res.redirect('/signin?message=Account created! Please sign in.');

    } catch (error) {
        console.error('❌ Signup error:', error);
        return res.render('signup', { message: 'Error creating account. Please try again.' });
    }
});

app.post('/signin', async (req, res) => {
    const { username, password } = req.body;

    try {
        if (!username || !password) {
            return res.render('signin', { message: 'Please enter both fields.' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, password, profile_image')
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

        req.session.user = { 
            id: user.id, 
            username: user.username,
            profile_image: user.profile_image
        };
        res.redirect('/');

    } catch (error) {
        console.error('❌ Signin error:', error);
        res.render('signin', { message: 'Error signing in. Please try again.' });
    }
});

// ============================================================
// BOOK MANAGEMENT ROUTES
// ============================================================

app.get('/storebook', requireAuth, async (req, res) => {
    const user = req.session.user;

    try {
        const { data: booksData, error: booksError } = await supabase
            .from('books')
            .select('id, title, author, description, cover_image, publication_date, pdf_file, is_public')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (booksError) throw booksError;

        const books = booksData.map(book => ({
            ...book,
            coverImage: book.cover_image || '/uploads/images/default-cover.jpg',
            pdfLink: book.pdf_file || null,
        }));

        res.render('storebook', { 
            user, 
            message: null, 
            books, 
            totalBooks: books.length 
        });
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

app.get('/publish', isAuthenticated, (req, res) => {
    const user = req.session.user;
    const success = req.query.success;
    res.render('publish', { message: null, success, user });
});

// UPDATED PUBLISH ROUTE WITH is_public FIELD
app.post('/publish', requireAuth, upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'pdfFile', maxCount: 1 }
]), async (req, res) => {
    const { title, author, description, publicationDate, isPublic } = req.body;

    if (!title || !author || !description || !publicationDate) {
        return res.render('publish', {
            user: req.session.user,
            message: 'All fields are required.',
            success: false
        });
    }

    if (!req.files?.coverImage || !req.files?.pdfFile) {
        return res.render('publish', {
            user: req.session.user,
            message: 'Please upload both cover image and PDF file.',
            success: false
        });
    }

    try {
        const userId = req.session.user.id;
        const timestamp = Date.now();

        // Get user data for publisher info
        const { data: userData } = await supabase
            .from('users')
            .select('username, profile_image')
            .eq('id', userId)
            .single();

        // Upload cover image
        const coverImageFile = req.files.coverImage[0];
        const coverImagePath = `${userId}/${timestamp}-${coverImageFile.originalname}`;
        
        const { error: coverError } = await supabase.storage
            .from('book-covers')
            .upload(coverImagePath, coverImageFile.buffer, {
                contentType: coverImageFile.mimetype,
                upsert: false
            });

        if (coverError) throw coverError;

        const { data: coverUrlData } = supabase.storage
            .from('book-covers')
            .getPublicUrl(coverImagePath);
        
        const coverImageUrl = coverUrlData.publicUrl;

        // Upload PDF
        const pdfFile = req.files.pdfFile[0];
        const pdfPath = `${userId}/${timestamp}-${pdfFile.originalname}`;
        
        const { error: pdfError } = await supabase.storage
            .from('book-pdfs')
            .upload(pdfPath, pdfFile.buffer, {
                contentType: pdfFile.mimetype,
                upsert: false
            });

        if (pdfError) {
            await supabase.storage.from('book-covers').remove([coverImagePath]);
            throw pdfError;
        }

        const { data: pdfUrlData } = supabase.storage
            .from('book-pdfs')
            .getPublicUrl(pdfPath);
        
        const pdfFileUrl = pdfUrlData.publicUrl;

        // Insert book with is_public field
        const { error: dbError } = await supabase
            .from('books')
            .insert([{
                title,
                author,
                description,
                publication_date: publicationDate,
                cover_image: coverImageUrl,
                pdf_file: pdfFileUrl,
                user_id: userId,
                is_public: isPublic === 'on', // Convert checkbox to boolean
                likes: [],
                comments: [],
                saves: [],
                views: 0
            }]);

        if (dbError) {
            await supabase.storage.from('book-covers').remove([coverImagePath]);
            await supabase.storage.from('book-pdfs').remove([pdfPath]);
            throw dbError;
        }

        console.log(`📚 Book published: ${title} (Public: ${isPublic === 'on'})`);
        res.redirect('/publish?success=true');

    } catch (error) {
        console.error('❌ Error publishing book:', error);
        res.status(500).render('publish', {
            user: req.session.user,
            message: 'Failed to publish book: ' + error.message,
            success: false
        });
    }
});

// ============================================================
// API ROUTES FOR BOOK INTERACTIONS
// ============================================================

// Like a book
app.post('/api/books/:bookId/like', requireAuth, async (req, res) => {
    try {
        const bookId = req.params.bookId;
        const userId = req.session.user.id;
        const username = req.session.user.username;

        const { data: book, error } = await supabase
            .from('books')
            .select('likes')
            .eq('id', bookId)
            .single();

        if (error) throw error;

        let likes = book.likes || [];
        const likeIndex = likes.findIndex(like => like.userId === userId);

        if (likeIndex > -1) {
            likes.splice(likeIndex, 1);
        } else {
            likes.push({
                userId: userId,
                username: username,
                timestamp: new Date().toISOString()
            });
        }

        const { error: updateError } = await supabase
            .from('books')
            .update({ likes: likes })
            .eq('id', bookId);

        if (updateError) throw updateError;

        res.json({ 
            success: true,
            liked: likeIndex === -1,
            likesCount: likes.length 
        });
    } catch (error) {
        console.error('❌ Error liking book:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Save to reading list
app.post('/api/books/:bookId/save', requireAuth, async (req, res) => {
    try {
        const bookId = req.params.bookId;
        const userId = req.session.user.id;

        const { data: book, error } = await supabase
            .from('books')
            .select('saves, title, author, cover_image, description, pdf_file, publication_date')
            .eq('id', bookId)
            .single();

        if (error) throw error;

        let saves = book.saves || [];
        const saveIndex = saves.findIndex(save => save.userId === userId);

        if (saveIndex > -1) {
            // Remove from saves
            saves.splice(saveIndex, 1);
            
            // Remove from reading list
            await supabase
                .from('read_list')
                .delete()
                .eq('user_id', userId)
                .eq('book_id', bookId);
        } else {
            // Add to saves
            saves.push({
                userId: userId,
                timestamp: new Date().toISOString()
            });
            
            // Add to reading list
            await supabase
                .from('read_list')
                .insert([{
                    user_id: userId,
                    book_id: bookId,
                    title: book.title,
                    author: book.author,
                    coverimage: book.cover_image,
                    publishdate: book.publication_date,
                    description: book.description,
                    pdflink: book.pdf_file
                }]);
        }

        const { error: updateError } = await supabase
            .from('books')
            .update({ saves: saves })
            .eq('id', bookId);

        if (updateError) throw updateError;

        res.json({ 
            success: true,
            saved: saveIndex === -1
        });
    } catch (error) {
        console.error('❌ Error saving book:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add comment
app.post('/api/books/:bookId/comment', requireAuth, async (req, res) => {
    try {
        const bookId = req.params.bookId;
        const userId = req.session.user.id;
        const { comment } = req.body;

        const { data: user } = await supabase
            .from('users')
            .select('username, profile_image')
            .eq('id', userId)
            .single();

        const { data: book, error } = await supabase
            .from('books')
            .select('comments')
            .eq('id', bookId)
            .single();

        if (error) throw error;

        let comments = book.comments || [];
        
        const newComment = {
            userId: userId,
            username: user.username,
            userAvatar: user.profile_image || getDefaultAvatar(user.username),
            text: comment,
            timestamp: new Date().toISOString()
        };

        comments.push(newComment);

        const { error: updateError } = await supabase
            .from('books')
            .update({ comments: comments })
            .eq('id', bookId);

        if (updateError) throw updateError;

        res.json({ 
            success: true,
            comment: newComment
        });
    } catch (error) {
        console.error('❌ Error adding comment:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================
// READING LIST ROUTES
// ============================================================

// GET reading list
app.get('/readingList', requireAuth, async (req, res) => {
    const user = req.session.user;

    try {
        const { data: booksData, error } = await supabase
            .from('read_list')
            .select('book_id, title, author, coverimage, publishdate, description, pdflink')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

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

// POST - Add to reading list
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

        console.log('✅ Book added to reading list:', title);
        res.redirect('/readingList');
    } catch (err) {
        console.error('❌ Error adding book:', err);
        res.status(500).send('Failed to add book.');
    }
});

// POST - Remove from reading list (using book_id in URL parameter)
app.post('/removeFromReadingList/:bookId/:userId', requireAuth, async (req, res) => {
    const bookId = req.params.bookId;
    const userId = req.params.userId;
    const sessionUserId = req.session.user.id;

    // Security check: ensure the user can only delete their own books
    if (userId !== sessionUserId) {
        console.log('❌ Unauthorized attempt to delete book');
        return res.status(403).send('Unauthorized: You can only remove books from your own reading list.');
    }

    const { error } = await supabase
        .from('read_list')
        .delete()
        .eq('user_id', userId)
        .eq('book_id', bookId);

    if (error) throw error;

    console.log('✅ Book removed from reading list. Book ID:', bookId, 'User ID:', userId);
    res.redirect('/readingList');
});

// POST - Remove from reading list by title (when book_id is null)
app.post('/removeFromReadingListByTitle', requireAuth, async (req, res) => {
    const { title, userId } = req.body;
    const sessionUserId = req.session.user.id;

    try {
        // Security check: ensure the user can only delete their own books
        if (userId !== sessionUserId) {
            console.log('❌ Unauthorized attempt to delete book');
            return res.status(403).send('Unauthorized: You can only remove books from your own reading list.');
        }

        const { error } = await supabase
            .from('read_list')
            .delete()
            .eq('user_id', userId)
            .eq('title', title)
            .is('book_id', null);

        if (error) throw error;

        console.log('✅ Book removed from reading list by title:', title, 'User ID:', userId);
        res.redirect('/readingList');
    } catch (err) {
        console.error('❌ Error removing book by title:', err);
        res.status(500).send('Failed to remove book from reading list.');
    }
});
// Book search
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

app.get('/privacy', (req, res) => {
    const user = req.session?.user || null;
    res.render('privacy', { user: user });
});

// Error handlers
app.use((req, res) => {
    res.status(404).send('Page not found');
});

app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).send('Something went wrong!');
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
});