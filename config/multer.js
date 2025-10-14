// config/multer.js

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto'); // Importado para gerar o sufixo único (embora usemos o ID, o import estava na lógica anterior)

/**
 * Converte uma string em um formato URL-safe (slug).
 * @param {string} text
 * @returns {string}
 */
const slugify = (text) => {
    return text
        .toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
};


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        
        let targetDir = 'atrizes';
        let subDir = '';
        let itemSlug = '';
        
        // 1. Lógica para Rotas de Configurações de Usuário (Foto de Perfil)
        if (req.originalUrl.includes('/settings/profile-photo') && req.session.user && req.session.user._id) {
            targetDir = 'usuarios'; 
            
            // --- MODIFICAÇÃO: Usar username slug + 5 caracteres do ID do usuário (estático e único) ---
            const userId = req.session.user._id.toString();
            // Pega o username da sessão. Usa 'user' como fallback.
            const usernameSlug = slugify(req.session.user.username || 'user'); 
            
            // Pega os últimos 5 caracteres hexadecimais do ID do MongoDB como sufixo estático
            const uniqueIdSuffix = userId.substring(userId.length - 5); 
            itemSlug = `${usernameSlug}-${uniqueIdSuffix}`; 
            // --------------------------------------------------------------------------------
            
            const uploadPath = path.join('public', 'uploads', targetDir, itemSlug);
            
            if (!fs.existsSync(uploadPath)) {
                fs.mkdirSync(uploadPath, { recursive: true });
            }
            
            cb(null, uploadPath);

            req.uploadPath = uploadPath; 
            req.actressSlug = itemSlug; 
            req.contentSubdir = ''; 
            return;
        }


        // 2. Lógica Original para Rotas de Atrizes (Fallback)
        if (req.params.slug) {
            itemSlug = req.params.slug;
        } else if (req.body.name) {
            itemSlug = slugify(req.body.name);
        } else {
            itemSlug = 'temp-name-fallback'; 
        }

        // Lógica para rotas de CONTEÚDO de Atrizes
        if (req.originalUrl.includes('/content/add') || req.originalUrl.includes('/content/edit')) {
            const accessLevel = req.body.accessLevel || 'preview'; 
            subDir = accessLevel === 'private' ? 'privados' : 'previews';
        }
        
        const uploadPath = path.join('public', 'uploads', targetDir, itemSlug, subDir);
        
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        
        req.uploadPath = uploadPath; 
        req.actressSlug = itemSlug; 
        req.contentSubdir = subDir; 

        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        
        let filename;
        
        // Usa um nome temporário único para a foto de perfil antes de ser processada pelo sharp
        if (req.originalUrl.includes('/settings/profile-photo')) {
             filename = `raw-profile-photo-${req.session.user._id}-${Date.now()}${ext}`;
        } else {
             let prefix = file.fieldname === 'thumbnail_file' ? 'thumb-' : '';
             filename = `${prefix}${path.parse(file.originalname).name || 'file'}-${Date.now()}${ext}`; 
        }
        
        file.savedFilename = filename;
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // Limite de 5MB
});

module.exports = { upload, slugify };