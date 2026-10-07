// ==========================
// Gitee 云端同步配置
// ==========================

const GITEE_TOKEN = "7f5d25c730457bcb5d8f2349dd7d7294";
const GITEE_REPO = "love-diary";
const GITEE_FILE = "data.json";
const GITEE_BRANCH = "master";
let giteeUser = "cfr0742";
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
    const user = giteeUser || await getGiteeUser();
    if (!user) {
        showDebugError("加载失败: 无法获取用户名");
        return false;
    }
    try {
        const apiUrl = `https://gitee.com/api/v5/repos/${user}/${GITEE_REPO}/contents/${GITEE_FILE}?ref=${GITEE_BRANCH}&t=${Date.now()}`;
        const res = await fetch(apiUrl, {
            headers: { "Authorization": `token ${GITEE_TOKEN}` }
        });
        if (!res.ok) {
            showDebugError(`加载失败: HTTP ${res.status} - ${await res.text()}`);
            return false;
        }
        const fileInfo = await res.json();
        if (!fileInfo.content) {
            showDebugError("加载失败: 云端内容为空");
            return false;
        }
        const cleanContent = fileInfo.content.replace(/\n/g, "");
        const binString = atob(cleanContent);
        const bytes = Uint8Array.from(binString, c => c.charCodeAt(0));
        const text = new TextDecoder().decode(bytes);
        if (!text.trim() || text.trim() === "{}") {
            showDebugError("加载提示: 云端数据为空对象");
            return false;
        }
        const cloudData = JSON.parse(text);
        Object.assign(data, cloudData);
        localStorage.setItem("loveDataV2", JSON.stringify(data));
        showDebugError("✅ 已从云端加载数据！", true);
        return true;
    } catch (e) {
        showDebugError(`加载失败: ${e.name}: ${e.message}`);
        console.error("从云端加载失败", e);
    }
    return false;
}

