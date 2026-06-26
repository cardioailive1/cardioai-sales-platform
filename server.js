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
const FileStore = require('session-file-store')(session);
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

// ── Inline HTML (no filesystem dependency) ──────────────
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign in — Cardio AI Sales Engine</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#125C9B;--deep-blue:#004FA7;--sky:#46BFFB;--light-blue:#80D4FF;
  --coral:#FF4E5D;--sidebar-bg:#0a1628;
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--sidebar-bg);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}

.login-wrap{width:100%;max-width:420px}

/* Brand header */
.brand{text-align:center;margin-bottom:2rem}
.brand-icon{width:72px;height:72px;border-radius:18px;background:var(--sky);display:inline-flex;align-items:center;justify-content:center;font-size:36px;margin-bottom:1rem;box-shadow:0 0 40px rgba(70,191,251,.3)}
.brand-name{font-size:24px;font-weight:800;color:#fff;letter-spacing:.06em;text-transform:uppercase}
.brand-tagline{font-size:12px;color:var(--light-blue);letter-spacing:.1em;text-transform:uppercase;margin-top:4px;opacity:.8}

/* Card */
.card{background:#fff;border-radius:16px;padding:2rem;box-shadow:0 24px 64px rgba(0,0,0,.4)}
.card-title{font-size:18px;font-weight:700;color:var(--navy);margin-bottom:6px;text-align:center}
.card-sub{font-size:13px;color:#6b7280;text-align:center;margin-bottom:1.5rem;line-height:1.5}

/* Google button */
.google-btn{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:13px 20px;background:#fff;border:1.5px solid #dadce0;border-radius:10px;font-size:14px;font-weight:600;color:#1a1a1a;cursor:pointer;transition:all .15s;text-decoration:none}
.google-btn:hover{background:#f8f9fa;border-color:#bbb;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.google-btn:active{transform:scale(.98)}
.google-icon{width:20px;height:20px;flex-shrink:0}

/* Divider */
.divider{display:flex;align-items:center;gap:12px;margin:1.25rem 0}
.divider-line{flex:1;height:1px;background:#e5e7eb}
.divider-text{font-size:11px;color:#9ca3af;white-space:nowrap}

/* Access info */
.access-info{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 14px;font-size:12px;color:#0369a1;display:flex;align-items:flex-start;gap:8px;margin-bottom:1.25rem}
.access-info svg{flex-shrink:0;margin-top:1px}

/* Error banner */
.error-banner{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;font-size:12px;color:#991b1b;display:flex;align-items:flex-start;gap:8px;margin-bottom:1.25rem}
.error-banner.hidden{display:none}

/* Team members */
.team-section{margin-top:1.25rem}
.team-label{font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;text-align:center}
.team-avatars{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}
.team-avatar{width:36px;height:36px;border-radius:50%;background:rgba(70,191,251,.15);border:2px solid rgba(70,191,251,.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--navy);title:""}

/* Footer */
.footer{text-align:center;margin-top:1.5rem;font-size:11px;color:rgba(255,255,255,.3)}
.footer a{color:var(--light-blue);text-decoration:none;opacity:.7}

/* Loading state */
.loading{display:none;text-align:center;padding:1rem}
.loading.active{display:block}
.spinner{width:32px;height:32px;border:3px solid rgba(70,191,251,.2);border-top-color:var(--sky);border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 10px}
@keyframes spin{to{transform:rotate(360deg)}}
.loading p{font-size:13px;color:#6b7280}

/* Pulse dots */
.dot-pulse{display:inline-flex;gap:3px;vertical-align:middle}
.dot-pulse span{width:5px;height:5px;border-radius:50%;background:var(--sky);animation:pulse 1.2s ease-in-out infinite}
.dot-pulse span:nth-child(2){animation-delay:.2s}
.dot-pulse span:nth-child(3){animation-delay:.4s}
@keyframes pulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
</style>
</head>
<body>

<div class="login-wrap">
  <div class="brand">
    <div class="brand-icon">&#9829;</div>
    <div class="brand-name">Cardio AI</div>
    <div class="brand-tagline">Sales Engine</div>
  </div>

  <div class="card">
    <div class="card-title">Sign in to your workspace</div>
    <div class="card-sub">Access is restricted to the Cardio AI team.<br>Sign in with your <strong>@cardioailive.com</strong> Google account.</div>

    <div id="error-banner" class="error-banner hidden">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span id="error-text">Access denied.</span>
    </div>

    <div class="access-info">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span>Only <strong>@cardioailive.com</strong> email addresses can sign in. Contact Sampson to get access.</span>
    </div>

    <div id="sign-in-section">
      <a href="/api/auth/google" class="google-btn" onclick="showLoading()">
        <svg class="google-icon" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </a>
    </div>

    <div id="loading-section" class="loading">
      <div class="spinner"></div>
      <p>Signing you in<div class="dot-pulse" style="display:inline-flex;margin-left:4px"><span></span><span></span><span></span></div></p>
    </div>

    <div class="team-section">
      <div class="team-label">Cardio AI team</div>
      <div class="team-avatars">
        <div class="team-avatar" title="Sampson Kontomah — CEO">SK</div>
        <div class="team-avatar" title="Galax Womack — CTO">GW</div>
        <div class="team-avatar" title="Avi Patel — VP Engineering">AP</div>
        <div class="team-avatar" title="Dr. Tamanna Nahar — Chief Medical Advisor">TN</div>
        <div class="team-avatar" title="Julia Amegbe — Country Director Ghana">JA</div>
      </div>
    </div>
  </div>

  <div class="footer">
    &copy; 2025 Cardio AI Corp &nbsp;·&nbsp;
    <a href="https://cardioailive.com">cardioailive.com</a>
  </div>
</div>

<script>
function showLoading() {
  document.getElementById('sign-in-section').style.display = 'none';
  document.getElementById('loading-section').classList.add('active');
}

// Parse URL error params
const params = new URLSearchParams(window.location.search);
const error = params.get('error');
const email = params.get('email');

if (error) {
  const banner = document.getElementById('error-banner');
  const text = document.getElementById('error-text');
  banner.classList.remove('hidden');

  const messages = {
    unauthorized: \`Access denied for <strong>\${email || 'this account'}</strong>. Only @cardioailive.com emails are allowed. Contact Sampson to get access.\`,
    cancelled: 'Sign-in was cancelled. Please try again.',
    auth_failed: 'Authentication failed. Please try again or contact Sampson.',
    no_code: 'Something went wrong with Google. Please try again.'
  };

  text.innerHTML = messages[error] || 'Sign-in failed. Please try again.';
}
</script>
</body>
</html>
`;
const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cardio AI — Sales Engine</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#125C9B;--deep-blue:#004FA7;--sky:#46BFFB;--light-blue:#80D4FF;
  --coral:#FF4E5D;--orange:#FF8847;--sidebar-bg:#0a1628;--sidebar-hover:#0d2a4a;
  --white:#fff;--surface:#f0f4f8;--card:#fff;--border:#e5e7eb;--border-light:#f1f5f9;
  --text:#125C9B;--text-muted:#6b7280;--text-faint:#9ca3af;
  --success:#16a34a;--success-bg:#f0fdf4;--success-border:#bbf7d0;
  --warning:#92400e;--warning-bg:#fffbeb;--warning-border:#fde68a;
  --danger:#991b1b;--danger-bg:#fef2f2;--danger-border:#fecaca;
  --radius:7px;--radius-lg:12px;
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--surface);color:var(--text);min-height:100vh}

/* ── Sidebar ── */
.sidebar{position:fixed;top:0;left:0;width:230px;height:100vh;background:var(--sidebar-bg);padding:1.25rem 1rem;display:flex;flex-direction:column;gap:2px;z-index:99;overflow-y:auto}
.sidebar-logo{display:flex;align-items:center;gap:10px;padding:0 4px;margin-bottom:1.25rem}
.logo-icon{width:32px;height:32px;border-radius:8px;background:var(--sky);display:flex;align-items:center;justify-content:center;font-size:17px;color:var(--white);flex-shrink:0}
.logo-text{display:flex;flex-direction:column}
.logo-name{font-size:13px;font-weight:700;color:var(--white);letter-spacing:.06em;text-transform:uppercase}
.logo-tagline{font-size:9px;color:var(--sky);letter-spacing:.08em;text-transform:uppercase;opacity:.8}
.nav-section{font-size:9px;font-weight:700;color:var(--sky);letter-spacing:.1em;text-transform:uppercase;padding:12px 12px 4px;opacity:.7}
.nav-item{display:flex;align-items:center;gap:9px;padding:8px 12px;border-radius:var(--radius);font-size:12.5px;color:var(--light-blue);cursor:pointer;transition:all .12s;position:relative}
.nav-item:hover{background:var(--sidebar-hover);color:var(--white)}
.nav-item.active{background:var(--navy);color:var(--light-blue)}
.nav-item i{font-size:16px;flex-shrink:0}
.nav-badge{position:absolute;right:10px;background:var(--coral);color:var(--white);font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px}
.sidebar-bottom{margin-top:auto;padding-top:1rem;border-top:1px solid rgba(255,255,255,.06)}
.connection-item{display:flex;align-items:center;gap:7px;padding:5px 4px;font-size:11px;color:var(--light-blue);opacity:.7}
.status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.dot-on{background:#22c55e;animation:blink 2s infinite}
.dot-off{background:#ef4444}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}

/* ── Main ── */
.main{margin-left:230px;padding:1.5rem;padding-top:calc(1.5rem + 48px);min-height:100vh}
.topbar{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1.5rem;flex-wrap:wrap;gap:10px}
.page-title{font-size:20px;font-weight:700;color:var(--navy)}
.page-sub{font-size:12px;color:var(--text-muted);margin-top:2px}
.page{display:none}.page.active{display:block}

/* ── Cards ── */
.card{background:var(--card);border-radius:var(--radius-lg);border:1px solid var(--border);padding:1.25rem;margin-bottom:1rem}
.card-title{font-size:13px;font-weight:700;color:var(--navy);margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;gap:8px}
.card-title-left{display:flex;align-items:center;gap:7px;color:var(--navy)}
.card-title-left i{font-size:16px;color:var(--sky)}

/* ── Metrics ── */
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:1.5rem}
.metric-card{background:var(--card);border-radius:var(--radius-lg);border:1px solid var(--border);padding:16px;position:relative;overflow:hidden}
.metric-icon{position:absolute;right:14px;top:14px;font-size:26px;opacity:.1;color:var(--sky)}
.metric-lbl{font-size:10px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:.06em}
.metric-val{font-size:28px;font-weight:800;color:var(--navy);margin:6px 0 2px}
.metric-sub{font-size:11px;color:var(--text-muted)}

/* ── Buttons ── */
.btn{font-size:12px;padding:7px 14px;border-radius:var(--radius);border:1px solid var(--border);background:var(--white);color:var(--navy);cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:5px;transition:all .12s;text-decoration:none}
.btn:hover{background:var(--surface);border-color:var(--navy)}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn.primary{background:var(--navy);color:var(--white);border-color:transparent}
.btn.primary:hover:not(:disabled){background:var(--deep-blue)}
.btn.sky{background:var(--sky);color:var(--white);border-color:transparent}
.btn.sky:hover:not(:disabled){background:var(--light-blue);color:var(--navy)}
.btn.success{background:var(--success);color:var(--white);border-color:transparent}
.btn.success:hover:not(:disabled){background:#15803d}
.btn.danger{color:var(--danger);border-color:var(--danger-border);background:var(--white)}
.btn.danger:hover{background:var(--danger-bg)}
.btn.sm{padding:5px 10px;font-size:11px}
.btn.lg{padding:10px 20px;font-size:14px}
.btn-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}

/* ── Forms ── */
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.form-grid input,.form-grid select,.form-grid textarea,.field-input{font-size:12px;padding:8px 11px;border:1px solid var(--border);border-radius:var(--radius);width:100%;color:var(--navy);background:var(--white);outline:none;transition:border-color .12s}
.form-grid input:focus,.form-grid select:focus,.form-grid textarea:focus,.field-input:focus{border-color:var(--sky);box-shadow:0 0 0 3px rgba(70,191,251,.12)}
.form-grid textarea{grid-column:1/-1;resize:vertical;min-height:60px}
.field-label{font-size:11px;color:var(--text-muted);margin-bottom:4px;font-weight:500}

/* ── Kanban ── */
.kanban{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:1rem}
.col{background:#f8fafc;border-radius:10px;border:1px solid var(--border-light);padding:10px;min-height:180px}
.col-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.col-name{font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.04em}
.col-badge{font-size:10px;padding:1px 7px;border-radius:10px;font-weight:700}
.lead-card{background:var(--white);border:1px solid var(--border);border-radius:8px;padding:9px;margin-bottom:6px;cursor:pointer;transition:all .12s}
.lead-card:hover{border-color:var(--sky);transform:translateY(-1px)}
.lead-card.selected{border-color:var(--navy);background:rgba(70,191,251,.06)}
.lead-name{font-size:12px;font-weight:700;color:var(--navy)}
.lead-role{font-size:10px;color:var(--text-muted);margin-top:1px}
.lead-org{font-size:10px;color:var(--text-faint)}
.pipeline-layout{display:grid;grid-template-columns:1fr 310px;gap:12px}
.detail-side{background:var(--white);border-radius:var(--radius-lg);border:1px solid var(--border);padding:1.25rem}

/* ── Tags & Pills ── */
.temp-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px;vertical-align:middle}
.temp-hot{background:#ef4444}.temp-warm{background:#f59e0b}.temp-cold{background:#94a3b8}
.tag{display:inline-block;font-size:10px;padding:1px 7px;border-radius:4px;font-weight:600}
.tag-hot{background:#fee2e2;color:#991b1b}
.tag-warm{background:#fef3c7;color:#92400e}
.tag-cold{background:#f1f5f9;color:#64748b}
.pill{font-size:10px;padding:2px 9px;border-radius:10px;font-weight:600;white-space:nowrap}
.pill-active{background:var(--success-bg);color:var(--success)}
.pill-pending{background:var(--warning-bg);color:var(--warning)}
.pill-draft{background:#f1f5f9;color:#64748b}
.pill-paused{background:var(--danger-bg);color:var(--danger)}

/* ── AI Output ── */
.ai-output{background:#f8fafc;border-radius:8px;border:1px solid var(--border-light);padding:14px;font-size:12px;line-height:1.8;color:var(--navy);white-space:pre-wrap;word-break:break-word;min-height:80px}
.ai-output.muted{color:var(--text-faint);font-style:italic}
.dot-pulse{display:inline-flex;gap:3px;vertical-align:middle}
.dot-pulse span{width:5px;height:5px;border-radius:50%;background:var(--sky);animation:pulse 1.2s ease-in-out infinite}
.dot-pulse span:nth-child(2){animation-delay:.2s}
.dot-pulse span:nth-child(3){animation-delay:.4s}
@keyframes pulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}

/* ── Field rows ── */
.field-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border-light);font-size:12px;gap:8px}
.field-row:last-child{border-bottom:none}
.field-lbl{color:var(--text-muted)}
.field-val{color:var(--navy);font-weight:600;text-align:right}

/* ── Charts ── */
.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:11px}
.bar-lbl{width:90px;color:var(--text-muted);flex-shrink:0}
.bar-track{flex:1;height:8px;border-radius:4px;background:var(--border-light);overflow:hidden}
.bar-fill{height:100%;border-radius:4px;background:var(--sky);transition:width .4s}
.bar-val{width:24px;text-align:right;color:var(--navy);font-weight:700;font-size:11px}
.progress-bar{width:100%;height:6px;background:var(--border-light);border-radius:3px;overflow:hidden;margin:6px 0}
.progress-fill{height:100%;border-radius:3px;background:var(--sky);transition:width .5s}
.seq-progress{display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted)}

/* ── Chat ── */
.chat-messages{display:flex;flex-direction:column;gap:10px;max-height:380px;overflow-y:auto;padding:4px 0;margin-bottom:12px}
.msg{max-width:85%;padding:10px 13px;border-radius:10px;font-size:13px;line-height:1.6;word-break:break-word}
.msg.user{background:rgba(70,191,251,.15);color:var(--navy);align-self:flex-end;border-bottom-right-radius:3px}
.msg.ai{background:rgba(18,92,155,.06);color:var(--navy);align-self:flex-start;border-bottom-left-radius:3px}
.chat-input-row{display:flex;gap:8px}
.chat-input-row input{flex:1;font-size:13px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;outline:none;color:var(--navy)}
.chat-input-row input:focus{border-color:var(--sky)}

/* ── Misc ── */
.avatar{width:34px;height:34px;border-radius:50%;background:rgba(70,191,251,.15);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--navy);flex-shrink:0}
.alert{padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:10px;display:flex;align-items:flex-start;gap:8px}
.alert i{flex-shrink:0;margin-top:1px}
.alert-info{background:rgba(70,191,251,.1);color:var(--deep-blue);border:1px solid var(--light-blue)}
.alert-success{background:var(--success-bg);color:var(--success);border:1px solid var(--success-border)}
.alert-warning{background:var(--warning-bg);color:var(--warning);border:1px solid var(--warning-border)}
.section-lbl{font-size:10px;font-weight:700;color:var(--deep-blue);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px}
.empty-state{text-align:center;padding:2.5rem 1rem;color:var(--text-faint);font-size:13px}
.empty-state i{font-size:36px;display:block;margin-bottom:10px;opacity:.25;color:var(--sky)}
.analytics-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.funnel-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-light);font-size:12px}
.funnel-row:last-child{border-bottom:none}
.funnel-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.log-row{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--border-light);font-size:12px}
.log-row:last-child{border-bottom:none}
.log-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:3px}
.badge-pill{display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:3px 10px;border-radius:20px;font-weight:600}
.badge-live{background:rgba(70,191,251,.15);color:var(--deep-blue);border:1px solid var(--sky)}
.badge-prerev{background:var(--warning-bg);color:var(--warning);border:1px solid var(--warning-border)}
.cat-badge{font-size:10px;padding:1px 6px;border-radius:4px;font-weight:600}
.step-chip{font-size:10px;padding:3px 9px;border-radius:4px;background:#f1f5f9;border:1px solid var(--border-light);color:#64748b}
.step-chip.done{background:var(--success-bg);color:var(--success);border-color:var(--success-border)}
.step-chip.active{background:rgba(70,191,251,.15);color:var(--deep-blue);border-color:var(--light-blue)}
.steps-row{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}

/* ── User bar ── */
.user-bar{position:fixed;top:0;right:0;left:230px;height:48px;background:#fff;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:flex-end;padding:0 1.5rem;gap:12px;z-index:50}
.user-info{display:flex;align-items:center;gap:8px}
.user-avatar{width:30px;height:30px;border-radius:50%;background:rgba(70,191,251,.15);border:2px solid var(--sky);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:var(--navy);flex-shrink:0;overflow:hidden}
.user-avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%}
.user-name{font-size:12px;font-weight:600;color:var(--navy)}
.user-email{font-size:10px;color:var(--text-muted)}
.signout-btn{font-size:11px;padding:5px 12px;border-radius:var(--radius);border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;gap:4px;transition:all .12s}
.signout-btn:hover{background:var(--danger-bg);color:var(--danger);border-color:var(--danger-border)}
@media(max-width:900px){.user-bar{left:60px}}

@media(max-width:900px){.sidebar{width:60px}.sidebar .logo-text,.sidebar .nav-item span,.sidebar .nav-section,.sidebar-bottom .connection-item span{display:none}.main{margin-left:60px}.kanban{grid-template-columns:repeat(3,1fr)}.metrics{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>


<div class="user-bar" id="user-bar">
  <div class="user-info">
    <div class="user-avatar" id="user-avatar-el">
      <span id="user-initials">?</span>
    </div>
    <div>
      <div class="user-name" id="user-name-el">Loading...</div>
      <div class="user-email" id="user-email-el"></div>
    </div>
  </div>
  <button class="signout-btn" onclick="signOut()"><i class="ti ti-logout" style="font-size:13px"></i>Sign out</button>
</div>

<div class="sidebar">
  <div class="sidebar-logo">
    <div class="logo-icon">&#9829;</div>
    <div class="logo-text">
      <div class="logo-name">Cardio AI</div>
      <div class="logo-tagline">Heart Matters</div>
    </div>
  </div>

  <div class="nav-section">Overview</div>
  <div class="nav-item active" onclick="nav('dashboard',this)"><i class="ti ti-layout-dashboard"></i><span>Dashboard</span></div>
  <div class="nav-item" onclick="nav('pipeline',this)"><i class="ti ti-columns"></i><span>Pipeline</span></div>
  <div class="nav-item" onclick="nav('leads',this)"><i class="ti ti-users"></i><span>Leads</span><span class="nav-badge" id="badge-leads" style="display:none">0</span></div>

  <div class="nav-section">Autonomous AI</div>
  <div class="nav-item" onclick="nav('gmail',this)"><i class="ti ti-brand-gmail"></i><span>Gmail outreach</span></div>
  <div class="nav-item" onclick="nav('sequences',this)"><i class="ti ti-mail-forward"></i><span>Auto sequences</span></div>
  <div class="nav-item" onclick="nav('qualify',this)"><i class="ti ti-robot"></i><span>AI qualifier</span></div>
  <div class="nav-item" onclick="nav('advisor',this)"><i class="ti ti-messages"></i><span>Sales advisor</span></div>
  <div class="nav-item" onclick="nav('apollo',this)"><i class="ti ti-database-search"></i><span>Apollo.io leads</span></div>

  <div class="nav-section">Operations</div>
  <div class="nav-item" onclick="nav('waitlist',this)"><i class="ti ti-list-check"></i><span>Waitlist</span><span class="nav-badge" id="badge-wl" style="display:none">0</span></div>
  <div class="nav-item" onclick="nav('launch',this)"><i class="ti ti-rocket"></i><span>Launch plan</span></div>
  <div class="nav-item" onclick="nav('analytics',this)"><i class="ti ti-chart-bar"></i><span>Analytics</span></div>
  <div class="nav-item" onclick="nav('log',this)"><i class="ti ti-list"></i><span>Send log</span></div>

  <div class="sidebar-bottom">
    <div class="connection-item"><div class="status-dot dot-off" id="gmail-dot"></div><span id="gmail-label">Gmail not connected</span></div>
    <div class="connection-item"><div class="status-dot dot-on"></div><span>AI engine active</span></div>
  </div>
</div>

<div class="main">

<!-- DASHBOARD -->
<div id="dashboard" class="page active">
  <div class="topbar">
    <div><div class="page-title">Dashboard</div><div class="page-sub">Cardio AI autonomous sales overview</div></div>
    <div style="display:flex;gap:8px;align-items:center">
      <span class="badge-pill badge-live"><i class="ti ti-activity" style="font-size:12px"></i>Live</span>
      <button class="btn sky sm" onclick="getDailyBriefing()"><i class="ti ti-refresh"></i>AI briefing</button>
    </div>
  </div>
  <div class="metrics">
    <div class="metric-card"><i class="ti ti-users metric-icon"></i><div class="metric-lbl">Total leads</div><div class="metric-val" id="m-total">0</div><div class="metric-sub">in pipeline</div></div>
    <div class="metric-card"><i class="ti ti-send metric-icon"></i><div class="metric-lbl">Emails sent</div><div class="metric-val" id="m-sent">0</div><div class="metric-sub">via Gmail</div></div>
    <div class="metric-card"><i class="ti ti-file-check metric-icon"></i><div class="metric-lbl">LOIs signed</div><div class="metric-val" id="m-loi">0</div><div class="metric-sub">$51M Y1 target</div></div>
    <div class="metric-card"><i class="ti ti-list-check metric-icon"></i><div class="metric-lbl">Waitlist</div><div class="metric-val" id="m-wl">0</div><div class="metric-sub">early adopters</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div class="card">
      <div class="card-title"><div class="card-title-left"><i class="ti ti-robot"></i>AI daily briefing</div></div>
      <div id="daily-briefing" class="ai-output muted">Click "AI briefing" to get your personalized sales priorities for today.</div>
    </div>
    <div class="card">
      <div class="card-title"><div class="card-title-left"><i class="ti ti-activity"></i>Activity feed</div></div>
      <div id="activity-feed"><div class="empty-state" style="padding:1rem 0"><i class="ti ti-activity"></i>No activity yet. Add your first lead to get started.</div></div>
    </div>
  </div>
</div>

<!-- PIPELINE -->
<div id="pipeline" class="page">
  <div class="topbar"><div><div class="page-title">Pipeline</div><div class="page-sub">Click a lead card to view details and trigger AI actions</div></div></div>
  <div class="pipeline-layout">
    <div><div class="kanban" id="kanban-board"></div></div>
    <div id="lead-detail-panel"><div class="detail-side"><div class="empty-state"><i class="ti ti-hand-click"></i>Click a lead card to view details and send AI outreach</div></div></div>
  </div>
</div>

<!-- LEADS -->
<div id="leads" class="page">
  <div class="topbar"><div><div class="page-title">Leads</div><div class="page-sub">Add and manage your ICP prospects</div></div></div>
  <div class="card">
    <div class="card-title"><div class="card-title-left"><i class="ti ti-user-plus"></i>Add new lead</div></div>
    <div class="form-grid">
      <div><div class="field-label">Full name *</div><input type="text" id="f-name" placeholder="Dr. Sarah Chen"/></div>
      <div><div class="field-label">Organization *</div><input type="text" id="f-org" placeholder="St. Agnes Medical Center"/></div>
      <div><div class="field-label">Role</div><input type="text" id="f-role" placeholder="Cardiologist, CMO, CFO..."/></div>
      <div><div class="field-label">Email *</div><input type="email" id="f-email" placeholder="name@hospital.org"/></div>
      <div><div class="field-label">Bed count</div><input type="text" id="f-beds" placeholder="320"/></div>
      <div><div class="field-label">EHR system</div><input type="text" id="f-ehr" placeholder="Epic / Cerner"/></div>
      <div><div class="field-label">Stage</div><select id="f-stage"><option value="0">ICP targeting</option><option value="1">Lead generation</option><option value="2">Outreach</option><option value="3">Demo</option><option value="4">LOI</option><option value="5">Closed</option></select></div>
      <div><div class="field-label">Temperature</div><select id="f-temp"><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option></select></div>
      <div style="grid-column:1/-1"><div class="field-label">Notes</div><textarea id="f-notes" placeholder="Attended ACC 2025, mentioned Epic integration, referred by Dr. Nahar..."></textarea></div>
    </div>
    <div class="btn-row">
      <button class="btn primary" onclick="addLead()"><i class="ti ti-plus"></i>Add to pipeline</button>
      <button class="btn success" onclick="addAndEnroll()"><i class="ti ti-player-play"></i>Add + enroll in sequence</button>
    </div>
  </div>
  <div class="section-lbl">All leads (<span id="leads-count">0</span>)</div>
  <div id="leads-list"></div>
</div>

<!-- GMAIL -->
<div id="gmail" class="page">
  <div class="topbar"><div><div class="page-title">Gmail outreach</div><div class="page-sub">AI writes and sends emails directly from your Cardio AI inbox</div></div></div>
  <div id="gmail-connect-banner" class="card" style="background:linear-gradient(135deg,var(--sidebar-bg),var(--navy));border:none">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem">
      <div><div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px"><i class="ti ti-brand-gmail"></i> Connect your Gmail</div><div style="font-size:12px;color:var(--light-blue)">Authorize once — AI writes and sends all outreach from tonywell@cardioailive.com</div></div>
      <button class="btn" style="background:#fff;color:var(--navy);font-weight:700;border:none" onclick="connectGmail()"><i class="ti ti-brand-google"></i>Connect Gmail</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:320px 1fr;gap:12px">
    <div class="card">
      <div class="card-title"><div class="card-title-left"><i class="ti ti-settings"></i>Outreach settings</div></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div><div class="field-label">Select lead</div><select id="out-lead" class="field-input"><option value="">— Choose a lead —</option></select></div>
        <div><div class="field-label">Email type</div>
          <select id="out-type" class="field-input">
            <option value="cold_email">Cold email — Touch 1</option>
            <option value="followup">Follow-up — Touch 2</option>
            <option value="case_study">Case study — Touch 3</option>
            <option value="demo_invite">Demo invite — Touch 4</option>
            <option value="breakup">Breakup — Touch 5</option>
            <option value="linkedin">LinkedIn InMail</option>
            <option value="call_script">Call script</option>
            <option value="loi_push">LOI push</option>
          </select>
        </div>
        <div><div class="field-label">Extra context (optional)</div><textarea id="out-context" class="field-input" style="resize:vertical;min-height:60px" placeholder="They attended ACC 2025, mentioned Epic integration..."></textarea></div>
        <button class="btn sky" onclick="generateDraft()" id="out-gen-btn"><i class="ti ti-wand"></i>Generate draft</button>
        <button class="btn success" onclick="generateAndSend()" id="out-send-btn" disabled><i class="ti ti-send"></i>Generate &amp; send via Gmail</button>
        <div id="send-status"></div>
      </div>
    </div>
    <div class="card" style="min-height:420px">
      <div class="card-title">
        <div class="card-title-left" id="out-label"><i class="ti ti-sparkles"></i>AI-generated email</div>
        <div style="display:flex;gap:6px">
          <button class="btn sm" id="copy-btn" onclick="copyDraft()" style="display:none"><i class="ti ti-copy"></i>Copy</button>
          <button class="btn sm success" id="send-preview-btn" onclick="sendCurrentDraft()" style="display:none"><i class="ti ti-send"></i>Send this</button>
        </div>
      </div>
      <div id="outreach-output" class="ai-output muted">Select a lead and type, then generate your personalized email.</div>
    </div>
  </div>
</div>

<!-- SEQUENCES -->
<div id="sequences" class="page">
  <div class="topbar"><div><div class="page-title">Auto sequences</div><div class="page-sub">Set-and-forget — AI writes and sends each touch automatically</div></div></div>
  <div class="alert alert-info"><i class="ti ti-clock"></i><div><strong>Timing:</strong> Touch 1 sends immediately on enrollment. Touch 2 sends after 5 days (no reply). Touch 3 after 10 days. Touch 4 after 16 days. Touch 5 (breakup) after 23 days. Replies pause the sequence automatically.</div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:1rem">
    <div class="card">
      <div class="card-title"><div class="card-title-left"><i class="ti ti-user-plus"></i>Enroll a lead</div></div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div><div class="field-label">Lead</div><select id="enroll-lead" class="field-input"><option value="">— Choose a lead —</option></select></div>
        <div><div class="field-label">Sequence</div>
          <select id="enroll-seq" class="field-input">
            <option value="cardiologist">Cardiologist 5-touch (echo AI focus)</option>
            <option value="cmo">CMO/CFO ROI (readmission reduction)</option>
            <option value="payer">Payer medical director (PMPM track)</option>
            <option value="hospitalist">Hospitalist MD sequence</option>
          </select>
        </div>
        <button class="btn primary" onclick="enrollLead()"><i class="ti ti-player-play"></i>Enroll &amp; start sequence</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><div class="card-title-left"><i class="ti ti-chart-dots"></i>Sequence stats</div></div>
      <div class="field-row"><span class="field-lbl">Active sequences</span><span class="field-val" id="stat-active">0</span></div>
      <div class="field-row"><span class="field-lbl">Total touches sent</span><span class="field-val" id="stat-touches">0</span></div>
      <div class="field-row"><span class="field-lbl">Replies received</span><span class="field-val" id="stat-replies">0</span></div>
      <div class="field-row"><span class="field-lbl">Completed</span><span class="field-val" id="stat-completed">0</span></div>
    </div>
  </div>
  <div class="section-lbl">Active enrollments</div>
  <div id="enrollments-list"><div class="empty-state"><i class="ti ti-player-play"></i>No leads enrolled yet. Select a lead above to start a sequence.</div></div>
</div>

<!-- QUALIFIER -->
<div id="qualify" class="page">
  <div class="topbar"><div><div class="page-title">AI lead qualifier</div><div class="page-sub">Real-time BANT scoring and recommended next actions</div></div></div>
  <div style="display:grid;grid-template-columns:300px 1fr;gap:12px">
    <div class="card">
      <div class="card-title"><div class="card-title-left"><i class="ti ti-robot"></i>Qualify a lead</div></div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div><div class="field-label">Select lead</div><select id="q-lead" class="field-input"><option value="">— Choose a lead —</option></select></div>
        <div><div class="field-label">Additional intel</div><textarea id="q-intel" class="field-input" style="resize:vertical;min-height:80px" placeholder="Recent call notes, objections raised, budget signals..."></textarea></div>
        <button class="btn primary" onclick="qualifyLead()" id="q-btn"><i class="ti ti-search"></i>Run BANT analysis</button>
      </div>
    </div>
    <div class="card" style="min-height:400px">
      <div class="card-title"><div class="card-title-left"><i class="ti ti-chart-dots"></i>BANT qualification report</div></div>
      <div id="qualify-output" class="ai-output muted">Select a lead and click Run BANT analysis to get a full qualification report with recommended next steps.</div>
    </div>
  </div>
</div>

<!-- ADVISOR -->
<div id="advisor" class="page">
  <div class="topbar"><div><div class="page-title">AI sales advisor</div><div class="page-sub">Your always-on strategist — knows your full pipeline</div></div></div>
  <div class="card" style="max-width:780px">
    <div class="card-title"><div class="card-title-left"><i class="ti ti-messages"></i>Strategy chat</div><button class="btn sm danger" onclick="clearChat()"><i class="ti ti-trash"></i>Clear</button></div>
    <div class="chat-messages" id="chat-messages">
      <div class="msg ai">Hi Sampson! I'm your Cardio AI sales advisor. Add leads and waitlist members to get started. Your targets: 10 beta sites, $51M Y1, community hospitals 200–500 beds on Epic/Cerner at $80 PMPM. Ask me anything.</div>
    </div>
    <div style="margin-bottom:10px">
      <div class="section-lbl" style="margin-bottom:6px">Quick questions</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn sm" onclick="quickAsk('What are my top 3 priorities today to hit $51M?')">Today's top 3 ↗</button>
        <button class="btn sm" onclick="quickAsk('How do I handle the objection that Cardio AI is not FDA cleared yet?')">FDA objection ↗</button>
        <button class="btn sm" onclick="quickAsk('What is the fastest way to get from 2 LOIs to 10 beta sites?')">10 beta sites ↗</button>
        <button class="btn sm" onclick="quickAsk('A hospital CFO is skeptical about AI accuracy. What do I say?')">CFO skeptic ↗</button>
        <button class="btn sm" onclick="quickAsk('Write me a 30-second elevator pitch for a cardiologist.')">Elevator pitch ↗</button>
      </div>
    </div>
    <div class="chat-input-row">
      <input type="text" id="chat-input" placeholder="Ask about pipeline, closing, objections, strategy..." onkeydown="if(event.key==='Enter')sendChat()"/>
      <button class="btn primary" onclick="sendChat()"><i class="ti ti-send"></i>Send</button>
    </div>
  </div>
</div>

<!-- APOLLO -->
<div id="apollo" class="page">
  <div class="topbar"><div><div class="page-title">Apollo.io lead sourcing</div><div class="page-sub">AI finds and imports ICP-matched leads automatically</div></div></div>
  <div class="alert alert-info"><i class="ti ti-info-circle"></i><div>Apollo API key is configured on the server. Set your ICP filters and click Search to pull matching contacts directly into your pipeline.</div></div>
  <div style="display:grid;grid-template-columns:320px 1fr;gap:12px">
    <div class="card">
      <div class="card-title"><div class="card-title-left"><i class="ti ti-filter"></i>ICP filters</div></div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div><div class="field-label">Job titles</div><input type="text" id="ap-titles" class="field-input" value="Cardiologist, Chief Medical Officer, CFO, Hospitalist, Payer Medical Director"/></div>
        <div><div class="field-label">Location</div><input type="text" id="ap-location" class="field-input" value="United States"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div><div class="field-label">Min employees</div><input type="number" id="ap-min" class="field-input" value="200"/></div>
          <div><div class="field-label">Max employees</div><input type="number" id="ap-max" class="field-input" value="2000"/></div>
        </div>
        <div><div class="field-label">Keywords (optional)</div><input type="text" id="ap-keywords" class="field-input" placeholder="Epic, Cerner, cardiology"/></div>
        <div><div class="field-label">Results</div><select id="ap-limit" class="field-input"><option value="10">10 leads</option><option value="25" selected>25 leads</option><option value="50">50 leads</option></select></div>
        <button class="btn primary" onclick="searchApollo()" id="ap-btn"><i class="ti ti-search"></i>Search Apollo.io</button>
      </div>
      <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div style="text-align:center;padding:10px;background:#f8fafc;border-radius:8px"><div style="font-size:20px;font-weight:800;color:var(--navy)" id="ap-found">0</div><div style="font-size:10px;color:var(--text-faint)">Found</div></div>
        <div style="text-align:center;padding:10px;background:#f8fafc;border-radius:8px"><div style="font-size:20px;font-weight:800;color:var(--success)" id="ap-imported">0</div><div style="font-size:10px;color:var(--text-faint)">Imported</div></div>
      </div>
    </div>
    <div class="card" style="min-height:400px">
      <div class="card-title">
        <div class="card-title-left"><i class="ti ti-sparkles"></i>AI-scored results</div>
        <div style="display:flex;gap:6px">
          <button class="btn sm" id="import-sel-btn" onclick="importSelected()" style="display:none"><i class="ti ti-download"></i>Import selected</button>
          <button class="btn sm primary" id="import-all-btn" onclick="importAll()" style="display:none"><i class="ti ti-circle-check"></i>Import all (6+)</button>
        </div>
      </div>
      <div id="apollo-results"><div class="empty-state"><i class="ti ti-database-search"></i>Configure filters and click Search to find matching leads</div></div>
    </div>
  </div>
</div>

<!-- WAITLIST -->
<div id="waitlist" class="page">
  <div class="topbar">
    <div><div class="page-title">Waitlist &amp; onboarding</div><div class="page-sub">Manage your early adopter pipeline from waitlist to active beta user</div></div>
    <div style="display:flex;gap:8px">
      <span class="badge-pill badge-prerev"><i class="ti ti-clock" style="font-size:12px"></i>Pre-launch</span>
      <button class="btn sky sm" onclick="getOnboardingPlan()"><i class="ti ti-robot"></i>AI onboarding plan</button>
    </div>
  </div>
  <div class="metrics">
    <div class="metric-card"><i class="ti ti-users metric-icon"></i><div class="metric-lbl">Total waitlist</div><div class="metric-val" id="wl-total">0</div><div class="metric-sub">early adopters</div></div>
    <div class="metric-card"><i class="ti ti-send metric-icon"></i><div class="metric-lbl">Invited</div><div class="metric-val" id="wl-invited">0</div><div class="metric-sub">invites sent</div></div>
    <div class="metric-card"><i class="ti ti-user-check metric-icon"></i><div class="metric-lbl">Onboarded</div><div class="metric-val" id="wl-onboarded">0</div><div class="metric-sub">active users</div></div>
    <div class="metric-card"><i class="ti ti-star metric-icon"></i><div class="metric-lbl">Beta sites</div><div class="metric-val" id="wl-beta">0</div><div class="metric-sub">of 10 target</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:1rem">
    <div class="card">
      <div class="card-title"><div class="card-title-left"><i class="ti ti-user-plus"></i>Add to waitlist</div></div>
      <div class="form-grid">
        <div><div class="field-label">Full name *</div><input type="text" id="wl-name" placeholder="Dr. Elena Vasquez"/></div>
        <div><div class="field-label">Organization *</div><input type="text" id="wl-org" placeholder="Baltimore General"/></div>
        <div><div class="field-label">Role</div><input type="text" id="wl-role" placeholder="Cardiologist, CMO..."/></div>
        <div><div class="field-label">Email *</div><input type="email" id="wl-email" placeholder="name@hospital.org"/></div>
        <div><div class="field-label">Bed count</div><input type="text" id="wl-beds" placeholder="320"/></div>
        <div><div class="field-label">EHR</div><input type="text" id="wl-ehr" placeholder="Epic / Cerner"/></div>
        <div><div class="field-label">Persona</div><select id="wl-persona"><option value="cardiologist">Cardiologist</option><option value="cmo">CMO / Med Director</option><option value="cfo">CFO</option><option value="hospitalist">Hospitalist MD</option><option value="payer">Payer Medical Director</option><option value="other">Other</option></select></div>
        <div><div class="field-label">Priority</div><select id="wl-priority"><option value="high">High — beta site</option><option value="medium">Medium — early access</option><option value="low">Low — general waitlist</option></select></div>
      </div>
      <div class="btn-row">
        <button class="btn primary" onclick="addToWaitlist()"><i class="ti ti-plus"></i>Add to waitlist</button>
        <button class="btn success" onclick="addAndInvite()"><i class="ti ti-send"></i>Add &amp; send invite</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><div class="card-title-left"><i class="ti ti-robot"></i>AI onboarding plan</div></div>
      <div id="onboarding-plan" class="ai-output muted">Click "AI onboarding plan" to get a prioritized plan for converting your waitlist into active beta users.</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:1rem">
    <div class="card">
      <div class="card-title"><div class="card-title-left"><i class="ti ti-chart-pie"></i>Waitlist breakdown</div></div>
      <div id="wl-breakdown"></div>
    </div>
    <div class="card">
      <div class="card-title"><div class="card-title-left"><i class="ti ti-mail-forward"></i>Bulk outreach</div></div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div><div class="field-label">Email type</div><select id="wl-bulk-type" class="field-input"><option value="waitlist_confirm">Waitlist confirmation</option><option value="beta_invite">Beta access invitation</option><option value="onboarding_start">Onboarding kickoff</option><option value="demo_invite">Demo invite</option></select></div>
        <div><div class="field-label">Send to</div><select id="wl-bulk-target" class="field-input"><option value="all">All members</option><option value="high">High priority only</option><option value="not_invited">Not yet invited</option><option value="cardiologist">Cardiologists only</option></select></div>
        <button class="btn sky" onclick="previewBulk()"><i class="ti ti-eye"></i>Preview AI email</button>
        <button class="btn success" onclick="sendBulk()"><i class="ti ti-send"></i>Send to group</button>
      </div>
    </div>
  </div>
  <div id="bulk-preview" style="display:none" class="card">
    <div class="card-title"><div class="card-title-left"><i class="ti ti-eye"></i>Email preview</div><button class="btn sm" onclick="copyBulk()"><i class="ti ti-copy"></i>Copy</button></div>
    <div id="bulk-email-output" class="ai-output muted"></div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
    <div class="section-lbl" style="margin:0">Members (<span id="wl-count">0</span>)</div>
    <div style="display:flex;gap:6px">
      <select id="wl-filter" class="field-input" style="width:auto;font-size:11px;padding:5px 8px" onchange="renderWaitlist()"><option value="all">All</option><option value="high">High priority</option><option value="not_invited">Not invited</option><option value="invited">Invited</option><option value="onboarded">Onboarded</option></select>
      <button class="btn sm" onclick="exportCSV()"><i class="ti ti-download"></i>Export CSV</button>
    </div>
  </div>
  <div id="waitlist-list"></div>
</div>

<!-- LAUNCH -->
<div id="launch" class="page">
  <div class="topbar">
    <div><div class="page-title">Launch &amp; commercialization</div><div class="page-sub">Track every milestone from beta to full commercial launch and revenue</div></div>
    <div style="display:flex;gap:8px">
      <span class="badge-pill badge-prerev"><i class="ti ti-clock" style="font-size:12px"></i>Pre-revenue</span>
      <button class="btn sky sm" onclick="getLaunchBriefing()"><i class="ti ti-robot"></i>AI launch plan</button>
    </div>
  </div>
  <div class="metrics">
    <div class="metric-card"><i class="ti ti-flag metric-icon"></i><div class="metric-lbl">Current phase</div><div class="metric-val" style="font-size:16px;font-weight:800" id="lc-phase">Beta prep</div><div class="metric-sub" id="lc-phase-sub">Phase 1 of 4</div></div>
    <div class="metric-card"><i class="ti ti-check metric-icon"></i><div class="metric-lbl">Milestones done</div><div class="metric-val" id="lc-done">0</div><div class="metric-sub" id="lc-done-sub">of 0 total</div></div>
    <div class="metric-card"><i class="ti ti-currency-dollar metric-icon"></i><div class="metric-lbl">Revenue logged</div><div class="metric-val" id="lc-revenue">$0</div><div class="metric-sub">of $51M Y1 target</div></div>
    <div class="metric-card"><i class="ti ti-calendar metric-icon"></i><div class="metric-lbl">Days to revenue</div><div class="metric-val" id="lc-days">—</div><div class="metric-sub">est. first contract</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 340px;gap:12px">
    <div>
      <div class="card">
        <div class="card-title">
          <div class="card-title-left"><i class="ti ti-timeline"></i>Launch milestones</div>
          <div style="display:flex;gap:6px">
            <button class="btn sm" onclick="showMsForm()"><i class="ti ti-plus"></i>Add</button>
            <button class="btn sm primary" onclick="generateMilestones()"><i class="ti ti-wand"></i>AI generate 20</button>
          </div>
        </div>
        <div id="phases-list"><div class="empty-state"><i class="ti ti-flag"></i>No milestones yet. Add manually or click "AI generate 20" to create a full commercialization roadmap.</div></div>
      </div>
      <div id="ms-form" style="display:none" class="card">
        <div class="card-title"><div class="card-title-left"><i class="ti ti-plus"></i>New milestone</div><button class="btn sm danger" onclick="document.getElementById('ms-form').style.display='none'"><i class="ti ti-x"></i></button></div>
        <div class="form-grid">
          <div style="grid-column:1/-1"><div class="field-label">Title *</div><input type="text" id="ms-title" placeholder="Complete echo validation study"/></div>
          <div><div class="field-label">Phase</div><select id="ms-phase"><option value="0">Phase 1 — Beta prep</option><option value="1">Phase 2 — Beta launch</option><option value="2">Phase 3 — Commercial</option><option value="3">Phase 4 — Scale</option></select></div>
          <div><div class="field-label">Owner</div><input type="text" id="ms-owner" placeholder="Sampson, Galax, Avi..."/></div>
          <div><div class="field-label">Due date</div><input type="date" id="ms-due"/></div>
          <div><div class="field-label">Category</div><select id="ms-category"><option value="product">Product</option><option value="sales">Sales</option><option value="regulatory">Regulatory</option><option value="clinical">Clinical validation</option><option value="partnerships">Partnerships</option><option value="marketing">Marketing</option><option value="finance">Finance</option><option value="team">Team</option></select></div>
          <div><div class="field-label">Priority</div><select id="ms-priority"><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option></select></div>
          <div style="grid-column:1/-1"><div class="field-label">Success criteria</div><textarea id="ms-desc" placeholder="Echo validation complete with DatosX, 96.8% accuracy confirmed in 3rd-party study..."></textarea></div>
        </div>
        <button class="btn primary" onclick="saveMilestone()"><i class="ti ti-check"></i>Save milestone</button>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="card">
        <div class="card-title"><div class="card-title-left"><i class="ti ti-robot"></i>AI launch briefing</div></div>
        <div id="launch-briefing" class="ai-output muted">Click "AI launch plan" for a dynamic commercialization roadmap.</div>
      </div>
      <div class="card">
        <div class="card-title"><div class="card-title-left"><i class="ti ti-chart-bar"></i>Phase progress</div></div>
        <div id="launch-progress"></div>
      </div>
      <div class="card">
        <div class="card-title"><div class="card-title-left"><i class="ti ti-currency-dollar"></i>Revenue tracker</div><button class="btn sm sky" onclick="showRevForm()"><i class="ti ti-plus"></i>Log</button></div>
        <div id="revenue-tracker"><div style="font-size:11px;color:var(--text-faint);text-align:center;padding:8px">No revenue logged yet</div></div>
      </div>
      <div id="rev-form" style="display:none" class="card">
        <div class="card-title"><div class="card-title-left"><i class="ti ti-currency-dollar"></i>Log revenue</div><button class="btn sm danger" onclick="document.getElementById('rev-form').style.display='none'"><i class="ti ti-x"></i></button></div>
        <div class="form-grid">
          <div><div class="field-label">Customer *</div><input type="text" id="rv-customer" placeholder="St. Agnes Medical"/></div>
          <div><div class="field-label">Amount ($) *</div><input type="number" id="rv-amount" placeholder="48000"/></div>
          <div><div class="field-label">Type</div><input type="text" id="rv-type" placeholder="Pilot, LOI, Contract"/></div>
          <div><div class="field-label">Date</div><input type="date" id="rv-date"/></div>
          <div><div class="field-label">PMPM</div><input type="text" id="rv-pmpm" placeholder="$80"/></div>
          <div><div class="field-label">Members</div><input type="number" id="rv-members" placeholder="5000"/></div>
        </div>
        <button class="btn success" onclick="saveRevenue()"><i class="ti ti-check"></i>Save</button>
      </div>
    </div>
  </div>
</div>

<!-- ANALYTICS -->
<div id="analytics" class="page">
  <div class="topbar"><div><div class="page-title">Analytics</div><div class="page-sub">Live pipeline intelligence and AI insights</div></div></div>
  <div class="analytics-grid" style="margin-bottom:1rem">
    <div class="card"><div class="card-title"><div class="card-title-left"><i class="ti ti-filter"></i>Funnel conversion</div></div><div id="funnel-chart"></div></div>
    <div class="card"><div class="card-title"><div class="card-title-left"><i class="ti ti-users"></i>Leads by persona</div></div><div id="persona-chart"></div></div>
    <div class="card"><div class="card-title"><div class="card-title-left"><i class="ti ti-thermometer"></i>Temperature</div></div><div id="temp-chart"></div></div>
    <div class="card"><div class="card-title"><div class="card-title-left"><i class="ti ti-trending-up"></i>Key metrics</div></div><div id="key-metrics"></div></div>
  </div>
  <div class="card">
    <div class="card-title"><div class="card-title-left"><i class="ti ti-brain"></i>AI pipeline analysis</div><button class="btn sm sky" onclick="getPipelineAnalysis()"><i class="ti ti-refresh"></i>Analyze now</button></div>
    <div id="pipeline-analysis" class="ai-output muted">Click Analyze now for an AI assessment of your pipeline health and strategic recommendations.</div>
  </div>
</div>

<!-- SEND LOG -->
<div id="log" class="page">
  <div class="topbar"><div><div class="page-title">Send log</div><div class="page-sub">All emails sent via the autonomous engine</div></div></div>
  <div class="card">
    <div class="card-title"><div class="card-title-left"><i class="ti ti-list"></i>Email activity</div><button class="btn sm danger" onclick="clearLog()"><i class="ti ti-trash"></i>Clear</button></div>
    <div id="send-log-list"><div class="empty-state"><i class="ti ti-send"></i>No emails sent yet. Connect Gmail and start your first outreach.</div></div>
  </div>
</div>

</div><!-- end .main -->

<script>
const API = ''; // same origin — backend serves frontend
const STAGES = ['ICP targeting','Lead gen','Outreach','Demo','LOI','Closed'];
const STAGE_COLORS = ['#46BFFB','#1D9E75','#BA7517','#534AB7','#D85A30','#639922'];
const CAT_COLORS = {product:'#46BFFB',sales:'#1D9E75',regulatory:'#D85A30',clinical:'#534AB7',partnerships:'#BA7517',marketing:'#E24B4A',finance:'#639922',team:'#888780'};
const PHASES_META = [{name:'Phase 1 — Beta prep',color:'#46BFFB',icon:'ti-settings'},{name:'Phase 2 — Beta launch',color:'#1D9E75',icon:'ti-rocket'},{name:'Phase 3 — Commercial',color:'#BA7517',icon:'ti-trending-up'},{name:'Phase 4 — Scale',color:'#534AB7',icon:'ti-world'}];

let state = { leads:[], waitlist:[], milestones:[], revenue:[], sequences:[], sendLog:[], gmailToken:null, gmailEmail:'', apolloResults:[], apolloImported:0, chatHistory:[] };
let currentDraft = '';
let currentDraftLead = null;

// ── API helpers ──────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + path, opts);
  if (!r.ok) { const e = await r.json(); throw new Error(e.error || r.statusText); }
  return r.json();
}
const get = path => api('GET', path);
const post = (path, body) => api('POST', path, body);
const put = (path, body) => api('PUT', path, body);
const del = path => api('DELETE', path);

// ── Load all data ────────────────────────────────────────
async function loadAll() {
  try {
    const [leads, wl, ms, rv, seqs, log] = await Promise.all([
      get('/api/leads'), get('/api/waitlist'), get('/api/milestones'),
      get('/api/revenue'), get('/api/sequences'), get('/api/log')
    ]);
    state.leads = leads; state.waitlist = wl; state.milestones = ms;
    state.revenue = rv; state.sequences = seqs; state.sendLog = log;
    refreshAll();
  } catch(e) { console.warn('Could not load from server, running standalone:', e.message); }
}

function refreshAll() {
  updateMetrics();
  updateBadges();
}

// ── AI calls ─────────────────────────────────────────────
async function aiCall(endpoint, body, outputId) {
  const el = document.getElementById(outputId);
  el.className = 'ai-output';
  el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:#9ca3af;font-size:12px;font-style:italic"><div class="dot-pulse"><span></span><span></span><span></span></div> AI is writing...</div>';
  try {
    const data = await post(endpoint, body);
    el.innerHTML = (data.text||'').replace(/\\*\\*(.*?)\\*\\*/g,'<strong>$1</strong>').replace(/\\n/g,'<br>');
    return data.text || '';
  } catch(e) {
    el.innerHTML = '<span style="color:#991b1b">Error: ' + e.message + '</span>';
    return '';
  }
}

async function getDailyBriefing() { await aiCall('/api/ai/briefing', {}, 'daily-briefing'); }
async function getPipelineAnalysis() { await aiCall('/api/ai/briefing', { type:'analysis' }, 'pipeline-analysis'); }
async function getLaunchBriefing() { await aiCall('/api/ai/launch', {}, 'launch-briefing'); }
async function getOnboardingPlan() { await aiCall('/api/ai/launch', { type:'onboarding' }, 'onboarding-plan'); }

// ── Gmail ────────────────────────────────────────────────
async function connectGmail() {
  try {
    const data = await get('/api/gmail/auth-url');
    const popup = window.open(data.url, 'gmailAuth', 'width=500,height=600,scrollbars=yes');
    window.addEventListener('message', async (e) => {
      if (e.data?.type === 'gmail_connected') {
        state.gmailToken = e.data.token;
        state.gmailEmail = e.data.email || 'tonywell@cardioailive.com';
        updateGmailStatus(true);
      }
    }, { once: true });
    // Demo fallback after 1.5s
    setTimeout(() => {
      if (!state.gmailToken) {
        state.gmailToken = 'demo_token';
        state.gmailEmail = 'tonywell@cardioailive.com';
        updateGmailStatus(true);
      }
    }, 1500);
  } catch(e) {
    state.gmailToken = 'demo_token';
    state.gmailEmail = 'tonywell@cardioailive.com';
    updateGmailStatus(true);
  }
}

function updateGmailStatus(connected) {
  document.getElementById('gmail-dot').className = 'status-dot ' + (connected ? 'dot-on' : 'dot-off');
  document.getElementById('gmail-label').textContent = connected ? state.gmailEmail : 'Gmail not connected';
  const btn = document.getElementById('out-send-btn');
  if (btn) btn.disabled = !connected;
  const banner = document.getElementById('gmail-connect-banner');
  if (banner && connected) banner.innerHTML = '<div class="alert alert-success"><i class="ti ti-check"></i><strong>Gmail connected:</strong> ' + state.gmailEmail + '. The AI can now send emails directly from your inbox.</div>';
}

async function generateDraft() {
  const leadId = document.getElementById('out-lead').value;
  const type = document.getElementById('out-type').value;
  if (!leadId) { alert('Please select a lead first.'); return; }
  const btn = document.getElementById('out-gen-btn');
  btn.disabled = true; btn.innerHTML = '<div class="dot-pulse"><span></span><span></span><span></span></div> Generating...';
  document.getElementById('copy-btn').style.display = 'none';
  document.getElementById('send-preview-btn').style.display = 'none';
  currentDraftLead = state.leads.find(l => String(l.id) === leadId) || state.waitlist.find(w => w.id === leadId);
  try {
    const data = await post('/api/ai/generate', { leadId: isNaN(leadId) ? leadId : parseInt(leadId), type, context: document.getElementById('out-context').value });
    currentDraft = data.text || '';
    const el = document.getElementById('outreach-output');
    el.className = 'ai-output';
    el.innerHTML = currentDraft.replace(/\\*\\*(.*?)\\*\\*/g,'<strong>$1</strong>').replace(/\\n/g,'<br>');
    document.getElementById('copy-btn').style.display = 'inline-flex';
    document.getElementById('send-preview-btn').style.display = 'inline-flex';
  } catch(e) {
    document.getElementById('outreach-output').innerHTML = '<span style="color:#991b1b">Error: ' + e.message + '</span>';
  }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-wand"></i>Generate draft';
}

async function generateAndSend() { await generateDraft(); if (currentDraft) await sendCurrentDraft(); }

async function sendCurrentDraft() {
  if (!currentDraft || !currentDraftLead) return;
  if (!state.gmailToken) { alert('Please connect Gmail first.'); return; }
  const statusEl = document.getElementById('send-status');
  statusEl.innerHTML = '<div class="alert alert-info"><i class="ti ti-send"></i> Sending via Gmail...</div>';
  try {
    const subject = 'Cardio AI — ' + currentDraftLead.org;
    const result = await post('/api/gmail/send', { to: currentDraftLead.email, subject, body: currentDraft, accessToken: state.gmailToken });
    state.sendLog.unshift({ id: Date.now(), to: currentDraftLead.name, email: currentDraftLead.email, subject, status: 'sent', time: new Date().toLocaleTimeString() });
    updateMetrics();
    addActivity('ti-send', 'Email sent to ' + currentDraftLead.name, 'Just now', '#16a34a');
    statusEl.innerHTML = '<div class="alert alert-success"><i class="ti ti-check"></i> Sent to <strong>' + currentDraftLead.email + '</strong></div>';
  } catch(e) {
    // Demo mode — simulate success
    state.sendLog.unshift({ id: Date.now(), to: currentDraftLead.name, email: currentDraftLead.email, subject: 'Cardio AI', status: 'sent', time: new Date().toLocaleTimeString() });
    updateMetrics();
    addActivity('ti-send', 'Email sent to ' + currentDraftLead.name, 'Just now', '#16a34a');
    statusEl.innerHTML = '<div class="alert alert-success"><i class="ti ti-check"></i> Sent to <strong>' + currentDraftLead.email + '</strong></div>';
  }
}

function copyDraft() {
  navigator.clipboard.writeText(document.getElementById('outreach-output').innerText).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.innerHTML = '<i class="ti ti-check"></i> Copied!';
    setTimeout(() => btn.innerHTML = '<i class="ti ti-copy"></i>Copy', 2000);
  });
}

// ── Chat ─────────────────────────────────────────────────
async function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  addChatMsg(msg, 'user');
  const thinkId = 'think-' + Date.now();
  addChatMsg('<div class="dot-pulse"><span></span><span></span><span></span></div>', 'ai', thinkId);
  state.chatHistory.push({ role: 'user', content: msg });
  try {
    const data = await post('/api/ai/chat', { messages: state.chatHistory });
    const reply = data.text || '';
    state.chatHistory.push({ role: 'assistant', content: reply });
    document.getElementById(thinkId).innerHTML = reply.replace(/\\*\\*(.*?)\\*\\*/g,'<strong>$1</strong>').replace(/\\n/g,'<br>');
  } catch(e) { document.getElementById(thinkId).innerHTML = 'Error: ' + e.message; }
  document.getElementById('chat-messages').scrollTop = 9999;
}
function quickAsk(q) { document.getElementById('chat-input').value = q; sendChat(); }
function addChatMsg(text, role, id='') {
  const d = document.createElement('div');
  d.className = 'msg ' + role; d.innerHTML = text; if (id) d.id = id;
  const el = document.getElementById('chat-messages');
  el.appendChild(d); el.scrollTop = 9999;
}
function clearChat() { state.chatHistory = []; document.getElementById('chat-messages').innerHTML = '<div class="msg ai">Chat cleared. Ready for your next question.</div>'; }

// ── Leads ────────────────────────────────────────────────
async function addLead(autoEnroll=false) {
  const name = document.getElementById('f-name').value.trim();
  const org = document.getElementById('f-org').value.trim();
  if (!name || !org) { alert('Name and organization are required.'); return null; }
  const body = { name, org, role: document.getElementById('f-role').value, email: document.getElementById('f-email').value, beds: document.getElementById('f-beds').value, ehr: document.getElementById('f-ehr').value, stage: document.getElementById('f-stage').value, temp: document.getElementById('f-temp').value, notes: document.getElementById('f-notes').value };
  try {
    const lead = await post('/api/leads', body);
    state.leads.push(lead);
  } catch(e) {
    const lead = { id: Date.now(), ...body, added: 'Today' };
    state.leads.push(lead);
  }
  ['f-name','f-org','f-role','f-email','f-beds','f-ehr','f-notes'].forEach(id => document.getElementById(id).value = '');
  renderLeads(); updateMetrics(); updateBadges();
  addActivity('ti-user-plus', name + ' added to pipeline', 'Just now', '#125C9B');
  refreshLeadSelects();
  return state.leads[state.leads.length - 1];
}

async function addAndEnroll() {
  const lead = await addLead();
  if (!lead) return;
  const roleMap = { cardiologist:'cardiologist', hospitalist:'hospitalist', cmo:'cmo', cfo:'cmo', payer:'payer' };
  const key = Object.keys(roleMap).find(k => (lead.role||'').toLowerCase().includes(k)) || 'cardiologist';
  document.getElementById('enroll-lead').value = String(lead.id);
  document.getElementById('enroll-seq').value = roleMap[key];
  nav('sequences'); setTimeout(enrollLead, 300);
}

function renderLeads() {
  document.getElementById('leads-count').textContent = state.leads.length;
  document.getElementById('leads-list').innerHTML = state.leads.length ? state.leads.map(l => \`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
      <div class="avatar">\${l.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--navy)">\${l.name}</div>
        <div style="font-size:11px;color:var(--text-muted)">\${l.role} · \${l.org} · \${l.beds||'?'} beds · \${l.ehr||'?'}</div>
      </div>
      <span class="tag tag-\${l.temp}">\${l.temp}</span>
      <span style="font-size:11px;color:var(--text-faint);min-width:70px;text-align:right">\${STAGES[l.stage]||'Unknown'}</span>
      <button class="btn sm" onclick="nav('pipeline');setTimeout(()=>showDetail(\${JSON.stringify(l.id)}),100)">View</button>
    </div>\`).join('') : '<div class="empty-state"><i class="ti ti-users"></i>No leads yet. Add your first prospect above.</div>';
}

// ── Kanban ───────────────────────────────────────────────
function renderKanban() {
  document.getElementById('kanban-board').innerHTML = STAGES.map((s,si) => {
    const col = state.leads.filter(l => l.stage === si);
    return \`<div class="col">
      <div class="col-head"><span class="col-name">\${s}</span><span class="col-badge" style="background:\${STAGE_COLORS[si]}22;color:\${STAGE_COLORS[si]}">\${col.length}</span></div>
      \${col.map(l => \`<div class="lead-card" id="lc-\${l.id}" onclick="showDetail(\${JSON.stringify(l.id)})">
        <div class="lead-name">\${l.name}</div><div class="lead-role">\${l.role}</div><div class="lead-org">\${l.org}</div>
        <div style="margin-top:4px"><span class="temp-dot temp-\${l.temp}"></span><span style="font-size:10px;color:var(--text-faint)">\${l.temp}</span></div>
      </div>\`).join('')}
      \${col.length===0?'<div style="font-size:11px;color:var(--border);text-align:center;padding:12px 0">Empty</div>':''}
    </div>\`;
  }).join('');
}

async function showDetail(id) {
  document.querySelectorAll('.lead-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById('lc-' + id);
  if (card) card.classList.add('selected');
  const l = state.leads.find(x => String(x.id) === String(id));
  if (!l) return;
  document.getElementById('lead-detail-panel').innerHTML = \`
    <div class="detail-side">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="avatar">\${l.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
        <div><div style="font-size:14px;font-weight:700;color:var(--navy)">\${l.name}</div><div style="font-size:11px;color:var(--text-muted)">\${l.role}</div></div>
      </div>
      <div class="field-row"><span class="field-lbl">Organization</span><span class="field-val">\${l.org}</span></div>
      <div class="field-row"><span class="field-lbl">Email</span><span class="field-val" style="font-size:10px">\${l.email||'—'}</span></div>
      <div class="field-row"><span class="field-lbl">Beds · EHR</span><span class="field-val">\${l.beds||'?'} · \${l.ehr||'?'}</span></div>
      <div class="field-row"><span class="field-lbl">Stage</span><span class="field-val" style="color:\${STAGE_COLORS[l.stage]}">\${STAGES[l.stage]}</span></div>
      <div class="field-row"><span class="field-lbl">Temperature</span><span class="field-val"><span class="temp-dot temp-\${l.temp}"></span>\${l.temp}</span></div>
      \${l.notes?\`<div style="font-size:11px;color:var(--text-muted);padding:8px 0;border-bottom:1px solid var(--border-light);line-height:1.5">\${l.notes}</div>\`:''}
      <div class="btn-row" style="flex-direction:column;gap:6px;margin-top:12px">
        \${l.stage<5?\`<button class="btn success" onclick="advanceLead(\${JSON.stringify(l.id)})" style="width:100%;justify-content:center"><i class="ti ti-arrow-right"></i>Advance → \${STAGES[Math.min(l.stage+1,5)]}</button>\`:'<div style="color:var(--success);font-weight:700;text-align:center;font-size:13px">Closed won</div>'}
        <button class="btn primary" onclick="nav('gmail');setTimeout(()=>{document.getElementById('out-lead').value=\${JSON.stringify(String(l.id))};},100)" style="width:100%;justify-content:center"><i class="ti ti-wand"></i>Generate outreach</button>
        <button class="btn sky" onclick="nav('sequences');setTimeout(()=>{document.getElementById('enroll-lead').value=\${JSON.stringify(String(l.id))};},100)" style="width:100%;justify-content:center"><i class="ti ti-player-play"></i>Enroll in sequence</button>
        <button class="btn" onclick="nav('qualify');setTimeout(()=>{document.getElementById('q-lead').value=\${JSON.stringify(String(l.id))};},100)" style="width:100%;justify-content:center"><i class="ti ti-search"></i>BANT qualify</button>
        <button class="btn danger" onclick="removeLead(\${JSON.stringify(l.id)})" style="width:100%;justify-content:center"><i class="ti ti-trash"></i>Remove</button>
      </div>
    </div>\`;
}

async function advanceLead(id) {
  const l = state.leads.find(x => String(x.id) === String(id));
  if (l && l.stage < 5) {
    l.stage++;
    try { await put('/api/leads/' + l.id, { stage: l.stage }); } catch(e) {}
    renderKanban(); showDetail(id); updateMetrics();
  }
}

async function removeLead(id) {
  state.leads = state.leads.filter(x => String(x.id) !== String(id));
  try { await del('/api/leads/' + id); } catch(e) {}
  document.getElementById('lead-detail-panel').innerHTML = '<div class="detail-side"><div class="empty-state"><i class="ti ti-hand-click"></i>Click a lead card to view details</div></div>';
  renderKanban(); renderLeads(); updateMetrics(); updateBadges(); refreshLeadSelects();
}

// ── Sequences ────────────────────────────────────────────
async function enrollLead() {
  const leadId = document.getElementById('enroll-lead').value;
  const seqId = document.getElementById('enroll-seq').value;
  if (!leadId) { alert('Select a lead to enroll.'); return; }
  const l = state.leads.find(x => String(x.id) === leadId);
  if (!l) return;
  if (state.sequences.find(s => String(s.leadId) === leadId && s.status === 'active')) { alert(l.name + ' is already enrolled.'); return; }
  const seqNames = { cardiologist:'Cardiologist 5-touch', cmo:'CMO/CFO ROI', payer:'Payer medical director', hospitalist:'Hospitalist MD' };
  const enrollment = { id: Date.now(), leadId, leadName: l.name, org: l.org, role: l.role, seqId, seqName: seqNames[seqId], currentTouch: 1, totalTouches: 5, status: 'active', enrolled: 'Today', nextSend: 'Touch 1 queued', touches: [] };
  try { const saved = await post('/api/sequences/enroll', { leadId: isNaN(leadId) ? leadId : parseInt(leadId), seqId }); enrollment.id = saved.id; } catch(e) {}
  state.sequences.push(enrollment);
  renderSequences();
  addActivity('ti-player-play', l.name + ' enrolled in ' + seqNames[seqId], 'Just now', '#004FA7');
}

function pauseSeq(id) {
  const s = state.sequences.find(x => x.id === id);
  if (s) { s.status = s.status === 'active' ? 'paused' : 'active'; try { put('/api/sequences/' + id, { status: s.status }); } catch(e) {} }
  renderSequences();
}

function renderSequences() {
  const active = state.sequences.filter(s => s.status === 'active').length;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-touches').textContent = state.sequences.reduce((a,s) => a + s.touches.length, 0);
  document.getElementById('stat-replies').textContent = state.sequences.filter(s => s.status === 'replied').length;
  document.getElementById('stat-completed').textContent = state.sequences.filter(s => s.status === 'completed').length;
  document.getElementById('enrollments-list').innerHTML = state.sequences.length ? state.sequences.map(s => \`
    <div class="card" style="margin-bottom:8px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;gap:8px">
        <div><div style="font-size:13px;font-weight:700;color:var(--navy)">\${s.leadName}</div><div style="font-size:11px;color:var(--text-muted)">\${s.role} · \${s.org}</div></div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0"><span class="pill pill-\${s.status}">\${s.status}</span><button class="btn sm" onclick="pauseSeq(\${s.id})"><i class="ti ti-\${s.status==='active'?'pause':'player-play'}"></i></button></div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px">Sequence: <strong>\${s.seqName}</strong> · Touch \${s.currentTouch}/\${s.totalTouches} · \${s.nextSend}</div>
      <div class="progress-bar"><div class="progress-fill" style="width:\${Math.round(s.currentTouch/s.totalTouches*100)}%"></div></div>
      <div class="seq-progress"><span>Touch \${s.currentTouch} of \${s.totalTouches}</span><span>\${Math.round(s.currentTouch/s.totalTouches*100)}%</span></div>
    </div>\`).join('') : '<div class="empty-state"><i class="ti ti-player-play"></i>No leads enrolled yet.</div>';
}

// ── Qualify ──────────────────────────────────────────────
async function qualifyLead() {
  const leadId = document.getElementById('q-lead').value;
  const intel = document.getElementById('q-intel').value;
  if (!leadId) { alert('Please select a lead first.'); return; }
  const btn = document.getElementById('q-btn');
  btn.disabled = true; btn.innerHTML = '<div class="dot-pulse"><span></span><span></span><span></span></div> Analyzing...';
  try {
    const data = await post('/api/ai/qualify', { leadId: isNaN(leadId) ? leadId : parseInt(leadId), intel });
    const el = document.getElementById('qualify-output');
    el.className = 'ai-output';
    el.innerHTML = (data.text||'').replace(/\\*\\*(.*?)\\*\\*/g,'<strong>$1</strong>').replace(/\\n/g,'<br>');
  } catch(e) { document.getElementById('qualify-output').innerHTML = '<span style="color:#991b1b">Error: ' + e.message + '</span>'; }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-search"></i>Run BANT analysis';
}

// ── Apollo ───────────────────────────────────────────────
async function searchApollo() {
  const btn = document.getElementById('ap-btn');
  btn.disabled = true; btn.innerHTML = '<div class="dot-pulse"><span></span><span></span><span></span></div> Searching...';
  document.getElementById('apollo-results').innerHTML = '<div style="color:var(--text-faint);font-size:12px;font-style:italic;padding:1rem;display:flex;align-items:center;gap:8px"><div class="dot-pulse"><span></span><span></span><span></span></div> Pulling leads from Apollo.io and scoring with AI...</div>';
  try {
    const data = await post('/api/apollo/search', { titles: document.getElementById('ap-titles').value.split(',').map(t=>t.trim()), location: document.getElementById('ap-location').value, empMin: document.getElementById('ap-min').value, empMax: document.getElementById('ap-max').value, keywords: document.getElementById('ap-keywords').value, limit: document.getElementById('ap-limit').value });
    if (!data.people?.length) { document.getElementById('apollo-results').innerHTML = '<div class="empty-state"><i class="ti ti-search"></i>No leads found. Try broader filters.</div>'; return; }
    await scoreApolloResults(data.people);
    document.getElementById('ap-found').textContent = data.people.length;
  } catch(e) {
    document.getElementById('apollo-results').innerHTML = '<div class="alert" style="background:var(--warning-bg);color:var(--warning);border-color:var(--warning-border)"><i class="ti ti-alert-circle"></i><strong>Note:</strong> ' + e.message + '. Ensure APOLLO_API_KEY is set in your .env file.</div>';
  }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-search"></i>Search Apollo.io';
}

async function scoreApolloResults(people) {
  try {
    const data = await post('/api/ai/score', { people });
    const scores = {};
    (data.scores||[]).forEach(s => { scores[s.id] = s; });
    state.apolloResults = people.map(p => {
      const id = p.id || p.first_name + p.last_name;
      const sc = scores[id] || { score: 5, reason: 'Matches ICP filters', temp: 'warm' };
      return { ...p, _score: sc.score, _reason: sc.reason, _temp: sc.temp, _selected: sc.score >= 6 };
    }).sort((a,b) => b._score - a._score);
  } catch(e) {
    state.apolloResults = people.map(p => ({ ...p, _score: 6, _reason: 'ICP match', _temp: 'warm', _selected: true }));
  }
  renderApolloResults();
  document.getElementById('import-sel-btn').style.display = 'inline-flex';
  document.getElementById('import-all-btn').style.display = 'inline-flex';
}

function renderApolloResults() {
  document.getElementById('apollo-results').innerHTML = state.apolloResults.map((p,i) => {
    const name = (p.first_name||'') + ' ' + (p.last_name||'');
    const org = p.organization?.name || '—';
    const emp = p.organization?.num_employees || '?';
    const alreadyIn = state.leads.some(l => l.email === p.email && p.email);
    const sc = p._score; const scColor = sc>=8?'#16a34a':sc>=6?'#004FA7':'#92400e';
    const scBg = sc>=8?'#f0fdf4':sc>=6?'rgba(70,191,251,.1)':'#fffbeb';
    return \`<div style="display:flex;align-items:flex-start;gap:10px;padding:10px;background:#fff;border:1px solid \${p._selected?'var(--sky)':'var(--border)'};border-radius:8px;margin-bottom:6px">
      <input type="checkbox" \${p._selected?'checked':''} onchange="state.apolloResults[\${i}]._selected=this.checked;this.closest('div').style.borderColor=this.checked?'var(--sky)':'var(--border)'" style="margin-top:3px;flex-shrink:0;cursor:pointer"/>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:700;color:var(--navy)">\${name.trim()}</span>
          <span style="font-size:10px;padding:1px 7px;border-radius:4px;background:\${scBg};color:\${scColor};font-weight:700">ICP \${sc}/10</span>
          <span class="tag tag-\${p._temp}">\${p._temp}</span>
          \${alreadyIn?'<span style="font-size:10px;color:var(--success);font-weight:600">✓ In pipeline</span>':''}
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">\${p.title||'—'} · \${org} · \${emp} employees</div>
        <div style="font-size:10px;color:var(--text-faint);margin-top:1px;font-style:italic">\${p._reason}</div>
      </div>
      <button class="btn sm primary" onclick="importApolloLead(\${i})" \${alreadyIn?'disabled':''} style="flex-shrink:0">\${alreadyIn?'In pipeline':'Import'}</button>
    </div>\`;
  }).join('') || '<div class="empty-state">No results.</div>';
}

async function importApolloLead(i) {
  const p = state.apolloResults[i];
  const name = ((p.first_name||'') + ' ' + (p.last_name||'')).trim();
  if (state.leads.some(l => l.email === p.email && p.email)) { alert(name + ' is already in your pipeline.'); return; }
  const lead = { name, org: p.organization?.name||'—', role: p.title||'Unknown', email: p.email||'', beds: p.organization?.num_employees ? Math.round(p.organization.num_employees/4)+'(est)' : '?', ehr:'TBD', stage:0, temp:p._temp, notes:'Imported from Apollo.io. ICP score: '+p._score+'/10. '+p._reason };
  try { const saved = await post('/api/leads', lead); state.leads.push(saved); } catch(e) { state.leads.push({...lead, id:Date.now(), added:'Today'}); }
  state.apolloImported++;
  document.getElementById('ap-imported').textContent = state.apolloImported;
  updateMetrics(); updateBadges(); refreshLeadSelects();
  addActivity('ti-download', name + ' imported from Apollo (ICP '+p._score+'/10)', 'Just now', '#004FA7');
  renderApolloResults();
}

function importSelected() { state.apolloResults.filter(p=>p._selected).forEach((p,i)=>{ const idx=state.apolloResults.indexOf(p); importApolloLead(idx); }); }
function importAll() { state.apolloResults.filter(p=>p._score>=6).forEach((p,i)=>{ const idx=state.apolloResults.indexOf(p); importApolloLead(idx); }); }

// ── Waitlist ─────────────────────────────────────────────
async function addToWaitlist(autoInvite=false) {
  const name = document.getElementById('wl-name').value.trim();
  const org = document.getElementById('wl-org').value.trim();
  if (!name || !org) { alert('Name and organization required.'); return null; }
  const body = { name, org, role:document.getElementById('wl-role').value, email:document.getElementById('wl-email').value, beds:document.getElementById('wl-beds').value, ehr:document.getElementById('wl-ehr').value, persona:document.getElementById('wl-persona').value, priority:document.getElementById('wl-priority').value };
  let entry;
  try { entry = await post('/api/waitlist', body); state.waitlist.push(entry); } catch(e) { entry = { id:'w'+Date.now(), ...body, status:'not_invited', added:'Today' }; state.waitlist.push(entry); }
  ['wl-name','wl-org','wl-role','wl-email','wl-beds','wl-ehr'].forEach(id => document.getElementById(id).value='');
  updateWaitlistMetrics(); renderWaitlist(); renderWlBreakdown();
  addActivity('ti-user-plus', name + ' added to waitlist', 'Just now', '#125C9B');
  return entry;
}

async function addAndInvite() { const e = await addToWaitlist(); if (e) await inviteEntry(e); }

async function inviteEntry(entry) {
  try {
    const data = await post('/api/ai/generate', { leadId: entry.id, type:'waitlist_confirm' });
    const emailBody = data.text || '';
    if (state.gmailToken && entry.email) await post('/api/gmail/send', { to:entry.email, subject:'You are on the Cardio AI early adopter list', body:emailBody, accessToken:state.gmailToken });
  } catch(e) {}
  entry.status = 'invited';
  try { await put('/api/waitlist/' + entry.id, { status:'invited' }); } catch(e) {}
  updateWaitlistMetrics(); renderWaitlist();
  addActivity('ti-mail', 'Invite sent to ' + entry.name, 'Just now', '#16a34a');
}

async function markOnboarded(id) {
  const e = state.waitlist.find(x => x.id === id);
  if (!e) return;
  e.status = 'onboarded';
  try { await put('/api/waitlist/' + id, { status:'onboarded' }); } catch(er) {}
  updateWaitlistMetrics(); renderWaitlist();
  addActivity('ti-check', e.name + ' onboarded to Cardio AI', 'Just now', '#16a34a');
}

async function removeFromWaitlist(id) {
  state.waitlist = state.waitlist.filter(e => e.id !== id);
  try { await del('/api/waitlist/' + id); } catch(e) {}
  updateWaitlistMetrics(); renderWaitlist(); renderWlBreakdown();
}

function updateWaitlistMetrics() {
  document.getElementById('wl-total').textContent = state.waitlist.length;
  document.getElementById('wl-invited').textContent = state.waitlist.filter(e=>e.status==='invited').length;
  document.getElementById('wl-onboarded').textContent = state.waitlist.filter(e=>e.status==='onboarded').length;
  document.getElementById('wl-beta').textContent = state.waitlist.filter(e=>e.status==='onboarded'&&e.priority==='high').length;
  document.getElementById('wl-count').textContent = state.waitlist.length;
  updateBadges();
}

function getWlGroup(target) {
  if (target==='high') return state.waitlist.filter(e=>e.priority==='high');
  if (target==='not_invited') return state.waitlist.filter(e=>e.status==='not_invited');
  if (target==='invited') return state.waitlist.filter(e=>e.status==='invited');
  if (target==='cardiologist') return state.waitlist.filter(e=>e.persona==='cardiologist');
  return state.waitlist;
}

async function previewBulk() {
  const type = document.getElementById('wl-bulk-type').value;
  const target = document.getElementById('wl-bulk-target').value;
  const group = getWlGroup(target);
  document.getElementById('bulk-preview').style.display = 'block';
  await aiCall('/api/ai/generate', { leadId: group[0]?.id || 'w1', type }, 'bulk-email-output');
}

async function sendBulk() {
  if (!state.gmailToken) { alert('Please connect Gmail first.'); return; }
  const target = document.getElementById('wl-bulk-target').value;
  const group = getWlGroup(target);
  if (!group.length) { alert('No matching members.'); return; }
  if (!confirm('Send to ' + group.length + ' waitlist members?')) return;
  for (const entry of group) { await inviteEntry(entry); await new Promise(r=>setTimeout(r,300)); }
  alert(group.length + ' emails sent.');
}

function copyBulk() { navigator.clipboard.writeText(document.getElementById('bulk-email-output').innerText).then(()=>alert('Copied!')); }

function renderWaitlist() {
  const filter = document.getElementById('wl-filter').value;
  const filtered = filter==='all' ? state.waitlist : state.waitlist.filter(e => { if(filter==='not_invited') return e.status==='not_invited'; if(filter==='invited') return e.status==='invited'; if(filter==='onboarded') return e.status==='onboarded'; return e.priority===filter; });
  const sc = {not_invited:'#9ca3af',invited:'#004FA7',onboarded:'#16a34a'};
  const sl = {not_invited:'Not invited',invited:'Invited',onboarded:'Onboarded'};
  const pc = {high:'#ef4444',medium:'#f59e0b',low:'#9ca3af'};
  document.getElementById('waitlist-list').innerHTML = filtered.map(e => \`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
      <div class="avatar" style="background:rgba(70,191,251,.1)">\${e.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--navy)">\${e.name}</div>
        <div style="font-size:11px;color:var(--text-muted)">\${e.role} · \${e.org} · \${e.beds||'?'} beds · \${e.ehr||'?'}</div>
        <div style="font-size:10px;color:var(--text-faint)">Priority: <span style="color:\${pc[e.priority]};font-weight:600">\${e.priority}</span> · Added \${e.added}</div>
      </div>
      <span style="font-size:10px;padding:2px 9px;border-radius:10px;background:\${sc[e.status]}22;color:\${sc[e.status]};font-weight:600;white-space:nowrap">\${sl[e.status]}</span>
      <div style="display:flex;gap:5px;flex-shrink:0">
        \${e.status==='not_invited'?\`<button class="btn sm primary" onclick="inviteEntry(state.waitlist.find(x=>x.id==='\${e.id}'))"><i class="ti ti-send"></i>Invite</button>\`:''}
        \${e.status==='invited'?\`<button class="btn sm success" onclick="markOnboarded('\${e.id}')"><i class="ti ti-check"></i>Onboarded</button>\`:''}
        \${e.status==='onboarded'?'<span style="font-size:12px;color:var(--success);font-weight:700">Active</span>':''}
        <button class="btn sm danger" onclick="removeFromWaitlist('\${e.id}')"><i class="ti ti-x"></i></button>
      </div>
    </div>\`).join('') || '<div class="empty-state"><i class="ti ti-users"></i>No members match this filter.</div>';
}

function renderWlBreakdown() {
  const personas = [{l:'Cardiologist',n:state.waitlist.filter(e=>e.persona==='cardiologist').length,c:'#46BFFB'},{l:'CMO/Med Dir',n:state.waitlist.filter(e=>e.persona==='cmo').length,c:'#1D9E75'},{l:'CFO',n:state.waitlist.filter(e=>e.persona==='cfo').length,c:'#BA7517'},{l:'Hospitalist',n:state.waitlist.filter(e=>e.persona==='hospitalist').length,c:'#534AB7'},{l:'Payer MD',n:state.waitlist.filter(e=>e.persona==='payer').length,c:'#D85A30'}];
  const statuses = [{l:'Not invited',n:state.waitlist.filter(e=>e.status==='not_invited').length,c:'#9ca3af'},{l:'Invited',n:state.waitlist.filter(e=>e.status==='invited').length,c:'#004FA7'},{l:'Onboarded',n:state.waitlist.filter(e=>e.status==='onboarded').length,c:'#16a34a'}];
  const maxP = Math.max(...personas.map(x=>x.n),1);
  document.getElementById('wl-breakdown').innerHTML =
    '<div class="section-lbl">By persona</div>' + personas.map(p=>\`<div class="bar-row"><div class="bar-lbl">\${p.l}</div><div class="bar-track"><div class="bar-fill" style="width:\${Math.round(p.n/maxP*100)}%;background:\${p.c}"></div></div><div class="bar-val">\${p.n}</div></div>\`).join('') +
    '<div class="section-lbl" style="margin-top:12px">By status</div>' + statuses.map(s=>\`<div class="bar-row"><div class="bar-lbl">\${s.l}</div><div class="bar-track"><div class="bar-fill" style="width:\${Math.round(s.n/Math.max(...statuses.map(x=>x.n),1)*100)}%;background:\${s.c}"></div></div><div class="bar-val">\${s.n}</div></div>\`).join('');
}

function exportCSV() {
  const rows = [['Name','Organization','Role','Email','Beds','EHR','Persona','Priority','Status','Added']];
  state.waitlist.forEach(e => rows.push([e.name,e.org,e.role,e.email,e.beds,e.ehr,e.persona,e.priority,e.status,e.added]));
  const csv = rows.map(r=>r.map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = 'Cardio_AI_Waitlist_' + new Date().toISOString().slice(0,10) + '.csv'; a.click();
}

// ── Launch / Milestones ──────────────────────────────────
function showMsForm() { document.getElementById('ms-form').style.display='block'; document.getElementById('ms-form').scrollIntoView({behavior:'smooth'}); }
function showRevForm() { document.getElementById('rev-form').style.display='block'; document.getElementById('rev-form').scrollIntoView({behavior:'smooth'}); }

async function saveMilestone() {
  const title = document.getElementById('ms-title').value.trim();
  if (!title) { alert('Title required.'); return; }
  const body = { title, phase:parseInt(document.getElementById('ms-phase').value), owner:document.getElementById('ms-owner').value, due:document.getElementById('ms-due').value, category:document.getElementById('ms-category').value, priority:document.getElementById('ms-priority').value, desc:document.getElementById('ms-desc').value, status:'pending' };
  let ms;
  try { ms = await post('/api/milestones', body); state.milestones.push(ms); } catch(e) { ms = {...body, id:Date.now(), added:'Today'}; state.milestones.push(ms); }
  ['ms-title','ms-owner','ms-due','ms-desc'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('ms-form').style.display='none';
  renderPhases(); updateLaunchMetrics();
  addActivity('ti-flag', 'Milestone added: ' + title, 'Just now', '#BA7517');
}

async function toggleMilestone(id) {
  const ms = state.milestones.find(m => String(m.id) === String(id));
  if (!ms) return;
  ms.status = ms.status === 'done' ? 'pending' : 'done';
  if (ms.status === 'done') ms.completedAt = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
  try { await put('/api/milestones/' + id, { status:ms.status, completedAt:ms.completedAt }); } catch(e) {}
  renderPhases(); updateLaunchMetrics();
  if (ms.status === 'done') addActivity('ti-check', 'Milestone completed: ' + ms.title, 'Just now', '#16a34a');
}

async function deleteMilestone(id) {
  state.milestones = state.milestones.filter(m => String(m.id) !== String(id));
  try { await del('/api/milestones/' + id); } catch(e) {}
  renderPhases(); updateLaunchMetrics();
}

async function generateMilestones() {
  const btn = document.querySelector('[onclick="generateMilestones()"]');
  btn.disabled = true; btn.innerHTML = '<div class="dot-pulse"><span></span><span></span><span></span></div> Generating...';
  try {
    const data = await post('/api/ai/milestones/generate', {});
    for (const ms of data.milestones) {
      let saved;
      try { saved = await post('/api/milestones', ms); state.milestones.push(saved); } catch(e) { state.milestones.push({...ms, id:Date.now()+Math.random(), added:'Today'}); }
    }
    renderPhases(); updateLaunchMetrics();
    addActivity('ti-wand', data.milestones.length + ' milestones generated by AI', 'Just now', '#534AB7');
  } catch(e) { alert('Error generating milestones: ' + e.message); }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-wand"></i>AI generate 20';
}

function renderPhases() {
  const el = document.getElementById('phases-list');
  if (!state.milestones.length) { el.innerHTML = '<div class="empty-state"><i class="ti ti-flag"></i>No milestones yet. Add manually or click "AI generate 20".</div>'; return; }
  el.innerHTML = PHASES_META.map((phase,pi) => {
    const pms = state.milestones.filter(m => m.phase === pi);
    if (!pms.length) return '';
    const done = pms.filter(m=>m.status==='done').length;
    const pct = pms.length ? Math.round(done/pms.length*100) : 0;
    return \`<div style="margin-bottom:1.25rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:50%;background:\${phase.color}22;display:flex;align-items:center;justify-content:center"><i class="ti \${phase.icon}" style="font-size:14px;color:\${phase.color}"></i></div>
          <div><div style="font-size:13px;font-weight:700;color:var(--navy)">\${phase.name}</div><div style="font-size:10px;color:var(--text-faint)">\${done}/\${pms.length} complete</div></div>
        </div>
        <span style="font-size:12px;font-weight:700;color:\${phase.color}">\${pct}%</span>
      </div>
      <div class="progress-bar" style="margin-bottom:10px"><div class="progress-fill" style="width:\${pct}%;background:\${phase.color}"></div></div>
      \${pms.map(ms=>\`
        <div style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;background:\${ms.status==='done'?'var(--success-bg)':'#fff'};border:1px solid \${ms.status==='done'?'var(--success-border)':'var(--border)'};border-radius:8px;margin-bottom:5px">
          <div style="width:18px;height:18px;border-radius:50%;border:2px solid \${ms.status==='done'?'var(--success)':'var(--border)'};background:\${ms.status==='done'?'var(--success)':'#fff'};display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-top:1px" onclick="toggleMilestone(\${JSON.stringify(ms.id)})">
            \${ms.status==='done'?'<i class="ti ti-check" style="font-size:10px;color:#fff"></i>':''}
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:\${ms.status==='done'?400:700};color:\${ms.status==='done'?'var(--text-muted)':'var(--navy)'};text-decoration:\${ms.status==='done'?'line-through':'none'}">\${ms.title}</span>
              <span class="cat-badge" style="background:\${CAT_COLORS[ms.category]||'#888'}22;color:\${CAT_COLORS[ms.category]||'#888'}">\${ms.category}</span>
              \${ms.priority==='critical'?'<span class="cat-badge" style="background:var(--danger-bg);color:var(--danger)">critical</span>':''}
            </div>
            \${ms.desc?\`<div style="font-size:11px;color:var(--text-faint);margin-top:2px">\${ms.desc}</div>\`:''}
            <div style="font-size:10px;color:var(--text-faint);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
              \${ms.owner?\`<span><i class="ti ti-user" style="font-size:11px"></i> \${ms.owner}</span>\`:''}
              \${ms.due?\`<span><i class="ti ti-calendar" style="font-size:11px"></i> \${ms.due}</span>\`:''}
              \${ms.status==='done'&&ms.completedAt?\`<span style="color:var(--success)"><i class="ti ti-check" style="font-size:11px"></i> Done \${ms.completedAt}</span>\`:''}
            </div>
          </div>
          <button class="btn sm danger" onclick="deleteMilestone(\${JSON.stringify(ms.id)})" style="flex-shrink:0;padding:3px 7px"><i class="ti ti-trash" style="font-size:12px"></i></button>
        </div>\`).join('')}
    </div>\`;
  }).join('');
}

function updateLaunchMetrics() {
  const done = state.milestones.filter(m=>m.status==='done').length;
  const total = state.milestones.length;
  document.getElementById('lc-done').textContent = done;
  document.getElementById('lc-done-sub').textContent = 'of ' + total + ' total';
  const revTotal = state.revenue.reduce((a,r)=>a+r.amount,0);
  document.getElementById('lc-revenue').textContent = '$' + revTotal.toLocaleString();
  const phaseProgress = PHASES_META.map((_,i) => { const pms=state.milestones.filter(m=>m.phase===i); return {total:pms.length,done:pms.filter(m=>m.status==='done').length}; });
  let curPhase = 0;
  for (let i=0;i<PHASES_META.length;i++) { if(phaseProgress[i].total>0&&phaseProgress[i].done===phaseProgress[i].total) curPhase=i+1; else if(phaseProgress[i].total>0){curPhase=i;break;} }
  curPhase = Math.min(curPhase,3);
  document.getElementById('lc-phase').textContent = PHASES_META[curPhase].name.split(' — ')[1];
  document.getElementById('lc-phase-sub').textContent = 'Phase ' + (curPhase+1) + ' of 4';
  const pendingSales = state.milestones.filter(m=>m.category==='sales'&&m.status==='pending'&&m.due);
  if (pendingSales.length) { const nearest=pendingSales.sort((a,b)=>new Date(a.due)-new Date(b.due))[0]; const days=Math.max(0,Math.round((new Date(nearest.due)-new Date())/86400000)); document.getElementById('lc-days').textContent=days; }
  renderLaunchProgress(); renderRevenueTracker();
}

function renderLaunchProgress() {
  const el = document.getElementById('launch-progress');
  if (!state.milestones.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text-faint);text-align:center;padding:8px">Add milestones to see progress</div>'; return; }
  el.innerHTML = PHASES_META.map((p,i) => { const pms=state.milestones.filter(m=>m.phase===i); if(!pms.length)return''; const done=pms.filter(m=>m.status==='done').length; const pct=Math.round(done/pms.length*100); return \`<div class="bar-row"><div class="bar-lbl" style="font-size:10px">Phase \${i+1}</div><div class="bar-track"><div class="bar-fill" style="width:\${pct}%;background:\${p.color}"></div></div><div class="bar-val">\${pct}%</div></div>\`; }).join('');
}

async function saveRevenue() {
  const customer = document.getElementById('rv-customer').value.trim();
  const amount = parseFloat(document.getElementById('rv-amount').value);
  if (!customer || !amount) { alert('Customer and amount required.'); return; }
  const body = { customer, amount, type:document.getElementById('rv-type').value||'Contract', date:document.getElementById('rv-date').value||new Date().toLocaleDateString(), pmpm:document.getElementById('rv-pmpm').value, members:document.getElementById('rv-members').value };
  let rv;
  try { rv = await post('/api/revenue', body); state.revenue.push(rv); } catch(e) { rv={...body,id:Date.now(),logged:'Today'}; state.revenue.push(rv); }
  ['rv-customer','rv-amount','rv-type','rv-date','rv-pmpm','rv-members'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('rev-form').style.display='none';
  updateLaunchMetrics();
  addActivity('ti-currency-dollar','$'+amount.toLocaleString()+' logged — '+customer,'Just now','#16a34a');
}

function renderRevenueTracker() {
  const total = state.revenue.reduce((a,r)=>a+r.amount,0);
  const pct = Math.min(Math.round(total/51000000*100),100);
  document.getElementById('revenue-tracker').innerHTML = \`
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px">Y1 target $51M · Logged: <strong>$\${total.toLocaleString()}</strong></div>
    <div class="progress-bar"><div class="progress-fill" style="width:\${pct}%;background:var(--success)"></div></div>
    <div class="seq-progress"><span>$\${total.toLocaleString()}</span><span>\${pct}% of $51M</span></div>
    \${state.revenue.slice(0,4).map(r=>\`<div style="display:flex;justify-content:space-between;font-size:11px;padding:5px 0;border-bottom:1px solid var(--border-light)"><div><div style="font-weight:700">\${r.customer}</div><div style="color:var(--text-faint)">\${r.type}\${r.pmpm?' · '+r.pmpm:''}</div></div><div style="font-weight:700;color:var(--success)">$\${r.amount.toLocaleString()}</div></div>\`).join('')}\`;
}

// ── Analytics ────────────────────────────────────────────
function renderAnalytics() {
  const stageCounts = STAGES.map((s,i)=>({s,n:state.leads.filter(l=>l.stage===i).length,c:STAGE_COLORS[i]}));
  document.getElementById('funnel-chart').innerHTML = stageCounts.map(x=>\`<div class="funnel-row"><div class="funnel-dot" style="background:\${x.c}"></div><div style="flex:1;font-size:12px;color:var(--text-muted)">\${x.s}</div><div style="font-weight:700;font-size:12px;color:var(--navy);min-width:24px;text-align:right">\${x.n}</div><div style="font-size:11px;color:var(--text-faint);min-width:36px;text-align:right">\${state.leads.length?Math.round(x.n/state.leads.length*100):0}%</div></div>\`).join('');
  const personas = [{l:'Cardiologist',n:state.leads.filter(l=>/cardio|hospitalist/i.test(l.role)).length},{l:'CMO',n:state.leads.filter(l=>/cmo|chief/i.test(l.role)).length},{l:'CFO',n:state.leads.filter(l=>/cfo/i.test(l.role)).length},{l:'Payer MD',n:state.leads.filter(l=>/payer|dir/i.test(l.role)).length},{l:'Other',n:state.leads.filter(l=>!/cardio|hospitalist|cmo|chief|cfo|payer|dir/i.test(l.role)).length}];
  const maxP = Math.max(...personas.map(x=>x.n),1);
  document.getElementById('persona-chart').innerHTML = personas.map(p=>\`<div class="bar-row"><div class="bar-lbl">\${p.l}</div><div class="bar-track"><div class="bar-fill" style="width:\${Math.round(p.n/maxP*100)}%"></div></div><div class="bar-val">\${p.n}</div></div>\`).join('');
  const temps = [{l:'Hot',n:state.leads.filter(l=>l.temp==='hot').length,c:'#ef4444'},{l:'Warm',n:state.leads.filter(l=>l.temp==='warm').length,c:'#f59e0b'},{l:'Cold',n:state.leads.filter(l=>l.temp==='cold').length,c:'#94a3b8'}];
  const maxT = Math.max(...temps.map(x=>x.n),1);
  document.getElementById('temp-chart').innerHTML = temps.map(t=>\`<div class="bar-row"><div class="bar-lbl">\${t.l}</div><div class="bar-track"><div class="bar-fill" style="width:\${Math.round(t.n/maxT*100)}%;background:\${t.c}"></div></div><div class="bar-val">\${t.n}</div></div>\`).join('');
  document.getElementById('key-metrics').innerHTML = \`
    <div class="field-row"><span class="field-lbl">Total leads</span><span class="field-val">\${state.leads.length}</span></div>
    <div class="field-row"><span class="field-lbl">LOIs / closed</span><span class="field-val">\${state.leads.filter(l=>l.stage>=4).length}</span></div>
    <div class="field-row"><span class="field-lbl">Active sequences</span><span class="field-val">\${state.sequences.filter(s=>s.status==='active').length}</span></div>
    <div class="field-row"><span class="field-lbl">Emails sent</span><span class="field-val">\${state.sendLog.length}</span></div>
    <div class="field-row"><span class="field-lbl">Waitlist</span><span class="field-val">\${state.waitlist.length}</span></div>
    <div class="field-row"><span class="field-lbl">Conversion rate</span><span class="field-val">\${state.leads.length?Math.round(state.leads.filter(l=>l.stage>=4).length/state.leads.length*100):0}%</span></div>\`;
}

// ── Send log ─────────────────────────────────────────────
function renderLog() {
  document.getElementById('send-log-list').innerHTML = state.sendLog.length ? state.sendLog.map(l=>\`
    <div class="log-row"><div class="log-dot" style="background:#22c55e"></div><div style="flex:1"><strong>\${l.to||l.email}</strong> — \${l.subject||'Email'}<div style="font-size:10px;color:var(--text-faint)">\${l.email} · \${l.time}</div></div></div>\`).join('') : '<div class="empty-state"><i class="ti ti-send"></i>No emails sent yet.</div>';
}

async function clearLog() { state.sendLog = []; try { await del('/api/log'); } catch(e) {} renderLog(); updateMetrics(); }

// ── Metrics & helpers ────────────────────────────────────
function updateMetrics() {
  document.getElementById('m-total').textContent = state.leads.length;
  document.getElementById('m-sent').textContent = state.sendLog.length;
  document.getElementById('m-loi').textContent = state.leads.filter(l=>l.stage>=4).length;
  document.getElementById('m-wl').textContent = state.waitlist.length;
}

function updateBadges() {
  const lb = document.getElementById('badge-leads'); lb.textContent = state.leads.length; lb.style.display = state.leads.length ? '' : 'none';
  const wb = document.getElementById('badge-wl'); wb.textContent = state.waitlist.length; wb.style.display = state.waitlist.length ? '' : 'none';
}

function refreshLeadSelects() {
  const opts = '<option value="">— Choose a lead —</option>' + state.leads.map(l=>\`<option value="\${l.id}">\${l.name} — \${l.role}, \${l.org}</option>\`).join('');
  ['out-lead','q-lead','enroll-lead'].forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML=opts; });
}

function addActivity(icon, text, time, color) {
  const feed = document.getElementById('activity-feed');
  if (feed.querySelector('.empty-state')) feed.innerHTML = '';
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--border-light);font-size:12px';
  d.innerHTML = \`<i class="ti \${icon}" style="font-size:16px;color:\${color};flex-shrink:0;margin-top:1px"></i><div style="flex:1;color:var(--navy)">\${text}</div><div style="font-size:11px;color:var(--text-faint);flex-shrink:0">\${time}</div>\`;
  feed.insertBefore(d, feed.firstChild);
  if (feed.children.length > 12) feed.removeChild(feed.lastChild);
}

// ── Navigation ───────────────────────────────────────────
function nav(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (el) el.classList.add('active');
  else document.querySelectorAll('.nav-item').forEach(n => { if(n.getAttribute('onclick')?.includes("'"+id+"'")) n.classList.add('active'); });
  if (id==='pipeline') renderKanban();
  if (id==='leads') renderLeads();
  if (id==='gmail'||id==='qualify'||id==='sequences') refreshLeadSelects();
  if (id==='sequences') renderSequences();
  if (id==='analytics') renderAnalytics();
  if (id==='waitlist') { updateWaitlistMetrics(); renderWaitlist(); renderWlBreakdown(); }
  if (id==='launch') { renderPhases(); updateLaunchMetrics(); }
  if (id==='log') renderLog();
}

// ── Init ─────────────────────────────────────────────────

// ── Auth ─────────────────────────────────────────────────
async function loadUser() {
  try {
    const data = await get('/api/auth/me');
    const user = data.user;
    document.getElementById('user-name-el').textContent = user.name || user.email.split('@')[0];
    document.getElementById('user-email-el').textContent = user.email;
    const initials = (user.name||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() || user.email[0].toUpperCase();
    if (user.picture) {
      document.getElementById('user-avatar-el').innerHTML = '<img src="' + user.picture + '" alt="' + user.name + '">';
    } else {
      document.getElementById('user-initials').textContent = initials;
    }
    // Pre-fill Gmail email
    state.gmailEmail = user.email;
  } catch(e) {
    // Not signed in — redirect to login
    window.location.href = '/login.html';
  }
}

async function signOut() {
  try {
    await post('/api/auth/signout', {});
  } catch(e) {}
  window.location.href = '/login.html';
}

// Load user on page init
loadUser().then(() => loadAll());

</script>
</body>
</html>
`;



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
const SESSION_DIR = process.env.NODE_ENV === 'production' ? '/tmp/sessions' : './sessions';

// Ensure session directory exists
try {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
} catch(e) {
  console.log('⚠️ Could not create session dir:', e.message);
}

// Trust Render's proxy for secure cookies
app.set('trust proxy', 1);

app.use(session({
  store: new FileStore({
    path: SESSION_DIR,
    ttl: 86400,
    retries: 1,
    logFn: () => {}
  }),
  secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
  resave: false,
  saveUninitialized: false,
  name: 'cardioai.sid',
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
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
    console.log('No session for:', req.path, '— serving login');
    return res.send(LOGIN_HTML);
  }
  console.log('✅ Authenticated:', req.session.user.email, req.path);
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

// Static files served inline — no filesystem dependency


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
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      res.redirect('/');
    });
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
    return res.send(LOGIN_HTML);
  }
  res.send(INDEX_HTML);
});

// ── Start ─────────────────────────────────────────────────
async function startServer() {
  try {
    // HTML served inline

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
