const dotenv = require('dotenv');
const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20');
const bcrypt = require('bcrypt');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');
const canvas = require('canvas');
const { error } = require('console');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Load environment variables form .env file
dotenv.config();

// Express app setup
const app = express();
const PORT = process.env.PORT || 3000;

// https://emoji-api.com/emojis?access_key=${accessToken}
const accessToken = process.env.EMOJI_API_KEY;

// User environment variables for client ID and secret
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// Configure passport
passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, (token, tokenSecret, profile, done) => {
    return done(null, profile);
}));

//const REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
//const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Handlebars Helpers

    Handlebars helpers are custom functions that can be used within the templates 
    to perform specific tasks. They enhance the functionality of templates and 
    help simplify data manipulation directly within the view files.

    In this project, two helpers are provided:
    
    1. toLowerCase:
       - Converts a given string to lowercase.
       - Usage example: {{toLowerCase 'SAMPLE STRING'}} -> 'sample string'

    2. ifCond:
       - Compares two values for equality and returns a block of content based on 
         the comparison result.
       - Usage example: 
            {{#ifCond value1 value2}}
                <!-- Content if value1 equals value2 -->
            {{else}}
                <!-- Content if value1 does not equal value2 -->
            {{/ifCond}}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

// Set up Handlebars view engine with custom helpers
//
app.engine(
    'handlebars',
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
        },
    })
);

