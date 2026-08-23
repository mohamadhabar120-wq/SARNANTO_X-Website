const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { put, list } = require('@vercel/blob');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const ON_VERCEL = !!process.env.VERCEL;
const DB_BLOB_PATH = 'db/database.json';

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!HAS_BLOB && !ON_VERCEL && !fs.existsSync(UPLOAD_DIR)) {
    try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { console.error('Could not create uploads dir:', e); }
}

const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
    fileFilter: (req, file, cb) => {
        const type = req.params.type;
        if (type === 'mod') {
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

function safeFileName(originalname) {
    return (originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}

function generateUploadName(originalname) {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9) + path.extname(safeFileName(originalname));
}

const DB_FILE = path.join(__dirname, 'database.json');

function defaultDB() {
    return {
        users: [{
            id: 1, name: "Administrator", email: "mohamadhabar120@gmail.com",
            password: "SARNANTO_X123", isAdmin: true, banned: false,
            banReason: null, banExpiry: null, banPermanent: false,
            createdAt: new Date().toISOString()
        }],
        mods: [], resourcePacks: [], ideas: [], logs: [],
        visitors: 128, totalDownloads: 0
    };
}

async function loadDB() {
    if (HAS_BLOB) {
        try {
            const { blobs } = await list({ prefix: DB_BLOB_PATH, limit: 1 });
            const dbBlob = blobs.find(b => b.pathname === DB_BLOB_PATH);
            if (dbBlob) {
                const res = await fetch(dbBlob.url, { cache: 'no-store' });
                if (res.ok) return await res.json();
            }
        } catch (e) { console.error('Blob DB load error:', e); }
        return defaultDB();
    }
    try {
        if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) { console.error('DB load error:', e); }
    return defaultDB();
}

async function saveDB(data) {
    if (HAS_BLOB) {
        try {
            await put(DB_BLOB_PATH, JSON.stringify(data, null, 2), {
                access: 'public',
                contentType: 'application/json',
                addRandomSuffix: false,
                allowOverwrite: true
            });
        } catch (e) { console.error('Blob DB save error:', e); }
        return;
    }
    try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
    catch (e) { console.error('DB save error:', e); }
}

let db = defaultDB();
let dbReady = loadDB().then(d => { db = d; });

app.use(async (req, res, next) => {
    await dbReady;
    if (HAS_BLOB) {
        try { db = await loadDB(); } catch (e) { console.error(e); }
    }
    next();
});

function generateToken() { return 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }
function generateId() { return Date.now() + '_' + Math.random().toString(36).substr(2, 9); }
function nextUserId() { return db.users.length ? Math.max(...db.users.map(u => u.id)) + 1 : 1; }

function authMiddleware(req, res, next) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const user = db.users.find(u => u.token === token);
    if (!user) return res.status(401).json({ error: "Invalid token" });
    if (user.banned) {
        return res.status(403).json({
            error: "🚫 الحساب محظور",
            banned: true,
            banReason: user.banReason || "تم الحظر من قبل الإدارة",
            banExpiry: user.banExpiry,
            banPermanent: user.banPermanent || false
        });
    }

    req.user = user;
    next();
}

app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "❌ جميع الحقول مطلوبة" });
    if (password.length < 6) return res.status(400).json({ error: "❌ كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    const existingUser = db.users.find(u => u.email === email);
    if (existingUser) return res.status(400).json({ error: "❌ البريد الإلكتروني مستخدم بالفعل" });
    const newUser = {
        id: nextUserId(), name, email, password,
        isAdmin: false, banned: false,
        banReason: null, banExpiry: null, banPermanent: false,
        createdAt: new Date().toISOString()
    };
    const tok = generateToken();
    newUser.token = tok;
    db.users.push(newUser);
    db.visitors++;
    await saveDB(db);
    res.json({ success: true, token: tok, user: { id: newUser.id, name: newUser.name, email: newUser.email, isAdmin: newUser.isAdmin } });
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: "❌ البريد غير موجود" });
    if (user.password !== password) return res.status(401).json({ error: "❌ كلمة مرور خاطئة" });

    if (user.banned) {
        return res.status(403).json({
            error: "🚫 الحساب محظور",
            banned: true,
            banReason: user.banReason || "تم الحظر من قبل الإدارة",
            banExpiry: user.banExpiry,
            banPermanent: user.banPermanent || false
        });
    }

    const tok = generateToken();
    user.token = tok;
    db.visitors++;
    await saveDB(db);
    res.json({
        success: true,
        token: tok,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin,
            banned: user.banned
        }
    });
});

