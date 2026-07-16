const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ========== File Upload Setup ==========
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.params.type || 'general';
        const dest = path.join(UPLOAD_DIR, type);
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '_' + Math.random().toString(36).substr(2, 9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        const type = req.params.type;
        if (type === 'image') {
            if (file.mimetype.startsWith('image/')) cb(null, true);
            else cb(new Error('Only image files allowed'));
        } else if (type === 'mod') {
            if (file.originalname.endsWith('.jar') || file.originalname.endsWith('.zip')) cb(null, true);
            else cb(new Error('Only .jar or .zip files allowed'));
        } else if (type === 'rp') {
            if (file.originalname.endsWith('.zip')) cb(null, true);
            else cb(new Error('Only .zip files allowed'));
        } else {
            cb(null, true);
        }
    }
});

// ========== Database ==========
const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) { console.error('DB load error:', e); }
    return {
        users: [{
            id: 1, name: "Administrator", email: "mohamadhabar120@gmail.com",
            password: "SARNANTO_X123", isAdmin: true, banned: false,
            createdAt: "2025-06-17T00:00:00.000Z"
        }],
        mods: [], resourcePacks: [], ideas: [], logs: [],
        visitors: 128, totalDownloads: 0
    };
}

function saveDB(data) {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
    catch (e) { console.error('DB save error:', e); }
}

let db = loadDB();

function generateToken() { return 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }
function generateId() { return Date.now() + '_' + Math.random().toString(36).substr(2, 9); }

// ========== REGISTER ==========
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "❌ جميع الحقول مطلوبة" });
    if (password.length < 6) return res.status(400).json({ error: "❌ كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    const existingUser = db.users.find(u => u.email === email);
    if (existingUser) return res.status(400).json({ error: "❌ البريد الإلكتروني مستخدم بالفعل" });
    const newUser = {
        id: db.users.length + 1, name, email, password,
        isAdmin: false, banned: false, createdAt: new Date().toISOString()
    };
    db.users.push(newUser);
    db.visitors++;
    saveDB(db);
    res.json({ success: true, token: generateToken(), user: { id: newUser.id, name: newUser.name, email: newUser.email, isAdmin: newUser.isAdmin } });
});

// ========== LOGIN ==========
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: "❌ البريد غير موجود" });
    if (user.banned) return res.status(403).json({ error: "🚫 الحساب محظور" });
    if (user.password !== password) return res.status(401).json({ error: "❌ كلمة مرور خاطئة" });
    db.visitors++;
    saveDB(db);
    res.json({ success: true, token: generateToken(), user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
});

// ========== FILE UPLOAD ==========
app.post('/api/upload/:type', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const type = req.params.type;
    const relativePath = `/uploads/${type}/${req.file.filename}`;
    res.json({ 
        success: true, 
        fileName: req.file.originalname,
        url: relativePath,
        size: req.file.size
    });
});

// ========== MODS ==========
app.get('/api/mods', (req, res) => { res.json({ mods: db.mods }); });

app.post('/api/mods', (req, res) => {
    const { name, price, desc, isFree, category, version, mcVersion, fileName, images } = req.body;
    const newMod = {
        id: generateId(), name: name || 'مود بدون اسم',
        price: parseFloat(price) || 0, desc: desc || 'بدون وصف',
        isFree: isFree === 'true' || isFree === true,
        category: category || 'عام', version: version || '1.0',
        mcVersion: mcVersion || '1.20+', fileName: fileName || '',
        images: images || [], downloads: 0, ratings: [],
        averageRating: 0, comments: [], likes: 0,
        createdAt: new Date().toISOString()
    };
    db.mods.push(newMod);
    saveDB(db);
    res.json({ success: true, mod: newMod });
});

app.delete('/api/mods/:id', (req, res) => {
    const id = req.params.id;
    db.mods = db.mods.filter(m => m.id !== id);
    saveDB(db);
    res.json({ success: true });
});

// ========== RESOURCE PACKS ==========
app.get('/api/resourcepacks', (req, res) => { res.json({ resourcePacks: db.resourcePacks }); });

app.post('/api/resourcepacks', (req, res) => {
    const { name, price, desc, isFree, category, version, mcVersion, fileName, images } = req.body;
    const newRP = {
        id: generateId(), name: name || 'ريسورسباك بدون اسم',
        price: parseFloat(price) || 0, desc: desc || 'بدون وصف',
        isFree: isFree === 'true' || isFree === true,
        category: category || 'عام', version: version || '1.0',
        mcVersion: mcVersion || '1.20+', fileName: fileName || '',
        images: images || [], downloads: 0, ratings: [],
        averageRating: 0, comments: [], likes: 0,
        createdAt: new Date().toISOString()
    };
    db.resourcePacks.push(newRP);
    saveDB(db);
    res.json({ success: true, resourcePack: newRP });
});

app.delete('/api/resourcepacks/:id', (req, res) => {
    const id = req.params.id;
    db.resourcePacks = db.resourcePacks.filter(r => r.id !== id);
    saveDB(db);
    res.json({ success: true });
});

// ========== RATE MODS ==========
app.post('/api/mods/:id/rate', (req, res) => {
    const id = req.params.id;
    const { rating } = req.body;
    const mod = db.mods.find(m => m.id === id);
    if (!mod) return res.status(404).json({ error: "المود غير موجود" });
    mod.ratings.push({ rating: parseInt(rating), timestamp: new Date().toISOString() });
    const avg = mod.ratings.reduce((a, b) => a + b.rating, 0) / mod.ratings.length;
    mod.averageRating = Math.round(avg * 10) / 10;
    saveDB(db);
    res.json({ success: true, averageRating: mod.averageRating });
});

