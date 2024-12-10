import express from 'express';

const router = express.Router();

export default (users, books) => {
  // Get the user's reading list
  router.get('/', (req, res) => {
    const user = req.query.user || 'guest';
    const readingList = users[user] ? users[user].readingList : [];
    res.render('readingList', { readingList, user });
  });

  // Add a book to the user's reading list
  router.post('/', (req, res) => {
    const { user, bookId } = req.body;
    const book = books.find(b => b.id === parseInt(bookId));
    if (book) {
      if (!users[user]) {
        users[user] = { readingList: [], notes: {} };
      }
      users[user].readingList.push(book);
    }
    res.redirect(`/readingList?user=${user}`);
  });

  return router;
};
