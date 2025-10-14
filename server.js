// server.js
const express = require('express');
const expressLayouts = require('express-ejs-layouts'); 
const mongoose = require('mongoose');
const session = require('express-session'); 
const Actress = require('./models/Actress'); 

// Importa os roteadores modulares
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const { slugify } = require('./config/multer'); // A função slugify ainda é usada na rota /atriz/:slug

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

mongoose.connect(dbURI, mongooseOptions)
    .then(() => {
        console.log('[MONGODB] Conexão bem-sucedida ao Atlas.');
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

app.use(session({
    secret: 'chave_secreta_para_sessao_user_allprivacy',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } 
}));

// Middleware para injetar dados do usuário/sessão nas views
const frontEndLayoutData = (req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
};
app.use(frontEndLayoutData); 

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

// ===================================
// 5. ROTAS DO FRONT-END PRINCIPAL
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
        renderFrontEnd(req, res, 'index', {
            title: 'AllPrivacy | O Portal das Atrizes',
            actresses: [] 
        });
    }
});

// ROTA: Perfil da Atriz (Front-end) 
app.get('/atriz/:slug', async (req, res) => {
    const slug = req.params.slug;
    try {
        const actress = await Actress.findOne({ slug: slug }).populate('content').lean();

        if (!actress) {
            return res.redirect('/'); 
        }

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
        res.status(500).send('Erro interno ao carregar o perfil da atriz.');
    }
});

app.get('/sobre', (req, res) => {
    res.send('<h1>Página Sobre o AllPrivacy (MVP)</h1>');
});

// MOUNT: Monta as rotas de autenticação e usuário
app.use('/', authRoutes);

// MOUNT: Monta o middleware adminLayoutData e as rotas de administração
app.use('/admin', adminLayoutData, adminRoutes);