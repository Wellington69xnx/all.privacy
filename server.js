// server.js
const express = require('express');
const expressLayouts = require('express-ejs-layouts'); 
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session'); 
const crypto = require('crypto');
const Actress = require('./models/Actress'); 
const Content = require('./models/Content'); 
const User = require('./models/User'); 
const app = express();
const port = 3000;

// ===================================
// CONFIGURAÇÃO DO MONGODB ATLAS
// ===================================
const dbURI = "mongodb+srv://well69xnx:Download@allprivacy.jxntvly.mongodb.net/cinemaNovaMVP?retryWrites=true&w=majority&appName=allprivacy"; 

const mongooseOptions = { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
};

// GARANTIA: Servidor só inicia após a conexão com o DB ser bem-sucedida
mongoose.connect(dbURI, mongooseOptions)
    .then(() => {
        console.log('[MONGODB] Conexão bem-sucedida ao Atlas.');
        // INICIALIZAÇÃO DO SERVIDOR HTTP
        app.listen(port, () => {
            console.log(`[NODE] Servidor rodando em http://localhost:${port}`);
            console.log(`[ADMIN] Acesso em http://localhost:${port}/admin/login`);
        });
    })
    .catch((err) => console.error('[MONGODB] Erro de conexão. Verifique sua URI, senha e IP na whitelist do Atlas:', err));


// ===================================
// 1. CONFIGURAÇÃO DO EXPRESS E EJS
// ===================================
app.set('view engine', 'ejs');
app.set('views', './views');
app.use(expressLayouts);
app.set('layout', 'admin/layout'); 

// ===================================
// 2. MIDDLEWARES GLOBAIS
// ===================================
app.use(express.urlencoded({ extended: true })); 
app.use(express.static('public'));

// Configuração da Sessão
app.use(session({
    secret: 'chave_secreta_para_sessao_user_allprivacy', // Mude para uma chave secreta forte
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // Sessão dura 24 horas
}));

// Middleware para injetar dados do usuário/sessão nas views
const frontEndLayoutData = (req, res, next) => {
    // Adiciona o objeto user da sessão para que todas as views o acessem
    res.locals.user = req.session.user || null;
    next();
};
app.use(frontEndLayoutData); // Aplica a todas as rotas


// Funções utilitárias (Slugify)
const slugify = (text) => {
    return text
        .toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
};


// ===================================
// 3. CONFIGURAÇÃO DO MULTER (ARMAZENAMENTO EM DISCO)
// ===================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        
        let actressSlugBase;
        
        if (req.params.slug) {
            actressSlugBase = req.params.slug;
        } else if (req.body.name) {
            actressSlugBase = slugify(req.body.name);
        } else {
            actressSlugBase = 'temp-name-fallback'; 
        }

        const safeActressSlug = actressSlugBase; 
        
        let contentSubdir = '';
        
        // Lógica para rotas de CONTEÚDO
        if (req.originalUrl.includes('/content/add') || req.originalUrl.includes('/content/edit')) {
            // O accessLevel é crucial para o destino da subpasta
            const accessLevel = req.body.accessLevel || 'preview'; // Se não houver corpo, usa preview
            contentSubdir = accessLevel === 'private' ? 'privados' : 'previews';
        }
        
        // Constrói o caminho final: public/uploads/atrizes/slug/subpasta
        const uploadPath = path.join('public', 'uploads', 'atrizes', safeActressSlug, contentSubdir);
        
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        
        req.uploadPath = uploadPath; 
        req.actressSlug = safeActressSlug; 
        req.contentSubdir = contentSubdir; 

        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        
        // Adiciona um prefixo para o Thumbnail
        let prefix = file.fieldname === 'thumbnail_file' ? 'thumb-' : '';
        
        // Garante que o nome do arquivo seja único e inclui o prefixo
        let filename = `${prefix}${path.parse(file.originalname).name || 'file'}-${Date.now()}${ext}`; 
        
        file.savedFilename = filename;
        cb(null, filename);
    }
});

const upload = multer({ storage: storage });


// Middleware para injetar o caminho atual nas rotas do Admin
const adminLayoutData = (req, res, next) => {
    res.locals.currentPath = req.path;
    next();
};

