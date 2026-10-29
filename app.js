(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const form = $('#ideaForm');
  const results = $('#results');
  const STORE = 'mayia.studio.v1';
  let output = null;
  let active = 'concept';
  let editTarget = '';
  let demoMode = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const titleCase = value => String(value || '').replace(/\b\w/g, char => char.toUpperCase());
  const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{"saved":[],"history":[]}'); } catch { return { saved: [], history: [] }; } };
  const writeStore = data => { try { localStorage.setItem(STORE, JSON.stringify(data)); return true; } catch { showToast('Browser storage is full. Export your draft to keep a copy.'); return false; } };
  function trackEvent(event) { fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }), keepalive: true }).catch(() => {}); }
  function showToast(message = 'Done') { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 1900); }
  function fullText() {
    if (!output) return '';
    return ['MAYIA PRODUCT BLUEPRINT', '', output.product, '', output.positioning, 'Suggested price: ' + (output.price || 'Review and set your price'), '', 'CONTENT OUTLINE', ...(output.sections || []).map((section, index) => `${index + 1}. ${section.title}\n   ${section.description || ''}`), '', 'SALES PAGE', output.salesCopy || '', '', 'LAUNCH PLAN', ...(output.launchSteps || []).map((task, index) => `${index + 1}. ${task}`), '', `AUDIENCE: ${output.audience || ''}`, `TOPIC: ${output.topic || ''}`].join('\n');
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch { const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); }
    showToast('Copied to clipboard');
  }
  function rememberOutput(isSaved = false) {
    const data = readStore();
    const item = { ...output, id: output.id || `${Date.now()}`, updatedAt: new Date().toISOString() };
    output.id = item.id;
    data.history = [item, ...data.history.filter(row => row.id !== item.id)].slice(0, 12);
    if (isSaved) data.saved = [item, ...data.saved.filter(row => row.id !== item.id)].slice(0, 30);
    writeStore(data);
  }
  function saveCurrent() { if (!output) return; rememberOutput(true); trackEvent('project_saved'); showToast('Project saved on this device'); }
  function generatedDraft(audience, topic, angle, format, level, sample = false) {
    const subject = topic.replace(/[.!?]+$/, '');
    const safeAudience = audience.trim();
    const sections = level === 'beginner'
      ? ['Choose one clear first win', 'Learn the few essentials that matter', 'Follow a simple step-by-step method', 'Practice with a guided example', 'Keep going with a 30-day plan']
      : level === 'intermediate'
        ? ['Find the bottleneck', 'Build a repeatable system', 'Work in focused sprints', 'Solve common sticking points', 'Review and improve your process']
        : ['Set strategy and constraints', 'Design a high-leverage workflow', 'Apply advanced decision rules', 'Diagnose and optimize', 'Plan the next 90 days'];
    return {
      id: `${Date.now()}`, product: sample ? 'The Calm First Garden' : `The ${titleCase(subject.split(' ').slice(0, 5).join(' '))} ${format === 'Template kit' ? 'Toolkit' : format}`,
      positioning: sample ? 'A friendly starter guide for apartment dwellers who want to grow three forgiving herbs on a sunny windowsill.' : angle ? `A practical ${format.toLowerCase()} built around ${angle.trim()}, designed to help ${safeAudience} make a clear first step with ${subject}.` : `A practical ${format.toLowerCase()} to help ${safeAudience} make a clear first step with ${subject}.`,
      format, level, audience: sample ? 'beginner apartment gardeners' : safeAudience, topic: sample ? 'growing a few useful herbs indoors' : subject, angle: sample ? 'start small with three easy herbs' : angle.trim(), price: format === 'Mini-course' ? '$39–$79' : format === 'Template kit' ? '$19–$39' : format === 'Planner' ? '$12–$29' : '$19–$49',
      sections: sections.map((title, index) => ({ title, description: [`Define what a useful first result looks like for ${safeAudience}.`, `Focus on the essentials that help with ${subject}.`, 'Use a short sequence with examples and room to take action.', 'Apply the method to a realistic situation and make a first draft.', 'Create a light weekly rhythm and review what is working.'][index] })),
      salesCopy: `${sample ? 'THE CALM FIRST GARDEN' : titleCase(subject)}\nA practical ${format.toLowerCase()} for ${safeAudience}.\n\nStart with one clear, manageable step. This guide helps you understand the essentials, put them into practice, and build a simple routine that fits your life.\n\nWHAT'S INSIDE\n${sections.map((section, index) => `${index + 1}. ${section}`).join('\n')}\n\nMade for ${safeAudience}. Review the contents and adjust this draft so it accurately reflects what your product includes.\n\nGet started with a small first step today.`,
      launchSteps: ['Ask a few people in your audience about their current challenge.', 'Choose one clear result and finish the smallest useful version.', 'Share a preview and invite specific feedback.', 'Improve unclear parts and check every factual claim.', 'Publish the offer and keep learning from real questions.'],
      demo: sample
    };
  }
  function render() {
    if (!output) return;
    const tabs = [['concept', 'Overview'], ['outline', 'Content outline'], ['sales', 'Sales page'], ['launch', 'Launch plan']];
    results.innerHTML = `<div class="resulttop"><h2>Your product blueprint${demoMode ? ' <span class="badge">Interactive sample</span>' : ''}</h2><div class="actions"><button class="smallbtn" type="button" data-action="save">Save project</button><button class="smallbtn" type="button" data-action="share">Share</button><button class="smallbtn" type="button" data-action="copy">Copy all</button><button class="smallbtn" type="button" data-action="export">Export .txt</button></div></div><nav class="tabs" aria-label="Blueprint sections">${tabs.map(([id, label]) => `<button class="tab ${active === id ? 'active' : ''}" type="button" data-tab="${id}" aria-current="${active === id ? 'page' : 'false'}">${label}</button>`).join('')}</nav><div class="content">${panel()}</div>`;
    $$('[data-tab]', results).forEach(button => button.addEventListener('click', () => { active = button.dataset.tab; trackEvent('result_tab_used'); render(); }));
    $('[data-action="save"]', results).addEventListener('click', saveCurrent);
    $('[data-action="copy"]', results).addEventListener('click', () => copy(fullText()));
    $('[data-action="export"]', results).addEventListener('click', download);
    $('[data-action="share"]', results).addEventListener('click', share);
    const edit = $('[data-action="edit-sales"]', results);
    if (edit) edit.addEventListener('click', () => openEditor('salesCopy', 'Edit your sales page', output.salesCopy || ''));
    $$('[data-copy]', results).forEach(button => button.addEventListener('click', () => copy(button.dataset.copy === 'sales' ? output.salesCopy : fullText())));
    if (!demoMode) rememberOutput();
  }
  function panel() {
    const item = output;
    if (active === 'concept') return `<h2 class="product-name">${esc(item.product)}</h2><p class="tagline">${esc(item.positioning)}</p><div class="badges"><span class="badge">${esc(item.format)}</span><span class="badge purple">${esc(titleCase(item.level))} friendly</span><span class="badge">${esc(item.price || 'Set your price')} suggested price</span></div><div class="section"><h3>The transformation</h3><div class="box">Help <b>${esc(item.audience)}</b> make practical progress on <b>${esc(item.topic)}</b>${item.angle ? `, using the angle <b>${esc(item.angle)}</b>` : ''}. Adapt this promise to what your finished product can genuinely deliver.</div></div><div class="section"><h3>Suggested first step</h3><div class="box">Talk with a few people in your audience, check that this problem matters to them, then make the smallest useful version and improve it from their feedback.</div></div>`;
    if (active === 'outline') return `<h2 class="product-name">Your content outline</h2><p class="tagline">A focused structure for your ${esc((item.format || 'guide').toLowerCase())}.</p><div class="outline-list">${(item.sections || []).map((section, index) => `<div class="outline-item"><div class="number">0${index + 1}</div><div><strong>${esc(section.title)}</strong><span>${esc(section.description)}</span></div></div>`).join('')}</div><div class="section"><h3>Bonus idea</h3><div class="box">Add a one-page quick-start checklist that helps readers take a first action in about 15 minutes.</div></div>`;
    if (active === 'sales') return `<h2 class="product-name">Sales page starter</h2><p class="tagline">A complete first draft to edit into your own voice.</p><div class="result-actions" style="margin-bottom:12px"><button type="button" data-action="edit-sales">Edit sales page</button><button type="button" data-copy="sales">Copy sales page</button></div><div class="box copybox"><div class="copytext">${esc(item.salesCopy || `${item.product}\n\n${item.positioning}`)}</div></div>`;
    return `<h2 class="product-name">A simple launch plan</h2><p class="tagline">Five practical steps to prepare and learn from your first launch.</p><div class="checklist">${(item.launchSteps || []).map((task, index) => `<label class="outline-item check"><input type="checkbox"><span><strong>Step ${index + 1}</strong>${esc(task)}</span></label>`).join('')}</div><div class="section"><h3>Keep it grounded</h3><div class="box">Check demand with real people and make sure the offer matches the product you have built.</div></div>`;
  }
  function download() { trackEvent('draft_exported'); const url = URL.createObjectURL(new Blob([fullText()], { type: 'text/plain' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'mayia-product-blueprint.txt'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  async function share() {
    trackEvent('draft_shared');
    if (navigator.share) { try { await navigator.share({ title: output.product, text: fullText() }); return; } catch (error) { if (error.name === 'AbortError') return; } }
    await copy(fullText());
  }
  function openEditor(target, title, value) { editTarget = target; $('#editTextTitle').textContent = title; $('#editTextHint').textContent = 'Your changes are saved with this project on this device.'; $('#editTextArea').value = value; $('#editTextModal').classList.add('open'); $('#editTextArea').focus(); }
  function closeModal(id) { $(`#${id}`).classList.remove('open'); }
  function openProjects() {
    const data = readStore();
    const items = [...data.saved.map(item => ({ ...item, kind: 'Saved project' })), ...data.history.filter(item => !data.saved.some(saved => saved.id === item.id)).slice(0, 6).map(item => ({ ...item, kind: 'Recent draft' }))];
    const list = $('#projectsList');
    list.innerHTML = items.length ? items.map(item => `<article class="outline-item project-row"><div><span class="badge">${esc(item.kind)}</span><strong>${esc(item.product)}</strong><span>${esc(item.audience)} · ${new Date(item.updatedAt).toLocaleDateString()}</span></div><button type="button" class="smallbtn" data-open-project="${esc(item.id)}">Open</button></article>`).join('') : '<div class="empty"><div><div class="emptyicon">✧</div><h2>No saved projects yet</h2><p>Generate a blueprint, then choose Save project. It stays in this browser.</p></div></div>';
    $$('.project-row [data-open-project]', list).forEach(button => button.addEventListener('click', () => { const picked = items.find(item => item.id === button.dataset.openProject); if (!picked) return; output = { ...picked }; demoMode = Boolean(output.demo); active = 'concept'; render(); closeModal('projectsModal'); trackEvent('project_opened'); results.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    $('#projectsModal').classList.add('open');
  }
  $('#demoBtn').addEventListener('click', () => {
    $('#audience').value = 'beginner apartment gardeners'; $('#topic').value = 'growing a few useful herbs indoors'; $('#strength').value = 'start small with three easy herbs'; $('#format').value = 'Guide'; $('#level').value = 'beginner';
    output = generatedDraft('beginner apartment gardeners', 'growing a few useful herbs indoors', 'start small with three easy herbs', 'Guide', 'beginner', true); active = 'concept'; demoMode = true; render(); trackEvent('live_demo_started'); if (innerWidth < 850) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#clearForm').addEventListener('click', () => { form.reset(); $$('.intentchips button').forEach(button => { button.classList.remove('selected'); button.setAttribute('aria-pressed', 'false'); }); $('#audience').focus(); showToast('Form cleared'); });
  $('#openProjects').addEventListener('click', openProjects);
  $('#closeProjects').addEventListener('click', () => closeModal('projectsModal'));
  $('#cancelEdit').addEventListener('click', () => closeModal('editTextModal'));
  $('#applyEdit').addEventListener('click', () => { if (output && editTarget) { output[editTarget] = $('#editTextArea').value; demoMode = false; rememberOutput(); render(); closeModal('editTextModal'); showToast('Edit saved'); } });
  const membershipToggle = $('#membershipToggle');
  const membershipMenu = $('#membershipMenu');
  membershipToggle.addEventListener('click', () => { const isOpen = membershipToggle.getAttribute('aria-expanded') === 'true'; membershipToggle.setAttribute('aria-expanded', String(!isOpen)); membershipMenu.hidden = isOpen; });
  membershipMenu.addEventListener('click', event => { if (event.target.closest('a')) { membershipToggle.setAttribute('aria-expanded', 'false'); membershipMenu.hidden = true; } });
  document.addEventListener('click', event => { if (!event.target.closest('.membership-menu')) { membershipToggle.setAttribute('aria-expanded', 'false'); membershipMenu.hidden = true; } });
  ['editTextModal', 'projectsModal'].forEach(id => $(`#${id}`).addEventListener('click', event => { if (event.target.id === id) closeModal(id); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { ['editTextModal', 'projectsModal'].forEach(closeModal); membershipToggle.setAttribute('aria-expanded', 'false'); membershipMenu.hidden = true; membershipToggle.focus(); } });
  $$('.intentchips button').forEach(button => button.addEventListener('click', () => {
    $$('.intentchips button').forEach(choice => { choice.classList.remove('selected'); choice.setAttribute('aria-pressed', 'false'); }); button.classList.add('selected'); button.setAttribute('aria-pressed', 'true');
    const presets = { skill: ['people learning a skill', 'turning a skill into a clear step-by-step method', 'Workbook'], template: ['small business owners', 'a reusable system that saves time every week', 'Template kit'], guide: ['curious beginners', 'a practical guide to getting started with confidence', 'Guide'], idea: ['a specific group you understand', 'a problem you can help them solve in a practical way', 'Mini-course'] };
    const [audience, topic, format] = presets[button.dataset.intent]; $('#audience').value = audience; $('#topic').value = topic; $('#format').value = format; $('#audience').focus(); trackEvent('intent_selected');
  }));
  form.addEventListener('submit', async event => {
    event.preventDefault(); const audience = $('#audience').value.trim(), topic = $('#topic').value.trim();
    if (!audience || !topic) return;
    const button = $('.generate', form); const original = button.innerHTML; button.innerHTML = '<span class="spinner"></span>Building your blueprint…'; button.disabled = true; results.classList.add('loading'); trackEvent('generation_started');
    try {
      const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audience, topic, angle: $('#strength').value, format: $('#format').value, level: $('#level').value }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Mayia could not generate that draft. Please try again.');
      output = data.product; output.id = `${Date.now()}`; active = 'concept'; demoMode = false; rememberOutput(); render(); trackEvent('generation_succeeded'); if (innerWidth < 850) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      trackEvent('generation_failed'); results.innerHTML = `<div class="errorbox" role="alert"><strong>We couldn’t build that draft just now.</strong><br>${esc(error.message)}<br><br>Your form is still here. Check the connection and try again.</div><div class="empty"><div><div class="emptyicon">↻</div><h2>Ready when you are</h2><p>You can still explore the interactive sample while AI generation is unavailable.</p><div style="margin-top:18px"><button type="button" class="smallbtn" onclick="document.querySelector('#demoBtn').click()">Open sample blueprint</button></div></div></div>`;
    } finally { button.innerHTML = original; button.disabled = false; results.classList.remove('loading'); }
  });
  const billingMessage = $('#billingMessage');
  const membershipMenuNote = $('#membershipMenuNote');
  const checkoutButtons = $$('[data-plan]');
  const currencyButtons = $$('[data-currency]');
  const currencyNote = $('#currencyNote');
  let billingData = { plans: {}, amounts: {} };
  let selectedCurrency = 'INR';
  const periods = { weekly: '/ week', monthly: '/ month', studio: '/ month', annual: '/ year' };
  function renderCurrency() {
    const values = billingData.amounts?.[selectedCurrency] || {};
    const symbol = selectedCurrency === 'INR' ? '₹' : '$';
    const locale = selectedCurrency === 'INR' ? 'en-IN' : 'en-US';
    for (const id of Object.keys(periods)) {
      const amount = Number(values[id]) || 0;
      const price = document.querySelector(`[data-price="${id}"]`);
      if (price && amount > 0) price.innerHTML = `${symbol}${amount.toLocaleString(locale)} <small>${price.dataset.period || periods[id]}</small>`;
      const menuPrice = document.querySelector(`[data-menu-price="${id}"]`);
      if (menuPrice && amount > 0) menuPrice.innerHTML = `${symbol}${amount.toLocaleString(locale)} <small>${periods[id]}</small>`;
    }
    $$('.membership-option strong').forEach((node, index) => {
      const id = Object.keys(periods)[index]; const amount = Number(values[id]) || 0;
      if (amount > 0) node.innerHTML = `${symbol}${amount.toLocaleString(locale)} <small>${periods[id]}</small>`;
    });
    currencyButtons.forEach(button => {
      const chosen = button.dataset.currency === selectedCurrency;
      button.classList.toggle('selected', chosen); button.setAttribute('aria-pressed', String(chosen));
    });
    currencyNote.textContent = selectedCurrency === 'INR'
      ? 'Indian payment option selected. UPI and domestic methods are charged in INR.'
      : 'International payment option selected. International checkout is charged in USD; available payment methods depend on Cashfree account activation.';
    checkoutButtons.forEach(button => {
      const enabled = Boolean(billingData.plans?.[selectedCurrency]?.[button.dataset.plan]);
      button.disabled = !enabled;
      button.textContent = enabled ? `Continue with Cashfree · ${selectedCurrency}` : 'Checkout setup pending';
    });
  }
  currencyButtons.forEach(button => button.addEventListener('click', () => {
    selectedCurrency = button.dataset.currency;
    renderCurrency();
  }));
  async function loadBillingStatus() {
    try {
      const response = await fetch('/api/billing/status', { cache: 'no-store' });
      billingData = await response.json();
      renderCurrency();
      const hasPlans = Object.values(billingData.plans?.INR || {}).some(Boolean) || Object.values(billingData.plans?.USD || {}).some(Boolean);
      if (hasPlans && billingData.environment === 'sandbox') {
        billingMessage.textContent = 'Cashfree sandbox subscriptions are enabled. Sandbox payments do not charge customers; verify each currency and plan before switching to production.';
        membershipMenuNote.textContent = 'Cashfree sandbox checkout is enabled. No real payments are collected.';
      } else if (hasPlans) {
        billingMessage.textContent = 'Cashfree processes your selected currency securely. Review the final amount and payment method in checkout before authorizing.';
        membershipMenuNote.textContent = 'Secure checkout is handled by Cashfree.';
      } else {
        billingMessage.textContent = 'Cashfree checkout is not active yet. Free beta remains open; paid checkout starts after your Cashfree currencies and credentials are configured.';
        membershipMenuNote.textContent = 'Cashfree checkout setup is pending.';
      }
    } catch {
      billingMessage.textContent = 'Membership checkout is temporarily unavailable. The free Mayia studio is available now.';
    }
  }
  checkoutButtons.forEach(button => button.addEventListener('click', async () => {
    const name = prompt('Your name for Cashfree checkout:');
    if (!name) return;
    const email = prompt('Your email address:');
    if (!email) return;
    const phone = prompt('Your 10-digit Indian mobile number:');
    if (!phone) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Opening secure checkout…';
    trackEvent('membership_checkout_started');
    try {
      const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: button.dataset.plan, currency: selectedCurrency, customer: { name, email, phone } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start secure checkout.');
      if (!window.Cashfree) throw new Error('Cashfree checkout could not load. Refresh and try again.');
      const cashfree = Cashfree({ mode: data.environment });
      await cashfree.checkout({ subscriptionSessionId: data.subscriptionSessionId, redirectTarget: '_self' });
    } catch (error) {
      showToast(error.message || 'Checkout is unavailable. Please try again.');
      button.disabled = false;
      button.textContent = original;
    }
  }));
  const checkoutReturn = new URLSearchParams(location.search).get('checkout');
  if (checkoutReturn === 'return') {
    showToast('You returned from Cashfree. Your subscription authorization may still be pending.');
    const cleanUrl = new URL(location.href);
    ['checkout', 'status', 'payment_id', 'subscription_id', 'email', 'ba_token', 'token', 'PayerID'].forEach(key => cleanUrl.searchParams.delete(key));
    history.replaceState({}, '', cleanUrl);
  } else if (checkoutReturn === 'cancelled') {
    showToast('Checkout was cancelled. No membership payment was completed.');
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete('checkout');
    history.replaceState({}, '', cleanUrl);
  }
  loadBillingStatus();
  trackEvent('page_view');
})();

