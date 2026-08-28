import { marked } from 'marked';
const API_BASE = '/api';

// ── Views ────────────────────────────────────────────
const landingView   = document.getElementById('landing-view');
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

// ── Learn ─────────────────────────────────────────────
const tabChatBtn       = document.getElementById('tab-chat-btn');
const tabLearnBtn      = document.getElementById('tab-learn-btn');
const chatPanel        = document.getElementById('chat-panel');
const learnPanel       = document.getElementById('learn-panel');
const learnTopbarTitle = document.getElementById('learn-topbar-title');
const ltabQuiz         = document.getElementById('ltab-quiz');
const ltabFlash        = document.getElementById('ltab-flash');
const learnQuizContent = document.getElementById('learn-quiz-content');
const learnFlashContent= document.getElementById('learn-flash-content');

let authToken   = localStorage.getItem('token');
let currentKbId = null;
let allKbs      = [];

// Learn state
let quizData    = null;   // current quiz object {id, title, questions}
let quizIdx     = 0;
let quizScore   = 0;
let fcData      = null;   // current flashcard set {id, title, cards}
let fcIdx       = 0;

// ════════════════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════════════════
function showView(view) {
  [landingView, loginView, dashboardView, chatView].forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });
  view.classList.remove('hidden');
  view.classList.add('active');
}

function init() {
  if (authToken) showDashboard();
  else           showView(landingView);
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
  showView(landingView);
});

// ── Landing page navigation ───────────────────────────
document.getElementById('landing-login-btn').addEventListener('click', () => showView(loginView));
document.getElementById('landing-get-started-btn').addEventListener('click', () => showView(loginView));
document.getElementById('landing-get-started-btn-2').addEventListener('click', () => showView(loginView));
document.getElementById('landing-logo-link').addEventListener('click', () => {
  landingView.scrollTop = 0;
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
async function fetchKbFiles() {
  if (!currentKbId) return;
  try {
    const res = await fetch(`${API_BASE}/kb/${currentKbId}/files`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const files = await res.json();
    renderFileList(files);
  } catch { /* silent */ }
}

function formatBytes(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1048576)    return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}

function formatRelTime(ts) {
  const diff = Date.now() - ts * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs/24)}d ago`;
}

function renderFileList(files) {
  const container = document.getElementById('kb-file-list');
  if (!container) return;

  if (files.length === 0) {
    container.innerHTML = `<div class="file-list-empty">No documents yet</div>`;
    return;
  }

  container.innerHTML = files.map((f, i) => `
    <div class="file-item" style="animation-delay:${i * 50}ms">
      <div class="file-item-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      </div>
      <div class="file-item-info">
        <span class="file-item-name" title="${escHtml(f.name)}">${escHtml(f.name)}</span>
        <span class="file-item-meta">${formatBytes(f.size)} · ${formatRelTime(f.uploaded_at)}</span>
      </div>
      <div class="file-item-status" title="Indexed"></div>
    </div>`).join('');
}

function openChat(kbId, kbName) {
  currentKbId = kbId;
  if (currentKbTitle)  currentKbTitle.textContent  = kbName;
  if (chatTopbarTitle) chatTopbarTitle.textContent  = kbName;
  if (learnTopbarTitle) learnTopbarTitle.textContent = `Learn · ${kbName}`;

  // Reset file list
  const fileList = document.getElementById('kb-file-list');
  if (fileList) fileList.innerHTML = `<div class="file-list-empty">Loading documents…</div>`;

  chatMessages.innerHTML = `
    <div class="message assistant">
      <div class="msg-avatar-wrap"><div class="msg-avatar ai">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
      </div></div>
      <div class="msg-content">
        <div class="msg-bubble ai">Hello! I'm your AI assistant for <strong>${escHtml(kbName)}</strong>. Upload a PDF on the left and ask me anything!</div>
      </div>
    </div>`;

  // Switch to chat tab by default
  switchToChat();
  showView(chatView);
  fetchKbFiles();
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
      await fetchKbFiles();
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

// ════════════════════════════════════════════════════
// LEARN PANEL — Tab switching
// ════════════════════════════════════════════════════
function switchToChat() {
  chatPanel.classList.remove('hidden');
  learnPanel.classList.add('hidden');
  tabChatBtn.classList.add('active');
  tabLearnBtn.classList.remove('active');
}

function switchToLearn() {
  chatPanel.classList.add('hidden');
  learnPanel.classList.remove('hidden');
  tabLearnBtn.classList.add('active');
  tabChatBtn.classList.remove('active');
  loadLearnPanel(currentKbId);
}

tabChatBtn.addEventListener('click', switchToChat);
tabLearnBtn.addEventListener('click', switchToLearn);

// Learn sub-tabs
ltabQuiz.addEventListener('click', () => {
  ltabQuiz.classList.add('active');
  ltabFlash.classList.remove('active');
  learnQuizContent.classList.remove('hidden');
  learnFlashContent.classList.add('hidden');
});
ltabFlash.addEventListener('click', () => {
  ltabFlash.classList.add('active');
  ltabQuiz.classList.remove('active');
  learnFlashContent.classList.remove('hidden');
  learnQuizContent.classList.add('hidden');
});

// ════════════════════════════════════════════════════
// LEARN PANEL — Load lists
// ════════════════════════════════════════════════════
async function loadLearnPanel(kbId) {
  if (!kbId) return;
  await Promise.all([loadQuizList(kbId), loadFlashList(kbId)]);
}

async function loadQuizList(kbId) {
  const container = document.getElementById('quiz-list');
  const countEl   = document.getElementById('quiz-count');
  container.innerHTML = `<div class="learn-empty"><p>Loading…</p></div>`;

  try {
    const res  = await fetch(`${API_BASE}/kb/${kbId}/quizzes`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const list = await res.json();
    countEl.textContent = list.length;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="learn-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p>No quizzes yet. Generate one above!</p>
        </div>`;
      return;
    }

    container.innerHTML = list.map(q => `
      <div class="learn-item" data-quiz-id="${q.id}">
        <div class="learn-item-icon quiz-item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div class="learn-item-info">
          <div class="learn-item-title">${escHtml(q.title)}</div>
          <div class="learn-item-meta">${q.num_questions} questions · ${formatDate(q.created_at)}</div>
        </div>
        <div class="learn-item-actions">
          <button class="learn-item-play" data-quiz-id="${q.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Play
          </button>
          <button class="learn-item-del" data-del-quiz-id="${q.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>`).join('');

    // Wire play buttons
    container.querySelectorAll('.learn-item-play').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        playQuiz(parseInt(btn.dataset.quizId));
      });
    });
    // Wire delete buttons
    container.querySelectorAll('.learn-item-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Delete this quiz?')) return;
        await fetch(`${API_BASE}/quiz/${btn.dataset.delQuizId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        loadQuizList(kbId);
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="learn-empty"><p>Failed to load quizzes.</p></div>`;
  }
}

