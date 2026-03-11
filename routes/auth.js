// routes/auth.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp'); 

const User = require('../models/User'); 
const { upload } = require('../config/multer'); 

const renderFrontEnd = (req, res, view, data) => {
    res.render(view, {
        ...data,
        layout: false 
    });
}

const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// ===================================
// ROTAS DE AUTENTICAÇÃO
// ===================================

router.get('/login', (req, res) => {
    renderFrontEnd(req, res, 'login', { title: 'Login | AllPrivacy', error: null });
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email }).select('+profilePhotoUrl'); 

        if (!user || !(await user.comparePassword(password))) {
            return renderFrontEnd(req, res, 'login', { title: 'Login | AllPrivacy', error: 'Email ou senha inválidos.' });
        }

        req.session.user = { 
            _id: user._id, 
            email: user.email, 
            username: user.username,
            isPremium: user.isPremium,
            profilePhotoUrl: user.profilePhotoUrl 
        };
        
        console.log(`\n✅ Usuário logado: ${user.email}`);
        res.redirect('/dashboard'); 

    } catch (error) {
        console.error('Erro no login:', error);
        renderFrontEnd(req, res, 'login', { title: 'Login | AllPrivacy', error: 'Erro interno no servidor.' });
    }
});

router.get('/register', (req, res) => {
    renderFrontEnd(req, res, 'register', { 
        title: 'Registro | AllPrivacy', 
        error: null,
        formData: {} 
    });
});

router.post('/register', async (req, res) => {
    const { username, email, password, confirm_password, date_of_birth, age_check } = req.body;
    const dateParts = date_of_birth ? date_of_birth.split('-') : []; 
    const date_of_birth_display = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : '';
    const formData = { username, email, date_of_birth, date_of_birth_display };
    
    if (!username || !email || !password || !confirm_password || !date_of_birth || age_check !== 'on') {
        return renderFrontEnd(req, res, 'register', { title: 'Registro | AllPrivacy', error: 'Preencha todos os campos e confirme a idade.', formData });
    }
    if (password.length < 8) {
        return renderFrontEnd(req, res, 'register', { title: 'Registro | AllPrivacy', error: 'A senha deve ter no mínimo 8 caracteres.', formData });
    }
    if (password !== confirm_password) {
        return renderFrontEnd(req, res, 'register', { title: 'Registro | AllPrivacy', error: 'A senha e a confirmação de senha não coincidem.', formData });
    }
    
    const dob = new Date(date_of_birth);
    const minAgeDate = new Date();
    minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);
    
    if (dob > minAgeDate) {
         return renderFrontEnd(req, res, 'register', { title: 'Registro | AllPrivacy', error: 'Você deve ter 18 anos ou mais para se registrar.', formData });
    }

    try {
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            let errorMessage = (existingUser.username === username) ? 'Nome de usuário indisponível.' : 'Este e-mail já está em uso.';
            return renderFrontEnd(req, res, 'register', { title: 'Registro | AllPrivacy', error: errorMessage, formData });
        }

        const newUser = new User({ username, email, password, dateOfBirth: dob });
        await newUser.save();

        req.session.user = { 
            _id: newUser._id, email: newUser.email, username: newUser.username,
            isPremium: newUser.isPremium, profilePhotoUrl: newUser.profilePhotoUrl 
        };
        
        console.log(`\n✅ Novo usuário registrado: ${newUser.username} (${newUser.email})`);
        res.redirect('/dashboard'); 

    } catch (error) {
        console.error('Erro no registro:', error);
        renderFrontEnd(req, res, 'register', { title: 'Registro | AllPrivacy', error: 'Erro interno no servidor.', formData });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Erro ao encerrar sessão:', err);
            return res.redirect('/');
        }
        console.log(`\n🚪 Usuário deslogado.`);
        res.redirect('/');
    });
});

// ===================================
// ROTAS DE RECUPERAÇÃO DE SENHA
// ===================================

router.get('/forgot-password', (req, res) => {
    renderFrontEnd(req, res, 'forgot_password', { title: 'Recuperar Senha', error: null, success: null, formData: {} }); 
});

router.post('/forgot-password', async (req, res) => {
    const { username, email, date_of_birth } = req.body;
    const formData = { username, email, date_of_birth };
    const dateParts = date_of_birth ? date_of_birth.split('-') : []; 
    formData.date_of_birth_display = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : '';
    
    if (!username || !email || !date_of_birth) {
         return renderFrontEnd(req, res, 'forgot_password', { title: 'Recuperar Senha', error: 'Preencha todos os campos.', success: null, formData });
    }

    try {
        const user = await User.findOne({ username, email, dateOfBirth: new Date(date_of_birth) });
        
        if (!user) {
            return renderFrontEnd(req, res, 'forgot_password', { 
                title: 'Recuperar Senha', 
                error: 'Dados incorretos. Verifique o Nome de Usuário, E-mail e Data de Nascimento.', 
                success: null,
                formData
            });
        }

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 300000; 
        await user.save();
        
        res.redirect(`/reset-password/${token}`);

    } catch (error) {
        console.error('Erro na recuperação de senha:', error);
        return renderFrontEnd(req, res, 'forgot_password', { title: 'Recuperar Senha', error: 'Erro interno no servidor.', success: null, formData });
    }
});

