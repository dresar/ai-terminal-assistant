const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3005;
const DATA_DIR = path.join(__dirname, 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'ssh-profiles.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(PROFILES_FILE)) {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify([]));
}

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const [key, ...valueParts] = line.trim().split('=');
    if (key && valueParts.length && !key.startsWith('#')) {
      process.env[key] = valueParts.join('=').trim();
    }
  });
}
loadEnv();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const INTERACTIVE_COMMANDS = ['python', 'node', 'cmd', 'powershell', 'ssh', 'pause', 'nano', 'vi'];

function isInteractiveCommand(command) {
  const trimmed = command.trim().toLowerCase();
  const base = trimmed.split(' ')[0];
  if (!INTERACTIVE_COMMANDS.includes(base)) return false;
  const args = trimmed.split(' ').slice(1);
  if (base === 'python' || base === 'node') return args.length === 0 || !args.some(a => a.startsWith('-'));
  if (base === 'ssh') return args.length === 0 || !args.includes('-T');
  return true;
}

app.post('/api/terminal/exec', (req, res) => {
  const { command, shell } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ success: false, error: 'Command required' });
  }

  if (isInteractiveCommand(command)) {
    return res.status(400).json({
      success: false,
      error: 'Interactive commands are blocked. Use non-interactive arguments (e.g. python -c, node -e, ssh -T).' +
        ' If this is a legitimate command, run it directly in a terminal.'
    });
  }

  const isWindows = process.platform === 'win32';
  let execShell = shell || (isWindows ? 'powershell.exe' : '/bin/bash');
  let execCommand = command;

  if (isWindows && execShell.includes('cmd')) {
    execShell = 'cmd.exe';
  }

  const startTime = Date.now();
  const child = exec(execCommand, { shell: execShell, timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
    const duration = Date.now() - startTime;
    res.json({
      success: true,
      command,
      shell: execShell,
      stdout,
      stderr,
      exitCode: error ? error.code || 1 : 0,
      duration: `${duration}ms`
    });
  });

  if (isWindows && child.pid) {
    child.on('error', () => {});
  }

  child.on('timeout', () => {
    if (isWindows && child.pid) {
      exec(`taskkill /pid ${child.pid} /T /F`, () => {});
    }
  });
});

function readProfiles() {
  try {
    return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function writeProfiles(profiles) {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
}

app.get('/api/ssh/profiles', (req, res) => {
  res.json(readProfiles());
});

app.post('/api/ssh/profiles', (req, res) => {
  const { id, host, port, user, key } = req.body;
  if (!host || !user) {
    return res.status(400).json({ success: false, error: 'Host and user required' });
  }
  const profiles = readProfiles();
  const profile = { id: id || Date.now().toString(), host, port: port || 22, user, key: key || '' };
  const index = profiles.findIndex(p => p.id === profile.id);
  if (index >= 0) {
    profiles[index] = profile;
  } else {
    profiles.push(profile);
  }
  writeProfiles(profiles);
  res.json({ success: true, profile });
});

app.delete('/api/ssh/profiles/:id', (req, res) => {
  const profiles = readProfiles().filter(p => p.id !== req.params.id);
  writeProfiles(profiles);
  res.json({ success: true });
});

async function chatAI(system, user) {
  const baseUrl = process.env.QWEN_BASE_URL || 'http://localhost:20128/v1';
  const apiKey = process.env.QWEN_API_KEY || '';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'kimi-k2.7-code',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      max_tokens: 1024,
      temperature: 0.2
    })
  });
  const data = await response.json();
  return data.choices[0].message.content;
}

app.post('/api/ai/generate', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) {
      return res.status(400).json({ success: false, error: 'Description required' });
    }
    const result = await chatAI(
      'You convert natural language into a single safe shell command. Respond with only the command, no explanation.',
      `Convert to shell command: ${description}`
    );
    res.json({ success: true, command: result.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/ai/diagnose', async (req, res) => {
  try {
    const { stderr } = req.body;
    if (!stderr) {
      return res.status(400).json({ success: false, error: 'stderr required' });
    }
    const result = await chatAI(
      'You analyze command stderr output and return a JSON object with "rootCause" and "fixCommand" fields only.',
      `Analyze this error and provide root cause and fix command:\n\n${stderr}`
    );
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch (e) {
      parsed = { rootCause: result, fixCommand: '' };
    }
    res.json({ success: true, ...parsed });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Terminal Assistant running on http://localhost:${PORT}`);
});