// ===================================
// 4. FUNÇÕES DE RENDERIZAÇÃO
// ===================================

const renderFrontEnd = (req, res, view, data) => {
    res.render(view, {
        ...data,
        layout: false 
    });
}

// Middleware para checar se o usuário está logado
const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// ===================================
// 5. ROTAS DO FRONT-END
// ===================================

// ROTA HOME (/)
app.get('/', async (req, res) => {
    try {
        const actresses = await Actress.find().select('name slug profilePhotoUrl coverPhotoUrl').limit(12).sort({ name: 1 });
        
        renderFrontEnd(req, res, 'index', {
            title: 'AllPrivacy | O Portal das Atrizes',
            actresses: actresses 
        });
    } catch (error) {
        console.error('Erro ao buscar atrizes para o Front-end:', error);
        // Fallback: Tenta renderizar mesmo que o DB falhe, mas sem dados
        renderFrontEnd(req, res, 'index', {
            title: 'AllPrivacy | O Portal das Atrizes',
            actresses: [] 
        });
    }
});

// 5.1 ROTAS DE AUTENTICAÇÃO
app.get('/login', (req, res) => {
    renderFrontEnd(req, res, 'login', { title: 'Login | AllPrivacy', error: null });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });

        if (!user) {
            return renderFrontEnd(req, res, 'login', { title: 'Login | AllPrivacy', error: 'Email ou senha inválidos.' });
        }

        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return renderFrontEnd(req, res, 'login', { title: 'Login | AllPrivacy', error: 'Email ou senha inválidos.' });
        }

        // Sucesso: Cria sessão
        req.session.user = { 
            _id: user._id, 
            email: user.email, 
            username: user.username,
            isPremium: user.isPremium 
        };
        
        console.log(`\n✅ Usuário logado: ${user.email}`);
        res.redirect('/dashboard'); 

    } catch (error) {
        console.error('Erro no login:', error);
        renderFrontEnd(req, res, 'login', { title: 'Login | AllPrivacy', error: 'Erro interno no servidor.' });
    }
});

app.get('/register', (req, res) => {
    renderFrontEnd(req, res, 'register', { 
        title: 'Registro | AllPrivacy', 
        error: null,
        formData: {} 
    });
});

app.post('/register', async (req, res) => {
    const { username, email, password, confirm_password, date_of_birth, age_check } = req.body;
    
    // Converte DD/MM/AAAA para DD/MM/AAAA para EJS exibir de volta
    const dateParts = date_of_birth ? date_of_birth.split('-') : []; // [YYYY, MM, DD]
    const date_of_birth_display = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : '';
    
    // Dados para retornar ao formulário em caso de erro
    const formData = { username, email, date_of_birth, date_of_birth_display };
    
    // Validação 1: Campos obrigatórios e check de idade
    if (!username || !email || !password || !confirm_password || !date_of_birth || age_check !== 'on') {
        return renderFrontEnd(req, res, 'register', { title: 'Registro | AllPrivacy', error: 'Preencha todos os campos e confirme a idade.', formData });
    }
    
    // Validação 2: Senhas
    if (password.length < 8) {
        return renderFrontEnd(req, res, 'register', { title: 'Registro | AllPrivacy', error: 'A senha deve ter no mínimo 8 caracteres.', formData });
    }
    if (password !== confirm_password) {
        return renderFrontEnd(req, res, 'register', { title: 'Registro | AllPrivacy', error: 'A senha e a confirmação de senha não coincidem.', formData });
    }
    
    // Validação 3: Idade Mínima (simulação de 18 anos)
    const dob = new Date(date_of_birth);
    const minAgeDate = new Date();
    minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);
    
    if (dob > minAgeDate) {
         return renderFrontEnd(req, res, 'register', { title: 'Registro | AllPrivacy', error: 'Você deve ter 18 anos ou mais para se registrar.', formData });
    }
    

    try {
        // 1. Verificar unicidade
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            let errorMessage = 'Erro de unicidade desconhecido.';
            if (existingUser.username === username) {
                 errorMessage = 'Nome de usuário indisponível.';
            } else if (existingUser.email === email) {
                errorMessage = 'Este e-mail já está em uso.';
            }
            return renderFrontEnd(req, res, 'register', { title: 'Registro | AllPrivacy', error: errorMessage, formData });
        }


        // 2. Cria e Salva Novo Usuário
        const newUser = new User({ 
            username, 
            email, 
            password, 
            dateOfBirth: dob 
        });
        await newUser.save();

        // 3. Cria Sessão
        req.session.user = { 
            _id: newUser._id, 
            email: newUser.email, 
            username: newUser.username,
            isPremium: newUser.isPremium 
        };
        
        console.log(`\n✅ Novo usuário registrado: ${newUser.username} (${newUser.email})`);
        res.redirect('/dashboard'); 

    } catch (error) {
        console.error('Erro no registro:', error);
        renderFrontEnd(req, res, 'register', { title: 'Registro | AllPrivacy', error: 'Erro interno no servidor.', formData });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Erro ao encerrar sessão:', err);
            return res.redirect('/');
        }
        console.log(`\n🚪 Usuário deslogado.`);
        res.redirect('/');
    });
});

