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
const pgSession = require('connect-pg-simple')(session);
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
const db = require('./db');

// ── Middleware ──────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

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
// Trust Render's proxy (required for secure cookies behind a proxy).
app.set('trust proxy', 1);

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');

// Use PostgreSQL session store if DATABASE_URL is set, else in-memory (local dev).
// Postgres-backed sessions survive Render restarts, so users stay signed in.
const sessionStore = process.env.DATABASE_URL
  ? new pgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'user_sessions',
      createTableIfMissing: true,
      ssl: { rejectUnauthorized: false }
    })
  : new session.MemoryStore();

app.use(session({
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'cardioai.sid',
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// ── Auth middleware ──────────────────────────────────────
const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'cardioailive.com';
const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS ? process.env.ALLOWED_EMAILS.split(',').map(e=>e.trim()) : [];

function requireAuth(req, res, next) {
  // Always allow: auth routes, health check, login page, static assets
  if (req.path.startsWith('/api/auth')) return next();
  if (req.path === '/api/health') return next();
  if (req.path === '/login.html') return next();
  if (req.path.match(/\.(css|js|ico|png|jpg|svg|woff|woff2)$/)) return next();

  // Block unauthenticated API calls
  if (req.path.startsWith('/api/')) {
    if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
    return next();
  }

  // For all page routes — check auth
  if (!req.session?.user) {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  next();
}

function isAllowedUser(email) {
  if (!email) return false;
  const domain = email.split('@')[1];
  if (domain === ALLOWED_DOMAIN) return true;
  if (ALLOWED_EMAILS.includes(email)) return true;
  return false;
}

app.use(requireAuth);

// ── Static files (served after auth check) ───────────────
app.use(express.static(path.join(__dirname, 'public')));


// ── Clients ─────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// ── Database via db.js (PostgreSQL or file fallback) ────

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
      apollo: !!process.env.APOLLO_API_KEY,
      database: db.USE_PG ? 'postgresql' : 'file'
    }
  });
});

