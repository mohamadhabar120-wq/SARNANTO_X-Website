const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { put, list, del } = require('@vercel/blob');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// ========== Vercel Blob Helpers ==========
const BLOB_PREFIX = {
  mod: 'mods/',
  rp: 'resourcepacks/',
  image: 'images/',
  db: 'database/'
};

async function blobPut(key, data, options = {}) {
  try {
    const result = await put(key, data, {
      access: 'public',
      ...options
    });
    return result;
  } catch (e) {
    console.error('Blob put error:', e);
    throw e;
  }
}

async function blobList(prefix) {
  try {
    const result = await list({ prefix });
    return result.blobs || [];
  } catch (e) {
    console.error('Blob list error:', e);
    return [];
  }
}

async function blobDelete(url) {
  try {
    await del(url);
    return true;
  } catch (e) {
    console.error('Blob delete error:', e);
    return false;
  }
}

// ========== Database (Vercel Blob JSON) ==========
const DB_KEY = BLOB_PREFIX.db + 'database.json';

async function loadDB() {
  try {
    const blobs = await blobList(BLOB_PREFIX.db);
    const dbBlob = blobs.find(b => b.pathname === DB_KEY);
    if (dbBlob) {
      const response = await fetch(dbBlob.url);
      if (response.ok) return await response.json();
    }
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

async function saveDB(data) {
  try {
    await blobPut(DB_KEY, JSON.stringify(data, null, 2), {
      contentType: 'application/json'
    });
  } catch (e) { console.error('DB save error:', e); }
}

let db = null;

async function initDB() {
  if (!db) db = await loadDB();
  return db;
}

function generateToken() { return 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }
function generateId() { return Date.now() + '_' + Math.random().toString(36).substr(2, 9); }

// ========== Base64 File Upload Helper ==========
function base64ToBuffer(base64String) {
  const base64Data = base64String.replace(/^data:.+;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

function getExtFromMime(mimeType) {
  const map = {
    'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
    'image/gif': '.gif', 'image/webp': '.webp',
    'application/java-archive': '.jar', 'application/x-java-archive': '.jar',
    'application/zip': '.zip', 'application/x-zip-compressed': '.zip'
  };
  return map[mimeType] || '';
}

// ========== Middleware ==========
async function ensureDB(req, res, next) {
  await initDB();
  next();
}

app.use(ensureDB);

// ========== REGISTER ==========
app.post('/api/register', async (req, res) => {
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
  await saveDB(db);
  res.json({ success: true, token: generateToken(), user: { id: newUser.id, name: newUser.name, email: newUser.email, isAdmin: newUser.isAdmin } });
});

// ========== LOGIN ==========
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: "❌ البريد غير موجود" });
  if (user.banned) return res.status(403).json({ error: "🚫 الحساب محظور" });
  if (user.password !== password) return res.status(401).json({ error: "❌ كلمة مرور خاطئة" });
  db.visitors++;
  await saveDB(db);
  res.json({ success: true, token: generateToken(), user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
});

// ========== FILE UPLOAD (Base64 to Vercel Blob) ==========
app.post('/api/upload/:type', async (req, res) => {
  try {
    const type = req.params.type;
    const { fileData, fileName, mimeType } = req.body;

    if (!fileData) return res.status(400).json({ error: "No file data provided" });

    const buffer = base64ToBuffer(fileData);
    const ext = getExtFromMime(mimeType) || path.extname(fileName) || '';
    const uniqueName = Date.now() + '_' + Math.random().toString(36).substr(2, 9) + ext;
    const blobKey = BLOB_PREFIX[type] + uniqueName;

    const result = await blobPut(blobKey, buffer, {
      contentType: mimeType || 'application/octet-stream'
    });

    res.json({ 
      success: true, 
      fileName: fileName || uniqueName,
      url: result.url,
      size: buffer.length
    });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: 'Upload failed: ' + e.message });
  }
});

