const User = require('../models/user.model');

// Check if user is authenticated
exports.isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized - Please login' });
    }
    next();
};

// Check if user is an approved artist
exports.isApprovedArtist = async (req, res, next) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user || user.approvalStatus !== 'approved') {
            return res.status(403).json({ error: 'Account not approved yet' });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Check if user is admin
exports.isAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Check if user is admin or the track owner
exports.isAdminOrOwner = async (req, res, next) => {
    try {
        const user = await User.findById(req.session.user._id);
        const track = await Track.findById(req.params.id);
        
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        if (user.role === 'admin') return next();
        if (track.artist.equals(user._id)) return next();
        
        res.status(403).json({ error: 'Not authorized for this action' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};