async function loadFlashList(kbId) {
  const container = document.getElementById('flash-list');
  const countEl   = document.getElementById('flash-count');
  container.innerHTML = `<div class="learn-empty"><p>Loading…</p></div>`;

  try {
    const res  = await fetch(`${API_BASE}/kb/${kbId}/flashcards`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const list = await res.json();
    countEl.textContent = list.length;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="learn-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          <p>No flashcard sets yet. Generate one above!</p>
        </div>`;
      return;
    }

    container.innerHTML = list.map(s => `
      <div class="learn-item" data-fc-id="${s.id}">
        <div class="learn-item-icon flash-item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        </div>
        <div class="learn-item-info">
          <div class="learn-item-title">${escHtml(s.title)}</div>
          <div class="learn-item-meta">${s.num_cards} cards · ${formatDate(s.created_at)}</div>
        </div>
        <div class="learn-item-actions">
          <button class="learn-item-play" data-fc-id="${s.id}" style="background:linear-gradient(135deg,#f59e0b,#ef4444);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Study
          </button>
          <button class="learn-item-del" data-del-fc-id="${s.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>`).join('');

    container.querySelectorAll('.learn-item-play').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        playFlashcards(parseInt(btn.dataset.fcId));
      });
    });
    container.querySelectorAll('.learn-item-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Delete this flashcard set?')) return;
        await fetch(`${API_BASE}/flashcards/${btn.dataset.delFcId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        loadFlashList(kbId);
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="learn-empty"><p>Failed to load flashcards.</p></div>`;
  }
}

