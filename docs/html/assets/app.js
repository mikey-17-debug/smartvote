/**
 * 课堂评分投票系统 · 静态原型共用逻辑
 *
 * 数据流：首次打开页面时从 mock/*.json 读取 -> 写入 localStorage 作为演示数据库
 *        之后的增删改都直接读写 localStorage（刷新不丢），「重置演示数据」可恢复初始 mock
 * 接真接口时：把 loadDB / saveDB 以及各页面的读取调用换成 fetch 即可，字段结构保持不变
 */

const STORAGE_KEY = "qc_mock_dataset_v1";
const ADMIN_SESSION_KEY = "qc_admin_session";
const MOCK_IP_KEY = "qc_mock_ip";
const FLASH_KEY = "qc_flash_message";

/* ---------------- 全局界面主题（仅视觉） ---------------- */

(function injectTheme() {
  const css = `
    html { scroll-behavior: smooth; }
    body {
      font-family: "Inter", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    ::selection { background: rgb(99 102 241 / .18); }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgb(148 163 184 / .45); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
    ::-webkit-scrollbar-thumb:hover { background: rgb(100 116 139 / .6); border: 2px solid transparent; background-clip: content-box; }
    @keyframes qc-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @keyframes qc-pop { 0% { opacity: 0; transform: scale(.6); } 60% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
    @keyframes qc-toast-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
    .qc-fade { animation: qc-fade-up .4s cubic-bezier(.22, 1, .36, 1) both; }
    .qc-pop { animation: qc-pop .5s cubic-bezier(.22, 1, .36, 1) both; }
    .qc-toast { animation: qc-toast-in .25s ease both; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

const NAV_ITEMS = [
  {
    key: "questions",
    label: "题库管理",
    href: "questions.html",
    icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>',
  },
  {
    key: "surveys",
    label: "问卷管理",
    href: "surveys.html",
    icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>',
  },
];

/* ---------------- 数据层 ---------------- */

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} 读取失败（HTTP ${res.status}）`);
  return res.json();
}

async function loadDB() {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (err) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  const [q, s, v] = await Promise.all([
    fetchJSON("mock/questions.json"),
    fetchJSON("mock/surveys.json"),
    fetchJSON("mock/votes.json"),
  ]);
  const db = { questions: q.questions, surveys: s.surveys, votes: v.votes };
  saveDB(db);
  return db;
}

function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function nextId(prefix, items) {
  let max = 0;
  items.forEach((item) => {
    const n = Number(String(item.id).replace(/\D/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  });
  return `${prefix}${max + 1}`;
}

/* ---------------- 登录态（演示用） ---------------- */

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyAdmin(username, password) {
  const admin = await fetchJSON("mock/admin.json");
  if (username.trim() !== admin.username) return false;
  return (await sha256Hex(password)) === admin.passwordSha256;
}

function isLoggedIn() {
  return Boolean(sessionStorage.getItem(ADMIN_SESSION_KEY));
}

function logout() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  location.href = "login.html";
}

/* ---------------- 通用工具 ---------------- */

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "-";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function getQuery(name) {
  return new URLSearchParams(location.search).get(name) || "";
}

function voteUrl(surveyId) {
  return new URL(`vote.html?id=${encodeURIComponent(surveyId)}`, location.href).href;
}

function mockClientIp() {
  let ip = localStorage.getItem(MOCK_IP_KEY);
  if (!ip) {
    ip = `192.168.1.${10 + Math.floor(Math.random() * 90)}`;
    localStorage.setItem(MOCK_IP_KEY, ip);
  }
  return ip;
}

/* ---------------- 提示与错误 ---------------- */

function notify(message, type = "success") {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    host.className = "fixed right-5 top-5 z-50 flex flex-col gap-2";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = `qc-toast rounded-xl px-4 py-2.5 text-sm text-white shadow-lg shadow-slate-900/20 ${
    type === "error" ? "bg-rose-600" : "bg-slate-900"
  }`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function flash(message) {
  sessionStorage.setItem(FLASH_KEY, message);
}

function consumeFlash() {
  const message = sessionStorage.getItem(FLASH_KEY);
  if (message) {
    sessionStorage.removeItem(FLASH_KEY);
    notify(message);
  }
}

function showFatal(err) {
  const message = err && err.message ? err.message : String(err);
  const isFileProtocol = location.protocol === "file:";
  const html = `
    <div class="rounded-xl border border-rose-200 bg-rose-50 p-6">
      <h2 class="text-base font-semibold text-rose-700">数据加载失败</h2>
      <p class="mt-2 text-sm text-rose-600">${escapeHtml(message)}</p>
      ${
        isFileProtocol
          ? `<p class="mt-3 text-sm leading-6 text-rose-600">
               当前是通过 file:// 直接打开的，浏览器禁止页面读取本地 JSON 文件。
               请在项目目录运行 <code class="rounded bg-white px-1.5 py-0.5">python -m http.server 8000</code>
               或双击 <code class="rounded bg-white px-1.5 py-0.5">start.bat</code>，
               然后访问 <code class="rounded bg-white px-1.5 py-0.5">http://localhost:8000/login.html</code>。
             </p>`
          : ""
      }
    </div>`;
  const page = document.getElementById("page");
  if (page) page.innerHTML = html;
  else document.body.insertAdjacentHTML("afterbegin", `<div class="p-6">${html}</div>`);
}

/* ---------------- 后台外壳 ---------------- */

function mountAdmin(activeKey) {
  if (!isLoggedIn()) {
    location.replace("login.html");
    return false;
  }
  const aside = document.getElementById("sidebar");
  if (!aside) return true;

  const links = NAV_ITEMS.map((item) => {
    const active = item.key === activeKey;
    const cls = active
      ? "flex items-center gap-2.5 rounded-xl bg-indigo-500/15 px-3 py-2 text-sm font-medium text-indigo-300"
      : "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white";
    return `<a href="${item.href}" class="${cls}">
        <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">${item.icon}</svg>
        ${item.label}
      </a>`;
  }).join("");

  aside.className = "w-60 shrink-0 bg-slate-950";
  aside.innerHTML = `
    <div class="flex h-full flex-col">
      <div class="flex items-center gap-3 px-5 py-6">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-950/60">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
        </div>
        <div>
          <div class="text-sm font-semibold tracking-wide text-white">课堂评分投票</div>
          <div class="mt-0.5 text-xs text-slate-500">管理后台</div>
        </div>
      </div>
      <nav class="flex-1 space-y-1 px-3 py-2">${links}</nav>
      <div class="space-y-1 border-t border-white/10 px-3 py-4 text-sm">
        <a href="surveys.html" class="flex items-center gap-2 rounded-xl px-3 py-2 text-slate-400 transition hover:bg-white/5 hover:text-white">
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          前台投票演示
        </a>
        <button type="button" onclick="resetDemoData()" class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-slate-400 transition hover:bg-white/5 hover:text-white">
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 00-14-3M4 16a8 8 0 0014 3"/></svg>
          重置演示数据
        </button>
        <button type="button" onclick="logout()" class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-rose-300/90 transition hover:bg-rose-500/10 hover:text-rose-300">
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          退出登录
        </button>
      </div>
    </div>`;
  return true;
}

async function resetDemoData() {
  if (!confirm("将清空本地演示数据并恢复 mock 初始数据，确定继续？")) return;
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.setItem(FLASH_KEY, "演示数据已重置");
  location.reload();
}

/* ---------------- 统计计算 ---------------- */

function surveyVotes(db, surveyId) {
  return db.votes.filter((v) => v.surveyId === surveyId);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}