function showDebugError(msg, isSuccess) {
    let el = document.getElementById("debug-error");
    if (!el) {
        el = document.createElement("div");
        el.id = "debug-error";
        el.style.cssText = "position:fixed;top:10px;left:10px;right:10px;padding:12px;border-radius:8px;font-size:14px;z-index:10000;background:rgba(255,0,0,0.9);color:white;word-break:break-all;";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = isSuccess ? "rgba(0,128,0,0.9)" : "rgba(200,0,0,0.9)";
    if (isSuccess) {
        setTimeout(() => { if (el) el.remove(); }, 5000);
    }
}

async function saveToCloud() {
    const user = giteeUser || await getGiteeUser();
    if (!user) {
        lastError = "无法获取用户信息";
        syncStatus = "error";
        showSyncStatus();
        showDebugError("保存失败: 无法获取用户名");
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

        // Gitee 更新文件需要 PUT + form-urlencoded + access_token 在 URL 中
        const formData = new URLSearchParams();
        formData.append("message", "update love data");
        formData.append("content", content);
        formData.append("branch", GITEE_BRANCH);
        if (sha) formData.append("sha", sha);

        const putRes = await fetch(`https://gitee.com/api/v5/repos/${user}/${GITEE_REPO}/contents/${GITEE_FILE}?access_token=${GITEE_TOKEN}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: formData.toString()
        });
        if (putRes.ok) {
            syncStatus = "success";
            lastError = "";
            showDebugError("✅ 已同步到云端！", true);
        } else {
            const errText = await putRes.text();
            lastError = `保存失败(${putRes.status})`;
            showDebugError(`保存失败: ${errText}`);
            console.error("保存到云端失败", putRes.status, errText);
            syncStatus = "error";
        }
    } catch (e) {
        lastError = "网络请求出错";
        showDebugError(`保存出错: ${e.message}`);
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
// 内置歌单
// ==========================

const defaultPlaylist = [
    { name: "小幸运", artist: "田馥甄", url: "https://music.163.com/song/media/outer/url?id=409654891.mp3" },
    { name: "告白气球", artist: "周杰伦", url: "https://music.163.com/song/media/outer/url?id=418603077.mp3" },
    { name: "慢慢喜欢你", artist: "莫文蔚", url: "https://music.163.com/song/media/outer/url?id=1297742298.mp3" },
    { name: "遇见", artist: "孙燕姿", url: "https://music.163.com/song/media/outer/url?id=287017.mp3" },
    { name: "简单爱", artist: "周杰伦", url: "https://music.163.com/song/media/outer/url?id=185800.mp3" }
];

let playlist = [];
let audioPlayer = null;
let musicTimer = null;

function initPlaylist() {
    playlist = [...defaultPlaylist];
    if (data.music && data.music.customSongs) {
        playlist = playlist.concat(data.music.customSongs);
    }
    if (data.music && data.music.localSongs) {
        playlist = playlist.concat(data.music.localSongs);
    }
}

function renderPlaylist() {
    const el = document.getElementById('playlist');
    if (!el) return;
    el.innerHTML = '';
    playlist.forEach((song, idx) => {
        const div = document.createElement('div');
        div.className = 'playlist-item' + (idx === data.music.currentSongIndex ? ' active' : '');
        div.innerHTML = `<span>${song.name} - ${song.artist}</span><span>${idx === data.music.currentSongIndex && data.music.isPlaying ? '▶' : ''}</span>`;
        div.onclick = () => playSong(idx);
        el.appendChild(div);
    });
}

function playSong(idx) {
    if (!audioPlayer) {
        audioPlayer = new Audio();
        audioPlayer.addEventListener('ended', () => nextSong());
        audioPlayer.addEventListener('timeupdate', updateProgress);
    }
    if (idx < 0 || idx >= playlist.length) return;
    data.music.currentSongIndex = idx;
    data.music.isPlaying = true;
    audioPlayer.src = playlist[idx].url;
    audioPlayer.volume = data.music.isMuted ? 0 : (data.music.volume / 100);
    audioPlayer.currentTime = data.music.currentTime || 0;
    audioPlayer.onerror = () => {
        showDebugError('❌ 该音乐链接失效，请换一首或上传本地音频');
        data.music.isPlaying = false;
        updateMusicUI();
    };
    audioPlayer.play().catch(() => showDebugError('音乐播放失败，请检查链接'));
    updateMusicUI();
    saveData();
    renderPlaylist();
}

function togglePlay() {
    if (!audioPlayer) { playSong(data.music.currentSongIndex >= 0 ? data.music.currentSongIndex : 0); return; }
    if (data.music.isPlaying) {
        audioPlayer.pause();
        data.music.isPlaying = false;
    } else {
        if (!audioPlayer.src && playlist.length > 0) { playSong(0); return; }
        audioPlayer.play().catch(() => {});
        data.music.isPlaying = true;
    }
    updateMusicUI();
    saveData();
    renderPlaylist();
}

function nextSong() {
    let idx = data.music.currentSongIndex + 1;
    if (idx >= playlist.length) idx = 0;
    playSong(idx);
}

function prevSong() {
    let idx = data.music.currentSongIndex - 1;
    if (idx < 0) idx = playlist.length - 1;
    playSong(idx);
}

function setVolume(val) {
    data.music.volume = parseInt(val);
    if (audioPlayer) audioPlayer.volume = data.music.isMuted ? 0 : (data.music.volume / 100);
    saveData();
}

function toggleMute() {
    data.music.isMuted = !data.music.isMuted;
    if (audioPlayer) audioPlayer.volume = data.music.isMuted ? 0 : (data.music.volume / 100);
    updateMusicUI();
    saveData();
}

function updateProgress() {
    if (!audioPlayer) return;
    const cur = formatTime(audioPlayer.currentTime);
    const tot = formatTime(audioPlayer.duration || 0);
    document.getElementById('current-time').textContent = cur;
    document.getElementById('total-time').textContent = tot;
    document.getElementById('progress').value = audioPlayer.duration ? (audioPlayer.currentTime / audioPlayer.duration * 100) : 0;
    data.music.currentTime = audioPlayer.currentTime;
}

function seekMusic(val) {
    if (!audioPlayer || !audioPlayer.duration) return;
    audioPlayer.currentTime = audioPlayer.duration * (val / 100);
}

function formatTime(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

function updateMusicUI() {
    const idx = data.music.currentSongIndex;
    const song = idx >= 0 && idx < playlist.length ? playlist[idx] : null;
    document.getElementById('now-song-name').textContent = song ? song.name : '选择一首歌';
    document.getElementById('now-song-artist').textContent = song ? song.artist : '-';
    document.getElementById('play-btn').textContent = data.music.isPlaying ? '⏸' : '▶️';
    document.getElementById('mute-btn').textContent = data.music.isMuted ? '🔇' : '🔊';
    const vinyl = document.getElementById('vinyl');
    if (vinyl) vinyl.style.animationPlayState = data.music.isPlaying ? 'running' : 'paused';
}

function addCustomSong() {
    const url = document.getElementById('custom-song-url').value.trim();
    const name = document.getElementById('custom-song-name').value.trim() || '自定义歌曲';
    if (!url) { alert('请输入音乐链接'); return; }
    if (!data.music.customSongs) data.music.customSongs = [];
    data.music.customSongs.push({ name, artist: '未知', url });
    saveData();
    initPlaylist();
    renderPlaylist();
    document.getElementById('custom-song-url').value = '';
    document.getElementById('custom-song-name').value = '';
}

async function uploadLocalSong(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        alert('文件太大啦（超过2MB），请剪辑到1分钟以内，或上传外部链接');
        input.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        const base64 = reader.result;
        if (!data.music.localSongs) data.music.localSongs = [];
        data.music.localSongs.push({
            name: file.name.replace(/\.[^/.]+$/, ''),
            artist: '本地音乐',
            url: base64,
            isLocal: true
        });
        saveData();
        initPlaylist();
        renderPlaylist();
        showDebugError('✅ 本地音频已添加！', true);
        input.value = '';
    };
    reader.readAsDataURL(file);
}

function checkPartnerListening() {
    const el = document.getElementById('ta-listening');
    if (!el || !data.music || data.music.currentSongIndex < 0) { if (el) el.textContent = ''; return; }
    // 如果对方正在播放，显示提示（通过云端同步的数据判断）
    const song = playlist[data.music.currentSongIndex];
    if (song && data.music.isPlaying) {
        el.textContent = `💕 正在听《${song.name}》`;
    } else if (song) {
        el.textContent = `💿 上次听到《${song.name}》`;
    } else {
        el.textContent = '';
    }
}

// ==========================
// 主题切换
// ==========================

function switchTheme(theme) {
    data.theme = theme;
    document.body.className = 'theme-' + theme;
    saveData();
}

// ==========================
// 导出/导入
// ==========================

function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `love-diary-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showDebugError('✅ 数据已导出！', true);
}

function importData(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const imported = JSON.parse(e.target.result);
            Object.assign(data, imported);
            localStorage.setItem('loveDataV2', JSON.stringify(data));
            saveToCloud();
            alert('数据恢复成功！页面即将刷新');
            location.reload();
        } catch (err) {
            alert('文件格式错误，无法恢复');
        }
    };
    reader.readAsText(file);
    input.value = '';
}

// ==========================
// 在线状态
// ==========================

function updateOnlineStatus() {
    data.lastActive = Date.now();
    saveData();
    const el = document.getElementById('online-status');
    if (!el) return;
    if (!data.lastActive) { el.textContent = ''; return; }
    const diff = Date.now() - new Date(data.lastActive).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 5) {
        el.textContent = '💕 对方正在看纪念册';
        el.style.color = '#4caf50';
    } else if (mins < 60) {
        el.textContent = `💤 对方 ${mins} 分钟前来过`;
        el.style.color = '#999';
    } else {
        el.textContent = '';
    }
}

