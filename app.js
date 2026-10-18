/* =====================================================
 * 學測倒數 & 讀書計畫 — 程式
 *
 * 目錄（用編輯器搜尋這些標題就能跳過去）
 *   設定區            ← 考試日期、科目、Firebase 設定都在這裡
 *   小工具
 *   資料與儲存
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
// AI 讀書計畫用的模型（Firebase AI Logic → Gemini Developer API）
const AI_MODEL = 'gemini-3.5-flash';
// App Check 金鑰（Fraud Defense，舊稱 reCAPTCHA Enterprise）：在 Google Cloud 建立後貼在這裡；留空就不啟用
const RECAPTCHA_SITE_KEY = '6LeR9vQtAAAAAKsbIXmqZCd4sHONdH-mvcTx_qtJ';

const LS = {
    todos: 'study_todos', weekly: 'study_weekly', events: 'study_events',
    exam: 'selectedExamKey', theme: 'study_theme', tab: 'study_tab', accent: 'study_accent',
    sessions: 'study_sessions', timer: 'study_timer', tpref: 'study_timer_pref',
    aiPref: 'study_ai_pref', aiCount: 'study_ai_count', room: 'study_room',
    install: 'study_install_seen', chatSeen: 'study_chat_seen', photoCount: 'study_photo_count'
};
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
let state = { todos: [], events: [], weekly: {}, sessions: [] };
let currentUser = null;
let fb = null; // Firebase（動態載入，離線時 App 照常可用）

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
            : { id: t.id || uid(), text: t.text || '' }),
        events: (raw.events || []).filter(e => e && e.start).map(e => ({
            id: String(e.id || uid()), title: e.title || '', start: String(e.start).slice(0, 10), important: !!e.important
        })).filter(e => { if (isExamDuplicate(e)) { removedDupes++; return false; } return true; }),
        weekly: raw.weekly && typeof raw.weekly === 'object' ? raw.weekly : {},
        sessions: (raw.sessions || []).filter(x => x && x.start && x.minutes > 0).map(x => ({
            id: String(x.id || uid()), subject: Math.min(4, Math.max(0, x.subject | 0)),
            start: Number(x.start), minutes: Math.round(x.minutes), pomo: !!x.pomo
        }))
    };
}
const isEmpty = (s) => !s.todos.length && !s.events.length && !Object.keys(s.weekly).length && !s.sessions.length;
const loadLocal = () => normalize({ todos: lsGet(LS.todos, []), events: lsGet(LS.events, []), weekly: lsGet(LS.weekly, {}), sessions: lsGet(LS.sessions, []) });
function saveLocal() {
    lsSet(LS.todos, state.todos); lsSet(LS.events, state.events); lsSet(LS.weekly, state.weekly); lsSet(LS.sessions, state.sessions);
}

let cloudTimer;
let cloudReady = false;
const earlySessions = [];   // 讀到雲端資料後才允許寫回，避免空資料蓋掉雲端
let unsubscribe = null;
function save() {
    if (!currentUser || !fb) { saveLocal(); return; }
    if (!cloudReady) { toast('還在連線雲端，這次修改可能不會同步'); return; }
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(async () => {
        try {
            // mergeFields：只覆蓋這幾個欄位，雲端其他舊資料不受影響
            await fb.fs.setDoc(fb.fs.doc(fb.db, 'users', currentUser.uid), {
                todos: state.todos, events: state.events, weekly: state.weekly, sessions: state.sessions, updatedAt: Date.now()
            }, { mergeFields: ['todos', 'events', 'weekly', 'sessions', 'updatedAt'] });
        } catch (e) {
            console.error('雲端儲存失敗：', e);
            toast('雲端儲存失敗，請檢查網路');
        }
    }, 400);
}

function renderAll() {
    renderToday();
    renderWeek();
    renderCalendar();
    renderTodos();
    renderTimer();
    renderStats();
}

/* =====================================================
 * 主題
 * ===================================================== */
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#050608' : '#F7F6F2');
}
applyTheme(document.documentElement.getAttribute('data-theme'));
/* ④ 主題色（帳號視窗裡切換） */
const ACCENTS = ['amber', 'mint', 'violet', 'sakura'];
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
    renderAccount();   // 預設頭像換色
});

$('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    lsSet(LS.theme, next);
});
// 沒手動選過時，跟著手機切換深淺色
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', (e) => {
    const saved = localStorage.getItem(LS.theme);
    if (saved !== 'light' && saved !== 'dark') applyTheme(e.matches ? 'light' : 'dark');
});

/* =====================================================
 * 分頁
 * ===================================================== */
const tabBtns = document.querySelectorAll('.tab-btn');
function showTab(id) {
    if (!document.getElementById(id)) id = 'tab-countdown';
    const SUB = { 'tab-stats': 'tab-timer', 'tab-room': 'tab-timer', 'tab-ai': 'tab-weekly' };   // 子頁面屬於哪個分頁
    const navId = SUB[id] || id;
    const btn = [...tabBtns].find(b => b.dataset.tab === navId) || tabBtns[0];
    tabBtns.forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === id));
    document.body.dataset.tab = id;
    $('pageTitle').textContent = { 'tab-stats': '讀書統計', 'tab-room': '讀書房間', 'tab-ai': 'AI 讀書計畫' }[id] || btn.dataset.title;
    document.body.classList.toggle('sub', !!SUB[id]);   // 子頁面：頂部左邊出現返回鍵
    $('topExtra').innerHTML = '';
    if (id === 'tab-stats') renderStats();
    if (id === 'tab-room') { roomStart(); renderRoom(); }
    if (id === 'tab-ai') renderAI();
    lsSet(LS.tab, id);
    applyFocusMode();
    window.scrollTo({ top: 0 });
}
tabBtns.forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
// 子頁面右上角的按鈕（分享、⋯ 等），只在那一頁顯示
function setTopExtra(tab, html) { if (document.body.dataset.tab === tab) $('topExtra').innerHTML = html; }
function goBack() {
    const tab = document.body.dataset.tab;
    if (tab === 'tab-room' && roomView) { roomView = null; renderRoom(); window.scrollTo({ top: 0 }); return; }
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
function openModal(id) { $(id).classList.add('open'); syncScrollLock(); }
function closeModal(id) {
    $(id).classList.remove('open');
    // 關掉視窗時讓輸入框失去焦點，快捷鍵才會恢復作用
    if (document.activeElement && $(id).contains(document.activeElement)) document.activeElement.blur();
    syncScrollLock();
    if (id === 'rouletteModal') stopSpin();
}
document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) closeModal(m.id); });
});
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelectorAll('.modal.open');
    if (open.length) open.forEach(m => closeModal(m.id));
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
let examKey = localStorage.getItem(LS.exam);
if (!EXAMS[examKey]) examKey = 'gsat';

function renderExamChips() {
    const now = Date.now();
    $('examChips').innerHTML = examEntries.map(([k, e]) => {
        const cls = ['chip', k === examKey ? 'active' : '', examEndTime(e) <= now ? 'past' : ''].join(' ');
        return `<button class="${cls}" role="tab" aria-selected="${k === examKey}" data-exam="${k}">${esc(e.short)}</button>`;
    }).join('');
}
$('examChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-exam]');
    if (!b) return;
    examKey = b.dataset.exam;
    lsSet(LS.exam, examKey);
    renderExamChips();
    tick();
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