// ========== MODS ==========
app.get('/api/mods', async (req, res) => { res.json({ mods: db.mods }); });

app.post('/api/mods', async (req, res) => {
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
  await saveDB(db);
  res.json({ success: true, mod: newMod });
});

app.delete('/api/mods/:id', async (req, res) => {
  const id = req.params.id;
  const mod = db.mods.find(m => m.id === id);

  if (mod) {
    if (mod.images && mod.images.length > 0) {
      for (const imgUrl of mod.images) {
        await blobDelete(imgUrl);
      }
    }
    if (mod.fileName && mod.fileName.includes('blob.vercel-storage.com')) {
      await blobDelete(mod.fileName);
    }
  }

  db.mods = db.mods.filter(m => m.id !== id);
  await saveDB(db);
  res.json({ success: true });
});

// ========== RESOURCE PACKS ==========
app.get('/api/resourcepacks', async (req, res) => { res.json({ resourcePacks: db.resourcePacks }); });

app.post('/api/resourcepacks', async (req, res) => {
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
  await saveDB(db);
  res.json({ success: true, resourcePack: newRP });
});

app.delete('/api/resourcepacks/:id', async (req, res) => {
  const id = req.params.id;
  const rp = db.resourcePacks.find(r => r.id === id);

  if (rp) {
    if (rp.images && rp.images.length > 0) {
      for (const imgUrl of rp.images) {
        await blobDelete(imgUrl);
      }
    }
    if (rp.fileName && rp.fileName.includes('blob.vercel-storage.com')) {
      await blobDelete(rp.fileName);
    }
  }

  db.resourcePacks = db.resourcePacks.filter(r => r.id !== id);
  await saveDB(db);
  res.json({ success: true });
});

// ========== RATE MODS ==========
app.post('/api/mods/:id/rate', async (req, res) => {
  const id = req.params.id;
  const { rating } = req.body;
  const mod = db.mods.find(m => m.id === id);
  if (!mod) return res.status(404).json({ error: "المود غير موجود" });
  mod.ratings.push({ rating: parseInt(rating), timestamp: new Date().toISOString() });
  const avg = mod.ratings.reduce((a, b) => a + b.rating, 0) / mod.ratings.length;
  mod.averageRating = Math.round(avg * 10) / 10;
  await saveDB(db);
  res.json({ success: true, averageRating: mod.averageRating });
});

// ========== LIKE MODS ==========
app.post('/api/mods/:id/like', async (req, res) => {
  const id = req.params.id;
  const mod = db.mods.find(m => m.id === id);
  if (!mod) return res.status(404).json({ error: "المود غير موجود" });
  mod.likes = (mod.likes || 0) + 1;
  await saveDB(db);
  res.json({ success: true, likes: mod.likes });
});

// ========== COMMENTS MODS ==========
app.post('/api/mods/:id/comment', async (req, res) => {
  const id = req.params.id;
  const { text, userName } = req.body;
  const mod = db.mods.find(m => m.id === id);
  if (!mod) return res.status(404).json({ error: "المود غير موجود" });
  mod.comments.push({ userName: userName || "مستخدم", text, timestamp: new Date().toISOString() });
  await saveDB(db);
  res.json({ success: true });
});

// ========== RATE RPs ==========
app.post('/api/resourcepacks/:id/rate', async (req, res) => {
  const id = req.params.id;
  const { rating } = req.body;
  const rp = db.resourcePacks.find(r => r.id === id);
  if (!rp) return res.status(404).json({ error: "الريسورسباك غير موجود" });
  rp.ratings.push({ rating: parseInt(rating), timestamp: new Date().toISOString() });
  const avg = rp.ratings.reduce((a, b) => a + b.rating, 0) / rp.ratings.length;
  rp.averageRating = Math.round(avg * 10) / 10;
  await saveDB(db);
  res.json({ success: true, averageRating: rp.averageRating });
});

