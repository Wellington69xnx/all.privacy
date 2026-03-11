// models/Actress.js
const mongoose = require('mongoose');

// Função para gerar um slug a partir do nome
const slugify = (text) => {
    return text
        .toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
};

const actressSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true, // Garante que não haverá nomes repetidos
    },
    slug: {
        type: String,
        unique: true,
    },
    description: {
        type: String,
        default: '',
    },
    profilePhotoUrl: {
        type: String,
        default: '/img/default-profile.jpg',
    },
    coverPhotoUrl: {
        type: String,
        default: '/img/default-cover.jpg',
    },
    // NOVO CAMPO: Referência ao Conteúdo (vídeos/fotos)
    content: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Content' 
    }]
}, { timestamps: true });

// Middleware para gerar o slug antes de salvar (Criação)
actressSchema.pre('save', function(next) {
    if (this.isNew || this.isModified('name')) {
        this.slug = slugify(this.name);
    }
    next();
});

// Middleware para gerar o slug antes de atualizar (Edição com findOneAndUpdate)
actressSchema.pre('findOneAndUpdate', function(next) {
    const update = this.getUpdate();
    if (update.name) {
        update.slug = slugify(update.name);
        this.setUpdate(update);
    }
    next();
});

const Actress = mongoose.model('Actress', actressSchema);
module.exports = Actress;