function tick() {
    const now = Date.now();
    const exam = EXAMS[examKey];
    const diff = examTime(exam.date) - now;
    $('cdEyebrow').textContent = `${exam.date.slice(0, 4)} · ${exam.name}`;
    const ed = parseYmd(exam.date);
    let dateHtml = `考試日期 <strong>${ed.getFullYear()}/${pad(ed.getMonth() + 1)}/${pad(ed.getDate())}</strong>（${WEEK_ZH[ed.getDay()]}）`;
    if (exam.end) {
        const ee = parseYmd(exam.end);
        dateHtml += ` – <strong>${pad(ee.getMonth() + 1)}/${pad(ee.getDate())}</strong>（${WEEK_ZH[ee.getDay()]}）`;
    }
    $('cdDate').innerHTML = dateHtml;
    if (diff > 0) {
        roll($('days'), pad(Math.floor(diff / 86400000)));
        roll($('hours'), pad(Math.floor(diff % 86400000 / 3600000)));
        roll($('minutes'), pad(Math.floor(diff % 3600000 / 60000)));
        roll($('seconds'), pad(Math.floor(diff % 60000 / 1000)));
        $('cdNote').textContent = '';
    } else {
        ['days', 'hours', 'minutes', 'seconds'].forEach(id => roll($(id), '00'));
        $('cdNote').textContent = now < examEndTime(exam) ? '考試進行中，加油！' : '這場已經考完了，辛苦了！';
    }
    const next = examEntries.map(([, e]) => ({ ...e, diff: examTime(e.date) - now }))
        .filter(e => e.diff > 0).sort((a, b) => a.diff - b.diff)[0];
    $('nextExamLine').innerHTML = next
        ? `下一場：${esc(next.name)} · 還有 <strong>${Math.ceil(next.diff / 86400000)}</strong> 天`
        : '所有考試都完成了，恭喜！';
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
    const done = items.filter(i => i.done).length;
    $('todayCount').textContent = items.length ? `${items.length} 項 · 完成 ${done} 項` : '';
    const min = Math.round(dayMinutes(t)), goal = tpref.goal;
    const left = goal - min;
    $('todayTime').innerHTML = `${hmHtml(min)}<span class="goal-of">／ 目標 ${goal / 60} 小時</span>`;
    $('todayTag').className = 'tag ' + (left <= 0 ? 'ok' : 'warn');
    $('todayTag').textContent = left <= 0 ? '今天達標了' : `還差 ${fmtHM(left)}`;
    $('todayBar').style.width = Math.min(100, min / goal * 100) + '%';
    $('todayList').innerHTML = items.length
        ? items.map(i => `
            <li class="check-item ${i.done ? 'done' : ''}">
                <input type="checkbox" class="checkbox" data-key="${i.key}" ${i.done ? 'checked' : ''} aria-label="完成 ${esc(i.subj)}">
                <span class="text"><span class="subj" style="color:var(--s${i.s})">${esc(i.subj)}</span>${esc(i.text)}</span>
            </li>`).join('')
        : `<li class="empty">今天還沒安排進度，<button class="btn btn-small" id="goWeekBtn">去安排</button></li>`;
}
$('todayList').addEventListener('change', (e) => {
    const key = e.target.dataset.key;
    if (!key || !state.weekly[key]) return;
    state.weekly[key].done = e.target.checked;
    save(); renderToday(); renderWeek();
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
    spinT = setTimeout(() => {
        stopSpin();
        $('rouletteResult').textContent = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
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
    openModal('weeklyModal');
    setTimeout(() => { if ($('weeklyModal').classList.contains('open')) $('weeklyText').focus(); }, 120);
}
$('weeklyText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $('saveWeeklyBtn').click(); }
});
$('saveWeeklyBtn').addEventListener('click', () => {
    const text = $('weeklyText').value.trim();
    const done = $('weeklyDone').checked;
    if (!text && !done && !pickedColor) delete state.weekly[editingKey];
    else state.weekly[editingKey] = { text, done, color: pickedColor };
    save(); renderWeek(); renderToday();
    closeModal('weeklyModal');
});
$('clearWeeklyBtn').addEventListener('click', () => {
    const key = editingKey, old = state.weekly[key];
    delete state.weekly[key];
    save(); renderWeek(); renderToday();
    closeModal('weeklyModal');
    if (old) toast('已清除', { label: '復原', fn: () => { state.weekly[key] = old; save(); renderWeek(); renderToday(); } });
});

/* =====================================================
 * 3. 行事曆
 * ===================================================== */
let calY = new Date().getFullYear(), calM = new Date().getMonth();
let selDate = todayStr();
let editingEventId = null;

const eventsOn = (ds) => state.events.filter(e => e.start === ds).sort((a, b) => (b.important - a.important));

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
        const cls = ['cal-cell', ds === t ? 'today' : '', ds < t ? 'past' : '', ds === selDate ? 'selected' : '', exs.length ? 'exam' : ''].join(' ');
        const dots = evs.slice(0, 3).map(e => `<i class="${e.important ? 'imp' : ''}"></i>`).join('');
        const titles = [
            ...exs.map(e => `<span class="exam">${esc(e.short)}</span>`),
            ...evs.map(e => `<span class="${e.important ? 'imp' : ''}">${esc(e.title)}</span>`)
        ].slice(0, 3).join('');
        const label = `${calM + 1}月${n}日${exs.length ? '，考試' : ''}${evs.length ? `，${evs.length} 個行程` : ''}`;
        html += `<button class="${cls}" data-date="${ds}" aria-label="${label}"><span class="cal-num num">${n}</span><span class="cal-dots">${dots}</span><span class="cal-titles">${titles}</span></button>`;
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
    return `<li><button class="event-row" ${item.id ? `data-id="${item.id}"` : 'data-exam="1"'} data-title="${esc(item.title)}">
        ${dateBlock}
        <div class="event-bar ${item.exam ? 'exam' : item.important ? 'imp' : ''}"></div>
        <div class="event-title">${esc(item.title)}${item.sub ? `<div class="event-sub">${esc(item.sub)}</div>` : ''}</div>
        <div class="event-meta">${tags}${rel !== null ? `<span class="event-rel">${rel === 1 ? '明天' : rel + ' 天後'}</span>` : ''}</div>
    </button></li>`;
}

function renderDayList() {
    const t = todayStr();
    const d = parseYmd(selDate);
    $('selDayTitle').textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${WEEK_ZH[d.getDay()]}${selDate === t ? '（今天）' : ''}`;
    const items = [
        ...examsOn(selDate).map(e => ({
            date: selDate, title: e.name, exam: true,
            sub: e.end ? `第 ${daysBetween(e.date, selDate) + 1} 天，共 ${daysBetween(e.date, e.end) + 1} 天` : ''
        })),
        ...eventsOn(selDate).map(e => ({ id: e.id, date: e.start, title: e.title, important: e.important }))
    ];
    $('selDayList').innerHTML = items.length ? items.map(i => eventRowHtml(i, false)).join('') : '<li class="empty">這天沒有行程</li>';
}

function renderUpcoming() {
    const t = todayStr();
    const items = [
        ...examEntries.map(([, e]) => ({ date: e.date, title: e.name, exam: true, sub: e.end ? `${shortDate(e.date)} – ${shortDate(e.end)}，共 ${daysBetween(e.date, e.end) + 1} 天` : '' })),
        ...state.events.map(e => ({ id: e.id, date: e.start, title: e.title, important: e.important }))
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
$('selDayList').addEventListener('click', onEventListClick);
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
    $('eventImportant').checked = ev ? ev.important : false;
    $('deleteEventBtn').style.display = ev ? '' : 'none';
    openModal('eventModal');
    setTimeout(() => { if ($('eventModal').classList.contains('open')) $('eventName').focus(); }, 120);
}
function saveEvent() {
    const title = $('eventName').value.trim();
    const start = $('eventDate').value;
    if (!title) { toast('請輸入行程內容'); return; }
    if (!start) { toast('請選擇日期'); return; }
    const important = $('eventImportant').checked;
    if (editingEventId) {
        Object.assign(state.events.find(e => e.id === editingEventId), { title, start, important });
    } else {
        state.events.push({ id: uid(), title, start, important });
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
function renderTodos() {
    $('todoList').innerHTML = state.todos.length
        ? state.todos.map(t => `
            <li class="check-item swipe-row" data-id="${t.id}">
                <div class="swipe-bg" aria-hidden="true">
                    <span class="sw-done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>完成</span>
                    <span class="sw-del">刪除<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></span>
                </div>
                <div class="swipe-fg">
                    <input type="checkbox" class="checkbox" aria-label="完成">
                    <span class="text">${esc(t.text)}</span>
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
        save(); renderTodos();
        toast(doneText, { label: '復原', fn: () => { state.todos.splice(idx, 0, item); save(); renderTodos(); } });
    }, 200);
}
$('todoList').addEventListener('change', (e) => { if (e.target.checked) removeTodo(e.target.closest('li'), '完成一項，讚！'); });
$('todoList').addEventListener('click', (e) => { if (e.target.closest('.del-btn')) removeTodo(e.target.closest('li'), '已刪除'); });
function addTodo() {
    const text = $('todoInput').value.trim();
    if (!text) return;
    state.todos.push({ id: uid(), text });
    $('todoInput').value = '';
    save(); renderTodos();
}
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
const pipSupported = 'documentPictureInPicture' in window;
const BASE_TITLE = document.title;

