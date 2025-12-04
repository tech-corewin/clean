const express = require('express');
const bodyParser = require('body-parser');
const mariadb = require('mariadb');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = 3000;

// MariaDB connection pool
const pool = mariadb.createPool({
    host: 'localhost',
    user: 'corewin',
    password: 'zaqXSW32!',
    database: 'status_inquiry',
    connectionLimit: 5,
});

// SSL options
const sslOptions = {
    key: fs.readFileSync('/etc/ssl/self-signed/self-signed.key'),
    cert: fs.readFileSync('/etc/ssl/self-signed/self-signed.crt'),
};

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'supersecretkey', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use('/audio', express.static(__dirname + '/audio'));

// Passport Local Strategy
passport.use(new LocalStrategy(async (username, password, done) => {
    try {
        const conn = await pool.getConnection();
        const [user] = await conn.query('SELECT * FROM users WHERE username = ?', [username]);
        conn.release();

        if (!user) return done(null, false, { message: 'Incorrect username' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return done(null, false, { message: 'Incorrect password' });

        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const conn = await pool.getConnection();
        const [user] = await conn.query('SELECT * FROM users WHERE id = ?', [id]);
        conn.release();
        done(null, user);
    } catch (err) {
        done(err);
    }
});

// Routes
let status = 'free';
let inquiries = [];

// Serve queue page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Serve login page
// Serve login page
app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login</title>
            <style>
                body {
                    font-family: 'Arial', sans-serif;
                    background-color: #ffffff;
                    color: #000000;
                    margin: 0;
                    padding: 20px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                }
                .login-container {
                    background-color: #ffffff;
                    border: 1px solid #e0e0e0;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    width: 100%;
                    max-width: 400px;
                }
                h1 {
                    text-align: center;
                    margin-bottom: 20px;
                    color: #000000;
                }
                label {
                    display: block;
                    margin-bottom: 8px;
                    font-size: 1rem;
                    font-weight: bold;
                }
                input {
                    width: 100%;
                    padding: 10px;
                    margin-bottom: 20px;
                    font-size: 1rem;
                    border: 1px solid #cccccc;
                    border-radius: 4px;
                }
                button {
                    width: 100%;
                    padding: 10px;
                    background-color: #FFA500;
                    color: #ffffff;
                    border: none;
                    border-radius: 4px;
                    font-size: 1rem;
                    font-weight: bold;
                    cursor: pointer;
                }
                button:hover {
                    background-color: #FF8C00;
                }
                .center-link {
                    text-align: center;
                    margin-top: 10px;
                }
                .center-link a {
                    color: #FFA500;
                    text-decoration: none;
                    font-weight: bold;
                }
                .center-link a:hover {
                    color: #FF8C00;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <h1>Login</h1>
                <form method="POST" action="/login">
                    <label for="username">Username:</label>
                    <input type="text" id="username" name="username" placeholder="Enter your username" required>
                    
                    <label for="password">Password:</label>
                    <input type="password" id="password" name="password" placeholder="Enter your password" required>
                    
                    <button type="submit">Login</button>
                </form>
                <div class="center-link">
                    <a href="/">Back to Queue</a>
                </div>
            </div>
        </body>
        </html>
    `);
});


// Handle login POST requests
app.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
}));

// Serve toggle page
app.get('/toggle', (req, res) => {
    if (req.isAuthenticated()) {
        res.sendFile(__dirname + '/toggle.html');
    } else {
        res.redirect('/login');
    }
});

// API for inquiries
app.post('/inquiries', (req, res) => {
    const { inquiry } = req.body;
    if (inquiry && inquiry.trim() !== '') {
        inquiries.push({ id: inquiries.length + 1, text: inquiry, isActive: false });
        res.status(201).json({ message: 'Inquiry added successfully' });
    } else {
        res.status(400).json({ message: 'Inquiry text is required' });
    }
});

app.get('/inquiries', (req, res) => {
    res.json(inquiries);
});

// API for status toggle
app.put('/status/toggle', (req, res) => {
    if (req.isAuthenticated()) {
        const previousStatus = status;
        status = status === 'free' ? 'busy' : 'free';

        let message = `Status updated to: ${status}`;
        if (previousStatus === 'busy' && status === 'free' && inquiries.length > 0) {
            const removedInquiry = inquiries.shift(); // Remove the oldest inquiry
            message += `. First Inquiry Removed: ${removedInquiry.text}`;
        }

        res.status(200).json({ status, message });
    } else {
        res.status(403).json({ message: 'Unauthorized' });
    }
});

// API for status
app.get('/status', (req, res) => {
    res.json({ status });
});

// Start HTTPS server
https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`HTTPS Server running on https://127.0.0.1:${PORT}`);
});
