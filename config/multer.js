const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
        
        if (req.originalUrl.includes('/settings/profile-photo') && req.session.user && req.session.user._id) {
            targetDir = 'usuarios'; 
            const userId = req.session.user._id.toString();
            const usernameSlug = slugify(req.session.user.username || 'user'); 
            const uniqueIdSuffix = userId.substring(userId.length - 5); 
            itemSlug = `${usernameSlug}-${uniqueIdSuffix}`; 
            
            const uploadPath = path.join('public', 'uploads', targetDir, itemSlug);
            if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
            
            cb(null, uploadPath);
            req.uploadPath = uploadPath; 
            req.actressSlug = itemSlug; 
            req.contentSubdir = ''; 
            return;
        }

        if (req.params.slug) {
            itemSlug = req.params.slug;
        } else if (req.body.name) {
            itemSlug = slugify(req.body.name);
        } else {
            itemSlug = 'temp-name-fallback'; 
        }

        if (req.originalUrl.includes('/content/add') || req.originalUrl.includes('/content/edit')) {
            const accessLevel = req.body.accessLevel || 'preview'; 
            subDir = accessLevel === 'private' ? 'privados' : 'previews';
        }
        
        const uploadPath = path.join('public', 'uploads', targetDir, itemSlug, subDir);
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        
        req.uploadPath = uploadPath; 
        req.actressSlug = itemSlug; 
        req.contentSubdir = subDir; 

        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        let filename;
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

// 1. Upload Normal (Fotos, Capas - Limite 5MB)
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } 
});

// 2. Upload Gigante EXCLUSIVO para a Rota de Vídeos (Limite 2GB)
const uploadLarge = multer({ 
    storage: storage,
    limits: { fileSize: 2000 * 1024 * 1024 } 
});

// Exportamos ambas as opções
module.exports = { upload, uploadLarge, slugify };