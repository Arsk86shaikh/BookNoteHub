const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'user_auth',
    password: 'Arsk@1707',
    port: 5432,
});

module.exports = pool;
