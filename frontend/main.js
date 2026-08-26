import { marked } from 'marked';
const API_BASE = '/api';

// ── Views ────────────────────────────────────────────
const loginView     = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const chatView      = document.getElementById('chat-view');
const newKbModal    = document.getElementById('new-kb-modal');

// ── Auth ─────────────────────────────────────────────
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn      = document.getElementById('login-btn');
const registerBtn   = document.getElementById('register-btn');
const authError     = document.getElementById('auth-error');
const logoutBtn     = document.getElementById('logout-btn');

// ── Dashboard ─────────────────────────────────────────
const createKbBtn   = document.getElementById('create-kb-btn');
const kbGrid        = document.getElementById('kb-grid');
const newKbName     = document.getElementById('new-kb-name');
const newKbDesc     = document.getElementById('new-kb-desc');
const cancelKbBtn   = document.getElementById('cancel-kb-btn');
const cancelKbBtn2  = document.getElementById('cancel-kb-btn2');
const submitKbBtn   = document.getElementById('submit-kb-btn');
const dashSearch    = document.getElementById('dash-search');

// ── Chat ──────────────────────────────────────────────
const backToDashBtn    = document.getElementById('back-to-dash-btn');
const currentKbTitle   = document.getElementById('current-kb-title');
const chatTopbarTitle  = document.getElementById('chat-topbar-title');
const chatMessages     = document.getElementById('chat-messages');
const chatInput        = document.getElementById('chat-input');
const sendBtn          = document.getElementById('send-btn');
const pdfUpload        = document.getElementById('pdf-upload');
const uploadStatus     = document.getElementById('upload-status');

let authToken   = localStorage.getItem('token');
let currentKbId = null;
let allKbs      = [];

// ════════════════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════════════════
function showView(view) {
  [loginView, dashboardView, chatView].forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });
  view.classList.remove('hidden');
  view.classList.add('active');
}

function init() {
  if (authToken) showDashboard();
  else           showView(loginView);
}

// ════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════
async function handleAuth(action) {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  authError.style.color = '#f87171';
  if (!username || !password) {
    authError.textContent = 'Please enter both username and password.';
    return;
  }
  loginBtn.disabled = registerBtn.disabled = true;

  try {
    if (action === 'register') {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Registration failed'); }
      authError.style.color = '#34d399';
      authError.textContent = '✓ Account created — please sign in.';
    } else {
      const fd = new URLSearchParams();
      fd.append('username', username);
      fd.append('password', password);

      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: fd
      });
      if (!res.ok) throw new Error('Invalid username or password');

      const data = await res.json();
      authToken = data.access_token;
      localStorage.setItem('token', authToken);
      usernameInput.value = passwordInput.value = '';
      authError.textContent = '';
      showDashboard();
    }
  } catch (err) {
    authError.style.color = '#f87171';
    authError.textContent = err.message;
  } finally {
    loginBtn.disabled = registerBtn.disabled = false;
  }
}

loginBtn.addEventListener('click',   () => handleAuth('login'));
registerBtn.addEventListener('click',() => handleAuth('register'));
passwordInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleAuth('login'); });
logoutBtn.addEventListener('click', () => {
  authToken = null;
  localStorage.removeItem('token');
  showView(loginView);
});

// ════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════
function decodeUsername() {
  if (!authToken) return 'User';
  try {
    const payload = JSON.parse(atob(authToken.split('.')[1]));
    return payload.sub || 'User';
  } catch { return 'User'; }
}

