/* =====================================================
 * v73 管理者畫面（只有管理者帳號打得開；一般人不會下載這個檔案，網站速度不受影響）
 *   資料都透過伺服器（Cloud Functions）拿：伺服器會先確認是管理者，才會回傳
 *   分頁：總覽、檢舉、公告、房間、錯誤
 * ===================================================== */
const ICON = {
    back: '<path d="M15 6l-6 6 6 6"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    flag: '<path d="M5 21V4h11l-1.5 4L16 12H5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.5.2 4 1.9 4.5 4.9"/>',
    room: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5l1.5 2M15 5l-1.5 2M3 13h4M17 13h4M4 19l3.5-2M20 19l-3.5-2M4 7l3.5 2M20 7l-3.5 2"/>',
    mega: '<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17.5 9a4 4 0 0 1 0 6"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    mute: '<path d="M4 10v4h3l5 4V6l-5 4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    photo: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    close: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z"/>'
};
const svg = (k, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const TABS = [['home', '總覽'], ['reports', '檢舉'], ['ann', '公告'], ['rooms', '房間'], ['errors', '錯誤'], ['log', '紀錄']];
const REASON_C = { '騷擾或霸凌': 'r', '色情或不雅內容': 'r', '仇恨或歧視': 'r', '暴力或威脅': 'r', '詐騙或廣告': 'y', '其他不當內容': 'g' };
const ANN_KIND = { info: ['一般', '新功能、提醒'], warn: ['重要', '一定要看到的事'], fix: ['維修', '暫停服務、更新'] };

let C = null;              // 主程式給的工具：$、esc、toast、call（呼叫伺服器）
let tab = 'home', repView = 'open', errView = 'open', logView = 'log', roomQ = '', liveT = 0;
let D = { home: null, reports: null, ann: null, rooms: null, errors: null, log: null };
let loading = {};

function css() {
    if (document.getElementById('admCss')) return;
    const s = document.createElement('style'); s.id = 'admCss';
    s.textContent = `
.adm-head .grow { flex: 1; }
.adm-tabs { position: sticky; top: 0; z-index: 2; display: flex; gap: 6px; overflow-x: auto; padding: 12px 0; background: var(--bg); scrollbar-width: none; }
.adm-tabs::-webkit-scrollbar { display: none; }
.adm-tabs button { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: 17px; border: 1px solid var(--line); background: none; color: var(--text); font: 600 13.5px 'Noto Sans TC', sans-serif; }
.adm-tabs button.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); }
.adm-tabs b { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--exam); color: #fff; font: 700 11px/18px Manrope, sans-serif; text-align: center; }
.adm-sec { margin: 6px 0 22px; }
.adm-sec > h3 { display: flex; align-items: baseline; gap: 8px; margin: 0 0 10px 4px; font: 700 12.5px 'Noto Sans TC', sans-serif; color: var(--muted); letter-spacing: .06em; }
.adm-sec > h3 small { margin-left: auto; font-weight: 500; letter-spacing: 0; color: var(--faint); }
.adm-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 560px) { .adm-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.adm-stat { padding: 14px 14px 12px; border-radius: 18px; border: 1px solid var(--line); background: var(--surface); font-family: 'Noto Sans TC', sans-serif; min-width: 0; }
.adm-stat .ic { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-text); margin-bottom: 10px; }
.adm-stat .ic svg { width: 16px; height: 16px; }
.adm-stat b { display: block; font: 700 26px/1.1 Manrope, sans-serif; letter-spacing: -.01em; }
.adm-stat b small { font: 600 13px 'Noto Sans TC', sans-serif; margin-left: 3px; color: var(--muted); }
.adm-stat span { display: block; margin-top: 3px; font-size: 12.5px; color: var(--muted); }
.adm-stat em { font-style: normal; color: var(--mark-green); font-weight: 600; }
.adm-chart { padding: 14px 16px 10px; border-radius: 18px; border: 1px solid var(--line); background: var(--surface); }
.adm-bars { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; align-items: end; height: 110px; }
.adm-bar { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; font: 600 11px Manrope, sans-serif; color: var(--muted); }
.adm-bar i { width: 100%; max-width: 30px; border-radius: 6px 6px 3px 3px; background: rgba(var(--accent-rgb), .45); min-height: 3px; }
.adm-bar.today i { background: var(--accent); }
.adm-bar.today { color: var(--text); }
.adm-xs { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-top: 6px; text-align: center; font: 11px 'Noto Sans TC', sans-serif; color: var(--faint); }
.adm-card { border: 1px solid var(--line); border-radius: 18px; background: var(--surface); overflow: hidden; }
.adm-link { width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: none; background: none; color: var(--text); text-align: left; font: 15px 'Noto Sans TC', sans-serif; }
.adm-link + .adm-link { border-top: 1px solid var(--line); }
.adm-link .ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; background: var(--surface-2, rgba(127,127,127,.12)); color: var(--muted); }
.adm-link .ic.hot { background: var(--exam-soft); color: var(--exam-text); }
.adm-link .ic svg { width: 17px; height: 17px; }
.adm-link .tx { flex: 1; min-width: 0; }
.adm-link .tx small { display: block; margin-top: 2px; font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.adm-link > svg { width: 16px; height: 16px; color: var(--faint); flex-shrink: 0; }
.adm-seg { display: inline-grid; grid-auto-flow: column; padding: 3px; border-radius: 18px; border: 1px solid var(--line); margin: 0 0 12px; }
.adm-seg button { height: 30px; padding: 0 14px; border: none; border-radius: 15px; background: none; color: var(--muted); font: 600 13px 'Noto Sans TC', sans-serif; }
.adm-seg button.on { background: var(--modal-bg); color: var(--text); box-shadow: 0 1px 4px rgba(0,0,0,.12); }
.adm-rep { padding: 14px 16px; font-family: 'Noto Sans TC', sans-serif; }
.adm-rep + .adm-rep { border-top: 1px solid var(--line); }
.adm-rep-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: var(--muted); }
.adm-tag { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 11px; font-size: 12px; font-weight: 700; }
.adm-tag.r { background: var(--exam-soft); color: var(--exam-text); }
.adm-tag.y { background: var(--mark-yellow-bg); color: var(--mark-yellow); }
.adm-tag.g { background: var(--surface-2, rgba(127,127,127,.14)); color: var(--muted); }
.adm-tag.ok { background: var(--mark-green-bg); color: var(--mark-green); }
.adm-rep-top .t { margin-left: auto; }
.adm-who { display: flex; align-items: center; gap: 8px; margin: 10px 0 6px; font-size: 14px; }
.adm-av { width: 26px; height: 26px; border-radius: 13px; flex-shrink: 0; display: grid; place-items: center; color: #fff; font: 700 12px 'Noto Sans TC', sans-serif; }
.adm-who small { color: var(--muted); font-size: 12.5px; }
.adm-who .warn { color: var(--exam-text); font-weight: 600; }
.adm-quote { margin: 0 0 12px; padding: 10px 12px; border-radius: 12px; background: var(--modal-bg); border: 1px solid var(--line); font-size: 14.5px; line-height: 1.6; word-break: break-word; }
.adm-quote.ph { display: flex; align-items: center; gap: 8px; color: var(--muted); }
.adm-quote.ph svg { width: 18px; height: 18px; }
.adm-acts { display: flex; gap: 8px; flex-wrap: wrap; }
.adm-acts .btn { min-height: 36px; padding: 0 14px; font-size: 13.5px; gap: 6px; display: inline-flex; align-items: center; }
.adm-acts .btn svg { width: 15px; height: 15px; }
.adm-acts .btn.danger { color: var(--exam-text); border-color: rgba(217, 45, 45, .35); }
.adm-done { margin-top: 4px; font-size: 12.5px; color: var(--muted); }
.adm-empty { padding: 36px 16px; text-align: center; color: var(--faint); font: 14px 'Noto Sans TC', sans-serif; }
.adm-empty svg { width: 34px; height: 34px; display: block; margin: 0 auto 8px; color: var(--mark-green); }
.adm-ann-prev { margin-bottom: 14px; }
.ann-bar-demo { pointer-events: none; }
.adm-form { padding: 16px; font-family: 'Noto Sans TC', sans-serif; }
.adm-form textarea { width: 100%; min-height: 76px; resize: vertical; border: 1px solid var(--line); background: var(--modal-bg); color: var(--text); border-radius: 14px; padding: 11px 14px; font: 16px/1.5 'Noto Sans TC', sans-serif; outline: none; }
.adm-form textarea:focus, .adm-form input:focus { border-color: var(--accent); }
.adm-count { text-align: right; font-size: 12px; color: var(--faint); margin: 4px 2px 12px; }
.adm-kinds { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
.adm-kind { padding: 10px 8px; border-radius: 14px; border: 1.5px solid var(--line); background: none; color: var(--text); text-align: center; font: 14px 'Noto Sans TC', sans-serif; }
.adm-kind small { display: block; font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.adm-kind.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-text); font-weight: 700; }
.adm-dur { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
.adm-dur button { height: 32px; padding: 0 13px; border-radius: 16px; border: 1px solid var(--line); background: none; color: var(--text); font: 13px 'Noto Sans TC', sans-serif; }
.adm-dur button.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-text); font-weight: 700; }
.adm-form .lbl { display: block; font-size: 12.5px; color: var(--muted); margin: 0 0 6px 2px; }
.adm-form .btns { display: flex; gap: 8px; justify-content: flex-end; }
.adm-hist { padding: 12px 16px; font: 14px 'Noto Sans TC', sans-serif; }
.adm-hist + .adm-hist { border-top: 1px solid var(--line); }
.adm-hist small { display: block; margin-top: 3px; font-size: 12px; color: var(--muted); }
.adm-search { width: 100%; height: 42px; border: 1px solid var(--line); border-radius: 21px; padding: 0 16px; background: var(--surface); color: var(--text); font: 15px 'Noto Sans TC', sans-serif; margin-bottom: 12px; outline: none; }
.adm-room { display: flex; align-items: center; gap: 12px; padding: 13px 16px; font-family: 'Noto Sans TC', sans-serif; }
.adm-room + .adm-room { border-top: 1px solid var(--line); }
.adm-room .tx { flex: 1; min-width: 0; }
.adm-room .tx b { font-size: 15px; }
.adm-room .tx code { margin-left: 6px; font: 600 12px Manrope, monospace; color: var(--muted); letter-spacing: .06em; }
.adm-room .tx small { display: block; margin-top: 3px; font-size: 12.5px; color: var(--muted); }
.adm-room .tx small .warn { color: var(--exam-text); font-weight: 600; }
.adm-room .btn { min-height: 34px; padding: 0 12px; font-size: 13px; flex-shrink: 0; }
.adm-err { padding: 13px 16px; font-family: 'Noto Sans TC', sans-serif; }
.adm-err + .adm-err { border-top: 1px solid var(--line); }
.adm-err-top { display: flex; align-items: flex-start; gap: 10px; }
.adm-err-n { flex-shrink: 0; min-width: 40px; height: 26px; padding: 0 8px; border-radius: 13px; background: var(--exam-soft); color: var(--exam-text); font: 700 13px/26px Manrope, sans-serif; text-align: center; }
.adm-err-n.low { background: var(--surface-2, rgba(127,127,127,.14)); color: var(--muted); }
.adm-err-msg { flex: 1; min-width: 0; font: 600 13.5px/1.5 ui-monospace, Menlo, monospace; word-break: break-word; }
.adm-err small { display: block; margin: 5px 0 0 50px; font-size: 12px; color: var(--muted); line-height: 1.6; }
.adm-err details { margin: 8px 0 0 50px; }
.adm-err summary { font-size: 12.5px; color: var(--accent-text); cursor: pointer; }
.adm-err pre { margin: 6px 0 0; padding: 10px; border-radius: 10px; background: var(--modal-bg); border: 1px solid var(--line); font: 11.5px/1.5 ui-monospace, Menlo, monospace; white-space: pre-wrap; word-break: break-all; max-height: 180px; overflow: auto; }
.adm-err .adm-acts { margin: 10px 0 0 50px; }
.adm-live { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 20px; border: 1px solid rgba(16, 185, 129, .35); background: var(--mark-green-bg); margin-bottom: 10px; font-family: 'Noto Sans TC', sans-serif; }
.adm-live .dot { width: 12px; height: 12px; border-radius: 6px; background: var(--mark-green); flex-shrink: 0; box-shadow: 0 0 0 0 rgba(16, 185, 129, .6); animation: admLive 1.8s ease-out infinite; }
@keyframes admLive { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, .55); } 100% { box-shadow: 0 0 0 12px rgba(16, 185, 129, 0); } }
@media (prefers-reduced-motion: reduce) { .adm-live .dot { animation: none; } }
.adm-live .tx { flex: 1; min-width: 0; }
.adm-live b { font: 700 30px/1 Manrope, sans-serif; }
.adm-live b small { font: 600 14px 'Noto Sans TC', sans-serif; margin-left: 4px; color: var(--muted); }
.adm-live .tx > span { display: block; margin-top: 4px; font-size: 13px; color: var(--muted); }
.adm-live .side { text-align: right; font-size: 12.5px; color: var(--muted); line-height: 1.7; flex-shrink: 0; }
.adm-live .side b { font-size: 16px; color: var(--text); }
.adm-btns { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.adm-btns button { height: 32px; padding: 0 12px; border-radius: 16px; border: 1px solid var(--line); background: none; color: var(--text); font: 13px 'Noto Sans TC', sans-serif; }
.adm-btns button.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-text); font-weight: 700; }
.adm-form input.adm-in { width: 100%; height: 42px; border: 1px solid var(--line); background: var(--modal-bg); color: var(--text); border-radius: 12px; padding: 0 14px; font: 15px 'Noto Sans TC', sans-serif; outline: none; margin-bottom: 16px; }
.adm-log { display: flex; gap: 12px; padding: 12px 16px; font-family: 'Noto Sans TC', sans-serif; }
.adm-log + .adm-log { border-top: 1px solid var(--line); }
.adm-log .ic { width: 30px; height: 30px; border-radius: 10px; flex-shrink: 0; display: grid; place-items: center; background: var(--surface-2, rgba(127,127,127,.12)); color: var(--muted); }
.adm-log .ic.r { background: var(--exam-soft); color: var(--exam-text); }
.adm-log .ic svg { width: 16px; height: 16px; }
.adm-log .tx { flex: 1; min-width: 0; font-size: 14px; line-height: 1.55; }
.adm-log .tx small { display: block; font-size: 12px; color: var(--muted); }
.adm-log .tx q { color: var(--muted); }
.adm-warn { color: var(--exam-text) !important; word-break: break-word; }
.adm-foot { margin: 6px 4px 0; font: 12px 'Noto Sans TC', sans-serif; color: var(--faint); line-height: 1.6; }
.adm-skel { height: 90px; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); animation: admPulse 1.2s ease-in-out infinite alternate; }
@keyframes admPulse { from { opacity: .5; } to { opacity: 1; } }
.adm-confirm { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,.45); }
.adm-confirm .sheet { transform: none; max-width: 360px; }
.adm-confirm p { margin: -6px 0 16px; font: 14px/1.6 'Noto Sans TC', sans-serif; color: var(--muted); }
`;
    document.head.appendChild(s);
}

function shell() {
    if (document.getElementById('adminScreen')) return;
    const el = document.createElement('section');
    el.className = 'guide-screen adm-screen'; el.id = 'adminScreen';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'admTitle');
    el.innerHTML = `<header class="guide-head adm-head">
            <button class="icon-btn ghost" data-adm="back" aria-label="返回">${svg('back', 2)}</button>
            <h2 id="admTitle">管理</h2><span class="grow"></span>
            <button class="icon-btn ghost" data-adm="refresh" aria-label="重新整理">${svg('refresh', 2)}</button>
        </header>
        <div class="guide-body" id="admBody"><nav class="adm-tabs" id="admTabs" role="tablist"></nav><div id="admMain"></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
}

const ago = (t) => {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return '剛剛';
    if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
    if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
    const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`;
};
const md = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const AV = ['#E9B154', '#5ED3A8', '#A99BF0', '#F4A3BE', '#6CB4EE', '#FF8B74', '#A9C46C', '#C3CAD6'];
const av = (u) => `<span class="adm-av" style="background:${u.color || AV[(u.name || '?').charCodeAt(0) % AV.length]}">${C.esc((u.name || '?').slice(0, 1))}</span>`;