// 計時狀態只存在這台裝置；記錄下來的讀書時間（sessions）會同步到雲端
let timer = lsGet(LS.timer, null) || { phase: 'idle' };
let tpref = Object.assign({ subject: 0, mode: 0, goal: 180 }, lsGet(LS.tpref, {}));
const saveTimer = () => { lsSet(LS.timer, timer); publishProfile(); };   // 同時更新讀書房間裡的狀態
const saveTpref = () => lsSet(LS.tpref, tpref);

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
const sessionDay = (x) => ymd(new Date(x.start));
const dayMinutes = (ds) => state.sessions.reduce((a, x) => a + (sessionDay(x) === ds ? x.minutes : 0), 0);
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
function recordSession(subject, start, minutes, pomo) {
    if (minutes < 1) return null;
    const rec = { id: uid(), subject, start, minutes: Math.round(minutes), pomo: !!pomo };
    state.sessions.push(rec);
    if (!cloudReady) earlySessions.push(rec);   // 雲端還沒連上前記錄的，連上後補上傳
    save();
    publishProfile();
    return rec;
}
function removeSession(id, msg) {
    const idx = state.sessions.findIndex(x => x.id === id);
    if (idx < 0) return;
    const [item] = state.sessions.splice(idx, 1);
    save(); renderTimer(); renderStats(); publishProfile();
    toast(msg || '已刪除紀錄', { label: '復原', fn: () => { state.sessions.splice(idx, 0, item); save(); renderTimer(); renderStats(); } });
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
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
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
function finishFocus(auto, silent) {
    if (timer.phase !== 'focus') return;
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
    const prev = timer;
    const minutes = focusElapsed() / 60000;
    timer = { phase: 'idle' }; saveTimer(); releaseWake();
    if (minutes >= 1) {
        const rec = recordSession(prev.subject, prev.startAt, minutes, false);
        renderTimer(); renderStats();
        toast(`已記錄 ${fmtHM(minutes)}`, { label: '不要記錄', fn: () => { state.sessions = state.sessions.filter(x => x.id !== rec.id); save(); renderTimer(); renderStats(); } });
    } else {
        renderTimer();
    }
}
function endBreak(startNext) {
    timer = { phase: 'idle' }; saveTimer();
    if (startNext) startFocus(); else renderTimer();
}

/* --- 畫面 --- */
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_CHART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';
const ICON_ROOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.5.2 4 1.9 4.5 4.9"/></svg>';
const ringSvg = (cls) => `<svg viewBox="0 0 290 290" aria-hidden="true"><circle class="ring-track" cx="145" cy="145" r="134"/><circle class="ring-bar ${cls || ''}" cx="145" cy="145" r="134" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}"/></svg>`;
const subjButtons = (sel, attr) => SUBJECTS.map((n, i) =>
    `<button class="subj-btn ${i === sel ? 'active' : ''}" ${attr}="${i}" aria-pressed="${i === sel}"><i class="sdot s${i}"></i>${n}</button>`).join('');

function applyFocusMode() {
    document.body.classList.toggle('focus-mode', timer.phase === 'focus' && document.body.dataset.tab === 'tab-timer');
}

function renderTimer() {
    const el = $('tab-timer');
    if (!el) return;
    const t = todayStr();
    if (timer.phase === 'focus') {
        const paused = !!timer.pausedAt;
        const task = taskFor(timer.subject);
        const done = roundsOn(t);
        const dots = timer.duration ? `<div class="round-dots" aria-label="今天第 ${done + 1} 輪">${'<i></i>'.repeat(Math.min(done, 8))}<i class="cur"></i><span>今天第 ${done + 1} 輪</span></div>` : '';
        el.innerHTML = `<div class="timer-wrap">
            <div class="timer-head">
                <span class="chip-subj"><i class="sdot s${timer.subject}"></i>${SUBJECTS[timer.subject]}</span>
                <p class="label">${paused ? '已暫停' : '專注中'}</p>
                <button class="icon-btn" data-act="cancel" aria-label="結束這一輪">${ICON_X}</button>
            </div>
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
                ${pipSupported ? '<button class="btn btn-small" data-act="pip">開啟子母畫面</button>' : ''}
                <p class="hint">關掉 App 也沒關係，回來時會自動算好經過的時間</p>
            </div>
        </div>`;
    } else if (timer.phase === 'break') {
        const task = taskFor(timer.subject);
        el.innerHTML = `<div class="timer-wrap">
            <div class="done-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
            <h2 class="break-title">完成一輪，${SUBJECTS[timer.subject]} ${timer.lastMin} 分鐘</h2>
            <p class="break-sub">今天累計 ${fmtHM(dayMinutes(t))}${roundsOn(t) ? ` · 第 ${roundsOn(t)} 輪` : ''}</p>
            ${task ? `<label class="task-check"><input type="checkbox" class="checkbox" data-task="${task.key}" ${task.done ? 'checked' : ''}><span class="text">「${esc(task.text)}」讀完了嗎？<small>打勾會同步到進度表</small></span></label>` : ''}
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
        el.innerHTML = `<div class="timer-wrap">
            <div class="go-row">
                <button class="go-btn room" data-act="room">
                    <span class="go-ic">${ICON_ROOM.replace('style="width:16px;height:16px"', '')}</span>
                    <span class="go-tx"><b>讀書房間</b><small>${live === null ? '和朋友一起讀' : live ? `● ${live} 人在讀` : '目前沒人在讀'}</small></span>
                    <svg class="go-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                </button>
                <button class="go-btn" data-act="stats">
                    <span class="go-ic">${ICON_CHART}</span>
                    <span class="go-tx"><b>讀書統計</b><small>本週 ${weekMin >= 60 ? Math.floor(weekMin / 60) + ' 小時' : Math.round(weekMin) + ' 分鐘'}</small></span>
                    <svg class="go-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                </button>
            </div>
            <div class="subj-grid">${subjButtons(tpref.subject, 'data-subj')}</div>
            <div class="seg" role="tablist" aria-label="計時模式" style="margin-top:12px">${MODES.map((x, i) =>
                `<button role="tab" aria-selected="${i === tpref.mode}" class="${i === tpref.mode ? 'active' : ''}" data-mode="${i}">${x.label}</button>`).join('')}</div>
            <div class="ring-wrap">${ringSvg()}
                <svg class="goal-ring" viewBox="0 0 290 290" aria-hidden="true"><circle class="goal-track" cx="145" cy="145" r="122"/><circle class="goal-bar" cx="145" cy="145" r="122" stroke-dasharray="${GC.toFixed(1)}" stroke-dashoffset="${(GC * (1 - goalFrac)).toFixed(1)}"/></svg>
                <div class="ring-center"><span class="ring-time num">${m.focus ? pad(m.focus) + ':00' : '00:00'}</span><span class="ring-sub">${m.hint}</span></div>
            </div>
            <p class="goal-line"><i></i>今天 ${fmtHM(todayMin)} ／ 目標 ${tpref.goal / 60} 小時${todayMin >= tpref.goal ? '，達標了！' : ''}</p>
            <p class="task-line">${task && !task.done ? `今天的${SUBJECTS[tpref.subject]}進度：<b>${esc(task.text)}</b>` : ''}</p>
            <button class="btn btn-accent btn-wide" data-act="start" style="margin-top:14px">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>開始專注
            </button>
            <p class="mini-stats"><span><b class="num">${roundsOn(t)}</b> 輪番茄鐘</span><span><b class="num hot">${studyStreak()}</b> 天連續讀書</span></p>
        </div>`;
        if (pipWin) { try { pipWin.close(); } catch (e) {} }
    }
    applyFocusMode();
    updateTimerLive();
}

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
    if (timer.phase === 'focus' && timer.duration && !timer.pausedAt && focusElapsed() >= timer.duration) { finishFocus(true); return; }
    if (timer.phase === 'break' && !timer.chimed && Date.now() - timer.breakStart >= timer.breakLen) {
        timer.chimed = true; saveTimer(); chime();
    }
    if (timer.phase !== 'idle') updateTimerLive();
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
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'start') startFocus();
    else if (act === 'pause') togglePause();
    else if (act === 'finish') finishFocus(false);
    else if (act === 'cancel') cancelFocus();
    else if (act === 'next') endBreak(true);
    else if (act === 'stop') endBreak(false);
    else if (act === 'stats') { statOffset = 0; statSel = null; renderStats(); showTab('tab-stats'); }
    else if (act === 'pip') openPip();
    else if (act === 'room') { roomView = null; showTab('tab-room'); }
});
$('tab-timer').addEventListener('change', (e) => {
    const key = e.target.dataset.task;
    if (!key || !state.weekly[key]) return;
    state.weekly[key].done = e.target.checked;
    save(); renderToday(); renderWeek();
    if (e.target.checked) toast('已在進度表打勾');
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
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

        <div style="display:flex;justify-content:center;margin-top:16px">
            <button class="text-link" data-sact="add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>補登讀書時間</button>
        </div>
    </div>`;
    setTopExtra('tab-stats', `<button class="icon-btn" data-top="share-day" aria-label="分享這天"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button>`);
    if ($('dayModal').classList.contains('open')) renderDaySheet();
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
        return `<li class="log-row"><span class="at">${pad(d.getHours())}:${pad(d.getMinutes())}</span><i class="sdot s${x.subject}"></i><span class="nm">${SUBJECTS[x.subject]}</span><span class="mn">${fmtHM(x.minutes)}</span><button class="del-btn" data-del="${x.id}" aria-label="刪除這筆紀錄">${ICON_X}</button></li>`;
    }).join('') : '<li class="empty">這天沒有讀書紀錄</li>';
}
function openDaySheet() { renderDaySheet(); openModal('dayModal'); }
$('dayModal').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { removeSession(del.dataset.del); renderDaySheet(); return; }
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
    else if (act === 'add') openLogModal();
    else if (act === 'day') openDaySheet();
});
$('tab-stats').addEventListener('change', (e) => {
    if (e.target.id === 'goalSelect') { tpref.goal = Number(e.target.value); saveTpref(); renderStats(); renderTimer(); renderToday(); }
});

