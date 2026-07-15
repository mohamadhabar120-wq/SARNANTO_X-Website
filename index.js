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

// ========== Multer Config for File Uploads ==========
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'upload');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const upload = multer({ storage: storage });

// ========== Database ==========
const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        }
    } catch (e) { console.error('DB load error:', e); }
    return {
        users: [{
            id: 1,
            name: "Administrator",
            email: "mohamadhabar120@gmail.com",
            password: "SARNANTO_X123",
            isAdmin: true,
            banned: false,
            createdAt: "2025-06-17T00:00:00.000Z"
        }],
        mods: [],
        ideas: [],
        logs: [],
        visitors: 128,
        totalDownloads: 0
    };
}

function saveDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) { console.error('DB save error:', e); }
}

let db = loadDB();

// ========== Helpers ==========
function generateToken() {
    return 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ========== LOGIN ==========
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email);

    if (!user) {
        return res.status(401).json({ error: "❌ البريد غير موجود" });
    }
    if (user.banned) {
        return res.status(403).json({ error: "🚫 الحساب محظور" });
    }
    if (user.password !== password) {
        return res.status(401).json({ error: "❌ كلمة مرور خاطئة" });
    }

    db.visitors++;
    saveDB(db);

    res.json({
        success: true,
        token: generateToken(),
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin
        }
    });
});

// ========== MODS ==========
app.get('/api/mods', (req, res) => {
    res.json({ mods: db.mods });
});

app.post('/api/mods', upload.single('file'), (req, res) => {
    const { name, price, desc, isFree } = req.body;
    const newMod = {
        id: Date.now(),
        name: name || 'مود بدون اسم',
        price: parseFloat(price) || 0,
        desc: desc || 'بدون وصف',
        isFree: isFree === 'true' || isFree === true,
        fileName: req.file ? req.file.filename : 'mod.zip',
        filePath: req.file ? '/upload/' + req.file.filename : null,
        downloads: 0,
        ratings: [],
        averageRating: 0,
        comments: [],
        createdAt: new Date().toISOString()
    };
    db.mods.push(newMod);
    saveDB(db);
    res.json({ success: true, mod: newMod });
});

app.delete('/api/mods/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const mod = db.mods.find(m => m.id === id);
    if (mod && mod.filePath) {
        const filePath = path.join(__dirname, mod.filePath);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.mods = db.mods.filter(m => m.id !== id);
    saveDB(db);
    res.json({ success: true });
});

// ========== RATE ==========
app.post('/api/mods/:id/rate', (req, res) => {
    const id = parseInt(req.params.id);
    const { rating } = req.body;
    const mod = db.mods.find(m => m.id === id);
    if (!mod) return res.status(404).json({ error: "المود غير موجود" });

    mod.ratings.push({ rating: parseInt(rating), timestamp: new Date().toISOString() });
    const avg = mod.ratings.reduce((a, b) => a + b.rating, 0) / mod.ratings.length;
    mod.averageRating = Math.round(avg * 10) / 10;
    saveDB(db);
    res.json({ success: true, averageRating: mod.averageRating });
});

// ========== COMMENTS ==========
app.post('/api/mods/:id/comment', (req, res) => {
    const id = parseInt(req.params.id);
    const { text } = req.body;
    const mod = db.mods.find(m => m.id === id);
    if (!mod) return res.status(404).json({ error: "المود غير موجود" });

    mod.comments.push({
        userName: "مستخدم",
        text: text,
        timestamp: new Date().toISOString()
    });
    saveDB(db);
    res.json({ success: true });
});

// ========== DOWNLOAD ==========
app.get('/api/download-free/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const mod = db.mods.find(m => m.id === id);
    if (!mod) return res.status(404).json({ error: "المود غير موجود" });

    if (!mod.isFree) {
        return res.status(403).json({ error: "هذا المود مدفوع" });
    }

    mod.downloads++;
    db.totalDownloads++;
    saveDB(db);

    if (mod.filePath && fs.existsSync(path.join(__dirname, mod.filePath))) {
        res.download(path.join(__dirname, mod.filePath), mod.fileName);
    } else {
        res.json({ success: true, message: "تم التحميل" });
    }
});

// ========== IDEAS ==========
app.get('/api/ideas', (req, res) => {
    res.json({ ideas: db.ideas });
});

app.post('/api/ideas', (req, res) => {
    const { title, description } = req.body;
    db.ideas.push({
        id: Date.now(),
        title: title || 'فكرة بدون عنوان',
        description: description || '',
        createdAt: new Date().toISOString()
    });
    saveDB(db);
    res.json({ success: true });
});

// ========== USERS ==========
app.get('/api/users', (req, res) => {
    res.json({ 
        users: db.users.map(u => ({ 
            id: u.id, 
            name: u.name, 
            email: u.email, 
            isAdmin: u.isAdmin, 
            banned: u.banned 
        })) 
    });
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
    res.json({
        users: db.users.length,
        mods: db.mods.length,
        ideas: db.ideas.length,
        downloads: db.totalDownloads,
        visitors: db.visitors
    });
});

// ========== JSONBin SYNC ==========
app.get('/api/sync', (req, res) => {
    res.json(db);
});

app.post('/api/sync', (req, res) => {
    db = { ...db, ...req.body };
    saveDB(db);
    res.json({ success: true });
});

// ========== SERVE index.html ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== START ==========
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});