// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
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
    dateOfBirth: { // NOVO CAMPO: Data de Nascimento
        type: Date,
        required: true
    },
    isPremium: {
        type: Boolean,
        default: false 
    },
    // Campos para recuperação de senha (ainda úteis para a lógica de reset)
    resetPasswordToken: String,
    resetPasswordExpires: Date, 
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// HASH: Aplica o hash na senha antes de salvar no DB
UserSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        const salt = await bcrypt.genSalt(10); 
        this.password = await bcrypt.hash(this.password, salt); 
    }
    next();
});

// Método para comparar a senha fornecida com o hash salvo
UserSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);