import express from 'express';

const router = express.Router();

export default (books) => {
  // Render the form for adding books
  router.get('/', (req, res) => {
    res.render('addBooks');
  });

  // Handle form submission to add a new book
  router.post('/', (req, res) => {
    const { title, author, genre, description } = req.body;
    const newBook = { id: books.length + 1, title, author, genre, description };
    books.push(newBook);
    res.redirect('/books');
  });

  return router;
};