app.set('view engine', 'handlebars');
app.set('views', './views');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.use(
    session({
        secret: 'oneringtorulethemall',     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);

// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
// 
app.use((req, res, next) => {
    res.locals.appName = 'BirdWatch';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    next();
});

app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)


// Initialize the database connection
let db;

// Asynchronous function to connect to the SQLite database
async function initializeDB() {
    db = await sqlite.open({filename: 'your_database_file.db', driver: sqlite3.Database});

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            hashedGoogleId TEXT NOT NULL UNIQUE,
            avatar_url TEXT,
            memberSince DATETIME NOT NULL
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            username TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            likes INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS post_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            postId INTEGER NOT NULL,
            UNIQUE(userId, postId),
            FOREIGN KEY(userId) REFERENCES users(id),
            FOREIGN KEY(postId) REFERENCES posts(id)
        );
    `);
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Google login route
// Redirect to Google's OAuth 2.0 server
app.get('/auth/google', passport.authenticate('google', { scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'] }));

// Google callback route
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), async (req, res) => {
    try {
        //console.log('Google profile:', req.user); // Debugging: log the profile object

        const hashedGoogleId = req.user.id;
        const memberSince = new Date().toISOString();

        // Check if the user exists in the database
        const existingUser = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', [hashedGoogleId]);

        if (!existingUser) {
            // If the user does not exist, create a new user entry with only the Google ID
            const result = await db.run('INSERT INTO users (hashedGoogleId, memberSince) VALUES (?, ?)', [req.user.id, new Date().toISOString()]);
            
            // Store the new user's ID in the session
            req.session.userId = result.lastID;
            
            // Redirect to registerUsername to complete registration
            res.redirect('/registerUsername');
        } else {
            // User exists, save user info to session and redirect to home
            req.session.userId = existingUser.id;
            req.session.loggedIn = true;
            res.redirect('/');
        }
    } catch (err) {
        console.error('Error in Google callback:', err);
        res.redirect('/error');
    }
});

// User resgistration routes
app.get('/registerUsername', (req, res) => {
    res.render('registerUsername'); // Render the registerUsername.handlebars
});

app.post('/registerUsername', async (req, res) => {
    const { username } = req.body;

    if (!req.session.userId) {
        return res.redirect('/auth/google'); // Ensure user is authenticated
    }

    try {
        const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser) {
            // Username is taken, re-render with error
            return res.render('registerUsername', { error: 'Username is already taken.' });
        }

        // Update the user's username in the database
        await db.run('UPDATE users SET username = ? WHERE id = ?', [username, req.session.userId]);

        // Update the user object in the session
        const updatedUser = await db.get('SELECT * FROM users WHERE id = ?', [req.session.userId]);
        req.session.user = updatedUser;

        // Redirect to home page
        res.redirect('/');
    } catch (err) {
        console.error('Error registering username:', err);
        res.redirect('/error');
    }
});


// Google logout route
app.get('/googleLogout', (req, res) => {
    res.render('googleLogout'); // Render googleLogout.handlebars
});

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get('/', async (req, res) => {
    try {
        const sortOption = req.query.sort || 'recency';
        let posts;
        if (sortOption === 'likes') {
            // Retrieve all posts from the posts table, ordered by number of likes
            posts = await db.all('SELECT * FROM posts ORDER BY likes DESC, timestamp DESC');
        } else {
            // Retrieve all posts from the posts table, ordered by timestamp
            posts = await db.all('SELECT * FROM posts ORDER BY timestamp DESC');
        }
        // Retrieve the current user from the session
        const user = await getCurrentUser(req);
        // Render the home page with the posts and user data
        res.render('home', { posts, user, sortOption });
    } catch (err) {
        console.error('Error fetching posts:', err);
        res.render('error', {message: 'Failed to load posts.'});
    } 
});

// Register GET route is used for error response from registration
//
app.get('/register', (req, res) => {
    res.render('loginRegister', { regError: req.query.error });
});

// Login route GET route is used for error response from login
//
app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

// Error route: render error page
//
app.get('/error', (req, res) => {
    res.render('error', {message: 'Error'});
});

// Additional routes that you must implement


app.get('/post/:id', async (req, res) => {
    // Render post detail page
    const post = await db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (post) {
        res.render('postDetail', {post});
    } else {
        res.status(404).render('error', {message: 'Post not found'});
    }
});

app.post('/posts', async (req, res) => {
    // Add a new post and redirect to home
    const {title, content} = req.body;
    const user = await getCurrentUser(req);
    if (user) {
        try {
            await db.run('INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, ?)', [title, content, user.username, new Date().toISOString(), 0]);
            res.redirect('/');
        } catch (err) {
            console.error('Error creating post:', err);
            res.redirect('/error');
        }
    } else {
        res.redirect('/login');
    }
});

app.post('/like/:id', async (req, res) => {
    // Update post likes
    const postId = parseInt(req.params.id);
    const user = await getCurrentUser(req);
    if (user) {
        try {
            const userId = user.id;
            console.log(userId);
            
            // Check if user has already liked the post
            const alreadyLiked = await db.get('SELECT * FROM post_likes WHERE userId = ? AND postId = ?', [userId, postId]);
            console.log(alreadyLiked);

            if (alreadyLiked) {
                res.redirect('/'); // User already liked this post
            } else {
                // Update post's like count
                await db.run('UPDATE posts SET likes = likes + 1 WHERE id = ?', [postId]);
                
                // Add like entry
                await db.run('INSERT INTO post_likes (userId, postId) VALUES (?, ?)', [userId, postId]);
                
                res.redirect('/');
            }
        } catch (err) {
            console.error('Error liking post:', err);
            res.redirect('/error');
        }
    } else {
        res.redirect('/login');
    }
});

// Update /profile route to handle toggle between userPosts and likedPosts
app.get('/profile', isAuthenticated, async (req, res) => {
    // Render profile page
//    renderProfile(req, res);
    const user = await getCurrentUser(req);
    if (user) {
        try {
            const userPosts = await db.all('SELECT * FROM posts WHERE username = ?', [user.username]);
            const likedPosts = await getLikedPosts(user.id);
            res.render('profile', { user, posts: userPosts, likedPosts, showLiked: false});
        } catch (err) {
            console.error('Error fetching user posts:', err);
            res.redirect('/error');
        }
    } else {
        res.redirect('/login');
    }
});

// Route for liked posts
app.get('/profile/liked', isAuthenticated, async (req, res) => {
    const user = await getCurrentUser(req);
    if (user) {
        try {
            const userPosts = await db.all('SELECT * FROM posts WHERE username = ?', [user.username]);
            const likedPosts = await getLikedPosts(user.id);
            res.render('profile', { user, posts: userPosts, likedPosts, showLiked: true });
        } catch (err) {
            console.error('Error fetching liked posts:', err);
            res.redirect('/error');
        }
    } else {
        res.redirect('/login');
    }
});

app.get('/avatar/:username', async (req, res) => {
    // Serve the avatar image for the user
//    handleAvatar(req, res);
    const user = await db.get('SELECT * FROM users WHERE username = ?', [req.params.username]);
    if (user && user.avatar_url) {
        res.redirect(user.avatar_url);
    } else {
        // Make user avatar the first letter of their username
        const letter = req.params.username.charAt(0).toUpperCase();
        const img = generateAvatar(letter);
        res.type('png');
        res.send(img);
    }

});

app.post('/register', async (req, res) => {
    // Register a new user
//    registerUser(req, res);
    const {username, hashedGoogleId} = req.body;

    // Check if the username and hashedGoogleId are provided
    if (!username || !hashedGoogleId) {
        res.redirect('/register?error=Username and Google ID are required');
        return;
    }

    try {
        // Insert the new user into the users table
        await db.run('INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)', [username, hashedGoogleId, '', new Date().toISOString()]);
        // Retrieve the newly inserted user
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect('/');
    } catch (err) {
        console.error('Error registering user:', err);
        res.redirect('/register?error=Username already exists');
    }
});

app.post('/login', async (req, res) => {
    // Login a user
//    loginUser(req, res);
    const { username } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (user) {
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect('/');
    } else {
        res.redirect('/login?error=Invalid username');
    }
});

app.get('/logout', (req, res) => {
    // Logout the user
    logoutUser(req, res);
});

app.post('/delete/:id', isAuthenticated, async (req, res) => {
    // Delete a post if the current user is the owner
    const postId = parseInt(req.params.id);
    const user = await getCurrentUser(req);
    const post = await db.get('SELECT * FROM posts WHERE id = ? AND username = ?', [postId, user.username]);
    if (post) {
        await db.run('DELETE FROM posts WHERE id = ?', [postId]);
    }
//    deletePost(postId, req.session.userId);
    res.redirect('/');
});

// Load and serve the emoji.json file
app.get('/emojis', async (req, res) => {
    try {
        const response = await fetch('https://emoji-api.com/emojis?access_key=${accessToken}');
        const data = await response.json();
        res.json(data);
    // .then(response => {
    //     res.send(response);
    // });
    // .then(data => console.log(data))
    } catch (error) {
        console.error('Error fetching emojis:', error);
        res.status(500).json({ error: 'Failed to load emojis' });
    }
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Call the database initialization function before starting to listen for incoming requests
app.listen(PORT, async () => {
    await initializeDB();
    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Sample data of posts and users for testing

// Users object array
let users = [
    {
        id: 1,
        username: 'TravelGuru',
        avatar_url: undefined,
        memberSince: '2024-05-01 10:00'
    },
    {
        id: 2,
        username: 'FoodieFanatic',
        avatar_url: undefined,
        memberSince: '2024-05-01 11:30'
    },
    {
        id: 3,
        username: 'TechSage',
        avatar_url: undefined,
        memberSince: '2024-05-01 12:15'
    },
    {
        id: 4,
        username: 'EcoWarrior',
        avatar_url: undefined,
        memberSince: '2024-05-01 13:45'
    }
];

// Posts object array
let posts = [
    {
        id: 1,
        title: 'Exploring Hidden Gems in Europe',
        content: 'Just got back from an incredible trip through Europe. Visited some lesser-known spots that are truly breathtaking!',
        username: 'TravelGuru',
        timestamp: '2024-05-02 08:30',
        likes: 0
    },
    {
        id: 2,
        title: 'The Ultimate Guide to Homemade Pasta',
        content: 'Learned how to make pasta from scratch, and it’s easier than you think. Sharing my favorite recipes and tips.',
        username: 'FoodieFanatic',
        timestamp: '2024-05-02 09:45',
        likes: 0
    },
    {
        id: 3,
        title: 'Top 5 Gadgets to Watch Out for in 2024',
        content: 'Tech enthusiasts, here’s my list of the top 5 gadgets to look out for in 2024. Let me know your thoughts!',
        username: 'TechSage',
        timestamp: '2024-05-02 11:00',
        likes: 0
    },
    {
        id: 4,
        title: 'Sustainable Living: Easy Swaps You Can Make Today',
        content: 'Making the shift to sustainable living is simpler than it seems. Sharing some easy swaps to get you started.',
        username: 'EcoWarrior',
        timestamp: '2024-05-02 13:00',
        likes: 0
    }
];

// Function to find a user by username
function findUserByUsername(username) {
    // Return user object if found, otherwise return undefined
    return users.find(user => user.username === username);
}

// Function to find a user by user ID
function findUserById(userId) {
    // Return user object if found, otherwise return undefined
    return users.find(user => user.id === userId);
}

// Function to add a new user
function addUser(username) {
    // Create a new user object and add to users array
    const newUser = {
        id: users.length + 1,
        username,
        avatar_url: undefined,
        memberSince: new Date().toISOString()
    };
    users.push(newUser);
    return newUser;
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    console.log(req.session.userId);
    if (req.session.userId) {
        next(); // Continue if authenticated
    } else {
        res.redirect('/login'); // Redirect to login if not authenticated
    }
}

// Function to get liked posts
async function getLikedPosts(userId) {
    return await db.all(`
        SELECT posts.* FROM posts
        JOIN post_likes ON posts.id = post_likes.postId
        WHERE post_likes.userId = ?
        ORDER BY posts.timestamp DESC
    `, [userId]);
}

// Function to register a user
function registerUser(req, res) {
    // Register a new user and redirect appropriately
    const username = req.body.username;

    if (findUserByUsername(username)) {
        res.redirect('/register?error=Username already exists');
    } else {
        const newUser = addUser(username);
        req.session.userId = newUser.id;
        req.session.loggedIn = true;
        res.redirect('/');
    }
}

// Function to login a user
function loginUser(req, res) {
    // Login a user and redirect appropriately
    const username = req.body.username;
    const user = findUserByUsername(username);

    if (user) {
        // Successful login
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect('/');
    } else {
        // Invalid username
        res.redirect('/login?error=Invalid username');
    }
}

// Function to logout a user
function logoutUser(req, res) {
    // Destroy session and redirect appropriately
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            res.redirect('/error'); // Redirect to an error page
        }
        res.redirect('/login'); // Redirect to the home page after successful logout
    });
}

// Function to render the profile page
function renderProfile(req, res) {
    // Fetch user posts and render the profile page
    const user = getCurrentUser(req);
    if (user) {
        const userPosts = posts.filter(post => post.username === user.username);
        res.render('profile', { 
            user, 
            posts: userPosts
        });
    } else {
        res.redirect('/login');
    }
}

// Function to update post likes
// req = postId, res = req.session.userId
function updatePostLikes(postId, userId) {
    // Increment post likes if conditions are met
    const post = posts.find(p => p.id === postId);
    // Prevent users from liking their own post
    if (post && post.username !== findUserById(userId).username) {
        post.likes += 1;
    }
}

// Function to handle avatar generation and serving
function handleAvatar(req, res) {
    // Generate and serve the user's avatar image
    const {username} = req.params;
    const user = findUserByUsername(username);
    if (user && user.avatar_url) {
        res.redirect(user.avatar_url);
    } else {
        // Make user avatar the first letter of their username
        const letter = username.charAt(0).toUpperCase();
        const img = generateAvatar(letter);
        res.type('png');
        res.send(img);
    }
}

// Function to get the current user from session
async function getCurrentUser(req) {
    // Return the user object if the session user ID matches
//    return findUserById(req.session.userId);
    if (req.session.userId) {
        return await db.get('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    }
    return null;
}

// Function to get all posts, sorted by latest first
function getPosts() {
    return posts.slice().reverse();
}

// Function to add a new post
function addPost(title, content, user) {
    // Create a new post object and add to posts array
    const newPost = {
        id: posts.length + 1,
        title,
        content,
        username: user.username,
        timestamp: new Date().toISOString(),
        likes: 0,
    };
    posts.push(newPost);
}

function deletePost(postId, userId) {
    // Delete post if valid postId and the post belongs to the user
    const postIndex = posts.findIndex(p => p.id === postId);
    const user = findUserById(userId);
        
    if (postIndex !== -1 && posts[postIndex].username === user.username) {
        posts.splice(postIndex, 1);
    }
}

// Function to generate an image avatar
function generateAvatar(letter, width = 100, height = 100) {
    // Generate an avatar image with a letter
    // Steps:
    // 1. Choose a color scheme based on the letter
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#FF33B5'];
    const color = colors[letter.charCodeAt(0) % colors.length];

    // 2. Create a canvas with the specified width and height
    const canvasObj = canvas.createCanvas(width, height);
    const ctx = canvasObj.getContext('2d');

    // 3. Draw the background color
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);

    // 4. Draw the letter in the center
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${width / 2}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, width / 2, height / 2);

    // 5. Return the avatar as a PNG buffer
    return canvasObj.toBuffer();
}