app.get('/api/me', (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.json({ user: null });
    const user = db.users.find(u => u.token === token);
    if (!user) return res.json({ user: null });
    if (user.banned) {
        return res.status(403).json({
            banned: true,
            banReason: user.banReason || "تم الحظر من قبل الإدارة",
            banExpiry: user.banExpiry,
            banPermanent: user.banPermanent || false
        });
    }
    res.json({
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin
        }
    });
});

app.post('/api/upload/:type', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const type = req.params.type;
    const uniqueName = generateUploadName(req.file.originalname);

    try {
        if (HAS_BLOB) {
            const blob = await put(`uploads/${type}/${uniqueName}`, req.file.buffer, {
                access: 'public',
                addRandomSuffix: false,
                contentType: req.file.mimetype || 'application/octet-stream'
            });
            return res.json({
                success: true,
                fileName: safeFileName(req.file.originalname),
                url: blob.url,
                size: req.file.size
            });
        }
        if (ON_VERCEL) {
            return res.status(500).json({
                error: 'التخزين الدائم غير مفعّل: متغير BLOB_READ_WRITE_TOKEN غير موجود على السيرفر. اربط Blob Store من Storage في Vercel ثم أعد النشر (Redeploy).'
            });
        }
        const dest = path.join(UPLOAD_DIR, type);
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.writeFileSync(path.join(dest, uniqueName), req.file.buffer);
        res.json({
            success: true,
            fileName: safeFileName(req.file.originalname),
            url: `/uploads/${type}/${uniqueName}`,
            size: req.file.size
        });
    } catch (e) {
        console.error('Upload error:', e);
        res.status(500).json({ error: 'فشل رفع الملف: ' + (e.message || 'خطأ غير معروف بالخادم') });
    }
});

app.get('/api/mods', (req, res) => { res.json({ mods: db.mods }); });

app.post('/api/mods', authMiddleware, async (req, res) => {
    const { name, price, desc, isFree, category, version, mcVersion, fileName, fileUrl, iconUrl, downloadLink } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "❌ اسم المود مطلوب" });
    const newMod = {
        id: generateId(), name: String(name).slice(0, 80),
        price: parseFloat(price) || 0, desc: String(desc || 'بدون وصف').slice(0, 500),
        isFree: isFree === 'true' || isFree === true,
        category: category || 'عام', version: version || '1.0',
        mcVersion: mcVersion || '1.20+', fileName: fileName || '', fileUrl: fileUrl || '',
        iconUrl: iconUrl || '', downloadLink: downloadLink || '',
        downloads: 0, ratings: [],
        averageRating: 0, comments: [], likes: 0, likedBy: [],
        createdAt: new Date().toISOString()
    };
    db.mods.push(newMod);
    await saveDB(db);
    res.json({ success: true, mod: newMod });
});

app.delete('/api/mods/:id', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
    const id = req.params.id;
    db.mods = db.mods.filter(m => m.id !== id);
    await saveDB(db);
    res.json({ success: true });
});

app.get('/api/resourcepacks', (req, res) => { res.json({ resourcePacks: db.resourcePacks }); });

app.post('/api/resourcepacks', authMiddleware, async (req, res) => {
    const { name, price, desc, isFree, category, version, mcVersion, fileName, fileUrl, iconUrl, downloadLink } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "❌ اسم الريسورسباك مطلوب" });
    const newRP = {
        id: generateId(), name: String(name).slice(0, 80),
        price: parseFloat(price) || 0, desc: String(desc || 'بدون وصف').slice(0, 500),
        isFree: isFree === 'true' || isFree === true,
        category: category || 'عام', version: version || '1.0',
        mcVersion: mcVersion || '1.20+', fileName: fileName || '', fileUrl: fileUrl || '',
        iconUrl: iconUrl || '', downloadLink: downloadLink || '',
        downloads: 0, ratings: [],
        averageRating: 0, comments: [], likes: 0, likedBy: [],
        createdAt: new Date().toISOString()
    };
    db.resourcePacks.push(newRP);
    await saveDB(db);
    res.json({ success: true, resourcePack: newRP });
});

