import express from 'express';

const router = express.Router();

export default (users) => {
  // Add a note for a book
  router.post('/', (req, res) => {
    const { user, bookId, note } = req.body;
    if (!users[user]) {
      users[user] = { readingList: [], notes: {} };
    }
    if (!users[user].notes[bookId]) {
      users[user].notes[bookId] = [];
    }
    users[user].notes[bookId].push(note);
    res.redirect(`/readingList?user=${user}`);
  });

  return router;
};