// 5.2 ROTAS DE RECUPERAÇÃO DE SENHA
app.get('/forgot-password', (req, res) => {
    renderFrontEnd(req, res, 'forgot_password', { title: 'Recuperar Senha', error: null, success: null, formData: {} }); 
});

app.post('/forgot-password', async (req, res) => {
    const { username, email, date_of_birth } = req.body;
    const formData = { username, email, date_of_birth };
    
    // Converte YYYY-MM-DD para DD/MM/AAAA para EJS exibir de volta
    const dateParts = date_of_birth ? date_of_birth.split('-') : []; // [YYYY, MM, DD]
    formData.date_of_birth_display = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : '';
    
    // Validação básica dos campos
    if (!username || !email || !date_of_birth) {
         return renderFrontEnd(req, res, 'forgot_password', { title: 'Recuperar Senha', error: 'Preencha todos os campos.', success: null, formData });
    }

    try {
        // 1. Buscar usuário que corresponda aos 3 campos
        const user = await User.findOne({ 
            username: username, 
            email: email, 
            dateOfBirth: new Date(date_of_birth) 
        });
        
        if (!user) {
            console.log(`⚠️ Tentativa de recuperação falhou para user: ${username}`);
            return renderFrontEnd(req, res, 'forgot_password', { 
                title: 'Recuperar Senha', 
                error: 'Dados incorretos. Verifique o Nome de Usuário, E-mail e Data de Nascimento.', 
                success: null,
                formData
            });
        }

        // 2. Criamos um token temporário que o usuário só verá na URL
        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 300000; // 5 minutos de validade para o reset imediato
        await user.save();
        
        console.log(`\n🔑 Redirecionando para reset de senha (User: ${user.username})`);

        res.redirect(`/reset-password/${token}`);

    } catch (error) {
        console.error('Erro na recuperação de senha:', error);
        return renderFrontEnd(req, res, 'forgot_password', { title: 'Recuperar Senha', error: 'Erro interno no servidor.', success: null, formData });
    }
});

// GET: Exibe o formulário de redefinição
app.get('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({ 
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() } // Garante que o token não expirou
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

// POST: Processa a nova senha
app.post('/reset-password/:token', async (req, res) => {
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

        // 1. Atualiza a senha (o hook pre('save') fará o hash)
        user.password = password;
        // 2. Limpa o token e a data de expiração
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        await user.save(); // Salva a nova senha criptografada

        // Redireciona para login com mensagem de sucesso
        return renderFrontEnd(req, res, 'message', { title: 'Senha Redefinida', message: 'Sua senha foi redefinida com sucesso. Você já pode fazer login.' });

    } catch (error) {
        console.error('Erro ao redefinir senha:', error);
        return renderFrontEnd(req, res, 'reset_password', { title: 'Redefinir Senha', token: req.params.token, error: 'Erro interno no servidor.' });
    }
});


