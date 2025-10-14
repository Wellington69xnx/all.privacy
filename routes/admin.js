// routes/admin.js

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Model Imports (assumindo a estrutura: models/Actress, models/Content)
const Actress = require('../models/Actress'); 
const Content = require('../models/Content'); 

// Utility Imports
const { upload, slugify } = require('../config/multer'); 

// ===================================
// ROTAS DO PAINEL ADMIN
// ===================================

router.get('/login', (req, res) => {
    // Nota: Essa rota é redundante se for usada com app.use('/admin', ...) no server.js
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

// ROTA: Gerenciamento de Atrizes e Conteúdo (Lista principal)
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

// ROTA (GET): Formulário de Adicionar Nova Atriz
router.get('/actresses/add', (req, res) => {
    res.render('admin/actress_form', {
        title: 'Adicionar Atriz | Admin AllPrivacy',
        isEdit: false,
        actress: { description: '' }
    });
});

// ROTA (POST): Processar Adição de Atriz
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
        console.log(`\n✅ Atriz criada com sucesso. Arquivos salvos em public/uploads/atrizes/${actressSlug}`);
        res.redirect('/admin/actresses'); 

    } catch (err) {
        if (err.code === 11000) { 
            console.error(`\n❌ Erro de Validação: Nome já existe. Apagando arquivos...`);
            const uploadPath = path.join('public', 'uploads', 'atrizes', actressSlug);
            if (fs.existsSync(uploadPath)) {
                fs.rmdirSync(uploadPath, { recursive: true });
            }
            return res.redirect('/admin/actresses/add'); 
        }
        console.error('\n❌ Erro ao salvar atriz:', err);
        res.status(500).send('Erro interno ao salvar atriz.');
    }
});


// ROTA (GET): Formulário de Editar Atriz (BUSCA REAL)
router.get('/actresses/edit/:slug', async (req, res) => {
    const slug = req.params.slug;
    
    try {
        const actress = await Actress.findOne({ slug: slug });

        if (!actress) {
            return res.status(404).send('Atriz não encontrada.');
        }

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
        console.error('Erro ao buscar atriz para edição:', error);
        res.status(500).send('Erro interno ao buscar atriz.');
    }
});

// ROTA (POST): Processar Edição de Atriz (LÓGICA SIMPLIFICADA)
router.post('/actresses/edit/:slug', upload.fields([{ name: 'profile_photo', maxCount: 1 }, { name: 'cover_photo', maxCount: 1 }]), async (req, res) => {
    const oldSlug = req.params.slug;
    const newName = req.body.name;

    const profileFile = req.files && req.files['profile_photo'] ? req.files['profile_photo'][0] : null;
    const coverFile = req.files && req.files['cover_photo'] ? req.files['cover_photo'][0] : null;

    try {
        const actress = await Actress.findOne({ slug: oldSlug });

        if (!actress) {
            console.log(`Atriz não encontrada para atualização: ${oldSlug}`);
            return res.status(404).send('Atriz não encontrada para atualização.');
        }
        
        const directorySlug = req.actressSlug; 
        
        const updateData = {
            name: newName,
            description: req.body.description,
            slug: actress.slug, 
            profilePhotoUrl: actress.profilePhotoUrl ?? '/img/default-profile.jpg', 
            coverPhotoUrl: actress.coverPhotoUrl ?? '/img/default-cover.jpg',
        };
        
        if (profileFile) {
            const oldProfileUrl = actress.profilePhotoUrl;
            if (oldProfileUrl && oldProfileUrl.startsWith('/uploads')) {
                const oldFilePath = path.join('public', oldProfileUrl);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            }
            updateData.profilePhotoUrl = `/uploads/atrizes/${directorySlug}/${profileFile.savedFilename}`;
        }
        
        if (coverFile) {
            const oldCoverUrl = actress.coverPhotoUrl;
            if (oldCoverUrl && oldCoverUrl.startsWith('/uploads')) {
                const oldFilePath = path.join('public', oldCoverUrl);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            }
            updateData.coverPhotoUrl = `/uploads/atrizes/${directorySlug}/${coverFile.savedFilename}`;
        }

        const updatedActress = await Actress.findByIdAndUpdate(actress._id, updateData, { new: true, runValidators: true });

        console.log(`\n✅ Atriz atualizada com sucesso: ${updatedActress.name} (Slug: ${updatedActress.slug})`);

        res.redirect('/admin/actresses');

    } catch (err) {
        console.error(`\n❌ ERRO FATAL NA ROTA DE EDIÇÃO:`, err);
        if (err.code === 11000) { 
            console.error(`\n❌ Erro de Validação: Nome/Slug já está em uso.`);
            return res.redirect(`/admin/actresses/edit/${oldSlug}`); 
        }
        
        const filesToDelete = [];
        if (profileFile) { filesToDelete.push(profileFile.path); }
        if (coverFile) { filesToDelete.push(coverFile.path); }
        filesToDelete.forEach(filePath => { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (unlinkErr) {} });
        
        return res.status(500).send('Erro interno ao atualizar atriz. Verifique o console para detalhes.');
    }
});