// ── AI Routes ────────────────────────────────────────────
app.post('/api/ai/generate', async (req, res) => {
  const { leadId, type, context } = req.body;
  if (!leadId || !type) return res.status(400).json({ error: 'leadId and type required' });

  const [allLeads, allWl] = await Promise.all([db.Leads.getAll(), db.Waitlist.getAll()]);
  const lead = allLeads.find(l => String(l.id) === String(leadId)) || allWl.find(w => String(w.id) === String(leadId));
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
  const allLeadsQ = await db.Leads.getAll();
  const lead = allLeadsQ.find(l => String(l.id) === String(leadId));
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

  const [chatLeads, chatWl, chatLog] = await Promise.all([db.Leads.getAll(), db.Waitlist.getAll(), db.SendLog.getAll()]);
  const pipelineSummary = `Pipeline: ${chatLeads.length} leads. Waitlist: ${chatWl.length}. LOIs: ${chatLeads.filter(l=>l.stage>=4).length}. Hot: ${chatLeads.filter(l=>l.temp==='hot').length}. Emails sent: ${chatLog.length}.`;

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
  const [bLeads, bWl] = await Promise.all([db.Leads.getAll(), db.Waitlist.getAll()]);
  const hot = bLeads.filter(l=>l.temp==='hot').map(l=>`${l.name} (${l.role}, ${['ICP','Lead gen','Outreach','Demo','LOI','Closed'][l.stage]})`).join('; ') || 'none';
  const demos = bLeads.filter(l=>l.stage===3).map(l=>l.name).join(', ') || 'none';
  const prompt = `Daily sales briefing for Cardio AI. Hot leads: ${hot}. Demo stage: ${demos}. Total leads: ${bLeads.length}. LOIs: ${bLeads.filter(l=>l.stage>=4).length}. Waitlist: ${bWl.length}. Give: (1) top 3 priorities today, (2) who to follow up with urgently, (3) one strategic insight. Be direct.`;

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
  const [lLeads, lWl, lMs, lRv] = await Promise.all([db.Leads.getAll(), db.Waitlist.getAll(), db.Milestones.getAll(), db.Revenue.getAll()]);
  const done = lMs.filter(m=>m.status==='done').length;
  const total = lMs.length;
  const rev = lRv.reduce((a,r)=>a+r.amount,0);
  const prompt = `Launch briefing for Cardio AI. Milestones: ${done}/${total} done. Revenue logged: $${rev.toLocaleString()} of $51M Y1 target. Waitlist: ${lWl.length} (${lWl.filter(w=>w.status==='onboarded').length} onboarded). Leads: ${lLeads.length}. Give: (1) launch phase assessment, (2) top 3 critical path items to first revenue, (3) 30/60/90 day priorities, (4) biggest risk to $51M target.`;

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

    await db.SendLog.add({
      id: Date.now(),
      to, subject,
      messageId: result.data.id,
      status: 'sent',
      time: new Date().toLocaleTimeString()
    });

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
      person_titles: titles || ['Cardiologist', 'Chief Medical Officer', 'CFO', 'Hospitalist'],
      organization_num_employees_ranges: [`${empMin||200},${empMax||2000}`],
      person_locations: [location || 'United States'],
      page: 1,
      per_page: Math.min(limit || 25, 100)
    };
    if (keywords) payload.q_keywords = keywords;

    // Use the API-optimized endpoint (api_search), authenticated via the
    // X-Api-Key header. The plain /mixed_people/search route 403s on Basic
    // plans, and Apollo no longer accepts api_key in the body.
    // NOTE: this endpoint requires a MASTER API key (Settings → API Keys in
    // Apollo). A non-master key returns error_code API_INACCESSIBLE.
    const response = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let detail = 'Apollo API error';
      try { const err = await response.json(); detail = err.error || detail; } catch {}
      // Surface the master-key requirement clearly on the 403/API_INACCESSIBLE case.
      if (response.status === 403 || /not accessible/i.test(detail)) {
        detail = 'Apollo rejected this key for people search. This endpoint requires a MASTER API key (Apollo → Settings → API Keys). Detail: ' + detail;
      }
      return res.status(response.status).json({ error: detail });
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
app.get('/api/leads', async (req, res) => {
  try { res.json(await db.Leads.getAll()); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads', async (req, res) => {
  const { name, org } = req.body;
  if (!name || !org) return res.status(400).json({ error: 'name and org required' });
  try { res.status(201).json(await db.Leads.create(req.body)); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/leads/:id', async (req, res) => {
  try {
    const result = await db.Leads.update(parseInt(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: 'Lead not found' });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/leads/:id', async (req, res) => {
  try { await db.Leads.delete(parseInt(req.params.id)); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Integrations: read-only pipeline feed (machine-to-machine) ───────────
// Pulled by the Operations hub and the CRM via a shared secret
// (INTEGRATION_API_KEY) — NOT Google login — so a server can reach it.
// Set INTEGRATION_API_KEY in Render to the SAME value used on the ops hub and
// CRM. If it's unset, this endpoint stays off (503) and nothing else changes.
const PIPELINE_STAGES = ['ICP targeting','Lead gen','Outreach','Demo','LOI','Closed'];
app.get('/api/integrations/pipeline', async (req, res) => {
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected) return res.status(503).json({ error: 'integration_not_configured' });
  if ((req.get('x-api-key') || '') !== expected) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }
  try {
    const [leads, revenue] = await Promise.all([db.Leads.getAll(), db.Revenue.getAll()]);
    // Deal size lives in the revenue table, linked to a lead only by name
    // (revenue.customer ≈ lead.org — there is no lead_id). Sum each org's logged
    // revenue, normalized (trim + lowercase) so minor casing/spacing differences
    // still match. A lead with no revenue row keeps value = null (pre-revenue).
    const norm = (s) => String(s || '').trim().toLowerCase();
    const valueByOrg = {};
    for (const r of revenue) {
      const k = norm(r.customer);
      if (!k) continue;
      valueByOrg[k] = (valueByOrg[k] || 0) + (Number(r.amount) || 0);
    }
    // Map each lead into the shared pipeline contract the hub/CRM expect.
    const deals = leads.map((l) => ({
      id: l.id,
      account: l.org,
      contact: l.name,
      // stage is a 0-5 index in this engine; send the readable label.
      // To make deals land in the hub's own columns instead, remap here, e.g.
      //   Demo -> 'Proposal', LOI -> 'Negotiation', Closed -> 'Closed Won'.
      stage: PIPELINE_STAGES[l.stage] ?? String(l.stage ?? ''),
      // Deal value = summed revenue logged for this org (null if none yet).
      value: valueByOrg[norm(l.org)] || null,
      owner: null,
      // Heuristic win-probability from temperature; delete this line if unwanted.
      probability: l.temp === 'hot' ? 0.7 : l.temp === 'warm' ? 0.4 : l.temp === 'cold' ? 0.2 : null,
      nextAction: l.notes || null,
      temp: l.temp,
    }));
    res.json({ deals, count: deals.length, generatedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Waitlist CRUD ────────────────────────────────────────
app.get('/api/waitlist', async (req, res) => {
  try { res.json(await db.Waitlist.getAll()); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/waitlist', async (req, res) => {
  const { name, org } = req.body;
  if (!name || !org) return res.status(400).json({ error: 'name and org required' });
  try { res.status(201).json(await db.Waitlist.create(req.body)); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/waitlist/:id', async (req, res) => {
  try {
    const result = await db.Waitlist.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Entry not found' });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/waitlist/:id', async (req, res) => {
  try { await db.Waitlist.delete(req.params.id); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Milestones CRUD ──────────────────────────────────────
app.get('/api/milestones', async (req, res) => {
  try { res.json(await db.Milestones.getAll()); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/milestones', async (req, res) => {
  if (!req.body.title) return res.status(400).json({ error: 'title required' });
  try { res.status(201).json(await db.Milestones.create(req.body)); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/milestones/:id', async (req, res) => {
  try {
    const result = await db.Milestones.update(parseInt(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: 'Milestone not found' });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/milestones/:id', async (req, res) => {
  try { await db.Milestones.delete(parseInt(req.params.id)); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Revenue CRUD ─────────────────────────────────────────
app.get('/api/revenue', async (req, res) => {
  try { res.json(await db.Revenue.getAll()); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/revenue', async (req, res) => {
  const { customer, amount } = req.body;
  if (!customer || !amount) return res.status(400).json({ error: 'customer and amount required' });
  try { res.status(201).json(await db.Revenue.create(req.body)); } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Sequences ────────────────────────────────────────────
app.get('/api/sequences', async (req, res) => {
  try { res.json(await db.Sequences.getAll()); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sequences/enroll', async (req, res) => {
  const { leadId, seqId } = req.body;
  if (!leadId || !seqId) return res.status(400).json({ error: 'leadId and seqId required' });
  try {
    const seqNames = { cardiologist:'Cardiologist 5-touch', cmo:'CMO/CFO ROI', payer:'Payer medical director', hospitalist:'Hospitalist MD' };
    const seq = await db.Sequences.create({ leadId: String(leadId), seqId, seqName: seqNames[seqId]||seqId });
    res.status(201).json(seq);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/sequences/:id', async (req, res) => {
  try {
    const result = await db.Sequences.update(parseInt(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: 'Sequence not found' });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Send log ─────────────────────────────────────────────
app.get('/api/log', async (req, res) => {
  try { res.json(await db.SendLog.getAll()); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/log', async (req, res) => {
  try { await db.SendLog.clear(); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Analytics ────────────────────────────────────────────
app.get('/api/analytics/summary', async (req, res) => {
  try { res.json(await db.getAnalyticsSummary()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Serve frontend ────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.session?.user) {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────
async function startServer() {
  try {
    await db.initDB();
    app.listen(PORT, () => {
      console.log(`\n🚀 Cardio AI Sales Engine running on port ${PORT}`);
      console.log(`   Database:     ${db.USE_PG ? 'PostgreSQL ✅' : 'File storage ✅'}`);
      console.log(`   Health check: http://localhost:${PORT}/api/health`);
      console.log(`   Frontend:     http://localhost:${PORT}\n`);
    });
  } catch(e) {
    console.error('❌ Failed to start server:', e.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;