function renderTabs() {
    const n = D.home?.pendingReports || 0;
    document.getElementById('admTabs').innerHTML = TABS.map(([k, t]) =>
        `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-tab="${k}">${t}${k === 'reports' && n ? `<b>${n}</b>` : ''}</button>`).join('');
}
function render() {
    renderTabs();
    const m = document.getElementById('admMain');
    const d = D[tab];
    if (!d) { m.innerHTML = '<div class="adm-sec"><div class="adm-skel"></div></div><div class="adm-sec"><div class="adm-skel"></div></div>'; return; }
    m.innerHTML = ({ home: vHome, reports: vReports, ann: vAnn, rooms: vRooms, errors: vErrors, log: vLog })[tab](d);
}

function vHome(d) {
    const max = Math.max(1, ...d.dau.map(x => x.n));
    const st = (ic, n, unit, label, extra = '') => `<div class="adm-stat"><span class="ic">${svg(ic)}</span><b>${n == null ? '—' : n.toLocaleString()}${unit && n != null ? `<small>${unit}</small>` : ''}</b><span>${label}${n == null ? '' : extra}</span></div>`;
    return `<section class="adm-sec"><h3>現在<small>每 30 秒自動更新</small></h3>
        <div class="adm-live"><span class="dot"></span><div class="tx"><b id="admOnline">${d.online ? d.online.total : '—'}<small>人在線上</small></b><span>網站或 App 現在開著的人</span></div>
            <div class="side">登入 <b>${d.online ? d.online.users : '—'}</b>　未登入 <b>${d.online ? d.online.guests : '—'}</b><br>正在讀書 <b>${d.studying ?? '—'}</b> 人</div></div></section>
        <section class="adm-sec"><h3>使用狀況<small>${md(d.at)} 更新</small></h3><div class="adm-stats">
            ${st('user', d.users, '', '帳號總數', d.newUsers7 ? ` · <em>本週 +${d.newUsers7}</em>` : '')}
            ${st('users', d.active1, '人', '今天有在用')}
            ${st('users', d.active7, '人', '這 7 天有在用')}
            ${st('room', d.rooms, '間', '讀書房間')}
            ${st('chat', d.msgsToday, '則', '今天的聊天訊息')}
            ${st('clock', d.studyMinToday == null ? null : Math.round(d.studyMinToday / 60), '小時', '房間成員今天一共讀了')}
        </div></section>
        <section class="adm-sec"><h3>這 7 天每天有幾個人在用</h3><div class="adm-chart">
            <div class="adm-bars">${d.dau.map((x, i) => `<div class="adm-bar ${i === d.dau.length - 1 ? 'today' : ''}">${x.n}<i style="height:${Math.round(x.n / max * 82)}%"></i></div>`).join('')}</div>
            <div class="adm-xs">${d.dau.map((x, i) => `<span>${i === d.dau.length - 1 ? '今天' : x.d}</span>`).join('')}</div>
        </div></section>
        <section class="adm-sec"><h3>要處理的事</h3><div class="adm-card">
            <button class="adm-link" data-tab="reports"><span class="ic ${d.pendingReports ? 'hot' : ''}">${svg('flag')}</span><span class="tx">檢舉${d.pendingReports ? ` <b style="color:var(--exam-text)">${d.pendingReports} 則待處理</b>` : '：沒有待處理的'}<small>${d.pendingReports ? '最新：' + C.esc(d.lastReport || '') : '有人檢舉時會推播通知你'}</small></span>${svg('chev', 2)}</button>
            <button class="adm-link" data-tab="ann"><span class="ic">${svg('mega')}</span><span class="tx">公告<small>${d.announce ? '顯示中：' + C.esc(d.announce.text) : '目前沒有公告'}</small></span>${svg('chev', 2)}</button>
            <button class="adm-link" data-tab="errors"><span class="ic ${d.errorsToday > 20 ? 'hot' : ''}">${svg('bug')}</span><span class="tx">錯誤紀錄<small>今天 ${d.errorsToday} 筆${d.topError ? ' · 最多的是 ' + C.esc(d.topError) : ''}</small></span>${svg('chev', 2)}</button>
        </div></section>
        ${d.problems && d.problems.length ? `<p class="adm-foot adm-warn">有些資料讀不到（顯示「—」）：${d.problems.map(x => C.esc(x.part + '：' + x.msg)).join('；')}</p>` : ''}
        <p class="adm-foot">「在線上」是網站或 App 現在開在畫面上的人（3 分鐘內）；「有在用」是那天有打開並登入的帳號。這裡只有數字，看不到任何人的讀書資料。</p>`;
}

