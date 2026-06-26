/**
 * Cardio AI — Database Layer
 * Supports: PostgreSQL (Render) with JSON fallback
 * 
 * Set DATABASE_URL in .env to enable PostgreSQL
 * Falls back to /tmp/cardioai_data.json if no DB configured
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const USE_PG = !!process.env.DATABASE_URL;
let pool = null;

// ── PostgreSQL setup ─────────────────────────────────────
if (USE_PG) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
  });

  console.log('✅ PostgreSQL configured');
} else {
  console.log('ℹ️  No DATABASE_URL — using file storage');
}

// ── Schema creation ──────────────────────────────────────
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    org VARCHAR(255) NOT NULL,
    role VARCHAR(255),
    email VARCHAR(255),
    beds VARCHAR(50),
    ehr VARCHAR(100),
    stage INTEGER DEFAULT 0,
    temp VARCHAR(20) DEFAULT 'warm',
    notes TEXT,
    added VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS waitlist (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    org VARCHAR(255) NOT NULL,
    role VARCHAR(255),
    email VARCHAR(255),
    beds VARCHAR(50),
    ehr VARCHAR(100),
    persona VARCHAR(50) DEFAULT 'cardiologist',
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(30) DEFAULT 'not_invited',
    added VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    phase INTEGER DEFAULT 0,
    owner VARCHAR(100),
    due VARCHAR(20),
    category VARCHAR(50) DEFAULT 'product',
    priority VARCHAR(20) DEFAULT 'medium',
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    completed_at VARCHAR(50),
    added VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS revenue (
    id SERIAL PRIMARY KEY,
    customer VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    type VARCHAR(100),
    date VARCHAR(50),
    pmpm VARCHAR(50),
    members VARCHAR(50),
    logged VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sequences (
    id SERIAL PRIMARY KEY,
    lead_id VARCHAR(50),
    lead_name VARCHAR(255),
    org VARCHAR(255),
    role VARCHAR(255),
    seq_id VARCHAR(50),
    seq_name VARCHAR(255),
    current_touch INTEGER DEFAULT 1,
    total_touches INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'active',
    enrolled VARCHAR(50),
    next_send VARCHAR(255),
    touches JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS send_log (
    id BIGINT PRIMARY KEY,
    to_name VARCHAR(255),
    email VARCHAR(255),
    subject TEXT,
    type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'sent',
    time VARCHAR(50),
    message_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS counters (
    key VARCHAR(50) PRIMARY KEY,
    value INTEGER DEFAULT 1
  );

  INSERT INTO counters (key, value) VALUES ('waitlist', 1) ON CONFLICT DO NOTHING;
`;

async function initDB() {
  if (!USE_PG) return;
  try {
    await pool.query(SCHEMA);
    console.log('✅ PostgreSQL schema ready');
  } catch(e) {
    console.error('❌ Schema creation failed:', e.message);
    throw e;
  }
}

// ── File storage fallback ────────────────────────────────
const DATA_FILE = process.env.NODE_ENV === 'production'
  ? '/tmp/cardioai_data.json'
  : path.join(__dirname, 'data.json');

let fileStore = {
  leads: [], waitlist: [], milestones: [], revenue: [],
  sequences: [], sendLog: [],
  counters: { leads: 1, waitlist: 1, milestones: 1, revenue: 1, sequences: 1 }
};

function loadFileStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      if (raw && raw.trim()) fileStore = JSON.parse(raw);
      console.log('✅ File store loaded');
    }
  } catch(e) {
    console.log('⚠️ Could not load file store:', e.message);
  }
}

function saveFileStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(fileStore, null, 2));
  } catch(e) {
    console.error('⚠️ Could not save file store:', e.message);
  }
}

if (!USE_PG) loadFileStore();

// ── Universal DB interface ───────────────────────────────

// LEADS
const Leads = {
  async getAll() {
    if (USE_PG) {
      const r = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
      return r.rows.map(pgToLead);
    }
    return fileStore.leads;
  },
  async create(data) {
    if (USE_PG) {
      const r = await pool.query(
        `INSERT INTO leads (name,org,role,email,beds,ehr,stage,temp,notes,added)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [data.name,data.org,data.role||'Unknown',data.email||'',data.beds||'',
         data.ehr||'',parseInt(data.stage)||0,data.temp||'warm',data.notes||'',
         new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})]
      );
      return pgToLead(r.rows[0]);
    }
    const lead = { id: fileStore.counters.leads++, ...data, added: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}), createdAt: new Date().toISOString() };
    fileStore.leads.push(lead); saveFileStore(); return lead;
  },
  async update(id, data) {
    if (USE_PG) {
      const fields = Object.keys(data).filter(k => !['id','created_at'].includes(k));
      const sets = fields.map((f,i) => `${camel2snake(f)}=$${i+1}`).join(',');
      const vals = fields.map(f => data[f]);
      vals.push(id);
      const r = await pool.query(`UPDATE leads SET ${sets},updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals);
      return r.rows[0] ? pgToLead(r.rows[0]) : null;
    }
    const idx = fileStore.leads.findIndex(l => l.id === id);
    if (idx === -1) return null;
    fileStore.leads[idx] = { ...fileStore.leads[idx], ...data, id };
    saveFileStore(); return fileStore.leads[idx];
  },
  async delete(id) {
    if (USE_PG) { await pool.query('DELETE FROM leads WHERE id=$1', [id]); return; }
    fileStore.leads = fileStore.leads.filter(l => l.id !== id); saveFileStore();
  }
};

// WAITLIST
const Waitlist = {
  async getAll() {
    if (USE_PG) {
      const r = await pool.query('SELECT * FROM waitlist ORDER BY created_at DESC');
      return r.rows.map(pgToWaitlist);
    }
    return fileStore.waitlist;
  },
  async create(data) {
    if (USE_PG) {
      const id = 'w' + Date.now();
      const r = await pool.query(
        `INSERT INTO waitlist (id,name,org,role,email,beds,ehr,persona,priority,status,added)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'not_invited',$10) RETURNING *`,
        [id,data.name,data.org,data.role||'Unknown',data.email||'',data.beds||'',
         data.ehr||'',data.persona||'cardiologist',data.priority||'medium',
         new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})]
      );
      return pgToWaitlist(r.rows[0]);
    }
    const entry = { id:'w'+Date.now(), ...data, status:'not_invited', added: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}), createdAt: new Date().toISOString() };
    fileStore.waitlist.push(entry); saveFileStore(); return entry;
  },
  async update(id, data) {
    if (USE_PG) {
      const fields = Object.keys(data).filter(k => !['id','created_at'].includes(k));
      const sets = fields.map((f,i) => `${camel2snake(f)}=$${i+1}`).join(',');
      const vals = [...fields.map(f => data[f]), id];
      const r = await pool.query(`UPDATE waitlist SET ${sets},updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals);
      return r.rows[0] ? pgToWaitlist(r.rows[0]) : null;
    }
    const idx = fileStore.waitlist.findIndex(w => w.id === id);
    if (idx === -1) return null;
    fileStore.waitlist[idx] = { ...fileStore.waitlist[idx], ...data, id };
    saveFileStore(); return fileStore.waitlist[idx];
  },
  async delete(id) {
    if (USE_PG) { await pool.query('DELETE FROM waitlist WHERE id=$1', [id]); return; }
    fileStore.waitlist = fileStore.waitlist.filter(w => w.id !== id); saveFileStore();
  }
};

// MILESTONES
const Milestones = {
  async getAll() {
    if (USE_PG) {
      const r = await pool.query('SELECT * FROM milestones ORDER BY phase ASC, created_at ASC');
      return r.rows.map(pgToMilestone);
    }
    return fileStore.milestones;
  },
  async create(data) {
    if (USE_PG) {
      const r = await pool.query(
        `INSERT INTO milestones (title,phase,owner,due,category,priority,description,status,added)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING *`,
        [data.title,parseInt(data.phase)||0,data.owner||'Unassigned',data.due||'',
         data.category||'product',data.priority||'medium',data.desc||'',
         new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})]
      );
      return pgToMilestone(r.rows[0]);
    }
    const ms = { id: fileStore.counters.milestones++, ...data, status:'pending', added: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}), createdAt: new Date().toISOString() };
    fileStore.milestones.push(ms); saveFileStore(); return ms;
  },
  async update(id, data) {
    if (USE_PG) {
      const completed = data.status === 'done' ? new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}) : null;
      const r = await pool.query(
        `UPDATE milestones SET status=$1,completed_at=COALESCE($2,completed_at) WHERE id=$3 RETURNING *`,
        [data.status, completed, id]
      );
      return r.rows[0] ? pgToMilestone(r.rows[0]) : null;
    }
    const idx = fileStore.milestones.findIndex(m => m.id === id);
    if (idx === -1) return null;
    if (data.status === 'done' && fileStore.milestones[idx].status !== 'done') data.completedAt = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
    fileStore.milestones[idx] = { ...fileStore.milestones[idx], ...data, id };
    saveFileStore(); return fileStore.milestones[idx];
  },
  async delete(id) {
    if (USE_PG) { await pool.query('DELETE FROM milestones WHERE id=$1', [id]); return; }
    fileStore.milestones = fileStore.milestones.filter(m => m.id !== id); saveFileStore();
  }
};

// REVENUE
const Revenue = {
  async getAll() {
    if (USE_PG) {
      const r = await pool.query('SELECT * FROM revenue ORDER BY created_at DESC');
      return r.rows.map(pgToRevenue);
    }
    return fileStore.revenue;
  },
  async create(data) {
    if (USE_PG) {
      const r = await pool.query(
        `INSERT INTO revenue (customer,amount,type,date,pmpm,members,logged)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [data.customer,parseFloat(data.amount),data.type||'Contract',
         data.date||new Date().toLocaleDateString(),data.pmpm||'',data.members||'',
         new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})]
      );
      return pgToRevenue(r.rows[0]);
    }
    const rv = { id: fileStore.counters.revenue++, ...data, amount:parseFloat(data.amount), logged: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}), createdAt: new Date().toISOString() };
    fileStore.revenue.push(rv); saveFileStore(); return rv;
  }
};

// SEQUENCES
const Sequences = {
  async getAll() {
    if (USE_PG) {
      const r = await pool.query('SELECT * FROM sequences ORDER BY created_at DESC');
      return r.rows.map(pgToSequence);
    }
    return fileStore.sequences;
  },
  async create(data) {
    if (USE_PG) {
      const r = await pool.query(
        `INSERT INTO sequences (lead_id,lead_name,org,role,seq_id,seq_name,current_touch,total_touches,status,enrolled,next_send,touches)
         VALUES ($1,$2,$3,$4,$5,$6,1,5,'active',$7,'Touch 1 queued','[]') RETURNING *`,
        [String(data.leadId),data.leadName||'',data.org||'',data.role||'',
         data.seqId,data.seqName||data.seqId,
         new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})]
      );
      return pgToSequence(r.rows[0]);
    }
    const seq = { id: fileStore.counters.sequences++, ...data, currentTouch:1, totalTouches:5, status:'active', enrolled:'Today', nextSend:'Touch 1 queued', touches:[], createdAt: new Date().toISOString() };
    fileStore.sequences.push(seq); saveFileStore(); return seq;
  },
  async update(id, data) {
    if (USE_PG) {
      const r = await pool.query('UPDATE sequences SET status=$1 WHERE id=$2 RETURNING *', [data.status, id]);
      return r.rows[0] ? pgToSequence(r.rows[0]) : null;
    }
    const idx = fileStore.sequences.findIndex(s => s.id === id);
    if (idx === -1) return null;
    fileStore.sequences[idx] = { ...fileStore.sequences[idx], ...data, id };
    saveFileStore(); return fileStore.sequences[idx];
  }
};

// SEND LOG
const SendLog = {
  async getAll() {
    if (USE_PG) {
      const r = await pool.query('SELECT * FROM send_log ORDER BY created_at DESC LIMIT 500');
      return r.rows.map(pgToLog);
    }
    return fileStore.sendLog;
  },
  async add(entry) {
    if (USE_PG) {
      await pool.query(
        `INSERT INTO send_log (id,to_name,email,subject,type,status,time,message_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [entry.id||Date.now(),entry.to||'',entry.email||'',entry.subject||'',
         entry.type||'email',entry.status||'sent',entry.time||new Date().toLocaleTimeString(),entry.messageId||'']
      );
      return;
    }
    fileStore.sendLog.unshift(entry);
    if (fileStore.sendLog.length > 500) fileStore.sendLog = fileStore.sendLog.slice(0,500);
    saveFileStore();
  },
  async clear() {
    if (USE_PG) { await pool.query('DELETE FROM send_log'); return; }
    fileStore.sendLog = []; saveFileStore();
  }
};

// ── Row mappers ──────────────────────────────────────────
function pgToLead(r) {
  return { id:r.id, name:r.name, org:r.org, role:r.role, email:r.email, beds:r.beds, ehr:r.ehr, stage:r.stage, temp:r.temp, notes:r.notes, added:r.added, createdAt:r.created_at, updatedAt:r.updated_at };
}
function pgToWaitlist(r) {
  return { id:r.id, name:r.name, org:r.org, role:r.role, email:r.email, beds:r.beds, ehr:r.ehr, persona:r.persona, priority:r.priority, status:r.status, added:r.added, createdAt:r.created_at };
}
function pgToMilestone(r) {
  return { id:r.id, title:r.title, phase:r.phase, owner:r.owner, due:r.due, category:r.category, priority:r.priority, desc:r.description, status:r.status, completedAt:r.completed_at, added:r.added, createdAt:r.created_at };
}
function pgToRevenue(r) {
  return { id:r.id, customer:r.customer, amount:parseFloat(r.amount), type:r.type, date:r.date, pmpm:r.pmpm, members:r.members, logged:r.logged, createdAt:r.created_at };
}
function pgToSequence(r) {
  return { id:r.id, leadId:r.lead_id, leadName:r.lead_name, org:r.org, role:r.role, seqId:r.seq_id, seqName:r.seq_name, currentTouch:r.current_touch, totalTouches:r.total_touches, status:r.status, enrolled:r.enrolled, nextSend:r.next_send, touches:r.touches||[], createdAt:r.created_at };
}
function pgToLog(r) {
  return { id:r.id, to:r.to_name, email:r.email, subject:r.subject, type:r.type, status:r.status, time:r.time, messageId:r.message_id };
}
function camel2snake(str) {
  return str.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
}

// ── Analytics ────────────────────────────────────────────
async function getAnalyticsSummary() {
  if (USE_PG) {
    const [leads, wl, rev, seqs, log] = await Promise.all([
      pool.query('SELECT stage, temp FROM leads'),
      pool.query('SELECT status, priority FROM waitlist'),
      pool.query('SELECT SUM(amount) as total, COUNT(*) as count FROM revenue'),
      pool.query("SELECT status FROM sequences"),
      pool.query('SELECT COUNT(*) as count FROM send_log')
    ]);
    const STAGES = ['ICP targeting','Lead gen','Outreach','Demo','LOI','Closed'];
    return {
      leads: {
        total: leads.rowCount,
        byStage: STAGES.map((s,i) => ({ stage:s, count: leads.rows.filter(r=>r.stage===i).length })),
        hot: leads.rows.filter(r=>r.temp==='hot').length,
        warm: leads.rows.filter(r=>r.temp==='warm').length,
        cold: leads.rows.filter(r=>r.temp==='cold').length,
        lois: leads.rows.filter(r=>r.stage>=4).length,
        conversionRate: leads.rowCount ? Math.round(leads.rows.filter(r=>r.stage>=4).length/leads.rowCount*100) : 0
      },
      waitlist: {
        total: wl.rowCount,
        notInvited: wl.rows.filter(r=>r.status==='not_invited').length,
        invited: wl.rows.filter(r=>r.status==='invited').length,
        onboarded: wl.rows.filter(r=>r.status==='onboarded').length
      },
      revenue: {
        total: parseFloat(rev.rows[0].total||0),
        target: 51000000,
        events: parseInt(rev.rows[0].count||0)
      },
      sequences: {
        active: seqs.rows.filter(r=>r.status==='active').length,
        totalTouches: 0
      },
      emails: { sent: parseInt(log.rows[0].count||0) }
    };
  }
  // File store analytics
  return {
    leads: {
      total: fileStore.leads.length,
      byStage: ['ICP targeting','Lead gen','Outreach','Demo','LOI','Closed'].map((s,i)=>({stage:s,count:fileStore.leads.filter(l=>l.stage===i).length})),
      hot: fileStore.leads.filter(l=>l.temp==='hot').length,
      lois: fileStore.leads.filter(l=>l.stage>=4).length,
      conversionRate: fileStore.leads.length ? Math.round(fileStore.leads.filter(l=>l.stage>=4).length/fileStore.leads.length*100) : 0
    },
    waitlist: { total: fileStore.waitlist.length, notInvited: fileStore.waitlist.filter(w=>w.status==='not_invited').length, invited: fileStore.waitlist.filter(w=>w.status==='invited').length, onboarded: fileStore.waitlist.filter(w=>w.status==='onboarded').length },
    revenue: { total: fileStore.revenue.reduce((a,r)=>a+r.amount,0), target: 51000000, events: fileStore.revenue.length },
    sequences: { active: fileStore.sequences.filter(s=>s.status==='active').length, totalTouches: fileStore.sequences.reduce((a,s)=>a+s.touches.length,0) },
    emails: { sent: fileStore.sendLog.length }
  };
}

module.exports = { initDB, Leads, Waitlist, Milestones, Revenue, Sequences, SendLog, getAnalyticsSummary, USE_PG };
