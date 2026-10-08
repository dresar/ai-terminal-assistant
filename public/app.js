let commandHistory = [];
let historyIndex = -1;

const presets = {
  git: ["git status", "git log --oneline -10", "git branch -a"],
  docker: ["docker ps", "docker images", "docker system df"],
  system: ["systeminfo", "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10"],
  network: ["ipconfig", "ping 8.8.8.8", "netstat -an"]
};

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('command-input');
  input.addEventListener('keydown', handleInputKey);
  loadProfiles();
});

function handleInputKey(e) {
  const input = document.getElementById('command-input');
  if (e.key === 'Enter') {
    runCommand(input.value);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    navigateHistory(-1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    navigateHistory(1);
  }
}

function navigateHistory(direction) {
  const input = document.getElementById('command-input');
  if (commandHistory.length === 0) return;
  historyIndex += direction;
  if (historyIndex < 0) historyIndex = 0;
  if (historyIndex >= commandHistory.length) historyIndex = commandHistory.length - 1;
  input.value = commandHistory[historyIndex];
}

function setPreset(category) {
  const list = presets[category];
  if (!list) return;
  document.getElementById('command-input').value = list[0];
}

async function runCommand(command) {
  command = command.trim();
  if (!command) return;

  const outputPanel = document.getElementById('output-panel');
  appendOutput(`$ ${command}`, 'command');

  if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== command) {
    commandHistory.push(command);
  }
  historyIndex = commandHistory.length;
  updateHistoryUI();
  document.getElementById('command-input').value = '';

  try {
    const res = await fetch('/api/terminal/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    });
    const data = await res.json();
    appendOutput(data.stdout || '', 'stdout');
    if (data.stderr) {
      appendOutput(data.stderr, 'stderr');
    }
    if (data.exitCode !== 0) {
      appendOutput(`Exit code: ${data.exitCode}`, 'stderr');
    }
  } catch (err) {
    appendOutput(`Error: ${err.message}`, 'stderr');
  }
}

function appendOutput(text, type) {
  const panel = document.getElementById('output-panel');
  const line = document.createElement('div');
  if (type === 'command') {
    line.innerHTML = `<span style="color:#2ea043;font-weight:bold;">${ansiToHtml(text)}</span>`;
  } else if (type === 'stderr') {
    line.innerHTML = `<span style="color:#ff7b72;">${ansiToHtml(text)}</span>`;
  } else {
    line.innerHTML = ansiToHtml(text);
  }
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

function ansiToHtml(text) {
  if (!text) return '';
  const colorMap = {
    30: 'ansi-black', 31: 'ansi-red', 32: 'ansi-green', 33: 'ansi-yellow',
    34: 'ansi-blue', 35: 'ansi-magenta', 36: 'ansi-cyan', 37: 'ansi-white',
    90: 'ansi-bright-black', 91: 'ansi-red', 92: 'ansi-green', 93: 'ansi-yellow',
    94: 'ansi-blue', 95: 'ansi-magenta', 96: 'ansi-cyan', 97: 'ansi-white'
  };
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  let openSpans = 0;
  html = html.replace(/\x1b\[(\d+(?:;\d+)*)m/g, (match, codes) => {
    const parts = codes.split(';').map(Number);
    if (parts.includes(0)) {
      const close = '</span>'.repeat(openSpans);
      openSpans = 0;
      return close;
    }
    let classes = [];
    parts.forEach(code => {
      if (colorMap[code]) classes.push(colorMap[code]);
      if (code === 1) classes.push('ansi-bold');
    });
    openSpans++;
    return classes.length ? `<span class="${classes.join(' ')}">` : '<span>';
  });

  html += '</span>'.repeat(openSpans);
  return html;
}

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function updateHistoryUI() {
  const list = document.getElementById('history-list');
  list.innerHTML = commandHistory.slice().reverse().map(cmd => `<li onclick="useHistory('${escapeHtml(cmd).replace(/'/g, "\\'")}')">${escapeHtml(cmd)}</li>`).join('');
}

function useHistory(cmd) {
  document.getElementById('command-input').value = cmd;
}

function clearOutput() {
  document.getElementById('output-panel').innerHTML = '';
}

async function generateCommand() {
  const input = document.getElementById('ai-generate-input');
  const resultBox = document.getElementById('ai-generate-result');
  const description = input.value.trim();
  if (!description) return;
  resultBox.textContent = 'Generating...';
  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
    const data = await res.json();
    if (data.success) {
      resultBox.textContent = data.command;
    } else {
      resultBox.textContent = `Error: ${data.error}`;
    }
  } catch (err) {
    resultBox.textContent = `Error: ${err.message}`;
  }
}

function useGeneratedCommand() {
  const cmd = document.getElementById('ai-generate-result').textContent;
  if (cmd && !cmd.startsWith('Error')) {
    document.getElementById('command-input').value = cmd;
  }
}

async function diagnoseError() {
  const input = document.getElementById('ai-diagnose-input');
  const resultBox = document.getElementById('ai-diagnose-result');
  const stderr = input.value.trim();
  if (!stderr) return;
  resultBox.textContent = 'Diagnosing...';
  try {
    const res = await fetch('/api/ai/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stderr })
    });
    const data = await res.json();
    if (data.success) {
      resultBox.textContent = `Root Cause:\n${data.rootCause}\n\nFix Command:\n${data.fixCommand}`;
    } else {
      resultBox.textContent = `Error: ${data.error}`;
    }
  } catch (err) {
    resultBox.textContent = `Error: ${err.message}`;
  }
}

function saveProfile() {
  const host = document.getElementById('ssh-host').value.trim();
  const port = parseInt(document.getElementById('ssh-port').value) || 22;
  const user = document.getElementById('ssh-user').value.trim();
  const key = document.getElementById('ssh-key').value.trim();
  if (!host || !user) return alert('Host and user required');

  fetch('/api/ssh/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host, port, user, key })
  }).then(() => {
    document.getElementById('ssh-host').value = '';
    document.getElementById('ssh-port').value = '22';
    document.getElementById('ssh-user').value = '';
    document.getElementById('ssh-key').value = '';
    loadProfiles();
  });
}

async function loadProfiles() {
  try {
    const res = await fetch('/api/ssh/profiles');
    const profiles = await res.json();
    const list = document.getElementById('ssh-list');
    if (profiles.length === 0) {
      list.innerHTML = '<li>No profiles saved</li>';
      return;
    }
    list.innerHTML = profiles.map(p => `
      <li>
        <span>${escapeHtml(p.user)}@${escapeHtml(p.host)}:${p.port}</span>
        <button class="btn-danger" style="padding:4px 8px;font-size:0.75rem;" onclick="deleteProfile('${p.id}')">Delete</button>
      </li>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function deleteProfile(id) {
  await fetch(`/api/ssh/profiles/${id}`, { method: 'DELETE' });
  loadProfiles();
}