// ROTA: Dashboard do Usuário
app.get('/dashboard', requireAuth, (req, res) => {
    renderFrontEnd(req, res, 'dashboard', {
        title: `Dashboard de ${req.session.user.username}`,
        user: req.session.user
    });
});

// ROTA: Perfil da Atriz (Front-end) 
app.get('/atriz/:slug', async (req, res) => {
    const slug = req.params.slug;
    try {
        // Busca a atriz pelo slug e popula o array de conteúdo
        const actress = await Actress.findOne({ slug: slug }).populate('content').lean();

        if (!actress) {
            // Se a atriz não for encontrada, redireciona para a Home
            return res.redirect('/'); 
        }

        // Filtra o conteúdo: Previews (público) e Privado (exclusivo)
        const previews = actress.content.filter(c => c.accessLevel === 'preview');
        const privateContent = actress.content.filter(c => c.accessLevel === 'private');

        renderFrontEnd(req, res, 'actress', {
            title: `${actress.name} | AllPrivacy`,
            actress: actress, 
            previews: previews, 
            privateContent: privateContent, 
            privateCount: privateContent.length, 
            contentCount: previews.length + privateContent.length, 
        });

    } catch (error) {
        console.error('Erro ao buscar atriz e conteúdo para Front-end:', error);
        // Em caso de erro, pode redirecionar ou mostrar um erro 500
        res.status(500).send('Erro interno ao carregar o perfil da atriz.');
    }
});

app.get('/sobre', (req, res) => {
    res.send('<h1>Página Sobre o AllPrivacy (MVP)</h1>');
});


// ===================================
// 6. ROTAS DO PAINEL ADMIN
// ===================================
app.use('/admin', adminLayoutData); 

app.get('/admin/login', (req, res) => {
    renderFrontEnd(req, res, 'admin/login', {
        title: 'Login Admin'
    });
});

app.get('/admin/dashboard', (req, res) => {
    res.render('admin/dashboard', {
        title: 'Dashboard | Admin AllPrivacy'
    });
});

