/**
 * Cardio AI — Sales Engine Backend
 * Node.js + Express production server
 * 
 * Routes:
 *   POST /api/ai/generate      — AI email/content generation
 *   POST /api/ai/qualify       — BANT lead qualification
 *   POST /api/ai/chat          — Sales advisor chat
 *   POST /api/ai/briefing      — Daily briefing
 *   POST /api/gmail/send       — Send email via Gmail API
 *   POST /api/gmail/auth       — Gmail OAuth token exchange
 *   POST /api/apollo/search    — Apollo.io people search
 *   GET  /api/leads            — Get all leads
 *   POST /api/leads            — Create lead
 *   PUT  /api/leads/:id        — Update lead
 *   DELETE /api/leads/:id      — Delete lead
 *   GET  /api/waitlist         — Get waitlist
 *   POST /api/waitlist         — Add to waitlist
 *   PUT  /api/waitlist/:id     — Update waitlist entry
 *   DELETE /api/waitlist/:id   — Remove from waitlist
 *   GET  /api/milestones       — Get milestones
 *   POST /api/milestones       — Create milestone
 *   PUT  /api/milestones/:id   — Update milestone
 *   DELETE /api/milestones/:id — Delete milestone
 *   GET  /api/revenue          — Get revenue log
 *   POST /api/revenue          — Log revenue event
 *   GET  /api/sequences        — Get sequences
 *   POST /api/sequences/enroll — Enroll lead in sequence
 *   GET  /api/log              — Get send log
 *   GET  /api/health           — Health check
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');

const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again in 15 minutes.' }
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'AI rate limit reached. Please wait 60 seconds.' }
});
app.use('/api/', apiLimiter);
app.use('/api/ai/', aiLimiter);
// ── Session middleware ───────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// ── Auth middleware ──────────────────────────────────────
const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'cardioailive.com';
const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS ? process.env.ALLOWED_EMAILS.split(',').map(e=>e.trim()) : [];

function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (req.path.startsWith('/api/auth') || req.path === '/api/health') return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  // Serve login page for all other routes
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
}

function isAllowedUser(email) {
  if (!email) return false;
  const domain = email.split('@')[1];
  if (domain === ALLOWED_DOMAIN) return true;
  if (ALLOWED_EMAILS.includes(email)) return true;
  return false;
}

app.use(requireAuth);


// ── Clients ─────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// ── In-memory store (replace with DB in production) ─────
let store = {
  leads: [],
  waitlist: [],
  milestones: [],
  revenue: [],
  sequences: [],
  sendLog: [],
  counters: { leads: 1, waitlist: 1, milestones: 1, revenue: 1, sequences: 1 }
};

// Load persisted data if exists
const DATA_FILE = path.join(__dirname, 'data.json');
if (fs.existsSync(DATA_FILE)) {
  try {
    store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    console.log('✅ Loaded persisted data');
  } catch(e) {
    console.log('⚠️ Could not load data.json, starting fresh');
  }
}

function saveStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch(e) {
    console.error('Could not persist data:', e.message);
  }
}

// ── Cardio AI system context ─────────────────────────────
const CARDIO_AI_CONTEXT = `You are the AI sales engine for Cardio AI Corp, founded by Sampson Kontomah.
Key facts:
- Product: AI-powered cardiac diagnostic platform (echo, ECG, CAD analysis)
- Accuracy: 96.8% diagnostic accuracy
- Pricing: $80 PMPM Professional tier ($40 Starter, Enterprise custom, $40 IoMT add-on)
- Blended PMPM: $85 Y1 → $122 Y2 → $156 Y3
- ICP: Community hospitals 200-500 beds, Epic/Cerner EHR, US-based
- Traction: 5 LOIs signed, 65 discovery interviews, 380 waitlist, $51M Y1 pipeline
- Validation: Van Westendorp $60-$110 PMPM range, 78% cardiologists would replace current solution
- CFO ROI breakeven: 3-4% readmission reduction
- Regulatory: NexGenLife (nesgenlife.studio) handles FDA 510(k) / ISO 13485
- Team: Sampson Kontomah (CEO), Galax Womack (CTO), Avi Patel (VP Eng), Dr. Tamanna Nahar (CMO), Julia Amegbe (Country Director Ghana)
- Email: tonywell@cardioailive.com | Website: cardioailive.com
Be specific, data-driven, and actionable. No fluff.`;


// ── Auth routes ──────────────────────────────────────────
const googleAuthClient = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/callback'
);

app.get('/api/auth/google', (req, res) => {
  const url = googleAuthClient.generateAuthUrl({
    access_type: 'online',
    scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
    prompt: 'select_account'
  });
  res.redirect(url);
});

app.get('/api/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect('/login.html?error=cancelled');
  if (!code) return res.redirect('/login.html?error=no_code');

  try {
    const { tokens } = await googleAuthClient.getToken(code);
    googleAuthClient.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: googleAuthClient });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    const name = userInfo.data.name;
    const picture = userInfo.data.picture;

    if (!isAllowedUser(email)) {
      console.log(`Blocked sign-in attempt: ${email}`);
      return res.redirect('/login.html?error=unauthorized&email=' + encodeURIComponent(email));
    }

    req.session.user = { email, name, picture, signedInAt: new Date().toISOString() };
    console.log(`✅ User signed in: ${email}`);
    res.redirect('/');
  } catch(e) {
    console.error('Auth error:', e.message);
    res.redirect('/login.html?error=auth_failed');
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: req.session.user });
});

app.post('/api/auth/signout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ── Health check ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      gmail: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      apollo: !!process.env.APOLLO_API_KEY
    }
  });
});

// ── AI Routes ────────────────────────────────────────────
app.post('/api/ai/generate', async (req, res) => {
  const { leadId, type, context } = req.body;
  if (!leadId || !type) return res.status(400).json({ error: 'leadId and type required' });

  const lead = store.leads.find(l => l.id === leadId) || store.waitlist.find(w => w.id === leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const typeMap = {
    cold_email: 'a cold outreach email (Touch 1)',
    followup: 'a follow-up email (Touch 2 — no reply yet)',
    case_study: 'a case study email referencing Octagos Health $43M Series B and Viz.ai (Touch 3)',
    demo_invite: 'a personalized demo invitation (Touch 4)',
    breakup: 'a breakup email that creates urgency (Touch 5)',
    linkedin: 'a LinkedIn InMail (under 250 words)',
    call_script: 'a phone call script with talking points and objection handling',
    loi_push: 'an email to move this lead toward signing an LOI',
    waitlist_confirm: 'a warm waitlist confirmation + early access email',
    beta_invite: 'an exciting beta access invitation',
    onboarding_start: 'an onboarding kickoff email with next steps'
  };

  const prompt = `Write ${typeMap[type] || type} for Cardio AI targeting:
Name: ${lead.name}
Role: ${lead.role}
Organization: ${lead.org}
Beds: ${lead.beds || 'community hospital'}
EHR: ${lead.ehr || 'Epic/Cerner'}
Email: ${lead.email}
Stage: ${lead.stage !== undefined ? ['ICP targeting','Lead gen','Outreach','Demo','LOI','Closed'][lead.stage] : 'Waitlist'}
Notes: ${lead.notes || 'none'}
${context ? 'Extra context: ' + context : ''}

Sign as: Sampson Kontomah, Founder & CEO, Cardio AI | tonywell@cardioailive.com | cardioailive.com`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: CARDIO_AI_CONTEXT,
      messages: [{ role: 'user', content: prompt }]
    });
    res.json({ text: msg.content[0].text, lead: lead.name });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/qualify', async (req, res) => {
  const { leadId, intel } = req.body;
  const lead = store.leads.find(l => l.id === leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const prompt = `Perform a detailed BANT qualification for this Cardio AI lead:
${lead.name}, ${lead.role} at ${lead.org}. Beds: ${lead.beds||'?'}, EHR: ${lead.ehr||'?'}, Stage: ${['ICP targeting','Lead gen','Outreach','Demo','LOI','Closed'][lead.stage]}, Temp: ${lead.temp}. Notes: ${lead.notes||'none'}.
${intel ? 'Additional intel: ' + intel : ''}

Provide:
1. BANT Score — Budget/Authority/Need/Timeline each 1-10 with reasoning
2. Overall qualification score (1-10) with verdict
3. ICP fit assessment
4. Top 3 likely objections
5. Recommended next action (specific — what, when, how)
6. Suggested Cardio AI tier + IoMT add-on Y/N`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: CARDIO_AI_CONTEXT,
      messages: [{ role: 'user', content: prompt }]
    });
    res.json({ text: msg.content[0].text });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !messages.length) return res.status(400).json({ error: 'messages required' });

  const pipelineSummary = `Pipeline: ${store.leads.length} leads. Waitlist: ${store.waitlist.length}. LOIs: ${store.leads.filter(l=>l.stage>=4).length}. Hot: ${store.leads.filter(l=>l.temp==='hot').length}. Emails sent: ${store.sendLog.length}.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: CARDIO_AI_CONTEXT + '\n' + pipelineSummary + '\nGive sharp, specific, actionable advice in 2-4 sentences. No fluff.',
      messages
    });
    res.json({ text: msg.content[0].text });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/briefing', async (req, res) => {
  const hot = store.leads.filter(l=>l.temp==='hot').map(l=>`${l.name} (${l.role}, ${['ICP','Lead gen','Outreach','Demo','LOI','Closed'][l.stage]})`).join('; ') || 'none';
  const demos = store.leads.filter(l=>l.stage===3).map(l=>l.name).join(', ') || 'none';
  const prompt = `Daily sales briefing for Cardio AI. Hot leads: ${hot}. Demo stage: ${demos}. Total leads: ${store.leads.length}. LOIs: ${store.leads.filter(l=>l.stage>=4).length}. Waitlist: ${store.waitlist.length}. Give: (1) top 3 priorities today, (2) who to follow up with urgently, (3) one strategic insight. Be direct.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: CARDIO_AI_CONTEXT,
      messages: [{ role: 'user', content: prompt }]
    });
    res.json({ text: msg.content[0].text });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/launch', async (req, res) => {
  const done = store.milestones.filter(m=>m.status==='done').length;
  const total = store.milestones.length;
  const rev = store.revenue.reduce((a,r)=>a+r.amount,0);
  const prompt = `Launch briefing for Cardio AI. Milestones: ${done}/${total} done. Revenue logged: $${rev.toLocaleString()} of $51M Y1 target. Waitlist: ${store.waitlist.length} (${store.waitlist.filter(w=>w.status==='onboarded').length} onboarded). Leads: ${store.leads.length}. Give: (1) launch phase assessment, (2) top 3 critical path items to first revenue, (3) 30/60/90 day priorities, (4) biggest risk to $51M target.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: CARDIO_AI_CONTEXT,
      messages: [{ role: 'user', content: prompt }]
    });
    res.json({ text: msg.content[0].text });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/milestones/generate', async (req, res) => {
  const today = new Date().toISOString().slice(0,10);
  const prompt = `Generate a comprehensive launch and commercialization milestone plan for Cardio AI. Create exactly 20 milestones across 4 phases. Return ONLY valid JSON array:
[{"title":"...","phase":0,"owner":"...","due":"YYYY-MM-DD","category":"product|sales|regulatory|clinical|partnerships|marketing|finance|team","priority":"critical|high|medium","desc":"...","status":"pending"}]

Phase 0 (Beta prep, now-3mo): deployment, echo validation, first 3 beta sites
Phase 1 (Beta launch, 3-6mo): 10 beta sites, echo validation complete, first revenue
Phase 2 (Commercial launch, 6-12mo): full commercial, payer partnerships, FDA pathway
Phase 3 (Scale, 12-24mo): 50+ health systems, Y1 $51M, Series A

Today: ${today}. Owners: Sampson, Galax, Avi, Dr. Nahar, Julia.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: 'Return ONLY valid JSON array. No markdown, no backticks, no explanation.',
      messages: [{ role: 'user', content: prompt }]
    });
    const clean = msg.content[0].text.replace(/```json|```/g,'').trim();
    const milestones = JSON.parse(clean);
    res.json({ milestones });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/score', async (req, res) => {
  const { people } = req.body;
  if (!people || !people.length) return res.status(400).json({ error: 'people required' });

  const prompt = `Score these leads against Cardio AI ICP (community hospitals 200-500 beds, Epic/Cerner, cardiologists/CMOs/CFOs/hospitalists, US). For each give ICP score 1-10, reason (1 sentence), temperature (hot/warm/cold). Return ONLY valid JSON: [{"id":"...","score":8,"reason":"...","temp":"hot"}]. Leads: ${JSON.stringify(people.map(p=>({id:p.id,title:p.title,org:p.organization?.name,employees:p.organization?.num_employees,location:(p.city||'')+(p.state?', '+p.state:'')})))}`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: 'Return ONLY valid JSON array. No markdown.',
      messages: [{ role: 'user', content: prompt }]
    });
    const clean = msg.content[0].text.replace(/```json|```/g,'').trim();
    res.json({ scores: JSON.parse(clean) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Gmail Routes ─────────────────────────────────────────
app.post('/api/gmail/auth', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Authorization code required' });

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    res.json({ success: true, email: userInfo.data.email, tokens });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/gmail/send', async (req, res) => {
  const { to, subject, body, accessToken } = req.body;
  if (!to || !subject || !body || !accessToken) {
    return res.status(400).json({ error: 'to, subject, body, and accessToken required' });
  }

  try {
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body
    ];
    const raw = Buffer.from(emailLines.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });

    const logEntry = {
      id: Date.now(),
      to,
      subject,
      messageId: result.data.id,
      status: 'sent',
      time: new Date().toISOString()
    };
    store.sendLog.unshift(logEntry);
    if (store.sendLog.length > 500) store.sendLog = store.sendLog.slice(0, 500);
    saveStore();

    res.json({ success: true, messageId: result.data.id });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/gmail/auth-url', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    prompt: 'consent'
  });
  res.json({ url });
});

// ── Apollo Routes ────────────────────────────────────────
app.post('/api/apollo/search', async (req, res) => {
  const { titles, location, empMin, empMax, keywords, limit } = req.body;
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Apollo API key not configured on server' });

  try {
    const payload = {
      api_key: apiKey,
      person_titles: titles || ['Cardiologist', 'Chief Medical Officer', 'CFO', 'Hospitalist'],
      organization_num_employees_ranges: [`${empMin||200},${empMax||2000}`],
      person_locations: [location || 'United States'],
      page: 1,
      per_page: Math.min(limit || 25, 100)
    };
    if (keywords) payload.q_keywords = keywords;

    const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error || 'Apollo API error' });
    }

    const data = await response.json();
    res.json({
      people: data.people || [],
      total: data.pagination?.total_entries || 0,
      creditsRemaining: data.rate_limit_remaining
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Leads CRUD ───────────────────────────────────────────
app.get('/api/leads', (req, res) => res.json(store.leads));

app.post('/api/leads', (req, res) => {
  const { name, org, role, email, beds, ehr, stage, temp, notes } = req.body;
  if (!name || !org) return res.status(400).json({ error: 'name and org required' });
  const lead = {
    id: store.counters.leads++,
    name, org, role: role||'Unknown', email: email||'',
    beds: beds||'', ehr: ehr||'', stage: parseInt(stage)||0,
    temp: temp||'warm', notes: notes||'',
    added: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}),
    createdAt: new Date().toISOString()
  };
  store.leads.push(lead);
  saveStore();
  res.status(201).json(lead);
});

app.put('/api/leads/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = store.leads.findIndex(l => l.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Lead not found' });
  store.leads[idx] = { ...store.leads[idx], ...req.body, id, updatedAt: new Date().toISOString() };
  saveStore();
  res.json(store.leads[idx]);
});

app.delete('/api/leads/:id', (req, res) => {
  const id = parseInt(req.params.id);
  store.leads = store.leads.filter(l => l.id !== id);
  saveStore();
  res.json({ success: true });
});

// ── Waitlist CRUD ────────────────────────────────────────
app.get('/api/waitlist', (req, res) => res.json(store.waitlist));

app.post('/api/waitlist', (req, res) => {
  const { name, org, role, email, beds, ehr, persona, priority } = req.body;
  if (!name || !org) return res.status(400).json({ error: 'name and org required' });
  const entry = {
    id: 'w' + store.counters.waitlist++,
    name, org, role: role||'Unknown', email: email||'',
    beds: beds||'', ehr: ehr||'',
    persona: persona||'cardiologist',
    priority: priority||'medium',
    status: 'not_invited',
    added: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}),
    createdAt: new Date().toISOString()
  };
  store.waitlist.push(entry);
  saveStore();
  res.status(201).json(entry);
});

app.put('/api/waitlist/:id', (req, res) => {
  const id = req.params.id;
  const idx = store.waitlist.findIndex(w => w.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Entry not found' });
  store.waitlist[idx] = { ...store.waitlist[idx], ...req.body, id, updatedAt: new Date().toISOString() };
  saveStore();
  res.json(store.waitlist[idx]);
});

app.delete('/api/waitlist/:id', (req, res) => {
  store.waitlist = store.waitlist.filter(w => w.id !== req.params.id);
  saveStore();
  res.json({ success: true });
});

// ── Milestones CRUD ──────────────────────────────────────
app.get('/api/milestones', (req, res) => res.json(store.milestones));

app.post('/api/milestones', (req, res) => {
  const { title, phase, owner, due, category, priority, desc } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const ms = {
    id: store.counters.milestones++,
    title, phase: parseInt(phase)||0,
    owner: owner||'Unassigned',
    due: due||'', category: category||'product',
    priority: priority||'medium', desc: desc||'',
    status: 'pending',
    added: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}),
    createdAt: new Date().toISOString()
  };
  store.milestones.push(ms);
  saveStore();
  res.status(201).json(ms);
});

app.put('/api/milestones/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = store.milestones.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Milestone not found' });
  if (req.body.status === 'done' && store.milestones[idx].status !== 'done') {
    req.body.completedAt = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
  }
  store.milestones[idx] = { ...store.milestones[idx], ...req.body, id };
  saveStore();
  res.json(store.milestones[idx]);
});

app.delete('/api/milestones/:id', (req, res) => {
  store.milestones = store.milestones.filter(m => m.id !== parseInt(req.params.id));
  saveStore();
  res.json({ success: true });
});

// ── Revenue CRUD ─────────────────────────────────────────
app.get('/api/revenue', (req, res) => res.json(store.revenue));

app.post('/api/revenue', (req, res) => {
  const { customer, amount, type, date, pmpm, members } = req.body;
  if (!customer || !amount) return res.status(400).json({ error: 'customer and amount required' });
  const rv = {
    id: store.counters.revenue++,
    customer, amount: parseFloat(amount),
    type: type||'Contract', date: date||new Date().toLocaleDateString(),
    pmpm: pmpm||'', members: members||'',
    logged: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}),
    createdAt: new Date().toISOString()
  };
  store.revenue.push(rv);
  saveStore();
  res.status(201).json(rv);
});

// ── Sequences ────────────────────────────────────────────
app.get('/api/sequences', (req, res) => res.json(store.sequences));

app.post('/api/sequences/enroll', (req, res) => {
  const { leadId, seqId } = req.body;
  if (!leadId || !seqId) return res.status(400).json({ error: 'leadId and seqId required' });
  if (store.sequences.find(s => s.leadId === leadId && s.status === 'active')) {
    return res.status(409).json({ error: 'Lead already enrolled in an active sequence' });
  }
  const seqNames = { cardiologist:'Cardiologist 5-touch', cmo:'CMO/CFO ROI', payer:'Payer medical director', hospitalist:'Hospitalist MD' };
  const enrollment = {
    id: store.counters.sequences++,
    leadId, seqId, seqName: seqNames[seqId]||seqId,
    currentTouch: 1, totalTouches: 5,
    status: 'active',
    enrolled: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}),
    nextSend: 'Sending Touch 1 now',
    touches: [],
    createdAt: new Date().toISOString()
  };
  store.sequences.push(enrollment);
  saveStore();
  res.status(201).json(enrollment);
});

app.put('/api/sequences/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = store.sequences.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Sequence not found' });
  store.sequences[idx] = { ...store.sequences[idx], ...req.body, id };
  saveStore();
  res.json(store.sequences[idx]);
});

// ── Send log ─────────────────────────────────────────────
app.get('/api/log', (req, res) => res.json(store.sendLog));

app.delete('/api/log', (req, res) => {
  store.sendLog = [];
  saveStore();
  res.json({ success: true });
});

// ── Analytics ────────────────────────────────────────────
app.get('/api/analytics/summary', (req, res) => {
  const STAGES = ['ICP targeting','Lead gen','Outreach','Demo','LOI','Closed'];
  res.json({
    leads: {
      total: store.leads.length,
      byStage: STAGES.map((s,i) => ({ stage: s, count: store.leads.filter(l=>l.stage===i).length })),
      hot: store.leads.filter(l=>l.temp==='hot').length,
      warm: store.leads.filter(l=>l.temp==='warm').length,
      cold: store.leads.filter(l=>l.temp==='cold').length,
      lois: store.leads.filter(l=>l.stage>=4).length,
      conversionRate: store.leads.length ? Math.round(store.leads.filter(l=>l.stage>=4).length/store.leads.length*100) : 0
    },
    waitlist: {
      total: store.waitlist.length,
      notInvited: store.waitlist.filter(w=>w.status==='not_invited').length,
      invited: store.waitlist.filter(w=>w.status==='invited').length,
      onboarded: store.waitlist.filter(w=>w.status==='onboarded').length
    },
    revenue: {
      total: store.revenue.reduce((a,r)=>a+r.amount,0),
      target: 51000000,
      events: store.revenue.length
    },
    sequences: {
      active: store.sequences.filter(s=>s.status==='active').length,
      totalTouches: store.sequences.reduce((a,s)=>a+s.touches.length,0)
    },
    emails: { sent: store.sendLog.length }
  });
});

// ── Serve frontend ────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Cardio AI Sales Engine running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Frontend:     http://localhost:${PORT}\n`);
});

module.exports = app;
