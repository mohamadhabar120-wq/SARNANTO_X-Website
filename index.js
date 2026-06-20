const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ========== قاعدة بيانات بسيطة ==========
let users = [
    {
        id: 1,
        name: "Administrator",
        email: "mohamadhabar120@gmail.com",
        password: "admin123",
        isAdmin: true,
        banned: false
    }
];

let mods = [];

// ===== تسجيل الدخول =====
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);
    
    if (!user) {
        return res.status(401).json({ error: "البريد غير موجود" });
    }
    if (user.banned) {
        return res.status(403).json({ error: "الحساب محظور" });
    }
    if (user.password !== password) {
        return res.status(401).json({ error: "كلمة مرور خاطئة" });
    }
    
    res.json({
        success: true,
        token: "fake_token_" + Date.now(),
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin
        }
    });
});

// ===== المودات =====
app.get('/api/mods', (req, res) => {
    res.json({ mods: mods });
});

// ===== المستخدمين =====
app.get('/api/users', (req, res) => {
    res.json({ users: users.map(u => ({ id: u.id, name: u.name, email: u.email, isAdmin: u.isAdmin, banned: u.banned })) });
});

// ===== تشغيل الخادم =====
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Directory: ${__dirname}`);
});