function vReports(d) {
    const list = d.list.filter(r => repView === 'open' ? r.status === 'open' : r.status !== 'open');
    const open = d.list.filter(r => r.status === 'open').length;
    const seg = `<div class="adm-seg" role="group"><button class="${repView === 'open' ? 'on' : ''}" data-rv="open">待處理（${open}）</button><button class="${repView === 'done' ? 'on' : ''}" data-rv="done">已處理</button></div>`;
    if (!list.length) return seg + `<div class="adm-card"><div class="adm-empty">${repView === 'open' ? svg('check', 2) + '沒有待處理的檢舉' : '還沒有處理過的檢舉'}</div></div>`;
    const DONE = { deleted: '已刪除訊息', muted: '已禁言 7 天', ignored: '不處理' };
    return seg + `<div class="adm-card">${list.map(r => `<div class="adm-rep">
            <div class="adm-rep-top"><span class="adm-tag ${REASON_C[r.reason] || 'g'}">${C.esc(r.reason)}</span>${r.n > 1 ? `<span class="adm-tag r">${r.n} 人檢舉</span>` : ''}${r.hidden ? '<span class="adm-tag g">已自動隱藏</span>' : ''}<span>${C.esc(r.room.name)}</span><span class="t">${ago(r.at)}</span></div>
            <div class="adm-who">${av(r.target)}<b>${C.esc(r.target.name)}</b>${r.target.times > 1 ? `<small class="warn">被檢舉過 ${r.target.times} 次</small>` : '<small>第一次被檢舉</small>'}</div>
            ${r.photo ? `<div class="adm-quote ph">${svg('photo')}傳了一張照片${r.text ? '：' + C.esc(r.text) : ''}</div>` : `<div class="adm-quote">${C.esc(r.text)}</div>`}
            ${r.status === 'open' ? `<div class="adm-acts">
                <button class="btn danger" data-rep="deleted" data-id="${r.id}">${svg('trash')}刪除訊息</button>
                <button class="btn" data-rep="muted" data-id="${r.id}">${svg('mute')}刪除並禁言 7 天</button>
                <button class="btn" data-rep="ignored" data-id="${r.id}">${svg('check')}沒問題</button>
            </div>` : `<div class="adm-done"><span class="adm-tag ${r.status === 'ignored' ? 'g' : 'ok'}">${DONE[r.status]}</span>　${md(r.doneAt)}</div>`}
        </div>`).join('')}</div>
        <p class="adm-foot">為了保護檢舉的人，這裡不會顯示是誰檢舉的。同一則訊息被 3 個人檢舉時，會先自動隱藏，等你處理。</p>`;
}

