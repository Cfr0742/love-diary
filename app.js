// ==========================
// Gitee 云端同步配置
// ==========================

const GITEE_TOKEN = "7f5d25c730457bcb5d8f2349dd7d7294";
const GITEE_REPO = "love-diary";
const GITEE_FILE = "data.json";
const GITEE_BRANCH = "master";
let giteeUser = null;
let syncStatus = "idle";
let syncTimer = null;
let lastError = "";

function base64Encode(str) {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
    return btoa(binString);
}

async function getGiteeUser() {
    if (giteeUser) return giteeUser;
    try {
        const res = await fetch("https://gitee.com/api/v5/user", {
            headers: { "Authorization": `token ${GITEE_TOKEN}` }
        });
        if (res.ok) {
            const user = await res.json();
            giteeUser = user.login;
            return giteeUser;
        }
    } catch (e) {
        console.error("获取Gitee用户信息失败", e);
    }
    return null;
}

async function loadFromCloud() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("d")) return false;
    const user = await getGiteeUser();
    if (!user) return false;
    try {
        const rawUrl = `https://gitee.com/${user}/${GITEE_REPO}/raw/${GITEE_BRANCH}/${GITEE_FILE}?t=${Date.now()}`;
        const res = await fetch(rawUrl, { cache: "no-cache" });
        if (res.ok) {
            const text = await res.text();
            if (!text.trim() || text.trim() === "{}") return false;
            const cloudData = JSON.parse(text);
            Object.assign(data, cloudData);
            localStorage.setItem("loveDataV2", JSON.stringify(data));
            return true;
        }
    } catch (e) {
        console.error("从云端加载失败", e);
    }
    return false;
}