// ==========================
// 最近动态
// ==========================

function renderRecentActivity() {
    const el = document.getElementById('recent-activity');
    if (!el) return;
    const items = [];
    data.anniversaries.slice(-2).forEach(a => items.push({ type: '🎂', text: a.name, time: a.date }));
    data.dailies.slice(-2).forEach(d => items.push({ type: '📝', text: d.content, time: d.date }));
    data.messages.slice(-2).forEach(m => items.push({ type: '💌', text: m.content, time: m.date }));
    items.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    el.innerHTML = items.slice(0, 5).map(i => `<div class="recent-item"><span>${i.type}</span> <span>${i.text}</span></div>`).join('') || '<div class="empty-state">还没有动态~</div>';
}

// ==========================
// 首页日期修改
// ==========================

function showDateEditor() {
    const editor = document.getElementById('date-editor');
    const input = document.getElementById('home-start-date');
    if (editor) editor.style.display = 'flex';
    if (input) input.value = data.startDate;
}

function hideDateEditor() {
    const editor = document.getElementById('date-editor');
    if (editor) editor.style.display = 'none';
}

function updateStartDateFromHome() {
    const val = document.getElementById('home-start-date').value;
    if (val) {
        data.startDate = val;
        saveData();
        updateTogetherDays();
        renderCalendar();
        hideDateEditor();
        showDebugError('✅ 起始日期已更新！', true);
    }
}

