import { marked } from 'marked';

const API_BASE = '/api';

// ── Views ──────────────────────────────────────────
const loginView      = document.getElementById('login-view');
const dashboardView  = document.getElementById('dashboard-view');
const chatView       = document.getElementById('chat-view');
const newKbModal     = document.getElementById('new-kb-modal');

// ── Auth elements ──────────────────────────────────
const usernameInput  = document.getElementById('username');
const passwordInput  = document.getElementById('password');
const loginBtn       = document.getElementById('login-btn');
const registerBtn    = document.getElementById('register-btn');
const authError      = document.getElementById('auth-error');
const logoutBtn      = document.getElementById('logout-btn');

// ── Dashboard elements ──────────────────────────────
const createKbBtn    = document.getElementById('create-kb-btn');
const kbGrid         = document.getElementById('kb-grid');
const newKbName      = document.getElementById('new-kb-name');
const newKbDesc      = document.getElementById('new-kb-desc');
const cancelKbBtn    = document.getElementById('cancel-kb-btn');
const cancelKbBtn2   = document.getElementById('cancel-kb-btn2');
const submitKbBtn    = document.getElementById('submit-kb-btn');

// ── Chat elements ───────────────────────────────────
const backToDashBtn  = document.getElementById('back-to-dash-btn');
const currentKbTitle = document.getElementById('current-kb-title');
const chatTopbarSub  = document.getElementById('chat-topbar-sub');
const chatMessages   = document.getElementById('chat-messages');
const chatInput      = document.getElementById('chat-input');
const sendBtn        = document.getElementById('send-btn');
const pdfUpload      = document.getElementById('pdf-upload');
const uploadStatus   = document.getElementById('upload-status');

let authToken  = localStorage.getItem('token');
let currentKbId = null;

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
  else showView(loginView);
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

  loginBtn.disabled = true;
  registerBtn.disabled = true;

  try {
    if (action === 'register') {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Registration failed');
      }
      authError.style.color = '#34d399';
      authError.textContent = '✓ Account created — please sign in.';

    } else {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });
      if (!res.ok) throw new Error('Invalid username or password');

      const data = await res.json();
      authToken = data.access_token;
      localStorage.setItem('token', authToken);
      usernameInput.value = '';
      passwordInput.value = '';
      authError.textContent = '';
      showDashboard();
    }
  } catch (err) {
    authError.textContent = err.message;
  } finally {
    loginBtn.disabled = false;
    registerBtn.disabled = false;
  }
}

loginBtn.addEventListener('click', () => handleAuth('login'));
registerBtn.addEventListener('click', () => handleAuth('register'));
passwordInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleAuth('login'); });

logoutBtn.addEventListener('click', () => {
  authToken = null;
  localStorage.removeItem('token');
  showView(loginView);
});

// ════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════
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
  kbGrid.innerHTML = `
    <div style="grid-column:1/-1; text-align:center; padding: 60px 0; color: var(--text-tertiary);">
      <span style="font-size:1.5rem">⟳</span>
      <p style="margin-top:10px; font-size:0.9rem;">Loading knowledge bases…</p>
    </div>`;

  const kbs = await fetchKbs();
  kbGrid.innerHTML = '';

  if (kbs.length === 0) {
    kbGrid.innerHTML = `
      <div class="kb-empty">
        <span class="kb-empty-icon">📚</span>
        <h4>No Knowledge Bases Yet</h4>
        <p>Create your first one to start chatting with your documents</p>
      </div>`;
    return;
  }

  kbs.forEach(kb => {
    const card = document.createElement('div');
    card.className = 'kb-card';
    card.innerHTML = `
      <div class="kb-card-icon">📚</div>
      <div class="kb-card-body">
        <h3>${escapeHtml(kb.name)}</h3>
        <p>${escapeHtml(kb.description || 'No description provided.')}</p>
      </div>
      <div class="kb-card-footer">
        <span>Knowledge Base #${kb.id}</span>
        <span class="kb-card-arrow">→</span>
      </div>`;
    card.addEventListener('click', () => openChat(kb.id, kb.name));
    kbGrid.appendChild(card);
  });
}