app.delete('/api/resourcepacks/:id', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
    const id = req.params.id;
    db.resourcePacks = db.resourcePacks.filter(r => r.id !== id);
    await saveDB(db);
    res.json({ success: true });
});

app.post('/api/mods/:id/rate', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const rating = parseInt(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "❌ التقييم يجب أن يكون بين 1 و 5" });
    const mod = db.mods.find(m => m.id === id);
    if (!mod) return res.status(404).json({ error: "المود غير موجود" });
    if (!mod.ratings) mod.ratings = [];
    const existing = mod.ratings.find(r => r.userId === req.user.id);
    if (existing) existing.rating = rating;
    else mod.ratings.push({ userId: req.user.id, rating, timestamp: new Date().toISOString() });
    const avg = mod.ratings.reduce((a, b) => a + b.rating, 0) / mod.ratings.length;
    mod.averageRating = Math.round(avg * 10) / 10;
    await saveDB(db);
    res.json({ success: true, averageRating: mod.averageRating });
});

app.post('/api/mods/:id/like', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const mod = db.mods.find(m => m.id === id);
    if (!mod) return res.status(404).json({ error: "المود غير موجود" });
    if (!mod.likedBy) mod.likedBy = [];
    const idx = mod.likedBy.indexOf(req.user.id);
    let liked;
    if (idx === -1) { mod.likedBy.push(req.user.id); liked = true; }
    else { mod.likedBy.splice(idx, 1); liked = false; }
    mod.likes = mod.likedBy.length;
    await saveDB(db);
    res.json({ success: true, likes: mod.likes, liked });
});

app.post('/api/mods/:id/comment', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "❌ اكتب تعليقاً" });
    const mod = db.mods.find(m => m.id === id);
    if (!mod) return res.status(404).json({ error: "المود غير موجود" });
    mod.comments.push({ userName: req.user.name, text: text.trim().slice(0, 300), timestamp: new Date().toISOString() });
    await saveDB(db);
    res.json({ success: true });
});

app.post('/api/resourcepacks/:id/rate', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const rating = parseInt(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "❌ التقييم يجب أن يكون بين 1 و 5" });
    const rp = db.resourcePacks.find(r => r.id === id);
    if (!rp) return res.status(404).json({ error: "الريسورسباك غير موجود" });
    if (!rp.ratings) rp.ratings = [];
    const existing = rp.ratings.find(r => r.userId === req.user.id);
    if (existing) existing.rating = rating;
    else rp.ratings.push({ userId: req.user.id, rating, timestamp: new Date().toISOString() });
    const avg = rp.ratings.reduce((a, b) => a + b.rating, 0) / rp.ratings.length;
    rp.averageRating = Math.round(avg * 10) / 10;
    await saveDB(db);
    res.json({ success: true, averageRating: rp.averageRating });
});

app.post('/api/resourcepacks/:id/like', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const rp = db.resourcePacks.find(r => r.id === id);
    if (!rp) return res.status(404).json({ error: "الريسورسباك غير موجود" });
    if (!rp.likedBy) rp.likedBy = [];
    const idx = rp.likedBy.indexOf(req.user.id);
    let liked;
    if (idx === -1) { rp.likedBy.push(req.user.id); liked = true; }
    else { rp.likedBy.splice(idx, 1); liked = false; }
    rp.likes = rp.likedBy.length;
    await saveDB(db);
    res.json({ success: true, likes: rp.likes, liked });
});

app.post('/api/resourcepacks/:id/comment', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "❌ اكتب تعليقاً" });
    const rp = db.resourcePacks.find(r => r.id === id);
    if (!rp) return res.status(404).json({ error: "الريسورسباك غير موجود" });
    rp.comments.push({ userName: req.user.name, text: text.trim().slice(0, 300), timestamp: new Date().toISOString() });
    await saveDB(db);
    res.json({ success: true });
});