// ROTA (POST): Processar Deleção de Atriz
router.post('/actresses/delete/:slug', async (req, res) => {
    const slugToDelete = req.params.slug;

    try {
        const actress = await Actress.findOne({ slug: slugToDelete });
        
        if (!actress) {
            return res.redirect('/admin/actresses'); 
        }

        const uploadDirPath = path.join('public', 'uploads', 'atrizes', actress.slug);
        
        if (fs.existsSync(uploadDirPath)) {
            fs.rmdirSync(uploadDirPath, { recursive: true });
        }

        await Content.deleteMany({ actress: actress._id });
        await Actress.deleteOne({ slug: slugToDelete });
        
        console.log(`\n✅ Atriz e todos os seus conteúdos deletados com sucesso: ${actress.name} (Slug: ${slugToDelete})`);

        res.redirect('/admin/actresses');

    } catch (err) {
        console.error(`\n❌ ERRO FATAL AO DELETAR ATRIZ ${slugToDelete}:`, err);
        res.status(500).send('Erro interno ao deletar atriz. Verifique o console para detalhes.');
    }
});


// ROTA (GET): Gerenciamento de Conteúdo (Tela de Listagem)
router.get('/actresses/:slug/videos', async (req, res) => {
    const slug = req.params.slug;
    try {
        const actress = await Actress.findOne({ slug: slug }).populate('content').lean();
        
        if (!actress) {
            return res.status(404).send('Atriz não encontrada.');
        }

        res.render('admin/content_manager', {
            title: `Conteúdo: ${actress.name} | Admin AllPrivacy`,
            actress: actress, 
            contents: actress.content || []
        });

    } catch (error) {
        console.error('Erro ao carregar gerenciamento de conteúdo:', error);
        res.status(500).send('Não foi possível carregar a página de gerenciamento de conteúdo.');
    }
});


// ROTA (GET): Formulário para Adicionar Conteúdo
router.get('/actresses/:slug/content/add', async (req, res) => {
    const slug = req.params.slug;
    
    try {
        const actress = await Actress.findOne({ slug: slug });
        
        if (!actress) {
            return res.status(404).send('Atriz não encontrada.');
        }

        res.render('admin/content_form', {
            title: `Adicionar Conteúdo a ${actress.name}`,
            actress: actress 
        });

    } catch (error) {
        res.status(500).send('Erro interno.');
    }
});


// ROTA (POST): Processar Adição de Conteúdo (Upload de Conteúdo + Thumbnail)
router.post('/actresses/:slug/content/add', upload.fields([
    { name: 'files', maxCount: 10 }, 
    { name: 'thumbnail_file', maxCount: 1 }
]), async (req, res) => {
    const slug = req.params.slug;
    const { title, contentType, accessLevel, urlPath } = req.body;
    
    const files = req.files && req.files['files'] ? req.files['files'] : [];
    const thumbnailFile = req.files && req.files['thumbnail_file'] && req.files['thumbnail_file'][0] ? req.files['thumbnail_file'][0] : null;

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

            for (const file of files) {
                const publicUrlPath = path.join(uploadDirBase, file.savedFilename).replace(/\\/g, '/'); 
                
                const newContent = new Content({
                    actress: actress._id, title: title, contentType: 'upload', accessLevel: accessLevel,
                    urlPath: publicUrlPath, thumbnailPath: thumbnailPath 
                });
                newContents.push(newContent);
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
            
            console.log(`\n✅ ${contentIds.length} novos conteúdos adicionados à atriz ${actress.name}.`);
        } else {
             const allFiles = [...files, thumbnailFile].filter(f => f);
             allFiles.forEach(file => { try { fs.unlinkSync(file.path); } catch (e) {} });
        }

        res.redirect(`/admin/actresses/${slug}/videos`); 

    } catch (error) {
        const allFiles = [...files, thumbnailFile].filter(f => f);
        allFiles.forEach(file => { try { fs.unlinkSync(file.path); } catch (e) {} });
        
        res.status(500).send('Erro interno ao salvar conteúdo.');
    }
});