let annDraft = { text: '', kind: 'info', dur: 24, go: '', label: '' };
const GO_NAME = { bg: '打開背景', tt: '打開課表', lunch: '吃飯轉盤', notif: '通知設定', timer: '計時', stats: '讀書統計', room: '讀書房間', guide: '網站導覽' };
const annBar = (a) => {
    const go = a.go || a.btn?.go, label = a.label || a.btn?.label || (go && C.goals?.[go]) || '';
    return `<div class="ann-bar ann-${a.kind} ann-bar-demo"><span class="ann-ic">${svg('mega')}</span><span class="ann-tx">${C.esc(a.text || '公告內容會顯示在這裡')}</span>${go ? `<span class="ann-go">${C.esc(label)}</span>` : ''}<span class="ann-x">${svg('x', 2)}</span></div>`;
};
function vAnn(d) {
    const cur = d.current;
    const DUR = [[6, '6 小時'], [24, '1 天'], [72, '3 天'], [168, '1 週'], [0, '一直顯示']];
    return `${cur ? `<section class="adm-sec"><h3>顯示中<small>${cur.to ? md(cur.to) + ' 自動收起' : '一直顯示'}</small></h3>
            <div class="adm-ann-prev">${annBar(cur)}</div>
            <div class="adm-acts"><button class="btn danger" data-ann="off">${svg('x', 2)}現在收起來</button><span style="flex:1"></span><small style="align-self:center;color:var(--muted);font:12.5px 'Noto Sans TC'">${cur.seen} 人看過 · ${cur.closed} 人按了關閉</small></div></section>` : ''}
        <section class="adm-sec"><h3>${cur ? '發新的公告（會取代上面那則）' : '發公告'}</h3><div class="adm-card adm-form">
            <label class="lbl" for="admAnnText">內容</label>
            <textarea id="admAnnText" maxlength="80" placeholder="例如：今晚 10:00 維修約 10 分鐘，這段時間資料可能不會同步">${C.esc(annDraft.text)}</textarea>
            <div class="adm-count"><span id="admAnnN">${annDraft.text.length}</span> / 80</div>
            <span class="lbl">類型</span>
            <div class="adm-kinds">${Object.entries(ANN_KIND).map(([k, [n, s]]) => `<button class="adm-kind ${annDraft.kind === k ? 'on' : ''}" data-kind="${k}">${n}<small>${s}</small></button>`).join('')}</div>
            <span class="lbl">顯示多久</span>
            <div class="adm-dur">${DUR.map(([h, n]) => `<button class="${annDraft.dur === h ? 'on' : ''}" data-dur="${h}">${n}</button>`).join('')}</div>
            <span class="lbl">加一個按鈕（可以不加）</span>
            <div class="adm-btns">${[['', '不加'], ...Object.entries(C.goals || {})].map(([k, n]) => `<button class="${annDraft.go === k ? 'on' : ''}" data-go="${k}">${k ? GO_NAME[k] || n : n}</button>`).join('')}</div>
            ${annDraft.go ? `<input class="adm-in" id="admAnnBtn" maxlength="8" placeholder="按鈕上的字（預設：${C.esc(C.goals[annDraft.go])}）" value="${C.esc(annDraft.label)}">` : ''}
            <span class="lbl">大家會看到</span>
            <div class="adm-ann-prev" id="admAnnPrev">${annBar(annDraft)}</div>
            <div class="btns"><button class="btn btn-accent" data-ann="send" ${annDraft.text.trim() ? '' : 'disabled'}>發布</button></div>
        </div></section>
        ${d.history.length ? `<section class="adm-sec"><h3>以前的公告</h3><div class="adm-card">${d.history.map(h => `<div class="adm-hist">${C.esc(h.text)}<small>${ANN_KIND[h.kind]?.[0] || ''}${h.btn ? ' · 按鈕「' + C.esc(h.btn.label) + '」' : ''} · ${md(h.from)} 發布 · ${h.seen || 0} 人看過</small></div>`).join('')}</div></section>` : ''}
        <p class="adm-foot">公告會出現在網站和 App 最上面，每個人按 × 關掉後就不會再出現；發新的公告會再出現一次。</p>`;
}

