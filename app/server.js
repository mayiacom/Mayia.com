const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
loadEnv(path.join(__dirname, '.env'));
const port = Number(process.env.PORT || 3210);
const host = process.env.HOST || '0.0.0.0';
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const generationRequests = new Map();
const membershipPlans = {
  weekly: { amountEnv: 'CASHFREE_PRICE_WEEKLY', interval: 'WEEK', name: 'Mayia Week' },
  monthly: { amountEnv: 'CASHFREE_PRICE_MONTHLY', interval: 'MONTH', name: 'Mayia Creator' },
  studio: { amountEnv: 'CASHFREE_PRICE_STUDIO', interval: 'MONTH', name: 'Mayia Studio' },
  annual: { amountEnv: 'CASHFREE_PRICE_ANNUAL', interval: 'YEAR', name: 'Mayia Annual' }
};
const cashfreeApiBase = () => process.env.CASHFREE_ENVIRONMENT === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
const cashfreeReady = () => Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 20_000) reject(new Error('Request is too large.')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid request.')); } });
    req.on('error', reject);
  });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, { configured: Boolean(process.env.OPENAI_API_KEY), model });
  if (req.method === 'GET' && url.pathname === '/api/billing/status') {
    const amounts = Object.fromEntries(Object.entries(membershipPlans).map(([id, plan]) => [id, Number(process.env[plan.amountEnv]) || 0]));
    const plans = Object.fromEntries(Object.entries(membershipPlans).map(([id]) => [id, Boolean(cashfreeReady() && amounts[id] > 0)]));
    return send(res, 200, { provider: 'Cashfree', environment: process.env.CASHFREE_ENVIRONMENT === 'production' ? 'production' : 'sandbox', plans, amounts });
  }
  if (req.method === 'POST' && url.pathname === '/api/checkout') {
    try {
      const { plan: planId, customer } = await readBody(req);
      const plan = membershipPlans[String(planId || '')];
      if (!plan) return send(res, 400, { error: 'Choose a valid Mayia membership plan.' });
      const name = String(customer?.name || '').trim().slice(0, 100);
      const email = String(customer?.email || '').trim().slice(0, 160);
      const phone = String(customer?.phone || '').replace(/\\D/g, '').slice(-10);
      const amount = Number(process.env[plan.amountEnv]);
      if (!cashfreeReady() || !Number.isFinite(amount) || amount <= 0) return send(res, 503, { error: 'Cashfree checkout is not configured for this plan yet.' });
      if (name.length < 2 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || phone.length !== 10) return send(res, 400, { error: 'Enter your name, a valid email, and a 10-digit Indian phone number.' });
      const publicUrl = (process.env.PUBLIC_APP_URL || 'https://mayia-az6g.onrender.com').replace(/\\/$/, '');
      const subscriptionId = `mayia_${planId}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const response = await fetch(`${cashfreeApiBase()}/subscriptions`, {
        method: 'POST',
        headers: { 'x-api-version': '2026-01-01', 'x-client-id': process.env.CASHFREE_APP_ID, 'x-client-secret': process.env.CASHFREE_SECRET_KEY, 'x-idempotency-key': crypto.randomUUID(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription_id: subscriptionId,
          customer_details: { customer_name: name, customer_email: email, customer_phone: phone },
          plan_details: { plan_name: plan.name, plan_type: 'PERIODIC', plan_amount: amount, plan_max_amount: amount, plan_max_cycles: 120, plan_intervals: 1, plan_currency: 'INR', plan_interval_type: plan.interval, plan_note: `Mayia ${plan.name}` },
          authorization_details: { authorization_amount: amount, authorization_amount_refund: true },
          subscription_meta: { return_url: `${publicUrl}/digital?checkout=return`, notification_channel: ['EMAIL', 'SMS'] },
          subscription_tags: { mayia_plan: planId }
        }),
        signal: AbortSignal.timeout(15000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('Cashfree subscription error:', response.status, data?.message || data?.code || 'request failed');
        return send(res, 502, { error: 'Cashfree could not start checkout. Check account activation, credentials, and subscription settings.' });
      }
      if (!data.subscription_session_id) return send(res, 502, { error: 'Cashfree did not return a subscription session. Please try again.' });
      return send(res, 200, { subscriptionSessionId: data.subscription_session_id, environment: process.env.CASHFREE_ENVIRONMENT === 'production' ? 'production' : 'sandbox' });
    } catch (error) {
      console.error('Cashfree checkout request failed:', error.message);
      return send(res, 502, { error: 'Could not connect to Cashfree. Please try again in a moment.' });
    }
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    return fs.createReadStream(path.join(root, 'app.js')).pipe(res);
  }
  if (req.method === 'GET' && url.pathname === '/app.css') {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
    return fs.createReadStream(path.join(root, 'app.css')).pipe(res);
  }
  if (req.method === 'POST' && url.pathname === '/api/track') { try { const { event } = await readBody(req); const allowed = new Set(['page_view','intent_selected','live_demo_started','generation_started','generation_succeeded','generation_failed','project_saved','project_opened','draft_edited','draft_shared','draft_exported','result_tab_used','membership_checkout_started']); if (!allowed.has(event)) return send(res,400,{error:'Unknown event'}); const file=path.join(__dirname,'metrics.json'); let metrics={}; try{metrics=JSON.parse(fs.readFileSync(file,'utf8'))}catch{} const day=new Date().toISOString().slice(0,10); metrics[day] ||= {}; metrics[day][event]=(metrics[day][event]||0)+1; fs.writeFileSync(file,JSON.stringify(metrics,null,2)); return send(res,200,{ok:true}); } catch(error){ return send(res,400,{error:'Could not record event'}); } } if (req.method === 'GET' && url.pathname === '/api/metrics') { if (process.env.NODE_ENV === 'production' && (!process.env.METRICS_TOKEN || req.headers.authorization !== 'Bearer ' + process.env.METRICS_TOKEN)) return send(res, 401, { error: 'Unauthorized' }); try { return send(res,200,JSON.parse(fs.readFileSync(path.join(__dirname,'metrics.json'),'utf8'))); } catch { return send(res,200,{}); } }
  if (req.method === 'POST' && url.pathname === '/api/generate') {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const clientKey = forwardedFor || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (generationRequests.get(clientKey) || []).filter(time => now - time < 60 * 60 * 1000);
    if (recent.length >= 10) return send(res, 429, { error: 'You have reached the demo limit of 10 generations per hour. Please try again later.' });
    recent.push(now);
    generationRequests.set(clientKey, recent);
    if (generationRequests.size > 5000) { for (const [key, times] of generationRequests) if (!times.some(time => now - time < 60 * 60 * 1000)) generationRequests.delete(key); }
    if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: 'AI generation is not configured yet. Please try again later.' });
    try {
      const input = await readBody(req);
      const audience = String(input.audience || '').trim().slice(0, 180);
      const topic = String(input.topic || '').trim().slice(0, 500);
      const angle = String(input.angle || '').trim().slice(0, 300);
      const format = String(input.format || 'Practical guide').slice(0, 60);
      const level = String(input.level || 'beginner').slice(0, 40);
      if (!audience || !topic) return send(res, 400, { error: 'Add an audience and a topic to continue.' });
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          instructions: `You are Mayia, an expert digital-product strategist and clear, practical copywriter. Create a genuinely useful, specific first draft for a small digital product. Do not make unsupported promises or invent credentials. Return only a JSON object with these keys: product (short compelling name), positioning (one sentence), format, level, audience, topic, angle, price (a reasonable suggested USD range), sections (array of exactly five objects with title and description), salesCopy (a complete, ready-to-edit sales page in plain text with headline, problem, product introduction, benefits, what's included, and call to action), launchSteps (array of five short, actionable launch tasks, one per day), transformation (one concise outcome), whyItWorks (one concise rationale), bonus (one practical bonus idea). Make every section and copy specific to the audience and topic. Keep the language friendly and concrete.`,
          input: `Audience: ${audience}\nTopic or result: ${topic}\nUnique angle: ${angle || 'Not provided; propose a useful angle'}\nRequested format: ${format}\nAudience experience level: ${level}`,
          text: { format: { type: 'json_object' } }, max_output_tokens: 1800
        })
      });
      const data = await response.json();
      if (!response.ok) return send(res, response.status === 401 ? 401 : 502, { error: data?.error?.message || 'The AI request failed. Check your API key and account billing.' });
      const text = (data.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n');
      let product;
      try { product = JSON.parse(text); } catch { return send(res, 502, { error: 'The AI returned an unreadable response. Please try again.' }); }
      if (!product.product || !Array.isArray(product.sections) || !Array.isArray(product.launchSteps)) return send(res, 502, { error: 'The AI response was incomplete. Please try again.' });
      return send(res, 200, { product, usage: data.usage || null, model });
    } catch (error) { return send(res, 500, { error: error.message || 'Could not reach the AI service. Please try again.' }); }
  }
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(302, { Location: '/digital', 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (req.method === 'GET' && ['/digital', '/digital/', '/index.html'].includes(url.pathname)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return fs.createReadStream(path.join(root, 'index.html')).pipe(res);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found');
});
server.listen(port, host, () => console.log("Mayia is listening on " + host + ":" + port + " (model: " + model + ")"));


