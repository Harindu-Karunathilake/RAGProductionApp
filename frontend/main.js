import { marked } from 'marked';
const API_BASE = '/api';

// Views
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const chatView = document.getElementById('chat-view');
const newKbModal = document.getElementById('new-kb-modal');

// Auth elements
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');

// Dashboard elements
const createKbBtn = document.getElementById('create-kb-btn');
const kbGrid = document.getElementById('kb-grid');
const newKbName = document.getElementById('new-kb-name');
const newKbDesc = document.getElementById('new-kb-desc');
const cancelKbBtn = document.getElementById('cancel-kb-btn');
const submitKbBtn = document.getElementById('submit-kb-btn');
const backToDashBtn = document.getElementById('back-to-dash-btn');
const currentKbTitle = document.getElementById('current-kb-title');

// Chat elements
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const pdfUpload = document.getElementById('pdf-upload');
const uploadStatus = document.getElementById('upload-status');

let authToken = localStorage.getItem('token');
let currentKbId = null;

// --- Routing & State ---

function showView(view) {
  loginView.classList.remove('active');
  dashboardView.classList.remove('active');
  chatView.classList.remove('active');
  
  loginView.classList.add('hidden');
  dashboardView.classList.add('hidden');
  chatView.classList.add('hidden');
  
  view.classList.remove('hidden');
  view.classList.add('active');
}

function init() {
  if (authToken) {
    showDashboard();
  } else {
    showView(loginView);
  }
}

// --- Auth API ---

async function handleAuth(action) {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (!username || !password) {
    authError.textContent = 'Please enter both username and password.';
    return;
  }
  
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
      authError.style.color = '#10b981';
      authError.textContent = 'Registered successfully. Please login.';
    } else if (action === 'login') {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });
      if (!res.ok) throw new Error('Invalid credentials');
      
      const data = await res.json();
      authToken = data.access_token;
      localStorage.setItem('token', authToken);
      usernameInput.value = '';
      passwordInput.value = '';
      authError.textContent = '';
      showDashboard();
    }
  } catch (err) {
    authError.style.color = '#ef4444';
    authError.textContent = err.message;
  }
}

loginBtn.addEventListener('click', () => handleAuth('login'));
registerBtn.addEventListener('click', () => handleAuth('register'));
logoutBtn.addEventListener('click', () => {
  authToken = null;
  localStorage.removeItem('token');
  showView(loginView);
});

// --- Dashboard API ---

async function fetchKbs() {
  const res = await fetch(`${API_BASE}/kb`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (!res.ok) {
    if (res.status === 401) logoutBtn.click();
    return [];
  }
  return await res.json();
}

async function showDashboard() {
  showView(dashboardView);
  kbGrid.innerHTML = '<p>Loading knowledge bases...</p>';
  const kbs = await fetchKbs();
  
  kbGrid.innerHTML = '';
  if (kbs.length === 0) {
    kbGrid.innerHTML = '<p style="color: var(--text-secondary);">No knowledge bases found. Create one to get started.</p>';
  }
  
  kbs.forEach(kb => {
    const card = document.createElement('div');
    card.className = 'kb-card';
    card.innerHTML = `
      <h3>${kb.name}</h3>
      <p>${kb.description || 'No description'}</p>
    `;
    card.addEventListener('click', () => openChat(kb.id, kb.name));
    kbGrid.appendChild(card);
  });
}

createKbBtn.addEventListener('click', () => newKbModal.classList.remove('hidden'));
cancelKbBtn.addEventListener('click', () => newKbModal.classList.add('hidden'));

submitKbBtn.addEventListener('click', async () => {
  const name = newKbName.value.trim();
  const desc = newKbDesc.value.trim();
  if (!name) return;
  
  submitKbBtn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/kb`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
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
  }
});

// --- Chat View ---

function openChat(kbId, kbName) {
  currentKbId = kbId;
  currentKbTitle.textContent = kbName;
  chatMessages.innerHTML = `
    <div class="message assistant">
      <div class="avatar">AI</div>
      <div class="bubble">Hello! I'm your AI assistant for <strong>${kbName}</strong>. Upload a PDF on the left and ask me questions about it!</div>
    </div>
  `;
  showView(chatView);
}

backToDashBtn.addEventListener('click', () => {
  currentKbId = null;
  showDashboard();
});

// Handle PDF Upload
pdfUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !currentKbId) return;

  uploadStatus.textContent = 'Uploading and processing...';
  uploadStatus.style.color = '#94a3b8';

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
      uploadStatus.textContent = 'Upload successful! Ready to query.';
      uploadStatus.style.color = '#10b981';
      setTimeout(() => uploadStatus.textContent = '', 5000);
    } else {
      throw new Error('Upload failed');
    }
  } catch (error) {
    uploadStatus.textContent = 'Error uploading file.';
    uploadStatus.style.color = '#ef4444';
  }
});

function createMessageElement(content, isUser = false, sources = []) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isUser ? 'user' : 'assistant'}`;
  
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = isUser ? 'U' : 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = marked.parse(content);

  if (sources.length > 0) {
    const badgesDiv = document.createElement('div');
    badgesDiv.className = 'source-badges';
    sources.forEach(src => {
      const badge = document.createElement('span');
      badge.className = 'source-badge';
      badge.textContent = `Source: ${src}`;
      badgesDiv.appendChild(badge);
    });
    bubble.appendChild(badgesDiv);
  }

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  return msgDiv;
}

function showTypingIndicator() {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message assistant typing-msg';
  msgDiv.innerHTML = `
    <div class="avatar">AI</div>
    <div class="bubble">
      <div class="typing-dots">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    </div>
  `;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return msgDiv;
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !currentKbId) return;

  chatMessages.appendChild(createMessageElement(text, true));
  chatInput.value = '';
  chatInput.disabled = true;
  sendBtn.disabled = true;
  
  chatMessages.scrollTop = chatMessages.scrollHeight;
  const typingIndicator = showTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/query`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ question: text, kb_id: currentKbId, top_k: 3 })
    });

    typingIndicator.remove();

    if (!res.ok) throw new Error('Query failed');
    
    const data = await res.json();
    chatMessages.appendChild(createMessageElement(data.answer, false, data.sources));
    
  } catch (error) {
    typingIndicator.remove();
    chatMessages.appendChild(createMessageElement('Sorry, I encountered an error. Have you uploaded a PDF yet?', false));
  } finally {
    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.focus();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// Bootstrap app
init();
