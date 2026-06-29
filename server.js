/* ============================================================================
 *  TWO CHANGES TO APPLY TO YOUR CURRENT server.js
 *  (the one with connect-pg-simple sessions — do NOT replace the whole file)
 * ============================================================================
 *
 *  CHANGE 1 — ADD the integration endpoint.
 *     Paste the CHANGE 1 block anywhere among your route definitions.
 *     A clean spot is right after your leads routes
 *     (after  app.delete('/api/leads/:id', ...)  ), before the next section.
 *
 *  CHANGE 2 — REPLACE your Apollo route.
 *     Find your existing   app.post('/api/apollo/search', ...)   route and
 *     replace it ENTIRELY with the CHANGE 2 block below.
 *
 *  Neither change touches sessions, requires, or anything else — so your
 *  connect-pg-simple setup stays exactly as it is.
 * ========================================================================== */


/* ───────────────────────── CHANGE 1: ADD THIS ───────────────────────── */

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


/* ─────────── CHANGE 2: REPLACE YOUR APOLLO ROUTE WITH THIS ─────────── */

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