// ROTA: Gerenciamento de Atrizes e Conteúdo (Lista principal)
app.get('/admin/actresses', async (req, res) => {
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
app.get('/admin/actresses/add', (req, res) => {
    res.render('admin/actress_form', {
        title: 'Adicionar Atriz | Admin AllPrivacy',
        isEdit: false,
        actress: { description: '' }
    });
});

// ROTA (POST): Processar Adição de Atriz
app.post('/admin/actresses/add', upload.fields([{ name: 'profile_photo', maxCount: 1 }, { name: 'cover_photo', maxCount: 1 }]), async (req, res) => {
    
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
app.get('/admin/actresses/edit/:slug', async (req, res) => {
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
app.post('/admin/actresses/edit/:slug', upload.fields([{ name: 'profile_photo', maxCount: 1 }, { name: 'cover_photo', maxCount: 1 }]), async (req, res) => {
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
                    console.log(`🗑️ Deletado arquivo antigo: ${oldFilePath}`);
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
                    console.log(`🗑️ Deletado arquivo antigo: ${oldFilePath}`);
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
        filesToDelete.forEach(filePath => { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (unlinkErr) { console.error(`Falha ao deletar arquivo de erro: ${unlinkErr.message}`); } });
        
        return res.status(500).send('Erro interno ao atualizar atriz. Verifique o console para detalhes.');
    }
});


// ROTA (POST): Processar Deleção de Atriz
app.post('/admin/actresses/delete/:slug', async (req, res) => {
    const slugToDelete = req.params.slug;

    try {
        const actress = await Actress.findOne({ slug: slugToDelete });
        
        if (!actress) {
            console.log(`Atriz com slug ${slugToDelete} não encontrada. Deleção ignorada.`);
            return res.redirect('/admin/actresses'); 
        }

        const uploadDirPath = path.join('public', 'uploads', 'atrizes', actress.slug);
        
        if (fs.existsSync(uploadDirPath)) {
            fs.rmdirSync(uploadDirPath, { recursive: true });
            console.log(`🗑️ Pasta de uploads deletada: ${uploadDirPath}`);
        } else {
            console.log(`⚠️ Pasta de uploads não encontrada: ${uploadDirPath}. Continuando...`);
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
app.get('/admin/actresses/:slug/videos', async (req, res) => {
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
app.get('/admin/actresses/:slug/content/add', async (req, res) => {
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
        console.error('Erro ao buscar atriz para formulário de conteúdo:', error);
        res.status(500).send('Erro interno.');
    }
});


// ROTA (POST): Processar Adição de Conteúdo (Upload de Conteúdo + Thumbnail)
app.post('/admin/actresses/:slug/content/add', upload.fields([
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


        // Lógica para Upload de Arquivos
        if (contentType === 'upload' && files.length > 0) {
            
            const uploadDirBase = path.join('/uploads', 'atrizes', directorySlug, subdirectory);

            for (const file of files) {
                const publicUrlPath = path.join(uploadDirBase, file.savedFilename).replace(/\\/g, '/'); 
                
                const newContent = new Content({
                    actress: actress._id,
                    title: title, 
                    contentType: 'upload',
                    accessLevel: accessLevel,
                    urlPath: publicUrlPath,
                    thumbnailPath: thumbnailPath 
                });
                newContents.push(newContent);
            }
        } 
        // Lógica para URL Externa
        else if (contentType === 'url' && urlPath) {
            const newContent = new Content({
                actress: actress._id,
                title: title,
                contentType: 'url',
                accessLevel: accessLevel,
                urlPath: urlPath,
                thumbnailPath: null 
            });
            newContents.push(newContent);
        }

        // 3. Salvar Conteúdo no DB e Referenciar na Atriz
        if (newContents.length > 0) {
            const savedContents = await Content.insertMany(newContents);
            const contentIds = savedContents.map(c => c._id);
            
            actress.content.push(...contentIds);
            await actress.save();
            
            console.log(`\n✅ ${contentIds.length} novos conteúdos adicionados à atriz ${actress.name}.`);
        } else {
             const allFiles = [...files, thumbnailFile].filter(f => f);
             allFiles.forEach(file => { try { fs.unlinkSync(file.path); } catch (e) { console.error('Falha no cleanup:', e); } });
        }

        res.redirect(`/admin/actresses/${slug}/videos`); 

    } catch (error) {
        console.error('❌ ERRO ao salvar Conteúdo:', error);
        
        const allFiles = [...files, thumbnailFile].filter(f => f);
        allFiles.forEach(file => { try { fs.unlinkSync(file.path); } catch (e) { console.error('Falha no cleanup:', e); } });
        
        res.status(500).send('Erro interno ao salvar conteúdo.');
    }
});


// ROTA (GET): Formulário para Editar Conteúdo
app.get('/admin/actresses/:slug/content/edit/:contentId', async (req, res) => {
    const { slug, contentId } = req.params;
    
    try {
        const actress = await Actress.findOne({ slug: slug });
        const content = await Content.findById(contentId).lean();

        if (!actress || !content) {
            return res.status(404).send('Atriz ou Conteúdo não encontrado.');
        }
        
        // Se for um link externo, o formulário de edição é mais simples
        if (content.contentType === 'url') {
            // A visualização de edição para URL externa é mais simples e não permite captura de thumbnail
        }

        res.render('admin/content_edit_form', {
            title: `Editar: ${content.title}`,
            actress: actress,
            content: content
        });

    } catch (error) {
        console.error('Erro ao buscar conteúdo para edição:', error);
        res.status(500).send('Erro interno ao carregar edição de conteúdo.');
    }
});


// ROTA (POST): Processar Edição de Conteúdo (Título + Thumbnail)
app.post('/admin/actresses/:slug/content/edit/:contentId', upload.single('thumbnail_file'), async (req, res) => {
    const { slug, contentId } = req.params;
    const { title, accessLevel, oldThumbnailPath } = req.body;
    const newThumbnailFile = req.file; // Arquivo do novo thumbnail (capturado ou upload manual)

    try {
        const content = await Content.findById(contentId);

        if (!content) {
            return res.status(404).send('Conteúdo não encontrado para atualização.');
        }

        const updateData = {
            title: title,
            accessLevel: accessLevel,
        };
        
        // 1. Lógica de Substituição de Thumbnail
        if (newThumbnailFile) {
            
            // 1.1. Deleta o thumbnail antigo (se existir e não for null)
            if (oldThumbnailPath && oldThumbnailPath.startsWith('/uploads')) {
                const oldFilePath = path.join('public', oldThumbnailPath);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                    console.log(`🗑️ Thumbnail antigo deletado: ${oldFilePath}`);
                }
            }
            
            // 1.2. Atualiza o caminho do novo thumbnail
            const directorySlug = req.actressSlug; 
            const subdirectory = req.contentSubdir;
            updateData.thumbnailPath = path.join('/uploads', 'atrizes', directorySlug, subdirectory, newThumbnailFile.savedFilename).replace(/\\/g, '/');
            
        } else {
            // Se não houve novo upload, mantém o antigo
            updateData.thumbnailPath = oldThumbnailPath;
        }


        // 2. Atualiza o registro no MongoDB
        const updatedContent = await Content.findByIdAndUpdate(contentId, updateData, { new: true, runValidators: true });

        console.log(`\n✅ Conteúdo editado com sucesso: ${updatedContent.title}`);
        res.redirect(`/admin/actresses/${slug}/videos`);

    } catch (error) {
        console.error('❌ ERRO ao editar Conteúdo:', error);
        
        // Limpa o novo thumbnail em caso de falha no DB
        if (newThumbnailFile) {
            try { fs.unlinkSync(newThumbnailFile.path); } catch (e) { console.error('Falha no cleanup do thumbnail:', e); }
        }
        
        res.status(500).send('Erro interno ao salvar edição.');
    }
});


// ROTA (POST): Processar Deleção de Conteúdo (Corrigida e Finalizada)
app.post('/admin/actresses/content/delete/:slug/:contentId', async (req, res) => {
    const { slug, contentId } = req.params;
    const { filePath, thumbnailPath } = req.body; // Pega caminhos do formulário oculto

    try {
        // 1. Remove a referência do Conteúdo no array da Atriz
        const actress = await Actress.findOne({ slug: slug });
        if (actress) {
             await Actress.findByIdAndUpdate(actress._id, { $pull: { content: contentId } });
        }

        // 2. Remove o conteúdo do MongoDB
        const deletedContent = await Content.findByIdAndDelete(contentId);

        if (!deletedContent) {
            console.log(`Conteúdo ${contentId} não encontrado. Deleção do DB ignorada.`);
        }

        // 3. Lógica para deletar os arquivos do disco (apenas se for upload)
        
        // 3.1. Deleta o arquivo de conteúdo principal (filePath)
        if (filePath && filePath.startsWith('/uploads')) {
            const mainFilePath = path.join('public', filePath);
            if (fs.existsSync(mainFilePath)) {
                fs.unlinkSync(mainFilePath);
                console.log(`🗑️ Arquivo principal deletado: ${mainFilePath}`);
            }
        }
        
        // 3.2. Deleta o arquivo de thumbnail
        if (thumbnailPath && thumbnailPath.startsWith('/uploads')) {
            const thumbFilePath = path.join('public', thumbnailPath);
            if (fs.existsSync(thumbFilePath)) {
                fs.unlinkSync(thumbFilePath);
                console.log(`🗑️ Arquivo thumbnail deletado: ${thumbFilePath}`);
            }
        }
        
        console.log(`\n✅ Conteúdo deletado com sucesso: ${deletedContent ? deletedContent.title : 'ID ' + contentId}`);

        res.redirect(`/admin/actresses/${slug}/videos`);

    } catch (err) {
        console.error(`\n❌ ERRO FATAL AO DELETAR CONTEÚDO ${contentId}:`, err);
        res.status(500).send('Erro interno ao deletar conteúdo. Verifique o console para detalhes.');
    }
});


app.get('/admin/subscriptions', (req, res) => {
    res.render('admin/subscriptions', { title: 'Assinaturas | Admin AllPrivacy' });
});

app.get('/admin/settings', (req, res) => {
    res.render('admin/settings', { title: 'Configurações | Admin AllPrivacy' });
});