router.get('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({ 
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() } 
        });

        if (!user) {
            return renderFrontEnd(req, res, 'message', { title: 'Erro de Redefinição', message: 'Token de redefinição de senha inválido ou expirado.' });
        }
        
        renderFrontEnd(req, res, 'reset_password', { 
            title: 'Redefinir Senha', 
            token: req.params.token, 
            error: null 
        });

    } catch (error) {
        console.error('Erro ao buscar token:', error);
        return renderFrontEnd(req, res, 'message', { title: 'Erro', message: 'Erro interno no servidor ao verificar token.' });
    }
});

router.post('/reset-password/:token', async (req, res) => {
    const { password, confirm_password } = req.body;

    if (password.length < 8) {
        return renderFrontEnd(req, res, 'reset_password', { title: 'Redefinir Senha', token: req.params.token, error: 'A senha deve ter no mínimo 8 caracteres.' });
    }
    if (password !== confirm_password) {
        return renderFrontEnd(req, res, 'reset_password', { title: 'Redefinir Senha', token: req.params.token, error: 'As senhas não coincidem.' });
    }

    try {
        const user = await User.findOne({ 
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return renderFrontEnd(req, res, 'message', { title: 'Erro de Redefinição', message: 'Token de redefinição de senha inválido ou expirado.' });
        }

        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        await user.save(); 

        return renderFrontEnd(req, res, 'message', { title: 'Senha Redefinida', message: 'Sua senha foi redefinida com sucesso. Você já pode fazer login.' });

    } catch (error) {
        console.error('Erro ao redefinir senha:', error);
        return renderFrontEnd(req, res, 'reset_password', { title: 'Redefinir Senha', token: req.params.token, error: 'Erro interno no servidor.' });
    }
});

// ===================================
// ROTAS DE CONTA, CONFIGURAÇÕES E FAVORITOS
// ===================================

router.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const userFromDB = await User.findById(req.session.user._id)
            .populate('favoriteActresses')
            .populate('favoriteContents');
        
        renderFrontEnd(req, res, 'dashboard', {
            title: `Minha Conta | ${req.session.user.username}`,
            user: req.session.user,
            favoriteActresses: userFromDB.favoriteActresses || [],
            favoriteContents: userFromDB.favoriteContents || []
        });
    } catch (err) {
        console.error('Erro ao carregar dashboard', err);
        res.redirect('/');
    }
});

router.get('/settings', requireAuth, async (req, res) => {
    const userFromDB = await User.findById(req.session.user._id).select('-password');
    if (userFromDB) {
        const dobDate = userFromDB.dateOfBirth;
        const dobFormatted = dobDate ? dobDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Indisponível';
        
        req.session.user = { 
            _id: userFromDB._id, email: userFromDB.email, username: userFromDB.username,
            isPremium: userFromDB.isPremium, profilePhotoUrl: userFromDB.profilePhotoUrl,
            dateOfBirth: dobFormatted 
        };
    }
    
    const success_msg = req.session.success_msg;
    const error_msg = req.session.error_msg;

    delete req.session.success_msg;
    delete req.session.error_msg;

    renderFrontEnd(req, res, 'settings', { 
        title: 'Configurações da Conta', 
        user: req.session.user, 
        success_msg: success_msg || null, 
        error_msg: error_msg || null    
    });
});

router.post('/settings/profile', requireAuth, async (req, res) => {
    const { username } = req.body;
    const currentUserId = req.session.user._id;
    const currentUsername = req.session.user.username; 

    if (!username || username.length < 3) {
         req.session.error_msg = 'Nome de usuário inválido (mínimo 3 caracteres).';
         return res.redirect('/settings');
    }
    
    if (username === currentUsername) {
        req.session.success_msg = 'Nome de usuário mantido.';
        return res.redirect('/settings');
    }

    try {
        const existingUser = await User.findOne({ username: username, _id: { $ne: currentUserId } });

        if (existingUser) {
            req.session.error_msg = 'Este nome de usuário já está em uso.';
            return res.redirect('/settings');
        }

        const updatedUser = await User.findByIdAndUpdate(
            currentUserId,
            { username: username },
            { new: true, runValidators: true }
        ).select('-password -resetPasswordToken -resetPasswordExpires'); 

        if (updatedUser) {
            req.session.user.username = updatedUser.username;
        }

        req.session.success_msg = 'Nome de usuário alterado com sucesso!';
        res.redirect('/settings');
    } catch (error) {
         console.error('Erro ao atualizar nome de usuário:', error);
         req.session.error_msg = 'Erro interno ao tentar atualizar nome de usuário.';
         res.redirect('/settings');
    }
});

