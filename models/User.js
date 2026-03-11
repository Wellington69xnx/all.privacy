// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3
    },
    email: {
        type: String,
        required: true,
        unique: true, 
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    dateOfBirth: { 
        type: Date,
        required: true
    },
    isPremium: {
        type: Boolean,
        default: false 
    },
    profilePhotoUrl: { 
        type: String,
        default: null 
    },
    
    // Arrays para armazenar os favoritos do usuário
    favoriteActresses: [{
        type: Schema.Types.ObjectId,
        ref: 'Actress'
    }],
    favoriteContents: [{
        type: Schema.Types.ObjectId,
        ref: 'Content'
    }],

    resetPasswordToken: String,
    resetPasswordExpires: Date, 
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

UserSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        const salt = await bcrypt.genSalt(10); 
        this.password = await bcrypt.hash(this.password, salt); 
    }
    next();
});

UserSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);