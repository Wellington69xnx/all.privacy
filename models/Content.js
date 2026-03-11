// models/Content.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const contentSchema = new Schema({
    // Referência à atriz dona do conteúdo
    actress: {
        type: Schema.Types.ObjectId,
        ref: 'Actress',
        required: true
    },
    // Nome que será exibido no perfil da atriz
    title: {
        type: String,
        required: true,
        trim: true
    },
    // Tipo: 'url' para link externo, 'upload' para arquivo local
    contentType: {
        type: String,
        enum: ['url', 'upload'],
        required: true
    },
    // Nível de Acesso: 'preview' (público) ou 'private' (exclusivo)
    accessLevel: {
        type: String,
        enum: ['preview', 'private'],
        default: 'preview' 
    },
    // Onde o arquivo está: URL externa ou caminho interno
    urlPath: {
        type: String,
        required: true
    },
    // NOVO CAMPO: Caminho da miniatura (para uploads de vídeo/imagem)
    thumbnailPath: {
        type: String,
        default: null
    }
}, { timestamps: true });

const Content = mongoose.model('Content', contentSchema);
module.exports = Content;