/* --- 補登 --- */
$('logSubject').innerHTML = SUBJECTS.map((n, i) => `<option value="${i}">${n}</option>`).join('');
function openLogModal() {
    const now = new Date();
    $('logSubject').value = String(tpref.subject);
    $('logDate').value = statSel && statSel <= todayStr() ? statSel : todayStr();
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
    statSel = date;
    closeModal('logModal');
    renderTimer(); renderStats();
    toast(`已補登 ${fmtHM(minutes)}`);
});


/* =====================================================
 * 7. 質感與操作（滑動、快捷鍵、指令面板、分享卡片）
 * ===================================================== */

/* --- ⑤ 手機按按鈕時輕微震動（Android 支援；iPhone 瀏覽器不支援震動） --- */
document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    if (e.target.closest('button, .tab-btn, .cal-cell, .slot')) { try { navigator.vibrate && navigator.vibrate(8); } catch (err) {} }
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
            try { navigator.vibrate && navigator.vibrate(12); } catch (err) {}
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
    if (isTyping(document.activeElement) || document.querySelector('.modal.open') || document.body.classList.contains('chat-open')) return;
    const tab = document.body.dataset.tab;
    if (/^[1-5]$/.test(e.key)) { showTab(TAB_ORDER[Number(e.key) - 1]); return; }
    if (e.key === '?') { openModal('keysModal'); return; }
    if (e.key === 't' || e.key === 'T') { $('themeBtn').click(); return; }
    if (e.key === ' ') {
        if (timer.phase === 'focus') { e.preventDefault(); togglePause(); }
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
    if (match('AI', '讀書計畫', '計畫', 'plan')) items.push({ group: '前往', label: 'AI 讀書計畫', run: () => showTab('tab-ai') });
    if (match('房間', '讀書房間', '朋友', 'room')) items.push({ group: '前往', label: '讀書房間', run: () => { roomView = null; showTab('tab-room'); } });
    if (match('統計', 'stats')) items.push({ group: '前往', label: '讀書統計', run: () => { statOffset = 0; statSel = null; renderStats(); showTab('tab-stats'); } });
    if (match('深色', '淺色', '主題', 'theme', 'dark', 'light')) items.push({ group: '設定', label: '切換深淺色', key: 'T', run: () => $('themeBtn').click() });
    if (match('主題色', '顏色', '帳號', '登入', 'account')) items.push({ group: '設定', label: '帳號與主題色', run: () => openModal('accountModal') });
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
let shareBlob = null;
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
    shareBlob = await drawShareCard(ds || todayStr());
    if (!shareBlob) { toast('產生卡片失敗'); return; }
    const url = URL.createObjectURL(shareBlob);
    $('shareImg').src = url;
    $('shareDownload').href = url;
    $('shareDownload').download = `讀書卡片-${ds}.png`;
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
let aiModel = null;
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
    lines.push(
        '規則：',
        '1. analysis 寫 2 到 4 點觀察和建議，每點一句話，要具體引用上面的數字。',
        '2. plan 要涵蓋每一個要排的日期，每天 1 到 5 項，每項 minutes 介於 20 到 120，每天總分鐘數接近可讀書時間。',
        '3. 自評弱、最近讀得少的科目要多排；考試當天只排輕鬆的複習或不排。',
        '4. task 寫具體要做的事（例如「數A 3-1 指數 例題」），不超過 18 個字，不要寫分鐘數。',
        '5. 同一天同一科最多 2 項。'
    );
    return lines.join('\n');
}

