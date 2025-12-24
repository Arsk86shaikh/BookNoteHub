export const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/signin');
    }
    next();
};

export const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/signin');
};