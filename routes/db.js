
import express from 'express';
import { connectDb, query, closeDb } from './db.js';
const app = express();
const port = 3000;

// Connect to the database
connectDb();

// Example route to fetch data from the database
app.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM your_table');
    res.json(result.rows); // Send the query results as JSON
  } catch (err) {
    res.status(500).send('Error fetching data');
  }
});

// Close the database connection when the server is shutting down
process.on('SIGINT', async () => {
  await closeDb();
  process.exit();
});



// Import the 'pg' module
import { Client } from 'pg';

// Database connection configuration
const dbConfig = {
  user: 'your_username',         // Replace with your PostgreSQL username
  host: 'localhost',             // Use your database host, usually 'localhost'
  database: 'your_database',     // Replace with your database name
  password: 'your_password',     // Replace with your PostgreSQL password
  port: 5432,                    // Default PostgreSQL port
};

// Create a new client instance
const client = new Client(dbConfig);

// Function to connect to the database
export const connectDb = async () => {
  try {
    await client.connect();
    console.log('Connected to the database successfully');
  } catch (err) {
    console.error('Error connecting to the database:', err);
    process.exit(1);
  }
};

// Function to query the database
export const query = async (text, params) => {
  try {
    const res = await client.query(text, params);
    return res;
  } catch (err) {
    console.error('Error executing query:', err);
    throw err;
  }
};

// Close the database connection
export const closeDb = async () => {
  try {
    await client.end();
    console.log('Database connection closed');
  } catch (err) {
    console.error('Error closing the database connection:', err);
  }
};