// ROTA (GET): Formulário para Editar Conteúdo
router.get('/actresses/:slug/content/edit/:contentId', async (req, res) => {
    const { slug, contentId } = req.params;
    
    try {
        const actress = await Actress.findOne({ slug: slug });
        const content = await Content.findById(contentId).lean();

        if (!actress || !content) {
            return res.status(404).send('Atriz ou Conteúdo não encontrado.');
        }

        res.render('admin/content_edit_form', {
            title: `Editar: ${content.title}`,
            actress: actress,
            content: content
        });

    } catch (error) {
        res.status(500).send('Erro interno ao carregar edição de conteúdo.');
    }
});


// ROTA (POST): Processar Edição de Conteúdo (Título + Thumbnail)
router.post('/actresses/:slug/content/edit/:contentId', upload.single('thumbnail_file'), async (req, res) => {
    const { slug, contentId } = req.params;
    const { title, accessLevel, oldThumbnailPath } = req.body;
    const newThumbnailFile = req.file; 

    try {
        const content = await Content.findById(contentId);

        if (!content) {
            return res.status(404).send('Conteúdo não encontrado para atualização.');
        }

        const updateData = { title, accessLevel };
        
        if (newThumbnailFile) {
            if (oldThumbnailPath && oldThumbnailPath.startsWith('/uploads')) {
                const oldFilePath = path.join('public', oldThumbnailPath);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            }
            
            const directorySlug = req.actressSlug; 
            const subdirectory = req.contentSubdir;
            updateData.thumbnailPath = path.join('/uploads', 'atrizes', directorySlug, subdirectory, newThumbnailFile.savedFilename).replace(/\\/g, '/');
            
        } else {
            updateData.thumbnailPath = oldThumbnailPath;
        }

        const updatedContent = await Content.findByIdAndUpdate(contentId, updateData, { new: true, runValidators: true });

        console.log(`\n✅ Conteúdo editado com sucesso: ${updatedContent.title}`);
        res.redirect(`/admin/actresses/${slug}/videos`);

    } catch (error) {
        if (newThumbnailFile) {
            try { fs.unlinkSync(newThumbnailFile.path); } catch (e) {}
        }
        
        res.status(500).send('Erro interno ao salvar edição.');
    }
});


// ROTA (POST): Processar Deleção de Conteúdo (Corrigida e Finalizada)
router.post('/actresses/content/delete/:slug/:contentId', async (req, res) => {
    const { slug, contentId } = req.params;
    const { filePath, thumbnailPath } = req.body; 

    try {
        const actress = await Actress.findOne({ slug: slug });
        if (actress) {
             await Actress.findByIdAndUpdate(actress._id, { $pull: { content: contentId } });
        }

        const deletedContent = await Content.findByIdAndDelete(contentId);

        if (filePath && filePath.startsWith('/uploads')) {
            const mainFilePath = path.join('public', filePath);
            if (fs.existsSync(mainFilePath)) {
                fs.unlinkSync(mainFilePath);
            }
        }
        
        if (thumbnailPath && thumbnailPath.startsWith('/uploads')) {
            const thumbFilePath = path.join('public', thumbnailPath);
            if (fs.existsSync(thumbFilePath)) {
                fs.unlinkSync(thumbFilePath);
            }
        }
        
        console.log(`\n✅ Conteúdo deletado com sucesso: ${deletedContent ? deletedContent.title : 'ID ' + contentId}`);

        res.redirect(`/admin/actresses/${slug}/videos`);

    } catch (err) {
        res.status(500).send('Erro interno ao deletar conteúdo. Verifique o console para detalhes.');
    }
});


router.get('/subscriptions', (req, res) => {
    res.render('admin/subscriptions', { title: 'Assinaturas | Admin AllPrivacy' });
});

router.get('/settings', (req, res) => {
    res.render('admin/settings', { title: 'Configurações | Admin AllPrivacy' });
});

module.exports = router;