// ==========================
// 农历支持
// ==========================

function getLunarDate(dateStr) {
    if (typeof Lunar === 'undefined') return null;
    try {
        const d = new Date(dateStr);
        const lunar = Lunar.fromDate(d);
        return { month: lunar.getMonth(), day: lunar.getDay() };
    } catch (e) { return null; }
}

function lunarToSolar(lunarMonth, lunarDay, year) {
    if (typeof Lunar === 'undefined') return null;
    try {
        const lunar = Lunar.fromYmd(year, lunarMonth, lunarDay);
        const solar = lunar.getSolar();
        return `${solar.getYear()}-${String(solar.getMonth()).padStart(2,'0')}-${String(solar.getDay()).padStart(2,'0')}`;
    } catch (e) { return null; }
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
    const defaults = {
        coverTitle: "💕 我们的纪念册",
        mainTitle: "💕 我们的纪念册",
        openingWords: "这是我们的故事，从此刻开始记录...",
        password: "",
        startDate: "2024-01-01",
        theme: "pink",
        anniversaries: [],
        dailies: [],
        photos: [],
        messages: [],
        music: { currentSongIndex: -1, isPlaying: false, volume: 50, isMuted: false, currentTime: 0 },
        lastActive: null
    };
    return defaults;
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
    const startInput = document.getElementById('start-date');
    if (startInput) startInput.value = data.startDate;
    const pwdInput = document.getElementById('set-password');
    if (pwdInput) pwdInput.value = data.password;

    // 主题
    switchTheme(data.theme || 'pink');

    // 音乐初始化
    if (!data.music) data.music = { currentSongIndex: -1, isPlaying: false, volume: 50, isMuted: false, currentTime: 0 };
    initPlaylist();
    renderPlaylist();
    updateMusicUI();
    if (audioPlayer) {
        audioPlayer.volume = data.music.isMuted ? 0 : (data.music.volume / 100);
        document.getElementById('volume-slider').value = data.music.volume;
    }
    checkPartnerListening();

    updateTogetherDays();
    renderAnniversaries();
    renderDailies();
    renderPhotos();
    renderMessages();
    renderCalendar();
    renderRecentActivity();
    updateOnlineStatus();

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
    const anniDate = document.getElementById('anni-date');
    if (anniDate) anniDate.valueAsDate = new Date();
    const dailyDate = document.getElementById('daily-date');
    if (dailyDate) dailyDate.valueAsDate = new Date();
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
    const start = new Date(data.startDate + 'T00:00:00');
    function update() {
        const now = new Date();
        const diffMs = now - start;
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
        const el = document.getElementById('together-days');
        if (el) {
            el.innerHTML = `${days}<span style="font-size:0.6em">天</span>${hours}<span style="font-size:0.6em">时</span>${minutes}<span style="font-size:0.6em">分</span>${seconds}<span style="font-size:0.6em">秒</span>`;
        }
    }
    update();
    if (window.togetherTimer) clearInterval(window.togetherTimer);
    window.togetherTimer = setInterval(update, 1000);
}

