// routes/admin.js

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

// Modelos
const Actress = require('../models/Actress'); 
const Content = require('../models/Content'); 

// Utilitários: Usar upload normal (5MB) e uploadLarge (2GB)
const { upload, uploadLarge, slugify } = require('../config/multer'); 

// ===================================
// ROTAS DO PAINEL ADMIN
// ===================================

router.get('/login', (req, res) => {
    res.render('admin/login', {
        title: 'Login Admin',
        layout: false 
    });
});

router.get('/dashboard', (req, res) => {
    res.render('admin/dashboard', {
        title: 'Dashboard | Admin AllPrivacy'
    });
});

router.get('/actresses', async (req, res) => {
    try {
        const actresses = await Actress.find().sort({ name: 1 });
        res.render('admin/actresses', {
            title: 'Atrizes & Conteúdo | Admin AllPrivacy',
            actresses: actresses 
        });
    } catch (error) {
        console.error('Erro ao buscar atrizes:', error);
        res.status(500).send('Não foi possível carregar a lista de atrizes.');
    }
});

router.get('/actresses/add', (req, res) => {
    res.render('admin/actress_form', {
        title: 'Adicionar Atriz | Admin AllPrivacy',
        isEdit: false,
        actress: { description: '' }
    });
});

// A adição da atriz usa o 'upload' normal (5MB)
router.post('/actresses/add', upload.fields([{ name: 'profile_photo', maxCount: 1 }, { name: 'cover_photo', maxCount: 1 }]), async (req, res) => {
    let profileUrl = '/img/default-profile.jpg';
    let coverUrl = '/img/default-cover.jpg';
    
    const profileFile = req.files && req.files['profile_photo'] ? req.files['profile_photo'][0] : null;
    const coverFile = req.files && req.files['cover_photo'] ? req.files['cover_photo'][0] : null;
    const actressSlug = req.actressSlug; 

    if (profileFile) {
        profileUrl = `/uploads/atrizes/${actressSlug}/${profileFile.savedFilename}`;
    }
    if (coverFile) {
        coverUrl = `/uploads/atrizes/${actressSlug}/${coverFile.savedFilename}`;
    }
    
    const newActress = new Actress({
        name: req.body.name,
        description: req.body.description,
        profilePhotoUrl: profileUrl,
        coverPhotoUrl: coverUrl,
    });
    
    try {
        await newActress.save();
        res.redirect('/admin/actresses'); 
    } catch (err) {
        if (err.code === 11000) { 
            const uploadPath = path.join('public', 'uploads', 'atrizes', actressSlug);
            if (fs.existsSync(uploadPath)) {
                fs.rmdirSync(uploadPath, { recursive: true });
            }
            return res.redirect('/admin/actresses/add'); 
        }
        res.status(500).send('Erro interno ao salvar atriz.');
    }
});

router.get('/actresses/edit/:slug', async (req, res) => {
    const slug = req.params.slug;
    try {
        const actress = await Actress.findOne({ slug: slug });
        if (!actress) return res.status(404).send('Atriz não encontrada.');

        res.render('admin/actress_form', {
            title: `Editar Atriz: ${actress.name} | Admin AllPrivacy`,
            isEdit: true,
            actress: {
                id: actress._id,
                slug: actress.slug, 
                name: actress.name,
                description: actress.description,
                profile_photo_url: actress.profilePhotoUrl,
                cover_photo_url: actress.coverPhotoUrl
            }
        });
    } catch (error) {
        res.status(500).send('Erro interno ao buscar atriz.');
    }
});

