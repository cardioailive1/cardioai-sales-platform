# Cardio AI — Autonomous Sales Engine

Production-ready full-stack sales platform for Cardio AI Corp.

## Stack
- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML/CSS/JS (served by Express)
- **AI:** Anthropic Claude (claude-sonnet-4-6)
- **Email:** Gmail API (OAuth 2.0)
- **Leads:** Apollo.io API
- **Storage:** JSON file (swap for PostgreSQL/MongoDB in production)

---

## Quick Start

### 1. Install dependencies
```bash
cd cardioai-sales
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Get your API keys

**Anthropic (required):**
- Go to https://console.anthropic.com
- Create API key
- Add to .env: `ANTHROPIC_API_KEY=sk-ant-...`

**Google Gmail API (required for email sending):**
- Go to https://console.cloud.google.com
- Create project → Enable Gmail API
- Create OAuth 2.0 credentials (Web Application)
- Add authorized redirect URI: `http://localhost:3001/auth/callback`
- Production: `https://sales.cardioailive.com/auth/callback`
- Add to .env: `GOOGLE_CLIENT_ID=...` and `GOOGLE_CLIENT_SECRET=...`

**Apollo.io (required for lead sourcing):**
- Go to https://app.apollo.io/settings/api
- Generate API key
- Add to .env: `APOLLO_API_KEY=...`

### 4. Start the server
```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

### 5. Open the app
```
http://localhost:3001
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check + service status |
| POST | /api/ai/generate | Generate personalized outreach email |
| POST | /api/ai/qualify | BANT lead qualification |
| POST | /api/ai/chat | Sales advisor chat |
| POST | /api/ai/briefing | Daily sales briefing |
| POST | /api/ai/launch | Launch plan briefing |
| POST | /api/ai/milestones/generate | AI-generate 20 milestones |
| POST | /api/ai/score | Score Apollo leads against ICP |
| GET | /api/gmail/auth-url | Get Gmail OAuth URL |
| POST | /api/gmail/auth | Exchange OAuth code for tokens |
| POST | /api/gmail/send | Send email via Gmail |
| POST | /api/apollo/search | Search Apollo.io for leads |
| GET/POST | /api/leads | List / create leads |
| PUT/DELETE | /api/leads/:id | Update / delete lead |
| GET/POST | /api/waitlist | List / add waitlist entries |
| PUT/DELETE | /api/waitlist/:id | Update / remove waitlist entry |
| GET/POST | /api/milestones | List / create milestones |
| PUT/DELETE | /api/milestones/:id | Update / delete milestone |
| GET/POST | /api/revenue | List / log revenue events |
| GET/POST | /api/sequences | List sequences / enroll lead |
| GET/DELETE | /api/log | View / clear send log |
| GET | /api/analytics/summary | Full analytics summary |

---

## Deploy to Production (cardioailive.com)

### Option A — Render.com (recommended, free tier)
1. Push to GitHub
2. Connect repo at https://render.com
3. Add environment variables in Render dashboard
4. Deploy — Render handles HTTPS automatically

### Option B — Railway
1. `npm install -g railway`
2. `railway login && railway init`
3. `railway up`

### Option C — VPS (DigitalOcean/AWS)
```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and install
git clone your-repo
cd cardioai-sales && npm install

# Install PM2 process manager
npm install -g pm2
pm2 start server.js --name cardioai-sales
pm2 startup && pm2 save

# Set up nginx reverse proxy
# Point sales.cardioailive.com → localhost:3001
```

---

## File Structure
```
cardioai-sales/
├── server.js          # Express backend (all API routes)
├── package.json       # Dependencies
├── .env.example       # Environment variable template
├── .env               # Your secrets (never commit!)
├── .gitignore
├── data.json          # Persisted data (auto-created)
└── public/
    └── index.html     # Full frontend (HTML/CSS/JS)
```

---

## Upgrade Path (when you hit scale)

1. **Database:** Replace data.json with PostgreSQL via `pg` or MongoDB via `mongoose`
2. **Auth:** Add team login with `passport.js` or Auth0
3. **Email scheduling:** Add node-cron for automated sequence timing
4. **Webhooks:** Add Gmail webhook to detect replies and pause sequences automatically
5. **Doximity:** Add Doximity API once approved for physician-verified contacts

---

Built for Cardio AI Corp — tonywell@cardioailive.com | cardioailive.com
