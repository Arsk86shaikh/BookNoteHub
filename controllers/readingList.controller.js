import axios from 'axios';
import { supabase } from '../config/supabase.js';

export const getStorebook = async (req, res) => {
    const user = req.session.user;
    if (!user || !user.id) {
        return res.redirect('/signin');
    }

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
        console.error('Error fetching books:', error);
        res.render('storebook', {
            user,
            message: 'Failed to load books.',
            books: [],
            totalBooks: 0,
        });
    }
};

export const removeBook = async (req, res) => {
    const { title } = req.body;
    const user = req.session.user;

    try {
        const { error } = await supabase
            .from('books')
            .delete()
            .eq('user_id', user.id)
            .eq('title', title);

        if (error) throw error;

        res.redirect('/storebook');
    } catch (error) {
        console.error('Error removing book:', error);
        res.status(500).send('Failed to remove book.');
    }
};

export const getPublish = (req, res) => {
    const user = req.session.user;
    const success = req.query.success;
    res.render('publish', { message: null, success, user });
};

export const postPublish = async (req, res) => {
    const { title, author, description, publicationDate } = req.body;
    const coverImage = req.files.coverImage ? `/uploads/images/${req.files.coverImage[0].filename}` : null;
    const pdfFile = req.files.pdfFile ? `/uploads/pdfs/${req.files.pdfFile[0].filename}` : null;

    if (!title || !author || !description || !publicationDate || !coverImage || !pdfFile) {
        return res.render('publish', {
            user: req.session.user,
            message: 'All fields are required.',
        });
    }

    try {
        const { error } = await supabase
            .from('books')
            .insert([{
                title,
                author,
                description,
                publication_date: publicationDate,
                cover_image: coverImage,
                pdf_file: pdfFile,
                user_id: req.session.user.id
            }]);

        if (error) throw error;

        res.redirect('/publish?success=true');
    } catch (error) {
        console.error('Error publishing book:', error);
        res.status(500).render('publish', {
            user: req.session.user,
            message: 'Failed to publish the book.',
        });
    }
};

export const searchBooks = async (req, res) => {
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

        const randomBooks = randomResponse.data.docs.map((book) => ({
            id: book.key,
            title: book.title,
            author: book.author_name ? book.author_name[0] : 'Unknown',
            genre: 'Not Available',
            description: book.first_publish_year ? `First Published: ${book.first_publish_year}` : 'No description',
            coverImage: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : '/default-cover.jpg',
            pdfLink: book.has_fulltext ? `https://openlibrary.org${book.key}/fulltext` : null,
        })).slice(0, 100);

        res.render('books', { books, randomBooks, data: req.app.locals.data, user, title });
    } catch (error) {
        console.error('Error fetching books:', error);
        res.status(500).send('Error fetching books');
    }
};