router.post('/settings/password', requireAuth, async (req, res) => {
    const { current_password, new_password, confirm_new_password } = req.body;

    if (new_password.length < 8) {
        req.session.error_msg = 'A nova senha deve ter no mínimo 8 caracteres.';
        return res.redirect('/settings');
    }
    if (new_password !== confirm_new_password) {
        req.session.error_msg = 'A nova senha e a confirmação não coincidem.';
        return res.redirect('/settings');
    }

    try {
        const user = await User.findById(req.session.user._id);

        if (!user || !(await user.comparePassword(current_password))) {
            req.session.error_msg = 'A senha atual está incorreta.';
            return res.redirect('/settings');
        }
        
        user.password = new_password;
        await user.save();

        req.session.destroy(() => {
             res.redirect('/login'); 
        });
        return;

    } catch (error) {
         console.error('Erro ao atualizar senha:', error);
         req.session.error_msg = 'Erro interno ao tentar atualizar a senha.';
         res.redirect('/settings');
    }
});

router.post('/settings/profile-photo', requireAuth, (req, res) => {
    upload.single('profilePhoto')(req, res, async (err) => {
        if (err) {
            req.session.error_msg = (err.code === 'LIMIT_FILE_SIZE') ? 'O arquivo é muito grande. O tamanho máximo permitido é 5MB.' : `Erro de upload: ${err.message || 'Erro interno.'}`;
            return res.redirect('/settings');
        }
        
        if (!req.file) {
            req.session.error_msg = 'Nenhum arquivo de foto enviado.';
            return res.redirect('/settings');
        }
        
        const originalFilePath = req.file.path; 
        const newFolderSlug = req.actressSlug; 
        const processedFilename = `profile-photo-${req.session.user._id.toString()}.jpg`; 
        const finalFilePath = path.join(path.dirname(originalFilePath), processedFilename);
        const publicUrlPath = path.join('/uploads', 'usuarios', newFolderSlug, processedFilename).replace(/\\/g, '/');

        try {
            await sharp(originalFilePath)
                .resize(150, 150, { fit: sharp.fit.cover, withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toFile(finalFilePath); 

            if (originalFilePath !== finalFilePath && fs.existsSync(originalFilePath)) {
                fs.unlinkSync(originalFilePath); 
            }
            
            const user = await User.findById(req.session.user._id);

            const currentProfilePhotoUrl = user.profilePhotoUrl;
            if (currentProfilePhotoUrl && currentProfilePhotoUrl.startsWith('/uploads') && currentProfilePhotoUrl !== publicUrlPath) {
                const oldFilePath = path.join('public', currentProfilePhotoUrl);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
                const oldFolderPath = path.dirname(oldFilePath);
                 if (fs.existsSync(oldFolderPath)) {
                     const filesInOldFolder = fs.readdirSync(oldFolderPath);
                     if (filesInOldFolder.length === 0) fs.rmdirSync(oldFolderPath);
                 }
            }
            
            user.profilePhotoUrl = publicUrlPath;
            await user.save();
            req.session.user.profilePhotoUrl = publicUrlPath;
            req.session.success_msg = 'Foto de perfil atualizada!';
            res.redirect('/settings'); 

        } catch (error) {
            console.error('Erro ao processar imagem com sharp:', error);
            if (fs.existsSync(originalFilePath)) {
                try { fs.unlinkSync(originalFilePath); } catch (e) {}
            }
            req.session.error_msg = 'Erro interno ao processar a foto. Tente novamente.';
            res.redirect('/settings');
        }
    });
});

router.post('/settings/profile-photo/remove', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);

        if (user.profilePhotoUrl && user.profilePhotoUrl.startsWith('/uploads')) {
            const oldFilePath = path.join('public', user.profilePhotoUrl);
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
                const oldFolderPath = path.dirname(oldFilePath);
                 if (fs.existsSync(oldFolderPath)) {
                     const filesInOldFolder = fs.readdirSync(oldFolderPath);
                     if (filesInOldFolder.length === 0) fs.rmdirSync(oldFolderPath);
                 }
            }
        }
        
        user.profilePhotoUrl = null;
        await user.save();
        req.session.user.profilePhotoUrl = null;
        req.session.success_msg = 'Foto de perfil removida com sucesso.';
        res.redirect('/settings');

    } catch (error) {
        console.error('Erro ao remover foto de perfil:', error);
        req.session.error_msg = 'Erro interno ao remover foto de perfil.';
        res.redirect('/settings');
    }
});

// ROTAS PARA ALTERAR FAVORITOS VIA FETCH
router.post('/favorites/actress/:id', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        const index = user.favoriteActresses.indexOf(req.params.id);
        let isFavorited = false;
        if (index === -1) {
            user.favoriteActresses.push(req.params.id);
            isFavorited = true;
        } else {
            user.favoriteActresses.splice(index, 1);
        }
        await user.save();
        res.json({ success: true, isFavorited });
    } catch (error) { 
        res.status(500).json({ success: false }); 
    }
});

router.post('/favorites/content/:id', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        const index = user.favoriteContents.indexOf(req.params.id);
        let isFavorited = false;
        if (index === -1) {
            user.favoriteContents.push(req.params.id);
            isFavorited = true;
        } else {
            user.favoriteContents.splice(index, 1);
        }
        await user.save();
        res.json({ success: true, isFavorited });
    } catch (error) { 
        res.status(500).json({ success: false }); 
    }
});

module.exports = router;