// ════════════════════════════════════════════════════
// GENERATE QUIZ
// ════════════════════════════════════════════════════
let selectedNumQuestions = 5;
document.getElementById('quiz-num-picker').addEventListener('click', e => {
  const btn = e.target.closest('.num-btn');
  if (!btn) return;
  document.querySelectorAll('#quiz-num-picker .num-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedNumQuestions = parseInt(btn.dataset.val);
});

document.getElementById('generate-quiz-btn').addEventListener('click', async () => {
  const genBtn = document.getElementById('generate-quiz-btn');
  genBtn.disabled = true;
  genBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;animation:spin 1s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Generating…`;

  try {
    const res = await fetch(`${API_BASE}/kb/${currentKbId}/quiz/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ num_questions: selectedNumQuestions })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Generation failed');
    await loadQuizList(currentKbId);
    // Auto-play the new quiz
    playQuizFromData(data);
  } catch (err) {
    alert(`Quiz generation failed: ${err.message}`);
  } finally {
    genBtn.disabled = false;
    genBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Generate Quiz`;
  }
});

// ════════════════════════════════════════════════════
// GENERATE FLASHCARDS
// ════════════════════════════════════════════════════
let selectedNumCards = 10;
document.getElementById('flash-num-picker').addEventListener('click', e => {
  const btn = e.target.closest('.num-btn');
  if (!btn) return;
  document.querySelectorAll('#flash-num-picker .num-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedNumCards = parseInt(btn.dataset.val);
});

document.getElementById('generate-flash-btn').addEventListener('click', async () => {
  const genBtn = document.getElementById('generate-flash-btn');
  genBtn.disabled = true;
  genBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;animation:spin 1s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Generating…`;

  try {
    const res = await fetch(`${API_BASE}/kb/${currentKbId}/flashcards/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ num_cards: selectedNumCards })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Generation failed');
    await loadFlashList(currentKbId);
    // Auto-play the new flashcard set
    playFlashcardsFromData(data);
  } catch (err) {
    alert(`Flashcard generation failed: ${err.message}`);
  } finally {
    genBtn.disabled = false;
    genBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Generate Flashcards`;
  }
});

