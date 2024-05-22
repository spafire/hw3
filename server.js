const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const canvas = require('canvas');
const { error } = require('console');
const emoji = require('emoji.json')

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const app = express();
const PORT = 3000;

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
    res.locals.appName = 'MicroBlog';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    next();
});

app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get('/', (req, res) => {
    const posts = getPosts();
    const user = getCurrentUser(req) || {};
    res.render('home', { posts, user });
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
    res.render('error');
});

// Additional routes that you must implement


app.get('/post/:id', (req, res) => {
    // Render post detail page
    const post = posts.find(p => p.id === parseInt(req.params.id));
    if (post) {
        res.render('postDetail', {post});
    } else {
        res.status(404).render('error', {message: 'Post not found'});
    }
});

app.post('/posts', (req, res) => {
    // Add a new post and redirect to home
    const {title, content} = req.body;
    const user = getCurrentUser(req);
    if (user) {
        addPost(title, content, user);
        res.redirect('/');
    } else {
        res.redirect('/login');
    }
});

app.post('/like/:id', (req, res) => {
    // Update post likes
    const postId = parseInt(req.params.id);
    updatePostLikes(postId, req.session.userId);
    res.redirect('/');
});

app.get('/profile', isAuthenticated, (req, res) => {
    // Render profile page
    renderProfile(req, res);
});

app.get('/avatar/:username', (req, res) => {
    // Serve the avatar image for the user
    handleAvatar(req, res);
});

app.post('/register', (req, res) => {
    // Register a new user
    registerUser(req, res);
});

app.post('/login', (req, res) => {
    // Login a user
    loginUser(req, res);
});

app.get('/logout', (req, res) => {
    // Logout the user
    logoutUser(req, res);
});

app.post('/delete/:id', isAuthenticated, (req, res) => {
    // Delete a post if the current user is the owner
    const postId = parseInt(req.params.id);
    deletePost(postId, req.session.userId);
    res.redirect('/');
});

// Load and serve the emoji.json file
app.get('/emojis', (req, res) => {
    const emojisPath = path.join(__dirname, emoji);
    fs.readFile(emojisPath, 'utf8', (err, data) => {
        if (err) { // With callback
            console.error('Error reading emojis file:', err);
            res.status(500).json({ error: 'Failed to load emojis.' });
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.send(data);
        }
    });
 
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, () => {
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
function getCurrentUser(req) {
    // Return the user object if the session user ID matches
    return findUserById(req.session.userId);
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