// ========== LIKE MODS ==========
app.post('/api/mods/:id/like', (req, res) => {
    const id = req.params.id;
    const mod = db.mods.find(m => m.id === id);
    if (!mod) return res.status(404).json({ error: "المود غير موجود" });
    mod.likes = (mod.likes || 0) + 1;
    saveDB(db);
    res.json({ success: true, likes: mod.likes });
});

// ========== COMMENTS MODS ==========
app.post('/api/mods/:id/comment', (req, res) => {
    const id = req.params.id;
    const { text, userName } = req.body;
    const mod = db.mods.find(m => m.id === id);
    if (!mod) return res.status(404).json({ error: "المود غير موجود" });
    mod.comments.push({ userName: userName || "مستخدم", text, timestamp: new Date().toISOString() });
    saveDB(db);
    res.json({ success: true });
});

// ========== RATE RPs ==========
app.post('/api/resourcepacks/:id/rate', (req, res) => {
    const id = req.params.id;
    const { rating } = req.body;
    const rp = db.resourcePacks.find(r => r.id === id);
    if (!rp) return res.status(404).json({ error: "الريسورسباك غير موجود" });
    rp.ratings.push({ rating: parseInt(rating), timestamp: new Date().toISOString() });
    const avg = rp.ratings.reduce((a, b) => a + b.rating, 0) / rp.ratings.length;
    rp.averageRating = Math.round(avg * 10) / 10;
    saveDB(db);
    res.json({ success: true, averageRating: rp.averageRating });
});

// ========== LIKE RPs ==========
app.post('/api/resourcepacks/:id/like', (req, res) => {
    const id = req.params.id;
    const rp = db.resourcePacks.find(r => r.id === id);
    if (!rp) return res.status(404).json({ error: "الريسورسباك غير موجود" });
    rp.likes = (rp.likes || 0) + 1;
    saveDB(db);
    res.json({ success: true, likes: rp.likes });
});

// ========== COMMENTS RPs ==========
app.post('/api/resourcepacks/:id/comment', (req, res) => {
    const id = req.params.id;
    const { text, userName } = req.body;
    const rp = db.resourcePacks.find(r => r.id === id);
    if (!rp) return res.status(404).json({ error: "الريسورسباك غير موجود" });
    rp.comments.push({ userName: userName || "مستخدم", text, timestamp: new Date().toISOString() });
    saveDB(db);
    res.json({ success: true });
});

// ========== DOWNLOAD MODS ==========
app.get('/api/download-free/:id', (req, res) => {
    const id = req.params.id;
    const mod = db.mods.find(m => m.id === id);
    if (!mod) return res.status(404).json({ error: "المود غير موجود" });
    if (!mod.isFree) return res.status(403).json({ error: "هذا المود مدفوع" });
    mod.downloads++;
    db.totalDownloads++;
    saveDB(db);
    res.json({ success: true, message: "تم التحميل", fileName: mod.fileName });
});

// ========== DOWNLOAD RPs ==========
app.get('/api/download-rp-free/:id', (req, res) => {
    const id = req.params.id;
    const rp = db.resourcePacks.find(r => r.id === id);
    if (!rp) return res.status(404).json({ error: "الريسورسباك غير موجود" });
    if (!rp.isFree) return res.status(403).json({ error: "هذا الريسورسباك مدفوع" });
    rp.downloads++;
    db.totalDownloads++;
    saveDB(db);
    res.json({ success: true, message: "تم التحميل", fileName: rp.fileName });
});

// ========== IDEAS ==========
app.get('/api/ideas', (req, res) => { res.json({ ideas: db.ideas }); });

app.post('/api/ideas', (req, res) => {
    const { title, description, category } = req.body;
    db.ideas.push({
        id: generateId(), title: title || 'فكرة بدون عنوان',
        description: description || '', category: category || 'عام',
        votes: 0, status: 'pending', createdAt: new Date().toISOString()
    });
    saveDB(db);
    res.json({ success: true });
});

app.post('/api/ideas/:id/vote', (req, res) => {
    const id = req.params.id;
    const idea = db.ideas.find(i => i.id === id);
    if (!idea) return res.status(404).json({ error: "الفكرة غير موجودة" });
    idea.votes = (idea.votes || 0) + 1;
    saveDB(db);
    res.json({ success: true, votes: idea.votes });
});

// ========== USERS ==========
app.get('/api/users', (req, res) => {
    res.json({ users: db.users.map(u => ({ id: u.id, name: u.name, email: u.email, isAdmin: u.isAdmin, banned: u.banned })) });
});

app.put('/api/users/:id/ban', (req, res) => {
    const id = parseInt(req.params.id);
    const user = db.users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    user.banned = req.body.banned !== false;
    saveDB(db);
    res.json({ success: true });
});

// ========== STATS ==========
app.get('/api/stats', (req, res) => {
    res.json({ users: db.users.length, mods: db.mods.length, resourcePacks: db.resourcePacks.length, ideas: db.ideas.length, downloads: db.totalDownloads, visitors: db.visitors });
});

// ========== SERVE UPLOADS ==========
app.use('/uploads', express.static(UPLOAD_DIR));

// ========== SERVE index.html ==========
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// ========== ERROR HANDLING ==========
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// ========== START ==========
app.listen(PORT, () => { console.log(`🚀 Server running on port ${PORT}`); });