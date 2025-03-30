const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const MongoDBStore = require('connect-mongodb-session')(session);
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Import models and middleware
const User = require('./server/models/user.model');
const Track = require('./server/models/track.model');
const { isAuthenticated, isApprovedArtist, isAdmin } = require('./server/middleware/auth');

const app = express();
const store = new MongoDBStore({
  uri: 'mongodb://localhost/kdm',
  collection: 'sessions'
});

// Configure file upload storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
  secret: 'kdm-secret-key',
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: { 
    maxAge: 3600000, // 1 hour
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Connect to MongoDB
mongoose.connect('mongodb://localhost/kdm', { 
  useNewUrlParser: true, 
  useUnifiedTopology: true
})
.then(() => {
  console.log('Connected to MongoDB');
  // Create admin user if doesn't exist
  User.findOne({ role: 'admin' }).then(admin => {
    if (!admin) {
      const adminUser = new User({
        username: 'admin',
        email: 'admin@kdm.network',
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        approvalStatus: 'approved'
      });
      adminUser.save();
    }
  });
})
.catch(err => console.log(err));

// Serve static files
app.use(express.static(path.join(__dirname, 'client/public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// View routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/views/landing.html'));
});

app.get('/user/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/views/user-login.html'));
});

app.get('/user/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/views/user-signup.html'));
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/views/admin-login.html'));
});

// API Routes

// Auth routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Create new user
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: 'artist',
      approvalStatus: 'pending'
    });

    await newUser.save();
    res.json({ success: true, message: 'Signup request submitted. Please wait for admin approval.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error during signup' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is approved (unless admin)
    if (user.role === 'artist' && user.approvalStatus !== 'approved') {
      return res.status(403).json({ error: 'Your account is pending approval' });
    }

    // Set session
    req.session.user = {
      _id: user._id,
      username: user.username,
      role: user.role
    };

    res.json({ 
      success: true, 
      redirect: user.role === 'admin' ? '/admin/dashboard' : '/artist/dashboard' 
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Track routes
app.post('/api/tracks', isAuthenticated, isApprovedArtist, upload.single('track'), async (req, res) => {
  try {
    const { title, description } = req.body;
    const newTrack = new Track({
      title,
      artist: req.session.user._id,
      description,
      filePath: req.file.path
    });

    await newTrack.save();
    res.json({ success: true, track: newTrack });
  } catch (error) {
    res.status(500).json({ error: 'Error uploading track' });
  }
});

app.get('/api/tracks', isAuthenticated, isApprovedArtist, async (req, res) => {
  try {
    const tracks = await Track.find({ artist: req.session.user._id });
    res.json(tracks);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching tracks' });
  }
});

// Admin routes
app.get('/api/admin/pending-users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const users = await User.find({ approvalStatus: 'pending' });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching pending users' });
  }
});

app.put('/api/admin/users/:id/approve', isAuthenticated, isAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { approvalStatus: 'approved' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error approving user' });
  }
});

app.get('/api/admin/pending-tracks', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const tracks = await Track.find({ status: 'pending' }).populate('artist', 'username');
    res.json(tracks);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching pending tracks' });
  }
});

app.put('/api/admin/tracks/:id/approve', isAuthenticated, isAdmin, async (req, res) => {
  try {
    await Track.findByIdAndUpdate(req.params.id, { status: 'approved' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error approving track' });
  }
});

app.put('/api/admin/tracks/:id/reject', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { notes } = req.body;
    await Track.findByIdAndUpdate(req.params.id, { 
      status: 'rejected',
      approvalNotes: notes
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error rejecting track' });
  }
});

// Dashboard routes
app.get('/artist/dashboard', isAuthenticated, isApprovedArtist, (req, res) => {
  res.sendFile(path.join(__dirname, 'client/views/artist-dashboard.html'));
});

app.get('/admin/dashboard', isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'client/views/admin-dashboard.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