async function saveToCloud() {
    const user = await getGiteeUser();
    if (!user) {
        lastError = "无法获取用户信息";
        syncStatus = "error";
        showSyncStatus();
        return;
    }
    syncStatus = "syncing";
    showSyncStatus();
    try {
        const content = base64Encode(JSON.stringify(data));
        let sha = null;
        const getRes = await fetch(`https://gitee.com/api/v5/repos/${user}/${GITEE_REPO}/contents/${GITEE_FILE}?ref=${GITEE_BRANCH}`, {
            headers: { "Authorization": `token ${GITEE_TOKEN}` }
        });
        if (getRes.ok) {
            const fileInfo = await getRes.json();
            sha = fileInfo.sha;
        } else if (getRes.status !== 404) {
            lastError = `获取文件信息失败(${getRes.status})`;
        }

        const body = { message: "update love data", content: content, branch: GITEE_BRANCH };
        if (sha) body.sha = sha;

        const putRes = await fetch(`https://gitee.com/api/v5/repos/${user}/${GITEE_REPO}/contents/${GITEE_FILE}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `token ${GITEE_TOKEN}`
            },
            body: JSON.stringify(body)
        });
        if (putRes.ok) {
            syncStatus = "success";
            lastError = "";
        } else {
            const errText = await putRes.text();
            lastError = `保存失败(${putRes.status})`;
            console.error("保存到云端失败", putRes.status, errText);
            syncStatus = "error";
        }
    } catch (e) {
        lastError = "网络请求出错";
        console.error("保存到云端出错", e);
        syncStatus = "error";
    }
    showSyncStatus();
    if (syncStatus === "success") {
        setTimeout(() => { syncStatus = "idle"; showSyncStatus(); }, 3000);
    }
}

function showSyncStatus() {
    let el = document.getElementById("sync-status");
    if (!el) {
        el = document.createElement("div");
        el.id = "sync-status";
        el.style.cssText = "position:fixed;bottom:10px;right:10px;padding:6px 12px;border-radius:20px;font-size:12px;z-index:9999;transition:all 0.3s;pointer-events:none;";
        document.body.appendChild(el);
    }
    const map = {
        idle: { text: "☁️ 云端同步就绪", color: "#666", bg: "rgba(0,0,0,0.05)" },
        syncing: { text: "🔄 正在同步...", color: "#0066cc", bg: "rgba(0,102,204,0.1)" },
        success: { text: "✅ 已同步到云端", color: "#009900", bg: "rgba(0,153,0,0.1)" },
        error: { text: "❌ 同步失败，已存本地", color: "#cc0000", bg: "rgba(204,0,0,0.1)" }
    };
    const s = map[syncStatus] || map.idle;
    el.textContent = s.text;
    el.style.color = s.color;
    el.style.background = s.bg;
}

// ==========================
// 数据管理
// ==========================

let data = loadData();
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let animationId = null;

function loadData() {
    const urlParams = new URLSearchParams(window.location.search);
    const shared = urlParams.get("d");
    if (shared) {
        try {
            const json = decodeURIComponent(atob(shared));
            return JSON.parse(json);
        } catch (e) {
            console.error("分享数据解析失败", e);
        }
    }
    const local = localStorage.getItem("loveDataV2");
    if (local) {
        try {
            return JSON.parse(local);
        } catch (e) {
            console.error("本地数据解析失败", e);
        }
    }
    return {
        coverTitle: "💕 我们的纪念册",
        mainTitle: "💕 我们的纪念册",
        openingWords: "这是我们的故事，从此刻开始记录...",
        password: "",
        startDate: "2024-01-01",
        anniversaries: [],
        dailies: [],
        photos: [],
        messages: [],
        musicUrl: ""
    };
}

function saveData() {
    localStorage.setItem("loveDataV2", JSON.stringify(data));
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => saveToCloud(), 1200);
}

function generateShareLink() {
    const json = JSON.stringify(data);
    const encoded = btoa(encodeURIComponent(json));
    const url = `${window.location.origin}${window.location.pathname}?d=${encoded}`;
    document.getElementById("share-link").value = url;
    navigator.clipboard.writeText(url).then(() => {
        alert("链接已复制！快去发给TA吧 💕");
    }).catch(() => {
        alert("链接已生成，请手动复制输入框里的链接");
    });
}

// ==========================
// 页面路由
// ==========================

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'cover-screen') {
        startHeartAnimation();
    } else {
        stopHeartAnimation();
    }
}

function enterMain() {
    data.coverTitle = document.getElementById('cover-title').innerText;
    saveData();
    if (data.password) {
        showScreen('password-screen');
    } else {
        showScreen('main-screen');
        initMain();
    }
}

function checkPassword() {
    const input = document.getElementById('password-input').value;
    if (input === data.password) {
        showScreen('main-screen');
        initMain();
    } else {
        alert('密码不对哦~再想想？');
    }
}

// ==========================
// 主页面初始化
// ==========================

function initMain() {
    document.getElementById('main-title').innerText = data.mainTitle;
    document.getElementById('opening-words').innerText = data.openingWords;
    document.getElementById('start-date').value = data.startDate;
    document.getElementById('set-password').value = data.password;
    document.getElementById('music-url').value = data.musicUrl;

    updateTogetherDays();
    renderAnniversaries();
    renderDailies();
    renderPhotos();
    renderMessages();
    renderCalendar();
    setupMusic();

    // 可编辑元素监听
    document.getElementById('main-title').addEventListener('blur', () => {
        data.mainTitle = document.getElementById('main-title').innerText;
        saveData();
    });
    document.getElementById('opening-words').addEventListener('blur', () => {
        data.openingWords = document.getElementById('opening-words').innerText;
        saveData();
    });

    // 设置日期默认值
    document.getElementById('anni-date').valueAsDate = new Date();
    document.getElementById('daily-date').valueAsDate = new Date();
}

// ==========================
// 爱心粒子动画系统
// ==========================

// ==========================
// 李峋同款爱心动画系统
// ==========================

class LiXunHeart {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        this.heartColor = '#ff4d6d';
        this.generateFrame = 20;
        this.allPoints = {};
        this.points = new Set();
        this.edgeDiffusion = new Set();
        this.centerDiffusion = new Set();
        this.build(2000);
        for (let f = 0; f < this.generateFrame; f++) {
            this.calc(f);
        }
        this.running = true;
        this.frame = 0;
        this.drawLoop();
        window.addEventListener('resize', () => {
            this.resize();
            this.points.clear();
            this.edgeDiffusion.clear();
            this.centerDiffusion.clear();
            this.build(2000);
            for (let f = 0; f < this.generateFrame; f++) {
                this.calc(f);
            }
        });
    }

    resize() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.enlarge = Math.min(this.canvas.width, this.canvas.height) / 55;
    }

    heartFunction(t, shrinkRatio = this.enlarge) {
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        return {
            x: Math.round(x * shrinkRatio + this.centerX),
            y: Math.round(y * shrinkRatio + this.centerY)
        };
    }

    scatterInside(x, y, beta = 0.15) {
        const ratioX = -beta * Math.log(Math.random());
        const ratioY = -beta * Math.log(Math.random());
        const dx = ratioX * (x - this.centerX);
        const dy = ratioY * (y - this.centerY);
        return { x: x - dx, y: y - dy };
    }

    shrink(x, y, ratio) {
        const force = -1 / Math.pow(Math.pow(x - this.centerX, 2) + Math.pow(y - this.centerY, 2), 0.3);
        const dx = ratio * force * (x - this.centerX);
        const dy = ratio * force * (y - this.centerY);
        return { x: x - dx, y: y - dy };
    }

    curve(p) {
        return 2 * (0.2 * Math.sin(p)) / (0.5 * Math.PI) + 1;
    }

    calcPosition(x, y, ratio) {
        const force = 1 / Math.pow(Math.pow(x - this.centerX, 2) + Math.pow(y - this.centerY, 2), 0.260);
        const dx = ratio * force * (x - this.centerX) + (Math.random() - 0.5) * 2;
        const dy = ratio * force * (y - this.centerY) + (Math.random() - 0.5) * 2;
        return { x: x - dx, y: y - dy };
    }

    build(number) {
        for (let i = 0; i < number; i++) {
            const t = Math.random() * Math.PI * 2;
            const p = this.heartFunction(t);
            this.points.add(`${p.x},${p.y}`);
        }
        const pointList = Array.from(this.points).map(s => {
            const [x, y] = s.split(',').map(Number);
            return { x, y };
        });
        pointList.forEach(({ x, y }) => {
            for (let i = 0; i < 3; i++) {
                const sp = this.scatterInside(x, y, 0.05);
                this.edgeDiffusion.add(`${Math.round(sp.x)},${Math.round(sp.y)}`);
            }
        });
        // 多层内部填充，让爱心内部饱满不空
        const fillLayers = [0.12, 0.28, 0.45, 0.62, 0.78];
        fillLayers.forEach(beta => {
            for (let i = 0; i < 5000; i++) {
                const { x, y } = pointList[Math.floor(Math.random() * pointList.length)];
                const sp = this.scatterInside(x, y, beta);
                this.centerDiffusion.add(`${Math.round(sp.x)},${Math.round(sp.y)}`);
            }
        });
    }

    calc(frame) {
        const ratio = 10 * this.curve(frame / 10 * Math.PI);
        const haloRadius = Math.floor(4 + 6 * (1 + this.curve(frame / 10 * Math.PI)));
        const haloNumber = Math.floor(3000 + 4000 * Math.abs(this.curve(frame / 10 * Math.PI)));
        const allPoints = [];

        // 光晕
        const haloSet = new Set();
        for (let i = 0; i < haloNumber; i++) {
            const t = Math.random() * Math.PI * 2;
            let { x, y } = this.heartFunction(t, this.enlarge * 1.05);
            const s = this.shrink(x, y, haloRadius);
            x = Math.round(s.x); y = Math.round(s.y);
            const key = `${x},${y}`;
            if (!haloSet.has(key)) {
                haloSet.add(key);
                x += Math.floor(Math.random() * 29) - 14;
                y += Math.floor(Math.random() * 29) - 14;
                const size = Math.random() < 0.5 ? 1 : 2;
                allPoints.push({ x, y, size });
            }
        }

        const plist = Array.from(this.points).map(s => {
            const [x, y] = s.split(',').map(Number);
            return { x, y };
        });

        // 轮廓
        plist.forEach(({ x, y }) => {
            const pos = this.calcPosition(x, y, ratio);
            allPoints.push({ x: Math.round(pos.x), y: Math.round(pos.y), size: Math.floor(Math.random() * 3) + 1 });
        });

        // 边缘扩散
        Array.from(this.edgeDiffusion).forEach(s => {
            const [x, y] = s.split(',').map(Number);
            const pos = this.calcPosition(x, y, ratio);
            allPoints.push({ x: Math.round(pos.x), y: Math.round(pos.y), size: Math.floor(Math.random() * 2) + 1 });
        });

        // 中心扩散
        Array.from(this.centerDiffusion).forEach(s => {
            const [x, y] = s.split(',').map(Number);
            const pos = this.calcPosition(x, y, ratio);
            allPoints.push({ x: Math.round(pos.x), y: Math.round(pos.y), size: Math.floor(Math.random() * 2) + 1 });
        });

        this.allPoints[frame] = allPoints;
    }

    drawFrame() {
        if (!this.running) return;
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        const points = this.allPoints[this.frame % this.generateFrame] || [];
        this.ctx.fillStyle = this.heartColor;
        points.forEach(p => {
            this.ctx.fillRect(p.x, p.y, p.size, p.size);
        });
        this.frame++;
        setTimeout(() => this.drawFrame(), 160);
    }

    drawLoop() {
        this.drawFrame();
    }

    destroy() {
        this.running = false;
    }
}

let heartSystem = null;
function startHeartAnimation() {
    const canvas = document.getElementById('heart-canvas');
    if (canvas && !heartSystem) {
        heartSystem = new LiXunHeart(canvas);
    }
}
function stopHeartAnimation() {
    if (heartSystem) {
        heartSystem.destroy();
        heartSystem = null;
    }
}

// ==========================
// 在一起天数
// ==========================

function updateTogetherDays() {
    const start = new Date(data.startDate);
    const now = new Date();
    const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    document.getElementById("together-days").textContent = diff;
}

function updateStartDate() {
    data.startDate = document.getElementById('start-date').value;
    saveData();
    updateTogetherDays();
}

// ==========================
// 纪念日
// ==========================

function addAnniversary() {
    const name = document.getElementById('anni-name').value.trim();
    const date = document.getElementById('anni-date').value;
    if (!name || !date) { alert('请填写完整哦~'); return; }
    data.anniversaries.push({ id: Date.now().toString(), name, date });
    saveData();
    document.getElementById('anni-name').value = '';
    renderAnniversaries();
}

function deleteAnniversary(id) {
    if (!confirm('确定删除吗？')) return;
    data.anniversaries = data.anniversaries.filter(a => a.id !== id);
    saveData();
    renderAnniversaries();
    renderCalendar();
}

function renderAnniversaries() {
    const list = document.getElementById('anniversary-list');
    list.innerHTML = '';
    if (data.anniversaries.length === 0) {
        list.innerHTML = '<div class="empty-state">还没有纪念日，快去添加第一个吧 💕</div>';
        return;
    }
    data.anniversaries.sort((a, b) => new Date(a.date) - new Date(b.date));
    data.anniversaries.forEach(anni => {
        const today = new Date(); today.setHours(0,0,0,0);
        const ad = new Date(anni.date); ad.setHours(0,0,0,0);
        let diff = Math.ceil((ad - today) / 86400000);
        let label = '', display = diff;
        if (diff === 0) { label = '就是今天！🎉'; display = '🎉'; }
        else if (diff < 0) {
            const ny = new Date(ad); ny.setFullYear(today.getFullYear());
            if (ny < today) ny.setFullYear(today.getFullYear() + 1);
            diff = Math.ceil((ny - today) / 86400000);
            display = diff; label = '还有';
        } else { label = '还有'; }

        const div = document.createElement('div');
        div.className = 'card-item';
        div.innerHTML = `
            <div class="card-item-info"><h3>${anni.name}</h3><p>${anni.date}</p></div>
            <div class="card-item-meta"><div class="days">${display}</div><div class="label">${diff === 0 ? '就是今天' : label + '天'}</div></div>
            <button class="delete-btn" onclick="deleteAnniversary('${anni.id}')">删除</button>`;
        list.appendChild(div);
    });
}

// ==========================
// 日常记录
// ==========================

function addDaily() {
    const date = document.getElementById('daily-date').value;
    const content = document.getElementById('daily-content').value.trim();
    const mood = document.getElementById('daily-mood').value;
    if (!date || !content) { alert('请填写完整哦~'); return; }
    data.dailies.push({ id: Date.now().toString(), date, content, mood });
    saveData();
    document.getElementById('daily-content').value = '';
    renderDailies();
    renderCalendar();
}

function deleteDaily(id) {
    if (!confirm('确定删除吗？')) return;
    data.dailies = data.dailies.filter(d => d.id !== id);
    saveData();
    renderDailies();
    renderCalendar();
}

function renderDailies() {
    const list = document.getElementById('daily-list');
    list.innerHTML = '';
    if (data.dailies.length === 0) {
        list.innerHTML = '<div class="empty-state">还没有日常记录，快去记录第一件小事吧 📝</div>';
        return;
    }
    data.dailies.sort((a, b) => new Date(b.date) - new Date(a.date));
    data.dailies.forEach(d => {
        const div = document.createElement('div');
        div.className = 'card-item';
        div.innerHTML = `
            <div class="card-item-info">
                <div class="mood">${d.mood}</div>
                <div class="content">${d.content}</div>
                <div class="date">${d.date}</div>
            </div>
            <button class="delete-btn" onclick="deleteDaily('${d.id}')">删除</button>`;
        list.appendChild(div);
    });
}

// ==========================
// 照片墙
// ==========================

function addPhotoUrl() {
    const url = document.getElementById('photo-url').value.trim();
    if (!url) { alert('请输入图片链接'); return; }
    data.photos.push({ id: Date.now().toString(), type: 'url', src: url, date: new Date().toISOString().split('T')[0] });
    saveData();
    document.getElementById('photo-url').value = '';
    renderPhotos();
}

function uploadPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    // 限制base64数量
    const base64Count = data.photos.filter(p => p.type === 'base64').length;
    if (base64Count >= 3) {
        alert('本地图片最多存3张哦~建议用微博/小红书传图后贴链接，这样无限制！');
        input.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        data.photos.push({ id: Date.now().toString(), type: 'base64', src: e.target.result, date: new Date().toISOString().split('T')[0] });
        saveData();
        renderPhotos();
    };
    reader.readAsDataURL(file);
    input.value = '';
}

function deletePhoto(id) {
    if (!confirm('确定删除这张照片吗？')) return;
    data.photos = data.photos.filter(p => p.id !== id);
    saveData();
    renderPhotos();
}

function renderPhotos() {
    const grid = document.getElementById('photo-grid');
    grid.innerHTML = '';
    if (data.photos.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">还没有照片，快上传第一张合照吧 📷</div>';
        return;
    }
    data.photos.forEach(p => {
        const div = document.createElement('div');
        div.className = 'photo-item';
        div.innerHTML = `
            <img src="${p.src}" alt="photo" onerror="this.parentElement.style.display='none'">
            <div class="photo-caption">${p.date || ''}</div>
            <button class="photo-del" onclick="deletePhoto('${p.id}')">×</button>`;
        grid.appendChild(div);
    });
}

// ==========================
// 留言板
// ==========================

function addMessage() {
    const author = document.getElementById('msg-author').value.trim() || '匿名';
    const content = document.getElementById('msg-content').value.trim();
    if (!content) { alert('写点什么吧~'); return; }
    data.messages.push({ id: Date.now().toString(), author, content, date: new Date().toLocaleString('zh-CN') });
    saveData();
    document.getElementById('msg-content').value = '';
    renderMessages();
}

function deleteMessage(id) {
    if (!confirm('确定删除这条留言吗？')) return;
    data.messages = data.messages.filter(m => m.id !== id);
    saveData();
    renderMessages();
}

function renderMessages() {
    const list = document.getElementById('message-list');
    list.innerHTML = '';
    if (data.messages.length === 0) {
        list.innerHTML = '<div class="empty-state">还没有留言，快给TA写句悄悄话吧 💌</div>';
        return;
    }
    data.messages.slice().reverse().forEach(m => {
        const div = document.createElement('div');
        div.className = 'card-item';
        div.innerHTML = `
            <div class="message-header"><span class="message-author">${m.author}</span><span class="message-date">${m.date}</span></div>
            <div class="message-content">${m.content}</div>
            <button class="delete-btn" style="align-self:flex-end;margin-top:6px;" onclick="deleteMessage('${m.id}')">删除</button>`;
        list.appendChild(div);
    });
}

// ==========================
// 日历
// ==========================

function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
}

function renderCalendar() {
    document.getElementById('calendar-title').textContent = `${currentYear}年${currentMonth + 1}月`;
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    weekdays.forEach(w => {
        const el = document.createElement('div');
        el.className = 'weekday';
        el.textContent = w;
        grid.appendChild(el);
    });

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevDays = new Date(currentYear, currentMonth, 0).getDate();

    // 上月
    for (let i = firstDay - 1; i >= 0; i--) {
        const el = document.createElement('div');
        el.className = 'day other-month';
        el.textContent = prevDays - i;
        grid.appendChild(el);
    }

    // 本月
    const today = new Date();
    const eventDates = new Set();
    data.anniversaries.forEach(a => {
        const d = new Date(a.date);
        if (d.getMonth() === currentMonth) eventDates.add(d.getDate());
    });
    data.dailies.forEach(d => {
        const dd = new Date(d.date);
        if (dd.getMonth() === currentMonth) eventDates.add(dd.getDate());
    });

    for (let d = 1; d <= daysInMonth; d++) {
        const el = document.createElement('div');
        el.className = 'day';
        if (d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
            el.classList.add('today');
        }
        if (eventDates.has(d)) {
            el.classList.add('has-event');
            el.innerHTML = `${d}<span class="dot"></span>`;
        } else {
            el.textContent = d;
        }
        grid.appendChild(el);
    }
}

// ==========================
// 密码 & 音乐
// ==========================

function updatePassword() {
    data.password = document.getElementById('set-password').value;
    saveData();
}

function updateMusic() {
    data.musicUrl = document.getElementById('music-url').value;
    saveData();
    setupMusic();
}

function setupMusic() {
    const audio = document.getElementById('bg-music');
    if (data.musicUrl) {
        audio.src = data.musicUrl;
    }
}

function toggleMusic() {
    const audio = document.getElementById('bg-music');
    if (!audio.src) { alert('请先输入音乐链接'); return; }
    if (audio.paused) {
        audio.play().catch(() => alert('音乐无法播放，请检查链接'));
        document.getElementById('music-btn').textContent = '⏸ 暂停';
    } else {
        audio.pause();
        document.getElementById('music-btn').textContent = '🎵 播放';
    }
}

// ==========================
// 启动
// ==========================

// 封面标题初始化
document.getElementById('cover-title').innerText = data.coverTitle;
document.getElementById('cover-title').addEventListener('blur', () => {
    data.coverTitle = document.getElementById('cover-title').innerText;
    saveData();
});

// 启动封面动画
startHeartAnimation();

// 异步加载云端数据
setTimeout(() => {
    loadFromCloud().then(success => {
        if (success) {
            console.log("已从云端加载数据");
            if (document.getElementById('main-screen').classList.contains('active')) {
                initMain();
            }
        }
    });
}, 500);
