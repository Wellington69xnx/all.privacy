// server.js
const express = require('express');
const expressLayouts = require('express-ejs-layouts'); 
const mongoose = require('mongoose');
const session = require('express-session'); 
const Actress = require('./models/Actress'); 
const User = require('./models/User'); // Necessário para os favoritos na Home/Perfil

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const { slugify } = require('./config/multer'); 

const app = express();
const port = 3000;

// ===================================
// CONFIGURAÇÃO DO MONGODB ATLAS
// ===================================
const dbURI = "mongodb+srv://allprivacy:allprivacy@allprivacy.pbmxioi.mongodb.net/cinema-nova-mvp?retryWrites=true&w=majority&appName=allprivacy"; 

mongoose.connect(dbURI)
    .then(() => {
        console.log('[MONGODB] Conexão bem-sucedida ao Atlas.');
        app.listen(port, () => {
            console.log(`[NODE] Servidor rodando em http://localhost:${port}`);
            console.log(`[ADMIN] Acesso em http://localhost:${port}/admin/login`);
        });
    })
    .catch((err) => console.error('[MONGODB] Erro de conexão:', err));

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

const frontEndLayoutData = (req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
};
app.use(frontEndLayoutData); 

const adminLayoutData = (req, res, next) => {
    res.locals.currentPath = req.path;
    next();
};

const renderFrontEnd = (req, res, view, data) => {
    res.render(view, { ...data, layout: false });
}

// ===================================
// 5. ROTAS DO FRONT-END PRINCIPAL
// ===================================

app.get('/', async (req, res) => {
    try {
        const actresses = await Actress.find().select('name slug profilePhotoUrl coverPhotoUrl').limit(12).sort({ name: 1 });
        renderFrontEnd(req, res, 'index', {
            title: 'AllPrivacy | O Portal das Atrizes',
            actresses: actresses 
        });
    } catch (error) {
        renderFrontEnd(req, res, 'index', {
            title: 'AllPrivacy | O Portal das Atrizes',
            actresses: [] 
        });
    }
});

// ROTA: Perfil da Atriz (Com verificação de favoritos)
app.get('/atriz/:slug', async (req, res) => {
    const slug = req.params.slug;
    try {
        const actress = await Actress.findOne({ slug: slug }).populate('content').lean();

        if (!actress) {
            return res.redirect('/'); 
        }

        const previews = actress.content.filter(c => c.accessLevel === 'preview');
        const privateContent = actress.content.filter(c => c.accessLevel === 'private');

        let userFavorites = { actresses: [], contents: [] };
        if (req.session.user) {
            const userDb = await User.findById(req.session.user._id);
            if (userDb) {
                userFavorites.actresses = userDb.favoriteActresses.map(id => id.toString());
                userFavorites.contents = userDb.favoriteContents.map(id => id.toString());
            }
        }

        renderFrontEnd(req, res, 'actress', {
            title: `${actress.name} | AllPrivacy`,
            actress: actress, 
            previews: previews, 
            privateContent: privateContent, 
            privateCount: privateContent.length, 
            contentCount: previews.length + privateContent.length,
            userFavorites: userFavorites
        });

    } catch (error) {
        console.error('Erro ao buscar atriz e conteúdo para Front-end:', error);
        res.status(500).send('Erro interno ao carregar o perfil da atriz.');
    }
});

app.get('/sobre', (req, res) => {
    res.send('<h1>Página Sobre o AllPrivacy (MVP)</h1>');
});

app.use('/', authRoutes);
app.use('/admin', adminLayoutData, adminRoutes);