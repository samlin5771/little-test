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
    projectId: "study-countdown"
};
const FIREBASE_VER = '10.8.0';

const LS = {
    todos: 'study_todos', weekly: 'study_weekly', events: 'study_events',
    exam: 'selectedExamKey', theme: 'study_theme', tab: 'study_tab', accent: 'study_accent',
    sessions: 'study_sessions', timer: 'study_timer', tpref: 'study_timer_pref'
};
const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='#E9B154'/>" +
    "<circle cx='20' cy='15' r='7' fill='#16140F'/><path d='M6 37c2-8 8-11 14-11s12 3 14 11' fill='#16140F'/></svg>");

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
    const navId = id === 'tab-stats' ? 'tab-timer' : id;   // 統計頁屬於「計時」分頁
    const btn = [...tabBtns].find(b => b.dataset.tab === navId) || tabBtns[0];
    tabBtns.forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === id));
    document.body.dataset.tab = id;
    $('pageTitle').textContent = id === 'tab-stats' ? '讀書統計' : btn.dataset.title;
    lsSet(LS.tab, id);
    applyFocusMode();
    window.scrollTo({ top: 0 });
}
tabBtns.forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

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
    if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => closeModal(m.id));
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

// 今日進度：讀取每週進度表中「今天」有寫內容的格子
function renderToday() {
    const t = todayStr();
    const items = [];
    SUBJECTS.forEach((subj, s) => {
        for (let slot = 0; slot < SLOTS; slot++) {
            const key = `${t}_${s}_${slot}`;
            const d = state.weekly[key];
            if (d && d.text) items.push({ key, subj, text: d.text, done: !!d.done });
        }
    });
    const done = items.filter(i => i.done).length;
    $('todayCount').textContent = items.length ? `${done} / ${items.length}` : '';
    $('todayList').innerHTML = items.length
        ? items.map(i => `
            <li class="check-item ${i.done ? 'done' : ''}">
                <input type="checkbox" class="checkbox" data-key="${i.key}" ${i.done ? 'checked' : ''} aria-label="完成 ${esc(i.subj)}">
                <span class="text"><span class="subj">${esc(i.subj)}</span>${esc(i.text)}</span>
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
    $('thisWeekBtn').parentElement.style.display = todayIdx >= 0 ? 'none' : '';
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
const saveTimer = () => lsSet(LS.timer, timer);
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
    return rec;
}
function removeSession(id, msg) {
    const idx = state.sessions.findIndex(x => x.id === id);
    if (idx < 0) return;
    const [item] = state.sessions.splice(idx, 1);
    save(); renderTimer(); renderStats();
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
        el.innerHTML = `<div class="timer-wrap">
            <div class="timer-head">
                <p class="label">讀哪一科</p>
                <button class="btn btn-small" data-act="stats">${ICON_CHART.replace('<svg', '<svg style="width:16px;height:16px"')}統計</button>
            </div>
            <div class="subj-grid">${subjButtons(tpref.subject, 'data-subj')}</div>
            <div class="seg" role="tablist" aria-label="計時模式" style="margin-top:12px">${MODES.map((x, i) =>
                `<button role="tab" aria-selected="${i === tpref.mode}" class="${i === tpref.mode ? 'active' : ''}" data-mode="${i}">${x.label}</button>`).join('')}</div>
            <div class="ring-wrap">${ringSvg()}
                <div class="ring-center"><span class="ring-time num">${m.focus ? pad(m.focus) + ':00' : '00:00'}</span><span class="ring-sub">${m.hint}</span></div>
            </div>
            <p class="task-line">${task && !task.done ? `今天的${SUBJECTS[tpref.subject]}進度：<b>${esc(task.text)}</b>` : ''}</p>
            <button class="btn btn-accent btn-wide" data-act="start" style="margin-top:14px">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>開始專注
            </button>
            <div class="stat3">
                <div><strong class="num">${hmHtml(dayMinutes(t))}</strong><span>今天</span></div>
                <div><strong class="num">${roundsOn(t)}<small>輪</small></strong><span>番茄鐘</span></div>
                <div><strong class="num hot">${studyStreak()}<small>天</small></strong><span>連續讀書</span></div>
            </div>
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

    // 差異
    const diff = total - prevTotal;
    let deltaHtml = '';
    if (total || prevTotal) {
        deltaHtml = diff > 0
            ? `<svg class="up" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>比上${word}多 ${fmtHM(diff)}`
            : diff < 0 ? `比上${word}少 ${fmtHM(-diff)}` : `和上${word}一樣`;
        deltaHtml += ` · 日平均 ${fmtHM(avg)}`;
    }

    // 圖表刻度（整點小時）
    const maxDay = Math.max(0, ...sums);
    let topH = Math.max(1, Math.ceil(maxDay / 60));
    const step = topH > 6 ? 2 : 1;
    topH = Math.ceil(topH / step) * step;
    const H = 200, topMin = topH * 60;
    let grid = '', ylab = '';
    for (let h = 0; h <= topH; h += step) {
        const y = h / topH * 100;
        grid += `<div class="chart-grid ${h === 0 ? 'base' : ''}" style="bottom:${y}%"></div>`;
        ylab += `<span style="bottom:${y}%">${h}h</span>`;
    }
    const bars = keys.map((k, i) => {
        const row = map[k];
        const segs = row.map((v, s) => v > 0 ? `<i style="height:${Math.max(2, v / topMin * H - 2).toFixed(1)}px;background:var(--s${s})"></i>` : '').join('');
        const d = days[i];
        const label = `${fmtMD(d)} 星期${WEEK_ZH[d.getDay()]}：${fmtHM(sums[i])}`;
        return `<button class="bar-col ${k === statSel ? 'sel' : ''}" data-day="${k}" title="${label}" aria-label="${label}"><span class="bar-stack">${segs}</span></button>`;
    }).join('');
    const xlab = days.map((d, i) => {
        const k = keys[i];
        let txt = statRange === 'week' ? WEEK_ZH[d.getDay()] : ([1, 5, 10, 15, 20, 25, 30].includes(d.getDate()) ? d.getDate() : '');
        if (statRange === 'week' && k === t) txt += '（今）';
        return `<span class="${k === statSel ? 'sel' : ''}">${txt}</span>`;
    }).join('');

    // 選中那天
    const sd = parseYmd(statSel);
    const selRow = map[statSel];
    const selSum = selRow.reduce((a, b) => a + b, 0);
    const selDetail = selRow.map((v, s) => v ? `${SUBJECTS[s]} ${fmtHM(v)}` : '').filter(Boolean).join('　') || '這天沒有讀書紀錄';
    const logs = state.sessions.filter(x => sessionDay(x) === statSel).sort((a, b) => a.start - b.start);

    // 各科
    const subjTot = SUBJECTS.map((_, s) => keys.reduce((a, k) => a + map[k][s], 0));
    const maxS = Math.max(1, ...subjTot);
    const goalDays = sums.filter(v => v >= tpref.goal).length;
    const rounds = state.sessions.filter(x => x.pomo && keys.includes(sessionDay(x))).length;

    el.innerHTML = `<div class="stats-wrap">
        <button class="btn btn-small back-btn" data-sact="back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>返回計時</button>
        <div class="stats-head">
            <button class="icon-btn" data-sact="prev" aria-label="上一${word}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
            <div class="period"><b>${periodTitle}</b><span class="num">${fmtMD(days[0])} – ${fmtMD(days[days.length - 1])}</span></div>
            <button class="icon-btn" data-sact="next" aria-label="下一${word}" ${statOffset >= 0 ? 'disabled style="opacity:.3"' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
        </div>
        <div class="stats-range"><div class="seg two" role="tablist" aria-label="統計範圍">
            <button role="tab" aria-selected="${statRange === 'week'}" class="${statRange === 'week' ? 'active' : ''}" data-range="week">週</button>
            <button role="tab" aria-selected="${statRange === 'month'}" class="${statRange === 'month' ? 'active' : ''}" data-range="month">月</button>
        </div></div>

        <section style="margin-top:22px">
            <p class="label">${periodTitle}總共讀了</p>
            <div class="hero-total num">${Math.floor(total / 60) ? `<b>${Math.floor(total / 60)}</b><span>時</span>` : ''}<b>${total % 60}</b><span>分</span></div>
            <p class="delta">${deltaHtml}</p>
        </section>

        <section aria-label="每天讀書時數，依科目堆疊">
            <div class="chart">
                <div class="chart-y num">${ylab}</div>
                <div class="chart-plot">${grid}<div class="chart-bars">${bars}</div></div>
            </div>
            <div class="chart-x">${xlab}</div>
            <div class="legend-row">${SUBJECTS.map((n, s) => `<span><i class="sdot s${s}"></i>${n}</span>`).join('')}</div>
        </section>

        <section class="block">
            <div class="block-head">
                <strong class="zh" style="font-size:15px">${fmtMD(sd)} 星期${WEEK_ZH[sd.getDay()]}${statSel === t ? '（今天）' : ''}</strong>
                <span class="num" style="font-weight:700">${fmtHM(selSum)}</span>
            </div>
            <p class="empty" style="padding:0 0 6px">${selDetail}</p>
            <ul class="event-list">${logs.map(x => {
                const d = new Date(x.start);
                return `<li class="log-row"><span class="at">${pad(d.getHours())}:${pad(d.getMinutes())}</span><i class="sdot s${x.subject}"></i><span class="nm">${SUBJECTS[x.subject]}${x.pomo ? '' : ''}</span><span class="mn">${fmtHM(x.minutes)}</span><button class="del-btn" data-del="${x.id}" aria-label="刪除這筆紀錄">${ICON_X}</button></li>`;
            }).join('')}</ul>
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-small" data-sact="add">＋ 補登時間</button>
                <button class="btn btn-small" data-sact="share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>分享這天</button>
            </div>
        </section>

        <section class="block">
            <p class="label" style="margin-bottom:10px">各科時數</p>
            ${SUBJECTS.map((n, s) => `<div class="subj-row">
                <span class="nm">${n}</span>
                <span class="track"><i style="width:${(subjTot[s] / maxS * 100).toFixed(1)}%;background:var(--s${s})"></i></span>
                <span class="t num">${fmtHM(subjTot[s])}</span>
                <span class="p num">${total ? Math.round(subjTot[s] / total * 100) : 0}%</span>
            </div>`).join('')}
        </section>

        <div class="stat3">
            <div><strong class="num hot">${studyStreak()}<small>天</small></strong><span>連續讀書</span></div>
            <div><strong class="num">${rounds}<small>輪</small></strong><span>番茄鐘</span></div>
            <div><strong class="num">${goalDays}<small>/ ${countedDays || days.length}</small></strong>
                <span>達成每日 <select class="goal-select" id="goalSelect" aria-label="每日目標">${GOALS.map(g => `<option value="${g}" ${g === tpref.goal ? 'selected' : ''}>${g / 60} 小時</option>`).join('')}</select></span></div>
        </div>
    </div>`;
}

$('tab-stats').addEventListener('click', (e) => {
    const day = e.target.closest('[data-day]');
    if (day) { statSel = day.dataset.day; renderStats(); return; }
    const range = e.target.closest('[data-range]');
    if (range) { statRange = range.dataset.range; statOffset = 0; statSel = null; renderStats(); return; }
    const del = e.target.closest('[data-del]');
    if (del) { removeSession(del.dataset.del); return; }
    const act = e.target.closest('[data-sact]')?.dataset.sact;
    if (act === 'prev') { statOffset--; statSel = null; renderStats(); }
    else if (act === 'next' && statOffset < 0) { statOffset++; statSel = null; renderStats(); }
    else if (act === 'add') openLogModal();
    else if (act === 'back') showTab('tab-timer');
    else if (act === 'share') openShareCard(statSel);
});
$('tab-stats').addEventListener('change', (e) => {
    if (e.target.id === 'goalSelect') { tpref.goal = Number(e.target.value); saveTpref(); renderStats(); }
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
    if (isTyping(document.activeElement) || document.querySelector('.modal.open')) return;
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
 * 帳號畫面
 * ===================================================== */
function renderAccount(statusText) {
    const u = currentUser;
    $('avatarImg').src = u?.photoURL || DEFAULT_AVATAR;
    $('accountAvatar').src = u?.photoURL || DEFAULT_AVATAR;
    $('accountName').textContent = u ? (u.displayName || u.email || '已登入') : '未登入';
    $('accountStatus').textContent = statusText || (u ? '雲端同步已開啟' : (fb ? '資料只存在這台裝置' : '離線中，資料只存在這台裝置'));
    $('accountHint').style.display = u ? 'none' : '';
    $('loginBtn').textContent = u ? '登出' : '使用 Google 登入';
    $('loginBtn').classList.toggle('btn-accent', !u);
    $('loginBtn').classList.toggle('btn-danger', !!u);
}
$('accountBtn').addEventListener('click', () => openModal('accountModal'));

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
setInterval(() => { tick(); timerTick(); }, 1000);
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
        fb = { auth, provider, authM, db, fs: fsM };
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
        state = loadLocal();
        renderAll(); renderAccount();
        return;
    }
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