// A edição da atriz usa o 'upload' normal (5MB)
router.post('/actresses/edit/:slug', upload.fields([{ name: 'profile_photo', maxCount: 1 }, { name: 'cover_photo', maxCount: 1 }]), async (req, res) => {
    const oldSlug = req.params.slug;
    const newName = req.body.name;

    const profileFile = req.files && req.files['profile_photo'] ? req.files['profile_photo'][0] : null;
    const coverFile = req.files && req.files['cover_photo'] ? req.files['cover_photo'][0] : null;

    try {
        const actress = await Actress.findOne({ slug: oldSlug });
        if (!actress) return res.status(404).send('Atriz não encontrada para atualização.');
        
        const directorySlug = req.actressSlug; 
        
        const updateData = {
            name: newName,
            description: req.body.description,
            slug: actress.slug, 
            profilePhotoUrl: actress.profilePhotoUrl ?? '/img/default-profile.jpg', 
            coverPhotoUrl: actress.coverPhotoUrl ?? '/img/default-cover.jpg',
        };
        
        if (profileFile) {
            if (actress.profilePhotoUrl && actress.profilePhotoUrl.startsWith('/uploads')) {
                const oldFilePath = path.join('public', actress.profilePhotoUrl);
                if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
            }
            updateData.profilePhotoUrl = `/uploads/atrizes/${directorySlug}/${profileFile.savedFilename}`;
        }
        
        if (coverFile) {
            if (actress.coverPhotoUrl && actress.coverPhotoUrl.startsWith('/uploads')) {
                const oldFilePath = path.join('public', actress.coverPhotoUrl);
                if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
            }
            updateData.coverPhotoUrl = `/uploads/atrizes/${directorySlug}/${coverFile.savedFilename}`;
        }

        await Actress.findByIdAndUpdate(actress._id, updateData, { new: true, runValidators: true });
        res.redirect('/admin/actresses');

    } catch (err) {
        if (err.code === 11000) return res.redirect(`/admin/actresses/edit/${oldSlug}`); 
        return res.status(500).send('Erro interno ao atualizar atriz.');
    }
});

router.post('/actresses/delete/:slug', async (req, res) => {
    const slugToDelete = req.params.slug;
    try {
        const actress = await Actress.findOne({ slug: slugToDelete });
        if (!actress) return res.redirect('/admin/actresses'); 

        const uploadDirPath = path.join('public', 'uploads', 'atrizes', actress.slug);
        if (fs.existsSync(uploadDirPath)) {
            fs.rmdirSync(uploadDirPath, { recursive: true });
        }

        await Content.deleteMany({ actress: actress._id });
        await Actress.deleteOne({ slug: slugToDelete });
        res.redirect('/admin/actresses');

    } catch (err) {
        res.status(500).send('Erro interno ao apagar atriz.');
    }
});

router.get('/actresses/:slug/videos', async (req, res) => {
    const slug = req.params.slug;
    try {
        const actress = await Actress.findOne({ slug: slug }).populate('content').lean();
        if (!actress) return res.status(404).send('Atriz não encontrada.');

        res.render('admin/content_manager', {
            title: `Conteúdo: ${actress.name} | Admin AllPrivacy`,
            actress: actress, 
            contents: actress.content || []
        });

    } catch (error) {
        res.status(500).send('Não foi possível carregar a página de gestão de conteúdo.');
    }
});

router.get('/actresses/:slug/content/add', async (req, res) => {
    const slug = req.params.slug;
    try {
        const actress = await Actress.findOne({ slug: slug });
        if (!actress) return res.status(404).send('Atriz não encontrada.');

        res.render('admin/content_form', {
            title: `Adicionar Conteúdo a ${actress.name}`,
            actress: actress 
        });

    } catch (error) {
        res.status(500).send('Erro interno.');
    }
});


