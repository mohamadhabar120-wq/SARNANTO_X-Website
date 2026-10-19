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
app.use(express.static(path.join(__dirname, '..')));

const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const DB_BLOB_PATH = 'db/database.json';

// إعدادات الذاكرة المؤقتة لقاعدة البيانات
let db = {
    users: [{
        id: 1, name: "Administrator", email: "mohamadhabar120@gmail.com",
        password: "SARNANTO_X123", isAdmin: true, banned: false,
        createdAt: new Date().toISOString()
    }],
    mods: [], resourcePacks: [], ideas: [], logs: [],
    visitors: 128, totalDownloads: 0
};

app.use(async (req, res, next) => {
    // ملاحظة: التخزين الفعلي يحتاج Blob، لكن للاختبار سنستخدم الذاكرة
    next();
});

function generateToken() { return 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }
function generateId() { return Date.now() + '_' + Math.random().toString(36).substr(2, 9); }

function authMiddleware(req, res, next) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const user = db.users.find(u => u.token === token);
    if (!user) return res.status(401).json({ error: "Invalid token" });
    req.user = user;
    next();
}

// --- Routes ---

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: "❌ البريد غير موجود" });
    if (user.password !== password) return res.status(401).json({ error: "❌ كلمة مرور خاطئة" });

    const tok = generateToken();
    user.token = tok;
    res.json({
        success: true, token: tok,
        user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin }
    });
});

app.get('/api/me', (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.json({ user: null });
    const user = db.users.find(u => u.token === token);
    if (!user) return res.json({ user: null });
    res.json({ user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
});

app.get('/api/stats', (req, res) => {
    res.json({
        users: db.users.length, mods: db.mods.length,
        resourcePacks: db.resourcePacks.length, ideas: db.ideas.length,
        downloads: db.totalDownloads || 0, visitors: db.visitors || 0
    });
});

app.get('/api/mods', (req, res) => { res.json({ mods: db.mods }); });

app.post('/api/mods', authMiddleware, async (req, res) => {
    const { name, desc, iconUrl, downloadLink } = req.body;
    if (!name) return res.status(400).json({ error: "اسم المود مطلوب" });
    const newMod = {
        id: generateId(), name, desc, iconUrl, downloadLink,
        isFree: true, downloads: 0, createdAt: new Date().toISOString()
    };
    db.mods.push(newMod);
    res.json({ success: true, mod: newMod });
});

app.delete('/api/mods/:id', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
    db.mods = db.mods.filter(m => m.id !== req.params.id);
    res.json({ success: true });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'حدث خطأ ما!' });
});

module.exports = app;
