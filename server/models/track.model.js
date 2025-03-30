const mongoose = require('mongoose');

const trackSchema = new mongoose.Schema({
    title: { type: String, required: true },
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String },
    filePath: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected', 'copyright'], 
        default: 'pending' 
    },
    approvalNotes: { type: String },
    uploadDate: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now }
});

// Update lastUpdated timestamp before saving
trackSchema.pre('save', function(next) {
    this.lastUpdated = Date.now();
    next();
});

module.exports = mongoose.model('Track', trackSchema);