// ROTA DE UPLOAD DE CONTEÚDO (USA O uploadLarge com limite de 2GB)
router.post('/actresses/:slug/content/add', uploadLarge.fields([
    { name: 'files', maxCount: 10 }, 
    { name: 'thumbnail_file', maxCount: 1 }
]), async (req, res) => {
    const slug = req.params.slug;
    const { title, contentType, accessLevel, urlPath } = req.body;
    
    const files = req.files && req.files['files'] ? req.files['files'] : [];
    const thumbnailFile = req.files && req.files['thumbnail_file'] && req.files['thumbnail_file'][0] ? req.files['thumbnail_file'][0] : null;

    // Nomes corrigidos sem parênteses retos
    const rawStarts = req.body.previewStarts;
    const rawDurations = req.body.previewDurations;
    
    let previewsToGenerate = [];
    if (rawStarts && rawDurations) {
        const startsArray = Array.isArray(rawStarts) ? rawStarts : [rawStarts];
        const durationsArray = Array.isArray(rawDurations) ? rawDurations : [rawDurations];
        
        for(let i = 0; i < startsArray.length; i++) {
            previewsToGenerate.push({
                start: parseInt(startsArray[i]) || 0,
                duration: parseInt(durationsArray[i]) || 10
            });
        }
    }

    try {
        const actress = await Actress.findOne({ slug: slug });

        if (!actress) {
             const allFiles = [...files, thumbnailFile].filter(f => f);
             allFiles.forEach(file => { try { fs.unlinkSync(file.path); } catch (e) {} });
            return res.status(404).send('Atriz não encontrada.');
        }

        const newContents = [];
        const directorySlug = req.actressSlug; 
        const subdirectory = req.contentSubdir; 
        
        let thumbnailPath = null;
        if (thumbnailFile) {
            thumbnailPath = path.join('/uploads', 'atrizes', directorySlug, subdirectory, thumbnailFile.savedFilename).replace(/\\/g, '/');
        }

        if (contentType === 'upload' && files.length > 0) {
            const uploadDirBase = path.join('/uploads', 'atrizes', directorySlug, subdirectory);
            const previewDirBase = path.join('/uploads', 'atrizes', directorySlug, 'previews');
            const fullPreviewPath = path.join('public', previewDirBase);
            
            if (!fs.existsSync(fullPreviewPath)) {
                fs.mkdirSync(fullPreviewPath, { recursive: true });
            }

            for (const file of files) {
                const publicUrlPath = path.join(uploadDirBase, file.savedFilename).replace(/\\/g, '/'); 
                const isVideo = file.mimetype ? file.mimetype.startsWith('video/') : !file.savedFilename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                
                const newContent = new Content({
                    actress: actress._id, 
                    title: title, 
                    contentType: 'upload', 
                    accessLevel: accessLevel,
                    urlPath: publicUrlPath, 
                    thumbnailPath: thumbnailPath 
                });
                newContents.push(newContent);

                if (isVideo && previewsToGenerate.length > 0) {
                    const originalFilePath = path.join('public', publicUrlPath);

                    for (let i = 0; i < previewsToGenerate.length; i++) {
                        const config = previewsToGenerate[i];
                        const previewFilename = `custom-preview-p${i+1}-${Date.now()}-${file.savedFilename}`;
                        const outputFilePath = path.join(fullPreviewPath, previewFilename);
                        const publicPreviewUrl = path.join(previewDirBase, previewFilename).replace(/\\/g, '/');

                        console.log(`\n⏳ FFmpeg: A recortar Preview ${i+1}/${previewsToGenerate.length} (Início: ${config.start}s, Duração: ${config.duration}s)...`);
                        
                        try {
                            await new Promise((resolve, reject) => {
                                ffmpeg(originalFilePath)
                                    .setStartTime(config.start)
                                    .setDuration(config.duration)
                                    .outputOptions('-c copy')
                                    .save(outputFilePath)
                                    .on('end', () => {
                                        console.log(`✅ FFmpeg: Preview ${i+1} salvo com sucesso!`);
                                        resolve();
                                    })
                                    .on('error', (err) => {
                                        console.error(`❌ FFmpeg: Falha ao recortar preview ${i+1}:`, err);
                                        resolve();
                                    });
                            });

                            const previewContent = new Content({
                                actress: actress._id, 
                                title: `${title} (Preview Parte ${i+1})`, 
                                contentType: 'upload', 
                                accessLevel: 'preview', 
                                urlPath: publicPreviewUrl, 
                                thumbnailPath: thumbnailPath 
                            });
                            newContents.push(previewContent);
                            
                        } catch (ffmpegErr) {
                            console.error('Falha interna ao tentar chamar o ffmpeg:', ffmpegErr);
                        }
                    }
                }
            }
        } 
        else if (contentType === 'url' && urlPath) {
            const newContent = new Content({
                actress: actress._id, title: title, contentType: 'url', accessLevel: accessLevel,
                urlPath: urlPath, thumbnailPath: null 
            });
            newContents.push(newContent);
        }

        if (newContents.length > 0) {
            const savedContents = await Content.insertMany(newContents);
            const contentIds = savedContents.map(c => c._id);
            actress.content.push(...contentIds);
            await actress.save();
        } else {
             const allFiles = [...files, thumbnailFile].filter(f => f);
             allFiles.forEach(file => { try { fs.unlinkSync(file.path); } catch (e) {} });
        }

        res.redirect(`/admin/actresses/${slug}/videos`); 

    } catch (error) {
        console.error(error);
        const allFiles = [...files, thumbnailFile].filter(f => f);
        allFiles.forEach(file => { try { fs.unlinkSync(file.path); } catch (e) {} });
        res.status(500).send('Erro interno ao salvar conteúdo.');
    }
});