// ════════════════════════════════════════════════════
// QUIZ PLAYER
// ════════════════════════════════════════════════════
async function playQuiz(quizId) {
  try {
    const res = await fetch(`${API_BASE}/quiz/${quizId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    playQuizFromData(data);
  } catch { alert('Failed to load quiz.'); }
}

function playQuizFromData(data) {
  quizData  = data;
  quizIdx   = 0;
  quizScore = 0;

  document.getElementById('quiz-player').classList.remove('hidden');
  document.getElementById('quiz-player-title').textContent = data.title;
  document.getElementById('quiz-score-screen').classList.add('hidden');
  document.getElementById('quiz-question-area').style.display = '';
  document.querySelector('.quiz-progress-bar-wrap').style.display = '';
  document.querySelector('.quiz-meta-row').style.display = '';

  renderQuizQuestion();

  // Scroll to player
  document.getElementById('quiz-player').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderQuizQuestion() {
  const q      = quizData.questions[quizIdx];
  const total  = quizData.questions.length;
  const pct    = ((quizIdx) / total * 100).toFixed(1);
  const letters= ['A','B','C','D'];

  document.getElementById('quiz-progress-bar').style.width = `${pct}%`;
  document.getElementById('quiz-q-counter').textContent = `Question ${quizIdx + 1} of ${total}`;
  document.getElementById('quiz-score-live').textContent = `Score: ${quizScore}`;

  const area = document.getElementById('quiz-question-area');
  area.innerHTML = `
    <div class="quiz-question-card">
      <div class="quiz-question-text">${escHtml(q.question)}</div>
      <div class="quiz-options" id="quiz-options">
        ${q.options.map((opt, i) => `
          <div class="quiz-option" data-opt="${escHtml(opt)}" data-idx="${i}">
            <div class="quiz-option-letter">${letters[i]}</div>
            <div class="quiz-option-text">${escHtml(opt)}</div>
          </div>`).join('')}
      </div>
    </div>`;

  area.querySelectorAll('.quiz-option').forEach(el => {
    el.addEventListener('click', () => handleQuizAnswer(el, q));
  });
}

function handleQuizAnswer(selected, q) {
  const allOptions = document.querySelectorAll('.quiz-option');
  allOptions.forEach(el => el.classList.add('revealed'));

  const isCorrect = selected.dataset.opt === q.answer;
  if (isCorrect) {
    selected.classList.add('correct');
    quizScore++;
  } else {
    selected.classList.add('wrong');
    // Highlight correct answer
    allOptions.forEach(el => {
      if (el.dataset.opt === q.answer) el.classList.add('correct');
    });
  }

  // Show explanation
  const area = document.getElementById('quiz-question-area');
  const expDiv = document.createElement('div');
  expDiv.className = 'quiz-explanation';
  expDiv.innerHTML = `<strong>Explanation:</strong> ${escHtml(q.explanation)}`;
  area.appendChild(expDiv);

  // Next/Finish button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'quiz-next-btn';
  const isLast = quizIdx === quizData.questions.length - 1;
  nextBtn.innerHTML = isLast
    ? `Finish Quiz <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`
    : `Next Question <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
  nextBtn.addEventListener('click', () => {
    quizIdx++;
    if (quizIdx >= quizData.questions.length) {
      showQuizScore();
    } else {
      renderQuizQuestion();
    }
  });
  area.appendChild(nextBtn);

  document.getElementById('quiz-score-live').textContent = `Score: ${quizScore}`;
}

function showQuizScore() {
  const total = quizData.questions.length;
  const pct   = Math.round((quizScore / total) * 100);

  document.getElementById('quiz-progress-bar').style.width = '100%';
  document.getElementById('quiz-question-area').style.display = 'none';
  document.querySelector('.quiz-progress-bar-wrap').style.display = 'none';
  document.querySelector('.quiz-meta-row').style.display = 'none';

  const screen = document.getElementById('quiz-score-screen');
  screen.classList.remove('hidden');
  document.getElementById('score-fraction').textContent = `${quizScore}/${total}`;
  document.getElementById('score-emoji').textContent = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '📚';
  document.getElementById('score-headline').textContent = pct >= 80 ? 'Excellent!' : pct >= 60 ? 'Good job!' : 'Keep studying!';
  document.getElementById('score-msg').textContent = `You scored ${pct}% — ${quizScore} out of ${total} questions correct.`;
}

document.getElementById('quiz-back-btn').addEventListener('click', () => {
  document.getElementById('quiz-player').classList.add('hidden');
});

document.getElementById('quiz-retry-btn').addEventListener('click', () => {
  if (quizData) playQuizFromData(quizData);
});

// ════════════════════════════════════════════════════
// FLASHCARD PLAYER
// ════════════════════════════════════════════════════
async function playFlashcards(fcId) {
  try {
    const res = await fetch(`${API_BASE}/flashcards/${fcId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    playFlashcardsFromData(data);
  } catch { alert('Failed to load flashcards.'); }
}

function playFlashcardsFromData(data) {
  fcData = data;
  fcIdx  = 0;

  document.getElementById('flash-player').classList.remove('hidden');
  document.getElementById('flash-player-title').textContent = data.title;

  // Unflip card
  const card = document.getElementById('flashcard');
  card.classList.remove('flipped');

  renderFlashcard();
  document.getElementById('flash-player').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderFlashcard() {
  const card  = fcData.cards[fcIdx];
  const total = fcData.cards.length;

  document.getElementById('flash-counter').textContent = `${fcIdx + 1} / ${total}`;
  document.getElementById('flash-front-text').textContent = card.front;
  document.getElementById('flash-back-text').textContent  = card.back;

  // Unflip
  document.getElementById('flashcard').classList.remove('flipped');

  // Progress dots (cap at 20 for space)
  const dotsEl = document.getElementById('flash-dots');
  if (total <= 20) {
    dotsEl.innerHTML = Array.from({ length: total }, (_, i) => {
      let cls = 'flash-dot';
      if (i === fcIdx) cls += ' active';
      else if (i < fcIdx) cls += ' visited';
      return `<div class="${cls}"></div>`;
    }).join('');
  } else {
    dotsEl.innerHTML = '';
  }

  // Prev/Next buttons
  const prevBtn = document.getElementById('flash-prev-btn');
  const nextBtn = document.getElementById('flash-next-btn');
  prevBtn.disabled = fcIdx === 0;
  const isLast = fcIdx === total - 1;
  nextBtn.innerHTML = isLast
    ? `Done <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
    : `Next <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>`;
}

// Flip on card click
document.getElementById('flashcard').addEventListener('click', () => {
  document.getElementById('flashcard').classList.toggle('flipped');
});

document.getElementById('flash-prev-btn').addEventListener('click', () => {
  if (fcIdx > 0) { fcIdx--; renderFlashcard(); }
});

document.getElementById('flash-next-btn').addEventListener('click', () => {
  if (fcIdx < fcData.cards.length - 1) {
    fcIdx++;
    renderFlashcard();
  } else {
    // Done — close player
    document.getElementById('flash-player').classList.add('hidden');
  }
});

document.getElementById('flash-back-btn').addEventListener('click', () => {
  document.getElementById('flash-player').classList.add('hidden');
});

// ════════════════════════════════════════════════════
// UTILITY
// ════════════════════════════════════════════════════
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

// Spin animation for loading state
const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

init();