async function getAiModel() {
    if (aiModel) return aiModel;
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
    const ai = aiM.getAI(fb.app, { backend: new aiM.GoogleAIBackend() });
    aiModel = aiM.getGenerativeModel(ai, {
        model: AI_MODEL,
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.6 }
    });
    return aiModel;
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
        const model = await getAiModel();
        const res = await model.generateContent(buildAiPrompt());
        const text = res.response.text();
        aiResult = cleanAiResult(JSON.parse(text));
        if (!aiResult.days.some(d => d.items.length)) throw new Error('empty');
        aiCountUp();
    } catch (e) {
        console.error('AI 產生失敗：', e);
        const msg = String(e?.message || e);
        aiError = /app-check|appCheck|App Check/i.test(msg) ? 'App Check 驗證失敗，請確認 reCAPTCHA 網站金鑰設定正確。'
            : /quota|429|RESOURCE_EXHAUSTED/i.test(msg) ? '今天的免費額度用完了，晚點再試。'
            : /not enabled|PERMISSION_DENIED|403|api-not-enabled/i.test(msg) ? 'Firebase 專案還沒開啟 AI Logic，請照說明到 Firebase 主控台開啟。'
            : msg === 'empty' ? 'AI 這次沒有排出內容，請再試一次。'
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
        if (aiBusy) result = `<p class="ai-loading"><span class="ai-spin"></span>AI 正在看你的紀錄、排計畫…</p>`;
        else if (aiError) result = `<p class="ai-error">${esc(aiError)}</p>
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
let lastProfile = '';
let profTimer = null;

// 其他人的狀態（已經很久沒更新的視為不在讀）
function liveStatus(p, now = Date.now()) {
    if (!p) return { phase: 'idle', min: 0 };
    const today = p.todayDate === todayStr() ? (p.todayMin || 0) : 0;
    if (p.status === 'focus' && p.startAt) {
        const el = Math.max(0, (p.pausedAt || now) - p.startAt - (p.pausedTotal || 0));
        const stale = p.pausedAt ? now - p.pausedAt > 2 * 3600000
            : p.duration ? el > p.duration + 10 * 60000 : el > 4 * 3600000;
        if (!stale) return { phase: 'focus', paused: !!p.pausedAt, el, left: p.duration ? p.duration - el : null, subject: p.subject, min: today };
    }
    if (p.status === 'break' && p.breakStart && now - p.breakStart < (p.breakLen || 0) + 10 * 60000) {
        return { phase: 'break', el: now - p.breakStart, min: today };
    }
    return { phase: 'idle', min: today };
}
const avColor = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `var(--s${h % 5})`; };
const avHtml = (p, uidv) => `<span class="av" style="background:${avColor(uidv)}">${esc((p?.name || '?').slice(0, 1))}</span>`;
const myName = () => (roomPref.name || currentUser?.displayName || '同學').slice(0, 20);
// 計時頁顯示：所有房間裡正在讀的人數（沒用過房間時回傳 null）
function roomLiveCount() {
    if (!currentUser || !roomsLoaded || !myRooms.length) return null;
    const now = Date.now();
    const uids = new Set(myRooms.flatMap(r => r.members || []));
    uids.delete(currentUser.uid);
    return [...uids].filter(u => liveStatus(profiles[u], now).phase === 'focus').length;
}

// 把自己的計時狀態寫到 profiles（只有用過讀書房間才會寫）
function publishProfile(force) {
    if (!currentUser || !fb || !roomPref.enabled) return;
    const t = todayStr();
    const hide = roomPref.hidden;
    const data = {
        name: myName(), hidden: !!hide,
        status: hide ? 'idle' : timer.phase,
        subject: !hide && timer.phase !== 'idle' ? (timer.subject ?? null) : null,
        startAt: !hide && timer.phase === 'focus' ? timer.startAt : null,
        pausedAt: !hide && timer.phase === 'focus' ? (timer.pausedAt || null) : null,
        pausedTotal: !hide && timer.phase === 'focus' ? (timer.pausedTotal || 0) : 0,
        duration: !hide && timer.phase === 'focus' ? (timer.duration || 0) : 0,
        breakStart: !hide && timer.phase === 'break' ? timer.breakStart : null,
        breakLen: !hide && timer.phase === 'break' ? timer.breakLen : 0,
        todayMin: Math.round(dayMinutes(t)), todayDate: t
    };
    const sig = JSON.stringify(data);
    if (!force && sig === lastProfile) return;
    lastProfile = sig;
    clearTimeout(profTimer);
    profTimer = setTimeout(() => {
        fb.fs.setDoc(fb.fs.doc(fb.db, 'profiles', currentUser.uid), { ...data, updatedAt: Date.now() })
            .catch(e => { console.warn('房間狀態更新失敗：', e); lastProfile = ''; });
    }, 300);
}

// 監聽房間列表與所有成員的狀態
function roomStart() {
    if (!currentUser || !fb || roomUnsub) return;
    const { fs, db } = fb;
    const q = fs.query(fs.collection(db, 'rooms'), fs.where('members', 'array-contains', currentUser.uid));
    roomUnsub = fs.onSnapshot(q, (snap) => {
        roomsLoaded = true;
        myRooms = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
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
            renderRoom();
        }, (err) => console.warn('成員狀態讀取失敗：', err)));
    }
}
function roomStop() {
    if (roomUnsub) { roomUnsub(); roomUnsub = null; }
    profUnsubs.forEach(u => u()); profUnsubs = []; profKey = '';
    myRooms = []; profiles = {}; roomsLoaded = false; roomView = pendingRoom = null;
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
    const text = `一起來讀書！在「學測倒數」的讀書房間輸入邀請碼 ${code} 加入「${r?.name || ''}」`;
    const url = location.origin + location.pathname;
    try {
        if (navigator.share) { await navigator.share({ title: '讀書房間邀請', text, url }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('已複製邀請訊息'); }
    catch (e) { toast(`邀請碼：${code}`); }
}

const MEDAL = ['#E9B154', '#C9CED6', '#C98A5A'];
const SEAT_C = 2 * Math.PI * 31;
function seatSub(s) {
    if (s.phase === 'focus') return s.subject != null ? `<span class="ss" style="color:var(--s${s.subject})">${SUBJECTS[s.subject]}${s.paused ? ' · 暫停' : ''}</span>` : `<span class="ss on">${s.paused ? '暫停中' : '專注中'}</span>`;
    if (s.phase === 'break') return '<span class="ss">休息中</span>';
    return '<span class="ss">未開始</span>';
}
function memberClock(s) {
    if (s.phase === 'focus') return fmtClock(s.left != null ? Math.max(0, s.left) : s.el);
    if (s.phase === 'break') return '休息 ' + fmtClock(s.el);
    return '今天 ' + fmtHM(s.min);
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

function renderRoom(errMsg) {
    const el = $('tab-room');
    if (!el || document.body.dataset.tab !== 'tab-room') return;
    $('pageTitle').textContent = '讀書房間';
    if (!currentUser) {
        setTopExtra('tab-room', '');
        el.dataset.view = '';
        el.innerHTML = `<div class="sub-wrap">
            <div class="room-empty"><p class="zh" style="font-size:18px;font-weight:700;margin:0">和朋友一起讀書</p>
            <p class="empty">建立房間、分享邀請碼，就能看到大家正在讀什麼、今天讀了多久。<br>需要先登入 Google 帳號。</p>
            <button class="btn btn-accent" data-room="login">登入</button></div></div>`;
        return;
    }
    if (!roomsLoaded) {
        el.dataset.view = '';
        el.innerHTML = `<div class="sub-wrap"><p class="ai-loading" style="margin-top:30px">${errMsg ? esc(errMsg) : '<span class="ai-spin"></span>載入房間中…'}</p></div>`;
        return;
    }
    const now = Date.now();
    const meUid = currentUser.uid;
    if (roomView) {
        const r = myRooms.find(x => x.id === roomView);
        if (!r) {
            if (roomView === pendingRoom) { el.dataset.view = ''; el.innerHTML = `<div class="sub-wrap"><p class="ai-loading" style="margin-top:30px"><span class="ai-spin"></span>進入房間中…</p></div>`; return; }
            roomView = null; return renderRoom();
        }
        $('pageTitle').textContent = r.name;
        setTopExtra('tab-room', `<button class="icon-btn" data-top="room-menu" aria-label="房間選項"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>`);
        const ms = (r.members || []).map(u => ({ u, p: profiles[u], s: liveStatus(profiles[u], now) }));
        const order = { focus: 0, break: 1, idle: 2 };
        const seats = ms.slice().sort((a, b) => order[a.s.phase] - order[b.s.phase] || (b.s.el || 0) - (a.s.el || 0));
        const total = (m) => Math.round(m.s.min + (m.s.phase === 'focus' ? m.s.el / 60000 : 0));   // 正在讀的那一輪也算進去
        const rank = ms.slice().sort((a, b) => total(b) - total(a));
        const maxMin = Math.max(1, ...rank.map(total));
        const studying = ms.filter(m => m.s.phase === 'focus').length;
        const cm = chats[r.id]?.msgs || [];
        const last = [...cm].reverse().find(m => !m.recalled);
        const unread = unreadOf(r.id);
        const chatBtn = `<button class="chat-entry" data-chat="${r.id}">
                <span class="ce-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/></svg></span>
                <span class="ce-tx"><b>聊天室</b><small>${last ? esc(`${last.uid === meUid ? '你' : (last.name || '同學')}：${last.img ? '傳了一張照片' : last.text}`) : '和房間裡的大家聊聊'}</small></span>
                ${unread ? `<span class="seg-n">${unread > 99 ? '99+' : unread}</span>` : ''}
                <svg class="go-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
            </button>`;
        el.dataset.view = 'people:' + r.id;
        el.innerHTML = `<div class="sub-wrap">
            <div class="room-status">
                ${studying ? `<span class="tag ok"><span class="live-dot"></span>${studying} 人在讀</span>` : '<span class="tag mute">目前沒人在讀</span>'}
                <span class="muted">${ms.length} 位成員</span>
                <span class="grow"></span>
                <button class="code-stub" data-room="share" aria-label="分享邀請碼 ${r.id}"><span class="num">${r.id}</span><span class="cs-r"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>邀請</span></button>
            </div>
            ${chatBtn}
            <div class="seats">${seats.map(m => {
                const fr = seatFrac(m.s);
                return `<div class="seat ${m.s.phase}" data-seat="${m.u}">
                    <div class="seat-av"><svg viewBox="0 0 68 68" aria-hidden="true"><circle class="st-track" cx="34" cy="34" r="31"/><circle class="st-bar" cx="34" cy="34" r="31" stroke-dasharray="${SEAT_C.toFixed(1)}" stroke-dashoffset="${(SEAT_C * (1 - fr)).toFixed(1)}"/></svg>
                        <span class="seat-face" style="background:${avColor(m.u)}">${esc(memberName(m).slice(0, 1))}</span></div>
                    <b class="sn">${esc(memberName(m))}${m.u === meUid ? '<small>（你）</small>' : ''}</b>
                    ${seatSub(m.s)}
                    <span class="sc num" data-clock="${m.u}">${memberClock(m.s)}</span>
                </div>`;
            }).join('')}</div>
            <section class="stats-sec">
                <div class="sec-head"><h3>今天排行</h3><span>正在讀的那一輪也算</span></div>
                ${rank.map((m, i) => `<div class="rank-row ${m.u === meUid ? 'me' : ''}">
                    <span class="rk num" ${i < 3 && total(m) ? `style="background:${MEDAL[i]};color:#050608"` : ''}>${i + 1}</span>
                    <span class="nm">${esc(memberName(m))}</span>
                    <span class="track"><i style="width:${(total(m) / maxMin * 100).toFixed(1)}%;background:${avColor(m.u)}"></i></span>
                    <span class="t num">${fmtHM(total(m))}</span>
                </div>`).join('')}
            </section>
            <p class="hint" style="margin-top:16px">房間裡的人看得到你的暱稱、正在讀的科目和今天的時數</p>
            <div class="sticky-cta"><button class="btn btn-accent btn-wide" data-room="focus"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>${timer.phase === 'focus' ? '回到計時' : '跟大家一起開始專注'}</button></div>
        </div>`;
        return;
    }
    setTopExtra('tab-room', `<button class="me-chip" data-top="me" aria-label="我的暱稱與隱身設定"><span class="av" style="background:${avColor(meUid)}">${esc(myName().slice(0, 1))}</span><span class="zh">${esc(myName())}</span></button>`);
    const tickets = `<div class="sec-head" style="margin:6px 0 14px"><h3>我的房間</h3><span>${myRooms.length ? myRooms.length + ' 間' : ''}</span></div>
        ${myRooms.length ? myRooms.map(r => {
            const ms = (r.members || []);
            const n = ms.filter(u => liveStatus(profiles[u], now).phase === 'focus').length;
            return `<button class="ticket ${n ? 'hot' : ''}" data-open="${r.id}">
                <span class="tk-main">
                    <b class="zh">${esc(r.name)}</b>
                    <span class="tk-row">${ticketAvs(ms)}${n ? `<span class="tag ok"><span class="live-dot"></span>${n} 人在讀</span>` : '<span class="tag mute">目前沒人在讀</span>'}</span>
                </span>
                <span class="tk-stub"><small>邀請碼</small><b class="num">${r.id}</b>${unreadOf(r.id) ? `<span class="seg-n tk-unread">${unreadOf(r.id)}</span>` : ''}</span>
            </button>`;
        }).join('') : '<p class="empty">還沒有房間，建立一個或用邀請碼加入</p>'}`;
    if (el.dataset.view === 'lobby' && $('ticketList')) { $('ticketList').innerHTML = tickets; return; }
    el.dataset.view = 'lobby';
    el.innerHTML = `<div class="sub-wrap">
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
    </div>`;
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
    Object.keys(chats).forEach(c => { if (!ids.has(c)) { chats[c].unsub && chats[c].unsub(); delete chats[c]; } });
    myRooms.forEach(r => { if (!chats[r.id]) chatListen(r.id); });
}
function chatListen(code) {
    const c = chats[code] = { msgs: [], first: true, unsub: null };
    const { fs, db } = fb;
    const q = fs.query(fs.collection(db, 'rooms', code, 'messages'), fs.orderBy('at', 'desc'), fs.limit(CHAT_LIMIT));
    c.unsub = fs.onSnapshot(q, (snap) => {
        const prevIds = new Set(c.msgs.map(m => m.id));
        c.msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
        const fresh = c.first ? [] : c.msgs.filter(m => !prevIds.has(m.id) && m.uid !== currentUser?.uid && !m.recalled);
        c.first = false;
        onChatUpdate(code, fresh);
    }, (err) => {
        console.warn('聊天室讀取失敗：', err);
        if (err.code === 'permission-denied' && chatRoom === code) toast('聊天室讀取被拒絕：請確認 Firestore 規則已更新');
    });
}
function chatStopAll() {
    Object.keys(chats).forEach(c => { chats[c].unsub && chats[c].unsub(); delete chats[c]; });
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
    if (document.visibilityState === 'visible') {
        toast(`${m.name || '同學'}：${body}`.slice(0, 40), { label: '查看', fn: () => openChat(code) });
        try { navigator.vibrate && navigator.vibrate(30); } catch (e) {}
    } else {
        document.title = `(${totalUnread()}) ${room?.name || BASE_TITLE}`;
        systemNotify(`${m.name || '同學'} · ${room?.name || '讀書房間'}`, body, code);
    }
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
        const opt = { body: body.slice(0, 120), tag: 'room-' + code, renotify: true, icon: 'icon-192.png', badge: 'favicon-32.png', data: { room: code } };
        if (navigator.serviceWorker?.controller) navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opt));
        else new Notification(title, opt);
    } catch (e) {}
}
navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.openRoom) { roomView = e.data.openRoom; showTab('tab-room'); openChat(e.data.openRoom); }
});

/* --- 全螢幕聊天室 --- */
function openChat(code) {
    const r = myRooms.find(x => x.id === code);
    if (!r || !fb || !currentUser) return;
    chatRoom = code; lastReadSent = 0; chatReads = {}; lastFit = '';
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
    $('notifyBar').hidden = !('Notification' in window) || Notification.permission !== 'default';
    renderChatList(true);
    markChatSeen();
    cleanupOldPhotos(code);
    if (matchMedia('(pointer: fine)').matches) $('chatInput').focus();
}
function closeChat() {
    if (!chatRoom) return;
    if (readsUnsub) readsUnsub();
    readsUnsub = null; chatRoom = null;
    $('chatInput').blur();
    const el = $('chatScreen');
    el.classList.remove('open', 'kb-open');
    el.style.height = ''; el.style.transform = '';
    document.body.classList.remove('chat-open');
    window.scrollTo(0, chatSavedScroll);
    document.title = BASE_TITLE;
    renderRoom(); updateChatBadges();
}
function renderChatHead() {
    const r = myRooms.find(x => x.id === chatRoom);
    if (!r) return;
    const n = (r.members || []).filter(u => liveStatus(profiles[u]).phase === 'focus').length;
    const html = `${(r.members || []).length} 位成員${n ? ` · <span class="live-dot"></span>${n} 人在讀` : ''}`;
    if ($('chatSub').dataset.h !== html) { $('chatSub').dataset.h = html; $('chatSub').innerHTML = html; }
}
// iPhone 鍵盤跳出來時，聊天室跟著可見範圍縮小，輸入框不會被蓋住
// 每一格動畫最多算一次，數值沒變就不動畫面（避免卡頓）
let fitRaf = 0, lastFit = '', chatSavedScroll = 0;
function fitChat() {
    cancelAnimationFrame(fitRaf);
    fitRaf = requestAnimationFrame(() => {
        const vv = window.visualViewport, el = $('chatScreen');
        if (!vv || !el.classList.contains('open')) return;
        const h = Math.round(Math.min(vv.height, window.innerHeight)), top = Math.max(0, Math.round(vv.offsetTop));
        const kb = window.innerHeight - vv.height > 120;   // 鍵盤是否打開
        const key = `${h},${top},${kb}`;
        if (key === lastFit) return;
        lastFit = key;
        const box = $('chatList');
        const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
        el.style.height = h + 'px';
        el.style.transform = top ? `translate3d(0, ${top}px, 0)` : '';
        el.classList.toggle('kb-open', kb);
        // 鍵盤收起後，iPhone 有時會讓整頁停在往上捲的位置，把它拉回來
        if (!kb && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0);
        if (atEnd) box.scrollTop = box.scrollHeight;
    });
}
window.visualViewport?.addEventListener('resize', fitChat);
window.visualViewport?.addEventListener('scroll', fitChat);
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
    if (latest > lastReadSent) {
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
const photoExpired = (m) => m.img && Date.now() - m.at > PHOTO_KEEP;
function msgBody(m) {
    if (m.img) return photoExpired(m) ? `<div class="bubble expired" data-mid="${m.id}">照片已過期</div>` : `<img class="chat-img" src="${esc(m.img)}" alt="照片" data-mid="${m.id}" loading="lazy">`;
    return `<div class="bubble" data-mid="${m.id}">${linkify(m.text || '')}</div>`;
}
function renderChatList(toEnd) {
    const box = $('chatList');
    if (!box || !chatRoom) return;
    const me = currentUser?.uid;
    const msgs = chats[chatRoom]?.msgs || [];
    const nearEnd = toEnd || box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    if (!msgs.length) {
        box.innerHTML = `<div class="chat-empty"><p>還沒有訊息</p><span>跟大家打聲招呼，或約好一起開始下一輪 ✏️</span></div>`;
        return;
    }
    let html = '', prev = null;
    msgs.forEach(m => {
        if (!prev || m.at - prev.at > 30 * 60000 || ymd(new Date(m.at)) !== ymd(new Date(prev.at))) html += `<p class="chat-sys">${chatDayLabel(m.at)}</p>`;
        if (m.recalled) {
            html += `<p class="chat-sys">${m.uid === me ? '你' : esc(m.name || '同學')} 收回了一則訊息</p>`;
            prev = m; return;
        }
        const mine = m.uid === me;
        const grouped = prev && !prev.recalled && prev.uid === m.uid && m.at - prev.at < 5 * 60000;
        const d = new Date(m.at);
        const tm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        let readN = 0;
        if (mine) Object.entries(chatReads).forEach(([u, at]) => { if (u !== me && at >= m.at) readN++; });
        const meta = `<span class="chat-meta">${mine && readN ? `<span>已讀 ${readN}</span>` : ''}<span class="num">${tm}</span></span>`;
        html += mine
            ? `<div class="msg mine ${grouped ? 'grouped' : ''}">${meta}${msgBody(m)}</div>`
            : `<div class="msg them ${grouped ? 'grouped' : ''}">
                ${grouped ? '<span class="chat-av-sp"></span>' : `<span class="chat-av" style="background:${avColor(m.uid)}">${esc((m.name || '?').slice(0, 1))}</span>`}
                <div class="msg-col">${grouped ? '' : `<p class="chat-who">${esc(m.name || '同學')}</p>`}<div class="msg-line">${msgBody(m)}${meta}</div></div>
            </div>`;
        prev = m;
    });
    box.innerHTML = html;
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
        await fb.fs.addDoc(fb.fs.collection(fb.db, 'rooms', chatRoom, 'messages'), data);
        enableRoom();
        scrollChatEnd(true);
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
    const r = myRooms.find(x => x.id === chatRoom);
    const canRecall = mine && Date.now() - m.at < RECALL_MS;
    const d = new Date(m.at);
    $('popMsg').className = 'pop-msg ' + (mine ? 'mine' : 'them');
    $('popMsg').innerHTML = `${mine ? '' : `<p class="chat-who">${esc(m.name || '同學')}</p>`}${msgBody(m)}<span class="pop-time num">${chatDayLabel(m.at)}</span>`;
    $('popCopy').hidden = !m.text;
    $('popSave').hidden = !m.img || photoExpired(m);
    $('popRecall').hidden = !canRecall;
    $('popDelete').hidden = mine || r?.owner !== currentUser?.uid;
    $('popNote').textContent = mine && !canRecall ? '超過 24 小時的訊息不能收回' : canRecall ? '收回後，大家會看到「你收回了一則訊息」' : '';
    $('msgPop').classList.toggle('mine', mine);
    $('msgPop').classList.add('open');
    try { navigator.vibrate && navigator.vibrate(12); } catch (e) {}
}
function closeMsgPop() { $('msgPop').classList.remove('open'); menuMsg = null; }
$('msgPop').addEventListener('click', async (e) => {
    const a = e.target.closest('[data-pop]')?.dataset.pop;
    if (!a) { if (!e.target.closest('.pop-menu, .pop-msg')) closeMsgPop(); return; }
    const m = menuMsg; closeMsgPop();
    if (!m) return;
    const ref = fb.fs.doc(fb.db, 'rooms', chatRoom, 'messages', m.id);
    try {
        if (a === 'copy') { await navigator.clipboard.writeText(m.text); toast('已複製'); }
        else if (a === 'save') { const l = document.createElement('a'); l.href = m.img; l.download = `讀書房間-${ymd(new Date(m.at))}.jpg`; l.click(); }
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
$('chatInput').addEventListener('blur', () => setTimeout(fitChat, 60));
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
$('notifyBtn').addEventListener('click', async () => {
    try { await Notification.requestPermission(); } catch (e) {}
    $('notifyBar').hidden = true;
    if (Notification.permission === 'granted') toast('已開啟通知');
});
$('notifyClose').addEventListener('click', () => { $('notifyBar').hidden = true; });
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
chatList.addEventListener('click', (e) => {
    if (pressed) { pressed = false; e.preventDefault(); return; }   // 長按放開，不要觸發點擊
    const im = e.target.closest('.chat-img');
    if (im) { $('imgView').src = im.src; openModal('imgModal'); }
});
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('msgPop').classList.contains('open')) { e.stopImmediatePropagation(); closeMsgPop(); }
    else if (chatRoom && !document.querySelector('.modal.open')) { e.stopImmediatePropagation(); closeChat(); }
}, true);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { document.title = BASE_TITLE; if (chatRoom) { renderChatList(false); markChatSeen(); } }
});

// 每秒更新房間裡的時鐘（不重畫整頁）
function roomTick() {
    if (chatRoom) renderChatHead();
    if (document.body.dataset.tab !== 'tab-room' || !roomView) return;
    const now = Date.now();
    document.querySelectorAll('#tab-room [data-clock]').forEach(n => {
        const st = liveStatus(profiles[n.dataset.clock], now);
        n.textContent = memberClock(st);
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
    if (act === 'back') showTab('tab-timer');
    else if (act === 'lobby') { roomView = null; renderRoom(); }
    else if (act === 'login') openModal('accountModal');
    else if (act === 'join') joinRoom(codeDraft);
    else if (act === 'create') openRoomModal('create');
    else if (act === 'rename') openRoomModal('rename');
    else if (act === 'leave') leaveRoom(roomView);
    else if (act === 'share') shareRoom(roomView);
    else if (act === 'focus') showTab('tab-timer');
});
$('tab-room').addEventListener('keydown', (e) => {
    if (e.target.id === 'roomCodeInput' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); joinRoom(codeDraft); }
});
$('tab-room').addEventListener('input', (e) => {
    if (e.target.id === 'roomCodeInput') {
        e.target.value = codeDraft = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        $('codeBoxes').innerHTML = codeBoxes(codeDraft);
    }
});
// 我的暱稱、隱身模式（房間列表右上角）
function openMeModal() {
    $('meName').value = myName();
    $('meHidden').checked = !!roomPref.hidden;
    openModal('meModal');
}
$('saveMeBtn').addEventListener('click', () => {
    const v = $('meName').value.trim().slice(0, 20);
    const hid = $('meHidden').checked;
    const changedHidden = hid !== !!roomPref.hidden;
    roomPref.name = v; roomPref.hidden = hid; saveRoomPref();
    closeModal('meModal');
    publishProfile();
    renderRoom();
    toast(changedHidden ? (hid ? '已開啟隱身模式' : '已關閉隱身模式') : '已更新暱稱');
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
            roomPref = { ...roomPref, enabled: true, name: roomPref.name || p.name || '', hidden: !!p.hidden };
            saveRoomPref();
        }
    } catch (e) { /* 離線或規則還沒設定 */ }
    publishProfile(true);
    // 用過讀書房間的話，登入後就開始監聽（計時頁可以顯示幾個人在讀）
    if (roomPref.enabled || document.body.dataset.tab === 'tab-room') roomStart();
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
function openInstall() { renderInstall(); openModal('installModal'); }
$('installModal').addEventListener('click', (e) => {
    const os = e.target.closest('[data-os]');
    if (os) { installOS = os.dataset.os; renderInstall(); return; }
    if (e.target.closest('[data-install-done]')) { lsSet(LS.install, '1'); closeModal('installModal'); }
});
$('installGuideBtn').addEventListener('click', () => { closeModal('accountModal'); openInstall(); });
// 第一次用手機瀏覽器打開時自動出現（已經從主畫面打開就不出現）
setTimeout(() => {
    if (localStorage.getItem(LS.install) || isStandalone() || !isMobile()) return;
    if (document.querySelector('.modal.open')) return;
    lsSet(LS.install, '1');
    openInstall();
}, 1200);

/* =====================================================
 * 帳號畫面
 * ===================================================== */
function renderAccount(statusText) {
    const u = currentUser;
    $('avatarImg').src = u?.photoURL || defaultAvatar();
    $('accountAvatar').src = u?.photoURL || defaultAvatar();
    $('accountName').textContent = u ? (u.displayName || u.email || '已登入') : '未登入';
    $('accountStatus').textContent = statusText || (u ? '雲端同步已開啟' : (fb ? '資料只存在這台裝置' : '離線中，資料只存在這台裝置'));
    $('accountHint').style.display = u ? 'none' : '';
    $('loginBtn').textContent = u ? '登出' : '使用 Google 登入';
    $('loginBtn').classList.toggle('btn-accent', !u);
    $('loginBtn').classList.toggle('btn-danger', !!u);
}
$('accountBtn').addEventListener('click', () => { $('installGuideBtn').hidden = isStandalone(); openModal('accountModal'); });

// 禁止雙指縮放（iOS Safari 不吃 viewport 設定，要另外擋）
['gesturestart', 'gesturechange', 'gestureend'].forEach(t =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
// 電腦上擋掉 Ctrl/⌘ + 滾輪、觸控板縮放
document.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
});

// 往下捲動時頂部列才出現底色
const topbar = document.querySelector('.topbar');
const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 4);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* =====================================================
 * 啟動：先用本機資料畫出畫面
 * ===================================================== */
state = loadLocal();
if (removedDupes) saveLocal();
renderExamChips();
// 關掉 App 期間一輪已經結束的話，打開時直接記錄（不響）
if (timer.phase === 'focus' && timer.duration && !timer.pausedAt && focusElapsed() >= timer.duration) finishFocus(true, true);
if (timer.phase === 'break' && Date.now() - timer.breakStart >= timer.breakLen && !timer.chimed) { timer.chimed = true; saveTimer(); }
if (timer.phase === 'focus' && !timer.pausedAt) requestWake();
tick();
setInterval(() => { tick(); timerTick(); roomTick(); }, 1000);
renderAll();
renderAccount();
showTab(localStorage.getItem(LS.tab) || 'tab-countdown');

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
async function initFirebase() {
    try {
        const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VER}`;
        const [appM, authM, fsM] = await Promise.all([
            import(`${base}/firebase-app.js`),
            import(`${base}/firebase-auth.js`),
            import(`${base}/firebase-firestore.js`)
        ]);
        const app = appM.initializeApp(FIREBASE_CONFIG);
        // App Check：證明請求來自這個網站，保護 AI 額度（要先在主控台註冊 reCAPTCHA）
        if (RECAPTCHA_SITE_KEY) {
            try {
                if (['localhost', '127.0.0.1'].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
                const acM = await import(`${base}/firebase-app-check.js`);
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
        authM.getRedirectResult(auth).catch(err => console.warn('跳轉登入結果：', err));
        authM.onAuthStateChanged(auth, onAuthChanged);
    } catch (e) {
        console.warn('Firebase 載入失敗（可能離線），只使用本機儲存：', e);
        renderAccount();
    }
}

function onAuthChanged(user) {
    currentUser = user;
    cloudReady = false;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (!user) {
        roomStop(); lastProfile = '';
        state = loadLocal();
        renderAll(); renderAccount(); renderRoom();
        return;
    }
    loadRoomProfile(user);
    renderAccount('同步中…');
    let first = true;
    const ref = fb.fs.doc(fb.db, 'users', user.uid);
    // 即時監聽：手機改了，電腦畫面也會自動更新
    unsubscribe = fb.fs.onSnapshot(ref, (snap) => {
        if (snap.metadata.hasPendingWrites) return;          // 自己剛寫入的，不用重畫
        if (first && snap.metadata.fromCache && !snap.exists()) return; // 本機沒快取，等雲端回應
        const cloud = snap.exists() ? normalize(snap.data()) : null;
        const dupes = removedDupes;
        if (first) {
            first = false;
            cloudReady = true;
            const local = loadLocal();
            if (cloud && !isEmpty(cloud)) {
                state = cloud;
                const missing = earlySessions.filter(x => !state.sessions.some(y => y.id === x.id));
                if (missing.length) { state.sessions.push(...missing); save(); }
            } else if (!isEmpty(local)) {
                state = local;   // 雲端是空的：把登入前的本機資料上傳，避免遺失
                save();
                toast('已把這台裝置的資料上傳到雲端');
            } else {
                state = normalize({});
            }
        } else if (cloud) {
            state = cloud;
        }
        if (dupes && cloud) { save(); toast(`已移除 ${dupes} 個和考試重複的行程`); }
        renderAll();
        publishProfile();   // 別台裝置新增了讀書紀錄時，更新房間裡的今日時數
        renderAccount(snap.metadata.fromCache ? '離線中，連上網路後會自動同步' : '');
    }, (err) => {
        console.error('雲端讀取失敗：', err);
        renderAccount('雲端讀取失敗，請檢查網路');
    });
}

$('loginBtn').addEventListener('click', async () => {
    if (!fb) { toast('目前無法連線，請連上網路後再試'); return; }
    const { auth, provider, authM } = fb;
    if (currentUser) {
        if (confirm('確定要登出嗎？')) { await authM.signOut(auth); closeModal('accountModal'); }
        return;
    }
    try {
        await authM.signInWithPopup(auth, provider);
        closeModal('accountModal');
    } catch (err) {
        // 加到主畫面的 App 常會擋彈出視窗，改用整頁跳轉登入
        const useRedirect = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'];
        if (useRedirect.includes(err.code)) authM.signInWithRedirect(auth, provider);
        else if (err.code !== 'auth/popup-closed-by-user') alert('登入失敗：' + err.message);
    }
});

initFirebase();