router.get('/actresses/:slug/content/edit/:contentId', async (req, res) => {
    const { slug, contentId } = req.params;
    try {
        const actress = await Actress.findOne({ slug: slug });
        const content = await Content.findById(contentId).lean();

        if (!actress || !content) return res.status(404).send('Atriz ou Conteúdo não encontrado.');

        res.render('admin/content_edit_form', {
            title: `Editar: ${content.title}`,
            actress: actress,
            content: content
        });

    } catch (error) {
        res.status(500).send('Erro interno ao carregar edição de conteúdo.');
    }
});

router.post('/actresses/:slug/content/edit/:contentId', upload.single('thumbnail_file'), async (req, res) => {
    const { slug, contentId } = req.params;
    const { title, accessLevel, oldThumbnailPath } = req.body;
    const newThumbnailFile = req.file; 

    try {
        const content = await Content.findById(contentId);
        if (!content) return res.status(404).send('Conteúdo não encontrado para atualização.');

        const updateData = { title, accessLevel };
        
        if (newThumbnailFile) {
            if (oldThumbnailPath && oldThumbnailPath.startsWith('/uploads')) {
                const oldFilePath = path.join('public', oldThumbnailPath);
                if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
            }
            
            const directorySlug = req.actressSlug; 
            const subdirectory = req.contentSubdir;
            updateData.thumbnailPath = path.join('/uploads', 'atrizes', directorySlug, subdirectory, newThumbnailFile.savedFilename).replace(/\\/g, '/');
            
        } else {
            updateData.thumbnailPath = oldThumbnailPath;
        }

        await Content.findByIdAndUpdate(contentId, updateData, { new: true, runValidators: true });
        res.redirect(`/admin/actresses/${slug}/videos`);

    } catch (error) {
        if (newThumbnailFile) try { fs.unlinkSync(newThumbnailFile.path); } catch (e) {}
        res.status(500).send('Erro interno ao guardar edição.');
    }
});

router.post('/actresses/content/delete/:slug/:contentId', async (req, res) => {
    const { slug, contentId } = req.params;
    const { filePath, thumbnailPath } = req.body; 

    try {
        const actress = await Actress.findOne({ slug: slug });
        if (actress) {
             await Actress.findByIdAndUpdate(actress._id, { $pull: { content: contentId } });
        }

        await Content.findByIdAndDelete(contentId);

        if (filePath && filePath.startsWith('/uploads')) {
            const mainFilePath = path.join('public', filePath);
            if (fs.existsSync(mainFilePath)) fs.unlinkSync(mainFilePath);
        }
        
        if (thumbnailPath && thumbnailPath.startsWith('/uploads')) {
            const thumbFilePath = path.join('public', thumbnailPath);
            if (fs.existsSync(thumbFilePath)) fs.unlinkSync(thumbFilePath);
        }

        res.redirect(`/admin/actresses/${slug}/videos`);

    } catch (err) {
        res.status(500).send('Erro interno ao apagar conteúdo.');
    }
});

router.get('/subscriptions', (req, res) => {
    res.render('admin/subscriptions', { title: 'Assinaturas | Admin AllPrivacy' });
});

router.get('/settings', (req, res) => {
    res.render('admin/settings', { title: 'Configurações | Admin AllPrivacy' });
});

module.exports = router;