app.get('/api/download-free/:id', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const mod = db.mods.find(m => m.id === id);
    if (!mod) return res.status(404).json({ error: "المود غير موجود" });
    if (!mod.isFree) return res.status(403).json({ error: "هذا المود مدفوع" });
    mod.downloads = (mod.downloads || 0) + 1;
    db.totalDownloads = (db.totalDownloads || 0) + 1;
    await saveDB(db);
    res.json({ success: true, message: "تم التحميل", fileName: mod.fileName, url: mod.fileUrl || null });
});

app.get('/api/download-rp-free/:id', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const rp = db.resourcePacks.find(r => r.id === id);
    if (!rp) return res.status(404).json({ error: "الريسورسباك غير موجود" });
    if (!rp.isFree) return res.status(403).json({ error: "هذا الريسورسباك مدفوع" });
    rp.downloads = (rp.downloads || 0) + 1;
    db.totalDownloads = (db.totalDownloads || 0) + 1;
    await saveDB(db);
    res.json({ success: true, message: "تم التحميل", fileName: rp.fileName, url: rp.fileUrl || null });
});

app.get('/api/ideas', (req, res) => { res.json({ ideas: db.ideas }); });

app.post('/api/ideas', authMiddleware, async (req, res) => {
    const { title, description, category } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: "❌ أدخل عنوان الفكرة" });
    db.ideas.push({
        id: generateId(), title: title.trim(),
        description: (description || '').trim(), category: category || 'عام',
        votedBy: [], votes: 0, status: 'pending', createdAt: new Date().toISOString()
    });
    await saveDB(db);
    res.json({ success: true });
});

app.post('/api/ideas/:id/vote', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const idea = db.ideas.find(i => i.id === id);
    if (!idea) return res.status(404).json({ error: "الفكرة غير موجودة" });
    if (!idea.votedBy) idea.votedBy = [];
    if (idea.votedBy.includes(req.user.id)) return res.status(400).json({ error: "لقد صوّتّ لهذه الفكرة مسبقاً" });
    idea.votedBy.push(req.user.id);
    idea.votes = idea.votedBy.length;
    await saveDB(db);
    res.json({ success: true, votes: idea.votes });
});

app.put('/api/ideas/:id/status', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
    const idea = db.ideas.find(i => i.id === req.params.id);
    if (!idea) return res.status(404).json({ error: "الفكرة غير موجودة" });
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    idea.status = status;
    await saveDB(db);
    res.json({ success: true });
});

app.get('/api/users', authMiddleware, (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
    res.json({ users: db.users.map(u => ({
        id: u.id, name: u.name, email: u.email,
        isAdmin: u.isAdmin, banned: u.banned,
        banReason: u.banReason, banExpiry: u.banExpiry, banPermanent: u.banPermanent
    })) });
});

app.put('/api/users/:id/ban', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
    const id = parseInt(req.params.id);
    const user = db.users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    if (user.isAdmin) return res.status(403).json({ error: "لا يمكن حظر الأدمن" });

    const { banned, banReason, banExpiry, banPermanent } = req.body;
    user.banned = !!banned;
    if (user.banned) {
        user.banReason = banReason || "تم الحظر من قبل الإدارة";
        user.banPermanent = !!banPermanent;
        user.banExpiry = user.banPermanent ? null : (banExpiry || null);
    } else {
        user.banReason = null;
        user.banExpiry = null;
        user.banPermanent = false;
    }
    await saveDB(db);
    res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
    res.json({
        users: db.users.length,
        mods: db.mods.length,
        resourcePacks: db.resourcePacks.length,
        ideas: db.ideas.length,
        downloads: db.totalDownloads || 0,
        visitors: db.visitors || 0,
        storageMode: HAS_BLOB ? 'blob' : 'local'
    });
});

app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'حدث خطأ ما!' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(HAS_BLOB ? '💾 Persistent storage: Vercel Blob (production-ready)' : '⚠️  Persistent storage: local filesystem (dev only, add BLOB_READ_WRITE_TOKEN for production)');
});

module.exports = app;