function vRooms(d) {
    const q = roomQ.trim().toLowerCase();
    const list = d.list.filter(r => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
    return `<input class="adm-search" id="admRoomQ" placeholder="搜尋房間名稱或代碼" value="${C.esc(roomQ)}" autocomplete="off">
        <section class="adm-sec"><h3>${q ? `找到 ${list.length} 間` : `全部 ${d.list.length} 間`}<small>最近有人活動的排前面</small></h3><div class="adm-card">
        ${list.length ? list.map(r => `<div class="adm-room"><span class="adm-link" style="padding:0;width:auto"><span class="ic">${svg('room')}</span></span>
            <div class="tx"><b>${C.esc(r.name)}</b><code>${r.code}</code><small>${r.members} 人 · 今天 ${r.msgsToday} 則訊息 · ${ago(r.lastAt)}${r.reports ? ` · <span class="warn">${r.reports} 則檢舉</span>` : ''}</small></div>
            <button class="btn" data-close-room="${r.code}">${svg('close')}關閉</button></div>`).join('') : '<div class="adm-empty">找不到這個房間</div>'}
        </div></section>
        <p class="adm-foot">關閉房間會刪掉房間和裡面所有訊息，成員會收到「房間已被關閉」的通知，沒辦法復原。</p>`;
}

function vErrors(d) {
    const list = d.list.filter(e => errView === 'open' ? !e.fixed : e.fixed);
    const seg = `<div class="adm-seg" role="group"><button class="${errView === 'open' ? 'on' : ''}" data-ev="open">還沒修（${d.list.filter(e => !e.fixed).length}）</button><button class="${errView === 'fixed' ? 'on' : ''}" data-ev="fixed">已修好</button></div>`;
    if (!list.length) return seg + `<div class="adm-card"><div class="adm-empty">${svg('check', 2)}${errView === 'open' ? '這 7 天沒有新的錯誤' : '還沒有標記修好的'}</div></div>`;
    return seg + `<section class="adm-sec"><h3>這 7 天，出現次數多的在前面</h3><div class="adm-card">${list.map(e => `<div class="adm-err">
            <div class="adm-err-top"><span class="adm-err-n ${e.count < 5 ? 'low' : ''}">${e.count}</span><div class="adm-err-msg">${C.esc(e.msg)}</div></div>
            <small>${e.devices} 台裝置 · ${Object.entries(e.modes).map(([k, v]) => `${{ web: '網站', app: '主畫面', ios: 'iPhone App', android: 'Android App' }[k] || k} ${v}`).join('、')} · 最新版本 ${C.esc(e.ver)} · ${ago(e.lastAt)}<br>${C.esc(e.src)}${e.tab ? ' · 在「' + C.esc(e.tab) + '」' : ''}</small>
            <details><summary>看詳細的錯誤位置</summary><pre>${C.esc(e.stack)}</pre></details>
            <div class="adm-acts"><button class="btn" data-copy="${e.key}">複製給 Claude</button>${e.fixed ? '' : `<button class="btn" data-fix="${e.key}">${svg('check')}標記已修好</button>`}</div>
        </div>`).join('')}</div></section>
        <p class="adm-foot">標記「已修好」的錯誤，如果新版本又出現，會自動回到「還沒修」。超過 30 天的錯誤紀錄會自動清掉。</p>`;
}

const LOG_TXT = { deleted: ['trash', 'r', '刪除了 {name} 的訊息'], muted: ['mute', 'r', '刪除 {name} 的訊息並禁言 7 天'], ignored: ['check', '', '看過 {name} 被檢舉的訊息：沒問題'],
    unmute: ['mute', '', '解除了 {name} 的禁言'], roomClose: ['close', 'r', '關閉了房間「{name}」'], annSet: ['mega', '', '發布公告'], annOff: ['mega', '', '收起公告'], errFix: ['bug', '', '把一個錯誤標記成已修好'] };
function vLog(d) {
    const seg = `<div class="adm-seg" role="group"><button class="${logView === 'log' ? 'on' : ''}" data-lv="log">處理紀錄</button><button class="${logView === 'mute' ? 'on' : ''}" data-lv="mute">禁言中（${d.mutes.length}）</button></div>`;
    if (logView === 'mute') {
        if (!d.mutes.length) return seg + `<div class="adm-card"><div class="adm-empty">${svg('check', 2)}現在沒有人被禁言</div></div>`;
        return seg + `<div class="adm-card">${d.mutes.map(m => `<div class="adm-room">${av(m)}<div class="tx"><b>${C.esc(m.name)}</b><small>到 ${md(m.until)} · 還有 ${Math.max(1, Math.ceil((m.until - Date.now()) / 86400000))} 天 · 原因：${C.esc(m.reason || '檢舉')}</small></div><button class="btn" data-unmute="${m.uid}">解除</button></div>`).join('')}</div>
            <p class="adm-foot">被禁言的人還是可以讀書、看聊天室，只是不能傳訊息；時間到會自動解除。</p>`;
    }
    if (!d.list.length) return seg + '<div class="adm-card"><div class="adm-empty">還沒有處理紀錄</div></div>';
    return seg + `<div class="adm-card">${d.list.map(l => { const t = LOG_TXT[l.act] || ['shield', '', l.act];
        return `<div class="adm-log"><span class="ic ${t[1]}">${svg(t[0])}</span><div class="tx">${C.esc(t[2].replace('{name}', l.name || ''))}${l.text ? `<small>「${C.esc(l.text)}」</small>` : ''}<small>${md(l.at)}</small></div></div>`; }).join('')}</div>
        <p class="adm-foot">每次刪訊息、禁言、關房間、發公告都會記在這裡，保留 1 年。</p>`;
}

/* ---------- 讀資料 ---------- */
async function load(k, force) {
    if (loading[k] || (D[k] && !force)) return;
    loading[k] = true;
    try {
        const name = { home: 'adminOverview', reports: 'adminReports', ann: 'adminAnnounce', rooms: 'adminRooms', errors: 'adminErrors', log: 'adminLog' }[k];
        D[k] = await C.call(name, { op: 'get' });
    } catch (e) {
        C.toast(e?.code === 'functions/permission-denied' ? '這個帳號不是管理者' : `讀取失敗（${String(e?.code || '').replace('functions/', '')} ${String(e?.message || '').slice(0, 60)}）`);
    }
    loading[k] = false;
    if (tab === k || k === 'home') render();
}
function live() {   // 總覽開著時，每 30 秒更新一次線上人數
    clearInterval(liveT);
    liveT = setInterval(async () => {
        if (tab !== 'home' || !document.getElementById('adminScreen')?.classList.contains('open') || document.hidden) return;
        try { const r = await C.call('adminOverview', { op: 'live' }); if (D.home && r) { Object.assign(D.home, r); if (tab === 'home') render(); } } catch (e) {}
    }, 30000);
}
function go(t) {
    tab = t; render(); live();
    document.getElementById('admBody').scrollTop = 0;
    load(t); if (t !== 'home') load('home');
}

function ask(title, text, okLabel) {
    return new Promise(ok => {
        const w = document.createElement('div'); w.className = 'adm-confirm';
        w.innerHTML = `<div class="sheet"><h2>${C.esc(title)}</h2><p>${C.esc(text)}</p><div class="sheet-btns"><button class="btn" data-a="0">取消</button><button class="btn btn-accent" data-a="1">${C.esc(okLabel)}</button></div></div>`;
        w.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b && e.target !== w) return; w.remove(); ok(b?.dataset.a === '1'); });
        document.body.appendChild(w);
    });
}