function updateStartDate() {
    data.startDate = document.getElementById('start-date').value;
    saveData();
    updateTogetherDays();
    renderCalendar();
}

// ==========================
// 纪念日
// ==========================

function addAnniversary() {
    const name = document.getElementById('anni-name').value.trim();
    const date = document.getElementById('anni-date').value;
    const category = document.getElementById('anni-category').value;
    const repeat = document.getElementById('anni-repeat').checked;
    const isLunar = document.getElementById('anni-lunar').checked;
    if (!name || !date) { alert('请填写完整哦~'); return; }
    const item = { id: Date.now().toString(), name, date, category: category || '🎉', repeat: !!repeat, isLunar: !!isLunar };
    if (isLunar) {
        const lunar = getLunarDate(date);
        if (lunar) item.lunarDate = lunar;
    }
    data.anniversaries.push(item);
    saveData();
    document.getElementById('anni-name').value = '';
    document.getElementById('anni-repeat').checked = true;
    document.getElementById('anni-lunar').checked = false;
    renderAnniversaries();
    renderCalendar();
    renderRecentActivity();
}

function deleteAnniversary(id) {
    if (!confirm('确定删除吗？')) return;
    data.anniversaries = data.anniversaries.filter(a => a.id !== id);
    saveData();
    renderAnniversaries();
    renderCalendar();
}

function getNextAnniversaryDate(anni) {
    const today = new Date(); today.setHours(0,0,0,0);
    let targetDate = null;
    if (anni.isLunar && anni.lunarDate) {
        const solar = lunarToSolar(anni.lunarDate.month, anni.lunarDate.day, today.getFullYear());
        if (solar) targetDate = new Date(solar);
    }
    if (!targetDate) {
        targetDate = new Date(anni.date);
    }
    targetDate.setHours(0,0,0,0);
    if (anni.repeat) {
        targetDate.setFullYear(today.getFullYear());
        if (targetDate < today) targetDate.setFullYear(today.getFullYear() + 1);
    }
    return targetDate;
}

