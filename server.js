import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import axios from 'axios';
import pkg from 'pg';
const { Pool } = pkg;
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3000;
// Create __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files for images and PDFs
app.use('/download/', express.static(path.join(__dirname, 'uploads/images')));
// Serve static files from the uploads directory
// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));




// In-memory storage (optional, if you want to use this)
let books = [];
let userNotes = {};

// Load data from data.json (optional, if you want to use this)
const dataFilePath = path.join(path.resolve(), 'data.json');
let data = { welcomeCards: [], offerCards: [], suggestions: [], books: [],featuredBooks:[] };

try {
    if (fs.existsSync(dataFilePath)) {
        const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
        data = JSON.parse(fileContent);
        console.log("Data loaded successfully from data.json");
    } else {
        console.warn('data.json file not found. Using default structure.');
    }
} catch (err) {
    console.error('Error loading data.json:', err);
}

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(
    session({
        secret: 'your_secret_key',
        resave: false,
        saveUninitialized: false,
    })
);

app.set('view engine', 'ejs');
app.set('views', './views');

// Database connection
const pool = new Pool({
    user: 'postgres',  // Replace with your PostgreSQL username
    host: 'localhost',
    database: 'user_auth',  // Replace with your database name
    password: 'Arsk@1707',  // Replace with your PostgreSQL password
    port: 5432,
});

// Function to query the database
const query = (text, params) => pool.query(text, params);

// Routes
app.get('/', (req, res) => {
    const user = req.session?.user || null;
    res.render('index', { books, data, user });
});
// Middleware for Checking Authentication
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/signin'); // Redirect to signin if not authenticated
    }
    next(); // Proceed to the next middleware or route
};

// Route to render the publish book form

// Route for fetching and displaying all books in the store for a specific user
app.get('/storebook', requireAuth, async (req, res) => {
    const user = req.session.user;

    if (!user || !user.id) {
        return res.redirect('/signin'); // Redirect to login if user is not authenticated
    }

    const userId = user.id;

    try {
        const booksQuery = `
            SELECT id, title, author, description, 
                   cover_image AS "coverImage", 
                   publication_date AS "publicationDate", 
                   pdf_file AS "pdfLink"
            FROM books
            WHERE user_id = $1`;
        const countQuery = 'SELECT COUNT(*) AS total FROM books WHERE user_id = $1';
    
        const [booksResult, countResult] = await Promise.all([
            pool.query(booksQuery, [userId]),
            pool.query(countQuery, [userId]),
        ]);
    
        console.log('Books Query Result:', booksResult.rows);
    
        const books = booksResult.rows.map(book => {
            console.log('Raw Book Record:', book);
            return {
                ...book,
                coverImage: book.coverImage ? `${book.coverImage}` : '/uploads/images/default-cover.jpg',
                pdfLink: book.pdfLink ? `${book.pdfLink}` : null,
            };
        });
    
        console.log('Processed Books:', books);
    
        const totalBooks = parseInt(countResult.rows[0].total, 10);
    
        res.render('storebook', { user, message: null, books, totalBooks });
    } catch (error) {
        console.error('Error fetching books:', error);
        res.render('storebook', {
            user,
            message: 'Failed to load books. Please try again later.',
            books: [],
            totalBooks: 0,
        });
    }
    
});

// Route to handle removing a book
app.post('/storebook/remove', requireAuth, async (req, res) => {
    const { title } = req.body;
    const user = req.session.user;

    if (!user || !user.id) {
        return res.redirect('/signin'); // Redirect to login if user is not authenticated
    }

    try {
        await pool.query(
            'DELETE FROM books WHERE user_id = $1 AND title = $2',
            [user.id, title]
        );
        console.log(`Removed book with title: ${title} for user ID: ${user.id}`);
        res.redirect('/storebook');
    } catch (error) {
        console.error('Error removing book:', error);
        res.status(500).send('Failed to remove book.');
    }
});



// Middleware to check if the user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next(); // User is authenticated, proceed to the next middleware
    }
    res.redirect('/signin'); // Redirect to login page if not authenticated
}

// Route to render the publish book form
app.get('/publish', isAuthenticated, (req, res) => {
    const user = req.session.user; // Retrieve the user object from the session
    const success = req.query.success; // Extract the success query parameter
    res.render('publish', { message: null, success, user }); // Pass user to the template
});




import multer from 'multer';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath;
        if (file.fieldname === 'coverImage') {
            uploadPath = path.join(__dirname, 'uploads', 'images');
        } else if (file.fieldname === 'pdfFile') {
            uploadPath = path.join(__dirname, 'uploads', 'pdfs');
        }

        fs.mkdirSync(uploadPath, { recursive: true }); // Ensure directory exists
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});
const upload = multer({ storage });

// Handle publishing a new book
app.post(
    '/publish',
    requireAuth,
    upload.fields([
        { name: 'coverImage', maxCount: 1 },
        { name: 'pdfFile', maxCount: 1 },
    ]),
    async (req, res) => {
        const { title, author, description, publicationDate } = req.body;
        const coverImage = req.files.coverImage ? `/uploads/images/${req.files.coverImage[0].filename}` : null;
        const pdfFile = req.files.pdfFile ? `/uploads/pdfs/${req.files.pdfFile[0].filename}` : null;

        if (!title || !author || !description || !publicationDate || !coverImage || !pdfFile) {
            return res.render('publish', {
                user: req.session.user,
                message: 'All fields are required, including file uploads.',
            });
        }

        try {
            await pool.query(
                'INSERT INTO books (title, author, description, publication_date, cover_image, pdf_file, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [title, author, description, publicationDate, coverImage, pdfFile, req.session.user.id]
            );
            res.redirect('/publish?success=true');
        } catch (error) {
            console.error('Error publishing book:', error);
            res.status(500).render('publish', {
                user: req.session.user,
                message: 'Failed to publish the book. Please try again.',
            });
        }
    }
);