async function fetchKbs() {
  const res = await fetch(`${API_BASE}/kb`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (!res.ok) {
    if (res.status === 401) { authToken = null; localStorage.removeItem('token'); showView(loginView); }
    return [];
  }
  return res.json();
}

async function showDashboard() {
  showView(dashboardView);

  // Set username in UI
  const uname = decodeUsername();
  const heroEl = document.getElementById('hero-username');
  const sidebarEl = document.getElementById('sidebar-username');
  const topbarEl = document.getElementById('topbar-username');
  if (heroEl)    heroEl.textContent = uname;
  if (sidebarEl) sidebarEl.textContent = uname;
  if (topbarEl)  topbarEl.textContent = uname;
  ['user-avatar-sidebar','user-avatar-top'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = uname[0].toUpperCase();
  });

  kbGrid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px 0;color:#4b5563;font-size:.875rem;">
      Loading…
    </div>`;

  allKbs = await fetchKbs();

  // Update stat
  const statEl = document.getElementById('stat-kbs');
  if (statEl) statEl.textContent = allKbs.length;

  renderKbGrid(allKbs);
}

function renderKbGrid(kbs) {
  kbGrid.innerHTML = '';
  if (kbs.length === 0) {
    kbGrid.innerHTML = `
      <div class="kb-empty">
        <div class="kb-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <h4>No Knowledge Bases Yet</h4>
        <p>Click "New KB" to create your first knowledge base</p>
      </div>`;
    return;
  }

  kbs.forEach(kb => {
    const card = document.createElement('div');
    card.className = 'kb-card';
    card.innerHTML = `
      <div class="kb-card-top">
        <div class="kb-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div class="kb-card-badge">KB #${kb.id}</div>
      </div>
      <div class="kb-card-body">
        <h3>${escHtml(kb.name)}</h3>
        <p>${escHtml(kb.description || 'No description provided.')}</p>
      </div>
      <div class="kb-card-footer">
        <div class="kb-card-footer-meta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Just created
        </div>
        <div class="kb-card-open">
          Open
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </div>`;
    card.addEventListener('click', () => openChat(kb.id, kb.name));
    kbGrid.appendChild(card);
  });
}

// Search filter
dashSearch && dashSearch.addEventListener('input', () => {
  const q = dashSearch.value.toLowerCase();
  renderKbGrid(allKbs.filter(kb => kb.name.toLowerCase().includes(q) || (kb.description || '').toLowerCase().includes(q)));
});

// Modal
createKbBtn.addEventListener('click', () => newKbModal.classList.remove('hidden'));
cancelKbBtn.addEventListener('click',  () => newKbModal.classList.add('hidden'));
cancelKbBtn2.addEventListener('click', () => newKbModal.classList.add('hidden'));
document.getElementById('modal-backdrop').addEventListener('click', () => newKbModal.classList.add('hidden'));

submitKbBtn.addEventListener('click', async () => {
  const name = newKbName.value.trim();
  const desc = newKbDesc.value.trim();
  if (!name) { newKbName.focus(); return; }

  submitKbBtn.disabled = true;
  submitKbBtn.innerHTML = `<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Creating…`;

  try {
    const res = await fetch(`${API_BASE}/kb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ name, description: desc })
    });
    if (res.ok) {
      newKbModal.classList.add('hidden');
      newKbName.value = newKbDesc.value = '';
      showDashboard();
    }
  } catch (err) { console.error(err); }
  finally {
    submitKbBtn.disabled = false;
    submitKbBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Create Knowledge Base`;
  }
});

// ════════════════════════════════════════════════════
// CHAT
// ════════════════════════════════════════════════════
function openChat(kbId, kbName) {
  currentKbId = kbId;
  if (currentKbTitle)  currentKbTitle.textContent  = kbName;
  if (chatTopbarTitle) chatTopbarTitle.textContent  = kbName;

  chatMessages.innerHTML = `
    <div class="message assistant">
      <div class="msg-avatar-wrap"><div class="msg-avatar ai">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
      </div></div>
      <div class="msg-content">
        <div class="msg-bubble ai">Hello! I'm your AI assistant for <strong>${escHtml(kbName)}</strong>. Upload a PDF on the left and ask me anything!</div>
      </div>
    </div>`;
  showView(chatView);
}

backToDashBtn.addEventListener('click', () => { currentKbId = null; showDashboard(); });

pdfUpload.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !currentKbId) return;

  uploadStatus.textContent = 'Uploading…';
  uploadStatus.style.color = '#9ca3af';

  const fd = new FormData();
  fd.append('file', file);
  fd.append('kb_id', currentKbId);

  try {
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: fd
    });
    if (res.ok) {
      uploadStatus.textContent = '✓ Uploaded — indexing in progress';
      uploadStatus.style.color = '#34d399';
      setTimeout(() => { uploadStatus.textContent = ''; }, 7000);
    } else { throw new Error(); }
  } catch {
    uploadStatus.textContent = '✗ Upload failed';
    uploadStatus.style.color = '#f87171';
  }
  pdfUpload.value = '';
});

function appendMessage(content, isUser = false, sources = []) {
  const wrap = document.createElement('div');
  wrap.className = `message ${isUser ? 'user' : 'assistant'}`;

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'msg-avatar-wrap';

  if (isUser) {
    const av = document.createElement('div');
    av.className = 'msg-avatar user-av';
    av.textContent = 'U';
    avatarWrap.appendChild(av);
  } else {
    avatarWrap.innerHTML = `<div class="msg-avatar ai"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg></div>`;
  }

  const contentWrap = document.createElement('div');
  contentWrap.className = 'msg-content';

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${isUser ? 'user-bubble' : 'ai'}`;
  bubble.innerHTML = isUser ? escHtml(content) : marked.parse(content);

  if (sources.length > 0) {
    const badges = document.createElement('div');
    badges.className = 'source-badges';
    sources.forEach(src => {
      const b = document.createElement('span');
      b.className = 'source-badge';
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${escHtml(src)}`;
      badges.appendChild(b);
    });
    bubble.appendChild(badges);
  }

  contentWrap.appendChild(bubble);
  wrap.appendChild(avatarWrap);
  wrap.appendChild(contentWrap);
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return wrap;
}

function showTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant typing-msg';
  wrap.innerHTML = `
    <div class="msg-avatar-wrap"><div class="msg-avatar ai">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
    </div></div>
    <div class="msg-content"><div class="msg-bubble ai">
      <div class="typing-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    </div></div>`;
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return wrap;
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !currentKbId) return;

  appendMessage(text, true);
  chatInput.value = '';
  chatInput.disabled = sendBtn.disabled = true;

  const indicator = showTyping();

  try {
    const res = await fetch(`${API_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ question: text, kb_id: currentKbId, top_k: 3 })
    });
    indicator.remove();
    if (!res.ok) throw new Error();
    const data = await res.json();
    appendMessage(data.answer, false, data.sources);
  } catch {
    indicator.remove();
    appendMessage('Something went wrong. Please try again.', false);
  } finally {
    chatInput.disabled = sendBtn.disabled = false;
    chatInput.focus();
  }
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });

// ── Utility ──────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