async function onClick(e) {
    const b = e.target.closest('button,[data-tab]'); if (!b) return;
    const a = b.dataset;
    if (a.adm === 'back') return close();
    if (a.adm === 'refresh') { b.classList.add('spin'); await Promise.all([load('home', true), tab !== 'home' && load(tab, true)]); b.classList.remove('spin'); return C.toast('已更新'); }
    if (a.tab) return go(a.tab);
    if (a.rv) { repView = a.rv; return render(); }
    if (a.ev) { errView = a.ev; return render(); }
    if (a.rep) {
        const r = D.reports.list.find(x => x.id === a.id);
        if (a.rep !== 'ignored' && !(await ask(a.rep === 'muted' ? '刪除並禁言 7 天？' : '刪除這則訊息？', a.rep === 'muted' ? `訊息會被刪掉，「${r.target.name}」7 天內不能在聊天室傳訊息。` : '訊息會從聊天室刪掉，大家都看不到。', a.rep === 'muted' ? '刪除並禁言' : '刪除'))) return;
        try {
            await C.call('adminReports', { op: 'act', id: a.id, act: a.rep });
            Object.assign(r, { status: a.rep, doneAt: Date.now() });
            D.home && (D.home.pendingReports = D.reports.list.filter(x => x.status === 'open').length);
            render(); C.toast({ deleted: '已刪除訊息', muted: '已刪除並禁言 7 天', ignored: '已標記沒問題' }[a.rep]);
        } catch (err) { C.toast('沒有成功，請再試一次'); }
        return;
    }
    if (a.kind) { annDraft.kind = a.kind; return render(); }
    if (a.go !== undefined) { annDraft.go = a.go; return render(); }
    if (a.lv) { logView = a.lv; return render(); }
    if (a.unmute) {
        const m = D.log.mutes.find(x => x.uid === a.unmute);
        if (!(await ask(`解除「${m.name}」的禁言？`, '他馬上就可以在聊天室傳訊息。', '解除'))) return;
        try { await C.call('adminLog', { op: 'unmute', uid: m.uid }); D.log.mutes = D.log.mutes.filter(x => x !== m); D.log.list.unshift({ at: Date.now(), act: 'unmute', name: m.name }); render(); C.toast('已解除禁言'); }
        catch (err) { C.toast('沒有成功，請再試一次'); }
        return;
    }
    if (a.dur) { annDraft.dur = +a.dur; return render(); }
    if (a.ann === 'send') {
        if (!(await ask('發布公告？', '所有人打開網站或 App 時，最上面都會看到這則公告。', '發布'))) return;
        try { D.ann = await C.call('adminAnnounce', { op: 'set', text: annDraft.text.trim(), kind: annDraft.kind, hours: annDraft.dur, btn: annDraft.go ? { go: annDraft.go, label: annDraft.label.trim() || C.goals[annDraft.go] } : null }); annDraft = { ...annDraft, text: '', go: '', label: '' }; render(); C.toast('公告已發布'); }
        catch (err) { C.toast('沒有成功，請再試一次'); }
        return;
    }
    if (a.ann === 'off') {
        try { D.ann = await C.call('adminAnnounce', { op: 'off' }); render(); C.toast('公告已收起來'); } catch (err) { C.toast('沒有成功，請再試一次'); }
        return;
    }
    if (a.closeRoom) {
        const r = D.rooms.list.find(x => x.code === a.closeRoom);
        if (!(await ask(`關閉「${r.name}」？`, `房間和裡面所有訊息都會刪掉，${r.members} 位成員會收到通知，沒辦法復原。`, '關閉房間'))) return;
        try { await C.call('adminRooms', { op: 'close', code: r.code }); D.rooms.list = D.rooms.list.filter(x => x !== r); render(); C.toast('房間已關閉'); }
        catch (err) { C.toast('沒有成功，請再試一次'); }
        return;
    }
    if (a.fix) {
        try { await C.call('adminErrors', { op: 'fix', key: a.fix }); D.errors.list.find(x => x.key === a.fix).fixed = true; render(); C.toast('已標記修好'); }
        catch (err) { C.toast('沒有成功，請再試一次'); }
        return;
    }
    if (a.copy) {
        const x = D.errors.list.find(y => y.key === a.copy);
        const txt = `網站錯誤（${x.count} 次、${x.devices} 台裝置、版本 ${x.ver}）\n${x.msg}\n${x.src}\n${x.stack}`;
        try { await navigator.clipboard.writeText(txt); C.toast('已複製，貼給 Claude 就能修'); } catch (err) { C.toast('沒辦法複製'); }
    }
}
function onInput(e) {
    if (e.target.id === 'admAnnText') {
        annDraft.text = e.target.value;
        document.getElementById('admAnnN').textContent = annDraft.text.length;
        document.getElementById('admAnnPrev').innerHTML = annBar(annDraft);
        const send = document.querySelector('[data-ann="send"]'); if (send) send.disabled = !annDraft.text.trim();
    }
    if (e.target.id === 'admAnnBtn') { annDraft.label = e.target.value; document.getElementById('admAnnPrev').innerHTML = annBar(annDraft); }
    if (e.target.id === 'admRoomQ') {
        roomQ = e.target.value; const pos = e.target.selectionStart;
        render(); const i = document.getElementById('admRoomQ'); i.focus(); i.setSelectionRange(pos, pos);
    }
}

function close() {
    clearInterval(liveT);
    document.getElementById('adminScreen').classList.remove('open');
    document.body.classList.remove('guide-open');
    C.onClose && C.onClose();
}
export function openAdmin(ctx, start = 'home') {
    C = ctx; css(); shell();
    document.getElementById('adminScreen').classList.add('open');
    document.body.classList.add('guide-open');
    go(start);
}
export function setData(k, v) { D[k] = v; }   // 測試用
export function onKey(e) { if (e.key === 'Escape' && document.getElementById('adminScreen')?.classList.contains('open') && !document.querySelector('.adm-confirm')) { e.stopImmediatePropagation(); close(); return true; } return false; }
