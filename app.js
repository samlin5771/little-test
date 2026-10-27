/* =====================================================
 * 學測倒數 & 讀書計畫 — 程式
 *
 * 目錄（用編輯器搜尋這些標題就能跳過去）
 *   設定區            ← 考試日期、科目、Firebase 設定都在這裡
 *   小工具（含手機功能 device、切到背景／切回來 onAppShow、onAppHide）
 *   資料與儲存（含雲端同步：兩台裝置的修改一筆一筆合併）
 *   主題、分頁、彈出視窗
 *   1. 倒數（含轉盤）
 *   2. 每週進度
 *   3. 行事曆
 *   4. 待辦
 *   5. 讀書計時（含子母畫面）
 *   6. 統計（含補登）
 *   7. 質感與操作（滑動、快捷鍵、指令面板、分享卡片）
 *   8. AI 讀書計畫
 *   9. 讀書房間
 *   帳號畫面
 *   啟動
 *   Firebase 登入與雲端同步
 * ===================================================== */

/* =====================================================
 * 設定區（考試日期、科目都改這裡）
 * ===================================================== */
const EXAMS = {
    mock1: { name: '第一次模擬考', short: '模考一', date: '2026-09-02', end: '2026-09-03' },
    mock2: { name: '第二次模擬考', short: '模考二', date: '2026-10-28', end: '2026-10-29' },
    mock3: { name: '第三次模擬考', short: '模考三', date: '2026-12-08', end: '2026-12-09' },
    gsat:  { name: '116 學測',     short: '學測',   date: '2027-01-22', end: '2027-01-24' } // 多天的考試加上 end
};
// 科目順序不要改，舊的進度資料是靠順序對應的
const SUBJECTS = ['數學', '自然', '英文', '國文', '社會'];
const SLOTS = 2;
const TZ = '+08:00'; // 以台灣時間倒數

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCsoIvDKShBF1w39m9JzRNPUrkA4UDx5hk",
    authDomain: "study-countdown.firebaseapp.com",
    projectId: "study-countdown",
    storageBucket: "study-countdown.firebasestorage.app",
    messagingSenderId: "28447904418",
    appId: "1:28447904418:web:dbf52d5d9ad0b7aef27dfb",
    measurementId: "G-01SBVEFL1R"
};
const FIREBASE_VER = '12.19.0';
// v61 推播：Firebase 主控台 → 專案設定 → Cloud Messaging → Web Push 憑證 的「金鑰組」（公開的，可以放在這裡）
const VAPID_KEY = 'BGD80hd0Xdk6Irow67T2c0x6txEOqT_dnwv3r5IaByGhq86PDQm47egvg_Dni2uHyRfv_ZSECzdnpFc_Fs0wagE';
// v67：AI 排計畫暫時隱藏（不太穩定）。要打開改成 true 就好，程式和資料都還在
const AI_ON = false;
if (AI_ON) document.documentElement.classList.add('ai-on');
// AI 讀書計畫用的模型（Firebase AI Logic → Gemini Developer API）
const APP_VERSION = 'v67';   // 每次更新記得跟 service-worker.js 的 CACHE_NAME 一起改
const AI_MODEL = 'gemini-3.5-flash';
const AI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';   // 主要模型太忙時改用（穩定版，至少用到 2027 年 7 月）
// App Check 金鑰（Fraud Defense，舊稱 reCAPTCHA Enterprise）：在 Google Cloud 建立後貼在這裡；留空就不啟用
const RECAPTCHA_SITE_KEY = '6LeR9vQtAAAAAKsbIXmqZCd4sHONdH-mvcTx_qtJ';

const LS = {
    todos: 'study_todos', weekly: 'study_weekly', events: 'study_events',
    exam: 'selectedExamKey', theme: 'study_theme', tab: 'study_tab', accent: 'study_accent',
    sessions: 'study_sessions', timer: 'study_timer', tpref: 'study_timer_pref', minTip: 'study_min_tip',
    aiPref: 'study_ai_pref', aiCount: 'study_ai_count', room: 'study_room',
    bg: 'study_bg', syllabus: 'study_syllabus',
    notify: 'study_notify',
    install: 'study_install_seen', tour: 'study_tour_seen', chatSeen: 'study_chat_seen', photoCount: 'study_photo_count',
    countdowns: 'study_countdowns', home: 'study_home', progView: 'study_prog_view', sylOpen: 'study_syl_open',
    lastActive: 'study_last_active', cloud: 'study_cloud_cache',
    tt: 'study_timetable', calView: 'study_cal_view', heat: 'study_heat_range', seenVer: 'study_seen_ver', push: 'study_push', pushId: 'study_push_id', notif: 'study_notif', pokes: 'study_pokes', hol: 'study_holidays', guestNew: 'study_guest_sessions'   // v60 課表、行事曆／課表切換、熱力圖範圍
};   // 這台裝置存的所有設定都在這裡（改名字會讓舊資料讀不到，不要改）
// 沒有頭像時的預設圖（顏色跟著主題色）
function defaultAvatar() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#E9B154';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='${c}'/>` +
        "<circle cx='20' cy='15' r='7' fill='#16140F'/><path d='M6 37c2-8 8-11 14-11s12 3 14 11' fill='#16140F'/></svg>");
}

/* =====================================================
 * 小工具
 * ===================================================== */
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const examTime = (date) => new Date(`${date}T00:00:00${TZ}`).getTime();
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => ymd(new Date());

// 手機功能（震動）：集中在這裡。之後做成 App 時，只要把這裡換成 App 的原生功能（例如 iPhone 也能震動）
// 其他會用到手機功能的地方：螢幕常亮 requestWake、系統通知 systemNotify、分享 navigator.share
const device = {
    vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
};

// App 切到背景／切回來：各功能用 onAppShow、onAppHide 登記，照登記的順序執行（集中在這一個監聽）
const appShowFns = [], appHideFns = [];
const onAppShow = (fn) => appShowFns.push(fn), onAppHide = (fn) => appHideFns.push(fn);
document.addEventListener('visibilitychange', () => {
    (document.visibilityState === 'visible' ? appShowFns : appHideFns).forEach(fn => { try { fn(); } catch (e) { console.error(e); reportErr(e, 'appShow/Hide'); } });
});

/* =====================================================
 * v55：錯誤回報（程式出錯時自動記到 Firebase 的 errors，不含個人資料）
 * 在 Firebase 主控台 → Firestore → errors 就看得到：哪個版本、哪一頁、什麼手機、錯在哪一行
 * ===================================================== */
const ERR_Q = 'study_err_queue', ERR_DAY = 'study_err_day', ERR_DEV = 'study_err_dev';
const errSeen = new Set();
let errSent = 0;
// 這些不是程式的錯（沒網路、使用者自己取消、瀏覽器擋聲音或螢幕常亮），不用回報
const ERR_SKIP_CODE = /^(unavailable|cancelled|deadline-exceeded|failed-precondition|aborted|auth\/(popup-closed-by-user|cancelled-popup-request|network-request-failed|popup-blocked|user-cancelled))$/;
const ERR_SKIP_MSG = /ResizeObserver loop|^Script error\.?$|Load failed|Failed to fetch|NetworkError|network error|The operation was aborted|AbortError|NotAllowedError|play\(\) request was interrupted|Wake Lock|QuotaExceeded|client is offline|ChunkLoadError/i;
function errDevice() {
    try {
        let d = localStorage.getItem(ERR_DEV);
        if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem(ERR_DEV, d); }   // 隨機代號：只用來看「是不是同一台」，跟帳號無關
        return d;
    } catch (e) { return 'x'; }
}
function reportErr(err, where) {
    try {
        const e = err && typeof err === 'object' ? err : { message: String(err) };
        const code = String(e.code || '');
        const msg = String(e.message || e.reason || e || '').slice(0, 500);
        if (!msg || ERR_SKIP_CODE.test(code) || ERR_SKIP_MSG.test(msg) || e.name === 'AbortError' || e.name === 'NotAllowedError') return;
        const src = String(where || '').slice(0, 200);
        // 外掛程式（擴充功能）造成的錯不算
        if (/^(chrome|moz|safari)-extension:/.test(src) || /extension:\/\//.test(String(e.stack || ''))) return;
        const key = msg + '|' + src;
        if (errSeen.has(key) || errSent >= 10) return;   // 同一個錯只記一次，一次打開最多記 10 筆
        errSeen.add(key);
        const today = new Date().toISOString().slice(0, 10);
        const day = lsGet(ERR_DAY, {});
        if (day.d !== today) { day.d = today; day.n = 0; }
        if (day.n >= 30) return;   // 一台裝置一天最多 30 筆，避免一直重複送
        day.n++; errSent++;
        lsSet(ERR_DAY, day);
        const mode = (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true)) ? 'app' : 'web';
        const item = {
            msg, code: code.slice(0, 60), src, stack: String(e.stack || '').slice(0, 2000), ver: APP_VERSION,
            ua: String(navigator.userAgent || '').slice(0, 300), mode, tab: String(document.body?.dataset.tab || '').slice(0, 30),
            w: Math.round(innerWidth), h: Math.round(innerHeight), online: navigator.onLine !== false, dev: errDevice(), at: Date.now()
        };
        const q = lsGet(ERR_Q, []);
        q.push(item);
        lsSet(ERR_Q, q.slice(-20));   // 先存在這台，Firebase 準備好再一起送
        flushErrors();
    } catch (x) { /* 回報本身出錯就算了，不能影響 App */ }
}
let errFlushing = false;
async function flushErrors() {
    let f = null;
    try { f = fb; } catch (x) { return; }
    if (!f || errFlushing || navigator.onLine === false) return;
    const q = lsGet(ERR_Q, []);
    if (!q.length) return;
    errFlushing = true;
    lsSet(ERR_Q, []);
    try {
        const col = f.fs.collection(f.db, 'errors');
        await Promise.all(q.map(it => f.fs.addDoc(col, it).catch(() => {})));   // 規則還沒設定（沒有權限）也不要一直重試
    } catch (x) { /* 算了 */ }
    errFlushing = false;
}
window.addEventListener('error', (ev) => {
    const where = ev.filename ? `${String(ev.filename).replace(location.origin, '')}:${ev.lineno}:${ev.colno}` : '';
    if (ev.filename && !String(ev.filename).startsWith(location.origin) && !/gstatic\.com\/firebasejs/.test(ev.filename)) return;   // 別的網站的程式（擴充功能等）
    reportErr(ev.error || { message: ev.message }, where);
});
window.addEventListener('unhandledrejection', (ev) => reportErr(ev.reason || { message: 'unhandledrejection' }, 'promise'));

function lsGet(k, fb) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } }
function lsSet(k, v) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} }

let toastTimer;
function toast(msg, action) {
    const el = $('toast');
    el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button class="toast-btn">${esc(action.label)}</button>` : '');
    el.classList.toggle('has-action', !!action);
    if (action) el.querySelector('.toast-btn').onclick = () => { el.classList.remove('show'); action.fn(); };
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), action ? 4500 : 2200);
}

/* =====================================================
 * 資料與儲存
 * ===================================================== */
let state = { todos: [], events: [], weekly: {}, sessions: [], syllabus: { picked: null, custom: {}, status: {}, flags: [] }, countdowns: { items: [], pins: null } };
let currentUser = null;
let fb = null; // Firebase（動態載入，離線時 App 照常可用）
let deletingAccount = false;   // 正在刪除帳號：停止所有雲端寫入，避免刪掉又被寫回去

// 相容舊版資料：舊的待辦是純文字、舊的行程可能沒有 id
// 自己加過、和內建考試同一天又同名的行程（例如 1/22「學測」）視為重複，自動移除
const squash = (t) => String(t || '').replace(/\s/g, '');
function isExamDuplicate(ev) {
    const t = squash(ev.title);
    if (!t) return false;
    return Object.values(EXAMS).some(x => {
        if (ev.start < x.date || ev.start > (x.end || x.date)) return false;
        const name = squash(x.name);
        return name.includes(t) || t.includes(name) || t.includes(x.short);
    });
}
let removedDupes = 0;
function normalize(raw = {}) {
    removedDupes = 0;
    return {
        todos: (raw.todos || []).map(t => typeof t === 'string'
            ? { id: uid(), text: t }
            : { id: t.id || uid(), text: t.text || '', ...(/^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? { date: t.date, ...(/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time || '') ? { time: t.time } : {}) } : {}) }),
        events: (raw.events || []).filter(e => e && e.start).map(e => ({
            id: String(e.id || uid()), title: e.title || '', start: String(e.start).slice(0, 10), important: !!e.important,
            ...(e.end && String(e.end).slice(0, 10) > String(e.start).slice(0, 10) ? { end: String(e.end).slice(0, 10) } : {})
        })).filter(e => { if (isExamDuplicate(e)) { removedDupes++; return false; } return true; }),
        weekly: raw.weekly && typeof raw.weekly === 'object' ? raw.weekly : {},
        sessions: (raw.sessions || []).filter(x => x && x.start && x.minutes > 0).map(x => ({
            id: String(x.id || uid()), subject: Math.min(4, Math.max(0, x.subject | 0)),
            start: Number(x.start), minutes: Math.round(x.minutes), pomo: !!x.pomo, ...(x.edited ? { edited: true } : {})
        })),
        syllabus: normSyllabus(raw.syllabus),
        countdowns: normCountdowns(raw.countdowns)
    };
}
// 自訂倒數：{ items: [{ id, name, short, date, end?, color, yearly, cal }], pins: [釘在上方的 key，依順序] 或 null（用預設） }
const CD_MAX = 3;   // 倒數頁上方最多放幾個（含固定的學測；再加一個「⋯」選單，一行剛好放得下）
const CD_FIXED = 'gsat';   // 學測固定在上方，不能取消
const CD_COLORS = ['#F472B6', '#6CB4EE', '#34D399', '#E9B154', '#A99BF0', '#FF8B74'];
const isYmd = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
function normCountdowns(c) {
    c = c && typeof c === 'object' ? c : {};
    const items = (Array.isArray(c.items) ? c.items : []).filter(x => x && isYmd(x.date) && x.name).slice(0, 40).map(x => ({
        id: String(x.id || 'c_' + uid()), name: String(x.name).slice(0, 30), short: String(x.short || x.name).slice(0, 4),
        date: x.date, ...(isYmd(x.end) && x.end > x.date && !x.yearly ? { end: x.end } : {}),
        color: CD_COLORS.includes(x.color) ? x.color : CD_COLORS[0], yearly: !!x.yearly, cal: x.cal !== false
    }));
    const pins = Array.isArray(c.pins) ? [...new Set(c.pins.filter(k => typeof k === 'string'))].slice(0, 12) : null;
    const off = Array.isArray(c.off) ? [...new Set(c.off.filter(k => typeof k === 'string'))].slice(0, 60) : [];
    return { items, pins, off };
}
const isEmpty = (s) => !s.todos.length && !s.events.length && !Object.keys(s.weekly).length && !s.sessions.length && !s.syllabus.picked && !s.countdowns.items.length && !s.countdowns.pins;
const loadLocal = () => normalize({ todos: lsGet(LS.todos, []), events: lsGet(LS.events, []), weekly: lsGet(LS.weekly, {}), sessions: lsGet(LS.sessions, []), syllabus: lsGet(LS.syllabus, null), countdowns: lsGet(LS.countdowns, null) });
function saveLocal() {
    lsSet(LS.todos, state.todos); lsSet(LS.events, state.events); lsSet(LS.weekly, state.weekly); lsSet(LS.sessions, state.sessions); lsSet(LS.syllabus, state.syllabus); lsSet(LS.countdowns, state.countdowns);
}
// 登入後的雲端資料在這台裝置留一份副本：下次打開直接畫出最新資料，不會先閃一下舊的（登出時清掉）
// 副本裡也記著「雲端上次確認的樣子」(base) 和「有沒有還沒送出的修改」(dirty)：離線、剛打開還沒連上時改的東西不會不見
const CLOUD_CACHE = LS.cloud;
const SYNC_KEYS = ['todos', 'events', 'weekly', 'sessions', 'syllabus', 'countdowns'];
const pickSync = (s) => ({ todos: s.todos, events: s.events, weekly: s.weekly, sessions: s.sessions, syllabus: s.syllabus, countdowns: s.countdowns });
const stateJson = (s) => JSON.stringify(pickSync(s));
const cloneState = (s) => normalize(JSON.parse(stateJson(s)));
let cachedUid = null;     // 副本是哪個帳號的
let authKnown = false;    // 已經知道有沒有登入
let cloudBase = null;     // 雲端最後一次確認的資料（合併時用來分辨「誰改了什麼」）
let cloudDirty = false;   // 這台裝置有還沒送上雲端的修改
let cacheTimer = null;
function writeCloudCache() {
    const id = currentUser?.uid || cachedUid;
    if (!id) return;
    clearTimeout(cacheTimer);
    try { localStorage.setItem(CLOUD_CACHE, JSON.stringify({ uid: id, at: Date.now(), json: stateJson(state), base: cloudBase ? stateJson(cloudBase) : null, dirty: cloudDirty })); } catch (e) {}
}
function saveCloudCache() {
    if (!currentUser && !cachedUid) return;
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(writeCloudCache, 300);
}
function loadCloudCache() {
    try {
        const c = JSON.parse(localStorage.getItem(CLOUD_CACHE) || 'null');
        if (!(c && c.uid && c.json)) return null;
        // 舊版副本沒有 base：當成跟雲端一樣、沒有未送出的修改
        return { uid: c.uid, state: normalize(JSON.parse(c.json)), base: normalize(JSON.parse(c.base || c.json)), dirty: !!c.dirty };
    } catch (e) { return null; }
}
const clearCloudCache = () => { clearTimeout(cacheTimer); try { localStorage.removeItem(CLOUD_CACHE); } catch (e) {} };

/* --- 合併：手機和電腦都改過時，一筆一筆比對（base＝雲端上次的樣子）---
 * 只有這台改的 → 用這台的；只有別台改的 → 用別台的；兩邊都改了同一筆 → 用這台剛改的
 * 新增、刪除、修改都看得出來，所以兩台同時用也不會互相蓋掉 */
const canon = (v) => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x);
const same = (a, b) => canon(a) === canon(b);
const pick3 = (b, l, r) => (same(l, b) ? r : l);   // 這台沒改就用別台的，這台改了就用這台的
function mergeList(b, l, r) {   // 有 id 的清單：待辦、行程、讀書紀錄、自訂倒數
    const B = new Map((b || []).map(x => [x.id, x])), L = new Map((l || []).map(x => [x.id, x])), R = new Map((r || []).map(x => [x.id, x]));
    return [...new Set([...L.keys(), ...R.keys()])].map(id => pick3(B.get(id), L.get(id), R.get(id))).filter(Boolean);
}
function mergeMap(b, l, r) {    // 用 key 對應的資料：每週進度、單元進度、自己改過的單元清單
    b = b || {}; l = l || {}; r = r || {};
    const out = {};
    new Set([...Object.keys(l), ...Object.keys(r)]).forEach(k => { const v = pick3(b[k], l[k], r[k]); if (v !== undefined) out[k] = v; });
    return out;
}
function mergeState(b, l, r) {
    b = b || normalize({});
    const by = (s) => s.syllabus || {}, bc = (s) => s.countdowns || {};
    return normalize({
        todos: mergeList(b.todos, l.todos, r.todos),
        events: mergeList(b.events, l.events, r.events),
        sessions: mergeList(b.sessions, l.sessions, r.sessions),
        weekly: mergeMap(b.weekly, l.weekly, r.weekly),
        syllabus: {
            picked: pick3(by(b).picked, by(l).picked, by(r).picked),
            custom: mergeMap(by(b).custom, by(l).custom, by(r).custom),
            status: mergeMap(by(b).status, by(l).status, by(r).status),
            flags: pick3(by(b).flags, by(l).flags, by(r).flags)
        },
        countdowns: {
            items: mergeList(bc(b).items, bc(l).items, bc(r).items),
            pins: pick3(bc(b).pins, bc(l).pins, bc(r).pins),
            off: pick3(bc(b).off, bc(l).off, bc(r).off)
        }
    });
}
// 雲端的新資料換上畫面：內容真的有變才整頁重畫
function setSyncedState(next) {
    const before = stateJson(state);
    state = next;
    if (stateJson(state) !== before) renderAll();
}

let cloudTimer;
let cloudReady = false;
const earlySessions = [];   // 讀到雲端資料前記錄的，讀到後確認有補上去
let unsubscribe = null;
function save() {
    // 登入中（或打開時還在確認登入）：先記在這台的副本，再合併送上雲端
    if (currentUser || (cachedUid && !authKnown)) {
        cloudDirty = true;
        saveCloudCache();
        scheduleFlush();
        return;
    }
    saveLocal();
}
function scheduleFlush(ms = 400) { clearTimeout(cloudTimer); cloudTimer = setTimeout(flushCloud, ms); }
// 送上雲端：先讀雲端最新的，跟這台的修改合併後再寫回（交易，中途有人改會自動重來）
let flushing = false, flushAgain = false, flushRetry = 0;
async function flushCloud() {
    if (!cloudDirty || !currentUser || !fb || !cloudReady || deletingAccount) return;
    if (flushing) { flushAgain = true; return; }
    flushing = true; flushAgain = false;
    clearTimeout(flushRetry);
    const who = currentUser.uid;
    const sentJson = stateJson(state), sent = JSON.parse(sentJson);   // 這次送出的內容；送出期間又改的，下一輪再送
    const base = cloudBase;   // 送出這一刻的「雲端上次的樣子」（送出期間別台的新資料不能算成這台刪掉的）
    const ref = fb.fs.doc(fb.db, 'users', who);
    try {
        const merged = await fb.fs.runTransaction(fb.db, async (tx) => {
            const snap = await tx.get(ref);
            const remote = snap.exists() ? normalize(snap.data()) : normalize({});
            const m = mergeState(base, sent, remote);
            // mergeFields：只覆蓋這幾個欄位，雲端其他資料（個人設定）不受影響
            tx.set(ref, { ...pickSync(m), updatedAt: Date.now() }, { mergeFields: [...SYNC_KEYS, 'updatedAt'] });
            return m;
        });
        if (currentUser?.uid !== who) return;
        cloudBase = cloneState(merged);   // 複製一份：畫面上的資料之後再改，不會連「雲端上次的樣子」一起被改到
        if (journalRestore(merged, true)) { flushAgain = true; cloudDirty = true; }   // 萬一合併時少了剛記錄的，補回去再送一次
        if (stateJson(state) === sentJson && !flushAgain) { cloudDirty = false; setSyncedState(merged); }
        else { flushAgain = true; setSyncedState(mergeState(sent, state, merged)); }
        writeCloudCache();
        publishProfile();   // 別台裝置的讀書紀錄合併進來了，房間裡的今日時數也更新
    } catch (e) {
        console.warn('雲端儲存失敗，連上網路後會自動再送：', e);
        if (!['unavailable', 'deadline-exceeded', 'aborted', 'failed-precondition', 'cancelled'].includes(e?.code)) { toast('雲端儲存失敗，請檢查網路'); reportErr(e, 'flushCloud'); }
        flushRetry = setTimeout(flushCloud, 20000);
    } finally {
        flushing = false;
        if (cloudDirty && flushAgain) scheduleFlush();
    }
}
window.addEventListener('online', () => { if (cloudDirty) scheduleFlush(1000); flushErrors(); });

/* --- v55：離線提示（沒網路時，畫面下方出現小膠囊；連回來後顯示同步進度） --- */
let netTimer = 0, netWait = 0;
function setNetPill(kind, text) {
    const el = $('netPill');
    if (!el) return;
    clearTimeout(netTimer);
    if (!kind) { el.classList.remove('show'); netTimer = setTimeout(() => { el.hidden = true; document.body.classList.remove('net-on'); }, 250); return; }
    const [head, tail] = text.split('|');   // 「|」後面是螢幕太窄時可以省略的部分，保持一行
    $('netText').innerHTML = esc(head) + (tail ? `<span class="nt-tail">${esc(tail)}</span>` : '');
    el.dataset.kind = kind;
    el.hidden = false;
    document.body.classList.add('net-on');
    requestAnimationFrame(() => el.classList.add('show'));
}
function netOffline() {
    clearInterval(netWait);
    const signed = !!(currentUser || cachedUid);
    setNetPill('off', signed ? '離線中 · 記錄存在本裝置|，連上網路後自動同步' : '離線中 · 記錄存在本裝置|，可以照常使用');
}
function netOnline() {
    clearInterval(netWait);
    const el = $('netPill');
    if (!el || el.hidden) return;   // 本來就沒顯示離線，不用多說
    if (!(currentUser && fb) || !cloudDirty) {
        setNetPill('ok', currentUser ? '已連上網路 · 資料都同步好了' : '已連上網路');
        netTimer = setTimeout(() => setNetPill(null), 2200);
        return;
    }
    setNetPill('sync', '已連上網路 · 同步中…');
    const t0 = Date.now();
    netWait = setInterval(() => {
        if (!navigator.onLine) { clearInterval(netWait); return; }
        if (!cloudDirty) {
            clearInterval(netWait);
            setNetPill('ok', '已同步完成');
            netTimer = setTimeout(() => setNetPill(null), 2200);
        } else if (Date.now() - t0 > 30000) {   // 太久沒同步好：先收起來，之後還是會自動再送
            clearInterval(netWait);
            setNetPill(null);
        }
    }, 500);
}
window.addEventListener('offline', netOffline);
window.addEventListener('online', netOnline);
// 切到背景、關掉 App：副本馬上存好，還沒送出的修改趕快送
const syncOnLeave = () => { if (currentUser || cachedUid) writeCloudCache(); if (cloudDirty) flushCloud(); };
onAppHide(syncOnLeave);
window.addEventListener('pagehide', syncOnLeave);


function renderAll() {
    renderExamChips(); tick();
    renderToday();
    renderWeek();
    renderCalendar();
    renderTodos();
    renderTimer();
    renderStats();
    renderSyllabus();
    renderReviewLine();
    renderHomeExtras();
}

/* =====================================================
 * 主題
 * ===================================================== */
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#050608' : '#F7F6F2');
    try { bgFx.refresh(); } catch (e) { /* 啟動時背景還沒準備好 */ }
    renderModeSeg();
}
applyTheme(document.documentElement.getAttribute('data-theme'));
/* ④ 主題色（帳號視窗裡切換） */
const ACCENTS = ['amber', 'mint', 'violet', 'sakura', 'ocean', 'coral', 'matcha', 'moon'];
function applyAccent(a) {
    if (!ACCENTS.includes(a)) a = 'amber';
    if (a === 'amber') document.documentElement.removeAttribute('data-accent');
    else document.documentElement.setAttribute('data-accent', a);
    document.querySelectorAll('.accent-opt').forEach(b => {
        b.classList.toggle('active', b.dataset.accent === a);
        b.setAttribute('aria-pressed', b.dataset.accent === a);
    });
    try {   // 子母畫面開著的話一起換色（pipWin 在計時區塊才宣告，啟動時還不能用）
        if (pipWin) {
            if (a === 'amber') pipWin.document.documentElement.removeAttribute('data-accent');
            else pipWin.document.documentElement.setAttribute('data-accent', a);
        }
    } catch (e) {}
}
applyAccent(localStorage.getItem(LS.accent) || 'amber');
$('accentGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.accent-opt');
    if (!b) return;
    applyAccent(b.dataset.accent);
    lsSet(LS.accent, b.dataset.accent);
    bgFx.refresh();
    renderAccount();   // 預設頭像、目前主題色名稱
    savePrefs();
});
// 個人設定：點「主題色」展開／收起顏色選項
// 展開／收起（有動畫）；收起時 inert，鍵盤和報讀軟體不會跑進去
function setFold(row, fold, open) {
    $(fold).classList.toggle('open', open);
    $(fold).inert = !open;
    $(row).setAttribute('aria-expanded', open);
}
function closeFolds() { setFold('accentRow', 'accentFold', false); setFold('bgRow', 'bgFold', false); }
$('accentRow').addEventListener('click', () => setFold('accentRow', 'accentFold', !$('accentFold').classList.contains('open')));

$('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    lsSet(LS.theme, next);
    applyTheme(next);
});
// 沒手動選過時，跟著手機切換深淺色
const sysLight = () => !!window.matchMedia?.('(prefers-color-scheme: light)').matches;
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', (e) => {
    const saved = localStorage.getItem(LS.theme);
    if (saved !== 'light' && saved !== 'dark') applyTheme(e.matches ? 'light' : 'dark');
});
// 個人設定：外觀（淺色／深色／跟系統）
function renderModeSeg() {
    const saved = localStorage.getItem(LS.theme);
    const m = saved === 'light' || saved === 'dark' ? saved : 'auto';
    document.querySelectorAll('#modeSeg button').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === m); b.setAttribute('aria-pressed', b.dataset.mode === m);
    });
}
$('modeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    if (b.dataset.mode === 'auto') { try { localStorage.removeItem(LS.theme); } catch (err) {} applyTheme(sysLight() ? 'light' : 'dark'); }
    else { lsSet(LS.theme, b.dataset.mode); applyTheme(b.dataset.mode); }
});
renderModeSeg();
try { localStorage.removeItem('study_font'); } catch (e) {}   // v40 的字體大小已移除

/* =====================================================
 * 背景（個人設定裡選）
 * 呼吸光、極光、晨霧、方格紙、極簡只用 CSS；星空、雨夜、花瓣用一張 canvas 畫
 * 專注計時、聊天室、切到背景、系統「減少動態效果」時都會停下來，省電也不卡
 * ===================================================== */
const BG_NAME = { glow: '呼吸光', stars: '星空', aurora: '極光', mist: '晨霧', rain: '雨夜', petal: '花瓣', grid: '方格紙', plain: '極簡' };
const bgFx = (() => {
    const layer = $('bgLayer');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let kind = '', cv = null, ctx = null, w = 0, h = 0, parts = [], runs = [], streaks = [], shoot = null;
    let raf = 0, last = 0, t = 0, rgb = '233,177,84', dark = true;
    let dropLayer = null;   // 雨夜：不會動的小水珠先畫在另一張畫布，之後每格只要貼上去
    let scrollingUntil = 0; // 捲動中先暫停重畫，讓捲動更順
    const R = Math.random;
    const add = (cls) => { const d = document.createElement('div'); d.className = cls; layer.appendChild(d); return d; };
    function readColors() {
        rgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim().replace(/\s/g, '') || '233,177,84';
        dark = document.documentElement.getAttribute('data-theme') !== 'light';
    }
    function resize() {
        if (!cv) return;
        const dpr = Math.min(1.5, window.devicePixelRatio || 1);
        w = window.innerWidth; h = window.innerHeight;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function seed() {
        const n = Math.min(1.6, (w * h) / (390 * 844));   // 螢幕越大，數量越多（有上限）
        shoot = null; runs = []; streaks = []; dropLayer = null;
        if (kind === 'stars') parts = Array.from({ length: Math.round(110 * n) }, () => ({ x: R() * w, y: R() * h * .88, r: R() < .1 ? 1.3 + R() * .6 : .5 + R() * .7, p: R() * 6.28, s: .6 + R() * 1.6 }));
        if (kind === 'petal') parts = Array.from({ length: Math.round(20 * n) }, () => ({ x: R() * w, y: R() * h, s: 4 + R() * 4, v: .35 + R() * .5, sw: R() * 6.28, rot: R() * 6.28, vr: (R() - .5) * .03 }));
        if (kind === 'rain') {
            parts = Array.from({ length: Math.round(140 * n) }, () => ({ x: R() * w, y: R() * h, r: R() < .85 ? .6 + R() * 1.3 : 1.8 + R() * 1.6 }));
            runs = Array.from({ length: Math.round(6 * n) }, () => ({ x: R() * w, y: R() * h, r: 2.2 + R() * 1.4, v: 0, wait: R() * 3000, trail: [] }));
            streaks = Array.from({ length: Math.round(30 * n) }, () => ({ x: R() * w * 1.2, y: R() * h, l: 14 + R() * 22, v: 7 + R() * 5, a: .05 + R() * .1 }));
        }
    }
    function drop(x, y, r) {
        const c = ctx;   // 注意：預先畫水珠時 ctx 會暫時換成另一張畫布
        c.fillStyle = dark ? 'rgba(10,14,22,.35)' : 'rgba(120,135,150,.18)';
        c.beginPath(); c.ellipse(x, y + r * .15, r, r * 1.12, 0, 0, 6.283); c.fill();
        c.strokeStyle = dark ? 'rgba(220,230,245,.28)' : 'rgba(255,255,255,.75)'; c.lineWidth = Math.max(.6, r * .28);
        c.beginPath(); c.arc(x, y, r * .85, 3.6, 5.6); c.stroke();
        c.fillStyle = dark ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.95)';
        c.beginPath(); c.arc(x - r * .3, y - r * .35, Math.max(.4, r * .22), 0, 6.283); c.fill();
    }
    function draw(dt) {
        const c = ctx, f = dt / 16;
        c.clearRect(0, 0, w, h); t += dt;
        if (kind === 'stars') {
            for (const s of parts) {
                const tw = .55 + .45 * Math.sin(t * .001 * s.s + s.p);
                c.fillStyle = dark ? `rgba(255,252,240,${.25 + .7 * tw})` : `rgba(${rgb},${.18 + .4 * tw})`;
                c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
            }
            if (!shoot && dt && R() < .003) shoot = { x: w * (.3 + R() * .7), y: R() * h * .35, k: 0 };
            if (shoot) {
                shoot.k += dt / 900;
                const x = shoot.x - shoot.k * w * .55, y = shoot.y + shoot.k * w * .3, a = Math.sin(Math.min(1, shoot.k) * Math.PI);
                const g = c.createLinearGradient(x, y, x + 60, y - 32);
                g.addColorStop(0, dark ? `rgba(255,255,255,${a})` : `rgba(${rgb},${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
                c.strokeStyle = g; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 60, y - 32); c.stroke();
                if (shoot.k >= 1) shoot = null;
            }
        } else if (kind === 'petal') {
            for (const p of parts) {
                p.y += p.v * f; p.sw += .012 * f; p.rot += p.vr * f;
                if (p.y > h + 10) { p.y = -10; p.x = R() * w; }
                c.save(); c.translate(p.x + Math.sin(p.sw) * 22, p.y); c.rotate(p.rot);
                c.fillStyle = `rgba(${rgb},${dark ? .7 : .85})`;
                c.beginPath(); c.ellipse(0, 0, p.s, p.s * .55, 0, 0, 6.283); c.fill();
                c.fillStyle = `rgba(255,255,255,${dark ? .15 : .35})`;
                c.beginPath(); c.ellipse(-p.s * .25, -p.s * .12, p.s * .45, p.s * .2, 0, 0, 6.283); c.fill();
                c.restore();
            }
        } else if (kind === 'rain') {
            c.lineCap = 'round'; c.lineWidth = .8;
            for (const d of streaks) {   // 遠處的雨絲
                d.y += d.v * f; d.x -= d.v * .12 * f;
                if (d.y > h + d.l) { d.y = -d.l; d.x = R() * w * 1.2; }
                c.strokeStyle = dark ? `rgba(190,205,225,${d.a})` : `rgba(80,100,125,${d.a})`;
                c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x + d.l * .12, d.y - d.l); c.stroke();
            }
            if (!dropLayer) {   // 玻璃上的小水珠（只畫一次）
                dropLayer = document.createElement('canvas'); dropLayer.width = cv.width; dropLayer.height = cv.height;
                const real = ctx; ctx = dropLayer.getContext('2d'); ctx.setTransform(real.getTransform());
                for (const d of parts) drop(d.x, d.y, d.r);
                ctx = real;
            }
            c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(dropLayer, 0, 0); c.restore();
            for (const d of runs) {   // 慢慢滑下來的水珠，留下一條水痕
                if (d.wait > 0) d.wait -= dt; else { d.v = Math.min(2.2, d.v + .03 * f); d.y += d.v * f; d.x += Math.sin(d.y * .05) * .15; }
                if (dt) { d.trail.push([d.x, d.y]); if (d.trail.length > 40) d.trail.shift(); }
                if (d.trail.length > 2) {
                    c.strokeStyle = dark ? 'rgba(200,215,235,.12)' : 'rgba(255,255,255,.6)'; c.lineWidth = d.r * .7;
                    c.beginPath(); c.moveTo(d.trail[0][0], d.trail[0][1]); d.trail.forEach(([x, y]) => c.lineTo(x, y)); c.stroke();
                }
                drop(d.x, d.y, d.r);
                if (d.y > h + 10) { d.y = -10; d.x = R() * w; d.v = 0; d.wait = 1500 + R() * 4000; d.trail = []; }
            }
        }
    }
    const still = () => document.hidden || reduce?.matches || document.body.classList.contains('focus-mode') || document.body.classList.contains('chat-open');
    function loop(now) {
        raf = 0;
        if (!cv || still()) return;
        const dt = Math.min(60, now - last);
        if (now < scrollingUntil) last = now;              // 捲動中：先不畫，把時間留給捲動
        else if (dt >= 32) { last = now; draw(dt); }       // 約 30 fps 就夠順，比較省電
        raf = requestAnimationFrame(loop);
    }
    function update() {   // 依狀態決定要不要動
        const s = still();
        document.documentElement.classList.toggle('bg-still', s);
        if (!cv) return;
        if (s) { if (raf) cancelAnimationFrame(raf); raf = 0; draw(0); }
        else if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }
    function set(k) {
        if (!BG_NAME[k]) k = 'glow';
        document.documentElement.setAttribute('data-bg', k);
        if (k === kind) { update(); return; }
        kind = k; layer.innerHTML = ''; cv = null; ctx = null;
        if (raf) cancelAnimationFrame(raf); raf = 0;
        if (k === 'aurora') { add('b-au a1'); add('b-au a2'); add('b-au a3'); }
        if (k === 'mist') { add('b-mist m1'); add('b-mist m2'); add('b-mist m3'); }
        if (k === 'grid') add('b-grid');
        if (k === 'stars') add('b-sky');
        if (k === 'rain') {
            add('b-rain-sky');
            // 窗外模糊的燈：主題色、暖黃、冷藍
            [[18, 72, 52, 'rgba(var(--accent-rgb),.6)'], [72, 80, 70, 'rgba(255,170,90,.55)'], [84, 56, 40, 'rgba(110,160,255,.45)'],
             [38, 90, 44, 'rgba(255,214,140,.45)'], [8, 50, 30, 'rgba(110,160,255,.35)'], [56, 64, 28, 'rgba(var(--accent-rgb),.4)']]
                .forEach(([x, y, r, c], i) => { r = Math.round(r * 1.5); const d = add('b-bokeh'); d.style.cssText = `left:${x}%;top:${y}%;width:${r * 2}px;height:${r * 2}px;margin:-${r}px;background:radial-gradient(closest-side, ${c}, ${c.replace(/[\d.]+\)$/, '0.18)')} 60%, transparent);animation-delay:-${i * 1.7}s`; });
            add('b-fog');
        }
        if (k === 'stars' || k === 'rain' || k === 'petal') {
            cv = document.createElement('canvas'); layer.appendChild(cv); ctx = cv.getContext('2d');
            readColors(); resize(); seed(); draw(0);
        }
        update();
    }
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (cv) { resize(); seed(); draw(0); } }, 200); });
    document.addEventListener('visibilitychange', update);
    reduce?.addEventListener?.('change', update);
    // body 的 class 變了（進入專注、打開聊天室）就重新判斷
    new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // 顆粒質感：一次產生一小塊雜訊圖重複貼（取代整頁的 SVG 濾鏡，比較省）
    try {
        const g = document.createElement('canvas'); g.width = g.height = 160;
        const gx = g.getContext('2d'), img = gx.createImageData(160, 160);
        for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255 | 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
        gx.putImageData(img, 0, 0);
        document.documentElement.style.setProperty('--grain', `url(${g.toDataURL('image/png')})`);
    } catch (e) {}
    window.addEventListener('scroll', () => { scrollingUntil = performance.now() + 180; }, { passive: true });
    return { set, update, get kind() { return kind; }, refresh() { readColors(); dropLayer = null; if (cv) draw(0); } };
})();
function applyBg(k) {
    bgFx.set(k);
    document.querySelectorAll('.bg-opt').forEach(b => { const on = b.dataset.bg === bgFx.kind; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    if ($('bgName')) $('bgName').textContent = BG_NAME[bgFx.kind];
}
applyBg(localStorage.getItem(LS.bg) || 'glow');
$('bgGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.bg-opt');
    if (!b) return;
    applyBg(b.dataset.bg); lsSet(LS.bg, b.dataset.bg); savePrefs();
});
$('bgRow').addEventListener('click', () => setFold('bgRow', 'bgFold', !$('bgFold').classList.contains('open')));
// 主題色和背景跟著帳號同步（深淺色每台裝置各自決定）
let prefsTimer = 0;
function savePrefs() {
    if (!currentUser || !fb || !cloudReady) return;
    clearTimeout(prefsTimer);
    prefsTimer = setTimeout(() => {
        fb.fs.setDoc(fb.fs.doc(fb.db, 'users', currentUser.uid), {
            prefs: { accent: localStorage.getItem(LS.accent) || 'amber', bg: localStorage.getItem(LS.bg) || 'glow', notify: localStorage.getItem(LS.notify) || 'banner', home: homePref, tt, notif,
                room: { name: roomPref.name || '', color: AV_COLORS.includes(roomPref.color) ? roomPref.color : '', hidden: !!roomPref.hidden } }
        }, { mergeFields: ['prefs'] }).catch(e => console.warn('設定同步失敗：', e));
    }, 400);
}
function applyCloudPrefs(p) {
    if (!p || typeof p !== 'object') return;
    if (ACCENTS.includes(p.accent) && p.accent !== (localStorage.getItem(LS.accent) || 'amber')) {
        applyAccent(p.accent); lsSet(LS.accent, p.accent); bgFx.refresh();
    }
    if (BG_NAME[p.bg] && p.bg !== (localStorage.getItem(LS.bg) || 'glow')) { applyBg(p.bg); lsSet(LS.bg, p.bg); }
    if (NOTIFY_NAME[p.notify] && p.notify !== notifyStyle) { applyNotify(p.notify); }
    // v60 課表也跟著帳號；雲端還沒有、這台有的話，把這台的送上去
    if (p.tt && typeof p.tt === 'object') {
        const x = normTT(p.tt);
        if (JSON.stringify(x) !== JSON.stringify(tt)) { tt = x; lsSet(LS.tt, tt); renderTT(); renderHomeClass(); }
    } else if (ttHasData()) savePrefs();
    // v62 通知設定、房間暱稱也跟著帳號（新登入、換裝置都一樣）
    if (p.notif && typeof p.notif === 'object') {
        const x = normNotif(p.notif);
        if (JSON.stringify(x) !== JSON.stringify(notif)) { notif = x; lsSet(LS.notif, notif); renderNotif(); renderNotifRow(); }
        schedSync();
    } else savePrefs();
    if (p.room && typeof p.room === 'object') {
        const nm = String(p.room.name || '').slice(0, 20), col = AV_COLORS.includes(p.room.color) ? p.room.color : '';
        if (nm !== (roomPref.name || '') || col !== (roomPref.color || '') || !!p.room.hidden !== !!roomPref.hidden) {
            roomPref = { ...roomPref, name: nm, color: col, hidden: !!p.room.hidden }; saveRoomPref();
            publishProfile(); renderRoom(); renderHomeRoom();
        }
    }
    if (p.home) {   // 首頁排法也跟著帳號
        const h = normHome(p.home);
        if (JSON.stringify(h) !== JSON.stringify(homePref)) { homePref = h; lsSet(LS.home, h); applyHome(); }
    }
}

/* =====================================================
 * 聊天訊息通知：頂部橫幅（預設）或頂部小膠囊，在個人設定裡選
 * 收起時先滑出畫面，動畫跑完才真的隱藏，不會卡在邊緣露出一條
 * ===================================================== */
const NOTIFY_NAME = { banner: '頂部橫幅', pill: '頂部小膠囊' };
let notifyStyle = NOTIFY_NAME[localStorage.getItem(LS.notify)] ? localStorage.getItem(LS.notify) : 'banner';
function applyNotify(k) {
    notifyStyle = NOTIFY_NAME[k] ? k : 'banner';
    lsSet(LS.notify, notifyStyle);
    document.querySelectorAll('.notify-opt').forEach(b => { const on = b.dataset.notify === notifyStyle; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
}
applyNotify(notifyStyle);
function demoNotice() {
    showChatNotice({ code: null, uid: 'demo', name: '同學', room: '讀書房間', text: '這是訊息通知的樣子，點一下就會打開聊天室；往上滑可以關掉。', count: 2 });
}

// 聊天室圖示（兩個對話泡泡）：房間裡的聊天室入口、網站導覽、通知上的小標記都用這一個
const CHAT_PATHS = '<path d="M3.14 13.4A8.5 6.8 0 1 1 6.91 16.16L3.4 18.2z"/><path d="M18.57 12.14A5.6 4.4 0 0 1 21.25 18.4L22.4 21.6L19.37 19.93A5.6 4.4 0 0 1 10.85 16.79"/>';
const ICON_CHAT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CHAT_PATHS}<g fill="currentColor" stroke="none"><circle cx="7.2" cy="10" r="1.1"/><circle cx="10.5" cy="10" r="1.1"/><circle cx="13.8" cy="10" r="1.1"/></g></svg>`;
const ICON_CHAT_SM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CHAT_PATHS}</svg>`;
const notice = { el: null, timer: 0, hideTimer: 0, data: null };
function hideNotice(immediate) {
    const el = notice.el;
    clearTimeout(notice.timer);
    if (!el) return;
    el.classList.remove('show', 'open', 'dragging');
    el.style.height = '';
    el.style.transform = '';
    clearTimeout(notice.hideTimer);
    // 等滑出動畫跑完才設成 hidden；中途又有新通知就不會被藏起來
    notice.hideTimer = setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, immediate ? 0 : 520);
    notice.el = null;
}
// 膠囊展開：高度照內容（訊息一行或兩行、有沒有「回覆了你」），下面不會多出空白
function openPill(el) {
    el.classList.add('open');
    const exp = el.querySelector('.np-exp'), row = el.querySelector('.np-row');
    if (!exp || !row) return;
    // 展開時寬度會變（動畫），先用展開後的寬度量好內容高度
    const w = Math.min(400, document.documentElement.clientWidth - 28) - 24;
    const probe = exp.cloneNode(true);
    probe.style.cssText = `position:absolute;left:0;top:0;width:${w}px;visibility:hidden;opacity:0;pointer-events:none;box-sizing:border-box`;
    el.appendChild(probe);
    const h = probe.offsetHeight;
    probe.remove();
    el.style.height = Math.ceil(2 + row.offsetHeight + h + 14) + 'px';
}
function armNotice(ms) { clearTimeout(notice.timer); notice.timer = setTimeout(() => hideNotice(), ms); }
function showChatNotice(d) {
    const other = notifyStyle === 'pill' ? $('nBanner') : $('nPill');
    if (notice.el === other) hideNotice(true);
    const el = notifyStyle === 'pill' ? $('nPill') : $('nBanner');
    const av = `background:${avColor(d.uid)}`;
    const g = esc(firstGlyph(d.name || '同學'));
    const more = d.count > 1 ? d.count - 1 : 0;
    if (notifyStyle === 'pill') {
        const lead = d.reply ? `回覆了你：「${d.reply}」` : '';
        el.innerHTML = `<div class="np-row"><span class="np-av" style="${av}">${g}</span><span class="np-t">${esc(d.name || '同學')}${lead ? ' 回覆了你' : ''}：${esc(d.text)}</span>${d.count > 0 ? `<span class="np-n">${d.count > 99 ? '99+' : d.count}</span>` : ''}</div>
            <div class="np-exp"><small>${esc(d.room || '')} · 剛剛</small>${lead ? `<p class="np-q">${esc(lead)}</p>` : ''}<p>${esc(d.text)}</p>
            <div class="np-btns"><button data-np="later">稍後</button><button class="go" data-np="open">${d.kind === 'poke' ? '開始讀書' : '打開聊天室'}</button></div></div>`;
        el.setAttribute('aria-label', `${d.name}：${d.text}`);
    } else {
        el.innerHTML = `<span class="nb-av" style="${av}">${g}<span class="nb-room">${ICON_CHAT_SM}</span></span>
            <div class="nb-tx"><div class="nb-hd"><b>${esc(d.name || '同學')}</b><small>${esc(d.room || '')}</small><em>剛剛</em></div>
            ${d.reply ? `<div class="nb-q">回覆了你：「${esc(d.reply)}」</div>` : ''}<div class="nb-msg">${esc(d.text)}</div>${more ? `<div class="nb-more">還有 ${more} 則新訊息</div>` : ''}</div><span class="nb-grab"></span>`;
    }
    notice.data = d;
    clearTimeout(notice.hideTimer);
    el.classList.remove('open', 'dragging'); el.style.transform = ''; el.style.height = '';
    const wasShown = el.classList.contains('show');
    el.hidden = false;
    if (!wasShown) { void el.offsetWidth; }   // 先畫出收起的位置，再加 show 才會有滑下來的動畫
    el.classList.add('show');
    notice.el = el;
    armNotice(notifyStyle === 'pill' ? 5000 : 4200);
}
function openNoticeChat() {
    const d = notice.data, code = d?.code;
    hideNotice();
    if (d?.kind === 'poke') { focusMin = false; showTab('tab-timer'); return; }   // 朋友叫你讀書：打開計時
    if (code) openChat(code);
}
// 手勢：點一下＝打開（膠囊是展開），往上滑＝關掉；按著的時候不會自動收起
(function () {
    ['nBanner', 'nPill'].forEach(id => {
        const el = $(id);
        let y0 = 0, dy = 0, down = false, moved = false;
        const base = () => id === 'nPill' ? 'translate3d(-50%, ' : 'translate3d(0, ';
        el.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            down = true; moved = false; y0 = e.clientY; dy = 0;
            clearTimeout(notice.timer);
            el.setPointerCapture?.(e.pointerId);
        });
        el.addEventListener('pointermove', (e) => {
            if (!down) return;
            dy = Math.min(0, e.clientY - y0);
            if (Math.abs(e.clientY - y0) > 6) { moved = true; el.classList.add('dragging'); el.style.transform = `${base()}${dy}px, 0)`; }
        });
        const up = () => {
            if (!down) return;
            down = false; el.classList.remove('dragging');
            if (moved && dy < -28) { hideNotice(); return; }
            el.style.transform = '';
            if (!moved) {
                if (id === 'nPill' && !el.classList.contains('open')) { openPill(el); armNotice(6500); return; }
                if (id === 'nBanner') { openNoticeChat(); return; }
            }
            armNotice(el.classList.contains('open') ? 6500 : 3000);
        };
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
    });
    $('nPill').addEventListener('click', (e) => {
        const b = e.target.closest('[data-np]');
        if (!b) return;
        if (b.dataset.np === 'open') openNoticeChat(); else hideNotice();
    });
})();

/* =====================================================
 * 分頁
 * ===================================================== */
const tabBtns = document.querySelectorAll('.tab-btn');
function showTab(id) {
    if (!AI_ON && id === 'tab-ai') id = 'tab-weekly';   // AI 排計畫隱藏中：之前停在這頁、舊連結都改到每週進度
    if (!document.getElementById(id)) id = 'tab-countdown';
    const SUB = { 'tab-stats': 'tab-timer', 'tab-room': 'tab-timer', 'tab-ai': 'tab-weekly', 'tab-syllabus': 'tab-weekly' };   // 子頁面屬於哪個分頁
    const navId = SUB[id] || id;
    const btn = [...tabBtns].find(b => b.dataset.tab === navId) || tabBtns[0];
    tabBtns.forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === id));
    document.body.dataset.tab = id;
    $('pageTitle').textContent = { 'tab-stats': '讀書統計', 'tab-room': '讀書房間', 'tab-ai': 'AI 讀書計畫', 'tab-syllabus': '學測範圍' }[id] || btn.dataset.title;
    document.body.classList.toggle('sub', !!SUB[id] && id !== 'tab-syllabus');   // 學測範圍和每週進度是並排切換，不需要返回鍵   // 子頁面：頂部左邊出現返回鍵
    $('topExtra').innerHTML = '';
    try { if (pokeFor) closePoke(); } catch (e) {}   // 換頁時收起朋友小視窗
    if (id === 'tab-stats') renderStats();
    if (id === 'tab-calendar') applyCalView();
    if (id === 'tab-countdown') tick();
    if (id === 'tab-room') { roomStart(); renderRoom(); }
    if (id === 'tab-ai') renderAI();
    if (id === 'tab-syllabus') { renderSyllabus(); if (!state.syllabus.picked) setTimeout(() => { if (document.body.dataset.tab === 'tab-syllabus' && !document.querySelector('.modal.open')) openSylPick(); }, 350); }
    if (id === 'tab-weekly' || id === 'tab-syllabus') lsSet(LS.progView, id);
    lsSet(LS.tab, id);
    if (id === 'tab-timer') { timeUp = false; renderTimer(); }   // 碼錶／收起後的計時頁／休息畫面，依目前狀態重畫
    applyFocusMode();
    window.scrollTo({ top: 0 });
}
// 點「進度」：回到上次看的（本週進度或學測範圍）
tabBtns.forEach(b => b.addEventListener('click', () => {
    let id = b.dataset.tab;
    if (id === 'tab-timer' && (timer.phase === 'focus' || timeUp)) { focusMin = false; timeUp = false; }   // 計時中點「計時」＝回到碼錶
    if (id === 'tab-weekly' && document.body.dataset.tab !== 'tab-weekly' && document.body.dataset.tab !== 'tab-syllabus' && localStorage.getItem(LS.progView) === 'tab-syllabus') id = 'tab-syllabus';
    showTab(id);
}));
// 子頁面右上角的按鈕（分享、⋯ 等），只在那一頁顯示
function setTopExtra(tab, html) { if (document.body.dataset.tab === tab) $('topExtra').innerHTML = html; }
function goBack() {
    const tab = document.body.dataset.tab;
    if (tab === 'tab-room' && roomView) { try { if (pokeFor) closePoke(); } catch (e) {} roomView = null; renderRoom(); window.scrollTo({ top: 0 }); return; }
    showTab(tab === 'tab-ai' ? 'tab-weekly' : 'tab-timer');
}
$('backBtn').addEventListener('click', goBack);
$('topExtra').addEventListener('click', (e) => {
    const b = e.target.closest('[data-top]');
    if (!b) return;
    const a = b.dataset.top;
    if (a === 'share-day') openShareCard(statSel || todayStr());
    else if (a === 'room-menu') openRoomMenu();
    else if (a === 'me') openMeModal();
});

/* =====================================================
 * 彈出視窗
 * ===================================================== */
// 彈窗開著時，後面的頁面不跟著捲動
const syncScrollLock = () => document.body.classList.toggle('modal-open', !!document.querySelector('.modal.open'));
function openModal(id) {
    // 個人設定：每次打開都從最上面（帳號資料）開始；順便先在背景載好隱私權政策，點進去不用等
    if (id === 'accountModal') { const sh = $(id).querySelector('.sheet'); if (sh) sh.scrollTop = 0; setTimeout(preloadPrivacy, 400); renderNotifRow(); }
    $(id).classList.add('open'); syncScrollLock();
}
function closeModal(id) {
    $(id).classList.remove('open');
    // 關掉視窗時讓輸入框失去焦點，快捷鍵才會恢復作用
    if (document.activeElement && $(id).contains(document.activeElement)) document.activeElement.blur();
    syncScrollLock();
    if (id === 'rouletteModal') stopSpin();
    // 個人設定關掉後，主題色、背景的展開也收起來（等視窗淡出後再收，不會看到跳動）
    if (id === 'accountModal') setTimeout(() => { if (!$('accountModal').classList.contains('open')) closeFolds(); }, 220);
}
document.querySelectorAll('.modal').forEach(m => {
    // data-locked 的視窗（加到主畫面教學）只能按裡面的按鈕關閉
    m.addEventListener('click', (e) => { if (m.hasAttribute('data-locked')) return; if (e.target === m || e.target.closest('[data-close]')) closeModal(m.id); });
});
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelectorAll('.modal.open');
    // 疊在一起的視窗（例如當天明細上的編輯紀錄）一次只關最上面那個
    if (open.length) { const top = open[open.length - 1]; if (!top.hasAttribute('data-locked')) closeModal(top.id); }
    else if (document.body.classList.contains('sub') && !isTyping(document.activeElement)) goBack();   // 子頁面按 Esc 返回
});
function onEnter(el, fn) {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); fn(); } });
}

/* =====================================================
 * 1. 倒數
 * ===================================================== */
const examEntries = Object.entries(EXAMS).sort((a, b) => a[1].date.localeCompare(b[1].date));
const examEndTime = (e) => examTime(e.end || e.date) + 86400000;
const examsOn = (ds) => examEntries.filter(([, e]) => e.date <= ds && ds <= (e.end || e.date)).map(([, e]) => e);
const shortDate = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const examTitle = (e) => e.end ? `${e.name}（${shortDate(e.date)}–${shortDate(e.end)}）` : e.name;
let examKey = localStorage.getItem(LS.exam) || 'gsat';

/* --- 倒數：內建考試＋自己加的（段考、英檢、生日…） --- */
// 每年重複的（生日）：今年的還沒過就用今年，過了就換明年
function cdNextDate(c) {
    if (!c.yearly) return c.date;
    const md = c.date.slice(5), t = todayStr();
    for (let y = Number(t.slice(0, 4)); y < Number(t.slice(0, 4)) + 2; y++) {
        let d = `${y}-${md}`;
        if (md === '02-29' && new Date(y, 1, 29).getMonth() !== 1) d = `${y}-02-28`;
        if (d >= t) return d;
    }
    return c.date;
}
function cdAll() {
    return [
        ...examEntries.map(([k, e]) => ({ key: k, builtin: true, name: e.name, short: e.short, date: e.date, end: e.end })),
        ...state.countdowns.items.map(c => ({ key: c.id, builtin: false, name: c.name, short: c.short, date: cdNextDate(c), end: c.end, color: c.color, yearly: c.yearly, cal: c.cal }))
    ];
}
const getCd = (key) => cdAll().find(c => c.key === key) || null;
const cdEnded = (c, now = Date.now()) => examEndTime(c) <= now;
// 放在上方的（最多 3 個，學測一定在）：
// 1. 自己排過的順序優先；沒排過就照日期
// 2. 已經過完的自動拿掉，空出來的位置補上「下一個要到的」（自己取消勾選過的不會被補回來）
function cdPins() {
    const all = cdAll(), now = Date.now();
    const byKey = new Map(all.map(c => [c.key, c]));
    const off = new Set(state.countdowns.off || []);
    const saved = state.countdowns.pins;
    const others = (saved || []).filter(k => k !== CD_FIXED && byKey.has(k));
    let keep = others.filter(k => !cdEnded(byKey.get(k), now));
    // 自己排過：只補「過完了被拿掉」的空位；沒排過：照日期放滿
    const room = saved ? Math.min(CD_MAX - 1 - keep.length, others.length - keep.length) : CD_MAX - 1 - keep.length;
    const upcoming = all.filter(c => c.key !== CD_FIXED && !keep.includes(c.key) && !off.has(c.key) && !cdEnded(c, now))
        .sort((x, y) => x.date.localeCompare(y.date)).map(c => c.key);
    keep.push(...upcoming.slice(0, Math.max(0, room)));
    keep = keep.slice(0, CD_MAX - 1);
    if (!saved) keep.sort((x, y) => byKey.get(x).date.localeCompare(byKey.get(y).date));
    return [...keep, CD_FIXED];   // 學測固定在最右邊
}
let cdPicked = false;   // 這次打開時自己從「⋯」點來看的（就算已經結束也讓你看）
function renderExamChips() {
    const now = Date.now();
    const keys = cdPins();
    // 選的那個不見了、或已經過完又不在上方 → 自動回到上方第一個
    const cur = getCd(examKey);
    if (!cur || (!keys.includes(examKey) && cdEnded(cur, now) && !cdPicked)) { examKey = keys[0] || CD_FIXED; lsSet(LS.exam, examKey); }
    const outside = !keys.includes(examKey);   // 從「⋯」裡選了沒放在上方的：「⋯」按鈕亮起來，上方三個不動
    setHtml($('examChips'), keys.map(k => getCd(k)).filter(Boolean).map(c => {
        const cls = ['chip', c.key === examKey ? 'active' : '', cdEnded(c, now) ? 'past' : ''].join(' ');
        return `<button class="${cls}" role="tab" aria-selected="${c.key === examKey}" data-exam="${esc(c.key)}">${c.color ? `<i class="cd-dot" style="background:${c.color}"></i>` : ''}${esc(c.short)}</button>`;
    }).join('') + `<button class="chip chip-more ${outside ? 'active' : ''}" data-cdall aria-label="${outside ? `正在看：${esc(cur?.name || '')}，點開全部倒數` : '全部倒數、新增倒數'}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg></button>`);
}
function selectCd(key) {
    examKey = key;
    lsSet(LS.exam, examKey);
    renderExamChips();
    tick();
    const hero = document.querySelector('#tab-countdown .hero');
    if (hero && !matchMedia('(prefers-reduced-motion: reduce)').matches) { hero.classList.remove('swap'); void hero.offsetWidth; hero.classList.add('swap'); }
}
$('examChips').addEventListener('click', (e) => {
    if (e.target.closest('[data-cdall]')) { openCdManage(); return; }
    const b = e.target.closest('[data-exam]');
    if (!b || b.dataset.exam === examKey) return;
    cdPicked = false;
    selectCd(b.dataset.exam);
});

/* ② 數字滾動：數字改變時，每一位像翻牌一樣往上滾 */
function roll(el, str) {
    if (!el || el.dataset.rv === str) return;
    const chars = String(str).split('');
    const shape = chars.map(c => (/\d/.test(c) ? 'd' : c)).join('');
    if (el.dataset.shape !== shape) {
        el.dataset.shape = shape;
        el.classList.add('roll');
        el.innerHTML = `<span class="sr"></span>` + chars.map(c => /\d/.test(c)
            ? `<span class="rd" aria-hidden="true"><span class="rd-col">${'0123456789'.split('').map(n => `<span>${n}</span>`).join('')}</span></span>`
            : `<span aria-hidden="true">${esc(c)}</span>`).join('');
    }
    el.dataset.rv = str;
    el.querySelector('.sr').textContent = str;
    const cols = el.querySelectorAll('.rd-col');
    let i = 0;
    chars.forEach(c => { if (/\d/.test(c)) cols[i++].style.transform = `translateY(-${c}em)`; });
}

// 內容一樣就不重寫（每秒都會呼叫，避免不必要的重新排版）
const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
const setHtml = (el, v) => { if (el.dataset.h !== v) { el.dataset.h = v; el.innerHTML = v; } };
let homeRoomDue = 0;
function tick() {
    if (document.body.dataset.tab !== 'tab-countdown' || document.visibilityState === 'hidden') return;   // 看不到就不用更新
    const now = Date.now();
    const exam = getCd(examKey) || getCd('gsat');
    const diff = examTime(exam.date) - now;
    setText($('cdEyebrow'), `${exam.date.slice(0, 4)} · ${exam.name}`);
    const hero = document.querySelector('#tab-countdown .hero');
    if (hero.dataset.cdColor !== (exam.color || '')) { hero.dataset.cdColor = exam.color || ''; if (exam.color) hero.style.setProperty('--cd-color', exam.color); else hero.style.removeProperty('--cd-color'); hero.classList.toggle('custom', !!exam.color); }
    const ed = parseYmd(exam.date);
    let dateHtml = `${exam.builtin ? '考試日期' : (exam.yearly ? '下一次' : '日期')} <strong>${ed.getFullYear()}/${pad(ed.getMonth() + 1)}/${pad(ed.getDate())}</strong>（${WEEK_ZH[ed.getDay()]}）`;
    if (exam.end) {
        const ee = parseYmd(exam.end);
        dateHtml += ` – <strong>${pad(ee.getMonth() + 1)}/${pad(ee.getDate())}</strong>（${WEEK_ZH[ee.getDay()]}）`;
    }
    setHtml($('cdDate'), dateHtml);
    if (diff > 0) {
        roll($('days'), pad(Math.floor(diff / 86400000)));
        roll($('hours'), pad(Math.floor(diff % 86400000 / 3600000)));
        roll($('minutes'), pad(Math.floor(diff % 3600000 / 60000)));
        roll($('seconds'), pad(Math.floor(diff % 60000 / 1000)));
        setText($('cdNote'), '');
    } else {
        ['days', 'hours', 'minutes', 'seconds'].forEach(id => roll($(id), '00'));
        setText($('cdNote'), now < examEndTime(exam) ? (exam.builtin ? '考試進行中，加油！' : '就是今天！') : (exam.builtin ? '這場已經考完了，辛苦了！' : '這天已經過了'));
    }
    const next = examEntries.map(([, e]) => ({ ...e, diff: examTime(e.date) - now }))
        .filter(e => e.diff > 0).sort((a, b) => a.diff - b.diff)[0];
    if (homeRoomDue < now) { homeRoomDue = now + 15000; renderHomeRoom(); }
    setHtml($('nextExamLine'), next
        ? `下一場：${esc(next.name)} · 還有 <strong>${Math.ceil(next.diff / 86400000)}</strong> 天`
        : '所有考試都完成了，恭喜！');
}

// 今天：讀了多久（對照每日目標）＋進度表中「今天」有寫內容的格子
function renderToday() {
    const t = todayStr();
    const items = [];
    SUBJECTS.forEach((subj, s) => {
        for (let slot = 0; slot < SLOTS; slot++) {
            const key = `${t}_${s}_${slot}`;
            const d = state.weekly[key];
            if (d && d.text) items.push({ key, s, subj, text: d.text, done: !!d.done });
        }
    });
    // 今天（和已經逾期）的待辦也列在這裡，不用兩邊跑
    const tds = state.todos.filter(x => x.date && x.date <= t).sort((a, b) => a.date.localeCompare(b.date));
    const done = items.filter(i => i.done).length;
    const total = items.length + tds.length;
    $('todayCount').textContent = total ? `${total} 項 · 完成 ${done} 項` : '';
    const min = Math.round(dayMinutes(t)), goal = tpref.goal;
    const left = goal - min;
    $('todayTime').innerHTML = `${hmHtml(min)}<button class="goal-of goal-btn" id="goalBtn" aria-label="每日目標 ${goal / 60} 小時，點一下修改">／ 目標 ${goal / 60} 小時<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg></button>`;
    $('todayTag').className = 'tag ' + (left <= 0 ? 'ok' : 'warn');
    $('todayTag').textContent = left <= 0 ? '今天達標了' : `還差 ${fmtHM(left)}`;
    $('todayBar').style.width = Math.min(100, min / goal * 100) + '%';
    $('todayList').innerHTML = total
        ? items.map(i => `
            <li class="check-item ${i.done ? 'done' : ''}">
                <input type="checkbox" class="checkbox" data-key="${esc(i.key)}" ${i.done ? 'checked' : ''} aria-label="完成 ${esc(i.subj)}">
                <span class="text"><span class="subj" style="color:var(--s${i.s})">${esc(i.subj)}</span>${esc(i.text)}</span>
            </li>`).join('') + tds.map(x => `
            <li class="check-item">
                <input type="checkbox" class="checkbox" data-todo="${esc(x.id)}" aria-label="完成待辦">
                <span class="text"><span class="subj todo-subj">待辦</span>${esc(x.text)}${x.date < t ? todoDateTag(x.date) : ''}</span>
            </li>`).join('')
        : `<li class="empty">今天還沒安排進度，<button class="btn btn-small" id="goWeekBtn">去安排</button></li>`;
}
$('todayList').addEventListener('change', (e) => {
    if (e.target.dataset.todo) { if (e.target.checked) completeTodoById(e.target.dataset.todo); return; }
    const key = e.target.dataset.key;
    if (!key || !state.weekly[key]) return;
    state.weekly[key].done = e.target.checked;
    if (e.target.checked) weeklyUnitDone(key);
    save(); renderToday(); renderWeek();
});
// 倒數頁：點「目標 3 小時」直接改每日目標
$('todayTime').addEventListener('click', (e) => {
    if (!e.target.closest('#goalBtn')) return;
    $('goalGrid').innerHTML = GOALS.map(g => `<button class="goal-opt ${g === tpref.goal ? 'active' : ''}" data-goal="${g}" aria-pressed="${g === tpref.goal}"><b class="num">${g / 60}</b>小時</button>`).join('');
    openModal('goalModal');
});
$('goalGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-goal]');
    if (!b) return;
    tpref.goal = Number(b.dataset.goal); saveTpref();
    renderStats(); renderTimer(); renderToday();
    closeModal('goalModal');
    toast(`每日目標改成 ${tpref.goal / 60} 小時`);
});
$('todayList').addEventListener('click', (e) => {
    if (e.target.id === 'goWeekBtn') { weekMonday = getMonday(new Date()); selectedDayIdx = null; renderWeek(); showTab('tab-weekly'); }
});

/* --- 轉盤 --- */
let spinI = null, spinT = null;
function stopSpin() { clearInterval(spinI); clearTimeout(spinT); spinI = spinT = null; }
function spin() {
    stopSpin();
    $('rouletteBtns').style.visibility = 'hidden';
    let i = 0;
    spinI = setInterval(() => { $('rouletteResult').textContent = SUBJECTS[i++ % SUBJECTS.length]; }, 80);
    $('rouletteSub').textContent = '';
    // 有選學測科目的話只轉選了的科目；有重點複習時，一半機會直接推薦重點單元
    const picked = state.syllabus.picked;
    const pool = picked ? SUBJECTS.map((n, i) => i).filter(i => picked.some(g => SYL_GROUP[g].s === i)) : SUBJECTS.map((n, i) => i);
    const flags = sylFlags();
    spinT = setTimeout(() => {
        stopSpin();
        let s = pool[Math.floor(Math.random() * pool.length)], unit = null;
        if (flags.length && Math.random() < .5) { const f = flags[Math.floor(Math.random() * flags.length)]; s = f.s; unit = f; }
        else { const fs = flags.filter(f => f.s === s); if (fs.length) unit = fs[Math.floor(Math.random() * fs.length)]; }
        $('rouletteResult').textContent = SUBJECTS[s];
        $('rouletteSub').textContent = unit ? `重點複習：${unit.u}` : '';
        $('rouletteBtns').style.visibility = 'visible';
    }, 1800);
}
$('rouletteBtn').addEventListener('click', () => { openModal('rouletteModal'); spin(); });
$('spinAgainBtn').addEventListener('click', spin);

/* =====================================================
 * 2. 每週進度
 * ===================================================== */
function getMonday(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - (x.getDay() + 6) % 7);
    return x;
}
let weekMonday = getMonday(new Date());
let selectedDayIdx = null; // null = 自動（本週選今天，其他週選星期一）
let editingKey = null;
let pickedColor = '';

function weekDays() {
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(weekMonday); d.setDate(d.getDate() + i); return d; });
}
function slotHtml(key, title) {
    const d = state.weekly[key];
    const cls = ['slot'];
    if (!d || (!d.text && !d.color && !d.done)) cls.push('empty');
    if (d?.done) cls.push('done');
    if (d?.color) cls.push(`c-${d.color}`);
    const text = d?.text ? esc(d.text) : (d?.done || d?.color ? '' : '<span class="add-hint">＋ 新增</span>');
    return `<button class="${cls.join(' ')}" data-key="${key}" data-title="${esc(title)}">${text}</button>`;
}

function renderWeek() {
    const days = weekDays();
    const t = todayStr();
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    $('weekRange').textContent = `${fmt(days[0])} – ${fmt(days[6])}`;

    let total = 0, done = 0;
    days.forEach(d => SUBJECTS.forEach((_, s) => { for (let k = 0; k < SLOTS; k++) {
        const v = state.weekly[`${ymd(d)}_${s}_${k}`];
        if (v && v.text) { total++; if (v.done) done++; }
    } }));
    const pct = total ? Math.round(done / total * 100) : 0;
    $('weekBar').style.width = pct + '%';
    $('weekSub').textContent = total ? `本週完成 ${done} / ${total} · ${pct}%` : '本週還沒有安排進度';

    const todayIdx = days.findIndex(d => ymd(d) === t);
    $('thisWeekBtn').style.display = todayIdx >= 0 ? 'none' : '';
    $('thisWeekBtn').parentElement.style.display = todayIdx >= 0 && !AI_ON ? 'none' : '';   // AI 隱藏時，本週那一排沒東西就整排收起來，不留空白
    const sel = selectedDayIdx ?? (todayIdx >= 0 ? todayIdx : 0);

    // 手機：日期選擇＋當天各科
    $('dayChips').innerHTML = days.map((d, i) => {
        const ds = ymd(d);
        const has = SUBJECTS.some((_, s) => [...Array(SLOTS).keys()].some(k => state.weekly[`${ds}_${s}_${k}`]?.text));
        const cls = ['day-chip', has ? 'has' : '', ds === t ? 'today' : '', i === sel ? 'selected' : ''].join(' ');
        return `<button class="${cls}" data-idx="${i}" aria-label="${fmt(d)} 星期${WEEK_ZH[d.getDay()]}"><span class="w">${WEEK_ZH[d.getDay()]}</span><span class="n num">${d.getDate()}</span><span class="dot"></span></button>`;
    }).join('');
    const sd = days[sel], sds = ymd(sd);
    const exams = examsOn(sds).map(e => e.name);
    $('dayLabel').textContent = `${sd.getMonth() + 1} 月 ${sd.getDate()} 日 · 星期${WEEK_ZH[sd.getDay()]}${exams.length ? ' · ' + exams.join('、') : ''}`;
    $('dayPlan').innerHTML = SUBJECTS.map((subj, s) => `
        <div class="subject-row">
            <div class="subject-name">${subj}</div>
            <div class="slots">${[...Array(SLOTS).keys()]
                .filter(k => k === 0 || state.weekly[`${sds}_${s}_${k - 1}`]?.text || state.weekly[`${sds}_${s}_${k}`])
                .map(k => slotHtml(`${sds}_${s}_${k}`, `${fmt(sd)} ${subj}`)).join('')}</div>
        </div>`).join('');

    // 電腦：整週表格
    let html = '<thead><tr><th class="subject-col">科目</th>';
    days.forEach(d => {
        const ds = ymd(d);
        const tags = examsOn(ds).map(e => `<span class="exam-tag">${esc(e.short)}</span>`).join(' ');
        html += `<th class="${ds === t ? 'today' : ''}">星期${WEEK_ZH[d.getDay()]}<span class="d">${fmt(d)}</span>${tags}</th>`;
    });
    html += '</tr></thead><tbody>';
    SUBJECTS.forEach((subj, s) => {
        for (let k = 0; k < SLOTS; k++) {
            html += '<tr>';
            if (k === 0) html += `<td class="subject-col" rowspan="${SLOTS}">${subj}</td>`;
            days.forEach(d => {
                const ds = ymd(d);
                html += `<td class="${ds === t ? 'today' : ''}">${slotHtml(`${ds}_${s}_${k}`, `${fmt(d)} ${subj}`)}</td>`;
            });
            html += '</tr>';
        }
    });
    $('weekTable').innerHTML = html + '</tbody>';
}

$('tab-weekly').addEventListener('click', (e) => {
    const chip = e.target.closest('.day-chip');
    if (chip) { selectedDayIdx = Number(chip.dataset.idx); renderWeek(); return; }
    const slot = e.target.closest('.slot');
    if (slot) openWeeklyModal(slot.dataset.key, slot.dataset.title);
});
$('prevWeekBtn').addEventListener('click', () => { weekMonday.setDate(weekMonday.getDate() - 7); selectedDayIdx = null; renderWeek(); });
$('nextWeekBtn').addEventListener('click', () => { weekMonday.setDate(weekMonday.getDate() + 7); selectedDayIdx = null; renderWeek(); });
$('thisWeekBtn').addEventListener('click', () => { weekMonday = getMonday(new Date()); selectedDayIdx = null; renderWeek(); });

const colorDots = document.querySelectorAll('.color-dot');
function pickColor(c) { pickedColor = c; colorDots.forEach(d => d.classList.toggle('selected', d.dataset.color === c)); }
colorDots.forEach(d => d.addEventListener('click', () => pickColor(d.dataset.color)));

function openWeeklyModal(key, title) {
    editingKey = key;
    const d = state.weekly[key] || {};
    $('weeklyTitle').textContent = title;
    $('weeklyText').value = d.text || '';
    $('weeklyDone').checked = !!d.done;
    pickColor(d.color || '');
    weeklyUnit = d.unit || null;
    renderUnitSug();
    openModal('weeklyModal');
    setTimeout(() => { if ($('weeklyModal').classList.contains('open')) $('weeklyText').focus(); }, 120);
}
$('weeklyText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $('saveWeeklyBtn').click(); }
});
$('saveWeeklyBtn').addEventListener('click', () => {
    const text = $('weeklyText').value.trim();
    const done = $('weeklyDone').checked;
    const wasDone = !!state.weekly[editingKey]?.done;
    if (!text && !done && !pickedColor) delete state.weekly[editingKey];
    else {
        state.weekly[editingKey] = { text, done, color: pickedColor };
        // 從學測範圍選的單元：文字裡還有這個單元名稱才保留連結
        const u = weeklyUnit && weeklyUnit.split('/').slice(1).join('/');
        if (u && text.includes(u)) state.weekly[editingKey].unit = weeklyUnit;
    }
    if (done && !wasDone) weeklyUnitDone(editingKey);
    save(); renderWeek(); renderToday();
    closeModal('weeklyModal');
});

/* --- 每週進度 × 學測範圍 ---
 * 編輯格子時，下面列出這一科的學測單元（重點複習排最前面、熟練的不列），點一下就填進去
 * 打勾完成時，如果這格是某個單元而且還是「未讀」，自動改成「讀過」 */
let weeklyUnit = null;
function unitsForSubject(s) {
    if (!state.syllabus.picked) return [];
    const sy = state.syllabus, all = sylAll().filter(x => x.s === s && (sy.status[x.k] || 0) < 2);
    return [...all.filter(x => sy.flags.includes(x.k)), ...all.filter(x => !sy.flags.includes(x.k))];
}
function renderUnitSug() {
    const s = Number(String(editingKey || '').split('_')[1]);
    const list = Number.isInteger(s) ? unitsForSubject(s) : [];
    const el = $('unitSug');
    el.hidden = !list.length;
    if (!list.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<span class="field-label">從學測範圍選</span><div class="unit-chips">${list.slice(0, 24).map(x => {
        const on = weeklyUnit === x.k, fl = state.syllabus.flags.includes(x.k), st = state.syllabus.status[x.k] || 0;
        return `<button class="unit-chip ${on ? 'on' : ''} ${fl ? 'flag' : ''}" data-unit="${esc(x.k)}" aria-pressed="${on}">${fl ? ICON_BOOK : ''}${esc(x.u)}${st === 1 ? '<small>讀過</small>' : ''}</button>`;
    }).join('')}</div>`;
}
$('unitSug').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unit]');
    if (!b) return;
    const k = b.dataset.unit, u = k.split('/').slice(1).join('/'), ta = $('weeklyText');
    if (weeklyUnit === k) {   // 再點一次：取消
        if (ta.value.trim() === u) ta.value = '';
        weeklyUnit = null;
    } else {
        const prev = weeklyUnit && weeklyUnit.split('/').slice(1).join('/');
        // 原本是空的或只有上一個單元名稱 → 換成這個；否則加在前面
        ta.value = !ta.value.trim() || ta.value.trim() === prev ? u + ' ' : `${u} ${ta.value.replace(prev ? prev + ' ' : '', '').trim()}`;
        weeklyUnit = k;
        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    }
    renderUnitSug();
});
// 回傳提示文字（給計時頁合併成一則訊息），quiet=false 時自己跳提示
function weeklyUnitDone(key, quiet) {
    const d = state.weekly[key];
    if (!d || !state.syllabus.picked) return '';
    let k = d.unit;
    if (!k) {   // 沒有連結的話，用文字比對這一科的單元（取最長、唯一的那個）
        const s = Number(key.split('_')[1]);
        const hits = sylAll().filter(x => x.s === s && x.u.length >= 2 && (d.text || '').includes(x.u)).sort((a, b) => b.u.length - a.u.length);
        if (hits.length && (hits.length === 1 || hits[0].u.length > hits[1].u.length)) k = hits[0].k;
    }
    if (!k || !sylAll().some(x => x.k === k) || (state.syllabus.status[k] || 0) > 0) return '';
    state.syllabus.status[k] = 1;
    renderSyllabus();
    const msg = `「${k.split('/').slice(1).join('/')}」標成讀過了`;
    if (!quiet) toast(`學測範圍：${msg}`, { label: '復原', fn: () => { delete state.syllabus.status[k]; save(); renderSyllabus(); } });
    return msg;
}
$('clearWeeklyBtn').addEventListener('click', () => {
    const key = editingKey, old = state.weekly[key];
    delete state.weekly[key];
    save(); renderWeek(); renderToday();
    closeModal('weeklyModal');
    if (old) toast('已清除', { label: '復原', fn: () => { state.weekly[key] = old; save(); renderWeek(); renderToday(); } });
});

/* =====================================================
 * 2-2. 學測範圍：每科的單元清單，讀完一個勾一個
 * 資料放在 state.syllabus，跟著帳號同步
 *   picked：選了哪些科目（例如 ['國文','英文','數學A','物理']），null 代表還沒選
 *   custom：使用者改過的單元清單（沒改過就用預設）
 *   status：'物理/能量' → 0 未讀、1 讀過、2 熟練
 *   flags：重點複習的單元
 * ===================================================== */
// 依 108 課綱學測範圍整理的大方向（國英考到高三上必修，數社自是高一、高二部定必修），可以自己改
const SYL = [
    { s: 3, name: '國文', groups: [['國文', ['燭之武退秦師', '大同與小康', '諫逐客書', '鴻門宴', '出師表', '桃花源記', '師說', '始得西山宴遊記', '岳陽樓記', '赤壁賦', '晚遊六橋待月記', '項脊軒志', '廉恥', '臺灣通史序', '勸和論', '白話文選讀', '國學常識與文化經典', '字音字形與成語', '國寫：知性題', '國寫：情意題']]] },
    { s: 2, name: '英文', groups: [['英文', ['單字 Level 1–2', '單字 Level 3–4', '單字 Level 5–6', '文法', '克漏字', '文意選填', '篇章結構', '閱讀測驗', '混合題', '中譯英', '英文作文']]] },
    { s: 0, name: '數學', pickOne: true, groups: [
        ['數學A', ['數與式', '直線與圓', '多項式函數', '數列與級數', '數據分析', '排列組合', '機率', '三角函數', '指數與對數函數', '平面向量', '空間向量', '空間中的平面與直線', '矩陣', '條件機率與貝氏定理']],
        ['數學B', ['數與式', '直線與圓', '多項式函數', '數列與級數', '數據分析', '排列組合', '機率', '三角函數', '指數與對數函數', '平面向量', '空間概念', '矩陣', '條件機率與貝氏定理']]] },
    { s: 4, name: '社會', groups: [
        ['歷史', ['臺灣史：早期與清代', '臺灣史：日治時期', '臺灣史：戰後', '東亞史', '世界史', '史料閱讀與判讀']],
        ['地理', ['地圖與地理資訊', '地形', '氣候', '水文', '人口', '聚落與都市', '產業', '全球化與區域發展', '區域地理']],
        ['公民', ['社會與文化', '民主政治', '法律與生活', '經濟與市場', '公共議題與時事']]] },
    { s: 1, name: '自然', groups: [
        ['物理', ['科學方法與單位', '物質組成與基本交互作用', '物體的運動', '能量與能量守恆', '電與磁', '波動、光與聲音', '量子現象']],
        ['化學', ['物質的組成與特性', '原子構造與週期表', '化學反應與計量', '水溶液與酸鹼', '氧化還原', '化學與能源', '生活中的化學']],
        ['生物', ['細胞的構造與功能', '遺傳', '演化', '生物多樣性', '生態系與環境']],
        ['地科', ['宇宙與天文', '地球的大氣', '海洋', '固體地球與板塊', '地球歷史與災害']]] }
];
const SYL_GROUP = {};   // '物理' → { s, subj }
SYL.forEach(x => x.groups.forEach(([g, units]) => { SYL_GROUP[g] = { s: x.s, subj: x.name, def: units }; }));
const SYL_STATUS = ['未讀', '讀過', '熟練'];
const ICON_BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';

function normSyllabus(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const picked = Array.isArray(r.picked) ? r.picked.filter(g => SYL_GROUP[g]) : null;
    const custom = {};
    if (r.custom && typeof r.custom === 'object') Object.entries(r.custom).forEach(([g, list]) => {
        if (SYL_GROUP[g] && Array.isArray(list)) custom[g] = [...new Set(list.map(u => String(u).trim().slice(0, 30)).filter(Boolean))].slice(0, 60);
    });
    const status = {};
    if (r.status && typeof r.status === 'object') Object.entries(r.status).forEach(([k, v]) => { v = v | 0; if (v > 0 && v < 3) status[k] = v; });
    const flags = Array.isArray(r.flags) ? [...new Set(r.flags.map(String))].slice(0, 100) : [];
    return { picked, custom, status, flags };
}
const sylUnits = (g) => state.syllabus.custom[g] || SYL_GROUP[g].def;
const sylKey = (g, u) => `${g}/${u}`;
// 目前選的科目裡所有的單元
function sylAll() {
    const sy = state.syllabus, out = [];
    if (!sy.picked) return out;
    SYL.forEach(x => x.groups.forEach(([g]) => {
        if (sy.picked.includes(g)) sylUnits(g).forEach(u => out.push({ g, u, k: sylKey(g, u), s: x.s }));
    }));
    return out;
}
// 重點複習（只算目前還存在的單元）
function sylFlags() {
    const all = new Map(sylAll().map(x => [x.k, x]));
    return state.syllabus.flags.map(k => all.get(k)).filter(Boolean);
}
const sylScore = (k) => (state.syllabus.status[k] || 0) / 2;

let sylEdit = false;
let sylOpen = new Set(lsGet(LS.sylOpen, null) || ['國文']);
function saveSylOpen() { lsSet(LS.sylOpen, [...sylOpen]); }

function renderSyllabus() {
    const el = $('sylBody');
    if (!el) return;
    const sy = state.syllabus;
    if (!sy.picked) {
        el.innerHTML = `<div class="syl-empty">
            <div class="syl-empty-ic">${ICON_BOOK}</div>
            <h3>把學測範圍變成清單</h3>
            <p>選好要考的科目，就會列出每科的單元。讀完一個勾一個，隨時知道自己準備了幾 %。</p>
            <button class="btn btn-accent btn-wide" data-syl="pick">選擇科目</button>
        </div>`;
        return;
    }
    const all = sylAll();
    const total = all.length ? all.reduce((a, x) => a + sylScore(x.k), 0) / all.length : 0;
    const left = all.filter(x => (sy.status[x.k] || 0) < 2).length;
    const ex = examEntries.find(([k]) => k === 'gsat')?.[1] || nextExam();
    const daysLeft = ex ? Math.max(0, Math.floor((examTime(ex.date) - Date.now()) / 86400000)) : null;   // 和倒數頁的天數一致
    const C = 2 * Math.PI * 30;
    // 各科在整體裡占多少（彩色條）
    const bySubj = SYL.map(x => {
        const us = all.filter(a => a.s === x.s);
        return { x, us, done: us.reduce((a, u) => a + sylScore(u.k), 0) };
    }).filter(o => o.us.length);
    const stack = bySubj.map(o => `<i style="width:${o.done / Math.max(1, all.length) * 100}%;background:var(--s${o.x.s})"></i>`).join('');
    const flags = sylFlags();
    let h = `<div class="syl-sum">
        <svg class="syl-ring" viewBox="0 0 72 72" aria-hidden="true"><circle class="tr" cx="36" cy="36" r="30"/><circle class="pr" cx="36" cy="36" r="30" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - total)).toFixed(1)}" transform="rotate(-90 36 36)"/></svg>
        <div class="syl-pct num" aria-label="整體完成度 ${Math.round(total * 100)}%">${Math.round(total * 100)}<small>%</small></div>
        <div class="syl-sum-t">
            <b>整體完成度</b>
            <span>還有 <span class="num">${left}</span> 個單元沒熟練${daysLeft !== null ? `　距${esc(ex.short || '學測')} <span class="num">${daysLeft}</span> 天` : ''}</span>
            <div class="syl-stack">${stack}</div>
        </div>
    </div>
    <div class="syl-tools">
        <button class="btn btn-small" data-syl="pick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>選科目</button>
        <button class="btn btn-small ${sylEdit ? 'btn-accent' : ''}" data-syl="edit">${sylEdit ? '完成編輯' : '編輯單元'}</button>
    </div>
    <div class="syl-focus">
        <h4>${ICON_BOOK}重點複習<small>${flags.length ? flags.length + ' 個' : ''}</small></h4>
        <div class="syl-fchips">${flags.length ? flags.map(f => `<button class="syl-fchip" data-goto="${esc(f.k)}"><i style="background:var(--s${f.s})"></i>${esc(f.u)}</button>`).join('')
            : '<span class="syl-fempty">點單元右邊的書籤，就會出現在這裡提醒你</span>'}</div>
    </div>`;
    for (const x of SYL) {
        const groups = x.groups.filter(([g]) => sy.picked.includes(g));
        if (!groups.length) continue;
        const us = all.filter(a => a.s === x.s);
        const p = us.length ? us.reduce((a, u) => a + sylScore(u.k), 0) / us.length : 0;
        const open = sylOpen.has(x.name) || sylEdit;
        h += `<div class="syl-subj ${open ? 'open' : ''}">
            <button class="syl-subj-h" data-open="${x.name}" aria-expanded="${open}">
                <i style="background:var(--s${x.s})"></i>${x.name}<span class="syl-cnt">${us.filter(u => (sy.status[u.k] || 0) === 2).length}/${us.length}</span>
                <span class="syl-subj-pct num">${Math.round(p * 100)}%</span>
                <svg class="syl-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="syl-bar"><i style="width:${p * 100}%;background:var(--s${x.s})"></i></div>`;
        if (open) for (const [g] of groups) {
            if (groups.length > 1 || g !== x.name) h += `<div class="syl-grp">${g.replace(/^數學([AB])$/, '數學 $1')}</div>`;
            h += `<ul class="syl-units">` + sylUnits(g).map(u => {
                const k = sylKey(g, u), st = sy.status[k] || 0, fl = sy.flags.includes(k);
                if (sylEdit) return `<li class="syl-unit edit" data-k="${esc(k)}">
                    <input class="field syl-name" value="${esc(u)}" maxlength="30" data-rename="${esc(k)}" aria-label="單元名稱">
                    <button class="icon-btn syl-del" data-del="${esc(k)}" aria-label="刪除 ${esc(u)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>`;
                return `<li class="syl-unit ${st === 2 ? 'done' : ''}" data-k="${esc(k)}">
                    <span class="syl-u">${esc(u)}</span>
                    <button class="syl-st" data-st="${esc(k)}" data-s="${st}" aria-label="${esc(u)}：${SYL_STATUS[st]}，點一下切換">${SYL_STATUS[st]}</button>
                    <button class="syl-flag ${fl ? 'on' : ''}" data-flag="${esc(k)}" aria-pressed="${fl}" aria-label="${fl ? '取消重點複習' : '加入重點複習'}">${ICON_BOOK}</button></li>`;
            }).join('') + `</ul>`;
            if (sylEdit) h += `<div class="syl-add"><input class="field" placeholder="新增單元到${g.replace(/^數學([AB])$/, '數學 $1')}" maxlength="30" data-add="${g}" enterkeyhint="done"><button class="btn btn-small" data-addbtn="${g}">新增</button>${state.syllabus.custom[g] ? `<button class="btn btn-small btn-ghost" data-reset="${g}">恢復預設</button>` : ''}</div>`;
        }
        h += `</div>`;
    }
    const y = window.scrollY;
    el.innerHTML = h;
    if (document.body.dataset.tab === 'tab-syllabus') window.scrollTo(0, y);
}

function sylSave() { save(); renderSyllabus(); renderReviewLine(); }
$('sylBody').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const sy = state.syllabus;
    if (b.dataset.syl === 'pick') { openSylPick(); return; }
    if (b.dataset.syl === 'edit') { sylEdit = !sylEdit; renderSyllabus(); return; }
    if (b.dataset.open) {
        sylOpen.has(b.dataset.open) ? sylOpen.delete(b.dataset.open) : sylOpen.add(b.dataset.open);
        saveSylOpen(); renderSyllabus(); return;
    }
    if (b.dataset.st) {
        const k = b.dataset.st, v = ((sy.status[k] || 0) + 1) % 3;
        if (v) sy.status[k] = v; else delete sy.status[k];
        // 熟練了就自動從重點複習拿掉
        if (v === 2 && sy.flags.includes(k)) { sy.flags = sy.flags.filter(f => f !== k); toast('熟練了！已從重點複習移除'); }
        sylSave(); return;
    }
    if (b.dataset.flag) {
        const k = b.dataset.flag;
        if (sy.flags.includes(k)) sy.flags = sy.flags.filter(f => f !== k);
        else { sy.flags.push(k); toast('已加入重點複習'); }
        sylSave(); return;
    }
    if (b.dataset.goto) {   // 點重點複習的單元：展開那一科並捲過去
        const g = b.dataset.goto.split('/')[0];
        sylOpen.add(SYL_GROUP[g].subj); saveSylOpen(); renderSyllabus();
        const row = [...document.querySelectorAll('.syl-unit')].find(r => r.dataset.k === b.dataset.goto);
        if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1400); }
        return;
    }
    if (b.dataset.del) {
        const k = b.dataset.del, [g, ...rest] = k.split('/'), u = rest.join('/');
        const list = sylUnits(g).slice(), idx = list.indexOf(u);
        if (idx < 0) return;
        const prev = { list: sy.custom[g], st: sy.status[k], fl: sy.flags.includes(k) };
        list.splice(idx, 1);
        sy.custom[g] = list; delete sy.status[k]; sy.flags = sy.flags.filter(f => f !== k);
        sylSave();
        toast(`已刪除「${u}」`, { label: '復原', fn: () => {
            if (prev.list) sy.custom[g] = prev.list; else delete sy.custom[g];
            if (prev.st) sy.status[k] = prev.st;
            if (prev.fl) sy.flags.push(k);
            sylSave();
        } });
        return;
    }
    if (b.dataset.addbtn) { sylAdd(b.dataset.addbtn); return; }
    if (b.dataset.reset) {
        const g = b.dataset.reset;
        if (!confirm(`把「${g}」的單元恢復成預設？自己新增或改名的單元會不見。`)) return;
        delete sy.custom[g]; sylSave(); return;
    }
});
function sylAdd(g) {
    const inp = document.querySelector(`[data-add="${g}"]`);
    const name = (inp?.value || '').trim().slice(0, 30);
    if (!name) { inp?.focus(); return; }
    const list = sylUnits(g).slice();
    if (list.includes(name)) { toast('已經有這個單元了'); return; }
    list.push(name); state.syllabus.custom[g] = list;
    sylSave();
    document.querySelector(`[data-add="${g}"]`)?.focus();
}
$('sylBody').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    if (e.target.dataset.add) { e.preventDefault(); sylAdd(e.target.dataset.add); }
    if (e.target.dataset.rename) { e.preventDefault(); e.target.blur(); }
});
// 改名：離開輸入框時存，進度和重點複習跟著搬過去
$('sylBody').addEventListener('change', (e) => {
    const k = e.target.dataset.rename;
    if (!k) return;
    const sy = state.syllabus, [g, ...rest] = k.split('/'), u = rest.join('/');
    const name = e.target.value.trim().slice(0, 30);
    const list = sylUnits(g).slice(), idx = list.indexOf(u);
    if (idx < 0 || !name || name === u) { e.target.value = u; return; }
    if (list.includes(name)) { toast('已經有這個單元了'); e.target.value = u; return; }
    list[idx] = name; sy.custom[g] = list;
    const nk = sylKey(g, name);
    if (sy.status[k]) { sy.status[nk] = sy.status[k]; delete sy.status[k]; }
    sy.flags = sy.flags.map(f => f === k ? nk : f);
    sylSave();
});

/* --- 選科目 --- */
let sylPickDraft = [];
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function renderSylPick() {
    $('sylPickBody').innerHTML = SYL.map(x => `<div class="syl-pgrp">
        <b><i style="background:var(--s${x.s})"></i>${x.name}${x.pickOne ? '<small>可以都選</small>' : ''}</b>
        <div class="syl-pills">${x.groups.map(([g]) => { const on = sylPickDraft.includes(g); return `<button class="syl-pill ${on ? 'on' : ''}" data-pick="${g}" aria-pressed="${on}">${on ? ICON_CHECK : ''}${g.replace(/^數學([AB])$/, '數學 $1')}</button>`; }).join('')}</div>
    </div>`).join('');
}
function openSylPick() {
    sylPickDraft = state.syllabus.picked ? state.syllabus.picked.slice() : ['國文', '英文', '數學A', '歷史', '地理', '公民', '物理', '化學', '生物', '地科'];
    $('sylPickSave').textContent = state.syllabus.picked ? '儲存' : '開始使用';
    renderSylPick();
    openModal('sylPickModal');
}
$('sylPickBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const g = b.dataset.pick;
    if (sylPickDraft.includes(g)) sylPickDraft = sylPickDraft.filter(n => n !== g);
    else {
        sylPickDraft.push(g);   // 數學 A、B 兩個都要考的人可以都選
    }
    renderSylPick();
});
$('sylPickSave').addEventListener('click', () => {
    if (!sylPickDraft.length) { toast('至少選一科'); return; }
    state.syllabus.picked = sylPickDraft.slice();
    closeModal('sylPickModal');
    sylSave();
});

/* --- 倒數頁「今天」下面：重點複習提醒 --- */
function renderReviewLine() {
    const el = $('reviewLine');
    if (!el) return;
    const flags = sylFlags();
    el.hidden = !flags.length;
    el.closest('.home-mod')?.classList.toggle('mod-empty', !flags.length);
    if (!flags.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<span class="rl-label">${ICON_BOOK}重點複習</span>` +
        flags.slice(0, 3).map(f => `<button class="rl-chip" data-goto="${esc(f.k)}"><i style="background:var(--s${f.s})"></i>${esc(f.u)}</button>`).join('') +
        (flags.length > 3 ? `<button class="rl-chip more" data-goto="">＋${flags.length - 3}</button>` : '');
}
$('reviewLine').addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (!b) return;
    showTab('tab-syllabus');
    if (b.dataset.goto) setTimeout(() => document.querySelector(`.syl-fchip[data-goto="${CSS.escape(b.dataset.goto)}"]`)?.click(), 60);
});

/* --- 進度分頁上方：本週進度／學測範圍 --- */
document.querySelectorAll('.prog-seg').forEach(seg => seg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-prog]');
    if (b && document.body.dataset.tab !== b.dataset.prog) showTab(b.dataset.prog);
}));

/* =====================================================
 * 3. 行事曆
 * ===================================================== */
let calY = new Date().getFullYear(), calM = new Date().getMonth();
let selDate = todayStr();
let editingEventId = null;

const evEnd = (e) => e.end || e.start;
// 這天有哪些行程（連續多天的行程，中間每一天都算）
const eventsOn = (ds) => state.events.filter(e => e.start <= ds && evEnd(e) >= ds)
    .sort((a, b) => (b.important - a.important) || (!!b.end - !!a.end) || a.start.localeCompare(b.start));
const addDaysStr = (ds, n) => { const d = parseYmd(ds); d.setDate(d.getDate() + n); return ymd(d); };
const spanText = (e) => `${shortDate(e.start)} – ${shortDate(e.end)}，共 ${daysBetween(e.start, e.end) + 1} 天`;

/* =====================================================
 * v64 國定假日：台灣政府行政機關辦公日曆（人事行政總處公告）
 *   內建 2025–2027；網路上的整理版（ruyut/TaiwanCalendar）有新年度就自動抓下來存著
 *   每一天：{ n: 名稱, off: true } 放假；{ n: '補班', work: true } 週末補行上班
 * ===================================================== */
const HOL_BUILTIN = {"2025": "0101開國紀念日|0127小年夜|0128農曆除夕|0129春節|0130春節|0131春節|0208!|0228和平紀念日|0403補假|0404兒童節及民族掃墓節|0530補假|0531端午節|0928孔子誕辰紀念日|0929補假|1006中秋節|1010國慶日|1024補假|1025臺灣光復暨金門古寧頭大捷紀念日|1225行憲紀念日", "2026": "0101開國紀念日|0215小年夜|0216農曆除夕|0217春節|0218春節|0219春節|0220補假|0227補假|0228和平紀念日|0403補假|0404兒童節|0405清明節|0406補假|0501勞動節|0619端午節|0925中秋節|0928孔子誕辰紀念日/教師節|1009補假|1010國慶日|1025臺灣光復暨金門古寧頭大捷紀念日|1026補假|1225行憲紀念日", "2027": "0101開國紀念日|0204小年夜|0205農曆除夕|0206春節|0207春節|0208春節|0209補假|0210補假|0228和平紀念日|0301補假|0404兒童節|0405清明節|0406補假|0430補假|0501勞動節|0609端午節|0915中秋節|0928孔子誕辰紀念日/教師節|1010國慶日|1011補假|1025臺灣光復暨金門古寧頭大捷紀念日|1224補假|1225行憲紀念日|1231補假"};
// 平常講的名字（標題、首頁、電腦版）；手機格子太窄的另外縮短
const HOL_NAME = { '開國紀念日': '元旦', '農曆除夕': '除夕', '兒童節及民族掃墓節': '兒童節', '孔子誕辰紀念日/教師節': '教師節', '孔子誕辰紀念日': '教師節', '臺灣光復暨金門古寧頭大捷紀念日': '光復節' };
const HOL_CELL = { '和平紀念日': '228', '行憲紀念日': '行憲' };
let holCache = (() => { const c = lsGet(LS.hol, null); return c && typeof c === 'object' && c.y ? c : { y: {}, at: 0 }; })();
const holMaps = {};
function holYear(y) {
    if (holMaps[y]) return holMaps[y];
    const src = typeof holCache.y[y] === 'string' ? holCache.y[y] : HOL_BUILTIN[y];
    const m = {};
    if (src) src.split('|').forEach(x => {
        const md = x.slice(0, 4), d = x.slice(4);
        if (!/^\d{4}$/.test(md) || !d) return;
        if (d === '!') { m[md] = { n: '補班', full: '補班', work: true }; return; }
        const name = HOL_NAME[d] || d;
        m[md] = { n: HOL_CELL[name] || name, full: name, off: true };
    });
    return (holMaps[y] = m);
}
// ds：'YYYY-MM-DD'
function holOn(ds) { return holYear(ds.slice(0, 4))[ds.slice(5, 7) + ds.slice(8, 10)] || null; }
// 週六、週日
const isWeekendDs = (ds) => { const w = parseYmd(ds).getDay(); return w === 0 || w === 6; };
// 有新年度或公告更新：一週最多抓一次（今年、明年），抓不到就用內建的
async function holRefresh() {
    if (Date.now() - (holCache.at || 0) < 7 * 86400000 || !navigator.onLine) return;
    const y0 = new Date().getFullYear();
    let changed = false;
    for (const y of [y0, y0 + 1]) {
        try {
            const r = await fetch(`https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${y}.json`, { cache: 'no-cache' });
            if (!r.ok) continue;
            const arr = await r.json();
            if (!Array.isArray(arr) || arr.length < 360) continue;
            const parts = [];
            arr.forEach(x => {
                if (!x || typeof x.date !== 'string' || x.date.length !== 8) return;
                const md = x.date.slice(4), desc = String(x.description || '').trim().slice(0, 30), we = x.week === '六' || x.week === '日';
                if (x.isHoliday && desc && desc !== '週末') parts.push(md + desc.replace(/\|/g, '/'));
                else if (!x.isHoliday && we) parts.push(md + '!');
            });
            const str = parts.join('|');
            if (str && str !== holCache.y[y]) { holCache.y[y] = str; delete holMaps[y]; changed = true; }
        } catch (e) { /* 離線或被擋：用內建的 */ }
    }
    holCache.at = Date.now();
    lsSet(LS.hol, holCache);
    if (changed) { try { renderCalendar(); renderTT(); renderHomeClass(); } catch (e) {} }
}
setTimeout(() => { holRefresh(); }, 4000);

function renderCalendar() {
    const t = todayStr();
    $('calYear').textContent = calY;
    $('calMonth').textContent = `${calM + 1} 月`;
    const first = new Date(calY, calM, 1);
    const offset = (first.getDay() + 6) % 7;
    const total = new Date(calY, calM + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < offset; i++) html += '<div class="cal-cell blank"></div>';
    for (let n = 1; n <= total; n++) {
        const ds = `${calY}-${pad(calM + 1)}-${pad(n)}`;
        const evs = eventsOn(ds), exs = examsOn(ds);
        const imp = evs.some(e => e.important);
        const hol = holOn(ds), rest = hol ? hol.off : isWeekendDs(ds);
        const cls = ['cal-cell', ds === t ? 'today' : '', ds < t ? 'past' : '', ds === selDate ? 'selected' : '', exs.length ? 'exam' : '', imp ? 'imp-day' : '', rest ? 'rest' : '', hol?.off ? 'hol' : '', hol?.work ? 'work' : ''].join(' ');
        const singles = evs.filter(e => !e.end), multi = evs.find(e => e.end);
        const tds = todosOn(ds), cds = cdsOn(ds);
        const dots = [...cds.map(c => `<i style="background:${c.color}"></i>`), ...singles.map(e => `<i class="${e.important ? 'imp' : ''}"></i>`), ...tds.map(() => '<i class="td"></i>')].slice(0, 3).join('');
        // 連續多天：手機在日期下方畫一條連起來的線（每週的頭尾也收成圓角）
        let bar = '';
        if (multi) {
            const col = (offset + n - 1) % 7;
            const head = ds === multi.start || col === 0 || n === 1, tail = ds === multi.end || col === 6 || n === total;
            bar = `<span class="cal-bar${multi.important ? ' imp' : ''}${head ? ' head' : ''}${tail ? ' tail' : ''}"></span>`;
        }
        const titles = [
            ...(hol ? [`<span class="hol${hol.work ? ' work' : ''}">${esc(hol.full)}</span>`] : []),
            ...exs.map(e => `<span class="exam">${esc(e.short)}</span>`),
            ...cds.map(c => `<span class="cdt" style="--cd-color:${c.color}">${esc(c.short)}</span>`),
            ...evs.map(e => `<span class="${e.important ? 'imp' : ''}${e.end ? ' multi' : ''}${e.end && ds !== e.start ? ' cont' : ''}">${esc(e.title)}</span>`),
            ...tds.map(x => `<span class="td">${esc(x.text)}</span>`)
        ].slice(0, 3).join('');
        const label = `${calM + 1}月${n}日${hol ? '，' + hol.full : ''}${exs.length ? '，考試' : ''}${imp ? '，有重要行程' : ''}${evs.length ? `，${evs.length} 個行程` : ''}${tds.length ? `，${tds.length} 個待辦` : ''}`;
        html += `<button class="${cls}" data-date="${ds}" aria-label="${label}"><span class="cal-num num">${n}</span>${hol ? `<span class="cal-hol">${esc(hol.n)}</span>` : ''}<span class="cal-dots">${dots}</span>${bar}<span class="cal-titles">${titles}</span></button>`;
    }
    const rest = (7 - (offset + total) % 7) % 7;
    for (let i = 0; i < rest; i++) html += '<div class="cal-cell blank"></div>';
    $('calGrid').innerHTML = html;
    renderDayList();
    renderUpcoming();
}

function eventRowHtml(item, showRel) {
    const d = parseYmd(item.date);
    const t = todayStr();
    const rel = showRel ? daysBetween(t, item.date) : null;
    const dateBlock = showRel ? `<div class="event-date"><div class="d num">${d.getMonth() + 1}/${d.getDate()}</div><div class="w">週${WEEK_ZH[d.getDay()]}</div></div>` : '';
    const tags = (item.exam ? '<span class="exam-tag" style="margin:0">考試</span>' : '') +
        (item.important ? '<span class="important-tag">重要</span>' : '');
    return `<li><button class="event-row" ${item.id ? `data-id="${esc(item.id)}"` : 'data-exam="1"'} data-title="${esc(item.title)}">
        ${dateBlock}
        <div class="event-bar ${item.exam ? 'exam' : item.important ? 'imp' : ''}"></div>
        <div class="event-title">${esc(item.title)}${item.sub ? `<div class="event-sub">${esc(item.sub)}</div>` : ''}</div>
        <div class="event-meta">${tags}${rel !== null ? `<span class="event-rel">${rel === 1 ? '明天' : rel + ' 天後'}</span>` : ''}</div>
    </button></li>`;
}

function renderDayList() {
    const t = todayStr();
    const d = parseYmd(selDate);
    const hol = holOn(selDate);
    $('selDayTitle').innerHTML = `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${WEEK_ZH[d.getDay()]}${selDate === t ? '（今天）' : ''}${hol ? `<span class="day-hol${hol.work ? ' work' : ''}">${esc(hol.full)}</span>` : ''}`;
    const items = [
        ...examsOn(selDate).map(e => ({
            date: selDate, title: e.name, exam: true,
            sub: e.end ? `第 ${daysBetween(e.date, selDate) + 1} 天，共 ${daysBetween(e.date, e.end) + 1} 天` : ''
        })),
        ...eventsOn(selDate).map(e => ({
            id: e.id, date: e.start, title: e.title, important: e.important,
            sub: e.end ? `第 ${daysBetween(e.start, selDate) + 1} 天（${spanText(e)}）` : ''
        }))
    ];
    const tds = todosOn(selDate), cds = cdsOn(selDate);
    $('selDayList').innerHTML = (items.length || tds.length || cds.length)
        ? cds.map(c => `<li><button class="cd-row" data-cdedit="${esc(c.key)}"><span class="cd-row-bar" style="background:${c.color}"></span><span class="cd-row-tx">${esc(c.name)}${c.yearly ? '<small>每年</small>' : c.end ? `<small>${shortDate(c.date)} – ${shortDate(c.end)}</small>` : ''}</span><span class="cd-row-tag" style="--cd-color:${c.color}">倒數</span></button></li>`).join('') + items.map(i => eventRowHtml(i, false)).join('') + tds.map(x => `<li class="cal-todo"><label><input type="checkbox" class="checkbox" data-todo="${esc(x.id)}" aria-label="完成待辦"><span class="cal-todo-tag">待辦</span><span class="cal-todo-tx">${esc(x.text)}</span></label></li>`).join('')
        : '<li class="empty">這天沒有行程</li>';
}

// 自訂倒數在行事曆上（勾了「也顯示在行事曆」的；每年重複的看月日）
function cdsOn(ds) {
    return state.countdowns.items.filter(c => c.cal && (c.yearly ? c.date.slice(5) === ds.slice(5) && c.date <= ds : c.date <= ds && ds <= (c.end || c.date)))
        .map(c => ({ key: c.id, name: c.name, short: c.short, color: c.color, yearly: c.yearly, date: c.date, end: c.end }));
}
function renderUpcoming() {
    const t = todayStr();
    const items = [
        ...examEntries.map(([, e]) => ({ date: e.date, title: e.name, exam: true, sub: e.end ? `${shortDate(e.date)} – ${shortDate(e.end)}，共 ${daysBetween(e.date, e.end) + 1} 天` : '' })),
        ...state.events.map(e => ({ id: e.id, date: e.start, title: e.title, important: e.important, sub: e.end ? spanText(e) : '' }))
    ].filter(i => i.date > t).sort((a, b) => a.date.localeCompare(b.date) || (b.exam ? 1 : 0) - (a.exam ? 1 : 0)).slice(0, 8);
    $('upcomingList').innerHTML = items.length ? items.map(i => eventRowHtml(i, true)).join('') : '<li class="empty">接下來沒有安排</li>';
}

$('calGrid').addEventListener('click', (e) => {
    if (Date.now() - calSwipedAt < 400) return;   // 剛滑動換月，不要當成點日期
    const c = e.target.closest('.cal-cell[data-date]');
    if (!c) return;
    if (c.dataset.date === selDate) { openEventModal({ date: selDate }); return; } // 再點一次同一天 → 新增
    selDate = c.dataset.date;
    renderCalendar();
});
function onEventListClick(e) {
    const row = e.target.closest('.event-row');
    if (!row) return;
    if (row.dataset.exam) { toast(`${row.dataset.title} 是固定的考試日期`); return; }
    openEventModal({ id: row.dataset.id });
}
$('selDayList').addEventListener('click', (e) => { const c = e.target.closest('[data-cdedit]'); if (c) { openCdEdit(c.dataset.cdedit); return; } onEventListClick(e); });
$('selDayList').addEventListener('change', (e) => { if (e.target.dataset.todo && e.target.checked) completeTodoById(e.target.dataset.todo); });
$('upcomingList').addEventListener('click', onEventListClick);

function moveMonth(delta) {
    calM += delta;
    if (calM < 0) { calM = 11; calY--; }
    if (calM > 11) { calM = 0; calY++; }
    renderCalendar();
    const g = $('calGrid');
    g.classList.remove('slide-next', 'slide-prev');
    void g.offsetWidth;   // 重新觸發動畫
    g.classList.add(delta > 0 ? 'slide-next' : 'slide-prev');
}
// 手機左右滑換月份
let calSwipedAt = 0;
(function () {
    let sx = 0, sy = 0, active = false;
    const g = $('calGrid');
    g.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; sx = e.clientX; sy = e.clientY; active = true; });
    g.addEventListener('pointerup', (e) => {
        if (!active) return;
        active = false;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { calSwipedAt = Date.now(); moveMonth(dx < 0 ? 1 : -1); }
    });
    g.addEventListener('pointercancel', () => { active = false; });
})();
$('prevMonthBtn').addEventListener('click', () => moveMonth(-1));
$('nextMonthBtn').addEventListener('click', () => moveMonth(1));
$('todayMonthBtn').addEventListener('click', () => {
    const n = new Date(); calY = n.getFullYear(); calM = n.getMonth(); selDate = todayStr(); renderCalendar();
});
$('calFab').addEventListener('click', () => openEventModal({ date: selDate }));
$('addOnDayBtn').addEventListener('click', () => openEventModal({ date: selDate }));

function openEventModal({ id, date }) {
    const ev = id ? state.events.find(e => e.id === id) : null;
    editingEventId = ev ? ev.id : null;
    $('eventTitle').textContent = ev ? '編輯行程' : '新增行程';
    $('eventName').value = ev ? ev.title : '';
    $('eventDate').value = ev ? ev.start : (date || todayStr());
    $('eventEnd').value = ev && ev.end ? ev.end : '';
    setEventSpan(!!(ev && ev.end));
    $('eventImportant').checked = ev ? ev.important : false;
    $('deleteEventBtn').style.display = ev ? '' : 'none';
    openModal('eventModal');
    setTimeout(() => { if ($('eventModal').classList.contains('open')) $('eventName').focus(); }, 120);
}
// 單日／連續多天
let eventMulti = false;
function setEventSpan(multi) {
    eventMulti = multi;
    document.querySelectorAll('#eventSpan button').forEach(b => {
        const on = (b.dataset.span === 'multi') === multi;
        b.classList.toggle('active', on); b.setAttribute('aria-pressed', on);
    });
    $('eventEndWrap').hidden = !multi;
    document.querySelector('.event-dates').classList.toggle('one', !multi);
    $('eventDateLabel').textContent = multi ? '開始日期' : '日期';
    if (multi) {
        const st = $('eventDate').value || todayStr();
        if (!$('eventEnd').value || $('eventEnd').value <= st) $('eventEnd').value = addDaysStr(st, 1);
    }
    updateSpanNote();
}
function updateSpanNote() {
    const st = $('eventDate').value, en = $('eventEnd').value;
    const ok = eventMulti && st && en && en > st;
    $('eventSpanNote').textContent = ok ? `共 ${daysBetween(st, en) + 1} 天` : '';
    $('eventSpanNote').hidden = !eventMulti;
}
$('eventSpan').addEventListener('click', (e) => { const b = e.target.closest('button[data-span]'); if (b) setEventSpan(b.dataset.span === 'multi'); });
$('eventDate').addEventListener('change', () => {
    // 開始日期往後調，結束日期跟著往後，保持原本的天數
    const st = $('eventDate').value, en = $('eventEnd').value;
    if (eventMulti && st && en && en <= st) $('eventEnd').value = addDaysStr(st, 1);
    updateSpanNote();
});
$('eventEnd').addEventListener('change', updateSpanNote);

function saveEvent() {
    const title = $('eventName').value.trim();
    const start = $('eventDate').value;
    if (!title) { toast('請輸入行程內容'); return; }
    if (!start) { toast('請選擇日期'); return; }
    const end = eventMulti ? $('eventEnd').value : '';
    if (eventMulti && (!end || end <= start)) { toast('結束日期要在開始日期之後'); return; }
    if (eventMulti && daysBetween(start, end) > 365) { toast('連續天數最多一年'); return; }
    const important = $('eventImportant').checked;
    if (editingEventId) {
        const ev = state.events.find(e => e.id === editingEventId);
        Object.assign(ev, { title, start, important });
        if (end) ev.end = end; else delete ev.end;
    } else {
        state.events.push({ id: uid(), title, start, important, ...(end ? { end } : {}) });
    }
    selDate = start;
    const d = parseYmd(start); calY = d.getFullYear(); calM = d.getMonth();
    save(); renderCalendar();
    closeModal('eventModal');
}
$('saveEventBtn').addEventListener('click', saveEvent);
onEnter($('eventName'), saveEvent);
$('deleteEventBtn').addEventListener('click', () => {
    if (!editingEventId) return;
    const idx = state.events.findIndex(e => e.id === editingEventId);
    if (idx < 0) return;
    const [item] = state.events.splice(idx, 1);
    save(); renderCalendar();
    closeModal('eventModal');
    toast('已刪除行程', { label: '復原', fn: () => { state.events.splice(idx, 0, item); save(); renderCalendar(); } });
});

/* =====================================================
 * 4. 待辦
 * ===================================================== */
// 待辦的日期標籤：今天、明天、逾期用不同顏色
function todoDateText(ds) {
    const diff = daysBetween(todayStr(), ds), d = parseYmd(ds);
    return diff === 0 ? '今天' : diff === 1 ? '明天' : diff === -1 ? '昨天' : `${d.getMonth() + 1}/${d.getDate()}（${WEEK_ZH[d.getDay()]}）`;
}
function todoDateTag(ds, tm) {
    if (!ds) return '';
    const diff = daysBetween(todayStr(), ds);
    const late = diff < 0 || (diff === 0 && tm && tm < `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`);
    return `<span class="todo-date ${late ? 'late' : diff === 0 ? 'today' : ''}">${late ? '逾期 · ' : ''}${todoDateText(ds)}${tm ? ' ' + tm : ''}</span>`;
}
const todosOn = (ds) => state.todos.filter(t => t.date === ds);
// 有日期的排前面（越早越前面），沒日期的照新增順序
const sortedTodos = () => [...state.todos.filter(t => t.date).sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'))), ...state.todos.filter(t => !t.date)];
function renderTodos() {
    $('todoList').innerHTML = state.todos.length
        ? sortedTodos().map(t => `
            <li class="check-item swipe-row" data-id="${esc(t.id)}">
                <div class="swipe-bg" aria-hidden="true">
                    <span class="sw-done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>完成</span>
                    <span class="sw-del">刪除<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></span>
                </div>
                <div class="swipe-fg">
                    <input type="checkbox" class="checkbox" aria-label="完成">
                    <span class="text">${esc(t.text)}${todoDateTag(t.date, t.time)}</span>
                    <button class="del-btn" aria-label="刪除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                </div>
            </li>`).join('') + '<li class="swipe-hint">往右滑完成，往左滑刪除</li>'
        : '<li class="empty">目前沒有待辦事項，太棒了！</li>';
}
function removeTodo(li, doneText) {
    li.style.opacity = '0';
    li.style.transform = 'translateX(8px)';
    setTimeout(() => {
        const idx = state.todos.findIndex(t => t.id === li.dataset.id);
        if (idx < 0) return;
        const [item] = state.todos.splice(idx, 1);
        save(); renderTodosEverywhere();
        toast(doneText, { label: '復原', fn: () => { state.todos.splice(idx, 0, item); save(); renderTodosEverywhere(); } });
    }, 200);
}
// 有日期的待辦也會出現在倒數頁「今天」和行事曆，改了要一起更新
function renderTodosEverywhere() { renderTodos(); renderToday(); renderCalendar(); }
// 從倒數頁或行事曆打勾完成某一個待辦
function completeTodoById(id) {
    const idx = state.todos.findIndex(t => t.id === id);
    if (idx < 0) return;
    const [item] = state.todos.splice(idx, 1);
    save(); renderTodosEverywhere();
    toast('完成一項，讚！', { label: '復原', fn: () => { state.todos.splice(idx, 0, item); save(); renderTodosEverywhere(); } });
}
$('todoList').addEventListener('change', (e) => { if (e.target.checked) removeTodo(e.target.closest('li'), '完成一項，讚！'); });
$('todoList').addEventListener('click', (e) => { if (e.target.closest('.del-btn')) removeTodo(e.target.closest('li'), '已刪除'); });
function addTodo() {
    const text = $('todoInput').value.trim();
    if (!text) return;
    const date = $('todoDate').value, time = date ? todoTime : '';
    state.todos.push({ id: uid(), text, ...(date ? { date, ...(time ? { time } : {}) } : {}) });
    $('todoInput').value = '';
    setTodoDate('');
    save(); renderTodosEverywhere();
    if (date) toast(`已排在${todoDateText(date)}${time ? ' ' + time : ''}，行事曆上也看得到`);
}
// 待辦日期：按日曆圖示選日期，選好後顯示在按鈕上，按 ✕ 取消
let todoTime = '';
function setTodoDate(v) {
    $('todoDate').value = v || '';
    $('todoDateBtn').classList.toggle('has', !!v);
    $('todoDateLabel').textContent = v ? todoDateText(v).replace(/（.）/, '') : '';
    $('todoDateClear').hidden = !v;
    $('todoTimeRow').hidden = !v;
    if (!v) setTodoTime('');
}
function setTodoTime(v) {
    todoTime = v || '';
    $('todoTimeBtn').classList.toggle('has', !!todoTime);
    $('todoTimeLabel').textContent = todoTime || '加上時間（可不選）';
    $('todoTimeClear').hidden = !todoTime;
    $('todoTimeHint').hidden = !!todoTime;
}
$('todoTimeBtn').addEventListener('click', async () => {
    const now = new Date(), def = todoTime || `${pad(Math.min(23, now.getHours() + 1))}:00`;
    const v = await pickTime('待辦時間', def, ['08:00', '12:00', '17:00', '20:00', '22:00']);
    if (v) setTodoTime(v);
});
$('todoTimeClear').addEventListener('click', () => setTodoTime(''));
$('todoDate').addEventListener('change', () => setTodoDate($('todoDate').value));
$('todoDate').addEventListener('input', () => setTodoDate($('todoDate').value));
// 電腦版：點透明的日期欄位不一定會打開日曆，直接叫出來
$('todoDate').addEventListener('click', (e) => { try { e.target.showPicker?.(); } catch (err) {} });
$('todoDateClear').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setTodoDate(''); });
$('addTodoBtn').addEventListener('click', addTodo);
onEnter($('todoInput'), addTodo);


/* =====================================================
 * 5. 讀書計時
 * ===================================================== */
const MODES = [
    { label: '番茄鐘 25', focus: 25, rest: 5, hint: '專注 25 分 · 休息 5 分' },
    { label: '長專注 50', focus: 50, rest: 10, hint: '專注 50 分 · 休息 10 分' },
    { label: '自由計時', focus: 0, rest: 5, hint: '按下開始就往上計時' }
];
const RING_C = 2 * Math.PI * 134;   // 圓環周長（viewBox 290、半徑 134）
// 子母畫面只給電腦版（滑鼠操作、螢幕夠寬）
const pipSupported = 'documentPictureInPicture' in window && matchMedia('(pointer: fine) and (min-width: 900px)').matches;
const BASE_TITLE = document.title;

// 計時狀態只存在這台裝置；記錄下來的讀書時間（sessions）會同步到雲端
let timer = lsGet(LS.timer, null) || { phase: 'idle' };
let tpref = Object.assign({ subject: 0, mode: 0, goal: 180 }, lsGet(LS.tpref, {}));
// 這台裝置開始過的專注／休息（開始時間）。同一個帳號用兩台裝置時，用來分辨雲端上的「讀書中」是不是這台的：
// 不是這台的，沒在計時的這台就不能把它蓋成「沒在讀」
// （每次都從本機讀：同一台的其他分頁開始的也算這台的）
const OWN_STARTS = 'study_own_starts';
const ownStarts = () => { const a = lsGet(OWN_STARTS, []); return Array.isArray(a) ? a : []; };
function noteOwnStart() {
    const t = timer.phase === 'focus' ? timer.startAt : timer.phase === 'break' ? timer.breakStart : null;
    const a = ownStarts();
    if (!t || a.includes(t)) return;
    lsSet(OWN_STARTS, [...a, t].slice(-30));
}
// 雲端上自己的狀態是「別台裝置正在專注／休息」（這台沒在計時時才算）：回傳那份狀態，不然回傳 null
function otherDeviceStatus() {
    if (timer.phase !== 'idle' || !currentUser) return null;
    const p = profiles[currentUser.uid];
    const t = p && (p.status === 'focus' ? p.startAt : p.status === 'break' ? p.breakStart : null);
    return t && !p.hidden && !ownStarts().includes(t) ? p : null;
}
const saveTimer = () => { lsSet(LS.timer, timer); noteOwnStart(); publishProfile(); try { schedSync(); } catch (e) {} };   // 同時更新讀書房間裡的狀態
// 另一個分頁改了計時或（沒登入時的）資料：這個分頁跟著更新，不會用舊的資料蓋回去
window.addEventListener('storage', (e) => {
    if (e.key === LS.timer) {
        const ls = lsGet(LS.timer, null) || { phase: 'idle' };
        if (JSON.stringify(ls) === JSON.stringify(timer)) return;
        const prev = timer;
        timer = ls;
        // 另一個分頁先記錄了這一輪（時間到）：這邊也一樣帶回計時頁或讓膠囊提醒
        if (prev.phase === 'focus' && ls.phase === 'break' && ls.breakStart >= prev.startAt && prev.duration && ls.breakStart - prev.startAt >= prev.duration) { if (timer.phase === 'focus' && !timer.pausedAt) requestWake(); else releaseWake(); renderTimer(); renderToday(); onTimeUp(); return; }
        if (timer.phase === 'focus' && !timer.pausedAt) requestWake(); else releaseWake();
        renderTimer(); renderToday();
    } else if (!currentUser && !cachedUid && [LS.todos, LS.events, LS.weekly, LS.sessions, LS.syllabus, LS.countdowns].includes(e.key)) {
        state = loadLocal(); renderAll();
    }
});
const saveTpref = () => { lsSet(LS.tpref, tpref); try { schedSync(); } catch (e) {} };   // 每日目標也給每日提醒用

const fmtClock = (ms) => {
    const sec = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60;
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(x);
};
const fmtHM = (min) => {
    min = Math.round(min);
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} 時 ${pad(m)} 分` : `${m} 分`;
};
const hmHtml = (min) => {
    min = Math.round(min);
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h}<small>時</small>${pad(m)}<small>分</small>` : `${m}<small>分</small>`;
};
// 每筆紀錄是哪一天：算過就記住（統計、連續天數會反覆用到，紀錄多時差很多）
const dayOf = new WeakMap();
const sessionDay = (x) => { let d = dayOf.get(x); if (!d) { d = ymd(new Date(x.start)); dayOf.set(x, d); } return d; };
let dayMinMemo = { arr: null, len: -1, sig: 0, map: null };
function dayMinutesMap() {
    const arr = state.sessions;
    let sig = 0;
    for (let i = 0; i < arr.length; i++) sig = (sig * 31 + arr[i].start + arr[i].minutes * 7) % 1e15;
    if (dayMinMemo.arr === arr && dayMinMemo.len === arr.length && dayMinMemo.sig === sig) return dayMinMemo.map;
    const map = new Map();
    for (const x of arr) { const k = sessionDay(x); map.set(k, (map.get(k) || 0) + x.minutes); }
    dayMinMemo = { arr, len: arr.length, sig, map };
    return map;
}
const dayMinutes = (ds) => dayMinutesMap().get(ds) || 0;
const roundsOn = (ds) => state.sessions.filter(x => x.pomo && sessionDay(x) === ds).length;
function studyStreak() {
    const d = new Date();
    if (!dayMinutes(ymd(d))) d.setDate(d.getDate() - 1);   // 今天還沒讀不算中斷
    let n = 0;
    while (dayMinutes(ymd(d)) > 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
}
function taskFor(subject) {
    const t = todayStr();
    for (let k = 0; k < SLOTS; k++) {
        const key = `${t}_${subject}_${k}`;
        const d = state.weekly[key];
        if (d && d.text && !d.done) return { key, text: d.text, done: false };
    }
    for (let k = 0; k < SLOTS; k++) {
        const key = `${t}_${subject}_${k}`;
        const d = state.weekly[key];
        if (d && d.text) return { key, text: d.text, done: true };
    }
    return null;
}
function focusElapsed(now = Date.now()) {
    if (timer.phase !== 'focus') return 0;
    return Math.max(0, (timer.pausedAt || now) - timer.startAt - (timer.pausedTotal || 0));
}
/* --- 讀書紀錄保險箱：剛記錄的每一筆先另外存在這台裝置，確定雲端有了才拿掉 ---
 * 就算同步、合併出了任何問題，這些紀錄也會自動補回去，不會「記了又不見」 */
const SESS_JOURNAL = 'study_sess_journal';
const journalGet = () => { const j = lsGet(SESS_JOURNAL, []); return Array.isArray(j) ? j.filter(x => x && x.id && x.start && x.minutes > 0) : []; };
const journalSet = (j) => { try { j.length ? lsSet(SESS_JOURNAL, j.slice(-200)) : localStorage.removeItem(SESS_JOURNAL); } catch (e) {} };
const journalUid = () => currentUser?.uid || cachedUid || '';
// 只有登入時需要（沒登入時資料本來就只存在這台裝置）；記下是哪個帳號的，換帳號不會補錯人
const journalAdd = (rec) => { const u = journalUid(); if (u) journalSet([...journalGet().filter(x => x.id !== rec.id), { ...rec, at: Date.now(), u }]); };
const journalDrop = (id) => journalSet(journalGet().filter(x => x.id !== id));
// 把保險箱裡、但 s 裡沒有的紀錄補進去；confirmed＝這是雲端確認過的資料（裡面已經有的就可以從保險箱拿掉）
function journalRestore(s, confirmed) {
    const all = journalGet(), u = journalUid();
    const j = all.filter(x => x.u === u), others = all.filter(x => x.u !== u);
    if (!j.length) return false;
    const have = new Set(s.sessions.map(x => x.id));
    const missing = j.filter(x => !have.has(x.id));
    if (missing.length) s.sessions.push(...missing.map(({ at, u: _u, ...x }) => x));
    if (confirmed) journalSet([...others, ...missing.filter(x => Date.now() - x.at < 30 * 86400000)]);   // 雲端已經有的拿掉（太舊的也清掉）
    return missing.length > 0;
}
function recordSession(subject, start, minutes, pomo) {
    if (minutes < 1) return null;
    const rec = { id: uid(), subject, start, minutes: Math.round(minutes), pomo: !!pomo };
    state.sessions.push(rec);
    journalAdd(rec);
    // 沒登入時記的：記下來，之後登入（就算帳號裡已經有資料）也會加進帳號，不會不見
    if (!currentUser && !cachedUid) { const g = lsGet(LS.guestNew, []); lsSet(LS.guestNew, [...(Array.isArray(g) ? g : []), rec.id].slice(-500)); }
    if (!cloudReady) earlySessions.push(rec);   // 雲端還沒連上前記錄的，連上後補上傳
    save();
    publishProfile();
    return rec;
}
// 讀書紀錄改了（新增、刪除、編輯）：所有用到時數的地方一起更新，房間排行也同步
function afterSessionsChange() {
    save(); renderTimer(); renderStats(); renderToday(); publishProfile();
    if ($('dayModal').classList.contains('open')) renderDaySheet();
}
function removeSession(id, msg) {
    const idx = state.sessions.findIndex(x => x.id === id);
    if (idx < 0) return;
    const [item] = state.sessions.splice(idx, 1);
    journalDrop(id);   // 自己刪掉的，不要再被補回來
    afterSessionsChange();
    toast(msg || '已刪除紀錄', { label: '復原', fn: () => { state.sessions.splice(idx, 0, item); afterSessionsChange(); } });
}

/* --- 螢幕常亮、提示音 --- */
let wakeLock = null;
async function requestWake() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {}
}
function releaseWake() { try { wakeLock && wakeLock.release(); } catch (e) {} wakeLock = null; }
let audioCtx = null;
function unlockAudio() {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume && audioCtx.resume(); } catch (e) {}
}
function chime() {
    device.vibrate([200, 100, 200]);
    if (!audioCtx) return;
    try {
        const t = audioCtx.currentTime;
        [880, 1047, 1319].forEach((f, i) => {
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            const at = t + i * 0.22;
            o.type = 'sine'; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, at);
            g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(at); o.stop(at + 0.65);
        });
    } catch (e) {}
}

/* --- 計時動作 --- */
function startFocus() {
    const m = MODES[tpref.mode];
    timer = { phase: 'focus', subject: tpref.subject, mode: tpref.mode, startAt: Date.now(), pausedAt: null, pausedTotal: 0, duration: m.focus * 60000 };
    saveTimer();
    unlockAudio();
    requestWake();
    renderTimer();
}
function togglePause() {
    if (timer.phase !== 'focus') return;
    if (timer.pausedAt) { timer.pausedTotal += Date.now() - timer.pausedAt; timer.pausedAt = null; requestWake(); }
    else { timer.pausedAt = Date.now(); releaseWake(); }
    saveTimer(); renderTimer();
}
// auto：倒數到 0 自動完成；silent：關掉 App 期間就完成了，打開時不要響
// 同一台電腦開了兩個分頁（或兩個視窗）：只讓一個分頁記錄這一輪，不會重複記兩次
function timerHandledElsewhere() {
    const ls = lsGet(LS.timer, null) || { phase: 'idle' };
    if (ls.phase === 'focus' && ls.startAt === timer.startAt) return false;
    timer = ls; releaseWake(); renderTimer();
    return true;
}
function finishFocus(auto, silent) {
    if (timer.phase !== 'focus') return;
    if (timerHandledElsewhere()) return;
    const el = focusElapsed();
    const minutes = timer.duration ? Math.min(el, timer.duration) / 60000 : el / 60000;
    if (minutes < 1) {
        timer = { phase: 'idle' }; saveTimer(); releaseWake(); renderTimer();
        toast('不到 1 分鐘，這次沒有記錄');
        return;
    }
    const endAt = auto ? timer.startAt + (timer.pausedTotal || 0) + timer.duration : Date.now();
    const rec = recordSession(timer.subject, timer.startAt, minutes, timer.duration > 0);
    const m = MODES[timer.mode];
    timer = { phase: 'break', subject: timer.subject, mode: timer.mode, breakStart: endAt, breakLen: m.rest * 60000, lastMin: Math.round(minutes), lastId: rec && rec.id, chimed: false };
    if (Date.now() - endAt >= timer.breakLen) timer.chimed = true;
    saveTimer(); releaseWake();
    if (auto && !silent) chime();
    renderTimer(); renderStats();
}
function cancelFocus() {
    if (timer.phase !== 'focus' || timerHandledElsewhere()) return;
    const prev = timer;
    const minutes = focusElapsed() / 60000;
    timer = { phase: 'idle' }; saveTimer(); releaseWake();
    if (minutes >= 1) {
        const rec = recordSession(prev.subject, prev.startAt, minutes, false);
        renderTimer(); renderStats();
        afterSessionsChange();
        toast(`已結束，記錄 ${fmtHM(minutes)}`, { label: '不要記錄', fn: () => { journalDrop(rec.id); state.sessions = state.sessions.filter(x => x.id !== rec.id); afterSessionsChange(); } });
    } else {
        renderTimer();
    }
}
function endBreak(startNext) {
    timer = { phase: 'idle' }; saveTimer();
    if (startNext) startFocus(); else renderTimer();
}

/* --- 畫面 --- */
const ICON_PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_CHART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';
const ICON_ROOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.5.2 4 1.9 4.5 4.9"/></svg>';
const ringSvg = (cls) => `<svg viewBox="0 0 290 290" aria-hidden="true"><circle class="ring-track" cx="145" cy="145" r="134"/><circle class="ring-bar ${cls || ''}" cx="145" cy="145" r="134" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}"/></svg>`;
const subjButtons = (sel, attr) => SUBJECTS.map((n, i) =>
    `<button class="subj-btn ${i === sel ? 'active' : ''}" ${attr}="${i}" aria-pressed="${i === sel}"><i class="sdot s${i}"></i>${n}</button>`).join('');

function applyFocusMode() {
    document.body.classList.toggle('focus-mode', timer.phase === 'focus' && !focusMin && document.body.dataset.tab === 'tab-timer');
    updatePill();
}
/* --- v54：收起計時（計時繼續跑，下方浮動膠囊） ---
 * focusMin：在計時分頁時顯示一般的計時頁（不是碼錶）；點膠囊或「計時」分頁就回到碼錶
 * timeUp：時間到時你正在打字、開著視窗或在聊天室，不硬跳，膠囊改成「時間已到」等你點 */
let focusMin = false, timeUp = false;
const ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
function pillShown() {
    const b = document.body;
    if (b.classList.contains('guide-open')) return false;
    if (timeUp && timer.phase === 'break') return true;
    if (timer.phase !== 'focus') return false;
    if (b.dataset.tab === 'tab-timer' && !focusMin) return false;   // 已經在碼錶畫面
    if (b.classList.contains('chat-open') || isTyping(document.activeElement)) return false;   // 不要擋住輸入框
    return true;
}
function updatePill() {
    const el = $('focusPill');
    if (!el) return;
    const on = pillShown();
    document.body.classList.toggle('pill-on', on);
    el.classList.toggle('up', timeUp && timer.phase === 'break');
    el.classList.toggle('in-chat', on && document.body.classList.contains('chat-open'));
    if (on !== !el.hidden) {
        if (on) { el.hidden = false; requestAnimationFrame(() => el.classList.add('show')); }
        else { el.classList.remove('show'); el.hidden = true; }
    }
    // 下方「計時」分頁：計時中變成小圓環「專注中」
    const tb = document.querySelector('.tab-btn[data-tab="tab-timer"]');
    if (tb) {
        const run = timer.phase === 'focus';
        tb.classList.toggle('running', run);
        const lab = tb.querySelector('.tb-lab');
        if (lab) lab.textContent = run ? (timer.pausedAt ? '已暫停' : '專注中') : '計時';
    }
    if (on) pillLive();
}
function pillLive() {
    const el = $('focusPill');
    if (timer.phase === 'focus') {   // 下方「計時」分頁的小圓環也跟著跑
        const e0 = focusElapsed();
        const f0 = timer.duration ? Math.min(1, e0 / timer.duration) : (e0 % 3600000) / 3600000;
        document.querySelector('.tab-btn[data-tab="tab-timer"]')?.style.setProperty('--fp', f0.toFixed(4));
    }
    if (!el || el.hidden) return;
    if (el.classList.contains('up')) {
        $('fpSub').textContent = `${SUBJECTS[timer.subject] ?? ''} · 完成一輪`;
        $('fpTime').textContent = '時間已到！點我回到計時';
        el.setAttribute('aria-label', '時間已到，點一下回到計時');
        el.style.setProperty('--fp', '1');
        $('fpDot').className = `sdot s${timer.subject}`;
        return;
    }
    const el2 = focusElapsed();
    const text = timer.duration ? fmtClock(timer.duration - el2) : fmtClock(el2);
    const frac = timer.duration ? Math.min(1, el2 / timer.duration) : (el2 % 3600000) / 3600000;
    $('fpSub').textContent = `${SUBJECTS[timer.subject]} · ${timer.pausedAt ? '已暫停' : '專注中'}`;
    $('fpTime').textContent = text;
    $('fpDot').className = `sdot s${timer.subject}`;
    el.style.setProperty('--fp', frac.toFixed(4));
    el.classList.toggle('paused', !!timer.pausedAt);
    el.setAttribute('aria-label', `${SUBJECTS[timer.subject]} ${timer.pausedAt ? '已暫停' : '專注中'}，${timer.duration ? '還剩' : '已經'} ${text}，點一下回到計時`);
}
function openFocusFull() {
    focusMin = false; timeUp = false;
    if (chatRoom) closeChat();
    showTab('tab-timer');
}
$('focusPill').addEventListener('click', openFocusFull);
// 打字、打開聊天室、導覽時膠囊要躲起來：body 的 class 一變就更新
document.addEventListener('focusin', () => updatePill());
document.addEventListener('focusout', () => setTimeout(updatePill, 0));
new MutationObserver(() => updatePill()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
// 時間到（這台或另一個分頁記錄的都算）：在別的頁面就帶回計時頁；正在忙就只讓膠囊提醒
function onTimeUp() {
    const onTimer = document.body.dataset.tab === 'tab-timer';
    focusMin = false;
    if (onTimer) { renderTimer(); return; }
    const busy = !!chatRoom || !!document.querySelector('.modal.open') || isTyping(document.activeElement)
        || document.body.classList.contains('guide-open') || $('msgPop')?.classList.contains('open');
    if (busy) { timeUp = true; device.vibrate?.([30, 60, 30]); updatePill(); }
    else showTab('tab-timer');
}

function renderTimer() {
    const el = $('tab-timer');
    if (!el) return;
    const t = todayStr();
    if (timer.phase !== 'break') timeUp = false;
    if (timer.phase !== 'focus') focusMin = false;
    if (timer.phase === 'focus' && !focusMin) {
        const paused = !!timer.pausedAt;
        const task = taskFor(timer.subject);
        const done = roundsOn(t);
        const dots = timer.duration ? `<div class="round-dots" aria-label="今天第 ${done + 1} 輪">${'<i></i>'.repeat(Math.min(done, 8))}<i class="cur"></i><span>今天第 ${done + 1} 輪</span></div>` : '';
        el.innerHTML = `<div class="timer-wrap focus-wrap">
            <div class="timer-head">
                <span class="chip-subj"><i class="sdot s${timer.subject}"></i>${SUBJECTS[timer.subject]}</span>
                <p class="label">${paused ? '已暫停' : '專注中'}</p>
                <button class="icon-btn min-btn" data-act="minimize" aria-label="收起，計時會繼續" title="收起（計時會繼續）">${ICON_DOWN}</button>
            </div>
            ${lsGet(LS.minTip, false) ? '' : '<p class="min-tip">收起後計時會繼續，可以去別的頁面</p>'}
            <p class="task-line">${task && !task.done ? `<b>${esc(task.text)}</b>` : esc(MODES[timer.mode].hint)}</p>
            <div class="ring-wrap">${ringSvg(paused ? 'paused' : '')}
                <div class="ring-center"><span class="ring-time num" id="tmTime"></span><span class="ring-sub" id="tmSub"></span></div>
            </div>
            ${dots}
            <div class="focus-btns">
                <button class="btn btn-big btn-outline-accent" data-act="pause">${paused ? '繼續' : '暫停'}</button>
                <button class="btn btn-big" data-act="finish">${timer.duration ? '提早完成' : '完成'}</button>
            </div>
            <div class="focus-extra">
                <div class="focus-tools">
                    <button class="tool-btn" data-act="standby"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/></svg>全螢幕時鐘</button>
                    <button class="tool-btn" data-act="room">${ICON_ROOM.replace('style="width:16px;height:16px"', '')}讀書房間</button>
                    ${pipSupported ? '<button class="tool-btn" data-act="pip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><rect x="12" y="11" width="6.5" height="5" rx="1.2" fill="currentColor" stroke="none"/></svg>子母畫面</button>' : ''}
                </div>
                <button class="end-link" data-act="cancel">結束這一輪（已讀的時間會記錄）</button>
                <p class="hint">關掉 App 也沒關係，回來時會自動算好經過的時間</p>
            </div>
        </div>`;
    } else if (timer.phase === 'break') {
        const task = taskFor(timer.subject);
        el.innerHTML = `<div class="timer-wrap">
            <div class="done-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
            <h2 class="break-title">完成一輪，${SUBJECTS[timer.subject]} ${timer.lastMin} 分鐘</h2>
            <p class="break-sub">今天累計 ${fmtHM(dayMinutes(t))}${roundsOn(t) ? ` · 第 ${roundsOn(t)} 輪` : ''}</p>
            ${timer.lastId && state.sessions.some(x => x.id === timer.lastId) ? `<button class="text-link break-edit" data-edit="${esc(timer.lastId)}">${ICON_PEN}修改這一輪的時間或科目</button>` : ''}
            ${task ? `<label class="task-check"><input type="checkbox" class="checkbox" data-task="${esc(task.key)}" ${task.done ? 'checked' : ''}><span class="text">「${esc(task.text)}」讀完了嗎？<small>打勾會同步到進度表</small></span></label>` : ''}
            <div class="break-time" id="brBox"><p class="label" id="brLabel">休息時間</p><span class="num" id="brTime"></span></div>
            <div class="block">
                <p class="label" style="margin-bottom:10px">下一輪讀什麼</p>
                <div class="subj-grid">${subjButtons(tpref.subject, 'data-subj')}</div>
                <p class="hint" style="margin-top:12px;text-align:left">站起來走走、喝口水，讓眼睛離開螢幕</p>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;margin-top:22px">
                <button class="btn btn-accent btn-wide" data-act="next" id="brNext">跳過休息，開始下一輪</button>
                <button class="btn btn-wide" style="border-color:transparent;color:var(--muted)" data-act="stop">今天先到這裡</button>
            </div>
        </div>`;
    } else {
        const m = MODES[tpref.mode];
        const task = taskFor(tpref.subject);
        const todayMin = Math.round(dayMinutes(t));
        const goalFrac = Math.min(1, todayMin / tpref.goal);
        const GC = 2 * Math.PI * 122;
        const wk = getMonday(new Date());
        let weekMin = 0;
        for (let i = 0; i < 7; i++) { const d = new Date(wk); d.setDate(d.getDate() + i); weekMin += dayMinutes(ymd(d)); }
        const live = roomLiveCount();
        const mini = timer.phase === 'focus';   // 收起計時：只留房間、統計和今天的紀錄（不能再開始另一輪）
        el.innerHTML = `<div class="timer-wrap${mini ? ' mini-wrap' : ''}">
            <div class="go-row">
                <button class="go-btn room" data-act="room">
                    <span class="go-ic">${ICON_ROOM.replace('style="width:16px;height:16px"', '')}</span>
                    <span class="go-tx"><b>讀書房間</b><small>${live === null ? '和朋友一起讀' : live ? `● ${live}${mini ? ' 位朋友' : ' 人'}在讀` : (mini ? '只有你在讀' : '目前沒人在讀')}</small></span>
                    <svg class="go-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                </button>
                <button class="go-btn" data-act="stats">
                    <span class="go-ic">${ICON_CHART}</span>
                    <span class="go-tx"><b>讀書統計</b><small>本週 ${weekMin >= 60 ? Math.floor(weekMin / 60) + ' 小時' : Math.round(weekMin) + ' 分鐘'}</small></span>
                    <svg class="go-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                </button>
            </div>
            ${mini ? `<button class="mini-now" data-act="expand"><span class="mn-ring" style="--fp:0"></span><span class="mn-tx"><b>${SUBJECTS[timer.subject]} ${timer.pausedAt ? '已暫停' : '專注中'}</b><small>計時在背景繼續，點這裡回到碼錶</small></span>${ICON_DOWN.replace('M6 9l6 6 6-6', 'M6 15l6-6 6 6')}</button>` : `<div class="subj-grid">${subjButtons(tpref.subject, 'data-subj')}</div>
            <div class="seg" role="tablist" aria-label="計時模式" style="margin-top:12px">${MODES.map((x, i) =>
                `<button role="tab" aria-selected="${i === tpref.mode}" class="${i === tpref.mode ? 'active' : ''}" data-mode="${i}">${x.label}</button>`).join('')}</div>
            <div class="ring-wrap">${ringSvg()}
                <svg class="goal-ring" viewBox="0 0 290 290" aria-hidden="true"><circle class="goal-track" cx="145" cy="145" r="122"/><circle class="goal-bar" cx="145" cy="145" r="122" stroke-dasharray="${GC.toFixed(1)}" stroke-dashoffset="${(GC * (1 - goalFrac)).toFixed(1)}"/></svg>
                <div class="ring-center"><span class="ring-time num">${m.focus ? pad(m.focus) + ':00' : '00:00'}</span><span class="ring-sub">${m.hint}</span></div>
            </div>
            <p class="task-line">${task && !task.done ? `今天的${SUBJECTS[tpref.subject]}進度：<b>${esc(task.text)}</b>` : ''}</p>
            <button class="btn btn-accent btn-wide" data-act="start" style="margin-top:14px">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>開始專注
            </button>`}
            ${todayLogsHtml(t, todayMin)}
        </div>`;
        if (pipWin && !mini) { try { pipWin.close(); } catch (e) {} }
    }
    applyFocusMode();
    updateTimerLive();
    if (timer.phase !== 'focus') closeStandby(); else updateStandby(true);
}

/* --- 計時頁「今天的紀錄」：一眼看到今天每一輪，點一下就能修改 --- */
let logsAll = false;
const hmBold = (min) => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? `<b class="num">${h}</b> 時 <b class="num">${pad(m)}</b> 分` : `<b class="num">${m}</b> 分`; };
const clockOf = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function todayLogsHtml(t, todayMin) {
    const logs = state.sessions.filter(x => sessionDay(x) === t).sort((a, b) => b.start - a.start);
    const goal = tpref.goal, rounds = roundsOn(t), streak = studyStreak();
    const scale = Math.max(goal, todayMin) || 1;   // 進度條：滿格＝每日目標（超過目標就以總時數為準）
    const bar = [...logs].reverse().map(x => `<i style="width:${(x.minutes / scale * 100).toFixed(2)}%;background:var(--s${x.subject})"></i>`).join('');
    const shown = logsAll ? logs : logs.slice(0, 5);
    const rows = shown.map(x => `<li><button class="tl-row" data-edit="${esc(x.id)}" aria-label="編輯 ${clockOf(x.start)} ${SUBJECTS[x.subject]} ${fmtHM(x.minutes)}">
            <span class="at num">${clockOf(x.start)}</span><i class="sdot s${x.subject}"></i>
            <span class="nm">${SUBJECTS[x.subject]}${x.edited ? '<em class="tl-edited">已修改</em>' : ''}</span>
            <span class="mn num">${fmtHM(x.minutes)}</span><span class="tl-pen">${ICON_PEN}</span>
        </button></li>`).join('');
    const more = logs.length > 5 ? `<button class="tl-more" data-act="logs-all" aria-expanded="${logsAll}">${logsAll ? '收起' : `顯示全部 ${logs.length} 筆`}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>` : '';
    // 第一行：今天讀了多久／目標；第二行：幾輪、連續幾天（分兩行，不會在奇怪的地方斷行）
    const sub = [rounds ? `${rounds} 輪番茄鐘` : '', streak ? `連續讀書 ${streak} 天` : ''].filter(Boolean).map(x => `<span>${x}</span>`).join('');
    const meta = `<span class="tlog-sum">${hmBold(todayMin)} ／ 目標 ${goal / 60} 小時</span>${sub ? `<span class="tlog-sub">${sub}</span>` : ''}`;
    return `<section class="tlog" aria-labelledby="tlogTitle">
        <div class="tlog-head">
            <div class="tlog-tx"><h3 id="tlogTitle">今天的紀錄${todayMin >= goal ? '<span class="tlog-ok">達標了！</span>' : ''}</h3><p>${meta}</p></div>
            <button class="tlog-add" data-act="log-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>補登</button>
        </div>
        <div class="tlog-bar" role="img" aria-label="今日目標完成 ${Math.min(100, Math.round(todayMin / goal * 100))}%">${bar}</div>
        ${logs.length
            ? `<ul class="tl-list">${rows}</ul>${more}<p class="tlog-hint">點一筆紀錄可以改時間、科目，或刪除</p>`
            : '<p class="tlog-empty">今天還沒有紀錄，開始第一輪吧！<br>忘記按計時也可以按「補登」。</p>'}
    </section>`;
}

/* --- 編輯一筆讀書紀錄（計時頁、休息畫面、統計的當天明細都會打開這個） --- */
let sessEdit = null;   // { id, subject, minutes, orig }
function openSessEditor(id) {
    const x = state.sessions.find(r => r.id === id);
    if (!x) { toast('找不到這筆紀錄，可能已經刪除了'); return; }
    const d = new Date(x.start);
    sessEdit = { id, subject: x.subject, minutes: x.minutes, orig: x.minutes };
    $('sessSub').textContent = `${d.getMonth() + 1}/${d.getDate()} 星期${WEEK_ZH[d.getDay()]} · ${x.pomo ? '番茄鐘' : '自由計時或補登'}`;
    $('sessStart').value = clockOf(x.start);
    renderSessEditor();
    openModal('sessModal');
}
function renderSessEditor() {
    if (!sessEdit) return;
    $('sessSubj').innerHTML = SUBJECTS.map((n, i) => `<button class="${i === sessEdit.subject ? 'on' : ''}" data-es-subj="${i}" aria-pressed="${i === sessEdit.subject}"><i class="sdot s${i}"></i>${n}</button>`).join('');
    if (document.activeElement !== $('sessMin')) $('sessMin').value = sessEdit.minutes;
    const m = sessEdit.minutes;
    $('sessHint').textContent = m !== sessEdit.orig ? `原本 ${fmtHM(sessEdit.orig)}${m >= 60 ? `，改成 ${fmtHM(m)}` : ''}` : (m >= 60 ? `＝ ${fmtHM(m)}` : '');
    document.querySelectorAll('#sessQuick [data-q]').forEach(b => b.classList.toggle('on', Number(b.dataset.q) === m));
    const [hh, mm] = ($('sessStart').value || '00:00').split(':').map(Number);
    const end = (hh * 60 + mm + m) % 1440;
    $('sessEnd').textContent = `${pad(Math.floor(end / 60))}:${pad(end % 60)}${hh * 60 + mm + m >= 1440 ? '（隔天）' : ''}`;
}
const clampMin = (v) => Math.max(1, Math.min(600, Math.round(v) || 1));
$('sessModal').addEventListener('click', (e) => {
    if (!sessEdit) return;
    const subj = e.target.closest('[data-es-subj]');
    if (subj) { sessEdit.subject = Number(subj.dataset.esSubj); renderSessEditor(); return; }
    const step = e.target.closest('[data-step]');
    if (step) { sessEdit.minutes = clampMin(sessEdit.minutes + Number(step.dataset.step)); $('sessMin').value = sessEdit.minutes; renderSessEditor(); return; }
    const q = e.target.closest('[data-q]');
    if (q) { sessEdit.minutes = Number(q.dataset.q); $('sessMin').value = sessEdit.minutes; renderSessEditor(); }
});
$('sessMin').addEventListener('input', () => { const v = Number($('sessMin').value); if (v >= 1) { sessEdit.minutes = clampMin(v); renderSessEditor(); } });
$('sessMin').addEventListener('blur', () => { if (sessEdit) { $('sessMin').value = sessEdit.minutes; } });
$('sessStart').addEventListener('input', renderSessEditor);
$('sessStart').addEventListener('change', renderSessEditor);
$('sessDel').addEventListener('click', () => {
    if (!sessEdit) return;
    const id = sessEdit.id;
    closeModal('sessModal'); sessEdit = null;
    removeSession(id);
});
$('sessSave').addEventListener('click', () => {
    if (!sessEdit) return;
    const idx = state.sessions.findIndex(r => r.id === sessEdit.id);
    if (idx < 0) { closeModal('sessModal'); return; }
    const x = state.sessions[idx];
    const minutes = clampMin(Number($('sessMin').value) || sessEdit.minutes);
    const d = new Date(x.start);
    const [hh, mm] = ($('sessStart').value || clockOf(x.start)).split(':').map(Number);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime();
    if (start + minutes * 60000 > Date.now() + 60000) { toast('結束時間不能超過現在，請調短一點或改開始時間'); return; }
    if (minutes === x.minutes && start === x.start && sessEdit.subject === x.subject) { closeModal('sessModal'); return; }
    const before = { ...x };
    state.sessions[idx] = { ...x, subject: sessEdit.subject, start, minutes, edited: true };
    closeModal('sessModal'); sessEdit = null;
    afterSessionsChange();
    toast(`已改成 ${SUBJECTS[state.sessions[idx].subject]} ${fmtHM(minutes)}`, { label: '復原', fn: () => { const i = state.sessions.findIndex(r => r.id === before.id); if (i >= 0) { state.sessions[i] = before; afterSessionsChange(); } } });
});

// 每秒更新：數字、圓環、分頁標題、子母畫面
function updateTimerLive() {
    const now = Date.now();
    if (timer.phase === 'focus') {
        const el = focusElapsed(now);
        const remain = timer.duration ? timer.duration - el : 0;
        const text = timer.duration ? fmtClock(remain) : fmtClock(el);
        const frac = timer.duration ? el / timer.duration : (el % 3600000) / 3600000;
        const offset = timer.duration ? RING_C * Math.min(1, frac) : RING_C * (1 - frac);
        if ($('tmTime')) {
            roll($('tmTime'), text);
            $('tmSub').textContent = timer.duration ? `已專注 ${fmtHM(el / 60000)}` : '自由計時中';
            const bar = document.querySelector('#tab-timer .ring-bar');
            if (bar) bar.style.strokeDashoffset = offset.toFixed(1);
        }
        document.title = `${timer.pausedAt ? '⏸ ' : ''}${text} · ${SUBJECTS[timer.subject]}`;
        updateStandby();
        updatePip(text, offset);
    } else if (timer.phase === 'break') {
        const left = timer.breakLen - (now - timer.breakStart);
        if ($('brTime')) {
            const over = left <= 0;
            $('brTime').textContent = over ? '00:00' : fmtClock(left);
            $('brLabel').textContent = over ? '休息結束，準備好就開始' : '休息時間';
            $('brBox').classList.toggle('over', over);
            $('brNext').textContent = over ? '開始下一輪' : '跳過休息，開始下一輪';
        }
        document.title = left > 0 ? `休息 ${fmtClock(left)}` : BASE_TITLE;
        updatePip(left > 0 ? fmtClock(left) : '00:00', RING_C * (1 - Math.max(0, left) / timer.breakLen));
    } else {
        document.title = BASE_TITLE;
    }
}

function timerTick() {
    if (timer.phase === 'focus' && timer.duration && !timer.pausedAt && focusElapsed() >= timer.duration) {
        const st = timer.startAt;   // 這一輪開始的時間（用來確認是這一輪結束了）
        finishFocus(true);
        if (timer.phase === 'break' && timer.breakStart >= st) onTimeUp();
        return;
    }
    if (timer.phase === 'break' && !timer.chimed && Date.now() - timer.breakStart >= timer.breakLen) {
        timer.chimed = true; saveTimer(); chime();
    }
    if (timer.phase !== 'idle') updateTimerLive();
    pillLive();
    const mr = document.querySelector('#tab-timer .mn-ring');
    if (mr && timer.phase === 'focus') mr.style.setProperty('--fp', $('focusPill').style.getPropertyValue('--fp') || 0);
}

/* --- 電腦子母畫面 --- */
let pipWin = null;
async function openPip() {
    if (!pipSupported) return;
    if (pipWin) { pipWin.focus(); return; }
    try {
        pipWin = await window.documentPictureInPicture.requestWindow({ width: 360, height: 190 });
    } catch (e) { toast('無法開啟子母畫面'); return; }
    const d = pipWin.document;
    [...document.styleSheets].forEach(ss => {
        try {
            const st = d.createElement('style');
            st.textContent = [...ss.cssRules].map(r => r.cssText).join('\n');
            d.head.appendChild(st);
        } catch (e) {
            if (ss.href) { const l = d.createElement('link'); l.rel = 'stylesheet'; l.href = ss.href; d.head.appendChild(l); }
        }
    });
    d.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme'));
    const acc = document.documentElement.getAttribute('data-accent');
    if (acc) d.documentElement.setAttribute('data-accent', acc);
    d.body.className = 'pip-body';
    d.body.innerHTML = `<div class="pip">
        <div class="ring-wrap">${ringSvg()}<div class="ring-center" id="pipRound"></div></div>
        <div class="pip-info">
            <span class="who" id="pipWho"></span>
            <span class="tm" id="pipTime"></span>
            <div class="row" id="pipBtns"></div>
        </div></div>`;
    d.body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pip]');
        if (!b) return;
        if (b.dataset.pip === 'pause') togglePause();
        else if (b.dataset.pip === 'done') finishFocus(false);
        else if (b.dataset.pip === 'next') endBreak(true);
    });
    pipWin.addEventListener('pagehide', () => { pipWin = null; });
    updateTimerLive();
}
let pipKey = '';
function updatePip(text, offset) {
    if (!pipWin) return;
    const d = pipWin.document;
    if (!d.getElementById('pipTime')) return;
    d.getElementById('pipTime').textContent = text;
    const bar = d.querySelector('.ring-bar');
    if (bar) { bar.style.strokeDashoffset = offset.toFixed(1); bar.classList.toggle('paused', !!timer.pausedAt); }
    const key = timer.phase + (timer.pausedAt ? 'p' : '') + timer.subject;
    if (key === pipKey) return;
    pipKey = key;
    d.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme'));
    if (timer.phase === 'focus') {
        d.getElementById('pipWho').innerHTML = `<i class="sdot s${timer.subject}"></i>${SUBJECTS[timer.subject]} · ${timer.pausedAt ? '已暫停' : '專注中'}`;
        d.getElementById('pipRound').textContent = timer.duration ? `第 ${roundsOn(todayStr()) + 1} 輪` : '';
        d.getElementById('pipBtns').innerHTML = `<button class="btn btn-small btn-outline-accent" data-pip="pause">${timer.pausedAt ? '繼續' : '暫停'}</button><button class="btn btn-small" data-pip="done">完成</button>`;
    } else {
        d.getElementById('pipWho').textContent = '休息中';
        d.getElementById('pipRound').textContent = '';
        d.getElementById('pipBtns').innerHTML = '<button class="btn btn-small btn-outline-accent" data-pip="next">開始下一輪</button>';
    }
}

/* --- 計時頁的按鈕 --- */
$('tab-timer').addEventListener('click', (e) => {
    const subj = e.target.closest('[data-subj]');
    if (subj) { tpref.subject = Number(subj.dataset.subj); saveTpref(); renderTimer(); return; }
    const mode = e.target.closest('[data-mode]');
    if (mode) { tpref.mode = Number(mode.dataset.mode); saveTpref(); renderTimer(); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { openSessEditor(ed.dataset.edit); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'logs-all') { logsAll = !logsAll; renderTimer(); return; }
    if (act === 'log-add') { openLogModal(todayStr()); return; }
    if (act === 'start') startFocus();
    else if (act === 'pause') togglePause();
    else if (act === 'finish') finishFocus(false);
    else if (act === 'cancel') cancelFocus();
    else if (act === 'next') endBreak(true);
    else if (act === 'stop') endBreak(false);
    else if (act === 'stats') { statOffset = 0; statSel = null; renderStats(); showTab('tab-stats'); }
    else if (act === 'pip') openPip();
    else if (act === 'standby') openStandby();
    else if (act === 'room') { if (timer.phase === 'focus') focusMin = true; roomView = null; showTab('tab-room'); }
    else if (act === 'minimize') { focusMin = true; lsSet(LS.minTip, true); renderTimer(); window.scrollTo({ top: 0 }); }
    else if (act === 'expand') openFocusFull();
});
$('tab-timer').addEventListener('change', (e) => {
    const key = e.target.dataset.task;
    if (!key || !state.weekly[key]) return;
    state.weekly[key].done = e.target.checked;
    const unitMsg = e.target.checked ? weeklyUnitDone(key, true) : '';
    save(); renderToday(); renderWeek();
    if (e.target.checked) toast(unitMsg ? `已在進度表打勾，${unitMsg}` : '已在進度表打勾');
});
onAppShow(() => {
    tick();
    publishProfile(true);
    if (timer.phase === 'focus' && !timer.pausedAt) requestWake();
    timerTick();
});

/* =====================================================
 * 6. 統計
 * ===================================================== */
let statRange = 'week', statOffset = 0, statSel = null;
const GOALS = [60, 120, 180, 240, 300, 360];

function periodDays(offset) {
    const now = new Date();
    if (statRange === 'week') {
        const m = getMonday(now);
        m.setDate(m.getDate() + 7 * offset);
        return Array.from({ length: 7 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return d; });
    }
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1));
}
function minutesBySubject(days) {
    const map = {};
    days.forEach(d => { map[ymd(d)] = [0, 0, 0, 0, 0]; });
    state.sessions.forEach(x => { const k = sessionDay(x); if (map[k]) map[k][x.subject] += x.minutes; });
    return map;
}

function renderStats() {
    const el = $('tab-stats');
    if (!el) return;
    const t = todayStr();
    const days = periodDays(statOffset);
    const keys = days.map(ymd);
    const map = minutesBySubject(days);
    const sums = keys.map(k => map[k].reduce((a, b) => a + b, 0));
    const total = sums.reduce((a, b) => a + b, 0);
    const prevDays = periodDays(statOffset - 1);
    const prevMap = minutesBySubject(prevDays);
    const prevTotal = Object.values(prevMap).reduce((a, r) => a + r.reduce((x, y) => x + y, 0), 0);
    const countedDays = keys.filter(k => k <= t).length;
    const avg = countedDays ? total / countedDays : 0;
    const word = statRange === 'week' ? '週' : '月';
    const fmtMD = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    const periodTitle = statRange === 'week'
        ? (statOffset === 0 ? '本週' : statOffset === -1 ? '上週' : `${fmtMD(days[0])} 那週`)
        : (statOffset === 0 ? '本月' : `${days[0].getFullYear()} 年 ${days[0].getMonth() + 1} 月`);
    if (!statSel || !keys.includes(statSel)) {
        statSel = keys.includes(t) ? t : (keys.slice().reverse().find(k => map[k].some(v => v)) || keys[keys.length - 1]);
    }
    const goal = tpref.goal;
    const rounds = state.sessions.filter(x => x.pomo && keys.includes(sessionDay(x))).length;

    // 和上一期比較
    const diff = total - prevTotal;
    let deltaHtml = '';
    if (total || prevTotal) {
        deltaHtml = diff > 0
            ? `<span class="up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>比上${word}多 ${fmtHM(diff)}</span>`
            : diff < 0 ? `比上${word}少 ${fmtHM(-diff)}` : `和上${word}一樣`;
    }
    if (rounds) deltaHtml += `${deltaHtml ? ' · ' : ''}${rounds} 輪番茄鐘`;

    // 圖表刻度（整點小時，一定包含目標線）
    const maxDay = Math.max(0, ...sums);
    let topH = Math.max(1, Math.ceil(maxDay / 60), Math.ceil(goal / 60));
    const step = topH > 6 ? 2 : 1;
    topH = Math.ceil(topH / step) * step;
    const H = 200, topMin = topH * 60;
    let grid = '', ylab = '';
    for (let h = 0; h <= topH; h += step) {
        const y = h / topH * 100;
        grid += `<div class="chart-grid ${h === 0 ? 'base' : ''}" style="bottom:${y}%"></div>`;
        ylab += `<span style="bottom:${y}%">${h}h</span>`;
    }
    const isWeek = statRange === 'week';
    const bars = keys.map((k, i) => {
        const row = map[k];
        const segs = row.map((v, s) => v > 0 ? `<i style="height:${Math.max(2, v / topMin * H - 2).toFixed(1)}px;background:var(--s${s})"></i>` : '').join('');
        const d = days[i];
        const label = `${fmtMD(d)} 星期${WEEK_ZH[d.getDay()]}：${fmtHM(sums[i])}`;
        const top = isWeek && sums[i] ? `<span class="bar-top num ${sums[i] >= goal ? 'ok' : ''}">${Math.floor(sums[i] / 60)}:${pad(sums[i] % 60)}</span>` : '';
        return `<button class="bar-col ${k === statSel ? 'sel' : ''}" data-day="${k}" title="${label}" aria-label="${label}">${top}<span class="bar-stack">${segs}</span></button>`;
    }).join('');
    const xlab = days.map((d, i) => {
        const k = keys[i];
        let txt = isWeek ? WEEK_ZH[d.getDay()] : ([1, 5, 10, 15, 20, 25, 30].includes(d.getDate()) ? d.getDate() : '');
        if (isWeek && k === t) txt += '（今）';
        return `<span class="${k === statSel ? 'sel' : ''}">${txt}</span>`;
    }).join('');

    // 選中的那天
    const sd = parseYmd(statSel);
    const selSum = map[statSel].reduce((a, b) => a + b, 0);
    const selCount = state.sessions.filter(x => sessionDay(x) === statSel).length;

    // 各科
    const subjTot = SUBJECTS.map((_, s) => keys.reduce((a, k) => a + map[k][s], 0));
    const goalDays = sums.filter(v => v >= goal).length;
    const order = SUBJECTS.map((_, s) => s).sort((a, b) => subjTot[b] - subjTot[a]);

    el.innerHTML = `<div class="stats-wrap">
        <div class="stats-head">
            <button class="icon-btn ghost" data-sact="prev" aria-label="上一${word}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
            <div class="period"><b>${periodTitle}</b><span class="num">${fmtMD(days[0])} – ${fmtMD(days[days.length - 1])}</span></div>
            <button class="icon-btn ghost" data-sact="next" aria-label="下一${word}" ${statOffset >= 0 ? 'disabled style="opacity:.3"' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
            <div class="seg two" role="tablist" aria-label="統計範圍">
                <button role="tab" aria-selected="${isWeek}" class="${isWeek ? 'active' : ''}" data-range="week">週</button>
                <button role="tab" aria-selected="${!isWeek}" class="${!isWeek ? 'active' : ''}" data-range="month">月</button>
            </div>
        </div>

        <section style="margin-top:14px" aria-label="${periodTitle}總共讀了 ${fmtHM(total)}">
            <div class="hero-total num">${Math.floor(total / 60) ? `<b>${Math.floor(total / 60)}</b><span>時</span>` : ''}<b>${pad(total % 60)}</b><span>分</span></div>
            <p class="delta">${deltaHtml}</p>
        </section>

        <div class="kpi3">
            <div><b class="num">${Math.floor(avg / 60)}:${pad(Math.round(avg % 60))}</b><span>日平均</span></div>
            <div><b class="num hot">${studyStreak()}<small>天</small></b><span>連續讀書</span></div>
            <div><b class="num ok">${goalDays}<small>/ ${countedDays || days.length}</small></b>
                <span>達標每日 <select class="goal-select" id="goalSelect" aria-label="每日目標">${GOALS.map(g => `<option value="${g}" ${g === goal ? 'selected' : ''}>${g / 60} 小時</option>`).join('')}</select></span></div>
        </div>

        <section aria-label="每天讀書時數，依科目堆疊">
            <div class="chart">
                <div class="chart-y num">${ylab}</div>
                <div class="chart-plot">${grid}<div class="goal-dash" style="bottom:${(goal / topMin * 100).toFixed(2)}%"></div><div class="chart-bars">${bars}</div></div>
            </div>
            <div class="chart-x">${xlab}</div>
            <div class="legend-row">${SUBJECTS.map((n, s) => `<span><i class="sdot s${s}"></i>${n}</span>`).join('')}<span class="goal-key"><i></i>每日目標</span></div>
            <button class="day-row" data-sact="day">
                <b>${fmtMD(sd)} 星期${WEEK_ZH[sd.getDay()]}${statSel === t ? '（今天）' : ''}</b>
                <span class="muted">${selCount ? `${selCount} 筆紀錄` : '沒有紀錄'}</span>
                <span class="grow"></span>
                <b class="num">${fmtHM(selSum)}</b>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
            </button>
        </section>

        <section class="stats-sec">
            <div class="sec-head"><h3>各科比例</h3><span>${periodTitle}</span></div>
            <div class="split-bar">${total ? subjTot.map((v, s) => v ? `<i style="width:${(v / total * 100).toFixed(2)}%;background:var(--s${s})"></i>` : '').join('') : '<i style="width:100%;background:var(--surface-2)"></i>'}</div>
            ${order.map((s, k) => `<div class="rank-subj">
                <span class="num rk">${k + 1}</span><i class="sdot s${s}"></i><span class="nm">${SUBJECTS[s]}</span>
                <span class="t num">${fmtHM(subjTot[s])}</span><span class="p num">${total ? Math.round(subjTot[s] / total * 100) : 0}%</span>
            </div>`).join('')}
        </section>

        ${heatHtml()}

        <div style="display:flex;justify-content:center;margin-top:16px">
            <button class="text-link" data-sact="add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>補登讀書時間</button>
        </div>
    </div>`;
    setTopExtra('tab-stats', `<button class="icon-btn" data-top="share-day" aria-label="分享這天"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button>`);
    if ($('dayModal').classList.contains('open')) renderDaySheet();
    heatAfterRender();
}

// 某一天的明細（下方滑出）
function renderDaySheet() {
    const sd = parseYmd(statSel);
    const logs = state.sessions.filter(x => sessionDay(x) === statSel).sort((a, b) => a.start - b.start);
    const sum = logs.reduce((a, x) => a + x.minutes, 0);
    $('dayTitle').textContent = `${sd.getMonth() + 1}/${sd.getDate()} 星期${WEEK_ZH[sd.getDay()]}${statSel === todayStr() ? '（今天）' : ''}`;
    $('daySum').textContent = fmtHM(sum);
    $('daySplit').innerHTML = sum ? logs.map(x => `<i style="width:${(x.minutes / sum * 100).toFixed(2)}%;background:var(--s${x.subject})"></i>`).join('') : '';
    $('dayLogs').innerHTML = logs.length ? logs.map(x => {
        const d = new Date(x.start);
        return `<li class="log-row"><button class="log-main" data-edit="${esc(x.id)}" aria-label="編輯 ${pad(d.getHours())}:${pad(d.getMinutes())} ${SUBJECTS[x.subject]}"><span class="at">${pad(d.getHours())}:${pad(d.getMinutes())}</span><i class="sdot s${x.subject}"></i><span class="nm">${SUBJECTS[x.subject]}${x.edited ? '<em class="tl-edited">已修改</em>' : ''}</span><span class="mn">${fmtHM(x.minutes)}</span><span class="tl-pen">${ICON_PEN}</span></button><button class="del-btn" data-del="${esc(x.id)}" aria-label="刪除這筆紀錄">${ICON_X}</button></li>`;
    }).join('') : '<li class="empty">這天沒有讀書紀錄</li>';
}
function openDaySheet() { renderDaySheet(); openModal('dayModal'); }
$('dayModal').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { removeSession(del.dataset.del); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { openSessEditor(ed.dataset.edit); return; }
    const a = e.target.closest('[data-day-act]')?.dataset.dayAct;
    if (a === 'add') openLogModal();
    else if (a === 'share') { closeModal('dayModal'); openShareCard(statSel); }
});

$('tab-stats').addEventListener('click', (e) => {
    const day = e.target.closest('[data-day]');
    if (day) { statSel = day.dataset.day; renderStats(); return; }
    const range = e.target.closest('[data-range]');
    if (range) { statRange = range.dataset.range; statOffset = 0; statSel = null; renderStats(); return; }
    const act = e.target.closest('[data-sact]')?.dataset.sact;
    if (act === 'prev') { statOffset--; statSel = null; renderStats(); }
    else if (act === 'next' && statOffset < 0) { statOffset++; statSel = null; renderStats(); }
    else if (act === 'add') openLogModal();   // 統計頁：預設選的那天
    else if (act === 'day') openDaySheet();
    else if (act === 'heat-half' || act === 'heat-year') { heatRange = act === 'heat-year' ? 'year' : 'half'; lsSet(LS.heat, heatRange); heatSel = null; renderStats(); }
    else if (act === 'heat-share') openHeatShare();
    const hm = e.target.closest('[data-hm]');
    if (hm) {
        heatSel = heatSel === hm.dataset.hm ? null : hm.dataset.hm;
        document.querySelectorAll('#heatSec .hm-d.sel').forEach(x => x.classList.remove('sel'));
        if (heatSel) { hm.classList.add('sel'); showHeatTip(heatSel); } else $('heatSec').querySelector('.hm-tip')?.remove();
    }
});
$('tab-stats').addEventListener('change', (e) => {
    if (e.target.id === 'goalSelect') { tpref.goal = Number(e.target.value); saveTpref(); renderStats(); renderTimer(); renderToday(); }
});

/* --- 補登 --- */
$('logSubject').innerHTML = SUBJECTS.map((n, i) => `<option value="${i}">${n}</option>`).join('');
function openLogModal(date) {
    const now = new Date();
    $('logSubject').value = String(tpref.subject);
    $('logDate').value = date || (statSel && statSel <= todayStr() ? statSel : todayStr());
    $('logDate').max = todayStr();
    $('logTime').value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    $('logMinutes').value = 25;
    openModal('logModal');
}
$('saveLogBtn').addEventListener('click', () => {
    const minutes = Number($('logMinutes').value);
    const date = $('logDate').value, time = $('logTime').value || '00:00';
    if (!date) { toast('請選擇日期'); return; }
    if (!(minutes >= 1 && minutes <= 600)) { toast('分鐘數請填 1 到 600'); return; }
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const start = new Date(y, m - 1, d, hh, mm).getTime();
    if (start > Date.now()) { toast('不能補登未來的時間'); return; }
    recordSession(Number($('logSubject').value), start, minutes, false);
    if (document.body.dataset.tab === 'tab-stats' || $('dayModal').classList.contains('open')) statSel = date;
    closeModal('logModal');
    afterSessionsChange();
    toast(`已補登 ${fmtHM(minutes)}`);
});


/* =====================================================
 * 7. 質感與操作（滑動、快捷鍵、指令面板、分享卡片）
 * ===================================================== */

/* --- ⑤ 手機按按鈕時輕微震動（Android 支援；iPhone 瀏覽器不支援震動） --- */
document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    if (e.target.closest('button, .tab-btn, .cal-cell, .slot')) { device.vibrate(8); }
}, { passive: true });

/* --- ⑥ 待辦左右滑：往右完成、往左刪除 --- */
(function () {
    const list = $('todoList');
    let row = null, fg = null, sx = 0, sy = 0, dx = 0, lock = null, pid = null;
    list.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        if (e.target.closest('input, button')) return;
        row = e.target.closest('.swipe-row');
        if (!row) return;
        fg = row.querySelector('.swipe-fg');
        sx = e.clientX; sy = e.clientY; dx = 0; lock = null; pid = e.pointerId;
    });
    list.addEventListener('pointermove', (e) => {
        if (!row || e.pointerId !== pid) return;
        const mx = e.clientX - sx, my = e.clientY - sy;
        if (!lock) {
            if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) { lock = 'x'; row.classList.add('swiping'); fg.classList.remove('anim'); try { list.setPointerCapture(pid); } catch (err) {} }
            else if (Math.abs(my) > 8) { lock = 'y'; row = null; return; }
            else return;
        }
        dx = mx;
        row.classList.toggle('to-right', dx > 0);
        row.classList.toggle('to-left', dx < 0);
        fg.style.transform = `translateX(${dx}px)`;
    });
    function end() {
        if (!row) return;
        const r = row, f = fg, w = r.offsetWidth;
        row = null;
        if (lock !== 'x') return;
        f.classList.add('anim');
        if (Math.abs(dx) > w * 0.35) {
            f.style.transform = `translateX(${dx > 0 ? w : -w}px)`;
            device.vibrate(12);
            setTimeout(() => removeTodo(r, dx > 0 ? '完成一項，讚！' : '已刪除'), 200);
        } else {
            f.style.transform = '';
            setTimeout(() => r.classList.remove('swiping', 'to-left', 'to-right'), 250);
        }
    }
    list.addEventListener('pointerup', end);
    list.addEventListener('pointercancel', end);
})();

/* --- ⑦ 鍵盤快捷鍵 --- */
const TAB_ORDER = ['tab-countdown', 'tab-weekly', 'tab-timer', 'tab-calendar', 'tab-todo'];
const isTyping = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
document.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if ($('paletteModal').classList.contains('open')) closeModal('paletteModal'); else openPalette();
        return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTyping(document.activeElement) || document.querySelector('.modal.open') || document.body.classList.contains('chat-open') || document.body.classList.contains('guide-open')) return;
    const tab = document.body.dataset.tab;
    if (/^[1-5]$/.test(e.key)) { if (e.key === '3' && (timer.phase === 'focus' || timeUp)) { focusMin = false; timeUp = false; } showTab(TAB_ORDER[Number(e.key) - 1]); return; }
    if (e.key === '?') { openModal('keysModal'); return; }
    if (e.key === 't' || e.key === 'T') { $('themeBtn').click(); return; }
    if (e.key === ' ') {
        if (timer.phase === 'focus' && tab === 'tab-timer' && !focusMin) { e.preventDefault(); togglePause(); }
        else if (tab === 'tab-timer' && timer.phase === 'idle') { e.preventDefault(); startFocus(); }
        else if (tab === 'tab-timer' && timer.phase === 'break') { e.preventDefault(); endBreak(true); }
        return;
    }
    if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (tab === 'tab-calendar') openEventModal({ date: selDate });
        else { showTab('tab-todo'); setTimeout(() => $('todoInput').focus(), 50); }
        return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const d = e.key === 'ArrowLeft' ? -1 : 1;
        if (tab === 'tab-calendar') moveMonth(d);
        else if (tab === 'tab-weekly') $(d < 0 ? 'prevWeekBtn' : 'nextWeekBtn').click();
        else if (tab === 'tab-stats') { if (d < 0 || statOffset < 0) { statOffset += d; statSel = null; renderStats(); } }
    }
});

/* --- ⑦ 指令面板（⌘K / Ctrl+K） --- */
let paletteItems = [], paletteSel = 0;
function buildPalette(q) {
    const text = q.trim();
    const low = text.toLowerCase();
    const items = [];
    const match = (...words) => !text || words.some(w => w.toLowerCase().includes(low) || low.includes(w.toLowerCase()));
    if (text) {
        items.push({ group: '新增', label: `新增待辦「${text}」`, key: '↵', run: () => { state.todos.push({ id: uid(), text }); save(); renderTodos(); toast('已新增待辦'); } });
        items.push({ group: '新增', label: `新增行程「${text}」到 ${shortDate(selDate)}`, run: () => {
            state.events.push({ id: uid(), title: text, start: selDate, important: false }); save(); renderCalendar(); toast(`已新增到 ${shortDate(selDate)}`);
        } });
    }
    const subjHit = SUBJECTS.map((s, i) => [s, i]).filter(([s]) => text && (s.includes(text) || text.includes(s)));
    const focusList = subjHit.length ? subjHit : (match('專注', '計時', '開始', 'focus', 'timer') ? SUBJECTS.map((s, i) => [s, i]) : []);
    if (timer.phase === 'idle') {
        focusList.forEach(([s, i]) => items.push({ group: '計時', label: `開始專注 · ${s}　${MODES[tpref.mode].label}`, run: () => {
            tpref.subject = i; saveTpref(); showTab('tab-timer'); startFocus();
        } }));
    } else if (timer.phase === 'focus' && match('暫停', '繼續', '計時', 'pause')) {
        items.push({ group: '計時', label: timer.pausedAt ? '繼續計時' : '暫停計時', key: 'Space', run: togglePause });
    }
    const go = [['倒數', 'countdown'], ['進度', 'weekly'], ['計時', 'timer'], ['行事曆', 'calendar'], ['待辦', 'todo']];
    go.forEach(([n, id], i) => { if (match(n, id, '前往')) items.push({ group: '前往', label: n, key: String(i + 1), run: () => showTab('tab-' + id) }); });
    if (AI_ON && match('AI', '讀書計畫', '計畫', 'plan')) items.push({ group: '前往', label: 'AI 讀書計畫', run: () => showTab('tab-ai') });
    if (match('學測範圍', '範圍', '單元', '重點複習', 'syllabus')) items.push({ group: '前往', label: '學測範圍', run: () => showTab('tab-syllabus') });
    if (match('課表', '上課', '節次', 'timetable')) items.push({ group: '前往', label: '課表', run: () => { calView = 'tt'; lsSet(LS.calView, calView); showTab('tab-calendar'); applyCalView(); } });
    if (match('房間', '讀書房間', '朋友', 'room')) items.push({ group: '前往', label: '讀書房間', run: () => { roomView = null; showTab('tab-room'); } });
    if (match('統計', 'stats')) items.push({ group: '前往', label: '讀書統計', run: () => { statOffset = 0; statSel = null; renderStats(); showTab('tab-stats'); } });
    if (match('深色', '淺色', '主題', 'theme', 'dark', 'light')) items.push({ group: '設定', label: '切換深淺色', key: 'T', run: () => $('themeBtn').click() });
    if (match('主題色', '顏色', '背景', '外觀', '帳號', '登入', 'account')) items.push({ group: '設定', label: '個人設定（主題色、背景、外觀）', run: () => openModal('accountModal') });
    if (match('快捷鍵', 'shortcut', 'keys')) items.push({ group: '設定', label: '鍵盤快捷鍵', key: '?', run: () => openModal('keysModal') });
    return items;
}
function renderPalette() {
    paletteItems = buildPalette($('paletteInput').value);
    paletteSel = Math.min(paletteSel, Math.max(0, paletteItems.length - 1));
    let html = '', group = '';
    paletteItems.forEach((it, i) => {
        if (it.group !== group) { group = it.group; html += `<p class="palette-group">${group}</p>`; }
        html += `<button class="palette-item ${i === paletteSel ? 'sel' : ''}" data-i="${i}" role="option" aria-selected="${i === paletteSel}"><span class="grow">${esc(it.label)}</span>${it.key ? `<span class="kbd">${esc(it.key)}</span>` : ''}</button>`;
    });
    $('paletteList').innerHTML = html || '<p class="empty" style="padding:12px">找不到符合的項目</p>';
    const sel = $('paletteList').querySelector('.palette-item.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
}
function openPalette() {
    $('paletteInput').value = '';
    paletteSel = 0;
    renderPalette();
    openModal('paletteModal');
    $('paletteInput').focus();
}
function runPalette(i) {
    const it = paletteItems[i];
    if (!it) return;
    closeModal('paletteModal');
    it.run();
}
$('paletteInput').addEventListener('input', () => { paletteSel = 0; renderPalette(); });
$('paletteInput').addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); paletteSel = Math.min(paletteItems.length - 1, paletteSel + 1); renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); paletteSel = Math.max(0, paletteSel - 1); renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); runPalette(paletteSel); }
});
$('paletteList').addEventListener('click', (e) => {
    const b = e.target.closest('.palette-item');
    if (b) runPalette(Number(b.dataset.i));
});

/* --- ⑧ 分享卡片（1080 × 1920，IG 限動尺寸） --- */
let shareBlob = null, shareUrl = '';
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function spacedText(ctx, text, x, y, spacing) {
    for (const ch of text) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + spacing; }
    return x;
}
async function drawShareCard(ds) {
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#E9B154';
    const rgb = css.getPropertyValue('--accent-rgb').trim() || '233, 177, 84';
    const sub = [0, 1, 2, 3, 4].map(i => {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        return ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181'][i] || (dark ? '#fff' : '#000');
    });
    const zh = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
    const num = 'Manrope, "Noto Sans TC", sans-serif';
    try {
        await Promise.all([
            document.fonts.load(`600 260px Manrope`, '0123456789'),
            document.fonts.load(`700 40px "Noto Sans TC"`, '今天讀了時分距離學測天連續讀書倒數數學自然英文國文社會'),
            document.fonts.load(`500 40px "Noto Sans TC"`, '今天讀了時分距離學測天連續讀書倒數數學自然英文國文社會')
        ]);
    } catch (e) {}

    const W = 1080, H = 1920, P = 96;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#050608'; ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(W * 0.72, H * 0.2, 0, W * 0.72, H * 0.2, W * 0.75);
    g.addColorStop(0, `rgba(${rgb}, 0.26)`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(W * 0.1, H * 0.92, 0, W * 0.1, H * 0.92, W * 0.6);
    g.addColorStop(0, `rgba(${rgb}, 0.1)`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const d = parseYmd(ds);
    const EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = accent; ctx.font = `600 36px ${num}`;
    spacedText(ctx, `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} · ${EN[d.getDay()]}`, P, 300, 11);

    const mins = dayMinutes(ds);
    ctx.fillStyle = 'rgba(242,240,233,0.7)'; ctx.font = `500 44px ${zh}`;
    ctx.fillText(ds === todayStr() ? '今天讀了' : `${d.getMonth() + 1}/${d.getDate()} 讀了`, P, 620);
    const h = Math.floor(mins / 60), m = mins % 60;
    let x = P;
    const big = (v) => { ctx.fillStyle = '#F2F0E9'; ctx.font = `600 260px ${num}`; ctx.fillText(String(v), x - 8, 880); x += ctx.measureText(String(v)).width + 10; };
    const unit = (u) => { ctx.fillStyle = 'rgba(242,240,233,0.7)'; ctx.font = `500 52px ${zh}`; ctx.fillText(u, x, 876); x += ctx.measureText(u).width + 34; };
    if (h) { big(h); unit('時'); }
    big(m); unit('分');

    // 各科比例條
    const per = SUBJECTS.map((_, s) => state.sessions.reduce((a, r) => a + (sessionDay(r) === ds && r.subject === s ? r.minutes : 0), 0));
    const total = per.reduce((a, b) => a + b, 0);
    const barY = 960, barH = 28, gap = 8;
    if (total) {
        const parts = per.map((v, s) => [v, s]).filter(([v]) => v > 0);
        const avail = W - P * 2 - gap * (parts.length - 1);
        let bx = P;
        ctx.save(); roundRect(ctx, P, barY, W - P * 2, barH, barH / 2); ctx.clip();
        parts.forEach(([v, s]) => { const bw = avail * v / total; ctx.fillStyle = sub[s]; ctx.fillRect(bx, barY, bw, barH); bx += bw + gap; });
        ctx.restore();
        ctx.font = `500 34px ${zh}`;
        let lx = P, ly = barY + 100;
        parts.forEach(([v, s]) => {
            const label = `${SUBJECTS[s]} ${fmtHM(v)}`;
            const w = 22 + 14 + ctx.measureText(label).width;
            if (lx + w > W - P) { lx = P; ly += 64; }
            ctx.fillStyle = sub[s]; roundRect(ctx, lx, ly - 22, 22, 22, 5); ctx.fill();
            ctx.fillStyle = 'rgba(242,240,233,0.85)'; ctx.fillText(label, lx + 36, ly);
            lx += w + 42;
        });
    } else {
        ctx.fillStyle = 'rgba(242,240,233,0.12)'; roundRect(ctx, P, barY, W - P * 2, barH, barH / 2); ctx.fill();
    }

    // 底部數據
    const lineY = 1420;
    ctx.fillStyle = 'rgba(242,240,233,0.15)'; ctx.fillRect(P, lineY, W - P * 2, 2);
    const gsat = EXAMS.gsat;
    const left = Math.max(0, Math.floor((examTime(gsat.date) - Date.now()) / 86400000));   // 跟倒數頁一樣的算法
    const stat = (vx, value, unitText, label, color) => {
        ctx.fillStyle = color; ctx.font = `700 96px ${num}`; ctx.fillText(String(value), vx, lineY + 140);
        const vw = ctx.measureText(String(value)).width;
        ctx.fillStyle = 'rgba(242,240,233,0.7)'; ctx.font = `500 40px ${zh}`; ctx.fillText(unitText, vx + vw + 12, lineY + 140);
        ctx.font = `500 36px ${zh}`; ctx.fillText(label, vx, lineY + 200);
    };
    stat(P, left, '天', `距離 ${gsat.name}`, accent);
    stat(W / 2 + 20, studyStreak(), '天', '連續讀書', '#F2F0E9');

    // 圖示＋名稱
    const cx = P + 30, cy = 1800, r = 22;
    ctx.lineCap = 'round'; ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(242,240,233,0.2)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = accent; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI); ctx.stroke();
    ctx.fillStyle = 'rgba(242,240,233,0.85)'; ctx.font = `700 34px ${zh}`;
    spacedText(ctx, '學測倒數', cx + 52, cy + 12, 10);

    return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}
async function openShareCard(ds) {
    toast('正在產生卡片…');
    showShareBlob(await drawShareCard(ds || todayStr()), `讀書卡片-${ds || todayStr()}.png`, '分享卡片');
}
// 顯示一張做好的分享圖（今天的卡片、熱力圖共用）
function showShareBlob(blob, filename, title) {
    shareBlob = blob;
    if (!shareBlob) { toast('產生卡片失敗'); return; }
    $('shareTitle').textContent = title || '分享卡片';
    if (shareUrl) URL.revokeObjectURL(shareUrl);   // 上一張卡片的圖用不到了，釋放記憶體
    const url = shareUrl = URL.createObjectURL(shareBlob);
    $('shareImg').src = url;
    $('shareDownload').href = url;
    $('shareDownload').download = filename;
    const file = new File([shareBlob], 'study-card.png', { type: 'image/png' });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    $('shareNativeBtn').style.display = canShare ? '' : 'none';
    $('shareNote').textContent = canShare ? '按「分享」可以直接傳到 IG、LINE' : '手機上也可以長按圖片儲存';
    $('toast').classList.remove('show');
    openModal('shareModal');
}
$('shareNativeBtn').addEventListener('click', async () => {
    if (!shareBlob) return;
    const file = new File([shareBlob], 'study-card.png', { type: 'image/png' });
    try { await navigator.share({ files: [file], title: '學測倒數 · 讀書卡片' }); }
    catch (e) { if (e.name !== 'AbortError') toast('無法分享，請改用「儲存圖片」'); }
});

/* =====================================================
 * 8. AI 讀書計畫（從「進度」分頁進入）
 *    使用 Firebase AI Logic（Gemini Developer API，免費方案可用）
 * ===================================================== */
const AI_DAILY_LIMIT = 5;
const RATE_TEXT = ['弱', '普通', '強'];
let aiPref = Object.assign({ weekday: 3, weekend: 6, rate: [1, 1, 1, 1, 1], range: 'next', scope: {} }, lsGet(LS.aiPref, {}));
if (!Array.isArray(aiPref.rate) || aiPref.rate.length !== SUBJECTS.length) aiPref.rate = [1, 1, 1, 1, 1];
const saveAiPref = () => lsSet(LS.aiPref, aiPref);
let aiBusy = false;
let aiResult = null;   // { analysis: [], days: [{ date, items: [{ subject, task, minutes, on, full }] }] }
let aiError = '';
let aiErrorCode = '';   // 顯示在錯誤訊息下面，方便查問題
let aiModel = null;   // { 模型名稱: 模型 }
let aiRetryNote = '';  // 重試時顯示在讀取畫面上
let aiStep = 0;        // 0 讀書時間、1 各科狀況、2 確認計畫

function aiUsedToday() {
    const c = lsGet(LS.aiCount, {});
    return c.date === todayStr() ? c.n : 0;
}
function aiCountUp() { lsSet(LS.aiCount, { date: todayStr(), n: aiUsedToday() + 1 }); }

// 要排的日期：本週（今天起）或下週一到週日
function aiDates() {
    const now = new Date();
    const start = aiPref.range === 'next' ? getMonday(now) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (aiPref.range === 'next') start.setDate(start.getDate() + 7);
    const end = getMonday(start); end.setDate(end.getDate() + 6);
    const out = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(ymd(d));
    return out;
}
const isWeekend = (ds) => [0, 6].includes(parseYmd(ds).getDay());
function nextExam() {
    const now = Date.now();
    return examEntries.map(([k, e]) => ({ key: k, ...e })).find(e => examEndTime(e) > now) || null;
}
// 這一天這一科還有空格嗎
const freeSlot = (ds, s, taken) => {
    for (let k = 0; k < SLOTS; k++) {
        const key = `${ds}_${s}_${k}`;
        if (!state.weekly[key]?.text && !taken.has(key)) return key;
    }
    return null;
};

// 只傳統計數字給 AI：不傳姓名、待辦內容、進度表裡寫的文字
function buildAiPrompt() {
    const dates = aiDates();
    const t = todayStr();
    const back = [];
    for (let i = 14; i >= 1; i--) { const d = new Date(); d.setDate(d.getDate() - i); back.push(ymd(d)); }
    const bySubj = [0, 0, 0, 0, 0];
    const byWeekday = [0, 0, 0, 0, 0, 0, 0];
    state.sessions.forEach(x => {
        const k = sessionDay(x);
        if (!back.includes(k)) return;
        bySubj[x.subject] += x.minutes;
        byWeekday[parseYmd(k).getDay()] += x.minutes;
    });
    const planned = [0, 0, 0, 0, 0], done = [0, 0, 0, 0, 0];
    Object.entries(state.weekly).forEach(([key, v]) => {
        const [ds, s] = key.split('_');
        if (!back.includes(ds) || !v?.text) return;
        planned[s]++; if (v.done) done[s]++;
    });
    const ex = nextExam();
    const lines = [
        '你是台灣高中生的讀書教練，要幫一位準備學測的學生排讀書計畫。請用繁體中文、台灣用語。',
        `今天是 ${t}（星期${WEEK_ZH[new Date().getDay()]}）。`,
        `要排的日期：${dates.map(d => `${d}（${WEEK_ZH[parseYmd(d).getDay()]}${examsOn(d).length ? '，當天考試' : ''}）`).join('、')}`,
        `可讀書時間：平日每天約 ${aiPref.weekday} 小時，週六日每天約 ${aiPref.weekend} 小時。`,
        `科目代號：${SUBJECTS.map((n, i) => `${i}=${n}`).join('、')}`,
        `學生自評：${SUBJECTS.map((n, i) => `${n}${RATE_TEXT[aiPref.rate[i]]}`).join('、')}`,
        `最近 14 天各科讀書分鐘數：${SUBJECTS.map((n, i) => `${n} ${bySubj[i]}`).join('、')}`,
        `最近 14 天依星期幾的總分鐘數：${WEEK_ZH.map((w, i) => `${w} ${byWeekday[i]}`).join('、')}`,
        `最近 14 天進度表完成率（完成格數/安排格數）：${SUBJECTS.map((n, i) => `${n} ${done[i]}/${planned[i]}`).join('、')}`
    ];
    if (ex) {
        const left = Math.max(0, Math.floor((examTime(ex.date) - Date.now()) / 86400000));
        lines.push(`下一場考試：${ex.name}，${ex.date}${ex.end ? ' 到 ' + ex.end : ''}，還有 ${left} 天。`);
        const scope = (aiPref.scope[ex.key] || '').trim();
        if (scope) lines.push(`這場考試的範圍：${scope.slice(0, 300)}`);
    }
    // 學測範圍清單：還沒熟練的單元、重點複習
    if (state.syllabus.picked) {
        const all = sylAll();
        const notYet = SUBJECTS.map((n, i) => {
            const us = all.filter(x => x.s === i && (state.syllabus.status[x.k] || 0) < 2).map(x => x.u + ((state.syllabus.status[x.k] || 0) === 1 ? '(讀過)' : ''));
            return us.length ? `${n}：${us.slice(0, 15).join('、')}` : '';
        }).filter(Boolean);
        if (notYet.length) lines.push(`學測範圍中還沒熟練的單元（沒標記的是還沒讀）：${notYet.join('；')}`.slice(0, 900));
        const fl = sylFlags();
        if (fl.length) lines.push(`學生標記要重點複習的單元：${fl.map(f => `${SUBJECTS[f.s]} ${f.u}`).join('、').slice(0, 300)}`);
    }
    lines.push(
        '規則：',
        '1. analysis 寫 2 到 4 點觀察和建議，每點一句話，要具體引用上面的數字。',
        '2. plan 要涵蓋每一個要排的日期，每天 1 到 5 項，每項 minutes 介於 20 到 120，每天總分鐘數接近可讀書時間。',
        '3. 自評弱、最近讀得少的科目要多排；考試當天只排輕鬆的複習或不排。',
        '4. task 寫具體要做的事（例如「數A 3-1 指數 例題」），不超過 18 個字，不要寫分鐘數。',
        '5. 同一天同一科最多 2 項。',
        '6. 如果有重點複習的單元，這週要優先安排；還沒讀的單元可以排進 task 裡。'
    );
    return lines.join('\n');
}

async function getAiModel(name = AI_MODEL) {
    if (aiModel?.[name]) return aiModel[name];
    const aiM = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-ai.js`);
    const { Schema } = aiM;
    const schema = Schema.object({
        properties: {
            analysis: Schema.array({ items: Schema.string() }),
            plan: Schema.array({
                items: Schema.object({
                    properties: {
                        date: Schema.string(),
                        items: Schema.array({
                            items: Schema.object({
                                properties: { subject: Schema.integer(), task: Schema.string(), minutes: Schema.integer() }
                            })
                        })
                    }
                })
            })
        }
    });
    const ai = aiM.getAI(fb.app, { backend: new aiM.GoogleAIBackend(), useLimitedUseAppCheckTokens: true });
    aiModel = aiModel || {};
    aiModel[name] = aiM.getGenerativeModel(ai, {
        model: name,
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.6 }
    });
    return aiModel[name];
}

// 檢查 AI 回傳的內容，只留下合理的部分
function cleanAiResult(raw) {
    const dates = aiDates();
    const analysis = (Array.isArray(raw?.analysis) ? raw.analysis : []).map(s => String(s).trim()).filter(Boolean).slice(0, 4);
    const taken = new Set();
    const days = dates.map(ds => {
        const src = (raw?.plan || []).find(p => p && p.date === ds);
        const perSubj = {};
        const items = (src?.items || []).filter(it => it && Number.isInteger(it.subject) && it.subject >= 0 && it.subject < SUBJECTS.length && String(it.task || '').trim())
            .filter(it => (perSubj[it.subject] = (perSubj[it.subject] || 0) + 1) <= SLOTS)
            .slice(0, 5)
            .map(it => {
                const minutes = Math.min(180, Math.max(10, Math.round(Number(it.minutes) || 30)));
                const key = freeSlot(ds, it.subject, taken);
                if (key) taken.add(key);
                return { subject: it.subject, task: String(it.task).trim().slice(0, 24), minutes, on: !!key, full: !key };
            });
        return { date: ds, items };
    });
    return { analysis, days };
}

async function generatePlan() {
    if (aiBusy) return;
    if (!fb) { toast('目前無法連線，請連上網路後再試'); return; }
    if (!currentUser) { toast('請先登入 Google 帳號'); openModal('accountModal'); return; }
    const sc = $('aiScope'); const ex0 = nextExam();
    if (sc && ex0) { aiPref.scope[ex0.key] = sc.value.slice(0, 300); saveAiPref(); }
    if (aiUsedToday() >= AI_DAILY_LIMIT) { toast(`今天已經產生 ${AI_DAILY_LIMIT} 次了，明天再來`); return; }
    aiBusy = true; aiError = ''; aiStep = 2; renderAI();
    try {
        // Google 那邊太忙（500／503）或這個模型額度滿了（429）時，自動等一下重試，
        // 再不行就換成備用的輕量模型；失敗的次數不會算進每天 5 次
        const prompt = buildAiPrompt();
        const tries = [[AI_MODEL, 0], [AI_MODEL, 2500], [AI_FALLBACK_MODEL, 0], [AI_FALLBACK_MODEL, 3000]];
        let res = null, lastErr = null;
        for (const [name, wait] of tries) {
            if (wait) await new Promise(r => setTimeout(r, wait));
            try {
                res = await (await getAiModel(name)).generateContent(prompt);
                break;
            } catch (err) {
                lastErr = err;
                const st = Number(err?.customErrorData?.status) || Number((String(err?.message).match(/\[(\d{3})/) || [])[1]) || 0;
                if (!(st >= 500 || st === 429)) throw err;   // 其他錯誤（App Check、設定）重試也沒用
                aiRetryNote = name === AI_MODEL ? 'AI 有點忙，正在重試…' : '主要的 AI 很忙，改用備用的 AI…';
                renderAI();
            }
        }
        aiRetryNote = '';
        if (!res) throw lastErr;
        const text = res.response.text();
        aiResult = cleanAiResult(JSON.parse(text));
        if (!aiResult.days.some(d => d.items.length)) throw new Error('empty');
        aiCountUp();
    } catch (e) {
        aiRetryNote = '';
        console.error('AI 產生失敗：', e);
        const msg = String(e?.message || e);
        // firebase-ai 的 HTTP 錯誤也叫 fetch-error，要看狀態碼才知道真正原因
        const m = msg.match(/\[(\d{3})[^\]]*\]/);
        const st = Number(e?.customErrorData?.status) || (m ? Number(m[1]) : 0);
        const detail = msg.replace(/Error fetching from \S+:\s*/i, '').replace(/https?:\/\/\S+/g, '').trim();
        aiErrorCode = [e?.code, st || '', detail.slice(0, 300)].filter(Boolean).join(' ');
        aiError = msg === 'empty' ? 'AI 這次沒有排出內容，請再試一次。'
            : (st === 401 || /app-check|appCheck|App Check|recaptcha/i.test(msg)) ? 'AI 的安全驗證（App Check）沒有通過。請把下面的錯誤代碼傳給開發者。'
            : (st === 429 || /quota|RESOURCE_EXHAUSTED/i.test(msg)) ? '目前 AI 的免費額度用完了，晚點再試。'
            : st === 404 ? 'AI 模型找不到（可能模型名稱有變），請把下面的錯誤代碼傳給開發者。'
            : (st === 403 || /not enabled|PERMISSION_DENIED|api-not-enabled/i.test(msg)) ? 'AI 服務沒有權限（可能是 Firebase AI Logic 或 API 金鑰設定），請把下面的錯誤代碼傳給開發者。'
            : st >= 500 ? 'Google 的 AI 現在使用的人太多，已經自動重試和換備用 AI 了還是忙碌。過幾分鐘再按一次就好，這次不會扣次數。'
            : st ? '產生失敗，請把下面的錯誤代碼傳給開發者。'
            : /network|Failed to fetch|Load failed|NetworkError|timeout|unavailable/i.test(msg) ? '連不上 AI 服務。如果你在學校或公共 Wi‑Fi，可能是網路擋住了，換成手機行動網路再試試。'
            : '產生失敗，請檢查網路後再試一次。';
    }
    aiBusy = false;
    renderAI();
}

function applyPlan() {
    if (!aiResult) return;
    const taken = new Set();
    const added = [];
    aiResult.days.forEach(d => d.items.forEach(it => {
        if (!it.on) return;
        const key = freeSlot(d.date, it.subject, taken);
        if (!key) return;
        taken.add(key);
        added.push(key);
        state.weekly[key] = { text: `${it.task}（${it.minutes} 分）`, done: false, color: state.weekly[key]?.color || '' };
    }));
    if (!added.length) { toast('沒有可以套用的項目'); return; }
    const firstDate = aiResult.days[0].date;
    aiResult = null; aiStep = 0;   // 下次進來從第一步開始
    save(); renderWeek(); renderToday();
    weekMonday = getMonday(parseYmd(firstDate)); selectedDayIdx = null; renderWeek();
    showTab('tab-weekly');
    toast(`已加入 ${added.length} 項`, { label: '復原', fn: () => { added.forEach(k => delete state.weekly[k]); save(); renderWeek(); renderToday(); } });
}

const ICON_SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const HOUR_OPTS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10];

function renderAI() {
    const el = $('tab-ai');
    if (!el) return;
    const dates = aiDates();
    const ex = nextExam();
    const left = Math.max(0, AI_DAILY_LIMIT - aiUsedToday());
    const LABELS = ['讀書時間', '各科狀況', '確認計畫'];
    const steps = `<div class="steps-bar">${LABELS.map((l, i) => `<div class="${i < aiStep ? 'done' : i === aiStep ? 'cur' : ''}"><i></i><span>${i + 1} ${l}</span></div>`).join('')}</div>`;
    const hourSel = (id, v) => `<select class="field" id="${id}">${HOUR_OPTS.map(h => `<option value="${h}" ${h === v ? 'selected' : ''}>${h} 小時</option>`).join('')}</select>`;
    let body = '';
    if (aiStep === 0) {
        body = `<h2 class="step-q">這週可以讀多久？</h2>
        <p class="step-sub">AI 會照你填的時間排，不會排超過。</p>
        <p class="field-label">要排哪幾天</p>
        <div class="seg two" role="tablist" aria-label="要排哪一週" style="margin-bottom:6px">
            <button role="tab" aria-selected="${aiPref.range === 'this'}" class="${aiPref.range === 'this' ? 'active' : ''}" data-ai-range="this">這週（今天起）</button>
            <button role="tab" aria-selected="${aiPref.range === 'next'}" class="${aiPref.range === 'next' ? 'active' : ''}" data-ai-range="next">下週</button>
        </div>
        <p class="hint" style="text-align:left;margin:0 0 18px">${shortDate(dates[0])} – ${shortDate(dates[dates.length - 1])}，共 ${dates.length} 天</p>
        <div class="field-row">
            <div><label class="field-label" for="aiWeekday">平日每天可以讀</label>${hourSel('aiWeekday', aiPref.weekday)}</div>
            <div><label class="field-label" for="aiWeekend">週末每天可以讀</label>${hourSel('aiWeekend', aiPref.weekend)}</div>
        </div>
        <div class="sticky-cta"><button class="btn btn-accent btn-wide" data-ai="next">下一步</button></div>`;
    } else if (aiStep === 1) {
        body = `<h2 class="step-q">你覺得各科讀得怎麼樣？</h2>
        <p class="step-sub">AI 會多排你比較弱、最近又讀得少的科目。</p>
        <div class="rate-list">${SUBJECTS.map((n, i) => `<div class="rate-row"><i class="sdot s${i}"></i><b>${n}</b>
            <div class="seg rate-seg" role="radiogroup" aria-label="${n}自評">${RATE_TEXT.map((r, k) => `<button role="radio" aria-checked="${aiPref.rate[i] === k}" class="${aiPref.rate[i] === k ? 'active r' + k : ''}" data-rate="${i}" data-r="${k}">${r}</button>`).join('')}</div></div>`).join('')}</div>
        ${ex ? `<label class="field-label" for="aiScope" style="margin-top:20px">${esc(ex.name)}的範圍（可留空）</label>
        <textarea class="field" id="aiScope" rows="2" maxlength="300" placeholder="例如：數A 第一到三冊、物理 1-3 章" style="min-height:64px">${esc(aiPref.scope[ex.key] || '')}</textarea>` : ''}
        <p class="ai-note">AI 也會參考最近 2 週的讀書紀錄和進度表完成率${ex ? `、下一場考試（${esc(ex.short)} ${shortDate(ex.date)}）` : ''}。不會傳送你的名字、待辦或進度表文字。</p>
        <div class="sticky-cta row2">
            <button class="btn" data-ai="prev">上一步</button>
            <button class="btn btn-accent" data-ai="gen" style="flex:1">${ICON_SPARK}產生計畫</button>
        </div>`;
    } else {
        let result = '';
        if (aiBusy) result = `<p class="ai-loading"><span class="ai-spin"></span>${aiRetryNote ? esc(aiRetryNote) : 'AI 正在看你的紀錄、排計畫…'}</p>`;
        else if (aiError) result = `<p class="ai-error">${esc(aiError)}</p><p class="ai-code">錯誤代碼：${esc(aiErrorCode.trim())}</p>
            <div class="sticky-cta row2"><button class="btn" data-ai="prev">上一步</button><button class="btn btn-accent" data-ai="gen" style="flex:1">${ICON_SPARK}再試一次</button></div>`;
        else if (aiResult) {
            const onCount = aiResult.days.reduce((a, d) => a + d.items.filter(i => i.on).length, 0);
            result = `<div class="ai-advice"><b>${ICON_SPARK}AI 的建議</b>${aiResult.analysis.map(a => `<p>${esc(a)}</p>`).join('')}</div>
            <div class="sec-head" style="margin-top:22px"><h3>建議的計畫</h3><span>取消勾選就不會加入</span></div>
            ${aiResult.days.map((d, di) => {
                const dd = parseYmd(d.date);
                return `<div class="plan-day">
                    <span class="plan-w">${WEEK_ZH[dd.getDay()]}<small class="num">${dd.getMonth() + 1}/${dd.getDate()}</small></span>
                    <div class="plan-items">${d.items.length ? d.items.map((it, ii) => `<button class="plan-item ${it.on ? '' : 'off'}" data-ai-item="${di}_${ii}" ${it.full ? 'disabled' : ''} role="checkbox" aria-checked="${it.on}">
                        <span class="pbox">${it.on ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : ''}</span>
                        <i class="sdot s${it.subject}"></i><span class="pt">${esc(it.task)}${it.full ? '<small>（這天這科已排滿）</small>' : ''}</span><span class="pm num">${it.minutes} 分</span></button>`).join('')
                        : '<span class="hint" style="padding:10px 0">休息</span>'}</div>
                </div>`;
            }).join('')}
            <p class="hint" style="margin-top:14px">AI 可能出錯；只會填進空白格子，不會蓋掉你寫好的內容</p>
            <div class="sticky-cta row2">
                <button class="btn" data-ai="gen">重新產生</button>
                <button class="btn btn-accent" data-ai="apply" style="flex:1" ${onCount ? '' : 'disabled'}>套用 ${onCount} 項到進度表</button>
            </div>`;
        }
        body = result;
    }
    el.innerHTML = `<div class="sub-wrap">${steps}${body}</div>`;
    setTopExtra('tab-ai', `<span class="tag mute">今天剩 ${left} 次</span>`);
}

$('aiPlanBtn').addEventListener('click', () => { if (!aiResult && !aiBusy && !aiError) aiStep = 0; showTab('tab-ai'); });
$('tab-ai').addEventListener('click', (e) => {
    const r = e.target.closest('[data-ai-range]');
    if (r) { aiPref.range = r.dataset.aiRange; saveAiPref(); aiResult = null; aiError = ''; renderAI(); return; }
    const rate = e.target.closest('[data-rate]');
    if (rate) { aiPref.rate[Number(rate.dataset.rate)] = Number(rate.dataset.r); saveAiPref(); renderAI(); return; }
    const item = e.target.closest('[data-ai-item]');
    if (item && aiResult) {
        const [di, ii] = item.dataset.aiItem.split('_').map(Number);
        const it = aiResult.days[di].items[ii];
        if (!it.full) { it.on = !it.on; renderAI(); }
        return;
    }
    const act = e.target.closest('[data-ai]')?.dataset.ai;
    if (act === 'next') { aiStep = 1; renderAI(); window.scrollTo({ top: 0 }); }
    else if (act === 'prev') { aiStep = Math.max(0, aiStep - 1); aiError = ''; renderAI(); window.scrollTo({ top: 0 }); }
    else if (act === 'gen') generatePlan();
    else if (act === 'apply') applyPlan();
});
$('tab-ai').addEventListener('change', (e) => {
    if (e.target.id === 'aiWeekday') aiPref.weekday = Number(e.target.value);
    else if (e.target.id === 'aiWeekend') aiPref.weekend = Number(e.target.value);
    else if (e.target.id === 'aiScope') { const ex = nextExam(); if (ex) aiPref.scope[ex.key] = e.target.value.slice(0, 300); }
    saveAiPref();
});

/* =====================================================
 * 9. 讀書房間（從「計時」分頁進入，要登入）
 *    profiles/{uid}：自己的即時狀態；rooms/{邀請碼}：房間
 * ===================================================== */
const ROOM_MAX = 20;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 去掉容易看錯的 0 O 1 I
let roomPref = Object.assign({ name: '', hidden: false, enabled: false }, lsGet(LS.room, {}));
const saveRoomPref = () => lsSet(LS.room, roomPref);
let roomView = null;         // null = 房間列表；否則是房間代碼
let pendingRoom = null;      // 剛建立／加入、雲端還沒回傳的房間
let myRooms = [];            // [{ id, name, owner, members }]
let profiles = {};           // uid → 狀態
let roomUnsub = null;
let profUnsubs = [], profKey = '';
let roomsLoaded = false;
let roomSlow = false;   // 載入太久（多半是網路擋住）
let lastProfile = '';
let profTimer = null;

// 別人寫的資料不能直接相信：科目只接受 0～4 的整數，其他一律當成沒有
const safeSubject = (v) => Number.isInteger(v) && v >= 0 && v < SUBJECTS.length ? v : null;
// 其他人的狀態（已經很久沒更新的視為不在讀）
// 自己的狀態直接用這台裝置的計時（不用等雲端更新，收起計時後在房間馬上看得到自己亮著）
function statusOf(u, now = Date.now()) {
    if (u !== currentUser?.uid) return liveStatus(profiles[u], now);
    const t = todayStr();
    // 這台沒在計時、但同一個帳號在別台裝置正在讀：顯示別台的狀態（今天讀了多久用這台合併好的紀錄）
    const other = otherDeviceStatus();
    if (other) return liveStatus({ ...other, todayMin: Math.max(Math.round(dayMinutes(t)), other.todayDate === t ? other.todayMin || 0 : 0), todayDate: t }, now);
    return liveStatus({ ...(profiles[u] || {}), status: timer.phase, subject: timer.subject, startAt: timer.startAt, pausedAt: timer.pausedAt || null,
        pausedTotal: timer.pausedTotal || 0, duration: timer.duration || 0, breakStart: timer.breakStart, breakLen: timer.breakLen || 0,
        todayMin: Math.round(dayMinutes(t)), todayDate: t }, now);
}
function liveStatus(p, now = Date.now()) {
    if (!p) return { phase: 'idle', min: 0 };
    const today = p.todayDate === todayStr() ? (p.todayMin || 0) : 0;
    if (p.status === 'focus' && p.startAt) {
        const el = Math.max(0, (p.pausedAt || now) - p.startAt - (p.pausedTotal || 0));
        const stale = p.pausedAt ? now - p.pausedAt > 2 * 3600000
            : p.duration ? el > p.duration + 10 * 60000 : el > 4 * 3600000;
        if (!stale) return { phase: 'focus', paused: !!p.pausedAt, el, left: p.duration ? p.duration - el : null, subject: safeSubject(p.subject), min: today };
    }
    if (p.status === 'break' && p.breakStart && now - p.breakStart < (p.breakLen || 0) + 10 * 60000) {
        return { phase: 'break', el: now - p.breakStart, min: today };
    }
    return { phase: 'idle', min: today };
}
// 頭像顏色：自己選過的優先（存在 profiles/uid.color，房間裡大家都看得到），沒選就依帳號自動配色
const AV_COLORS = ['#E5484D', '#F76B15', '#E2A400', '#30A46C', '#12A594', '#2A78D6', '#6E56CF', '#D6409F', '#E87BA4', '#7A7A73'];
const avColor = (s) => {
    const pick = (s === currentUser?.uid && roomPref.color) || profiles[s]?.color;
    if (AV_COLORS.includes(pick)) return pick;
    let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `var(--s${h % 5})`;
};
// 頭像上的第一個字：用「字素」切，表情符號（🍚、👍🏻、👨‍👩‍👧）才不會被切成一半變成方框
const graphemer = (() => { try { return new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' }); } catch (e) { return null; } })();
function firstGlyph(str) {
    const s = String(str || '').trim() || '?';
    if (graphemer) { const it = graphemer.segment(s)[Symbol.iterator]().next(); if (it.value) return it.value.segment; }
    return Array.from(s)[0];
}
const avHtml = (p, uidv) => `<span class="av" style="background:${avColor(uidv)}">${esc(firstGlyph(p?.name || '?'))}</span>`;
const myName = () => (roomPref.name || currentUser?.displayName || '同學').slice(0, 20);
// 計時頁顯示：所有房間裡正在讀的人數（沒用過房間時回傳 null）
function roomLiveCount() {
    if (!currentUser || !roomsLoaded || !myRooms.length) return null;
    const now = Date.now();
    const uids = new Set(myRooms.flatMap(r => r.members || []));
    uids.delete(currentUser.uid);
    return [...uids].filter(u => statusOf(u, now).phase === 'focus').length;
}

// 把自己的計時狀態寫到 profiles（只有用過讀書房間才會寫）
// 最近 n 天每天的讀書分鐘數 { '2026-10-20': 125, ... }（0 分的日子不放，資料比較小）
function recentDays(n) {
    const from = new Date(); from.setDate(from.getDate() - n + 1);
    const fromStr = ymd(from), out = {};
    for (const x of state.sessions) {
        const d = sessionDay(x);
        if (d >= fromStr) out[d] = (out[d] || 0) + x.minutes;
    }
    Object.keys(out).forEach(k => { out[k] = Math.round(out[k]); if (!out[k]) delete out[k]; });
    return out;
}
function publishProfile(force) {
    if (!currentUser || !fb || !roomPref.enabled || deletingAccount) return;
    noteOwnStart();
    const t = todayStr();
    const hide = roomPref.hidden;
    const base = {
        name: myName(), hidden: !!hide, color: AV_COLORS.includes(roomPref.color) ? roomPref.color : null,
        todayMin: Math.round(dayMinutes(t)), todayDate: t,
        days: recentDays(92)   // 最近 3 個月每天讀了幾分鐘（只有總時數），房間的讀書紀錄用
    };
    // 讀書狀態（專注、休息）只有「這台有在計時」或「雲端上的是這台自己剛結束的」才寫。
    // 同一個帳號在別台正在讀時，這台沒在計時就不能把它蓋成「沒在讀」（不然朋友和自己都看不到在讀）
    const cloud = profiles[currentUser.uid];
    const cStart = cloud && (cloud.status === 'focus' ? cloud.startAt : cloud.status === 'break' ? cloud.breakStart : null);
    const mine = hide || timer.phase !== 'idle' || !cloud || (cStart ? ownStarts().includes(cStart) : cloud.status !== 'idle');
    const data = mine ? {
        ...base,
        status: hide ? 'idle' : timer.phase,
        subject: !hide && timer.phase !== 'idle' ? (timer.subject ?? null) : null,
        startAt: !hide && timer.phase === 'focus' ? timer.startAt : null,
        pausedAt: !hide && timer.phase === 'focus' ? (timer.pausedAt || null) : null,
        pausedTotal: !hide && timer.phase === 'focus' ? (timer.pausedTotal || 0) : 0,
        duration: !hide && timer.phase === 'focus' ? (timer.duration || 0) : 0,
        breakStart: !hide && timer.phase === 'break' ? timer.breakStart : null,
        breakLen: !hide && timer.phase === 'break' ? timer.breakLen : 0
    } : base;
    const sig = JSON.stringify(data);
    if (!force && sig === lastProfile) return;
    lastProfile = sig;
    clearTimeout(profTimer);
    profTimer = setTimeout(() => {
        // 不寫狀態時用合併寫入：只更新名字、今日時數這些，雲端上的讀書狀態保持原樣
        fb.fs.setDoc(fb.fs.doc(fb.db, 'profiles', currentUser.uid), { ...data, updatedAt: Date.now() }, ...(mine ? [] : [{ merge: true }]))
            .catch(e => { console.warn('房間狀態更新失敗：', e); lastProfile = ''; });
    }, 300);
}

// 監聽房間列表與所有成員的狀態
function roomStart() {
    if (!currentUser || !fb || roomUnsub) return;
    const { fs, db } = fb;
    const q = fs.query(fs.collection(db, 'rooms'), fs.where('members', 'array-contains', currentUser.uid));
    // 10 秒還載不到，多半是網路擋住了雲端資料庫，告訴使用者而不是一直轉圈
    roomSlow = false;
    setTimeout(() => { if (roomUnsub && !roomsLoaded) { roomSlow = true; renderRoom(); } }, 10000);
    roomUnsub = fs.onSnapshot(q, (snap) => {
        roomsLoaded = true;
        setTimeout(handlePendingJoin, 0);
        setTimeout(handlePendingChat, 0);
        myRooms = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        if (myRooms.length && !roomPref.enabled) { roomPref.enabled = true; saveRoomPref(); publishProfile(true); }
        if (myRooms.some(r => r.id === pendingRoom)) pendingRoom = null;
        if (roomView && roomView !== pendingRoom && !myRooms.some(r => r.id === roomView)) roomView = null;   // 被移出或房間刪除
        watchProfiles([...new Set(myRooms.flatMap(r => r.members || []))]);
        chatSync();
        renderRoom();
        if (document.body.dataset.tab === 'tab-timer' && timer.phase === 'idle') renderTimer();
    }, (err) => { console.error('房間讀取失敗：', err); roomsLoaded = true; renderRoom(err.code === 'permission-denied' ? '讀取被拒絕：請確認 Firestore 規則已更新' : '讀取失敗，請檢查網路'); });
}
function watchProfiles(uids) {
    const key = uids.slice().sort().join(',');
    if (key === profKey) return;
    profKey = key;
    profUnsubs.forEach(u => u()); profUnsubs = [];
    const { fs, db } = fb;
    for (let i = 0; i < uids.length; i += 30) {
        const chunk = uids.slice(i, i + 30);
        const q = fs.query(fs.collection(db, 'profiles'), fs.where(fs.documentId(), 'in', chunk));
        profUnsubs.push(fs.onSnapshot(q, (snap) => {
            snap.docChanges().forEach(ch => {
                if (ch.type === 'removed') delete profiles[ch.doc.id];
                else profiles[ch.doc.id] = ch.doc.data();
            });
            renderRoomSoon();
        }, (err) => console.warn('成員狀態讀取失敗：', err)));
    }
}
function roomStop() {
    if (roomUnsub) { roomUnsub(); roomUnsub = null; }
    profUnsubs.forEach(u => u()); profUnsubs = []; profKey = '';
    myRooms = []; profiles = {}; roomsLoaded = false; roomView = pendingRoom = null;
    try { if (pokeFor) closePoke(); } catch (e) {}
    closeChat(); chatStopAll();
}

function enableRoom() {
    if (!roomPref.enabled) { roomPref.enabled = true; saveRoomPref(); }
    publishProfile(true);
}
function makeCode() {
    const a = new Uint32Array(6);
    crypto.getRandomValues(a);
    return [...a].map(n => CODE_CHARS[n % CODE_CHARS.length]).join('');
}
async function createRoom(name) {
    const { fs, db } = fb;
    enableRoom();
    for (let tries = 0; tries < 5; tries++) {
        const code = makeCode();
        const ref = fs.doc(db, 'rooms', code);
        const snap = await fs.getDoc(ref);
        if (snap.exists()) continue;
        await fs.setDoc(ref, { name, owner: currentUser.uid, members: [currentUser.uid], createdAt: Date.now() });
        return code;
    }
    throw new Error('code');
}
/* --- 邀請連結：網址帶 ?join=邀請碼，打開後問要不要加入 --- */
let joinAsking = false;
// 點系統通知打開 App 時網址會帶 ?chat=邀請碼：房間載入後直接打開那個聊天室
(function readJoinLink() {
    try {
        const p = new URLSearchParams(location.search);
        if (!p.has('join') && !p.has('chat')) return;
        const code = (k) => (p.get(k) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code('join').length === 6) sessionStorage.setItem('study_join', code('join'));
        if (code('chat').length === 6) sessionStorage.setItem('study_open_chat', code('chat'));
        history.replaceState(null, '', location.pathname + location.hash);   // 網址清乾淨，重新整理不會再問
    } catch (e) {}
})();
function handlePendingChat() {
    let code = '';
    try { code = sessionStorage.getItem('study_open_chat') || ''; } catch (e) {}
    if (!code || !myRooms.some(r => r.id === code)) return;
    try { sessionStorage.removeItem('study_open_chat'); } catch (e) {}
    roomView = code; showTab('tab-room'); openChat(code);
}
const pendingJoinCode = () => { try { return sessionStorage.getItem('study_join') || ''; } catch (e) { return ''; } };
const clearPendingJoin = () => { try { sessionStorage.removeItem('study_join'); } catch (e) {} };
let joinLoginHinted = false;
async function handlePendingJoin() {
    const code = pendingJoinCode();
    if (!code || joinAsking) return;
    // 第一次打開可能先跳「加到主畫面」等視窗，等它們關掉再問
    if (document.querySelector('.modal.open')) { setTimeout(handlePendingJoin, 800); return; }
    if (!fb || !currentUser) {
        if (!joinLoginHinted) {
            joinLoginHinted = true;
            roomView = null; showTab('tab-room');
            toast('登入後就能加入朋友的讀書房間');
        }
        return;   // 登入、房間載入完會再呼叫一次
    }
    if (!roomsLoaded) return;
    if (myRooms.some(r => r.id === code)) { clearPendingJoin(); roomView = code; showTab('tab-room'); renderRoom(); return; }
    joinAsking = true;
    try {
        const snap = await fb.fs.getDoc(fb.fs.doc(fb.db, 'rooms', code));
        if (!snap.exists()) { clearPendingJoin(); toast('找不到這個房間，邀請連結可能失效了'); return; }
        const r = snap.data(), n = (r.members || []).length;
        $('joinRoomName').textContent = r.name || '讀書房間';
        $('joinRoomInfo').textContent = `${n} 位成員 · 邀請碼 ${code}`;
        $('joinConfirmBtn').dataset.code = code;
        openModal('joinModal');
    } catch (e) { toast('讀取房間失敗，請檢查網路'); }
    finally { joinAsking = false; }
}
$('joinConfirmBtn').addEventListener('click', async () => {
    const code = $('joinConfirmBtn').dataset.code;
    clearPendingJoin(); closeModal('joinModal');
    roomView = null; showTab('tab-room');
    await joinRoom(code);
});
$('joinModal').addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === $('joinModal')) clearPendingJoin(); });

async function joinRoom(code) {
    code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { toast('邀請碼是 6 碼'); return; }
    if (myRooms.some(r => r.id === code)) { roomView = code; renderRoom(); return; }
    const { fs, db } = fb;
    try {
        const ref = fs.doc(db, 'rooms', code);
        const snap = await fs.getDoc(ref);
        if (!snap.exists()) { toast('找不到這個房間，檢查一下邀請碼'); return; }
        if ((snap.data().members || []).length >= ROOM_MAX) { toast(`房間已滿（最多 ${ROOM_MAX} 人）`); return; }
        enableRoom();
        roomView = pendingRoom = code;
        await fs.updateDoc(ref, { members: fs.arrayUnion(currentUser.uid) });
        codeDraft = '';
        toast(`已加入「${snap.data().name}」`);
        renderRoom();
    } catch (e) {
        if (roomView === pendingRoom) roomView = pendingRoom = null;
        renderRoom();
        console.error('加入房間失敗：', e);
        toast(e.code === 'permission-denied' ? '加入失敗：房間可能已滿' : '加入失敗，請檢查網路');
    }
}
async function leaveRoom(code) {
    const r = myRooms.find(x => x.id === code);
    if (!r || !confirm(`確定要離開「${r.name}」嗎？`)) return;
    const { fs, db } = fb;
    const ref = fs.doc(db, 'rooms', code);
    try {
        if ((r.members || []).length <= 1) await fs.deleteDoc(ref);   // 最後一個人離開就刪掉房間
        else await fs.updateDoc(ref, { members: fs.arrayRemove(currentUser.uid) });
        if (chatRoom === code) closeChat();
        roomView = null; renderRoom();
        toast('已離開房間');
    } catch (e) { console.error(e); toast('離開失敗，請檢查網路'); }
}
async function shareRoom(code) {
    const r = myRooms.find(x => x.id === code);
    const text = `一起來讀書！點連結登入後按「加入」，就能進「${r?.name || ''}」（邀請碼 ${code}）`;
    const url = `${location.origin}${location.pathname}?join=${code}`;   // 朋友點開會直接問要不要加入
    try {
        if (navigator.share) { await navigator.share({ title: '讀書房間邀請', text, url }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('已複製邀請訊息'); }
    catch (e) { toast(`邀請碼：${code}`); }
}

const MEDAL = ['#E9B154', '#C9CED6', '#C98A5A'];

/* --- 房間的讀書紀錄：日／週／月／自訂 --- */
let rhMode = 'w', rhFrom = '', rhTo = '';
const CROWN_SVG = '<svg class="rh-crown" viewBox="0 0 26 16" aria-hidden="true"><g fill="#FFC928" stroke="#FFC928" stroke-width="1" stroke-linejoin="round"><path d="M2.6 10.6 L4.1 4.4 L8.7 7.7 L13 2.6 L17.3 7.7 L21.9 4.4 L23.4 10.6 Z"/><circle cx="4" cy="3.7" r="1.5"/><circle cx="13" cy="2" r="1.6"/><circle cx="22" cy="3.7" r="1.5"/><rect x="2.4" y="12" width="21.2" height="2.6" rx="1"/></g></svg>';
function rhRange() {
    const t = todayStr(), d = new Date();
    if (rhMode === 'd') return { from: t, to: t, label: '今天' };
    if (rhMode === 'w') {
        const mon = new Date(d); mon.setDate(d.getDate() - (d.getDay() + 6) % 7);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        return { from: ymd(mon), to: ymd(sun), label: '本週' };
    }
    if (rhMode === 'm') return { from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)), label: '本月' };
    let f = rhFrom || ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6)), e = rhTo || t;
    if (f > e) [f, e] = [e, f];
    return { from: f, to: e, label: '自訂' };
}
function roomHistoryHtml(ms, now) {
    const t = todayStr(), r = rhRange();
    const days = [];
    for (let d = parseYmd(r.from); ymd(d) <= r.to && days.length < 400; d.setDate(d.getDate() + 1)) days.push(ymd(d));
    // 每個人每天的分鐘數：今天用即時的（正在讀的那一輪也算），其他天用他分享的每日紀錄
    const minOf = (m, ds) => {
        if (ds === t) return Math.round(m.s.min + (m.s.phase === 'focus' ? m.s.el / 60000 : 0));
        return Number(m.p?.days?.[ds]) || 0;
    };
    const rows = ms.map(m => {
        const per = days.map(ds => ds > t ? 0 : minOf(m, ds));
        return { m, total: per.reduce((a, v) => a + v, 0), active: per.filter(v => v > 0).length };
    }).sort((a, b) => b.total - a.total);
    const sum = rows.reduce((a, x) => a + x.total, 0), max = Math.max(1, rows[0]?.total || 0);
    const perDay = days.map(ds => ds > t ? -1 : rows.reduce((a, x) => a + minOf(x.m, ds), 0));
    const pmax = Math.max(1, ...perDay);
    const hm = (m) => m >= 60 ? `${Math.floor(m / 60)}<small>時</small>${m % 60}<small>分</small>` : `${m}<small>分</small>`;
    const period = r.from === r.to ? `${shortDate(r.from)}（${WEEK_ZH[parseYmd(r.from).getDay()]}）` : `${shortDate(r.from)} – ${shortDate(r.to)}`;
    const seg = [['d', '日'], ['w', '週'], ['m', '月'], ['c', '自訂']].map(([k, n]) => `<button class="${rhMode === k ? 'active' : ''}" data-rh="${k}" aria-pressed="${rhMode === k}">${n}</button>`).join('');
    const custom = rhMode !== 'c' ? '' : `<div class="rh-custom">
        <div class="field-row">
            <div><label class="field-label" for="rhFrom">從</label><input type="date" class="field" id="rhFrom" value="${r.from}" max="${t}"></div>
            <div><label class="field-label" for="rhTo">到</label><input type="date" class="field" id="rhTo" value="${r.to}" max="${t}"></div>
        </div>
        <div class="rh-quick">${[7, 14, 30, 90].map(n => { const f = new Date(); f.setDate(f.getDate() - n + 1); const on = r.from === ymd(f) && r.to === t; return `<button class="${on ? 'active' : ''}" data-rhq="${n}">近 ${n} 天</button>`; }).join('')}</div>
    </div>`;
    const chart = days.length > 1 && days.length <= 92 ? `<div class="rh-chart" aria-hidden="true">${perDay.map((v, i) => `<i class="${v < 0 ? 'future' : days[i] === t ? 'today' : ''}" style="height:${v < 0 ? 4 : Math.max(3, v / pmax * 100)}%"></i>`).join('')}</div>
        <div class="rh-axis num"><span>${shortDate(r.from)}</span><span>${shortDate(r.to)}</span></div>` : '';
    const list = rows.map((x, i) => {
        const first = i === 0 && x.total > 0;
        return `<li class="rh-row ${first ? 'first' : ''}">
            <span class="rh-rk num">${i + 1}</span>
            <span class="rh-av" style="background:${avColor(x.m.u)}">${first ? CROWN_SVG : ''}${esc(firstGlyph(memberName(x.m)))}</span>
            <span class="rh-mid"><span class="rh-name"><b>${esc(memberName(x.m))}</b></span>
                <span class="rh-track"><i style="width:${x.total ? Math.max(3, x.total / max * 100).toFixed(1) : 0}%;background:${avColor(x.m.u)}"></i></span>
                <span class="rh-meta"><span class="num">${fmtHM(x.total)}</span>${days.length > 1 ? `<span>讀了 ${x.active} 天</span>` : ''}</span></span>
        </li>`;
    }).join('');
    return `<section class="rh" id="roomHistory">
        <div class="rh-head"><h3>讀書紀錄</h3><div class="rh-seg" role="group" aria-label="期間">${seg}</div></div>
        ${custom}
        <div class="rh-sum"><b class="num">${hm(sum)}</b><span>${r.label} · ${period}</span></div>
        ${chart}
        <ol class="rh-list">${list}</ol>
        <p class="rh-note">更新為新版後才會顯示先前紀錄；如果資料有誤，請關閉網頁再打開就會自動更新</p>
    </section>`;
}
// 切換期間只重畫讀書紀錄這一塊（不會整頁跳動）
function rerenderHistory() {
    const el = $('roomHistory');
    if (!el || !roomView) { renderRoom(); return; }
    const r = myRooms.find(x => x.id === roomView);
    if (!r) return;
    const now = Date.now();
    const ms = (r.members || []).map(u => ({ u, p: profiles[u], s: statusOf(u, now) }));
    el.outerHTML = roomHistoryHtml(ms, now);
    $('tab-room')._html = null;   // 畫面已經改了，下次整頁重畫要重新比對
}
$('tab-room').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rh], [data-rhq]');
    if (!b) return;
    if (b.dataset.rh) rhMode = b.dataset.rh;
    if (b.dataset.rhq) { const f = new Date(); f.setDate(f.getDate() - Number(b.dataset.rhq) + 1); rhFrom = ymd(f); rhTo = todayStr(); }
    rerenderHistory();
});
$('tab-room').addEventListener('change', (e) => {
    if (e.target.id === 'rhFrom') { rhFrom = e.target.value; rerenderHistory(); }
    if (e.target.id === 'rhTo') { rhTo = e.target.value; rerenderHistory(); }
});
const SEAT_C = 2 * Math.PI * 31;
function seatSub(s) {
    if (s.phase === 'focus') return s.subject != null ? `<span class="ss" style="color:var(--s${s.subject})">${SUBJECTS[s.subject]}${s.paused ? ' · 暫停' : ''}</span>` : `<span class="ss on">${s.paused ? '暫停中' : '專注中'}</span>`;
    if (s.phase === 'break') return '<span class="ss">番茄鐘休息</span>';
    return s.min > 0 ? '<span class="ss">休息中</span>' : '<span class="ss">今天還沒開始</span>';   // 今天讀過但現在沒在讀＝休息中
}
function memberClock(s) {
    if (s.phase === 'focus') return fmtClock(s.left != null ? Math.max(0, s.left) : s.el);
    if (s.phase === 'break') return '休息 ' + fmtClock(s.el);
    return fmtHM(s.min);
}
function seatFrac(s) {
    if (s.phase !== 'focus') return 0;
    return s.left != null && s.left + s.el > 0 ? Math.min(1, s.el / (s.el + Math.max(0, s.left))) : Math.min(1, s.el / 3600000);
}
// 成員名字（自己的狀態還沒上傳時，用自己的暱稱）
const memberName = (m) => m.p?.name || (m.u === currentUser?.uid ? myName() : '同學');
const ticketAvs = (ms) => `<span class="avatars">${ms.slice(0, 4).map(u => avHtml(profiles[u], u)).join('')}${ms.length > 4 ? `<span class="av more num">+${ms.length - 4}</span>` : ''}</span>`;
const codeBoxes = (v) => Array.from({ length: 6 }, (_, i) => `<span class="cb ${i === Math.min(v.length, 5) ? 'cur' : ''}">${esc(v[i] || '')}</span>`).join('');
let codeDraft = '';

// 房間成員的狀態常常一次更新好幾個：合併成一次重畫，捲動和打字都比較順
let roomRenderTimer = 0;
function renderRoomSoon() {
    if (roomRenderTimer) return;
    roomRenderTimer = setTimeout(() => { roomRenderTimer = 0; requestAnimationFrame(() => { renderRoom(); renderHomeRoom(); if (pokeFor) renderPoke(); }); }, 120);
}
// 內容跟上次一樣就不動畫面（不重新排版），只有真的變了才更新
function setRoomHtml(el, html) {
    if (el._html === html) return;
    el.innerHTML = html; el._html = html;
}
function renderRoom(errMsg) {
    const el = $('tab-room');
    if (!el || document.body.dataset.tab !== 'tab-room') return;
    $('pageTitle').textContent = '讀書房間';
    if (!currentUser) {
        setTopExtra('tab-room', '');
        el.dataset.view = '';
        setRoomHtml(el, `<div class="sub-wrap">
            <div class="room-empty"><p class="zh" style="font-size:18px;font-weight:700;margin:0">和朋友一起讀書</p>
            <p class="empty">建立房間、分享邀請碼，就能看到大家正在讀什麼、今天讀了多久。<br>需要先登入 Google 帳號。</p>
            <button class="btn btn-accent" data-room="login">登入</button></div></div>`);
        return;
    }
    if (!roomsLoaded) {
        el.dataset.view = '';
        setRoomHtml(el, `<div class="sub-wrap"><p class="ai-loading" style="margin-top:30px">${errMsg ? esc(errMsg) : roomSlow ? '連不上雲端資料庫。如果你在學校或公共 Wi‑Fi，可能是網路擋住了，換成手機行動網路再試試。' : '<span class="ai-spin"></span>載入房間中…'}</p></div>`);
        return;
    }
    const now = Date.now();
    const meUid = currentUser.uid;
    if (roomView) {
        const r = myRooms.find(x => x.id === roomView);
        if (!r) {
            if (roomView === pendingRoom) { el.dataset.view = ''; setRoomHtml(el, `<div class="sub-wrap"><p class="ai-loading" style="margin-top:30px"><span class="ai-spin"></span>進入房間中…</p></div>`); return; }
            roomView = null; return renderRoom();
        }
        $('pageTitle').textContent = r.name;
        setTopExtra('tab-room', `<button class="icon-btn" data-top="room-menu" aria-label="房間選項"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>`);
        const ms = (r.members || []).map(u => ({ u, p: profiles[u], s: statusOf(u, now) }));
        const order = { focus: 0, break: 1, idle: 2 };
        const seats = ms.slice().sort((a, b) => order[a.s.phase] - order[b.s.phase] || (b.s.el || 0) - (a.s.el || 0));
        const total = (m) => Math.round(m.s.min + (m.s.phase === 'focus' ? m.s.el / 60000 : 0));   // 正在讀的那一輪也算進去
        const rank = ms.slice().sort((a, b) => total(b) - total(a));
        const maxMin = Math.max(1, ...rank.map(total));
        const studying = ms.filter(m => m.s.phase === 'focus').length;
        const cm = chats[r.id]?.msgs || [];
        const last = [...cm].reverse().find(m => !m.recalled);
        const unread = unreadOf(r.id);
        const chatBtn = `<button class="chat-entry" data-chat="${esc(r.id)}">
                <span class="ce-ic">${ICON_CHAT}</span>
                <span class="ce-tx"><b>聊天室</b><small>${last ? esc(`${last.uid === meUid ? '你' : (last.name || '同學')}：${last.img ? '傳了一張照片' : last.text}`) : '與朋友聊聊'}</small></span>
                ${unread ? `<span class="seg-n">${unread > 99 ? '99+' : unread}</span>` : ''}
                <svg class="go-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
            </button>`;
        el.dataset.view = 'people:' + r.id;
        setRoomHtml(el, `<div class="sub-wrap">
            <div class="room-status">
                ${studying ? `<span class="tag ok"><span class="live-dot"></span>${studying} 人在讀</span>` : '<span class="tag mute">目前沒人在讀</span>'}
                <span class="muted">${ms.length} 位成員</span>
                <span class="grow"></span>
                <button class="code-stub" data-room="share" aria-label="分享邀請碼 ${esc(r.id)}"><span class="num">${esc(r.id)}</span><span class="cs-r"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>邀請</span></button>
            </div>
            <div class="seats">${seats.map(m => {
                const fr = seatFrac(m.s);
                return `<div class="seat ${m.s.phase}${m.s.phase === 'idle' && m.s.min > 0 ? ' rested' : ''}" data-seat="${esc(m.u)}">
                    <div class="seat-av"><svg viewBox="0 0 68 68" aria-hidden="true"><circle class="st-track" cx="34" cy="34" r="31"/><circle class="st-bar" cx="34" cy="34" r="31" stroke-dasharray="${SEAT_C.toFixed(1)}" stroke-dashoffset="${(SEAT_C * (1 - fr)).toFixed(1)}"/></svg>
                        <span class="seat-face" style="background:${avColor(m.u)}">${esc(firstGlyph(memberName(m)))}</span></div>
                    <b class="sn">${esc(memberName(m))}${m.u === meUid ? '<small>（你）</small>' : ''}</b>
                    ${seatSub(m.s)}
                    <span class="sc num" data-clock="${esc(m.u)}">${memberClock(m.s)}</span>
                </div>`;
            }).join('')}</div>
            ${chatBtn}
            <section class="stats-sec">
                <div class="sec-head"><h3>今天排行</h3><span>嗶嗶啵啵嗶</span></div>
                ${rank.map((m, i) => `<div class="rank-row ${m.u === meUid ? 'me' : ''}">
                    <span class="rk num" ${i < 3 && total(m) ? `style="background:${MEDAL[i]};color:#050608"` : ''}>${i + 1}</span>
                    <span class="nm">${esc(memberName(m))}</span>
                    <span class="track"><i style="width:${(total(m) / maxMin * 100).toFixed(1)}%;background:${avColor(m.u)}"></i></span>
                    <span class="t num">${fmtHM(total(m))}</span>
                </div>`).join('')}
            </section>
            <p class="hint" style="margin-top:16px">房間裡的人看得到你的暱稱、正在讀的科目和今天的時數</p>
            ${timer.phase === 'focus' ? '' : `<div class="sticky-cta room-cta"><button class="btn btn-accent btn-wide" data-room="focus"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>開始讀書</button></div>`}
            ${roomHistoryHtml(ms, now)}
        </div>`);
        return;
    }
    setTopExtra('tab-room', `<button class="me-chip" data-top="me" aria-label="我的暱稱、頭像顏色與隱身設定"><span class="av" style="background:${avColor(meUid)}">${esc(firstGlyph(myName()))}</span><span class="zh">${esc(myName())}</span></button>`);
    const tickets = `<div class="sec-head" style="margin:6px 0 14px"><h3>我的房間</h3><span>${myRooms.length ? myRooms.length + ' 間' : ''}</span></div>
        ${myRooms.length ? myRooms.map(r => {
            const ms = (r.members || []);
            const n = ms.filter(u => statusOf(u, now).phase === 'focus').length;
            return `<button class="ticket ${n ? 'hot' : ''}" data-open="${esc(r.id)}">
                <span class="tk-main">
                    <b class="zh">${esc(r.name)}</b>
                    <span class="tk-row">${ticketAvs(ms)}${n ? `<span class="tag ok"><span class="live-dot"></span>${n} 人在讀</span>` : '<span class="tag mute">目前沒人在讀</span>'}</span>
                </span>
                <span class="tk-stub"><small>邀請碼</small><b class="num">${esc(r.id)}</b>${unreadOf(r.id) ? `<span class="seg-n tk-unread">${unreadOf(r.id)}</span>` : ''}</span>
            </button>`;
        }).join('') : '<p class="empty">還沒有房間，建立一個或用邀請碼加入</p>'}`;
    if (el.dataset.view === 'lobby' && $('ticketList')) { $('ticketList').innerHTML = tickets; el._html = null; return; }
    el.dataset.view = 'lobby';
    setRoomHtml(el, `<div class="sub-wrap">
        <div id="ticketList">${tickets}</div>
        <section class="stats-sec">
            <div class="sec-head"><h3>輸入邀請碼加入</h3></div>
            <label class="code-wrap" aria-label="邀請碼">
                <span class="code-boxes num" id="codeBoxes">${codeBoxes(codeDraft)}</span>
                <input id="roomCodeInput" maxlength="6" value="${esc(codeDraft)}" autocapitalize="characters" autocomplete="off" spellcheck="false" inputmode="text" enterkeyhint="go">
            </label>
            <button class="btn btn-accent btn-wide" data-room="join" style="margin-top:14px">加入房間</button>
            <div style="display:flex;justify-content:center;margin-top:16px">
                <button class="text-link" data-room="create"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>建立新房間</button>
            </div>
        </section>
    </div>`);
}
/* --- 聊天室：rooms/{邀請碼}/messages、rooms/{邀請碼}/reads/{uid} ---
 * 每個房間都會監聽最近的訊息（才能顯示未讀和提醒）；打開聊天室時是全螢幕畫面 */
const CHAT_LIMIT = 80;               // 只載入最近 80 則
const RECALL_MS = 24 * 3600000;      // 24 小時內可以收回
const PHOTO_DAILY = 20;              // 每人每天最多傳 20 張照片
const PHOTO_KEEP = 30 * 86400000;    // 照片保留 30 天
const chats = {};                    // 邀請碼 → { msgs, unsub, first }
let chatRoom = null, readsUnsub = null, chatReads = {}, chatSending = false, lastReadSent = 0;
let chatSeen = lsGet(LS.chatSeen, {});
const msgTime = (v) => !v ? 0 : typeof v === 'number' ? v : v.toMillis ? v.toMillis() : (Date.parse(v) || 0);

function chatSync() {
    if (!fb || !currentUser) return;
    const ids = new Set(myRooms.map(r => r.id));
    Object.keys(chats).forEach(c => { if (!ids.has(c)) { chats[c].unsub && chats[c].unsub(); chats[c].readUnsub && chats[c].readUnsub(); delete chats[c]; } });
    myRooms.forEach(r => { if (!chats[r.id]) chatListen(r.id); });
}
function chatListen(code) {
    const c = chats[code] = { msgs: [], first: true, unsub: null, readUnsub: null };
    const { fs, db } = fb;
    // 已讀位置存在雲端（rooms/房號/reads/我的uid），重新登入、換裝置或 Safari 和主畫面 App 之間都會同步，
    // 讀過的訊息不會又跳紅點
    if (currentUser) c.readUnsub = fs.onSnapshot(fs.doc(db, 'rooms', code, 'reads', currentUser.uid), (snap) => {
        const at = snap.exists() ? Number(snap.data().at) || 0 : 0;
        if (at > (chatSeen[code] || 0)) {
            chatSeen[code] = at; lsSet(LS.chatSeen, chatSeen);
            updateChatBadges();
            if (document.body.dataset.tab === 'tab-room') renderRoom();
        }
    }, () => {});
    const q = fs.query(fs.collection(db, 'rooms', code, 'messages'), fs.orderBy('at', 'desc'), fs.limit(CHAT_LIMIT));
    c.unsub = fs.onSnapshot(q, (snap) => {
        const prevIds = new Set(c.msgs.map(m => m.id));
        const prevReact = new Map(c.msgs.map(m => [m.id, m.reactions || {}]));
        c.msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
        const fresh = c.first ? [] : c.msgs.filter(m => !prevIds.has(m.id) && m.uid !== currentUser?.uid && !m.recalled);
        // v62：有人對「我的訊息」按了新的表情
        if (!c.first && currentUser) {
            const me = currentUser.uid;
            c.msgs.forEach(m => {
                if (m.uid !== me || m.recalled || !prevReact.has(m.id)) return;
                const before = prevReact.get(m.id), after = m.reactions || {};
                Object.keys(after).forEach(u => { if (u !== me && after[u] && after[u] !== before[u]) onReacted(code, m, u, after[u]); });
            });
        }
        c.first = false;
        onChatUpdate(code, fresh);
    }, (err) => {
        console.warn('聊天室讀取失敗：', err);
        if (err.code === 'permission-denied' && chatRoom === code) toast('聊天室讀取被拒絕：請確認 Firestore 規則已更新');
    });
}
function chatStopAll() {
    Object.keys(chats).forEach(c => { chats[c].unsub && chats[c].unsub(); chats[c].readUnsub && chats[c].readUnsub(); delete chats[c]; });
}
function unreadOf(code) {
    const seen = chatSeen[code] || 0, me = currentUser?.uid;
    return (chats[code]?.msgs || []).filter(m => m.at > seen && m.uid !== me && !m.recalled).length;
}
const totalUnread = () => myRooms.reduce((a, r) => a + unreadOf(r.id), 0);
const chatVisible = (code) => chatRoom && (!code || code === chatRoom) && document.visibilityState === 'visible';

// 有新訊息：聊天室開著就直接顯示；沒開就提醒
function onChatUpdate(code, fresh) {
    if (chatRoom === code) { renderChatList(false); markChatSeen(); }
    if (document.body.dataset.tab === 'tab-room') renderRoom();
    updateChatBadges();
    const m = fresh[fresh.length - 1];
    if (!m || chatVisible(code)) return;
    const room = myRooms.find(x => x.id === code);
    const body = m.img ? '傳了一張照片' : m.text;
    const replyMe = m.replyTo && m.replyTo.uid === currentUser?.uid ? (m.replyTo.img ? '照片' : String(m.replyTo.text || '').slice(0, 30)) : '';
    if (document.visibilityState === 'visible') {
        showChatNotice({ code, uid: m.uid, name: m.name || '同學', room: room?.name || '讀書房間', text: body, count: unreadOf(code), reply: replyMe });
        device.vibrate(30);
    } else {
        document.title = `(${totalUnread()}) ${room?.name || BASE_TITLE}`;
        systemNotify(`${m.name || '同學'} · ${room?.name || '讀書房間'}`, body, code);
    }
}
// 有人對我的訊息按表情：網站開著、沒在看那個聊天室時，在畫面上方提醒
function onReacted(code, m, u, emoji) {
    if (chatVisible(code) || document.visibilityState !== 'visible' || !notif.react) return;
    const room = myRooms.find(x => x.id === code);
    const quote = m.img ? '照片' : String(m.text || '').slice(0, 24);
    showChatNotice({ code, uid: u, name: memberName({ u, p: profiles[u] }), room: room?.name || '讀書房間', text: `對你的訊息按了 ${emoji}：「${quote}」`, count: 0, kind: 'react' });
}
// 分頁列「計時」上的紅點＝所有房間的未讀數
function updateChatBadges() {
    const n = totalUnread();
    const btn = [...tabBtns].find(b => b.dataset.tab === 'tab-timer');
    let dot = btn.querySelector('.tab-dot');
    if (!dot) { dot = document.createElement('span'); dot.className = 'tab-dot'; btn.appendChild(dot); }
    dot.hidden = !n;
}
// 系統通知：App 在背景（還沒被系統關掉）時才收得到；完全關掉要靠推播伺服器
function systemNotify(title, body, code) {
    try {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        if (pushOn() && notif.chat) return;   // 有開推播：交給推播伺服器，不重複通知
        const opt = { body: body.slice(0, 120), tag: 'room-' + code, renotify: true, icon: 'icon-192.png', badge: 'favicon-32.png', data: { room: code } };
        if (navigator.serviceWorker?.controller) navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opt));
        else new Notification(title, opt);
    } catch (e) {}
}
navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.openRoom) { roomView = e.data.openRoom; showTab('tab-room'); openChat(e.data.openRoom); }
    else if (e.data?.openTab && document.getElementById(e.data.openTab)) showTab(e.data.openTab);   // v61 每日提醒：點了打開計時
});

/* =====================================================
 * v62 通知：推播（網站沒開也收得到）＋通知設定頁
 *   每台裝置：pushTokens/{雜湊}（推播 token，只有自己讀寫得到）
 *   每個帳號：通知設定存在 users/{uid}.prefs.notif（跟著帳號同步）
 *            發送需要的資料整理成 pushSched/{uid}，由 Cloud Functions 每分鐘檢查、發送
 *   iPhone 要先「加入主畫面」，從主畫面打開才收得到（iOS 16.4 以上）
 * ===================================================== */
const NOTIF_DEF = {
    chat: true, reply: true, react: true, poke: true, pomo: true, focus: true,
    daily: { on: true, time: '18:00' },
    morning: { on: true, time: '07:00', keys: ['gsat', 'next'] },
    event: { on: true, days: 1, time: '20:00' },
    todo: { on: true, lead: 60, day: '07:30' },
    quiet: { on: true, from: '23:00', to: '06:30' }
};
const hmOk = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const hmMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const minHm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
function normNotif(x) {
    const d = NOTIF_DEF, o = (x && typeof x === 'object') ? x : {};
    const b = (v, def) => typeof v === 'boolean' ? v : def;
    const t = (v, def) => hmOk(v) ? v : def;
    const n = (v, lo, hi, def) => Number.isInteger(v) && v >= lo && v <= hi ? v : def;
    return {
        chat: b(o.chat, d.chat), reply: b(o.reply, d.reply), react: b(o.react, d.react), poke: b(o.poke, d.poke), pomo: b(o.pomo, d.pomo), focus: b(o.focus, d.focus),
        daily: { on: b(o.daily?.on, d.daily.on), time: t(o.daily?.time, d.daily.time) },
        morning: { on: b(o.morning?.on, d.morning.on), time: t(o.morning?.time, d.morning.time),
            keys: Array.isArray(o.morning?.keys) ? o.morning.keys.filter(k => typeof k === 'string').slice(0, 4) : d.morning.keys.slice() },
        event: { on: b(o.event?.on, d.event.on), days: n(o.event?.days, 0, 7, d.event.days), time: t(o.event?.time, d.event.time) },
        todo: { on: b(o.todo?.on, d.todo.on), lead: n(o.todo?.lead, 0, 7 * 1440 + 23 * 60 + 55, d.todo.lead), day: t(o.todo?.day, d.todo.day) },
        quiet: { on: b(o.quiet?.on, d.quiet.on), from: t(o.quiet?.from, d.quiet.from), to: t(o.quiet?.to, d.quiet.to) }
    };
}
let notif = normNotif(lsGet(LS.notif, null));
function saveNotif() { lsSet(LS.notif, notif); savePrefs(); schedSync(); renderNotif(); renderNotifRow(); }

// 這台裝置的推播（開了沒）
let pushPref = Object.assign({ on: false }, lsGet(LS.push, {}));
const savePushPref = () => lsSet(LS.push, { on: !!pushPref.on });
let pushMsg = null, pushBusy = false;
function pushSupport() {
    if (!VAPID_KEY) return { ok: false, why: '推播即將開放，敬請期待' };
    if (isIOS() && !isStandalone()) return { ok: false, why: '先用 Safari 把網站「加入主畫面」，從主畫面打開後才能開啟推播（iOS 16.4 以上）', install: true };
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { ok: false, why: '這個瀏覽器不支援推播通知，換成 Chrome、Edge 或 Safari 試試' };
    if (Notification.permission === 'denied') return { ok: false, why: '通知被封鎖了：請到手機或瀏覽器的「設定」裡，允許這個網站傳送通知' };
    return { ok: true };
}
const pushOn = () => !!(pushPref.on && localStorage.getItem(LS.pushId) && pushSupport().ok && Notification.permission === 'granted');
// 推播資料的文件名稱：帳號＋token 的雜湊（舊瀏覽器沒有 crypto.subtle 時用簡單的雜湊）
async function sha256(t) {
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        let h1 = 0x811c9dc5, h2 = 0x01000193;
        for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822519) >>> 0; }
        return 'h' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + t.length.toString(16);
    }
}
async function pushToken() {
    if (!pushMsg) {
        const m = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-messaging.js`);
        pushMsg = { m, messaging: m.getMessaging(fb.app) };
    }
    const reg = await navigator.serviceWorker.ready;
    return pushMsg.m.getToken(pushMsg.messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
}
async function pushSave() {
    if (!currentUser || !fb) return false;
    const token = await pushToken();
    if (!token) return false;
    const id = await sha256(currentUser.uid + ':' + token);
    await fb.fs.setDoc(fb.fs.doc(fb.db, 'pushTokens', id), { uid: currentUser.uid, token, platform: 'web', ios: isIOS(), updatedAt: Date.now() }, { merge: true });
    lsSet(LS.pushId, id);
    return true;
}
async function pushRemove() {
    const id = localStorage.getItem(LS.pushId);
    try { localStorage.removeItem(LS.pushId); } catch (e) {}
    if (!id || !fb || !currentUser) return;
    try { await fb.fs.deleteDoc(fb.fs.doc(fb.db, 'pushTokens', id)); } catch (e) {}
}
async function enablePush() {
    if (pushBusy) return;
    const sup = pushSupport();
    if (!sup.ok) { toast(sup.why); renderNotif(); return; }
    if (!currentUser) { toast('推播要先登入 Google 帳號'); return; }
    pushBusy = true; renderNotif();
    try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { toast('沒有允許通知，推播沒有開啟'); return; }
        pushPref.on = true; savePushPref();
        if (!(await pushSave())) throw new Error('no-token');
        schedSync(true);
        toast('已開啟推播通知');
    } catch (e) {
        console.warn('開啟推播失敗：', e);
        pushPref.on = false; savePushPref();
        toast('開啟推播失敗，請稍後再試');
    } finally { pushBusy = false; renderNotif(); renderNotifRow(); }
}
async function disablePush() {
    pushPref.on = false; savePushPref();
    await pushRemove();
    renderNotif(); renderNotifRow(); toast('這台裝置不會再收到推播');
}
// 傳一則測試通知（伺服器上的 testPush）
async function testPush() {
    if (!pushOn()) { toast('先開啟這台裝置的推播'); return; }
    const b = $('nfTest');
    b.disabled = true; b.textContent = '傳送中…';
    try {
        const fm = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-functions.js`);
        const call = fm.httpsCallable(fm.getFunctions(fb.app, 'asia-east1'), 'testPush');
        const r = await call({});
        toast(r.data?.sent ? `已送出到 ${r.data.sent} 台裝置，幾秒內會收到` : '沒有找到可以收推播的裝置，請關掉推播再開一次');
    } catch (e) {
        console.warn('測試通知失敗：', e);
        toast('測試通知送不出去，伺服器可能還沒更新');
    } finally { b.disabled = false; b.textContent = '傳一則測試通知'; }
}
// 正在用網站的時候，聊天訊息由網站自己顯示，不要再推播：每 3 分鐘告訴伺服器「我在」，離開時立刻取消
let pushLastBeat = 0;
function pushBeat(force) {
    const id = localStorage.getItem(LS.pushId);
    if (!id || !pushPref.on || !currentUser || !fb) return;
    const visible = document.visibilityState === 'visible';
    if (visible && !force && Date.now() - pushLastBeat < 170000) return;
    pushLastBeat = visible ? Date.now() : 0;
    fb.fs.setDoc(fb.fs.doc(fb.db, 'pushTokens', id), { activeUntil: visible ? Date.now() + 240000 : 0 }, { merge: true }).catch(() => {});
}
document.addEventListener('visibilitychange', () => pushBeat(true));
window.addEventListener('pagehide', () => pushBeat(true));
setInterval(() => pushBeat(false), 30000);

/* --- 給伺服器的排程資料 pushSched/{uid} --- */
// 勿擾：這個時間（當天第幾分鐘）在不在勿擾時段裡
function inQuiet(min) {
    if (!notif.quiet.on) return false;
    const f = hmMin(notif.quiet.from), t = hmMin(notif.quiet.to);
    if (f === t) return false;
    return f < t ? (min >= f && min < t) : (min >= f || min < t);
}
// 落在勿擾時段的提醒，延到勿擾結束
function deferQuiet(ms) {
    const d = new Date(ms), m = d.getHours() * 60 + d.getMinutes();
    if (!inQuiet(m)) return ms;
    const t = hmMin(notif.quiet.to), e = new Date(d);
    e.setHours(Math.floor(t / 60), t % 60, 0, 0);
    if (e.getTime() <= ms) e.setDate(e.getDate() + 1);
    return e.getTime();
}
const atOn = (ds, hm) => { const d = parseYmd(ds); d.setHours(Number(hm.slice(0, 2)), Number(hm.slice(3, 5)), 0, 0); return d.getTime(); };
const mdw = (ds) => { const d = parseYmd(ds); return `${d.getMonth() + 1}/${d.getDate()}（${WEEK_ZH[d.getDay()]}）`; };
function fmtLead(min) {
    const d = Math.floor(min / 1440), h = Math.floor(min % 1440 / 60), m = min % 60;
    return [d ? `${d} 天` : '', h ? `${h} 小時` : '', m ? `${m} 分` : ''].filter(Boolean).join(' ') || '0 分';
}
// 接下來 60 天要發的一次性提醒（行程、考試、自己的倒數、待辦）
function buildQueue(now = Date.now()) {
    const out = [], t = todayStr(), limit = now + 60 * 86400000;
    const push = (at, title, body, tab, id) => { at = deferQuiet(at); if (at > now && at < limit) out.push({ at, title: title.slice(0, 60), body: body.slice(0, 120), tab, id }); };
    if (notif.event.on) {
        const N = notif.event.days, when = N === 0 ? '今天' : N === 1 ? '明天' : `${N} 天後`;
        const items = [
            ...state.events.map(e => ({ id: 'e' + e.id, name: e.title || '行程', date: e.start, imp: e.important })),
            ...examEntries.map(([k, e]) => ({ id: 'x' + k, name: e.name, date: e.date, exam: true })),
            ...state.countdowns.items.map(c => ({ id: 'c' + c.id, name: c.name, date: cdNextDate(c) }))
        ];
        items.forEach(it => {
            if (!it.date || it.date < t) return;
            const d = parseYmd(it.date); d.setDate(d.getDate() - N);
            push(atOn(ymd(d), notif.event.time), `${when}：${it.name}`, `${mdw(it.date)}${it.exam ? ' · 考試加油！' : it.imp ? ' · 重要' : ''}`, 'tab-calendar', it.id);
        });
    }
    if (notif.todo.on) {
        state.todos.forEach(td => {
            if (!td.date || td.date < t) return;
            if (td.time) {
                const due = atOn(td.date, td.time), lead = notif.todo.lead;
                push(due - lead * 60000, `待辦：${td.text}`, `${todoDateText(td.date)} ${td.time}${lead ? ` · 還有 ${fmtLead(lead)}` : ' · 就是現在'}`, 'tab-todo', 't' + td.id);
            } else {
                push(atOn(td.date, notif.todo.day), `待辦：${td.text}`, `${todoDateText(td.date)}要完成`, 'tab-todo', 't' + td.id);
            }
        });
    }
    return out.sort((a, b) => a.at - b.at).slice(0, 120);
}
// 早安倒數要倒數哪些
function morningLists() {
    const t = todayStr(), keys = notif.morning.keys;
    const fixed = [], next = keys.includes('next')
        ? examEntries.filter(([, e]) => e.date >= t).map(([, e]) => ({ name: e.name, date: e.date })).slice(0, 6) : [];
    keys.forEach(k => {
        if (k === 'next') return;
        const c = getCd(k);
        if (c && c.date >= t) fixed.push({ name: c.name, date: c.date });
    });
    return { fixed, next };
}
// 番茄鐘：這一輪什麼時候結束（暫停、自由計時、關掉提醒就是 null）
function timerEndAt() {
    if (!notif.pomo || timer.phase !== 'focus' || !timer.duration || timer.pausedAt) return null;
    const end = timer.startAt + (timer.pausedTotal || 0) + timer.duration;
    return end > Date.now() + 5000 ? end : null;   // 已經到時間的不用再排（避免伺服器重複通知）
}
// 讀書中（專注、沒暫停）到什麼時候：番茄鐘用這一輪結束的時間；自由計時最多算 4 小時（按結束就會清掉）
function focusUntilAt() {
    if (timer.phase !== 'focus' || timer.pausedAt) return null;
    const end = timer.duration ? timer.startAt + (timer.pausedTotal || 0) + timer.duration : Date.now() + 4 * 3600000;
    return end > Date.now() ? end : null;
}
let schedT = 0, schedSig = '';
function schedSync(force) {
    if (!currentUser || !fb || !cloudReady) return;
    clearTimeout(schedT);
    schedT = setTimeout(() => {
        const q = buildQueue();
        const mt = morningLists();
        const end = timerEndAt();
        const mode = MODES[timer.mode] || MODES[0];
        const data = {
            uid: currentUser.uid,
            chat: notif.chat, reply: notif.reply, react: notif.react, poke: notif.poke,
            focusMute: notif.focus, focusUntil: notif.focus ? focusUntilAt() : null,
            quiet: notif.quiet.on ? { from: notif.quiet.from, to: notif.quiet.to } : null,
            daily: notif.daily.on ? notif.daily.time : null, goal: tpref.goal || 180,
            morning: notif.morning.on && (mt.fixed.length || mt.next.length) ? notif.morning.time : null, morningFixed: mt.fixed, morningNext: mt.next,
            queue: q, queueMin: q.length ? q[0].at : null,
            timerEnd: end, timerInfo: end ? { subject: SUBJECTS[timer.subject] || '', focus: Math.round(timer.duration / 60000), rest: mode.rest || 5 } : null
        };
        const sig = JSON.stringify(data);
        if (!force && sig === schedSig) return;
        schedSig = sig;
        fb.fs.setDoc(fb.fs.doc(fb.db, 'pushSched', currentUser.uid), { ...data, updatedAt: Date.now() }, { merge: true })
            .catch(e => { schedSig = ''; console.warn('推播排程更新失敗：', e); });
    }, force ? 50 : 1500);
}
// 待辦、行程、倒數改了 → 更新排程；計時開始、暫停、結束也更新
const _saveForSched = save;
save = function () { _saveForSched.apply(this, arguments); schedSync(); };

/* --- 時間滾輪（下方滑出）：時、分；也可以給「天 時 分」用 --- */
let wheelDone = null;
const WHEEL_H = 40;
function wheelCol(values, cur, suffix) {
    const i = Math.max(0, values.indexOf(cur));
    return `<div class="wh-col" data-i="${i}" tabindex="0" role="listbox"><div class="wh-pad"></div>${values.map((v, k) => `<div class="wh-item${k === i ? ' on' : ''}" data-v="${v}" role="option">${v}${suffix ? `<small>${suffix}</small>` : ''}</div>`).join('')}<div class="wh-pad"></div></div>`;
}
function openWheel({ title, cols, quick, note }) {
    $('whTitle').textContent = title;
    $('whNote').textContent = note || '';
    $('whNote').hidden = !note;
    $('whCols').innerHTML = cols.map((c, k) => (k && c.sep ? `<span class="wh-sep">${c.sep}</span>` : '') + wheelCol(c.values, c.value, c.suffix)).join('');
    $('whCols').style.gridTemplateColumns = cols.map((c, k) => (k && c.sep ? 'auto ' : '') + 'minmax(0, 1fr)').join(' ');
    $('whQuick').innerHTML = (quick || []).map(q => `<button type="button" data-q="${esc(JSON.stringify(q.v))}">${esc(q.label)}</button>`).join('');
    $('whQuickWrap').hidden = !(quick && quick.length);
    openModal('wheelModal');
    requestAnimationFrame(() => document.querySelectorAll('#whCols .wh-col').forEach(col => { col.scrollTop = Number(col.dataset.i) * WHEEL_H; markWheel(col); }));
    markQuick();
    return new Promise(res => { wheelDone = res; });
}
function wheelValues() { return [...document.querySelectorAll('#whCols .wh-col')].map(col => col.querySelectorAll('.wh-item')[Number(col.dataset.i)]?.dataset.v); }
function markWheel(col) {
    const items = col.querySelectorAll('.wh-item');
    const i = Math.min(items.length - 1, Math.max(0, Math.round(col.scrollTop / WHEEL_H)));
    col.dataset.i = i;
    items.forEach((el, k) => el.classList.toggle('on', k === i));
}
function markQuick() {
    const cur = JSON.stringify(wheelValues());
    document.querySelectorAll('#whQuick [data-q]').forEach(b => b.classList.toggle('on', b.dataset.q === cur));
}
$('whCols').addEventListener('scroll', (e) => {
    const col = e.target.closest?.('.wh-col');
    if (!col) return;
    markWheel(col);
    clearTimeout(col._t);
    col._t = setTimeout(() => { col.scrollTo({ top: Number(col.dataset.i) * WHEEL_H, behavior: 'smooth' }); markQuick(); }, 120);
}, true);
$('whCols').addEventListener('click', (e) => {
    const it = e.target.closest('.wh-item');
    if (!it) return;
    const col = it.closest('.wh-col'), k = [...col.querySelectorAll('.wh-item')].indexOf(it);
    col.scrollTo({ top: k * WHEEL_H, behavior: 'smooth' });
});
$('whCols').addEventListener('keydown', (e) => {
    const col = e.target.closest('.wh-col');
    if (!col || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const n = col.querySelectorAll('.wh-item').length;
    const k = Math.min(n - 1, Math.max(0, Number(col.dataset.i) + (e.key === 'ArrowDown' ? 1 : -1)));
    col.scrollTo({ top: k * WHEEL_H, behavior: 'smooth' });
});
$('whQuick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    const v = JSON.parse(b.dataset.q);
    document.querySelectorAll('#whCols .wh-col').forEach((col, k) => {
        const items = [...col.querySelectorAll('.wh-item')], idx = items.findIndex(x => x.dataset.v === v[k]);
        if (idx >= 0) col.scrollTo({ top: idx * WHEEL_H, behavior: 'smooth' });
    });
    setTimeout(markQuick, 350);
});
$('whDone').addEventListener('click', () => { const v = wheelValues(); closeModal('wheelModal'); const f = wheelDone; wheelDone = null; f && f(v); });
document.querySelectorAll('#wheelModal [data-close]').forEach(b => b.addEventListener('click', () => { const f = wheelDone; wheelDone = null; f && f(null); }));
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINS5 = Array.from({ length: 12 }, (_, i) => pad(i * 5));
// 選一個時間（分鐘不是 5 的倍數就四捨五入到最近的 5 分）
async function pickTime(title, cur, quick, note) {
    const m5 = pad(Math.round(Number(cur.slice(3, 5)) / 5) * 5 % 60);
    const v = await openWheel({ title, note, cols: [{ values: HOURS, value: cur.slice(0, 2) }, { values: MINS5, value: m5, sep: ':' }], quick: (quick || []).map(q => ({ label: q, v: [q.slice(0, 2), q.slice(3, 5)] })) });
    return v ? `${v[0]}:${v[1]}` : null;
}

/* --- 通知設定頁（個人設定 →「通知」） --- */
const NF_IC = {
    chat: '<path d="M4 5.5h16v10H9l-5 4z"/>',
    reply: '<path d="M10 8L5 12.5l5 4.5"/><path d="M5.5 12.5H14a5 5 0 0 1 5 5V19"/>',
    react: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.8h.01M15 9.8h.01"/>',
    poke: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
    pomo: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2.5h6"/>',
    daily: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    morning: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    event: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    todo: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
    quiet: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    focus: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5v13"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>'
};
const nfIc = (k) => `<span class="nf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NF_IC[k]}</svg></span>`;
const nfRow = (k, title, sub, on, path) => `<label class="nf-row">${nfIc(k)}<span class="nf-tx"><b>${title}</b><small>${sub}</small></span><input type="checkbox" role="switch" data-nf="${path}" ${on ? 'checked' : ''}><i class="nf-sw" aria-hidden="true"></i></label>`;
const nfVal = (label, value, act, aria) => `<div class="nf-line"><span>${label}</span><button type="button" class="nf-val" data-nfa="${act}" aria-label="${aria || label}：${value.replace(/<[^>]+>/g, '')}"><span>${value}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10l4 4 4-4"/></svg></button></div>`;
function morningChips() {
    const t = todayStr();
    const opts = [{ k: 'gsat', name: EXAMS.gsat.name }, { k: 'next', name: '下一場考試' },
        ...state.countdowns.items.map(c => ({ k: c.id, name: c.name, color: c.color }))].filter(o => o.k !== 'gsat' || EXAMS.gsat.date >= t);
    return opts.map(o => { const on = notif.morning.keys.includes(o.k); return `<button type="button" class="nf-chip ${on ? 'on' : ''}" data-mk="${esc(o.k)}" aria-pressed="${on}">${o.color ? `<i style="background:${esc(o.color)}"></i>` : ''}${esc(o.name)}</button>`; }).join('');
}
function renderNotif() {
    const el = $('nfBody');
    if (!el || !$('notifScreen').classList.contains('open')) return;
    const sup = pushSupport(), on = pushOn();
    let dev;
    if (!currentUser) dev = `<div class="nf-dev"><i class="dot off"></i><div class="nf-tx"><b>還沒登入</b><small>登入 Google 帳號後，才能開啟推播。</small></div><button class="btn btn-small" data-nfa="login">登入</button></div>`;
    else if (!sup.ok) dev = `<div class="nf-dev"><i class="dot off"></i><div class="nf-tx"><b>這台裝置不能收推播</b><small>${esc(sup.why)}</small></div>${sup.install ? '<button class="btn btn-small" data-nfa="install">怎麼加</button>' : ''}</div>`;
    else if (!on) dev = `<div class="nf-dev"><i class="dot off"></i><div class="nf-tx"><b>推播還沒開</b><small>開了之後，網站沒開也收得到下面打開的通知。</small></div><button class="btn btn-small btn-accent" data-nfa="enable" ${pushBusy ? 'disabled' : ''}>${pushBusy ? '開啟中…' : '開啟'}</button></div>`;
    else dev = `<div class="nf-dev"><i class="dot"></i><div class="nf-tx"><b>推播已開啟</b><small>網站沒開也收得到下面打開的通知。</small></div><button class="btn btn-small" data-nfa="disable">關閉</button></div>`;
    const n = notif, ev = n.event.days === 0 ? '當天' : `${n.event.days} 天`;
    const quietWarn = (hm) => inQuiet(hmMin(hm)) ? '<p class="nf-warn">這個時間在勿擾時段內，不會提醒</p>' : '';
    setHtml(el, `
    <section class="nf-sec"><h3>這台裝置</h3><div class="nf-card">${dev}</div>
        <p class="nf-foot">每台手機、電腦要各自開啟一次推播；下面的設定跟著帳號，所有裝置共用。</p>
        ${on ? '<button class="btn nf-test" id="nfTest" data-nfa="test">傳一則測試通知</button>' : ''}</section>
    <section class="nf-sec"><h3>朋友和聊天</h3><div class="nf-card">
        ${nfRow('chat', '聊天訊息', '朋友在讀書房間傳訊息', n.chat, 'chat')}
        ${nfRow('reply', '回覆你的訊息', '通知上面會多一行「回覆了你：你的訊息…」', n.reply, 'reply')}
        ${nfRow('react', '對你的訊息按表情', '例如「對你的訊息按了 😂」', n.react, 'react')}
        ${nfRow('poke', '朋友叫你讀書', '房間裡的朋友點你的頭像叫你去讀書', n.poke, 'poke')}
    </div></section>
    <section class="nf-sec"><h3>讀書</h3><div class="nf-card">
        ${nfRow('pomo', '番茄鐘時間到', '專注結束：「休息中，點一下繼續」', n.pomo, 'pomo')}
        ${nfRow('daily', '每日讀書提醒', '到了這個時間，今天還沒達標才提醒', n.daily.on, 'daily.on')}
        ${n.daily.on ? `<div class="nf-sub">${nfVal('每天', n.daily.time, 'daily', '每日讀書提醒時間')}${quietWarn(n.daily.time)}</div>` : ''}
        ${nfRow('morning', '早安倒數', '每天早上告訴你離考試還有幾天', n.morning.on, 'morning.on')}
        ${n.morning.on ? `<div class="nf-sub">${nfVal('每天', n.morning.time, 'morning', '早安倒數時間')}${quietWarn(n.morning.time)}
            <div class="nf-line col"><span>要倒數哪些（可以複選）</span><div class="nf-chips">${morningChips()}</div></div></div>` : ''}
    </div></section>
    <section class="nf-sec"><h3>行事曆和待辦</h3><div class="nf-card">
        ${nfRow('event', '行程提醒', '行事曆上的行程、考試和自己的倒數', n.event.on, 'event.on')}
        ${n.event.on ? `<div class="nf-sub">${nfVal('提前', ev, 'evdays', '提前幾天')}${nfVal('提醒時間', n.event.time, 'evtime')}</div>` : ''}
        ${nfRow('todo', '待辦提醒', '有日期的待辦事項', n.todo.on, 'todo.on')}
        ${n.todo.on ? `<div class="nf-sub">${nfVal('有設時間的待辦，提前', fmtLead(n.todo.lead), 'tdlead', '待辦提前多久')}${nfVal('只有日期的待辦，當天', n.todo.day, 'tdday')}</div>` : ''}
    </div></section>
    <section class="nf-sec"><h3>勿擾</h3><div class="nf-card">
        ${nfRow('quiet', '勿擾時段', '這段時間不推播；行程和待辦提醒延到結束後再發', n.quiet.on, 'quiet.on')}
        ${n.quiet.on ? `<div class="nf-sub">${nfVal('從', n.quiet.from, 'qfrom', '勿擾開始')}${nfVal('到', n.quiet.to, 'qto', '勿擾結束')}</div>` : ''}
        ${nfRow('focus', '讀書中不打擾', '專注計時的時候，聊天和其他通知先不推播；行程和待辦等你停下來再發', n.focus, 'focus')}
    </div></section>
    <section class="nf-sec"><h3>正在用網站時，訊息怎麼顯示</h3><div class="nf-card"><div class="notify-grid nf-style" id="notifyGrid">
        <button class="notify-opt ${notifyStyle === 'banner' ? 'active' : ''}" data-notify="banner" aria-pressed="${notifyStyle === 'banner'}"><span class="nt-th"><span class="nt-banner"><i></i><span><b></b><em></em><em class="s"></em></span></span></span><span class="nt-name">頂部橫幅</span><span class="nt-sub">名字＋兩行訊息</span></button>
        <button class="notify-opt ${notifyStyle === 'pill' ? 'active' : ''}" data-notify="pill" aria-pressed="${notifyStyle === 'pill'}"><span class="nt-th"><span class="nt-pill"><i></i><em></em><u></u></span></span><span class="nt-name">頂部小膠囊</span><span class="nt-sub">最省空間</span></button>
    </div><button class="nt-try" type="button" data-nfa="try">試試看</button></div></section>`);
}
function renderNotifRow() {
    if (!$('notifValue')) return;
    const kinds = [notif.chat, notif.reply, notif.react, notif.poke, notif.pomo, notif.daily.on, notif.morning.on, notif.event.on, notif.todo.on].filter(Boolean).length;
    $('notifValue').textContent = pushOn() ? `推播已開啟 · ${kinds} 項` : '推播未開啟';
}
function openNotif() {
    closeModal('accountModal');
    $('notifScreen').classList.add('open');
    document.body.classList.add('guide-open');
    $('nfBody').scrollTop = 0;
    renderNotif();
    syncScrollLock();
}
function closeNotif() {
    $('notifScreen').classList.remove('open');
    document.body.classList.remove('guide-open');
    syncScrollLock();
}
$('notifRow').addEventListener('click', openNotif);
$('nfBack').addEventListener('click', closeNotif);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('notifScreen').classList.contains('open') && !document.querySelector('.modal.open')) { e.stopImmediatePropagation(); closeNotif(); }
}, true);
$('nfBody').addEventListener('change', (e) => {
    const p = e.target.dataset.nf;
    if (!p) return;
    const [a, b] = p.split('.');
    if (b) notif[a][b] = e.target.checked; else notif[a] = e.target.checked;
    saveNotif();
});
$('nfBody').addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-mk]');
    if (chip) {
        const k = chip.dataset.mk, ks = notif.morning.keys;
        if (ks.includes(k)) { if (ks.length === 1) { toast('至少要選一個'); return; } notif.morning.keys = ks.filter(x => x !== k); }
        else { if (ks.length >= 3) { toast('最多選 3 個'); return; } notif.morning.keys = [...ks, k]; }
        saveNotif(); return;
    }
    const st = e.target.closest('[data-notify]');
    if (st) { applyNotify(st.dataset.notify); savePrefs(); renderNotif(); demoNotice(); return; }
    const a = e.target.closest('[data-nfa]')?.dataset.nfa;
    if (!a) return;
    const n = notif;
    if (a === 'enable') enablePush();
    else if (a === 'disable') disablePush();
    else if (a === 'test') testPush();
    else if (a === 'try') demoNotice();
    else if (a === 'login') { closeNotif(); openModal('accountModal'); }
    else if (a === 'install') { closeNotif(); openInstall(false); }
    else if (a === 'daily') { const v = await pickTime('每日讀書提醒時間', n.daily.time, ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00']); if (v) { n.daily.time = v; saveNotif(); } }
    else if (a === 'morning') { const v = await pickTime('早安倒數時間', n.morning.time, ['06:00', '06:30', '07:00', '07:30', '08:00']); if (v) { n.morning.time = v; saveNotif(); } }
    else if (a === 'evtime') { const v = await pickTime('行程提醒時間', n.event.time, ['07:00', '12:00', '18:00', '20:00', '21:00']); if (v) { n.event.time = v; saveNotif(); } }
    else if (a === 'tdday') { const v = await pickTime('只有日期的待辦：當天幾點提醒', n.todo.day, ['06:30', '07:00', '07:30', '08:00', '12:00']); if (v) { n.todo.day = v; saveNotif(); } }
    else if (a === 'qfrom') { const v = await pickTime('勿擾開始', n.quiet.from, ['22:00', '22:30', '23:00', '23:30', '00:00']); if (v) { n.quiet.from = v; saveNotif(); } }
    else if (a === 'qto') { const v = await pickTime('勿擾結束', n.quiet.to, ['06:00', '06:30', '07:00', '07:30', '08:00']); if (v) { n.quiet.to = v; saveNotif(); } }
    else if (a === 'evdays') {
        const v = await openWheel({ title: '行程提前幾天提醒', cols: [{ values: ['當天', '1', '2', '3', '4', '5', '6', '7'], value: n.event.days ? String(n.event.days) : '當天', suffix: '' }], quick: [{ label: '當天', v: ['當天'] }, { label: '1 天', v: ['1'] }, { label: '3 天', v: ['3'] }, { label: '7 天', v: ['7'] }], note: '數字是「天前」，例如 1＝前一天' });
        if (v) { n.event.days = v[0] === '當天' ? 0 : Number(v[0]); saveNotif(); }
    }
    else if (a === 'tdlead') {
        const L = n.todo.lead;
        const v = await openWheel({ title: '有設時間的待辦：提前多久提醒',
            cols: [{ values: ['0', '1', '2', '3', '4', '5', '6', '7'], value: String(Math.floor(L / 1440)), suffix: '天' },
                { values: Array.from({ length: 24 }, (_, i) => String(i)), value: String(Math.floor(L % 1440 / 60)), suffix: '時' },
                { values: Array.from({ length: 12 }, (_, i) => String(i * 5)), value: String(Math.round(L % 60 / 5) * 5 % 60), suffix: '分' }],
            quick: [{ label: '準時', v: ['0', '0', '0'] }, { label: '15 分', v: ['0', '0', '15'] }, { label: '30 分', v: ['0', '0', '30'] }, { label: '1 小時', v: ['0', '1', '0'] }, { label: '1 天', v: ['1', '0', '0'] }] });
        if (v) { n.todo.lead = Number(v[0]) * 1440 + Number(v[1]) * 60 + Number(v[2]); saveNotif(); }
    }
});

/* --- 叫朋友讀書（房間裡點朋友的頭像） --- */
const POKE_GAP = 10 * 60000;
let pokeLast = lsGet(LS.pokes, {});
if (!pokeLast || typeof pokeLast !== 'object') pokeLast = {};
let pokeFor = null;
function memberWeek(u) {
    const days = u === currentUser?.uid ? recentDays(7) : (profiles[u]?.days || {});
    const mon = mondayOf(new Date()); let sum = 0;
    for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(mon.getDate() + i); sum += days[ymd(d)] || 0; }
    let streak = 0; const d = new Date(); if (!days[ymd(d)]) d.setDate(d.getDate() - 1);
    while (days[ymd(d)] > 0 && streak < 400) { streak++; d.setDate(d.getDate() - 1); }
    return { week: sum, streak };
}
function closePoke() { $('pokePop').hidden = true; pokeFor = null; }
function renderPoke() {
    const u = pokeFor, pop = $('pokePop');
    if (!u) return;
    const seat = document.querySelector(`#tab-room [data-seat="${CSS.escape(u)}"]`);
    if (!seat) { closePoke(); return; }
    const s = statusOf(u), p = profiles[u], me = u === currentUser?.uid, w = memberWeek(u);
    const name = memberName({ u, p });
    const left = pokeLast[u] ? pokeLast[u] + POKE_GAP - Date.now() : 0;
    let btn;
    if (me) btn = '<p class="pk-note">這是你自己</p>';
    else if (s.phase === 'focus' && !s.paused) btn = '<button class="pk-btn done" disabled>他正在讀書中 📖</button>';
    else if (left > 0) btn = `<button class="pk-btn done" disabled>已經叫過了✓（${Math.ceil(left / 60000)} 分鐘後可再試）</button>`;
    else btn = '<button class="pk-btn" data-pk="go">📣 叫他讀書！</button>';
    const sub = s.phase === 'focus' ? `${s.subject != null ? SUBJECTS[s.subject] : ''}${s.paused ? '暫停中' : '專注中'}` : s.phase === 'break' ? '番茄鐘休息中' : s.min > 0 ? '休息中' : '今天還沒開始';
    pop.innerHTML = `<div class="pk-head"><span class="pk-av" style="background:${avColor(u)}">${esc(firstGlyph(name))}</span><div class="pk-who"><b>${esc(name)}${me ? '（你）' : ''}</b><small>${esc(sub)}</small></div></div>
        <div class="pk-stat"><div><b class="num">${fmtClockHM(s.min + (s.phase === 'focus' ? s.el / 60000 : 0))}</b><span>今天</span></div><div><b class="num">${fmtClockHM(w.week)}</b><span>這週</span></div><div><b class="num">${w.streak}<small>天</small></b><span>連續</span></div></div>
        ${btn}${!me && !(s.phase === 'focus' && !s.paused) && left <= 0 ? '<p class="pk-note">他會收到推播・每 10 分鐘可叫一次</p>' : ''}`;
    pop.hidden = false;
    const r = seat.querySelector('.seat-av').getBoundingClientRect();
    const W = pop.offsetWidth, H = pop.offsetHeight, vw = document.documentElement.clientWidth, vh = innerHeight;
    const topBar = (document.querySelector('.topbar')?.getBoundingClientRect().bottom || 60) + 8;
    const bottomBar = matchMedia('(min-width: 900px)').matches ? 12 : 90;   // 手機下面有分頁列
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const below = r.bottom + 10 + H < vh - bottomBar, above = r.top - 10 - H > topBar;
    pop.classList.remove('up', 'side-l', 'side-r');
    if (below || above) {
        // 下面放得下就放下面，不然放上面；箭頭指著頭像
        const x = Math.min(Math.max(cx - W / 2, 12), vw - W - 12);
        pop.style.left = (x + scrollX) + 'px';
        pop.style.top = ((below ? r.bottom + 10 : r.top - H - 10) + scrollY) + 'px';
        pop.style.setProperty('--ax', (cx - x) + 'px');
        pop.classList.toggle('up', !below);
    } else {
        // 橫的手機：上下都放不下，改放在頭像旁邊
        const right = r.right + 12 + W < vw - 8;
        const x = right ? r.right + 12 : Math.max(8, r.left - 12 - W);
        const y = Math.min(Math.max(cy - H / 2, topBar), Math.max(topBar, vh - bottomBar - H));
        pop.style.left = (x + scrollX) + 'px';
        pop.style.top = (y + scrollY) + 'px';
        pop.style.setProperty('--ay', (cy - y) + 'px');
        pop.classList.add(right ? 'side-r' : 'side-l');
    }
}
const fmtClockHM = (min) => { min = Math.round(min); return `${Math.floor(min / 60)}:${pad(min % 60)}`; };
$('tab-room').addEventListener('click', (e) => {
    const seat = e.target.closest('[data-seat]');
    if (!seat) return;
    e.stopPropagation();
    const u = seat.dataset.seat;
    if (pokeFor === u && !$('pokePop').hidden) { closePoke(); return; }
    pokeFor = u; renderPoke();
});
document.addEventListener('click', (e) => { if (pokeFor && !e.target.closest('#pokePop') && !e.target.closest('[data-seat]')) closePoke(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pokeFor) closePoke(); });
window.addEventListener('scroll', () => { if (pokeFor) renderPoke(); }, { passive: true });
window.addEventListener('resize', () => { if (pokeFor) renderPoke(); });
$('pokePop').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-pk="go"]') || !pokeFor || !fb || !currentUser) return;
    const to = pokeFor, room = roomView;
    pokeLast[to] = Date.now(); lsSet(LS.pokes, pokeLast);
    renderPoke();
    try {
        await fb.fs.addDoc(fb.fs.collection(fb.db, 'pokes'), { from: currentUser.uid, to, room, name: myName(), at: Date.now() });
        toast(`已經叫 ${memberName({ u: to, p: profiles[to] })} 去讀書了！`);
    } catch (err) {
        delete pokeLast[to]; lsSet(LS.pokes, pokeLast); renderPoke();
        toast(err.code === 'permission-denied' ? '叫不到他：請確認 Firestore 規則已更新' : '沒送出去，請檢查網路');
    }
});
// 有人叫我讀書：網站開著時直接在畫面上方顯示
let pokeUnsub = null, pokeSince = 0;
const pokeSeen = new Set();
function pokeListen() {
    if (pokeUnsub || !fb || !currentUser) return;
    pokeSince = Date.now() - 5000;
    const { fs, db } = fb;
    pokeUnsub = fs.onSnapshot(fs.query(fs.collection(db, 'pokes'), fs.where('to', '==', currentUser.uid)), (snap) => {
        snap.docChanges().forEach(ch => {
            if (ch.type !== 'added') return;
            const d = ch.doc.data();
            if (pokeSeen.has(ch.doc.id) || !(d.at > pokeSince) || document.visibilityState !== 'visible') return;
            pokeSeen.add(ch.doc.id);
            const r = myRooms.find(x => x.id === d.room);
            showChatNotice({ code: d.room, uid: d.from, name: String(d.name || profiles[d.from]?.name || '同學').slice(0, 20), room: r?.name || '讀書房間', text: '叫你去讀書！📚 點一下開始專注', kind: 'poke', count: 0 });
            device.vibrate([30, 60, 30]);
        });
    }, () => {});
}
function pokeStop() { if (pokeUnsub) { pokeUnsub(); pokeUnsub = null; } }

/* --- 全螢幕聊天室 --- */
function openChat(code) {
    const r = myRooms.find(x => x.id === code);
    if (!r || !fb || !currentUser) return;
    chatRoom = code; lastReadSent = 0; chatReads = {}; lastFit = ''; chatStick = true; chatUserScrollAt = 0;
    if (notice.data?.code === code) hideNotice();
    chatSavedScroll = window.scrollY; window.scrollTo(0, 0);
    if (!chats[code]) chatListen(code);
    $('chatTitle').textContent = r.name;
    renderChatHead();
    $('chatScreen').classList.add('open');
    document.body.classList.add('chat-open');
    fitChat();
    if (readsUnsub) readsUnsub();
    readsUnsub = fb.fs.onSnapshot(fb.fs.collection(fb.db, 'rooms', code, 'reads'), (snap) => {
        snap.docs.forEach(d => { chatReads[d.id] = d.data().at || 0; });
        renderChatList(false);
    }, () => {});
    $('notifyBar').hidden = pushOn() || !!lsGet('study_nb_x', false) || !VAPID_KEY;
    renderChatList(true);
    markChatSeen();
    cleanupOldPhotos(code);
    if (matchMedia('(pointer: fine)').matches) $('chatInput').focus();
}
function closeChat() {
    if (!chatRoom) return;
    if (readsUnsub) readsUnsub();
    readsUnsub = null; chatRoom = null;
    clearReply();
    $('chatInput').blur();
    const el = $('chatScreen');
    el.classList.remove('open', 'kb-open');
    el.style.top = ''; el.style.height = ''; el.style.bottom = '';
    fitTimers.forEach(clearTimeout);
    document.body.classList.remove('chat-open');
    window.scrollTo(0, chatSavedScroll);
    document.title = BASE_TITLE;
    renderRoom(); updateChatBadges();
}
function renderChatHead() {
    const r = myRooms.find(x => x.id === chatRoom);
    if (!r) return;
    const n = (r.members || []).filter(u => statusOf(u).phase === 'focus').length;
    const html = `${(r.members || []).length} 位成員${n ? ` · <span class="live-dot"></span>${n} 人在讀` : ''}`;
    if ($('chatSub').dataset.h !== html) { $('chatSub').dataset.h = html; $('chatSub').innerHTML = html; }
}
// iPhone 鍵盤：聊天室直接對齊「看得到的範圍」（visualViewport 的位置和高度），輸入框貼在鍵盤正上方
// 只有輸入框有焦點時才當作鍵盤打開；一失去焦點就馬上還原，不等系統通知（iOS 有時候收起鍵盤後不會再通知，
// 輸入框就會卡在半空中）。鍵盤動畫期間多量幾次，確保最後的位置是對的。
let fitRaf = 0, lastFit = '', chatSavedScroll = 0, fitTimers = [];
const chatTyping = () => document.activeElement === $('chatInput');
function fitChat() {
    cancelAnimationFrame(fitRaf);
    fitRaf = requestAnimationFrame(() => {
        const vv = window.visualViewport, el = $('chatScreen');
        if (!el.classList.contains('open') || matchMedia('(min-width: 900px)').matches) return;
        const kb = !!vv && chatTyping() && window.innerHeight - vv.height > 80;
        const top = kb ? Math.max(0, Math.round(vv.offsetTop)) : 0;
        const h = kb ? Math.round(vv.height) : 0;
        const key = `${kb},${top},${h}`;
        if (key === lastFit) return;
        lastFit = key;
        const box = $('chatList');
        const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
        el.style.top = kb ? top + 'px' : '';
        el.style.height = kb ? h + 'px' : '';
        el.style.bottom = kb ? 'auto' : '';
        el.classList.toggle('kb-open', kb);
        // 鍵盤收起後，iPhone 有時會讓整頁停在往上捲的位置，把它拉回來
        if (!kb && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0);
        if (atEnd) box.scrollTop = box.scrollHeight;
    });
}
function fitChatSoon() {   // 鍵盤動畫大約 0.3～0.5 秒，這段時間內多量幾次
    fitTimers.forEach(clearTimeout);
    fitTimers = [0, 80, 180, 320, 520, 800].map(t => setTimeout(fitChat, t));
}
window.visualViewport?.addEventListener('resize', fitChat);
window.visualViewport?.addEventListener('scroll', fitChat);
// 打開聊天室時「黏在最新訊息」：訊息晚一點才載入、照片後來才顯示，都會自動捲到最下面；
// 使用者自己往上滑看舊訊息時才放開，滑回底部又會重新黏住
let chatStick = false, chatUserScrollAt = 0;
(function () {
    const box = $('chatList');
    const mark = () => { chatUserScrollAt = Date.now(); };
    box.addEventListener('touchmove', mark, { passive: true });
    box.addEventListener('wheel', mark, { passive: true });
    box.addEventListener('pointerdown', mark, { passive: true });
    box.addEventListener('scroll', () => {
        if (Date.now() - chatUserScrollAt > 900) return;   // 程式自己捲的不算
        chatStick = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    }, { passive: true });
    // 照片載入後高度變了：還黏著的話就再捲到底
    box.addEventListener('load', (e) => { if (e.target.tagName === 'IMG' && chatStick) box.scrollTop = box.scrollHeight; }, true);
    if (window.ResizeObserver) new ResizeObserver(() => { if (chatStick && chatRoom) box.scrollTop = box.scrollHeight; }).observe(box);
})();
function scrollChatEnd(smooth) {
    const box = $('chatList');
    requestAnimationFrame(() => box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
}
// 看到最新訊息：記錄已讀
function markChatSeen() {
    if (!chatVisible()) return;
    const msgs = chats[chatRoom]?.msgs || [];
    if (!msgs.length) return;
    const latest = msgs[msgs.length - 1].at || 0;
    if ((chatSeen[chatRoom] || 0) < latest) { chatSeen[chatRoom] = latest; lsSet(LS.chatSeen, chatSeen); updateChatBadges(); }
    if (latest > lastReadSent && !deletingAccount) {
        lastReadSent = latest;
        fb.fs.setDoc(fb.fs.doc(fb.db, 'rooms', chatRoom, 'reads', currentUser.uid), { at: latest }).catch(() => { lastReadSent = 0; });
    }
}
// 自己傳超過 30 天的照片，打開聊天室時順手刪掉
function cleanupOldPhotos(code) {
    const me = currentUser?.uid, now = Date.now();
    (chats[code]?.msgs || []).filter(m => m.uid === me && m.img && now - m.at > PHOTO_KEEP)
        .forEach(m => fb.fs.deleteDoc(fb.fs.doc(fb.db, 'rooms', code, 'messages', m.id)).catch(() => {}));
}
const chatDayLabel = (t) => {
    const d = new Date(t), ds = ymd(d);
    const y = new Date(); y.setDate(y.getDate() - 1);
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (ds === todayStr()) return '今天 ' + hm;
    if (ds === ymd(y)) return '昨天 ' + hm;
    return `${d.getMonth() + 1}/${d.getDate()} 星期${WEEK_ZH[d.getDay()]} ${hm}`;
};
// 網址變成可以點的連結
const linkify = (t) => esc(t).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
// 照片只接受真的圖片資料（data:image/...;base64,），其他內容一律不顯示、不能儲存
const isPhoto = (v) => typeof v === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v);
const photoExpired = (m) => m.img && Date.now() - m.at > PHOTO_KEEP;
// 表情、回覆
const REACTS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
const canReact = (m) => !m.recalled && !(m.img && (photoExpired(m) || !isPhoto(m.img)));
function reactSummary(m) {   // [{e, n, mine}]，照 REACTS 的順序
    const r = m.reactions && typeof m.reactions === 'object' ? m.reactions : {};
    const me = currentUser?.uid, cnt = {};
    Object.entries(r).forEach(([u, e]) => { if (REACTS.includes(e)) { cnt[e] = cnt[e] || { e, n: 0, mine: false }; cnt[e].n++; if (u === me) cnt[e].mine = true; } });
    return REACTS.map(e => cnt[e]).filter(Boolean);
}
function reactHtml(m) {
    const list = reactSummary(m);
    if (!list.length) return '';
    const total = list.reduce((a, x) => a + x.n, 0);
    return `<button class="msg-reacts ${list.some(x => x.mine) ? 'mine' : ''}" data-reacts="${esc(m.id)}" aria-label="表情 ${list.map(x => x.e + x.n).join(' ')}"><span class="mr-e">${list.map(x => x.e).join('')}</span>${total > 1 ? `<span class="mr-n num">${total}</span>` : ''}</button>`;
}
const REPLY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
function quoteHtml(m) {
    const q = m.replyTo;
    if (!q || typeof q !== 'object' || !q.id) return '';
    const me = currentUser?.uid;
    const sender = m.uid === me ? '你' : esc(m.name || '同學');
    const target = q.uid && q.uid === me ? (m.uid === me ? '自己' : '你') : (q.uid && q.uid === m.uid ? '自己' : esc(q.name || '同學'));
    return `<p class="msg-rlab">${REPLY_SVG}${sender}回覆了${target}</p><button class="msg-quote" data-jump="${esc(q.id)}" aria-label="跳到被回覆的訊息"><span>${q.img ? '照片' : esc(String(q.text || '').slice(0, 80))}</span></button>`;
}
function msgBody(m) {
    const id = esc(m.id);
    if (m.img) return photoExpired(m) || !isPhoto(m.img) ? `<div class="bubble expired" data-mid="${id}">${photoExpired(m) ? '照片已過期' : '照片無法顯示'}</div>` : `<img class="chat-img" src="${m.img}" alt="照片" data-mid="${id}" loading="lazy">`;
    return `<div class="bubble" data-mid="${id}">${linkify(m.text || '')}</div>`;
}
// 依 key 比對：只換掉內容有變的節點（新訊息只會新增一個，不會整串重畫）
const chatCache = new WeakMap();
function patchList(box, items) {
    if (box.firstElementChild?.classList.contains('chat-empty')) box.innerHTML = '';
    const have = new Map([...box.children].map(n => [n.dataset.k, n]));
    const nodes = items.map(([k, html]) => {
        const old = have.get(k);
        if (old && chatCache.get(old) === html) { have.delete(k); return old; }   // 沒變：沿用（照片不用重新解碼）
        const t = document.createElement('template');
        t.innerHTML = html.trim();
        const n = t.content.firstElementChild;
        n.dataset.k = k; chatCache.set(n, html);
        return n;
    });
    have.forEach(n => n.remove());   // 已刪除或內容有變的舊節點
    let cur = box.firstElementChild;
    nodes.forEach(n => { if (n === cur) cur = cur.nextElementSibling; else box.insertBefore(n, cur); });
}
function renderChatList(toEnd) {
    const box = $('chatList');
    if (!box || !chatRoom) return;
    const me = currentUser?.uid;
    const msgs = chats[chatRoom]?.msgs || [];
    const nearEnd = toEnd || chatStick || box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    if (!msgs.length) {
        box.innerHTML = `<div class="chat-empty"><p>還沒有訊息</p><span>跟大家打聲招呼，或約好一起開始下一輪 ✏️</span></div>`;
        return;
    }
    const items = [];   // [key, html]
    let prev = null;
    msgs.forEach(m => {
        if (!prev || m.at - prev.at > 30 * 60000 || ymd(new Date(m.at)) !== ymd(new Date(prev.at))) items.push(['t' + m.id, `<p class="chat-sys">${chatDayLabel(m.at)}</p>`]);
        if (m.recalled) {
            items.push([m.id, `<p class="chat-sys">${m.uid === me ? '你' : esc(m.name || '同學')} 收回了一則訊息</p>`]);
            prev = m; return;
        }
        const mine = m.uid === me;
        const grouped = prev && !prev.recalled && prev.uid === m.uid && m.at - prev.at < 5 * 60000;
        const d = new Date(m.at);
        const tm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        let readN = 0;
        if (mine) Object.entries(chatReads).forEach(([u, at]) => { if (u !== me && at >= m.at) readN++; });
        const meta = `<span class="chat-meta">${mine && readN ? `<span>已讀 ${readN}</span>` : ''}<span class="num">${tm}</span></span>`;
        const quote = quoteHtml(m), reacts = reactHtml(m);
        const mb = `<div class="mb${quote ? ' has-q' : ''}${reacts ? ' has-r' : ''}">${quote}<div class="bw">${msgBody(m)}${reacts}</div></div>`;
        const swipe = '<span class="swipe-reply" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></span>';
        items.push([m.id, mine
            ? `<div class="msg mine ${grouped ? 'grouped' : ''} ${reacts ? 'has-r' : ''}" data-row="${esc(m.id)}">${swipe}<div class="msg-line">${meta}${mb}</div></div>`
            : `<div class="msg them ${grouped ? 'grouped' : ''} ${reacts ? 'has-r' : ''}" data-row="${esc(m.id)}">${swipe}
                ${grouped ? '<span class="chat-av-sp"></span>' : `<span class="chat-av" style="background:${avColor(m.uid)}">${esc(firstGlyph(m.name || '?'))}</span>`}
                <div class="msg-col">${grouped || quoteHtml(m) ? '' : `<p class="chat-who">${esc(m.name || '同學')}</p>`}<div class="msg-line">${mb}${meta}</div></div>
            </div>`]);
        prev = m;
    });
    patchList(box, items);
    if (nearEnd) scrollChatEnd();
}

async function sendChat(text, img) {
    if (!chatRoom || chatSending) return false;
    text = (text || '').trim().slice(0, 1000);
    if (!text && !img) return false;
    chatSending = true;
    try {
        const data = { uid: currentUser.uid, name: myName(), text: img ? '' : text, at: Date.now(), recalled: false };
        if (img) { data.img = img; data.expireAt = new Date(Date.now() + PHOTO_KEEP); }
        if (replyTarget && replyTarget.room === chatRoom) {
            const q = replyTarget.m;
            data.replyTo = { id: q.id, uid: q.uid || '', name: String(q.name || '同學').slice(0, 20), text: q.img ? '' : String(q.text || '').slice(0, 60), img: !!q.img };
        }
        clearReply();
        // 網路慢或暫時離線時，不要卡住輸入框：訊息會先排隊，連上網路就自動送出
        const col = fb.fs.collection(fb.db, 'rooms', chatRoom, 'messages');
        let p = fb.fs.addDoc(col, data);
        // 還沒更新 Firestore 規則時，帶「回覆」的訊息會被擋：改成一般訊息再送一次，不會傳不出去
        if (data.replyTo) p = p.catch(err => {
            if (err.code !== 'permission-denied') throw err;
            toast('回覆功能需要先更新 Firestore 規則，這則先當一般訊息送出');
            const { replyTo, ...plain } = data;
            return fb.fs.addDoc(col, plain);
        });
        const r = await Promise.race([p, new Promise(res => setTimeout(res, 5000, 'slow'))]);
        if (r === 'slow') {
            toast('網路比較慢，訊息會在連上後送出');
            p.catch(err => { console.error('傳送失敗：', err); toast(err.code === 'permission-denied' ? '有一則訊息沒有送出（等太久或被拒絕），請再傳一次' : '有一則訊息沒有送出，請再傳一次'); });
        }
        enableRoom();
        chatStick = true; scrollChatEnd(true);
        return true;
    } catch (e) {
        console.error('傳送失敗：', e);
        toast(e.code === 'permission-denied' ? '傳送被拒絕：請確認 Firestore 規則已更新' : '傳送失敗，請檢查網路');
        return false;
    } finally { chatSending = false; }
}
// 照片先在手機上壓縮（最長邊 1280px、約 250KB 以內）
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const im = new Image();
        im.onload = () => {
            URL.revokeObjectURL(url);
            let max = 1280, q = 0.72, out = '';
            for (let i = 0; i < 6; i++) {
                const k = Math.min(1, max / Math.max(im.width, im.height));
                const c = document.createElement('canvas');
                c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(im, 0, 0, c.width, c.height);
                out = c.toDataURL('image/jpeg', q);
                if (out.length <= 340000) break;
                max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.06);
            }
            out.length <= 380000 ? resolve(out) : reject(new Error('too-big'));
        };
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad-image')); };
        im.src = url;
    });
}
const photosToday = () => { const c = lsGet(LS.photoCount, {}); return c.date === todayStr() ? c.n : 0; };

/* --- 長按訊息：像 IG 一樣浮出訊息卡片＋選單 --- */
let menuMsg = null;
function openMsgPop(id, srcEl) {
    const m = (chats[chatRoom]?.msgs || []).find(x => x.id === id);
    if (!m || m.recalled) return;
    menuMsg = m;
    const mine = m.uid === currentUser?.uid;
    const myR = m.reactions?.[currentUser?.uid];
    $('popReacts').hidden = !canReact(m);
    $('popReacts').innerHTML = REACTS.map(e => `<button class="${e === myR ? 'on' : ''}" data-react="${e}" aria-label="${e}" aria-pressed="${e === myR}">${e}</button>`).join('');
    $('popReply').hidden = !canReact(m);
    const r = myRooms.find(x => x.id === chatRoom);
    const canRecall = mine && Date.now() - m.at < RECALL_MS;
    const d = new Date(m.at);
    $('popMsg').className = 'pop-msg ' + (mine ? 'mine' : 'them');
    $('popMsg').innerHTML = `${mine ? '' : `<p class="chat-who">${esc(m.name || '同學')}</p>`}${msgBody(m)}<span class="pop-time num">${chatDayLabel(m.at)}</span>`;
    $('popCopy').hidden = !m.text;
    $('popSave').hidden = !isPhoto(m.img) || photoExpired(m);
    $('popRecall').hidden = !canRecall;
    $('popDelete').hidden = mine || r?.owner !== currentUser?.uid;
    $('popNote').textContent = mine && !canRecall ? '超過 24 小時的訊息不能收回' : canRecall ? '收回後，大家會看到「你收回了一則訊息」' : '';
    $('msgPop').classList.toggle('mine', mine);
    try { window.getSelection()?.removeAllRanges(); } catch (err) {}
    popDown = false;
    $('msgPop').classList.add('open');
    device.vibrate(12);
}
// 手機、平板：聊天室和訊息選單裡不讓系統選字（長按時會選到時間、名字）
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
[$('chatList'), $('msgPop')].forEach(el => el.addEventListener('selectstart', (e) => { if (!finePointer.matches || el.id === 'chatList') e.preventDefault(); }));
let popDown = false;   // 長按放開手指時的那一下「點擊」會落在選單背景上，不能讓它把選單關掉
$('msgPop').addEventListener('pointerdown', () => { popDown = true; });
function closeMsgPop() { $('msgPop').classList.remove('open'); menuMsg = null; }
$('msgPop').addEventListener('click', async (e) => {
    if (!popDown && e.detail !== 0) return;
    const rb = e.target.closest('[data-react]');
    if (rb && menuMsg) { const m = menuMsg; closeMsgPop(); toggleReact(m, rb.dataset.react); return; }
    const a = e.target.closest('[data-pop]')?.dataset.pop;
    if (!a) { if (!e.target.closest('.pop-menu, .pop-msg, .pop-reacts')) closeMsgPop(); return; }
    if (a === 'reply') { const m = menuMsg; closeMsgPop(); if (m) startReply(m); return; }
    const m = menuMsg; closeMsgPop();
    if (!m) return;
    const ref = fb.fs.doc(fb.db, 'rooms', chatRoom, 'messages', m.id);
    try {
        if (a === 'copy') { await navigator.clipboard.writeText(m.text); toast('已複製'); }
        else if (a === 'save') { if (!isPhoto(m.img)) return; const l = document.createElement('a'); l.href = m.img; l.download = `讀書房間-${ymd(new Date(m.at))}.jpg`; l.click(); }
        else if (a === 'recall') { await fb.fs.updateDoc(ref, { recalled: true, text: '', img: '' }); toast('已收回'); }
        else if (a === 'delete') { if (confirm('確定要刪除這則訊息嗎？')) { await fb.fs.deleteDoc(ref); toast('已刪除'); } }
    } catch (err) { console.error(err); toast(a === 'copy' ? '無法複製' : '操作失敗，請檢查網路'); }
});

/* --- 聊天室操作：傳送、照片、長按、看大圖 --- */
let pressT = null, pressXY = null, pressed = false;
const autoGrow = (t) => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; };
$('chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = $('chatInput');
    const text = inp.value;
    if (!text.trim()) return;
    inp.value = ''; autoGrow(inp);
    const ok = await sendChat(text);
    if (!ok && !inp.value) { inp.value = text; autoGrow(inp); }
});
$('chatInput').addEventListener('input', (e) => autoGrow(e.target));
$('chatInput').addEventListener('keydown', (e) => {
    // 電腦：Enter 傳送、Shift+Enter 換行；手機按鍵盤上的換行
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); $('chatForm').requestSubmit(); }
});
$('chatInput').addEventListener('focus', fitChatSoon);
$('chatInput').addEventListener('blur', () => { lastFit = ''; fitChat(); fitChatSoon(); });
$('chatFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('只能傳圖片'); return; }
    if (photosToday() >= PHOTO_DAILY) { toast(`今天已經傳了 ${PHOTO_DAILY} 張照片，明天再傳`); return; }
    toast('照片處理中…');
    try {
        const img = await compressImage(file);
        if (await sendChat('', img)) lsSet(LS.photoCount, { date: todayStr(), n: photosToday() + 1 });
    } catch (err) { toast(err.message === 'too-big' ? '照片太大了，換一張試試' : '這張照片打不開'); }
});
$('chatBack').addEventListener('click', closeChat);
$('chatMore').addEventListener('click', () => { roomView = chatRoom; openRoomMenu(); });
// v62：聊天室上方的「開啟通知」＝開啟推播（網站沒開也收得到）；這台不能收推播時打開通知設定看原因
$('notifyBtn').addEventListener('click', async () => {
    $('notifyBar').hidden = true;
    if (pushSupport().ok && currentUser) { await enablePush(); return; }
    closeChat(); openNotif();
});
$('notifyClose').addEventListener('click', () => { $('notifyBar').hidden = true; lsSet('study_nb_x', true); });
const chatList = $('chatList');
chatList.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('[data-mid]');
    if (!t) return;
    pressed = false; pressXY = [e.clientX, e.clientY];
    clearTimeout(pressT);
    t.classList.add('pressing');
    pressT = setTimeout(() => { pressed = true; t.classList.remove('pressing'); openMsgPop(t.dataset.mid, t); }, 450);
});
const endPress = () => { clearTimeout(pressT); chatList.querySelectorAll('.pressing').forEach(x => x.classList.remove('pressing')); };
['pointerup', 'pointercancel', 'pointerleave'].forEach(n => chatList.addEventListener(n, endPress));
chatList.addEventListener('pointermove', (e) => { if (pressXY && Math.hypot(e.clientX - pressXY[0], e.clientY - pressXY[1]) > 10) endPress(); });
chatList.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('[data-mid]');
    if (!t) return;
    e.preventDefault(); endPress(); openMsgPop(t.dataset.mid, t);
});
let lastTap = { id: '', at: 0 }, imgTapT = 0;
chatList.addEventListener('click', (e) => {
    if (pressed || swipedAt > Date.now() - 350) { pressed = false; e.preventDefault(); return; }   // 長按、滑動放開，不要觸發點擊
    const rx = e.target.closest('[data-reacts]');
    if (rx) { showReactors(rx.dataset.reacts); return; }
    const jq = e.target.closest('[data-jump]');
    if (jq) { jumpToMsg(jq.dataset.jump); return; }
    const t = e.target.closest('[data-mid]');
    if (!t) return;
    // 連點兩下：愛心
    const now = Date.now();
    if (lastTap.id === t.dataset.mid && now - lastTap.at < 320) {
        lastTap = { id: '', at: 0 }; clearTimeout(imgTapT);
        const m = (chats[chatRoom]?.msgs || []).find(x => x.id === t.dataset.mid);
        if (m && canReact(m)) { if (m.reactions?.[currentUser?.uid] !== '❤️') heartBurst(t); toggleReact(m, '❤️'); }   // 再連點兩下就取消
        return;
    }
    lastTap = { id: t.dataset.mid, at: now };
    const im = e.target.closest('.chat-img');
    if (im && isPhoto(im.getAttribute('src'))) {   // 照片：等一下確定不是連點兩下才打開
        clearTimeout(imgTapT);
        imgTapT = setTimeout(() => { $('imgView').src = im.getAttribute('src'); openModal('imgModal'); }, 330);
    }
});
chatList.addEventListener('dblclick', (e) => { if (e.target.closest('[data-mid]')) e.preventDefault(); });

/* --- 往右滑回覆（手機）：只左右移動，不會跟上下捲動打架 --- */
let swipe = null, swipedAt = 0;
chatList.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const row = e.target.closest('[data-row]');
    if (!row) return;
    swipe = { row, id: row.dataset.row, x: e.clientX, y: e.clientY, dx: 0, lock: null, hit: false };
}, { passive: true });
chatList.addEventListener('pointermove', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (!swipe.lock) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        swipe.lock = Math.abs(dx) > Math.abs(dy) * 1.3 && dx > 0 ? 'x' : 'y';
        if (swipe.lock === 'x') { endPress(); swipe.row.classList.add('swiping'); }
    }
    if (swipe.lock !== 'x') return;
    const d = Math.max(0, Math.min(90, dx * (dx > 60 ? 0.55 : 1) + (dx > 60 ? 27 : 0)));
    swipe.dx = d;
    swipe.row.style.setProperty('--sw', d + 'px');
    const hit = d >= 58;
    if (hit !== swipe.hit) { swipe.hit = hit; swipe.row.classList.toggle('sw-hit', hit); if (hit) device.vibrate(10); }
}, { passive: true });
const endSwipe = () => {
    if (!swipe) return;
    const s = swipe; swipe = null;
    if (s.lock !== 'x') return;
    swipedAt = Date.now();
    s.row.classList.remove('swiping', 'sw-hit');
    s.row.style.removeProperty('--sw');
    if (s.hit) { const m = (chats[chatRoom]?.msgs || []).find(x => x.id === s.id); if (m && canReact(m)) startReply(m); }
};
['pointerup', 'pointercancel'].forEach(n => chatList.addEventListener(n, endSwipe));

/* --- 回覆 --- */
let replyTarget = null;   // { room, m }
function startReply(m) {
    replyTarget = { room: chatRoom, m };
    const mine = m.uid === currentUser?.uid;
    $('replyWho').textContent = `回覆 ${mine ? '自己' : (m.name || '同學')}`;
    $('replyText').textContent = m.img ? '照片' : (m.text || '');
    $('replyBar').hidden = false;
    requestAnimationFrame(() => $('replyBar').classList.add('show'));
    $('chatInput').focus();
    fitChatSoon();
}
function clearReply() {
    replyTarget = null;
    const b = $('replyBar');
    b.classList.remove('show'); b.hidden = true;
}
$('replyX').addEventListener('click', () => { clearReply(); $('chatInput').focus(); });
function jumpToMsg(id) {
    const row = chatList.querySelector(`[data-row="${CSS.escape(id)}"]`);
    if (!row) { toast('這則訊息太舊或已經刪除，找不到了'); return; }
    chatStick = false;
    row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
}

/* --- 表情 --- */
async function toggleReact(m, e) {
    if (!fb || !currentUser || !chatRoom || !REACTS.includes(e)) return;
    const me = currentUser.uid, cur = m.reactions?.[me];
    const ref = fb.fs.doc(fb.db, 'rooms', chatRoom, 'messages', m.id);
    // 先改畫面（不用等網路），失敗再改回來
    const before = m.reactions ? { ...m.reactions } : null;
    m.reactions = { ...(m.reactions || {}) };
    if (cur === e) delete m.reactions[me]; else m.reactions[me] = e;
    renderChatList(false);
    try {
        await fb.fs.updateDoc(ref, { [`reactions.${me}`]: cur === e ? fb.fs.deleteField() : e });
    } catch (err) {
        console.warn('表情失敗：', err);
        m.reactions = before; renderChatList(false);
        toast(err.code === 'permission-denied' ? '按表情需要先更新 Firestore 規則' : '表情沒有送出，請檢查網路');
    }
}
function heartBurst(el) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect(), h = document.createElement('span');
    h.className = 'heart-burst'; h.textContent = '❤️';
    h.style.left = (r.left + r.width / 2) + 'px'; h.style.top = (r.top + r.height / 2) + 'px';
    document.body.appendChild(h);
    device.vibrate(12);
    setTimeout(() => h.remove(), 800);
}
function showReactors(id) {
    const m = (chats[chatRoom]?.msgs || []).find(x => x.id === id);
    if (!m?.reactions) return;
    const me = currentUser?.uid, by = {};
    Object.entries(m.reactions).forEach(([u, e]) => {
        if (!REACTS.includes(e)) return;
        const name = u === me ? '你' : (profiles[u]?.name || '同學');
        (by[e] = by[e] || []).push(name);
    });
    const txt = REACTS.filter(e => by[e]).map(e => `${by[e].join('、')} 按了 ${e}`).join('，');
    if (txt) toast(txt);
}
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('msgPop').classList.contains('open')) { e.stopImmediatePropagation(); closeMsgPop(); }
    else if (chatRoom && !document.querySelector('.modal.open')) { e.stopImmediatePropagation(); closeChat(); }
}, true);
onAppShow(() => { document.title = BASE_TITLE; if (chatRoom) { renderChatList(false); markChatSeen(); } });

// 每秒更新房間裡的時鐘（不重畫整頁）
function roomTick() {
    if (chatRoom) renderChatHead();
    if (document.body.dataset.tab !== 'tab-room' || !roomView) return;
    const now = Date.now();
    document.querySelectorAll('#tab-room [data-clock]').forEach(n => {
        const st = statusOf(n.dataset.clock, now);
        const txt = memberClock(st);
        if (n.textContent === txt) return;   // 沒變就不碰畫面
        n.textContent = txt;
        $('tab-room')._html = null;          // 時鐘是直接改畫面的，下次整頁重畫要重新比對
        const bar = n.parentElement.querySelector('.st-bar');
        if (bar) bar.setAttribute('stroke-dashoffset', (SEAT_C * (1 - seatFrac(st))).toFixed(1));
    });
}

function openRoomModal(mode) {
    roomModalMode = mode;
    const r = myRooms.find(x => x.id === roomView);
    $('roomModalTitle').textContent = mode === 'rename' ? '房間名稱' : '建立新房間';
    $('roomNameInput').value = mode === 'rename' ? (r?.name || '') : '';
    $('saveRoomBtn').textContent = mode === 'rename' ? '儲存' : '建立';
    openModal('roomModal');
    setTimeout(() => { if ($('roomModal').classList.contains('open')) $('roomNameInput').focus(); }, 120);
}
let roomModalMode = 'create';
$('saveRoomBtn').addEventListener('click', async () => {
    const name = $('roomNameInput').value.trim().slice(0, 30);
    if (!name) { toast('取個房間名稱吧'); return; }
    closeModal('roomModal');
    try {
        if (roomModalMode === 'rename') {
            await fb.fs.updateDoc(fb.fs.doc(fb.db, 'rooms', roomView), { name });
            toast('已改名');
        } else {
            const code = await createRoom(name);
            roomView = pendingRoom = code;
            renderRoom();
            toast(`房間建立好了，邀請碼 ${code}`);
        }
    } catch (e) {
        console.error(e);
        toast(e.code === 'permission-denied' ? '被拒絕：請確認 Firestore 規則已更新' : '失敗了，請檢查網路');
    }
});
onEnter($('roomNameInput'), () => $('saveRoomBtn').click());

$('tab-room').addEventListener('click', (e) => {
    const ch = e.target.closest('[data-chat]');
    if (ch) { openChat(ch.dataset.chat); return; }
    const open = e.target.closest('[data-open]');
    if (open) { roomView = open.dataset.open; renderRoom(); window.scrollTo({ top: 0 }); return; }
    const act = e.target.closest('[data-room]')?.dataset.room;
    if (act === 'login') openModal('accountModal');
    else if (act === 'join') joinRoom(codeDraft);
    else if (act === 'create') openRoomModal('create');
    else if (act === 'share') shareRoom(roomView);
    else if (act === 'focus') { focusMin = false; showTab('tab-timer'); }
});
$('tab-room').addEventListener('keydown', (e) => {
    if (e.target.id === 'roomCodeInput' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); joinRoom(codeDraft); }
});
$('tab-room').addEventListener('input', (e) => {
    if (e.target.id === 'roomCodeInput') {
        e.target.value = codeDraft = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        $('codeBoxes').innerHTML = codeBoxes(codeDraft); $('tab-room')._html = null;
    }
});
// 我的暱稱、隱身模式（房間列表右上角）
let meColorDraft = '';
function renderMeColors() {
    const g = esc(firstGlyph($('meName').value.trim() || myName()));
    $('meColors').innerHTML = `<button class="me-color auto ${!meColorDraft ? 'active' : ''}" data-color="" aria-label="自動" aria-pressed="${!meColorDraft}">自動</button>` +
        AV_COLORS.map(c => `<button class="me-color ${meColorDraft === c ? 'active' : ''}" data-color="${c}" style="background:${c}" aria-label="頭像顏色" aria-pressed="${meColorDraft === c}">${g}</button>`).join('');
    const pv = $('mePreviewAv');
    pv.textContent = firstGlyph($('meName').value.trim() || myName());
    pv.style.background = meColorDraft || (() => { let h = 0; for (const c of String(currentUser?.uid || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `var(--s${h % 5})`; })();
    $('mePreviewName').textContent = $('meName').value.trim() || myName();
}
function openMeModal() {
    $('meName').value = myName();
    $('meHidden').checked = !!roomPref.hidden;
    meColorDraft = AV_COLORS.includes(roomPref.color) ? roomPref.color : '';
    renderMeColors();
    openModal('meModal');
}
$('meColors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    meColorDraft = b.dataset.color; renderMeColors();
});
$('meName').addEventListener('input', renderMeColors);
$('saveMeBtn').addEventListener('click', () => {
    const v = $('meName').value.trim().slice(0, 20);
    const hid = $('meHidden').checked;
    const changedHidden = hid !== !!roomPref.hidden;
    const changedColor = meColorDraft !== (roomPref.color || '');
    roomPref.name = v; roomPref.hidden = hid; roomPref.color = meColorDraft; saveRoomPref();
    savePrefs();   // v62：暱稱跟著帳號同步
    closeModal('meModal');
    publishProfile();
    renderRoom();
    toast(changedHidden ? (hid ? '已開啟隱身模式' : '已關閉隱身模式') : changedColor ? '已更新頭像顏色' : '已更新暱稱');
});
onEnter($('meName'), () => $('saveMeBtn').click());
// 房間內右上角「⋯」
function openRoomMenu() {
    const r = myRooms.find(x => x.id === roomView);
    if (!r) return;
    $('rmTitle').textContent = r.name;
    $('rmRename').style.display = r.owner === currentUser?.uid ? '' : 'none';
    openModal('roomMenuModal');
}
$('roomMenuModal').addEventListener('click', (e) => {
    const a = e.target.closest('[data-rm]')?.dataset.rm;
    if (!a) return;
    closeModal('roomMenuModal');
    if (a === 'share') shareRoom(roomView);
    else if (a === 'rename') openRoomModal('rename');
    else if (a === 'leave') leaveRoom(roomView);
});

// 登入後：讀回自己的房間設定（換裝置也能用）
async function loadRoomProfile(user) {
    try {
        const snap = await fb.fs.getDoc(fb.fs.doc(fb.db, 'profiles', user.uid));
        if (snap.exists()) {
            const p = snap.data();
            if (!profiles[user.uid]) profiles[user.uid] = p;   // 先知道雲端上自己的狀態（別台裝置可能正在讀），才不會被這台蓋掉
            roomPref = { ...roomPref, enabled: true, name: roomPref.name || String(p.name || '').slice(0, 20), hidden: roomPref.hidden ?? !!p.hidden, color: roomPref.color || (AV_COLORS.includes(p.color) ? p.color : '') };
            saveRoomPref();
        }
    } catch (e) { /* 離線或規則還沒設定 */ }
    publishProfile(true);
    // 登入後一律監聽自己的房間：只要在任何房間裡，就會自動把讀書狀態分享出去
    // （iPhone 的 Safari 和主畫面 App 資料是分開的，不能只靠這台裝置的記錄判斷）
    roomStart();
    if (document.body.dataset.tab === 'tab-room') renderRoom();
}

/* =====================================================
 * 10. 加到主畫面教學（第一次打開時）
 * ===================================================== */
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = () => isIOS() || /Android/i.test(navigator.userAgent);
let installOS = isIOS() ? 'ios' : 'android';
function renderInstall() {
    document.querySelectorAll('#installModal [data-os]').forEach(b => {
        const on = b.dataset.os === installOS;
        b.classList.toggle('active', on); b.setAttribute('aria-selected', on);
    });
    $('installIOS').hidden = installOS !== 'ios';
    $('installAndroid').hidden = installOS !== 'android';
}
let tourAfterInstall = false;
function openInstall(chain) { tourAfterInstall = !!chain; renderInstall(); openModal('installModal'); }
$('installModal').addEventListener('click', (e) => {
    const os = e.target.closest('[data-os]');
    if (os) { installOS = os.dataset.os; renderInstall(); return; }
    if (e.target.closest('[data-install-done]')) {
        lsSet(LS.install, '1'); closeModal('installModal');
        if (tourAfterInstall) { tourAfterInstall = false; setTimeout(openTour, 260); }   // 接著顯示簡易導覽
    }
});

/* --- v56：隱私權政策：在 App 裡從右邊滑進來，返回時滑出去（不離開 App，不會重新載入） --- */
const privacyKey = () => { try { return `${document.documentElement.getAttribute('data-theme')}|${localStorage.getItem(LS.accent) || ''}`; } catch (e) { return ''; } };
let privacyLoadedKey = '';
function preloadPrivacy() {
    const f = $('privacyFrame');
    if (!f) return;
    const k = privacyKey();
    if (f.getAttribute('src') && privacyLoadedKey === k) return;   // 已經載好，而且深淺色、主題色沒變
    privacyLoadedKey = k;
    $('privacyLoad').hidden = false;
    f.classList.remove('ready');
    f.setAttribute('src', 'privacy.html?embed=1');
}
$('privacyFrame').addEventListener('load', () => { $('privacyLoad').hidden = true; $('privacyFrame').classList.add('ready'); });
let privacyCloseT = 0;
function openPrivacy() {
    preloadPrivacy();
    clearTimeout(privacyCloseT);
    const el = $('privacyScreen');
    el.hidden = false;
    try { $('privacyFrame').contentWindow?.scrollTo(0, 0); } catch (e) {}
    document.body.classList.add('privacy-open');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
    setTimeout(() => $('privacyBack').focus({ preventScroll: true }), 300);
}
function closePrivacy() {
    const el = $('privacyScreen');
    if (el.hidden) return;
    el.classList.remove('open');
    document.body.classList.remove('privacy-open');
    privacyCloseT = setTimeout(() => { el.hidden = true; }, 300);
}
$('privacyRow').addEventListener('click', (e) => { e.preventDefault(); openPrivacy(); });
$('privacyBack').addEventListener('click', closePrivacy);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('privacyScreen').hidden) { e.stopImmediatePropagation(); closePrivacy(); } }, true);

/* --- 簡易導覽（第一次打開）與完整網站導覽 --- */
function openTour() { lsSet(LS.tour, '1'); openModal('tourModal'); }
$('tourFull').addEventListener('click', () => { closeModal('tourModal'); openGuide(); });
let guideSavedScroll = 0;
function openGuide(sectionId) {
    guideSavedScroll = window.scrollY;
    $('guideScreen').classList.add('open');
    document.body.classList.add('guide-open');
    $('guideBody').scrollTop = 0;
    if (sectionId) requestAnimationFrame(() => $(sectionId)?.scrollIntoView());
}
function closeGuide() {
    if (!$('guideScreen').classList.contains('open')) return;
    $('guideScreen').classList.remove('open');
    document.body.classList.remove('guide-open');
    window.scrollTo(0, guideSavedScroll);
}
$('guideBack').addEventListener('click', closeGuide);
$('guideDone').addEventListener('click', closeGuide);
// 目錄：在導覽頁裡面捲動，不改網址
$('guideScreen').addEventListener('click', (e) => {
    const a = e.target.closest('.guide-toc a');
    if (!a) return;
    e.preventDefault();
    const t = document.querySelector(a.getAttribute('href'));
    if (!t) return;
    // 看不到的段落平常先不畫（高度只是估計值），要跳過去前先全部排好，才算得出正確位置
    const gb = $('guideBody'), toc = gb.querySelector('.guide-toc');
    gb.classList.add('g-full');
    requestAnimationFrame(() => {
        // 用畫面上的實際位置算（offsetTop 是相對外框算的，會停錯地方），停在固定的目錄下面
        const top = gb.scrollTop + t.getBoundingClientRect().top - gb.getBoundingClientRect().top - (toc ? toc.offsetHeight : 58) - 8;
        gb.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('guideScreen').classList.contains('open') && !document.querySelector('.modal.open')) { e.stopImmediatePropagation(); closeGuide(); }
}, true);
// 第一次打開：手機瀏覽器先教「加到主畫面」（一定要按我知道了），接著簡易導覽；其他情況只顯示簡易導覽
// v60：用過舊版的人，更新後第一次打開會看到「這次新增了什麼」（第一次用的人看簡易導覽就好，不會連跳兩個視窗）
const WHATS_NEW = 'v64';   // 有新功能想介紹時才改這個（跟 APP_VERSION 分開，小修正不會跳）
setTimeout(() => {
    if (document.querySelector('.modal.open') || document.body.classList.contains('guide-open')) return;
    const needInstall = !localStorage.getItem(LS.install) && !isStandalone() && isMobile();
    const needTour = !localStorage.getItem(LS.tour);
    if (needInstall || needTour) lsSet(LS.seenVer, WHATS_NEW);
    if (needInstall) openInstall(needTour);
    else if (needTour) openTour();
    else if (localStorage.getItem(LS.seenVer) !== WHATS_NEW) { lsSet(LS.seenVer, WHATS_NEW); openModal('whatsNewModal'); }
}, 1200);
$('wnTry').addEventListener('click', () => { closeModal('whatsNewModal'); setTimeout(openNotif, 150); });

/* =====================================================
 * 帳號畫面
 * ===================================================== */
const ACCENT_NAME = { amber: '琥珀', mint: '薄荷', violet: '霧紫', sakura: '櫻花', ocean: '海藍', coral: '珊瑚', matcha: '抹茶', moon: '月光銀' };
function renderAccount(statusText) {
    const u = currentUser;
    $('avatarImg').src = u?.photoURL || defaultAvatar();
    $('accountAvatar').src = u?.photoURL || defaultAvatar();
    $('accountName').textContent = u ? (u.displayName || '已登入') : '未登入';
    $('accountEmail').textContent = u ? (u.email || '') : '';
    const status = statusText || (u ? '雲端同步已開啟' : (fb ? '資料只存在這台裝置' : '離線中，資料只存在這台裝置'));
    $('accountStatus').textContent = status;
    $('syncDot').className = 'sync-dot ' + (u && !statusText ? 'ok' : /失敗|離線/.test(status) ? 'bad' : u ? 'wait' : '');
    $('accountHint').style.display = u ? 'none' : '';
    $('accentName').textContent = ACCENT_NAME[localStorage.getItem(LS.accent) || 'amber'] || '琥珀';
    $('installState').textContent = isStandalone() ? '已加入 ✓' : '教學';
    $('loginBtn').textContent = u ? '登出' : '使用 Google 登入';
    $('delAcctBtn').hidden = !u;
    $('loginBtn').classList.toggle('btn-accent', !u);
    $('loginBtn').classList.toggle('btn-logout', !!u);
}
$('accountBtn').addEventListener('click', () => { $('installState').textContent = isStandalone() ? '已加入 ✓' : '教學'; closeFolds(); openModal('accountModal'); warmLogin(); });
$('guideRow').addEventListener('click', () => { closeModal('accountModal'); openGuide(); });
$('installRow').addEventListener('click', () => { closeModal('accountModal'); openInstall(false); });

// 禁止雙指縮放（iOS Safari 不吃 viewport 設定，要另外擋）
['gesturestart', 'gesturechange', 'gestureend'].forEach(t =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
// （不再監聽 touchmove：非 passive 的 touchmove 會讓每次捲動都要等程式，手機會卡；縮放改用 CSS touch-action 擋）
// 電腦上擋掉 Ctrl/⌘ + 滾輪、觸控板縮放
document.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
});

// iPhone 加到主畫面的 App：收起鍵盤或從背景回來後，固定在底部的選單列偶爾會「浮在半空中」
// （系統還在用鍵盤打開時的畫面高度）。這些時機輕推一下捲動位置，讓系統重新計算。
function nudgeViewport() {
    if (isTyping(document.activeElement)) return;
    const y = window.scrollY;
    window.scrollTo(0, y + 1); window.scrollTo(0, y);
    const tb = document.querySelector('.tabbar');
    // 讓 iPhone 重新計算固定在底部的選單列（先拿掉再放回來，畫面上看不出來）
    if (tb) { tb.style.display = 'none'; void tb.offsetHeight; tb.style.display = ''; }
}
const nudgeSoon = () => [60, 350, 700].forEach(t => setTimeout(nudgeViewport, t));
document.addEventListener('focusout', (e) => { if (isTyping(e.target)) nudgeSoon(); });
window.addEventListener('pageshow', nudgeSoon);
window.addEventListener('orientationchange', nudgeSoon);
onAppShow(nudgeSoon);
window.visualViewport?.addEventListener('resize', () => { if (!isTyping(document.activeElement)) nudgeSoon(); });

/* =====================================================
 * 自動更新：切回 App 時檢查有沒有新版本，有的話不跳訊息、找適當的時機悄悄套用
 *   - App 在背景時：直接重新載入（使用者看不到）
 *   - 剛切回來、沒在打字或操作視窗：馬上重新載入，回到原本的分頁
 *   - 正在打字、聊天、AI 產生中：先不動，等下次離開 App 或閒下來再更新
 * ===================================================== */
let updateReady = false, lastUpdateCheck = 0;
function checkForUpdate() {
    if (!navigator.serviceWorker?.getRegistration || !navigator.onLine) return;
    if (Date.now() - lastUpdateCheck < 30000) return;   // 30 秒內不重複檢查
    lastUpdateCheck = Date.now();
    navigator.serviceWorker.getRegistration().then(reg => reg && reg.update()).catch(() => {});
}
function appBusy() {
    const a = document.activeElement;
    if (isTyping(a) && a.type !== 'checkbox') return true;
    if (document.querySelector('.modal.open') || $('guideScreen').classList.contains('open')) return true;
    if (chatRoom && ($('chatInput').value.trim() || chatTyping())) return true;
    if (typeof aiBusy !== 'undefined' && aiBusy) return true;
    // 頁面上有打到一半還沒送出的文字（待辦、聊天、新增單元…），也先不要重整
    return [...document.querySelectorAll('input[type="text"], input:not([type]), textarea')]
        .some(el => el.value.trim() && !el.closest('.modal') && el.getClientRects().length);
}
function applyUpdate() {
    if (!updateReady) return;
    if (!document.hidden && appBusy()) return;   // 使用中先不打擾
    try {
        sessionStorage.setItem('study_resume', JSON.stringify({ tab: document.body.dataset.tab, room: roomView || null, chat: chatRoom || null, y: window.scrollY }));
    } catch (e) {}
    updateReady = false;
    if (currentUser || cachedUid) writeCloudCache();   // 重新載入前，還沒送出的修改先存好
    location.reload();
}
if (navigator.serviceWorker) {
    // 新版的 Service Worker 接手了＝有新檔案可以用
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) { hadController = true; return; }   // 第一次安裝不用重整
        updateReady = true;
        applyUpdate();
    });
    onAppShow(checkForUpdate);
    onAppHide(applyUpdate);   // 離開 App 時悄悄更新
    window.addEventListener('focus', checkForUpdate);
    // 閒下來（關掉視窗、離開輸入框）時，再看看有沒有等著套用的更新
    document.addEventListener('focusout', () => setTimeout(applyUpdate, 400));
    setInterval(() => { if (updateReady) applyUpdate(); else if (!document.hidden) checkForUpdate(); }, 5 * 60000);
}
// 更新後回到原本的地方（分頁、房間、聊天室、捲動位置）
function resumeAfterUpdate() {
    let r = null;
    try { r = JSON.parse(sessionStorage.getItem('study_resume') || 'null'); sessionStorage.removeItem('study_resume'); } catch (e) {}
    if (!r) return false;
    if (r.tab) showTab(r.tab);
    if (r.room) { roomView = r.room; if (r.tab === 'tab-room') renderRoom(); }
    if (r.chat) setTimeout(() => { if (myRooms.some(x => x.id === r.chat)) openChat(r.chat); }, 1500);
    if (r.y) setTimeout(() => window.scrollTo(0, r.y), 60);
    return !!r.tab;
}

// 往下捲動時頂部列才出現底色
const topbar = document.querySelector('.topbar');
const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 4);
window.addEventListener('scroll', onScroll, { passive: true });
requestAnimationFrame(onScroll);   // 等第一次畫面排好再讀捲動位置，不要卡住開啟

/* =====================================================
 * 拖曳排序（我的倒數、編輯首頁共用）：按住右邊的 ☰ 上下拖，放開就排好；鍵盤也可以用上下鍵
 * ===================================================== */
function makeSortable(list, onMove) {
    // iPhone：按住把手時不要變成選取文字或捲動整個視窗
    list.addEventListener('touchstart', (e) => { if (e.target.closest('.drag-h')) e.preventDefault(); }, { passive: false });
    list.addEventListener('selectstart', (e) => { if (list.classList.contains('sorting')) e.preventDefault(); });
    list.addEventListener('pointerdown', (e) => {
        const h = e.target.closest('.drag-h');
        if (!h || !list.contains(h)) return;
        const row = h.closest('[data-sort]');
        if (!row) return;
        e.preventDefault();
        const rows = [...list.querySelectorAll('[data-sort]')];
        const from = rows.indexOf(row);
        const rects = rows.map(r => r.getBoundingClientRect());
        const startY = e.clientY, hgt = rects[from].height;
        let to = from;
        row.classList.add('dragging');
        list.classList.add('sorting');
        document.body.classList.add('sorting');
        try { window.getSelection()?.removeAllRanges(); } catch (err) {}
        try { h.setPointerCapture(e.pointerId); } catch (err) {}
        const move = (ev) => {
            const dy = Math.max(rects[0].top - rects[from].top, Math.min(rects[rects.length - 1].top - rects[from].top, ev.clientY - startY));
            row.style.transform = `translate3d(0, ${dy}px, 0)`;
            const center = rects[from].top + hgt / 2 + dy;
            to = from;
            rects.forEach((r, i) => { const mid = r.top + r.height / 2; if (i < from && center <= mid) to = Math.min(to, i); if (i > from && center >= mid) to = Math.max(to, i); });
            rows.forEach((r, i) => {
                if (r === row) return;
                const sh = from < to && i > from && i <= to ? -hgt : to < from && i >= to && i < from ? hgt : 0;
                r.style.transform = sh ? `translate3d(0, ${sh}px, 0)` : '';
            });
        };
        const up = () => {
            h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
            list.classList.remove('sorting');
            document.body.classList.remove('sorting');
            try { window.getSelection()?.removeAllRanges(); } catch (err) {}
            rows.forEach(r => { r.style.transform = ''; });
            row.classList.remove('dragging');
            if (to !== from) { onMove(from, to); device.vibrate(8); }
        };
        h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
    list.addEventListener('keydown', (e) => {
        const h = e.target.closest('.drag-h');
        if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        const rows = [...list.querySelectorAll('[data-sort]')];
        const from = rows.indexOf(h.closest('[data-sort]')), to = from + (e.key === 'ArrowUp' ? -1 : 1);
        if (from < 0 || to < 0 || to >= rows.length) return;
        e.preventDefault();
        onMove(from, to);
        list.querySelectorAll('[data-sort]')[to]?.querySelector('.drag-h')?.focus();
    });
}
const moveItem = (arr, from, to) => { const a = arr.slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };
const ICON_HANDLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
const ICON_CHECK_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* =====================================================
 * 我的倒數：釘選到倒數頁上方（最多 4 個）、排順序、新增／修改自己的倒數
 * ===================================================== */
function cdRelText(c) {
    const d = daysBetween(todayStr(), c.date);
    if (cdEnded(c)) return '已結束';
    if (d <= 0) return c.end ? '進行中' : '今天';
    return d === 1 ? '明天' : `${d} 天後`;
}
function renderCdManage() {
    const pins = cdPins(), all = cdAll();
    const rest = all.filter(c => !pins.includes(c.key)).sort((a, b) => (cdEnded(a) - cdEnded(b)) || a.date.localeCompare(b.date));
    const row = (c, pinned) => {
        const d = parseYmd(c.date);
        const tags = (c.key === CD_FIXED ? '<em class="cdm-tag">固定</em>' : c.builtin ? '<em class="cdm-tag">內建</em>' : '') + (c.yearly ? '<em class="cdm-tag yr">每年</em>' : '') + (cdEnded(c) ? '<em class="cdm-tag">已結束</em>' : '');
        const fixed = c.key === CD_FIXED;
        return `<li class="cdm-row ${cdEnded(c) ? 'ended' : ''} ${c.key === examKey ? 'cur' : ''} ${fixed ? 'fixed' : ''}" ${pinned && !fixed ? `data-sort="${esc(c.key)}"` : ''}>
            ${fixed ? `<span class="cdm-pin on lock" title="學測固定在上方" aria-label="學測固定在上方">${ICON_CHECK_SM}</span>` : `<button class="cdm-pin ${pinned ? 'on' : ''}" data-cdpin="${esc(c.key)}" aria-pressed="${pinned}" aria-label="${pinned ? '從上方移除' : '放到倒數頁上方'}">${ICON_CHECK_SM}</button>`}
            <button class="cdm-main" data-cdpick="${esc(c.key)}">
                <span class="cdm-name"><i class="cd-dot" style="background:${c.color || 'var(--accent)'}"></i><b>${esc(c.name)}</b>${tags}</span>
                <span class="cdm-sub num">${d.getMonth() + 1}/${d.getDate()}${c.end ? ` – ${shortDate(c.end)}` : ''}${cdEnded(c) ? '' : ` · ${cdRelText(c)}`}</span>
            </button>
            ${c.builtin ? '' : `<button class="cdm-edit" data-cdedit="${esc(c.key)}" aria-label="修改 ${esc(c.name)}">${ICON_PEN}</button>`}
            ${pinned && !fixed ? `<button class="drag-h" aria-label="拖曳排序（也可以用上下鍵）">${ICON_HANDLE}</button>` : fixed ? '<span class="drag-sp cdm-lock" title="固定在最右邊"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>' : '<span class="drag-sp"></span>'}
        </li>`;
    };
    $('cdmPinned').innerHTML = pins.map(k => all.find(c => c.key === k)).filter(Boolean).map(c => row(c, true)).join('') || '<li class="empty">還沒有放任何倒數，勾選下面的就會出現在上方</li>';
    $('cdmRest').innerHTML = rest.map(c => row(c, false)).join('') || '<li class="empty">全部都放在上方了</li>';
    $('cdmRestHead').hidden = !rest.length && !all.length;
    $('cdmCount').textContent = `${pins.length} / ${CD_MAX}`;
}
function openCdManage() { renderCdManage(); openModal('cdModal'); }
function setPins(p, off) {
    p = p.filter(k => k !== CD_FIXED).slice(0, CD_MAX - 1);   // 學測不用存，永遠固定在最右邊
    state.countdowns = { ...state.countdowns, pins: p, off: off || state.countdowns.off || [] };
    save(); renderExamChips(); renderCdManage();
}
makeSortable($('cdmPinned'), (from, to) => setPins(moveItem(cdPins().filter(k => k !== CD_FIXED), from, to)));
$('cdModal').addEventListener('click', (e) => {
    const pin = e.target.closest('[data-cdpin]');
    if (pin) {
        const k = pin.dataset.cdpin, pins = cdPins(), off = (state.countdowns.off || []).filter(x => x !== k);
        const c = getCd(k);
        if (pins.includes(k)) setPins(pins.filter(x => x !== k), [...off, k]);   // 取消：記住，之後不會自動補回來
        else if (c && cdEnded(c)) toast('這個已經結束了，不能放到上方');
        else if (pins.length >= CD_MAX) toast(`上方最多放 ${CD_MAX} 個（含學測），先取消一個`);
        else setPins([...pins, k], off);
        return;
    }
    const pick = e.target.closest('[data-cdpick]');
    if (pick) { closeModal('cdModal'); cdPicked = true; selectCd(pick.dataset.cdpick); return; }
    const ed = e.target.closest('[data-cdedit]');
    if (ed) { openCdEdit(ed.dataset.cdedit); return; }
    if (e.target.closest('#cdmAdd')) openCdEdit(null);
});

let cdEditing = null, cdColor = CD_COLORS[0];
function openCdEdit(id) {
    const c = id ? state.countdowns.items.find(x => x.id === id) : null;
    if (id && !c) return;
    cdEditing = id;
    $('cdeTitle').textContent = c ? '修改倒數' : '新增倒數';
    $('cdeName').value = c ? c.name : '';
    $('cdeShort').value = c ? c.short : '';
    $('cdeDate').value = c ? c.date : '';
    $('cdeEnd').value = c?.end || '';
    $('cdeYearly').checked = !!c?.yearly;
    $('cdeCal').checked = c ? c.cal : true;
    cdColor = c ? c.color : CD_COLORS[state.countdowns.items.length % CD_COLORS.length];
    $('cdeDelete').hidden = !c;
    renderCdColors(); syncCdYearly();
    openModal('cdEditModal');
    if (!c) setTimeout(() => $('cdeName').focus(), 260);
}
function renderCdColors() {
    $('cdeColors').innerHTML = CD_COLORS.map(col => `<button class="cde-color ${col === cdColor ? 'on' : ''}" data-col="${col}" style="--c:${col}" aria-label="顏色" aria-pressed="${col === cdColor}"></button>`).join('');
}
function syncCdYearly() { const y = $('cdeYearly').checked; $('cdeEnd').disabled = y; $('cdeEndWrap').classList.toggle('off', y); if (y) $('cdeEnd').value = ''; }
$('cdeColors').addEventListener('click', (e) => { const b = e.target.closest('[data-col]'); if (b) { cdColor = b.dataset.col; renderCdColors(); } });
$('cdeYearly').addEventListener('change', syncCdYearly);
$('cdeName').addEventListener('input', () => { $('cdeShort').placeholder = ($('cdeName').value.trim() || '例如：段考').slice(0, 4); });
function saveCdEdit() {
    const name = $('cdeName').value.trim();
    const date = $('cdeDate').value, yearly = $('cdeYearly').checked;
    const end = yearly ? '' : $('cdeEnd').value;
    if (!name) { toast('請輸入名稱'); $('cdeName').focus(); return; }
    if (!isYmd(date)) { toast('請選擇日期'); return; }
    if (end && end < date) { toast('結束日期要在開始日期之後'); return; }
    const item = { id: cdEditing || 'c_' + uid(), name: name.slice(0, 30), short: ($('cdeShort').value.trim() || name).slice(0, 4), date, ...(end && end > date ? { end } : {}), color: cdColor, yearly, cal: $('cdeCal').checked };
    const items = state.countdowns.items.slice();
    let pins = cdPins().filter(k => k !== CD_FIXED);
    if (cdEditing) items[items.findIndex(x => x.id === cdEditing)] = item;
    else {
        items.push(item);
        if (pins.length < CD_MAX - 1) pins = [...pins, item.id];   // 上方滿了就只放在「⋯」裡
    }
    state.countdowns = { items, pins, off: (state.countdowns.off || []).filter(k => k !== item.id) };
    save();
    closeModal('cdEditModal');
    renderCalendar();
    if ($('cdModal').classList.contains('open')) renderCdManage();
    // 有放到上方才直接切過去；上方滿了就留在原本看的那個，新的收在「⋯」裡（不會卡在「⋯」）
    if (pins.includes(item.id)) { cdPicked = false; selectCd(item.id); }
    else { renderExamChips(); tick(); }
    if (!cdEditing && !pins.includes(item.id)) toast(`已新增「${item.name}」，上方滿了，收在「⋯」裡`);
    else toast(cdEditing ? '已更新' : `已新增「${item.name}」`);
}
$('cdeSave').addEventListener('click', saveCdEdit);
onEnter($('cdeName'), saveCdEdit);
$('cdeDelete').addEventListener('click', () => {
    const c = state.countdowns.items.find(x => x.id === cdEditing);
    if (!c) return;
    const before = state.countdowns;
    state.countdowns = { items: before.items.filter(x => x.id !== c.id), pins: before.pins ? before.pins.filter(k => k !== c.id) : null, off: (before.off || []).filter(k => k !== c.id) };
    save(); closeModal('cdEditModal');
    if (examKey === c.id) selectCd(cdPins()[0] || CD_FIXED); else renderExamChips();
    renderCalendar();
    if ($('cdModal').classList.contains('open')) renderCdManage();
    toast(`已刪除「${c.name}」`, { label: '復原', fn: () => { state.countdowns = before; save(); renderExamChips(); renderCalendar(); if ($('cdModal').classList.contains('open')) renderCdManage(); } });
});

/* =====================================================
 * v60 課表（行事曆分頁上方切換「行事曆／課表」）
 *   資料：{ periods: [{ s: '08:10', e: '09:00' }, …], cells: { '星期-節': { n, n2, c, note } }, anchor: 單週的星期一 }
 *   跟著帳號同步（放在 prefs.tt），沒登入時只存在這台裝置
 * ===================================================== */
const TT_DEFAULT_TIMES = [['08:10', '09:00'], ['09:10', '10:00'], ['10:10', '11:00'], ['11:10', '12:00'], ['13:10', '14:00'], ['14:10', '15:00'], ['15:10', '16:00'], ['16:10', '17:00']];
const TT_MAX = 10;
const TT_COMMON = ['國文', '英文', '數學', '物理', '化學', '生物', '地科', '體育'];   // 快捷選項只放這 8 個
const timeOk = (t) => /^\d{2}:\d{2}$/.test(t);
function normTT(x) {
    const periods = (Array.isArray(x?.periods) ? x.periods : [])
        .filter(p => p && timeOk(p.s) && timeOk(p.e)).slice(0, TT_MAX).map(p => ({ s: p.s, e: p.e }));
    const cells = {};
    if (x && typeof x.cells === 'object' && x.cells) {
        for (const [k, v] of Object.entries(x.cells)) {
            if (!/^[0-4]-\d$/.test(k) || !v || typeof v !== 'object') continue;
            const n = String(v.n || '').trim().slice(0, 12), n2 = String(v.n2 || '').trim().slice(0, 12), note = String(v.note || '').trim().slice(0, 30);
            if (!n && !n2 && !note) continue;
            const c = Number.isInteger(v.c) && v.c >= -1 && v.c <= 4 ? v.c : null;   // null＝依科目名稱自動配色，-1＝不上色
            cells[k] = { n, ...(n2 ? { n2 } : {}), ...(c !== null ? { c } : {}), ...(note ? { note } : {}) };
        }
    }
    const anchor = typeof x?.anchor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.anchor) ? x.anchor : null;
    return { periods: periods.length ? periods : TT_DEFAULT_TIMES.map(([s, e]) => ({ s, e })), cells, anchor };
}
let tt = normTT(lsGet(LS.tt, null));
const ttHasData = () => Object.keys(tt.cells).length > 0;
function saveTT() { lsSet(LS.tt, tt); savePrefs(); renderTT(); renderHomeClass(); }
// 科目名稱 → 網站的五科顏色（數學、自然、英文、國文、社會），其他科不上色
function ttAuto(name) {
    const s = String(name || '');
    if (!s) return -1;
    if (/數學|數甲|數乙|數A|數B|math/i.test(s)) return 0;
    if (/英|english/i.test(s)) return 2;
    if (/物理|化學|生物|地科|地球科學|自然|理化|探究|實作/.test(s)) return 1;
    if (/國文|國語|國寫|語文|作文|閱讀/.test(s)) return 3;
    if (/歷史|地理|公民|社會|社區/.test(s)) return 4;
    return -1;
}
const ttColorOf = (cell, name) => cell && Number.isInteger(cell.c) ? cell.c : ttAuto(name ?? cell?.n);
const ttMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
// 單雙週：anchor 那週是單週，往後每隔一週輪替
function isEvenWeek(d) {
    if (!tt.anchor) return false;
    const w = Math.round((mondayOf(d) - mondayOf(parseYmd(tt.anchor))) / (7 * 86400000));
    return Math.abs(w) % 2 === 1;
}
const ttHasAlt = () => Object.values(tt.cells).some(c => c.n2);
// 這天這節實際上的課（單雙週不同時換成雙週的）
function ttClassAt(date, d, p) {
    const c = tt.cells[`${d}-${p}`];
    if (!c) return null;
    const name = c.n2 && isEvenWeek(date) ? c.n2 : c.n;
    return { name, color: ttColorOf(c, name), note: c.note || '', alt: !!c.n2, cell: c };
}
// 放假：行事曆上那天有寫「放假、補假、停課…」的行程
const TT_OFF_RE = /放假|補假|停課|颱風假|連假|國定假日|休假|校慶補假/;
const ttOffDay = (ds) => !!holOn(ds)?.off || state.events.some(e => e.start <= ds && evEnd(e) >= ds && TT_OFF_RE.test(e.title || ''));
// 顯示哪一週：平日顯示本週；週末顯示下一週（這週的課已經上完了）
function ttWeek(now = new Date()) {
    const mon = mondayOf(now);
    if (now.getDay() === 6 || now.getDay() === 0) mon.setDate(mon.getDate() + 7);
    return [0, 1, 2, 3, 4].map(i => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x; });
}
let calView = localStorage.getItem(LS.calView) === 'tt' ? 'tt' : 'cal';
function applyCalView() {
    document.body.classList.toggle('cal-tt', calView === 'tt');
    $('ttView').hidden = calView !== 'tt';
    document.querySelectorAll('#calViewSeg [data-cv]').forEach(b => { const on = b.dataset.cv === calView; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    if (calView === 'tt') renderTT();
}
$('calViewSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cv]');
    if (!b || b.dataset.cv === calView) return;
    calView = b.dataset.cv; lsSet(LS.calView, calView);
    applyCalView(); window.scrollTo({ top: 0 });
});
const ICON_DOTS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
let ttMinuteKey = '';
function renderTT() {
    const el = $('ttView');
    if (!el || calView !== 'tt') return;
    const now = new Date(), t = todayStr(), nowMin = now.getHours() * 60 + now.getMinutes();
    const week = ttWeek(now), md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    const showPar = ttHasAlt() && tt.anchor;
    let h = `<div class="tt-head"><div class="tt-range">${md(week[0])} – ${md(week[4])}${showPar ? `<small>${isEvenWeek(week[0]) ? '雙週' : '單週'}</small>` : ''}</div>
        <button class="icon-btn" data-tta="menu" aria-label="課表選項">${ICON_DOTS}</button></div>`;
    if (!ttHasData()) h += `<div class="tt-empty-tip"><span>點格子填入科目；同學有分享課表連結的話，可以直接匯入。</span><button class="btn btn-small" data-tta="import">匯入</button></div>`;
    h += '<div class="tt" role="grid" aria-label="課表"><div></div>';
    week.forEach(d => {
        const ds = ymd(d), off = ttOffDay(ds);
        h += `<div class="tt-dh${ds === t ? ' today' : ''}${off ? ' off' : ''}"><b>${WEEK_ZH[d.getDay()]}</b><span>${d.getDate()}</span>${off ? `<em>${esc(holOn(ds)?.off ? holOn(ds).n : '放假')}</em>` : ''}</div>`;
    });
    tt.periods.forEach((p, i) => {
        const prev = tt.periods[i - 1];
        if (prev && ttMin(p.s) - ttMin(prev.e) >= 30) h += `<div class="tt-break">${ttMin(prev.e) < 13 * 60 + 30 && ttMin(p.s) > 11 * 60 ? '午休' : '休息'} ${prev.e} – ${p.s}</div>`;
        const isNowRow = week.some(d => ymd(d) === t) && nowMin >= ttMin(p.s) && nowMin < ttMin(p.e);
        h += `<div class="tt-p${isNowRow ? ' now' : ''}"><b>${i + 1}</b><small>${p.s}</small></div>`;
        week.forEach((d, di) => {
            const ds = ymd(d), k = ttClassAt(d, di, i), off = ttOffDay(ds);
            const isToday = ds === t, isNow = isToday && isNowRow, past = isToday && nowMin >= ttMin(p.e);
            const label = `星期${WEEK_ZH[d.getDay()]} 第 ${i + 1} 節`;
            if (!k || !k.name) {
                h += `<button class="tt-c empty${off ? ' off' : ''}" data-ttc="${di}-${i}" aria-label="${label}：空堂，點一下新增">＋${k?.note ? '<i class="dot"></i>' : ''}</button>`;
                return;
            }
            const cls = ['tt-c', k.color < 0 ? 'plain' : '', off ? 'off' : '', past ? 'past' : '', isNow ? 'now' : ''].join(' ');
            const prog = isNow ? `--prog:${((nowMin - ttMin(p.s)) / Math.max(1, ttMin(p.e) - ttMin(p.s)) * 100).toFixed(0)}%;` : '';
            h += `<button class="${cls}" data-ttc="${di}-${i}" ${k.color >= 0 ? `data-c style="--c:var(--s${k.color});${prog}"` : (prog ? `style="${prog}"` : '')} aria-label="${label}：${esc(k.name)}${k.note ? '，備註 ' + esc(k.note) : ''}">${esc(k.name)}${k.note ? '<i class="dot"></i>' : ''}${k.alt ? `<span class="alt">${isEvenWeek(d) ? '雙' : '單'}</span>` : ''}</button>`;
        });
    });
    h += `</div>
        <div class="tt-legend">${SUBJECTS.map((n, s) => `<span><i style="background:var(--s${s})"></i>${n}</span>`).join('')}<span><i style="background:var(--important)"></i>有備註</span></div>
        <p class="tt-hint">點一格可以改科目、單雙週、備註<br>節數和上課時間在右上角 ⋯ 裡改</p>`;
    setHtml(el, h);
    ttMinuteKey = `${t} ${nowMin}`;
}
// 每分鐘更新「現在上到哪一節」
function ttTick() {
    const now = new Date(), k = `${todayStr()} ${now.getHours() * 60 + now.getMinutes()}`;
    if (k === ttMinuteKey) return;
    ttMinuteKey = k;
    if (document.body.dataset.tab === 'tab-calendar' && calView === 'tt') renderTT();
    if (document.body.dataset.tab === 'tab-countdown') renderHomeClass();
}
$('ttView').addEventListener('click', (e) => {
    const a = e.target.closest('[data-tta]')?.dataset.tta;
    if (a === 'menu') { openModal('ttMenuModal'); return; }
    if (a === 'import') { openTTImport(); return; }
    const c = e.target.closest('[data-ttc]');
    if (c) openTTCell(c.dataset.ttc);
});
$('ttMenuModal').addEventListener('click', (e) => {
    const a = e.target.closest('[data-ttm]')?.dataset.ttm;
    if (!a) return;
    closeModal('ttMenuModal');
    if (a === 'share') shareTT();
    else if (a === 'import') openTTImport();
    else if (a === 'time') openTTTime();
    else if (a === 'clear') {
        if (!ttHasData()) { toast('課表本來就是空的'); return; }
        const before = tt;
        tt = { ...tt, cells: {} }; saveTT();
        toast('已清空課表', { label: '復原', fn: () => { tt = before; saveTT(); } });
    }
});

/* --- 編輯一格 --- */
let ttEditKey = null, ttEditColor = null;
function renderTTColors() {
    const auto = ttAuto($('ttName').value.trim());
    const opts = [[null, '自動', auto >= 0 ? `var(--s${auto})` : 'var(--faint)'], ...SUBJECTS.map((n, s) => [s, n, `var(--s${s})`]), [-1, '其他', 'var(--faint)']];
    $('ttColors').innerHTML = opts.map(([v, n, col]) => `<button type="button" data-ttcol="${v === null ? 'auto' : v}" class="${ttEditColor === v ? 'active' : ''}" aria-pressed="${ttEditColor === v}"><i style="background:${col}"></i>${n}</button>`).join('');
}
function renderTTSuggest() {
    $('ttSuggest').innerHTML = TT_COMMON.map(n => `<button type="button" data-ttsug="${esc(n)}">${esc(n)}</button>`).join('');
}
function openTTCell(key) {
    const [d, p] = key.split('-').map(Number);
    const per = tt.periods[p];
    if (!per) return;
    ttEditKey = key;
    const c = tt.cells[key] || {};
    $('ttCellTitle').textContent = `星期${WEEK_ZH[d + 1]} · 第 ${p + 1} 節（${per.s}–${per.e}）`;
    $('ttName').value = c.n || '';
    $('ttName2').value = c.n2 || '';
    $('ttNote').value = c.note || '';
    $('ttAlt').checked = !!c.n2;
    $('ttAltWrap').hidden = !c.n2;
    ttEditColor = Number.isInteger(c.c) ? c.c : null;
    $('ttClearCell').hidden = !tt.cells[key];
    renderTTColors(); renderTTSuggest();
    openModal('ttCellModal');
}
$('ttName').addEventListener('input', renderTTColors);
$('ttAlt').addEventListener('change', () => { $('ttAltWrap').hidden = !$('ttAlt').checked; if ($('ttAlt').checked) setTimeout(() => $('ttName2').focus(), 50); });
$('ttSuggest').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ttsug]');
    if (!b) return;
    $('ttName').value = b.dataset.ttsug; renderTTColors();
});
$('ttColors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ttcol]');
    if (!b) return;
    ttEditColor = b.dataset.ttcol === 'auto' ? null : Number(b.dataset.ttcol);
    renderTTColors();
});
['ttName', 'ttName2', 'ttNote'].forEach(id => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('ttSaveCell').click(); } }));
$('ttSaveCell').addEventListener('click', () => {
    if (!ttEditKey) return;
    const n = $('ttName').value.trim(), n2 = $('ttAlt').checked ? $('ttName2').value.trim() : '', note = $('ttNote').value.trim();
    const cells = { ...tt.cells };
    if (!n && !n2 && !note) delete cells[ttEditKey];
    else cells[ttEditKey] = { n, ...(n2 ? { n2 } : {}), ...(ttEditColor !== null ? { c: ttEditColor } : {}), ...(note ? { note } : {}) };
    // 第一次設定單雙週：這週當單週
    const anchor = tt.anchor || (n2 ? ymd(mondayOf(new Date())) : null);
    tt = normTT({ ...tt, cells, anchor }); saveTT();
    closeModal('ttCellModal');
});
$('ttClearCell').addEventListener('click', () => {
    if (!ttEditKey) return;
    const cells = { ...tt.cells }; delete cells[ttEditKey];
    tt = { ...tt, cells }; saveTT();
    closeModal('ttCellModal');
});

/* --- 節數和上課時間 --- */
let ttDraftTimes = [], ttDraftPar = 0;
function renderTTTimes() {
    $('ttTimes').innerHTML = ttDraftTimes.map((p, i) => `<div class="tt-trow"><b>第 ${i + 1} 節</b>
        <input type="text" inputmode="numeric" maxlength="5" class="field num" data-tti="${i}" data-k="s" value="${p.s}" placeholder="08:10" aria-label="第 ${i + 1} 節開始（24 小時制）">
        <span>–</span>
        <input type="text" inputmode="numeric" maxlength="5" class="field num" data-tti="${i}" data-k="e" value="${p.e}" placeholder="09:00" aria-label="第 ${i + 1} 節結束（24 小時制）"></div>`).join('');
    $('ttLess').disabled = ttDraftTimes.length <= 1;
    $('ttMore').disabled = ttDraftTimes.length >= TT_MAX;
    document.querySelectorAll('#ttParity [data-par]').forEach(b => b.classList.toggle('active', Number(b.dataset.par) === ttDraftPar));
}
function openTTTime() {
    ttDraftTimes = tt.periods.map(p => ({ ...p }));
    ttDraftPar = isEvenWeek(new Date()) ? 1 : 0;
    $('ttParityWrap').hidden = !ttHasAlt();
    renderTTTimes();
    openModal('ttTimeModal');
}
// 打字輸入時間：810、8:10、0810、8.10 都會變成 08:10（24 小時制）
function ttParseTime(v) {
    const m = String(v).trim().replace(/[：.．]/g, ':').match(/^(\d{1,2}):?(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null;
}
$('ttTimes').addEventListener('change', (e) => {
    const inp = e.target.closest('[data-tti]');
    if (!inp) return;
    const v = ttParseTime(inp.value);
    if (!v) { inp.value = ttDraftTimes[Number(inp.dataset.tti)][inp.dataset.k]; toast('時間請用 24 小時制，例如 13:10'); return; }
    inp.value = v;
    ttDraftTimes[Number(inp.dataset.tti)][inp.dataset.k] = v;
});
$('ttMore').addEventListener('click', () => {
    if (ttDraftTimes.length >= TT_MAX) return;
    const last = ttDraftTimes[ttDraftTimes.length - 1];
    const s = Math.min(ttMin(last.e) + 10, 23 * 60), e = Math.min(s + 50, 23 * 60 + 59);
    const hm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    ttDraftTimes.push({ s: hm(s), e: hm(e) });
    renderTTTimes();
    $('ttTimes').scrollTop = $('ttTimes').scrollHeight;
});
$('ttLess').addEventListener('click', () => { if (ttDraftTimes.length > 1) { ttDraftTimes.pop(); renderTTTimes(); } });
$('ttParity').addEventListener('click', (e) => {
    const b = e.target.closest('[data-par]');
    if (!b) return;
    ttDraftPar = Number(b.dataset.par); renderTTTimes();
});
$('ttSaveTime').addEventListener('click', () => {
    // 先把還在編輯中的時間讀進來
    let bad = false;
    document.querySelectorAll('#ttTimes [data-tti]').forEach(inp => { const v = ttParseTime(inp.value); if (v) ttDraftTimes[Number(inp.dataset.tti)][inp.dataset.k] = v; else bad = true; });
    if (bad) { toast('有時間格式不對，請用 24 小時制，例如 13:10'); return; }
    for (let i = 0; i < ttDraftTimes.length; i++) {
        const p = ttDraftTimes[i];
        if (ttMin(p.e) <= ttMin(p.s)) { toast(`第 ${i + 1} 節的下課時間要比上課晚`); return; }
        if (i && ttMin(p.s) < ttMin(ttDraftTimes[i - 1].e)) { toast(`第 ${i + 1} 節要在第 ${i} 節下課之後`); return; }
    }
    const n = ttDraftTimes.length;
    const dropped = Object.keys(tt.cells).filter(k => Number(k.split('-')[1]) >= n);
    const cells = { ...tt.cells }; dropped.forEach(k => delete cells[k]);
    // 單雙週：選的是「這週」，換算成單週的星期一
    let anchor = tt.anchor;
    if (ttHasAlt()) { const mon = mondayOf(new Date()); if (ttDraftPar === 1) mon.setDate(mon.getDate() - 7); anchor = ymd(mon); }
    const before = tt;
    tt = normTT({ periods: ttDraftTimes, cells, anchor }); saveTT();
    closeModal('ttTimeModal');
    if (dropped.length) toast(`已移除後面 ${dropped.length} 格課`, { label: '復原', fn: () => { tt = before; saveTT(); } });
    else toast('已更新上課時間');
});

/* --- 分享、匯入（課表放在連結裡，不經過伺服器；備註不會分享出去） --- */
function ttEncode() {
    const cells = {};
    for (const [k, c] of Object.entries(tt.cells)) if (c.n || c.n2) cells[k] = { n: c.n, ...(c.n2 ? { n2: c.n2 } : {}), ...(Number.isInteger(c.c) ? { c: c.c } : {}) };
    const json = JSON.stringify({ v: 1, periods: tt.periods, cells, anchor: tt.anchor });
    const bytes = new TextEncoder().encode(json);
    let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function ttDecode(code) {
    try {
        const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
        const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
        const x = normTT(JSON.parse(new TextDecoder().decode(bytes)));
        return Object.keys(x.cells).length ? x : null;
    } catch (e) { return null; }
}
async function shareTT() {
    if (!ttHasData()) { toast('課表還是空的，先填幾格再分享'); return; }
    const url = `${location.origin}${location.pathname}?tt=${ttEncode()}`;
    const text = '這是我的課表，點連結就能匯入到「學測倒數」';
    try {
        if (navigator.share) { await navigator.share({ title: '課表', text, url }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('已複製課表連結，貼給同學就能匯入'); return; } catch (e) {}
    // 舊瀏覽器沒有 clipboard：用隱藏的輸入框複製
    const ta = document.createElement('textarea');
    ta.value = url; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.select();
    let done = false;
    try { done = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    toast(done ? '已複製課表連結，貼給同學就能匯入' : '無法複製連結，請換個瀏覽器再試');
}
let ttPending = null;
function ttSummary(x) {
    const names = [...new Set(Object.values(x.cells).flatMap(c => [c.n, c.n2]).filter(Boolean))];
    return `<b>${x.periods.length}</b> 節、<b>${Object.keys(x.cells).length}</b> 格課<br>${esc(names.slice(0, 8).join('、'))}${names.length > 8 ? ' 等' : ''}`;
}
function openTTImport(pending) {
    ttPending = pending || null;
    $('ttImportAsk').hidden = !!pending;
    $('ttImportPrev').hidden = !pending;
    if (pending) $('ttImportPrev').innerHTML = `${ttSummary(pending)}${ttHasData() ? '<br><span class="muted">會取代你現在的課表（你的備註會保留）</span>' : ''}`;
    $('ttImportText').value = '';
    openModal('ttImportModal');
}
$('ttImportGo').addEventListener('click', () => {
    let x = ttPending;
    if (!x) {
        const v = $('ttImportText').value.trim();
        const m = v.match(/[?&]tt=([A-Za-z0-9_-]+)/);
        x = ttDecode(m ? m[1] : v);
        if (!x) { toast('看不懂這個連結，請確認有完整複製'); return; }
    }
    const before = tt;
    // 自己寫的備註保留在原本的格子
    const cells = { ...x.cells };
    for (const [k, c] of Object.entries(tt.cells)) if (c.note) cells[k] = { ...(cells[k] || { n: '' }), note: c.note };
    tt = normTT({ ...x, cells }); saveTT();
    closeModal('ttImportModal');
    ttPending = null;
    calView = 'tt'; lsSet(LS.calView, calView);
    showTab('tab-calendar'); applyCalView();
    toast('已匯入課表', { label: '復原', fn: () => { tt = before; saveTT(); } });
});
// 打開別人分享的課表連結：問要不要匯入
(function handleTTLink() {
    const m = location.search.match(/[?&]tt=([A-Za-z0-9_-]+)/);
    if (!m) return;
    const x = ttDecode(m[1]);
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    if (!x) { setTimeout(() => toast('課表連結不完整，請同學重新分享一次'), 800); return; }
    setTimeout(() => openTTImport(x), 900);
})();

/* --- 首頁：今天的課 --- */
const ICON_BOOK_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M9 4v16"/></svg>';
const ICON_NEXT_SM = '<svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
// 首頁一排小格子用的短名字：去掉「選修、高三、加深加廣、(彈性學習)」這類字，取前兩個字
function ttShort(n) {
    const x = String(n).replace(/[（(][^)）]*[)）]/g, '').replace(/^(高[一二三])/, '').replace(/^(選修|必修|加深加廣|多元)/, '').trim();
    return (x || String(n)).slice(0, 2);
}
function renderHomeClass() {
    const el = $('homeClass');
    if (!el || homePref.hide.includes('class')) return;
    const now = new Date(), t = todayStr(), dow = (now.getDay() + 6) % 7, nowMin = now.getHours() * 60 + now.getMinutes();
    const mini = (icon, html) => `<button class="cls-mini" data-hc="open">${icon}<span class="grow">${html}</span>${ICON_NEXT_SM}</button>`;
    if (!ttHasData()) { setHtml(el, mini(ICON_BOOK_CLOCK, '<b>設定課表</b>，這裡就會顯示今天的課')); return; }
    const classes = dow > 4 || ttOffDay(t) ? [] : tt.periods.map((p, i) => ({ p, i, k: ttClassAt(now, dow, i) })).filter(x => x.k && x.k.name);
    const hol = holOn(t);
    if (!classes.length) { setHtml(el, mini(ICON_BOOK_CLOCK, hol?.off ? `<b>今天放假</b> · ${esc(hol.full)}` : hol?.work ? '<b>今天補班</b>' : `<b>今日無課程</b>${ttOffDay(t) ? '（放假）' : ''}`)); return; }
    const last = classes[classes.length - 1];
    if (nowMin >= ttMin(last.p.e)) { setHtml(el, mini(ICON_BOOK_CLOCK, `<b>今天的課上完了</b> · 放學 ${last.p.e}`)); return; }
    const cur = classes.find(x => nowMin >= ttMin(x.p.s) && nowMin < ttMin(x.p.e));
    const next = classes.find(x => ttMin(x.p.s) > nowMin);
    const show = cur || next;
    const col = show.k.color >= 0 ? `var(--s${show.k.color})` : 'var(--muted)';
    let frac = 0, line1, line3;
    if (cur) {
        const len = Math.max(1, ttMin(cur.p.e) - ttMin(cur.p.s));
        frac = (nowMin - ttMin(cur.p.s)) / len;
        line1 = `現在 · 第 ${cur.i + 1} 節 ${cur.p.s}–${cur.p.e}`;
        line3 = `還有 <b>${ttMin(cur.p.e) - nowMin}</b> 分下課`;
    } else {
        line1 = `下一節 · 第 ${next.i + 1} 節 ${next.p.s}–${next.p.e}`;
        const wait = ttMin(next.p.s) - nowMin;
        line3 = wait <= 60 ? `<b>${wait}</b> 分後上課` : `${next.p.s} 上課`;
    }
    const C = 2 * Math.PI * 19;
    const strip = classes.map(x => {
        const past = nowMin >= ttMin(x.p.e), isCur = cur && x.i === cur.i;
        return `<span ${x.k.color >= 0 ? `data-c style="--c:var(--s${x.k.color})"` : ''} class="${past ? 'past' : ''} ${isCur ? 'now' : ''}" title="第 ${x.i + 1} 節 ${esc(x.k.name)}">${esc(ttShort(x.k.name))}</span>`;
    }).join('');
    const after = cur ? classes.find(x => x.i > cur.i) : classes.find(x => x.i > next.i);
    setHtml(el, `<div class="sec-head"><h3>今天的課</h3><span>星期${WEEK_ZH[now.getDay()]} · ${classes.length} 節</span></div>
        <button class="cls-now" data-hc="open">
            <svg class="ring" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="19" fill="none" stroke="var(--surface-2)" stroke-width="4"/><circle cx="23" cy="23" r="19" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}" transform="rotate(-90 23 23)"/><text x="23" y="27.5" text-anchor="middle" font-size="13" font-weight="800" fill="currentColor" font-family="Manrope">${show.i + 1}</text></svg>
            <span class="tx"><span class="t1" style="display:block">${line1}</span><span class="t2" style="display:block;color:${col}">${esc(show.k.name)}</span><span class="t3" style="display:block">${line3}${show.k.note ? ` · ${esc(show.k.note)}` : ''}</span></span>
            ${ICON_NEXT_SM}
        </button>
        <div class="cls-strip" aria-hidden="true">${strip}</div>
        <div class="cls-next"><span>${after ? `接著 ${after.p.s} ${esc(after.k.name)}` : '這是今天最後一節'}</span><span>放學 ${last.p.e}</span></div>`);
}
$('homeClass').addEventListener('click', (e) => {
    if (!e.target.closest('[data-hc]')) return;
    calView = 'tt'; lsSet(LS.calView, calView);
    showTab('tab-calendar'); applyCalView();
});

/* =====================================================
 * v60 讀書熱力圖（統計頁「各科比例」下面）：一格一天，顏色越深讀越多，最深＝達到每日目標
 * ===================================================== */
let heatRange = localStorage.getItem(LS.heat) === 'year' ? 'year' : 'half';
let heatSel = null;
function heatData(range = heatRange) {
    const weeks = range === 'year' ? 53 : 26;
    const now = new Date(), t = todayStr();
    const start = mondayOf(now); start.setDate(start.getDate() - 7 * (weeks - 1));
    const mins = dayMinutesMap();
    const goal = tpref.goal || 180;
    const cells = [];
    for (let i = 0; i < weeks * 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const ds = ymd(d), m = Math.round(mins.get(ds) || 0);
        cells.push({ ds, d, m, fut: ds > t, lv: m <= 0 ? 0 : m >= goal ? 4 : m >= goal * 2 / 3 ? 3 : m >= goal / 3 ? 2 : 1 });
    }
    const past = cells.filter(c => !c.fut);
    let best = 0, run = 0;
    past.forEach(c => { run = c.m > 0 ? run + 1 : 0; best = Math.max(best, run); });
    const top = past.reduce((a, c) => (c.m > (a?.m || 0) ? c : a), null);
    return { weeks, cells, goal, days: past.filter(c => c.m > 0).length, best, total: past.reduce((a, c) => a + c.m, 0), goalDays: past.filter(c => c.lv === 4).length, top };
}
function heatGridHtml(H, interactive) {
    let h = `<div class="hm-grid ${heatRange}" style="--cols:${H.weeks}">`;
    for (let w = 0; w < H.weeks; w++) {
        const first = H.cells[w * 7].d, prev = w ? H.cells[(w - 1) * 7].d : null;
        // 月份標在那個月第一週上面；最前面和最後一欄不標（字會擠到旁邊）
        const show = prev && prev.getMonth() !== first.getMonth() && w < H.weeks - 1;
        h += `<div class="hm-m">${show ? (first.getMonth() + 1) + '月' : ''}</div>`;
        for (let k = 0; k < 7; k++) {
            const c = H.cells[w * 7 + k];
            h += interactive && !c.fut
                ? `<button class="hm-d ${c.lv ? 'l' + c.lv : ''} ${heatSel === c.ds ? 'sel' : ''}" data-hm="${c.ds}" aria-label="${c.d.getMonth() + 1}/${c.d.getDate()} ${c.m ? fmtHM(c.m) : '沒有讀書'}"></button>`
                : `<i class="hm-d ${c.fut ? 'fut' : (c.lv ? 'l' + c.lv : '')}"></i>`;
        }
    }
    return h + '</div>';
}
function heatHtml() {
    const H = heatData();
    return `<section class="stats-sec hm-sec" id="heatSec">
        <div class="sec-head"><h3>讀書熱力圖</h3><div class="hm-tabs" role="group" aria-label="範圍"><button data-sact="heat-half" class="${heatRange === 'half' ? 'on' : ''}" aria-pressed="${heatRange === 'half'}">半年</button><button data-sact="heat-year" class="${heatRange === 'year' ? 'on' : ''}" aria-pressed="${heatRange === 'year'}">一年</button></div></div>
        <div class="hm-card">
            <div class="hm-top"><div><b>${H.days}<small>天</small></b><span>有讀書</span></div><div><b>${H.best}<small>天</small></b><span>最長連續</span></div><div><b>${Math.round(H.total / 60)}<small>小時</small></b><span>總共</span></div></div>
            <div class="hm-wrap"><div class="hm-wd" aria-hidden="true"><span></span><span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span>日</span></div><div class="hm-scroll" id="heatScroll">${heatGridHtml(H, true)}</div></div>
            <div class="hm-foot"><span>最深色＝達標 ${H.goal / 60} 小時</span><span class="hm-leg" aria-hidden="true">少 <i class="hm-d"></i><i class="hm-d l1"></i><i class="hm-d l2"></i><i class="hm-d l3"></i><i class="hm-d l4"></i> 多</span></div>
        </div>
        <div class="hm-acts"><button class="btn btn-small" data-sact="heat-share">分享熱力圖</button></div>
    </section>`;
}
// 一年的格子比較多：打開時捲到最右邊（最近的日子）
function heatAfterRender() {
    const sc = $('heatScroll');
    if (!sc) return;
    heatAlignDays();
    sc.scrollLeft = sc.scrollWidth;
    if (heatSel) showHeatTip(heatSel);
}
// 左邊「一、三、五、日」要跟格子同高（格子大小會跟著螢幕寬度變）
function heatAlignDays() {
    const wd = document.querySelector('#heatSec .hm-wd'), cell = document.querySelector('#heatSec .hm-grid .hm-d');
    if (!wd || !cell) return;
    wd.style.gridTemplateRows = `14px repeat(7, ${cell.getBoundingClientRect().height}px)`;
}
window.addEventListener('resize', () => { if (document.body.dataset.tab === 'tab-stats') heatAlignDays(); });
function showHeatTip(ds) {
    const sec = $('heatSec');
    if (!sec) return;
    sec.querySelector('.hm-tip')?.remove();
    const b = sec.querySelector(`[data-hm="${ds}"]`);
    if (!b) return;
    const r = b.getBoundingClientRect(), sr = sec.getBoundingClientRect();
    const d = parseYmd(ds), m = Math.round(dayMinutes(ds));
    const tip = document.createElement('div');
    tip.className = 'hm-tip';
    tip.innerHTML = `${d.getMonth() + 1}/${d.getDate()}（${WEEK_ZH[d.getDay()]}）${m ? `<b>${Math.floor(m / 60)}</b> 時 <b>${pad(m % 60)}</b> 分` : '沒有讀書'}`;
    sec.appendChild(tip);
    const half = tip.offsetWidth / 2;
    const x = Math.min(Math.max(r.left - sr.left + r.width / 2, half + 4), sr.width - half - 4);
    tip.style.left = x + 'px';
    tip.style.top = (r.top - sr.top) + 'px';
}
document.addEventListener('click', (e) => {   // 點熱力圖以外的地方，提示就收起來
    if (!heatSel || e.target.closest('[data-hm]')) return;
    heatSel = null;
    document.querySelectorAll('#heatSec .hm-d.sel').forEach(x => x.classList.remove('sel'));
    $('heatSec')?.querySelector('.hm-tip')?.remove();
});

/* --- 熱力圖分享卡（1080 × 1920） --- */
async function drawHeatCard() {
    const H = heatData();
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#E9B154';
    const rgb = css.getPropertyValue('--accent-rgb').trim() || '233, 177, 84';
    const sub = ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181'];
    const zh = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
    const num = 'Manrope, "Noto Sans TC", sans-serif';
    try { await Promise.all([document.fonts.load(`800 120px Manrope`, '0123456789'), document.fonts.load(`700 40px "Noto Sans TC"`, '半年一來我讀了個小時天有書最長連續數學自然英文國文社會距離測還每格慢把它填滿多的達標月')]); } catch (e) {}
    const W = 1080, Hh = 1920, P = 96;
    const c = document.createElement('canvas'); c.width = W; c.height = Hh;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#050608'; ctx.fillRect(0, 0, W, Hh);
    let g = ctx.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, W * 0.9);
    g.addColorStop(0, `rgba(${rgb}, 0.3)`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = accent; ctx.font = `700 34px ${num}`;
    spacedText(ctx, `STUDY HEATMAP · ${new Date().getFullYear()}`, P, 250, 10);
    ctx.fillStyle = '#F2F0E9'; ctx.font = `700 76px ${zh}`;
    ctx.fillText(`${heatRange === 'year' ? '這一年' : '半年來'}，我讀了`, P, 370);
    ctx.fillText(`${Math.round(H.total / 60)} 個小時`, P, 470);
    // 兩個大數字
    const stat = (x, v, u, label) => {
        ctx.fillStyle = '#F2F0E9'; ctx.font = `800 120px ${num}`; ctx.fillText(String(v), x, 680);
        const vw = ctx.measureText(String(v)).width;
        ctx.fillStyle = 'rgba(242,240,233,0.7)'; ctx.font = `600 40px ${zh}`; ctx.fillText(u, x + vw + 12, 676);
        ctx.font = `500 34px ${zh}`; ctx.fillText(label, x, 740);
    };
    stat(P, H.days, '天', '有讀書'); stat(P + 420, H.best, '天', '最長連續');
    // 熱力圖：寬度填滿
    const gap = H.weeks > 30 ? 4 : 7;
    const cell = Math.floor((W - P * 2 - gap * (H.weeks - 1)) / H.weeks);
    const gx = P + ((W - P * 2) - (cell * H.weeks + gap * (H.weeks - 1))) / 2, gy = 860;
    ctx.font = `500 ${H.weeks > 30 ? 22 : 26}px ${zh}`; ctx.fillStyle = 'rgba(242,240,233,0.45)';
    let lastLabelX = -999;
    for (let w = 0; w < H.weeks; w++) {
        const first = H.cells[w * 7].d, prev = w ? H.cells[(w - 1) * 7].d : null;
        const x = gx + w * (cell + gap);
        if (prev && prev.getMonth() !== first.getMonth() && w < H.weeks - 1 && x - lastLabelX > 56) { ctx.fillText(`${first.getMonth() + 1}月`, x, gy - 18); lastLabelX = x; }
        for (let k = 0; k < 7; k++) {
            const it = H.cells[w * 7 + k];
            if (it.fut) continue;
            ctx.fillStyle = it.lv ? `rgba(${rgb}, ${[0, .28, .5, .75, 1][it.lv]})` : 'rgba(242,240,233,0.08)';
            roundRect(ctx, x, gy + k * (cell + gap), cell, cell, Math.max(2, cell * .22)); ctx.fill();
        }
    }
    let y = gy + 7 * (cell + gap) + 70;
    // 各科比例
    const per = SUBJECTS.map((_, s) => state.sessions.reduce((a, r) => a + (r.subject === s && H.cells.some(cc => cc.ds === sessionDay(r)) ? r.minutes : 0), 0));
    const tot = per.reduce((a, b) => a + b, 0);
    if (tot) {
        const parts = per.map((v, s) => [v, s]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]);
        let bx = P; const avail = W - P * 2 - 8 * (parts.length - 1);
        ctx.save(); roundRect(ctx, P, y, W - P * 2, 24, 12); ctx.clip();
        parts.forEach(([v, s]) => { const bw = avail * v / tot; ctx.fillStyle = sub[s]; ctx.fillRect(bx, y, bw, 24); bx += bw + 8; });
        ctx.restore();
        ctx.font = `500 32px ${zh}`;
        let lx = P, ly = y + 80;
        parts.forEach(([v, s]) => {
            const label = `${SUBJECTS[s]} ${Math.round(v / tot * 100)}%`;
            const w = 34 + ctx.measureText(label).width;
            if (lx + w > W - P) { lx = P; ly += 56; }
            ctx.fillStyle = sub[s]; roundRect(ctx, lx, ly - 22, 20, 20, 5); ctx.fill();
            ctx.fillStyle = 'rgba(242,240,233,0.85)'; ctx.fillText(label, lx + 32, ly);
            lx += w + 40;
        });
        y = ly + 60;
    }
    // 兩個小卡：讀最多的一天、達標天數
    const box = (x, w, label, value) => {
        ctx.fillStyle = 'rgba(242,240,233,0.07)'; roundRect(ctx, x, y, w, 150, 28); ctx.fill();
        ctx.fillStyle = 'rgba(242,240,233,0.6)'; ctx.font = `500 30px ${zh}`; ctx.fillText(label, x + 32, y + 56);
        ctx.fillStyle = '#F2F0E9'; ctx.font = `700 42px ${num}`; ctx.fillText(value, x + 32, y + 116);
    };
    const bw = (W - P * 2 - 24) / 2;
    if (H.top) { const d = H.top.d; box(P, bw, '讀最多的一天', `${d.getMonth() + 1}/${d.getDate()} · ${fmtHM(H.top.m)}`); }
    box(P + bw + 24, bw, '達標天數', `${H.goalDays} 天`);
    y += 230;
    const gsat = EXAMS.gsat;
    const left = Math.max(0, Math.floor((examTime(gsat.date) - Date.now()) / 86400000));
    ctx.fillStyle = 'rgba(242,240,233,0.85)'; ctx.font = `500 38px ${zh}`;
    ctx.fillText(`距離 ${gsat.name}還有 ${left} 天`, P, Math.min(y, 1690));
    ctx.fillStyle = 'rgba(242,240,233,0.6)'; ctx.font = `500 34px ${zh}`;
    ctx.fillText('每天一格，慢慢把它填滿。', P, Math.min(y, 1690) + 60);
    // 圖示＋名稱（跟今天的卡片一樣）
    const cx = P + 30, cy = 1810, r = 22;
    ctx.lineCap = 'round'; ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(242,240,233,0.2)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = accent; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI); ctx.stroke();
    ctx.fillStyle = 'rgba(242,240,233,0.85)'; ctx.font = `700 34px ${zh}`;
    spacedText(ctx, '學測倒數', cx + 52, cy + 12, 10);
    return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}
async function openHeatShare() {
    toast('正在產生卡片…');
    const blob = await drawHeatCard();
    showShareBlob(blob, `讀書熱力圖-${todayStr()}.png`, '讀書熱力圖');
}

/* =====================================================
 * 首頁自己排：倒數頁下面的區塊要不要顯示、排什麼順序（跟著帳號同步）
 * ===================================================== */
const HOME_MODS = [
    { k: 'class', name: '今天的課', sub: '課表上現在和下一節課', icon: '<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M9 4v16"/>' },
    { k: 'time', name: '今天讀了多久', icon: '<path d="M4 18V11M10 18V6M16 18v-5M2 21h20"/>' },
    { k: 'list', name: '今天的清單', sub: '進度表和今天的待辦', icon: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>' },
    { k: 'review', name: '重點複習', sub: '有標重點時才會出現', icon: '<path d="M6 3h12v18l-6-4-6 4z"/>' },
    { k: 'roulette', name: '現在要讀什麼？', icon: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>' },
    { k: 'upcoming', name: '接下來的行程', sub: '最近的考試、行程和倒數', off: true, icon: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' },
    { k: 'room', name: '讀書房間', sub: '朋友現在在讀什麼', off: true, icon: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.5.2 4 1.9 4.5 4.9"/>' }
];
const HOME_DEFAULT = { order: HOME_MODS.map(m => m.k), hide: HOME_MODS.filter(m => m.off).map(m => m.k) };
function normHome(h) {
    const keys = HOME_MODS.map(m => m.k);
    if (!h || !Array.isArray(h.order)) return { order: HOME_DEFAULT.order.slice(), hide: HOME_DEFAULT.hide.slice() };
    const order = h.order.filter(k => keys.includes(k));
    // 新加的區塊（例如 v60 的「今天的課」）放回它預設的位置，不是全部塞到最後面
    keys.forEach((k, i) => { if (!order.includes(k)) { const after = keys.slice(0, i).reverse().find(x => order.includes(x)); order.splice(after ? order.indexOf(after) + 1 : 0, 0, k); } });
    return { order, hide: (Array.isArray(h.hide) ? h.hide : []).filter(k => keys.includes(k)) };
}
let homePref = normHome(lsGet(LS.home, null));
let homeDraft = null;
function applyHome() {
    const box = $('homeMods');
    const mods = Object.fromEntries([...box.querySelectorAll('.home-mod')].map(el => [el.dataset.mod, el]));
    let prevVisible = null;
    homePref.order.forEach(k => {
        const el = mods[k];
        if (!el) return;
        box.appendChild(el);
        const on = !homePref.hide.includes(k);
        el.classList.toggle('mod-off', !on);
        if (k === 'list') el.classList.toggle('with-head', prevVisible !== 'time');   // 「今天」標題不在正上方時，清單自己帶一個小標題
        if (on && !(k === 'review' && $('reviewLine').hidden)) prevVisible = k;
    });
    box.querySelectorAll('.home-mod:not(.mod-off)').forEach((el, i, arr) => el.classList.toggle('last', i === arr.length - 1));
    renderHomeExtras();
}
function renderHomeEdit() {
    const fixed = `<li class="he-row fixed"><span class="he-check on dim">${ICON_CHECK_SM}</span><span class="he-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2.5h6"/></svg></span><span class="he-tx"><b>倒數</b><small>固定在最上面</small></span><span class="drag-sp"></span></li>`;
    $('homeEditList').innerHTML = fixed + homeDraft.order.map(k => {
        const m = HOME_MODS.find(x => x.k === k), on = !homeDraft.hide.includes(k);
        return `<li class="he-row" data-sort="${k}">
            <button class="he-check ${on ? 'on' : ''}" data-hetoggle="${k}" aria-pressed="${on}" aria-label="${on ? '隱藏' : '顯示'}${m.name}">${ICON_CHECK_SM}</button>
            <span class="he-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${m.icon}</svg></span>
            <span class="he-tx"><b>${m.name}</b>${m.sub ? `<small>${m.sub}</small>` : ''}</span>
            <button class="drag-h" aria-label="拖曳排序 ${m.name}（也可以用上下鍵）">${ICON_HANDLE}</button>
        </li>`;
    }).join('');
}
function openHomeEdit() { homeDraft = normHome(homePref); renderHomeEdit(); openModal('homeModal'); }
makeSortable($('homeEditList'), (from, to) => { homeDraft.order = moveItem(homeDraft.order, from, to); renderHomeEdit(); });
$('homeEditList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-hetoggle]');
    if (!b) return;
    const k = b.dataset.hetoggle;
    homeDraft.hide = homeDraft.hide.includes(k) ? homeDraft.hide.filter(x => x !== k) : [...homeDraft.hide, k];
    renderHomeEdit();
});
$('homeEditDone').addEventListener('click', () => {
    homePref = normHome(homeDraft);
    lsSet(LS.home, homePref);
    applyHome(); savePrefs();
    closeModal('homeModal');
});
$('homeEditReset').addEventListener('click', () => { homeDraft = normHome(null); renderHomeEdit(); });
$('homeEditBtn').addEventListener('click', openHomeEdit);

// 接下來的行程＋讀書房間（兩個新的首頁區塊，有打開才畫）
function renderHomeExtras() { renderHomeUpcoming(); renderHomeRoom(); renderHomeClass(); }
function renderHomeUpcoming() {
    if (homePref.hide.includes('upcoming')) return;
    const t = todayStr();
    const items = [
        ...examEntries.filter(([, e]) => (e.end || e.date) >= t).map(([, e]) => ({ date: e.date, title: e.name, color: 'var(--exam)', tag: '考試' })),
        ...state.events.filter(e => (e.end || e.start) >= t).map(e => ({ date: e.start < t ? t : e.start, title: e.title, color: e.important ? 'var(--important)' : 'var(--faint)' })),
        ...state.countdowns.items.map(c => ({ date: cdNextDate(c), title: c.name, color: c.color, tag: '倒數', end: c.end })).filter(c => (c.end || c.date) >= t)
    ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
    setHtml($('homeUpcoming'), items.length ? items.map(i => {
        const d = parseYmd(i.date), rel = daysBetween(t, i.date);
        return `<li><button class="hu-row" data-hudate="${i.date}"><span class="hu-date num"><b>${d.getMonth() + 1}/${d.getDate()}</b><small>週${WEEK_ZH[d.getDay()]}</small></span><i class="hu-bar" style="background:${i.color}"></i><span class="hu-tx">${esc(i.title)}</span><span class="hu-rel">${rel <= 0 ? '今天' : rel === 1 ? '明天' : rel + ' 天後'}</span></button></li>`;
    }).join('') : '<li class="empty">接下來沒有安排</li>');
}
$('homeUpcoming').addEventListener('click', (e) => {
    const b = e.target.closest('[data-hudate]');
    if (!b) return;
    selDate = b.dataset.hudate;
    const d = parseYmd(selDate); calY = d.getFullYear(); calM = d.getMonth();
    showTab('tab-calendar'); renderCalendar();
});
function renderHomeRoom() {
    if (homePref.hide.includes('room')) return;
    let html;
    if (!currentUser) html = `<div class="hr-empty"><span>登入後就能看到朋友現在在讀什麼</span><button class="btn btn-small" data-hr="login">登入</button></div>`;
    else if (!roomsLoaded) html = `<div class="hr-empty"><span>讀取中…</span></div>`;
    else if (!myRooms.length) html = `<div class="hr-empty"><span>還沒加入讀書房間</span><button class="btn btn-small" data-hr="room">去看看</button></div>`;
    else {
        const now = Date.now();
        const uids = [...new Set(myRooms.flatMap(r => r.members || []))].filter(u => u !== currentUser.uid && profiles[u]);
        const list = uids.map(u => ({ u, p: profiles[u], s: statusOf(u, now) }))
            .sort((a, b) => (b.s.phase === 'focus') - (a.s.phase === 'focus') || b.s.min - a.s.min).slice(0, 5);
        const live = list.filter(x => x.s.phase === 'focus').length;
        html = list.length ? `<p class="hr-sum">${live ? `<i></i>${live} 人正在讀` : '現在沒有人在讀'}</p>` + list.map(({ u, p, s }) => {
            const st = s.phase === 'focus' ? (p.hidden ? '專注中' : `${SUBJECTS[s.subject] || ''} · 讀了 ${fmtHM(s.el / 60000)}`) : s.phase === 'break' ? '休息中' : (s.min ? `今天 ${fmtHM(s.min)}` : '今天還沒讀');
            return `<button class="hr-row ${s.phase}" data-hr="room">${avHtml(p, u)}<span class="hr-name">${esc(p.name || '同學')}</span><span class="hr-st">${st}</span></button>`;
        }).join('') : `<div class="hr-empty"><span>房間裡只有你，邀請朋友一起來吧</span><button class="btn btn-small" data-hr="room">邀請</button></div>`;
    }
    setHtml($('homeRoom'), html);
}
$('homeRoom').addEventListener('click', (e) => {
    const a = e.target.closest('[data-hr]')?.dataset.hr;
    if (a === 'login') openModal('accountModal');
    else if (a === 'room') { roomView = null; showTab('tab-room'); }
});

/* =====================================================
 * 全螢幕時鐘（專注中）：主題背景＋像 iPhone 待機模式的大數字，手機直放、橫放、平板、電腦都置中
 * ===================================================== */
let sbOpen = false, sbHideTimer = 0, sbShiftTimer = 0, sbFontLoaded = false;
function openStandby() {
    if (timer.phase !== 'focus') return;
    if (!sbFontLoaded) {   // 沒有 iPhone 圓體字的裝置，用相近的 Nunito（只下載數字）
        sbFontLoaded = true;
        const l = document.createElement('link'); l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@600;700&display=swap&text=0123456789%3A';
        document.head.appendChild(l);
    }
    sbOpen = true;
    const el = $('standby');
    el.hidden = false; el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sb-on');
    requestAnimationFrame(() => el.classList.add('show'));
    try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {}); } catch (e) {}
    requestWake();
    updateStandby(true);
    sbWake();
    clearInterval(sbShiftTimer);
    sbShiftTimer = setInterval(() => {   // 每分鐘稍微挪一下位置，OLED 螢幕比較不會烙印
        el.style.setProperty('--sb-x', `${Math.round(Math.random() * 16 - 8)}px`);
        el.style.setProperty('--sb-y', `${Math.round(Math.random() * 12 - 6)}px`);
    }, 60000);
}
function closeStandby() {
    if (!sbOpen) return;
    sbOpen = false;
    clearTimeout(sbHideTimer); clearInterval(sbShiftTimer);
    const el = $('standby');
    el.classList.remove('show', 'idle');
    document.body.classList.remove('sb-on');
    el.setAttribute('aria-hidden', 'true');
    setTimeout(() => { if (!sbOpen) el.hidden = true; }, 380);
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) {}
}
// 點一下畫面：按鈕出現，4 秒沒動作又藏起來
function sbWake() {
    const el = $('standby');
    el.classList.remove('idle');
    clearTimeout(sbHideTimer);   // （每分鐘的小位移也會在這裡重設，不會一直偏一邊）
    sbHideTimer = setTimeout(() => { if (sbOpen && !timer.pausedAt) el.classList.add('idle'); }, 4000);
}
function updateStandby(full) {
    if (!sbOpen) return;
    if (timer.phase !== 'focus') { closeStandby(); return; }
    const now = Date.now(), el = focusElapsed(now);
    const ms = timer.duration ? Math.max(0, timer.duration - el) : el;
    const tot = Math.floor(ms / 1000), h = Math.floor(tot / 3600), m = Math.floor(tot % 3600 / 60), sec = tot % 60;
    setText($('sbTime'), h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`);
    $('standby').classList.toggle('long', !!h);
    const frac = timer.duration ? Math.min(1, el / timer.duration) : (el % 3600000) / 3600000;
    $('sbRing').style.strokeDashoffset = (timer.duration ? RING_C * frac : RING_C * (1 - frac)).toFixed(1);
    const d = new Date(now);
    setText($('sbNow'), `${pad(d.getHours())}:${pad(d.getMinutes())}`);
    if (full) {
        $('sbRing').setAttribute('stroke-dasharray', RING_C.toFixed(2));
        const task = taskFor(timer.subject);
        $('sbSubj').innerHTML = `<i class="sdot s${timer.subject}"></i>${SUBJECTS[timer.subject]}`;
        setText($('sbTask'), task && !task.done ? task.text : '');
    }
    const paused = !!timer.pausedAt;
    $('standby').classList.toggle('paused', paused);
    $('sbRing').classList.toggle('paused', paused);
    setText($('sbSub'), paused ? '已暫停' : (timer.duration ? `已專注 ${fmtHM(el / 60000)}` : '自由計時中'));
    setText($('sbPause'), paused ? '繼續' : '暫停');
}
$('standby').addEventListener('click', (e) => {
    const a = e.target.closest('[data-sb]')?.dataset.sb;
    if (a === 'exit') { closeStandby(); return; }
    if (a === 'pause') { togglePause(); updateStandby(); sbWake(); return; }
    if (a === 'finish') { closeStandby(); finishFocus(false); return; }
    sbWake();
});
document.addEventListener('keydown', (e) => {
    if (!sbOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeStandby(); }
    else if (e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); togglePause(); updateStandby(); sbWake(); }
}, true);
document.addEventListener('fullscreenchange', () => { /* 只是離開瀏覽器全螢幕：時鐘畫面保留，再點右上角就能關 */ });

/* =====================================================
 * 啟動：先用本機資料畫出畫面
 * ===================================================== */
{ const v = $('appVersion'); if (v) v.textContent = `目前版本 ${APP_VERSION}`; }
state = loadLocal();
if (removedDupes) saveLocal();
// 上次是登入狀態：先用雲端副本畫出畫面，雲端回應後只在資料真的有變時才重畫
{ const c = loadCloudCache(); if (c) { state = c.state; cachedUid = c.uid; cloudBase = c.base; cloudDirty = c.dirty; } }
applyHome();
applyCalView();   // v60：上次停在課表就打開課表
// v61：點每日提醒打開網站時網址會帶 ?tab=…，直接切到那一頁
(function openTabFromUrl() {
    const m = location.search.match(/[?&]tab=(tab-[a-z]+)/);
    if (!m) return;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    if (document.getElementById(m[1])) setTimeout(() => showTab(m[1]), 0);
})();
renderExamChips();
// 關掉 App 期間一輪已經結束的話，打開時直接記錄（不響）
if (timer.phase === 'focus' && timer.duration && !timer.pausedAt && focusElapsed() >= timer.duration) finishFocus(true, true);
if (timer.phase === 'break' && Date.now() - timer.breakStart >= timer.breakLen && !timer.chimed) { timer.chimed = true; saveTimer(); }
if (timer.phase === 'focus' && !timer.pausedAt) requestWake();
tick();
setInterval(() => { tick(); timerTick(); roomTick(); ttTick(); }, 1000);
renderAll();
renderAccount();
const resumed = resumeAfterUpdate();   // 自動更新後重新載入：回到原本的畫面
// 重新打開：正在計時就回計時頁；離開超過 3 分鐘又沒在計時，一律從倒數頁開始
const timerLive = () => timer.phase === 'focus' || (timer.phase === 'break' && Date.now() - timer.breakStart < timer.breakLen + 3 * 60000);
const lastActive = () => { try { return Number(localStorage.getItem(LS.lastActive)) || 0; } catch (e) { return 0; } };
const markActive = () => { try { localStorage.setItem(LS.lastActive, String(Date.now())); } catch (e) {} };
(function startTab() {
    // 同一次使用（重新整理、切到背景被系統重新載入）：sessionStorage 還在；滑掉、關掉網頁再打開：sessionStorage 是空的
    let sameSession = false;
    try { sameSession = sessionStorage.getItem('study_alive') === '1'; sessionStorage.setItem('study_alive', '1'); } catch (e) {}
    if (resumed) return;
    const saved = localStorage.getItem(LS.tab) || 'tab-countdown';
    const fresh = sameSession && Date.now() - lastActive() < 3 * 60000;   // 關掉再打開：一律從倒數頁開始
    showTab(timerLive() ? 'tab-timer' : (fresh ? saved : 'tab-countdown'));   // 點通知打開的（網址帶 ?tab= 或 ?chat=）稍後會再切過去
})();
onAppHide(markActive);
onAppShow(() => {
    // 從背景回來：離開超過 30 分鐘、沒在計時、沒在打字或開視窗，就回到倒數頁
    const away = Date.now() - lastActive();
    if (lastActive() && away > 30 * 60000 && !timerLive() && !isTyping(document.activeElement) && !document.querySelector('.modal.open') && !chatRoom && document.body.dataset.tab !== 'tab-countdown') showTab('tab-countdown');
    markActive();
});
window.addEventListener('pagehide', markActive);
setInterval(() => { if (document.visibilityState === 'visible') markActive(); }, 60000);
if (navigator.onLine === false) netOffline();   // 打開時就沒網路
markActive();
setTimeout(() => { nudgeSoon(); handlePendingJoin(); }, 300);

// ⑩ 開啟畫面淡出
setTimeout(() => {
    const sp = $('splash');
    if (!sp) return;
    sp.classList.add('hide');
    setTimeout(() => sp.remove(), 600);
}, 450);

// 過了午夜自動更新「今天」
let lastDay = todayStr();
setInterval(() => {
    if (todayStr() !== lastDay) { lastDay = todayStr(); renderExamChips(); renderAll(); }
}, 60000);

/* =====================================================
 * Firebase 登入與雲端同步
 * ===================================================== */
// 先把 Google 登入用的小網頁載好：沒登入時才做（已登入的人不需要），按「登入」才不會卡很久（Safari 特別明顯）
let loginWarm = false;
function warmLogin() {
    if (loginWarm || !fb || currentUser) return;
    loginWarm = true;
    fb.authM.getRedirectResult(fb.auth).catch(() => {});
}
async function initFirebase() {
    try {
        const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VER}`;
        // 四個模組同時下載（以前 App Check 要等前面載完才開始，打開會慢一點）
        const [appM, authM, fsM, acM] = await Promise.all([
            import(`${base}/firebase-app.js`),
            import(`${base}/firebase-auth.js`),
            import(`${base}/firebase-firestore.js`),
            RECAPTCHA_SITE_KEY ? import(`${base}/firebase-app-check.js`).catch(e => { console.warn('App Check 載入失敗：', e); return null; }) : null
        ]);
        const app = appM.initializeApp(FIREBASE_CONFIG);
        // App Check：證明請求來自這個網站，保護 AI 額度（要先在主控台註冊 reCAPTCHA）
        if (acM) {
            try {
                if (['localhost', '127.0.0.1'].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
                acM.initializeAppCheck(app, { provider: new acM.ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
            } catch (e) { console.warn('App Check 啟動失敗：', e); }
        }
        const auth = authM.getAuth(app);
        const provider = new authM.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        let db;
        try {
            // 開啟離線快取：沒網路也能讀寫，連線後自動同步
            db = fsM.initializeFirestore(app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) });
        } catch (e) {
            db = fsM.getFirestore(app);
        }
        fb = { app, auth, provider, authM, db, fs: fsM };
        renderAccount();
        setTimeout(flushErrors, 3000);   // 打開前就出的錯，等 Firebase 準備好再送
        // 只有剛用「整頁跳轉」登入回來時才需要讀結果（平常打開不用多載一個登入用的網頁框）
        let redirected = false;
        try { redirected = sessionStorage.getItem('study_redirect') === '1'; sessionStorage.removeItem('study_redirect'); } catch (e) {}
        if (redirected) { loginWarm = true; authM.getRedirectResult(auth).catch(err => { console.warn('跳轉登入結果：', err); toast('登入沒有完成，請再試一次'); }); }
        authM.onAuthStateChanged(auth, onAuthChanged);
    } catch (e) {
        console.warn('Firebase 載入失敗（可能離線），只使用本機儲存：', e);
        renderAccount();
    }
}

function onAuthChanged(user) {
    authKnown = true;
    try {
        if (user && sessionStorage.getItem(DEL_PENDING) === '1') {
            sessionStorage.removeItem(DEL_PENDING);
            setTimeout(() => { openModal('accountModal'); openDelSheet('已確認是本人，再輸入一次「刪除」並按下去就會完成。'); }, 900);
        }
    } catch (e) {}
    currentUser = user;
    cloudReady = false;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (!user) {
        setTimeout(warmLogin, 1500);
        roomStop(); lastProfile = '';
        clearCloudCache(); cachedUid = null; cloudBase = null; cloudDirty = false;
        state = loadLocal();
        renderAll(); renderAccount(); renderRoom();
        return;
    }
    loadRoomProfile(user);
    renderAccount('同步中…');
    setTimeout(() => { if (pushPref.on && pushSupport().ok && Notification.permission === 'granted') pushSave().catch(() => {}); pushBeat(true); renderNotifRow(); pokeListen(); }, 1500);   // 推播 token 可能會換，登入時更新一次
    setTimeout(handlePendingJoin, 800);
    let first = true;
    // 副本是同一個帳號的才算數；換帳號就先清掉，避免看到別人的資料
    if (cachedUid && cachedUid !== user.uid) { clearCloudCache(); cachedUid = null; cloudBase = null; cloudDirty = false; state = loadLocal(); renderAll(); }
    cachedUid = user.uid;
    // 沒有副本（這台第一次登入）：以登入當下的畫面為準，之後的修改才算「這台改的」
    if (!cloudBase) cloudBase = cloneState(state);
    const ref = fb.fs.doc(fb.db, 'users', user.uid);
    // 即時監聽：手機改了，電腦畫面也會自動更新
    // includeMetadataChanges：雲端確認「資料沒變」時也會通知，狀態才會從「離線中」變回已同步
    unsubscribe = fb.fs.onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
        if (snap.metadata.hasPendingWrites) return;          // 自己剛寫入的（個人設定），不用重畫
        if (first && snap.metadata.fromCache && !snap.exists()) return; // 本機沒快取，等雲端回應
        const cloud = snap.exists() ? normalize(snap.data()) : normalize({});
        const dupes = removedDupes;
        if (snap.exists()) applyCloudPrefs(snap.data().prefs);
        let next;
        if (first) {
            first = false;
            cloudReady = true;
            const local = loadLocal();
            if (!isEmpty(cloud)) {
                next = cloudDirty ? mergeState(cloudBase, state, cloud) : cloneState(cloud);   // 有還沒送出的修改：跟雲端合併（複製一份：下面補進去的紀錄不能算成「雲端本來就有」）
                const missing = earlySessions.filter(x => !next.sessions.some(y => y.id === x.id));
                if (missing.length) { next.sessions.push(...missing); cloudDirty = true; }
                // 登入前（沒登入時）在這台記的讀書時間：加進帳號
                const gIds = new Set(lsGet(LS.guestNew, []) || []);
                const guest = local.sessions.filter(x => gIds.has(x.id) && !cloud.sessions.some(y => y.id === x.id));
                if (guest.length) {
                    guest.forEach(x => { if (!next.sessions.some(y => y.id === x.id)) next.sessions.push({ ...x }); });
                    cloudDirty = true;
                    setTimeout(() => toast(`已把登入前記錄的 ${guest.length} 筆讀書時間加到帳號`), 600);
                }
            } else if (cloudDirty) {
                next = state;   // 雲端是空的：直接把這台的資料送上去
            } else if (!isEmpty(local)) {
                next = local;   // 雲端是空的：把登入前的本機資料上傳，避免遺失
                cloudDirty = true;
                toast('已把這台裝置的資料上傳到雲端');
            } else {
                next = normalize({});
            }
            earlySessions.length = 0;   // 已經補進這次的資料了；之後換帳號或重新登入不會再補一次
        } else {
            next = cloudDirty ? mergeState(cloudBase, state, cloud) : cloneState(cloud);   // 別台改了：這台還沒送出的修改保留
        }
        // 登入前記的讀書時間：確定雲端有了才拿掉記號（沒網路、還沒送上去之前都會保留）
        if (!snap.metadata.fromCache) {
            const g = lsGet(LS.guestNew, []), have = new Set(cloud.sessions.map(x => x.id));
            if (Array.isArray(g) && g.length) { const left = g.filter(id => !have.has(id)); left.length ? lsSet(LS.guestNew, left) : localStorage.removeItem(LS.guestNew); }
        }
        cloudBase = cloneState(cloud);   // 複製一份，不能跟畫面上的資料共用（不然新增的紀錄會被當成雲端已經有、又被合併刪掉）
        if (journalRestore(next, !snap.metadata.fromCache && !cloudDirty)) cloudDirty = true;   // 剛記錄還沒確認上雲端的，一定保留
        if (dupes && snap.exists()) { cloudDirty = true; toast(`已移除 ${dupes} 個和考試重複的行程`); }
        // 跟畫面上的一樣（打開時已經用副本畫好了）就不用整頁重畫，打開比較順
        setSyncedState(next);
        saveCloudCache();
        if (cloudDirty) scheduleFlush();
        publishProfile();   // 別台裝置新增了讀書紀錄時，更新房間裡的今日時數
        renderAccount(snap.metadata.fromCache ? '離線中，連上網路後會自動同步' : '');
    }, (err) => {
        console.error('雲端讀取失敗：', err);
        renderAccount('雲端讀取失敗，請檢查網路');
    });
}

let loginBusy = false;
$('loginBtn').addEventListener('click', async () => {
    if (!fb) { toast('目前無法連線，請連上網路後再試'); return; }
    const { auth, provider, authM } = fb;
    if (currentUser) {
        if (confirm('確定要登出嗎？')) {
            if (cloudDirty) await flushCloud();   // 還沒送上雲端的修改先送出去
            // 沒網路送不出去：讀書紀錄有另外保存（再登入同一個帳號會補回去），但其他還沒同步的修改會不見，先問一次
            if (cloudDirty && !confirm('現在沒有網路，有些修改還沒同步到雲端（讀書紀錄會保留，再登入就會補回）。\n待辦、行程等其他修改登出後會不見，確定要登出嗎？')) return;
            await pushRemove();   // 登出後這台不再收到這個帳號的推播
            pokeStop();
            // 暱稱、頭像顏色跟著帳號：登出後清掉，換別的帳號登入才不會用到上一個人的
            roomPref = { name: '', hidden: false, enabled: false }; saveRoomPref();
            await authM.signOut(auth); closeModal('accountModal');
        }
        return;
    }
    if (loginBusy) return;
    loginBusy = true;
    const btn = $('loginBtn');
    btn.textContent = '登入中…'; btn.classList.add('busy');
    // 登入視窗在另一個分頁打開時，回到這頁會自動完成；太久沒反應就讓按鈕恢復，可以再按一次
    const slow = setTimeout(() => { if (!currentUser) toast('登入視窗還開著嗎？完成後回到這裡就會自動登入'); }, 8000);
    try {
        await authM.signInWithPopup(auth, provider);
        closeModal('accountModal');
    } catch (err) {
        // 加到主畫面的 App 常會擋彈出視窗，改用整頁跳轉登入
        const useRedirect = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'];
        if (useRedirect.includes(err.code)) { try { sessionStorage.setItem('study_redirect', '1'); } catch (e) {} authM.signInWithRedirect(auth, provider); }
        else if (err.code !== 'auth/popup-closed-by-user') alert('登入失敗：' + err.message);
    } finally {
        clearTimeout(slow);
        loginBusy = false; btn.classList.remove('busy');
        if (!currentUser) renderAccount();
    }
});

/* --- v55：刪除帳號與所有資料 --- */
const DEL_PENDING = 'study_del_pending';
const LOCAL_DATA_KEYS = () => [LS.todos, LS.weekly, LS.events, LS.sessions, LS.syllabus, LS.countdowns, LS.timer, LS.tpref, LS.room,
    LS.chatSeen, LS.photoCount, LS.home, LS.cloud, LS.aiPref, LS.aiCount, LS.exam, LS.progView, LS.sylOpen, LS.minTip, SESS_JOURNAL, LS.tt, LS.calView, LS.heat, LS.push, LS.pushId];
function openDelSheet(note) {
    if (!currentUser) return;
    $('delInput').value = '';
    $('delGo').disabled = true;
    $('delGo').textContent = '永久刪除';
    $('delGo').classList.remove('busy');
    $('delNote').textContent = note || 'Google 可能會要求你再登入一次，確認是本人。';
    $('delNote').classList.toggle('err', false);
    openModal('delModal');
}
$('delAcctBtn').addEventListener('click', () => openDelSheet());
$('delInput').addEventListener('input', () => { $('delGo').disabled = $('delInput').value.trim() !== '刪除'; });
const delSay = (t, bad) => { $('delNote').textContent = t; $('delNote').classList.toggle('err', !!bad); };
$('delGo').addEventListener('click', () => { if ($('delInput').value.trim() === '刪除') deleteAccount(); });
async function deleteAccount() {
    const user = currentUser;
    if (!user || !fb || deletingAccount) return;
    if (navigator.onLine === false) { delSay('刪除帳號需要網路，請連上網路後再試。', true); return; }
    const { fs, db, authM, provider } = fb;
    const btn = $('delGo');
    // Google 規定：刪除帳號前要「剛登入過」。太久以前登入的話，先請他再登入一次
    const last = Date.parse(user.metadata?.lastSignInTime || '') || 0;
    if (!last || Date.now() - last > 4 * 60000) {
        delSay('請在跳出的視窗再登入一次，確認是本人…');
        try { await authM.reauthenticateWithPopup(user, provider); }
        catch (err) {
            if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(err?.code)) {
                // 加到主畫面的 App 常擋彈出視窗：改用整頁跳轉，回來後自動打開這個視窗，再按一次就好
                try { sessionStorage.setItem(DEL_PENDING, '1'); sessionStorage.setItem('study_redirect', '1'); } catch (e) {}
                authM.reauthenticateWithRedirect(user, provider);
                return;
            }
            delSay(err?.code === 'auth/popup-closed-by-user' ? '需要再登入一次才能刪除帳號，資料都還在。' : '確認身分失敗，資料都還在，請再試一次。', true);
            if (err?.code !== 'auth/popup-closed-by-user') reportErr(err, 'deleteAccount/reauth');
            return;
        }
    }
    deletingAccount = true;
    btn.classList.add('busy'); btn.textContent = '刪除中…';
    $('delCancel').disabled = true;
    const me = user.uid;
    try {
        clearTimeout(cloudTimer); clearTimeout(flushRetry); clearTimeout(profTimer);
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        // 1. 房間：先刪自己的訊息和已讀，再離開（最後一個人就把房間刪掉）
        const rooms = [...myRooms];
        for (let i = 0; i < rooms.length; i++) {
            const code = rooms[i].id;
            delSay(`正在清除房間資料（${i + 1}/${rooms.length}）…`);
            const snap = await fs.getDocs(fs.query(fs.collection(db, 'rooms', code, 'messages'), fs.where('uid', '==', me)));
            await Promise.all(snap.docs.map(d => fs.deleteDoc(fs.doc(db, 'rooms', code, 'messages', d.id))));
            await fs.deleteDoc(fs.doc(db, 'rooms', code, 'reads', me)).catch(() => {});
            const rs = await fs.getDoc(fs.doc(db, 'rooms', code));
            if (rs.exists()) {
                const mem = rs.data().members || [];
                if (mem.length <= 1) await fs.deleteDoc(fs.doc(db, 'rooms', code));
                else await fs.updateDoc(fs.doc(db, 'rooms', code), { members: fs.arrayRemove(me) });
            }
        }
        roomStop();
        // 2. 房間裡的個人狀態、3. 雲端的讀書資料
        delSay('正在刪除雲端資料…');
        await pushRemove();
        await fs.deleteDoc(fs.doc(db, 'profiles', me)).catch(() => {});
        await fs.deleteDoc(fs.doc(db, 'users', me));
        // 4. 這台裝置上的讀書資料（主題色、深淺色等外觀設定保留）
        LOCAL_DATA_KEYS().forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
        cloudDirty = false; cachedUid = null; cloudBase = null;
        // 5. Google 登入的帳號
        try { await authM.deleteUser(user); }
        catch (err) { reportErr(err, 'deleteAccount/deleteUser'); try { await authM.signOut(fb.auth); } catch (e) {} }
        try { sessionStorage.removeItem(DEL_PENDING); } catch (e) {}
        delSay('已刪除，正在重新整理…');
        toast('帳號和所有資料都已刪除');
        setTimeout(() => location.reload(), 1200);
    } catch (err) {
        deletingAccount = false;
        reportErr(err, 'deleteAccount');
        btn.classList.remove('busy'); btn.textContent = '永久刪除';
        $('delCancel').disabled = false;
        delSay('刪除到一半失敗了（可能是網路不穩）。請再按一次「永久刪除」，會從剩下的部分繼續。', true);
    }
}

initFirebase();

// 行事曆：捲到「＋ 新增」那一列時，右下角的浮動按鈕先淡出，不會疊在一起
if ('IntersectionObserver' in window) {
    new IntersectionObserver((ents) => ents.forEach(en => $('calFab').classList.toggle('away', en.isIntersecting)), { rootMargin: '0px 0px -60px 0px' }).observe($('addOnDayBtn'));
}