// ========== LIKE RPs ==========
app.post('/api/resourcepacks/:id/like', async (req, res) => {
  const id = req.params.id;
  const rp = db.resourcePacks.find(r => r.id === id);
  if (!rp) return res.status(404).json({ error: "الريسورسباك غير موجود" });
  rp.likes = (rp.likes || 0) + 1;
  await saveDB(db);
  res.json({ success: true, likes: rp.likes });
});

// ========== COMMENTS RPs ==========
app.post('/api/resourcepacks/:id/comment', async (req, res) => {
  const id = req.params.id;
  const { text, userName } = req.body;
  const rp = db.resourcePacks.find(r => r.id === id);
  if (!rp) return res.status(404).json({ error: "الريسورسباك غير موجود" });
  rp.comments.push({ userName: userName || "مستخدم", text, timestamp: new Date().toISOString() });
  await saveDB(db);
  res.json({ success: true });
});

// ========== DOWNLOAD MODS ==========
app.get('/api/download-free/:id', async (req, res) => {
  const id = req.params.id;
  const mod = db.mods.find(m => m.id === id);
  if (!mod) return res.status(404).json({ error: "المود غير موجود" });
  if (!mod.isFree) return res.status(403).json({ error: "هذا المود مدفوع" });
  mod.downloads++;
  db.totalDownloads++;
  await saveDB(db);
  res.json({ success: true, message: "تم التحميل", fileName: mod.fileName, downloadUrl: mod.fileUrl || mod.fileName });
});

// ========== DOWNLOAD RPs ==========
app.get('/api/download-rp-free/:id', async (req, res) => {
  const id = req.params.id;
  const rp = db.resourcePacks.find(r => r.id === id);
  if (!rp) return res.status(404).json({ error: "الريسورسباك غير موجود" });
  if (!rp.isFree) return res.status(403).json({ error: "هذا الريسورسباك مدفوع" });
  rp.downloads++;
  db.totalDownloads++;
  await saveDB(db);
  res.json({ success: true, message: "تم التحميل", fileName: rp.fileName, downloadUrl: rp.fileUrl || rp.fileName });
});

// ========== IDEAS ==========
app.get('/api/ideas', async (req, res) => { res.json({ ideas: db.ideas }); });

app.post('/api/ideas', async (req, res) => {
  const { title, description, category } = req.body;
  db.ideas.push({
    id: generateId(), title: title || 'فكرة بدون عنوان',
    description: description || '', category: category || 'عام',
    votes: 0, status: 'pending', createdAt: new Date().toISOString()
  });
  await saveDB(db);
  res.json({ success: true });
});

app.post('/api/ideas/:id/vote', async (req, res) => {
  const id = req.params.id;
  const idea = db.ideas.find(i => i.id === id);
  if (!idea) return res.status(404).json({ error: "الفكرة غير موجودة" });
  idea.votes = (idea.votes || 0) + 1;
  await saveDB(db);
  res.json({ success: true, votes: idea.votes });
});

// ========== USERS ==========
app.get('/api/users', async (req, res) => {
  res.json({ users: db.users.map(u => ({ id: u.id, name: u.name, email: u.email, isAdmin: u.isAdmin, banned: u.banned })) });
});

app.put('/api/users/:id/ban', async (req, res) => {
  const id = parseInt(req.params.id);
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
  user.banned = req.body.banned !== false;
  await saveDB(db);
  res.json({ success: true });
});

// ========== STATS ==========
app.get('/api/stats', async (req, res) => {
  res.json({ users: db.users.length, mods: db.mods.length, resourcePacks: db.resourcePacks.length, ideas: db.ideas.length, downloads: db.totalDownloads, visitors: db.visitors });
});

// ========== SERVE index.html ==========
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// ========== ERROR HANDLING ==========
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// ========== START ==========
app.listen(PORT, () => { console.log(`🚀 Server running on port ${PORT}`); });