function renderAnniversaries() {
    const list = document.getElementById('anniversary-list');
    if (!list) return;
    list.innerHTML = '';
    if (data.anniversaries.length === 0) {
        list.innerHTML = '<div class="empty-state">还没有纪念日，快去添加第一个吧 💕</div>';
        return;
    }
    const today = new Date(); today.setHours(0,0,0,0);
    const sorted = [...data.anniversaries].sort((a,b) => {
        const da = getNextAnniversaryDate(a);
        const db = getNextAnniversaryDate(b);
        return da - db;
    });
    // 更新首页 together-badge 下方的最近纪念日（只显示未来的，不显示已过去）
    const nearestEl = document.getElementById('nearest-anni');
    if (nearestEl) {
        const future = sorted.find(anni => {
            const t = getNextAnniversaryDate(anni);
            const d = Math.ceil((t - today) / 86400000);
            return d >= 0;
        });
        if (future) {
            const target = getNextAnniversaryDate(future);
            const diff = Math.ceil((target - today) / 86400000);
            if (diff === 0) {
                nearestEl.textContent = `🎉 今天就是 ${future.name}！`;
            } else {
                nearestEl.textContent = `📅 ${future.name} 还有 ${diff} 天`;
            }
        } else {
            nearestEl.textContent = '';
        }
    }
    sorted.forEach(anni => {
        const target = getNextAnniversaryDate(anni);
        const diff = Math.ceil((target - today) / 86400000);
        // 跳过已过去且不再重复的纪念日
        if (diff < 0 && !anni.repeat) return;
        let label = '', display = diff;
        if (diff === 0) { label = '就是今天！🎉'; display = '🎉'; }
        else { label = '还有'; }
        const lunarTag = anni.isLunar ? ' 农历' : '';
        const repeatTag = anni.repeat ? ' 每年' : '';
        const div = document.createElement('div');
        div.className = 'card-item anni-row';
        const rowText = diff === 0
            ? `${anni.category || '🎉'} ${anni.name}，就是今天！🎉`
            : `${anni.category || '🎉'} ${anni.name}，还有 ${diff} 天`;
        div.innerHTML = `
            <span class="anni-text">${rowText}</span>
            <button class="delete-btn" onclick="deleteAnniversary('${anni.id}')">删除</button>`;
        list.appendChild(div);
    });
    // 如果列表为空，显示提示
    if (list.children.length === 0) {
        list.innerHTML = '<div class="empty-state">还没有即将到来的纪念日，快去添加吧 💕</div>';
    }
    // 首页显示最近纪念日（只显示未来的）
    const recentEl = document.getElementById('recent-anniversary');
    if (recentEl) {
        const future = sorted.find(anni => {
            const t = getNextAnniversaryDate(anni);
            const d = Math.ceil((t - today) / 86400000);
            return d >= 0;
        });
        if (future) {
            const target = getNextAnniversaryDate(future);
            const diff = Math.ceil((target - today) / 86400000);
            if (diff <= 30) {
                recentEl.style.display = 'block';
                recentEl.textContent = `⏰ 最近的纪念日：${future.name} 还有 ${diff} 天！`;
            } else {
                recentEl.style.display = 'none';
            }
        } else {
            recentEl.style.display = 'none';
        }
    }
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

function compressImage(file, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = URL.createObjectURL(file);
    });
}

async function uploadPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    const compressed = await compressImage(file, 800, 0.6);
    data.photos.push({ id: Date.now().toString(), type: 'base64', src: compressed, date: new Date().toISOString().split('T')[0] });
    saveData();
    renderPhotos();
    showDebugError('✅ 照片已自动压缩存储', true);
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

    for (let d = 1; d <= daysInMonth; d++) {
        const el = document.createElement('div');
        el.className = 'day';
        if (d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
            el.classList.add('today');
        }
        const dayEvents = [];
        data.anniversaries.forEach(a => {
            let ad = new Date(a.date);
            if (a.repeat) {
                const next = getNextAnniversaryDate(a);
                ad = next;
            }
            if (ad.getMonth() === currentMonth && ad.getDate() === d) {
                dayEvents.push({ icon: a.category || '🎉', name: a.name });
            }
        });
        if (dayEvents.length > 0) {
            el.classList.add('has-event');
            const first = dayEvents[0];
            const fullText = first.icon + first.name;
            let fontSize = '0.65rem';
            if (fullText.length > 7) fontSize = '0.5rem';
            else if (fullText.length > 5) fontSize = '0.55rem';
            el.innerHTML = `${d}<div class="cal-event" style="font-size:${fontSize}">${fullText}</div>`;
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

// 定期更新在线状态
setInterval(updateOnlineStatus, 60000);
setInterval(() => { data.lastActive = Date.now(); saveData(); }, 120000);

// ==========================
// 底部 Tab 切换
// ==========================

function switchTab(tabName, element) {
    // 隐藏所有 tab-page
    document.querySelectorAll('.tab-page').forEach(page => {
        page.classList.remove('active');
    });
    // 显示目标 tab-page
    const target = document.getElementById('tab-' + tabName);
    if (target) target.classList.add('active');

    // 更新底部导航高亮
    document.querySelectorAll('.tab-item').forEach(item => {
        item.classList.remove('active');
    });
    if (element) element.classList.add('active');

    // 切换到我的页面时，重新渲染日历
    if (tabName === 'profile') {
        renderCalendar();
    }
}
