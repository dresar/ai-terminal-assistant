# AI Terminal Assistant

AI-powered terminal assistant with real command execution, SSH profile management, and natural language command generation.

## Features

- Real command execution via PowerShell/CMD with safety timeout
- Command history and quick-action preset buttons
- ANSI-styled output panel
- Natural language to command generation
- One-click error auto-fix diagnosis
- SSH profile manager

## API Endpoints

- `POST /api/terminal/exec` - Execute a shell command
- `GET /api/ssh/profiles` - List saved SSH profiles
- `POST /api/ssh/profiles` - Save an SSH profile
- `DELETE /api/ssh/profiles/:id` - Delete an SSH profile
- `POST /api/ai/generate` - Convert natural language to shell command
- `POST /api/ai/diagnose` - Analyze stderr and suggest fix

## Usage

```bash
npm install
npm start
```

Open `http://localhost:3005` in your browser.