// Modal
createKbBtn.addEventListener('click', () => newKbModal.classList.remove('hidden'));
cancelKbBtn.addEventListener('click', () => newKbModal.classList.add('hidden'));
cancelKbBtn2.addEventListener('click', () => newKbModal.classList.add('hidden'));
newKbModal.addEventListener('click', e => { if (e.target === newKbModal) newKbModal.classList.add('hidden'); });

submitKbBtn.addEventListener('click', async () => {
  const name = newKbName.value.trim();
  const desc = newKbDesc.value.trim();
  if (!name) { newKbName.focus(); return; }

  submitKbBtn.disabled = true;
  submitKbBtn.textContent = 'Creating…';
  try {
    const res = await fetch(`${API_BASE}/kb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ name, description: desc })
    });
    if (res.ok) {
      newKbModal.classList.add('hidden');
      newKbName.value = '';
      newKbDesc.value = '';
      showDashboard();
    }
  } catch (err) {
    console.error(err);
  } finally {
    submitKbBtn.disabled = false;
    submitKbBtn.textContent = 'Create';
  }
});

// ════════════════════════════════════════════════════
// CHAT
// ════════════════════════════════════════════════════
function openChat(kbId, kbName) {
  currentKbId = kbId;
  currentKbTitle.textContent = kbName;
  chatTopbarSub.textContent = `Chatting with "${kbName}"`;
  chatMessages.innerHTML = `
    <div class="message assistant">
      <div class="msg-avatar">AI</div>
      <div class="msg-bubble">Hello! I'm your AI assistant for <strong>${escapeHtml(kbName)}</strong>. Upload a PDF on the left, then ask me anything about it!</div>
    </div>`;
  showView(chatView);
}

backToDashBtn.addEventListener('click', () => { currentKbId = null; showDashboard(); });

// PDF Upload
pdfUpload.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !currentKbId) return;

  uploadStatus.textContent = '⟳ Uploading…';
  uploadStatus.style.color = 'var(--text-secondary)';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('kb_id', currentKbId);

  try {
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    if (res.ok) {
      uploadStatus.textContent = '✓ Uploaded — indexing in progress';
      uploadStatus.style.color = '#34d399';
      setTimeout(() => { uploadStatus.textContent = ''; }, 6000);
    } else {
      throw new Error('Upload failed');
    }
  } catch {
    uploadStatus.textContent = '✗ Upload failed';
    uploadStatus.style.color = '#f87171';
  }

  pdfUpload.value = '';
});

// Messages
function appendMessage(content, isUser = false, sources = []) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isUser ? 'user' : 'assistant'}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = isUser ? 'U' : 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = isUser ? escapeHtml(content) : marked.parse(content);

  if (sources.length > 0) {
    const badgesDiv = document.createElement('div');
    badgesDiv.className = 'source-badges';
    sources.forEach(src => {
      const badge = document.createElement('span');
      badge.className = 'source-badge';
      badge.textContent = `📄 ${src}`;
      badgesDiv.appendChild(badge);
    });
    bubble.appendChild(badgesDiv);
  }

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return msgDiv;
}

function showTypingIndicator() {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message assistant typing-msg';
  msgDiv.innerHTML = `
    <div class="msg-avatar">AI</div>
    <div class="msg-bubble">
      <div class="typing-dots">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
      </div>
    </div>`;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return msgDiv;
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !currentKbId) return;

  appendMessage(text, true);
  chatInput.value = '';
  chatInput.disabled = true;
  sendBtn.disabled = true;

  const indicator = showTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ question: text, kb_id: currentKbId, top_k: 3 })
    });

    indicator.remove();

    if (!res.ok) throw new Error('Query failed');
    const data = await res.json();
    appendMessage(data.answer, false, data.sources);

  } catch {
    indicator.remove();
    appendMessage('Sorry, something went wrong. Please try again.', false);
  } finally {
    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });

// ── Utility ─────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Bootstrap
init();