// Fetch reading list
app.get('/readingList', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const user = req.session.user; // This will give the user object from the session.

    try {
        const result = await pool.query(
            `SELECT rl.book_id, rl.title, rl.author, rl.coverImage, rl.publishDate, rl.description, rl.pdfLink
            FROM read_list rl
            WHERE rl.user_id = $1`, [userId]
        );

        const books = result.rows;
        // console.log(books);
        res.render('readingList', { books, user });
    } catch (err) {
        // console.error('Error fetching reading list:', err);
        res.status(500).send('Failed to fetch reading list');
    }
});


// Add book to reading list
app.post('/readingList', requireAuth, async (req, res) => {
    let { bookId, title, author, coverImage, publishDate, description, pdfLink } = req.body;

    console.log('Received data from client:', {
        bookId, title, author, coverImage, publishDate, description, pdfLink
    });

    try {
        // Validate and sanitize publishDate
        if (!publishDate || publishDate.trim() === '') {
            publishDate = null; // Set to NULL if publishDate is empty
        }

        // Check if user ID exists
        const userId = req.session.user?.id;
        if (!userId) {
            return res.status(400).send('User is not logged in or session expired.');
        }

        // Insert data into the database
        await pool.query(
            `INSERT INTO read_list (user_id, book_id, title, author, coverimage, publishdate, description, pdflink) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                userId, // User ID from session
                bookId || null, // Handle empty strings as null
                title || null,
                author || null,
                coverImage || null,
                publishDate, // NULL if empty
                description || null,
                pdfLink || null
            ]
        );

        console.log('Book successfully added to the database.');
        res.redirect('/readingList');
    } catch (err) {
        console.error('Error adding book to reading list:', err);
        res.status(500).send('Failed to add book to reading list.');
    }
});





app.post('/removeFromReadingList', requireAuth, async (req, res) => {
    const { title } = req.body;

    try {
        await pool.query(
            'DELETE FROM read_list WHERE user_id = $1 AND title = $2',  // Corrected placeholder to $2
            [req.session.user.id, title]  // Pass correct parameters here
        );
        console.log(req.session.user.id, title); 
        res.redirect('/readingList');
    } catch (err) {
        console.error('Error removing book:', err);
        res.status(500).send('Failed to remove book.');
    }
});







// Route to render the signup page
app.get('/signup', (req, res) => {
    res.render('signup', { message: req.query.message || '' });
});

// Route to render the signin page
app.get('/signin', (req, res) => {
    res.render('signin', { message: req.query.message || '' });
});

// Route to handle user signup
app.post('/signup', async (req, res) => {
    const { username, password, confirmPassword } = req.body;

    try {
        // Validate inputs
        if (!username || !password || !confirmPassword) {
            return res.render('signup', { message: 'Please enter all required fields.' });
        }
        if (password !== confirmPassword) {
            return res.render('signup', { message: 'Passwords do not match.' });
        }

        const result = await query('SELECT id FROM users WHERE username = $1', [username]);

        if (result.rows.length > 0) {
            return res.render('signup', { message: 'Username already exists. Please choose another one.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertResult = await query('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id', [username, hashedPassword]);

        req.session.user = { id: insertResult.rows[0].id, username };

        res.redirect('/signin');
    } catch (error) {
        console.error('Error signing up:', error.message);
        res.render('signup', { message: 'Error signing up. Please try again.' });
    }
});

// Route to handle user signin
app.post('/signin', async (req, res) => {
    const { username, password } = req.body;

    try {
        if (!username || !password) {
            return res.render('signin', { message: 'Please enter both username and password.' });
        }

        const result = await query('SELECT id, username, password FROM users WHERE username = $1', [username]);

        if (result.rows.length === 0) {
            return res.render('signin', { message: 'Invalid username or password.' });
        }

        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.render('signin', { message: 'Invalid username or password.' });
        }

        req.session.user = { id: user.id, username: user.username };

        res.redirect('/');
    } catch (error) {
        console.error('Error signing in:', error.message);
        res.render('signin', { message: 'Error logging in. Please try again.' });
    }
});

// Route to fetch books from Open Library API
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
            description: book.first_publish_year ? `First Published: ${book.first_publish_year}` : 'No description available',
            coverImage: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : '/default-cover.jpg',
            pdfLink: book.has_fulltext ? `https://openlibrary.org${book.key}/fulltext` : null,
        }));

        const randomResponse = await axios.get('https://openlibrary.org/search.json', {
            params: { title: 'A' },
        });

        const randomBooks = randomResponse.data.docs.map((book) => ({
            id: book.key,
            title: book.title,
            author: book.author_name ? book.author_name[0] : 'Unknown',
            genre: 'Not Available',
            description: book.first_publish_year ? `First Published: ${book.first_publish_year}` : 'No description available',
            coverImage: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : '/default-cover.jpg',
            pdfLink: book.has_fulltext ? `https://openlibrary.org${book.key}/fulltext` : null,
        })).slice(0, 100);

        res.render('books', {
            books,
            randomBooks,
            data,
            user,
            title,
        });
    } catch (error) {
        // console.error('Error fetching books:', error);
        res.status(500).send('Error fetching books');
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Error logging out');
        }
        res.redirect('/');  // Redirect to sign-in after logout
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
