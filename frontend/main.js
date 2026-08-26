import { marked } from 'marked';
const API_BASE = '/api';

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const pdfUpload = document.getElementById('pdf-upload');
const uploadStatus = document.getElementById('upload-status');

// Handle PDF Upload
pdfUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  uploadStatus.textContent = 'Uploading and processing...';
  uploadStatus.style.color = '#94a3b8';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
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

// Create Message Element
function createMessageElement(content, isUser = false, sources = []) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isUser ? 'user' : 'assistant'}`;
  
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = isUser ? 'U' : 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  
  // Format markdown properly using marked
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

// Add typing indicator
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

// Handle Chat Submission
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  // Add user message
  chatMessages.appendChild(createMessageElement(text, true));
  chatInput.value = '';
  chatInput.disabled = true;
  sendBtn.disabled = true;
  
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const typingIndicator = showTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text, top_k: 3 })
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
