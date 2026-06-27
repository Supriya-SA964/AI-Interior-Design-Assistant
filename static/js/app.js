// ===== AI Interior Design Assistant - app.js =====

let selectedFile    = null;
let analysisData    = null;
let selectedBudget  = 'medium';
let savedFilename   = '';       // stored after first upload
let savedImageUrl   = '';       // original before-image URL

const ITEM_ICONS = {
  'Bed':'🛏️','Window':'🪟','Door':'🚪','Wardrobe':'🗄️',
  'TV':'📺','Chair':'🪑','Table':'🪵','Sofa':'🛋️',
  'Lamp':'💡','Curtain':'🪟','Plant':'🪴','Desk':'📋'
};

// ===== PAGE SWITCHING =====
function showPage(pageName, clickedEl) {
  document.getElementById('page-upload').style.display    = 'none';
  document.getElementById('page-dashboard').style.display = 'none';
  if (pageName === 'upload') {
    document.getElementById('page-upload').style.display = 'block';
    document.getElementById('topbar-sub').textContent = 'Upload a room image to get started';
  } else {
    if (!analysisData) {
      document.getElementById('page-upload').style.display = 'block';
      setActiveNav(document.getElementById('nav-upload'));
      return;
    }
    document.getElementById('page-dashboard').style.display = 'block';
    document.getElementById('topbar-sub').textContent = 'Your AI Interior Design Results';
  }
  if (clickedEl) setActiveNav(clickedEl);
}

function setActiveNav(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
}

// ===== BUDGET SELECTOR on upload page =====
function selectBudget(tier) {
  selectedBudget = tier;
  document.querySelectorAll('.budget-select-btn').forEach(b => b.classList.remove('active-budget'));
  const btn = document.getElementById('bsel-' + tier);
  if (btn) btn.classList.add('active-budget');
}

// ===== BUDGET SWITCH on dashboard — RE-ANALYSE EVERYTHING =====
async function switchDashboardBudget(tier) {
  if (tier === selectedBudget && analysisData) return; // nothing changed

  selectedBudget = tier;

  // Highlight active tab
  document.querySelectorAll('.dash-budget-btn').forEach(b => b.classList.remove('active-dash-budget'));
  const activeBtn = document.getElementById('dbtn-' + tier);
  if (activeBtn) activeBtn.classList.add('active-dash-budget');

  if (!savedFilename) return;

  // Show loading overlay
  const overlay = document.getElementById('loading-overlay');
  overlay.style.display = 'flex';
  document.getElementById('loading-msg').textContent =
    'Rebuilding design for ' + tier + ' budget…';

  const steps = ['ls1','ls2','ls3','ls4'];
  steps.forEach(id => document.getElementById(id).classList.remove('active','done'));
  document.getElementById('ls1').classList.add('active');
  let idx = 0;
  const msgs = [
    'Applying ' + tier + ' budget rules…',
    'Selecting colours & materials…',
    'Generating new AI room image…',
    'Recalculating budget…'
  ];
  const stepTimer = setInterval(() => {
    if (idx < steps.length - 1) {
      document.getElementById(steps[idx]).classList.remove('active');
      document.getElementById(steps[idx]).classList.add('done');
      idx++;
      document.getElementById(steps[idx]).classList.add('active');
      document.getElementById('loading-msg').textContent = msgs[idx];
    }
  }, 2000);

  try {
    // Call /reanalyze — no image re-upload, just re-compute with new budget
    const res  = await fetch('/reanalyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename:  savedFilename,
        budget:    tier,
        image_url: savedImageUrl
      })
    });
    const data = await res.json();
    if (data.error) { throw new Error(data.error); }

    analysisData = data;

    // Generate new After image with Pollinations in browser
    document.getElementById('loading-msg').textContent = 'Generating AI redesigned image…';
    const afterUrl = await generateAfterImage(data.image_prompt);
    data.after_image_url = afterUrl;

    clearInterval(stepTimer);
    steps.forEach(id => {
      document.getElementById(id).classList.remove('active');
      document.getElementById(id).classList.add('done');
    });

    setTimeout(() => {
      overlay.style.display = 'none';
      renderResults(data);
    }, 300);

  } catch (err) {
    clearInterval(stepTimer);
    overlay.style.display = 'none';
    console.error(err);
    alert('Failed to switch budget. Please try again.');
  }
}

// ===== FILE HANDLING =====
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && isValid(file)) handleFile(file);
  else alert('Please upload a JPG, PNG, or WEBP image.');
}
function handleFileInput(input) {
  if (input.files[0] && isValid(input.files[0])) handleFile(input.files[0]);
}
function isValid(file) {
  return ['image/jpeg','image/png','image/webp'].includes(file.type);
}
function handleFile(file) {
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('preview-img').src = e.target.result;
    document.getElementById('drop-inner').style.display   = 'none';
    document.getElementById('preview-wrap').style.display = 'block';
    document.getElementById('btn-analyse').disabled       = false;
  };
  reader.readAsDataURL(file);
}
function removeFile() {
  selectedFile = null;
  document.getElementById('file-input').value           = '';
  document.getElementById('preview-wrap').style.display = 'none';
  document.getElementById('drop-inner').style.display   = 'block';
  document.getElementById('btn-analyse').disabled       = true;
}

// ===== ANALYSE (first time) =====
async function runAnalysis() {
  if (!selectedFile) return;

  const overlay = document.getElementById('loading-overlay');
  overlay.style.display = 'flex';

  const steps = ['ls1','ls2','ls3','ls4'];
  steps.forEach(id => document.getElementById(id).classList.remove('active','done'));
  document.getElementById('ls1').classList.add('active');
  let idx = 0;
  const msgs = [
    'Detecting room structure & furniture…',
    'Applying ' + selectedBudget + ' budget design rules…',
    'Generating AI redesigned image…',
    'Calculating budget estimate…'
  ];
  document.getElementById('loading-msg').textContent = msgs[0];

  const stepTimer = setInterval(() => {
    if (idx < steps.length - 1) {
      document.getElementById(steps[idx]).classList.remove('active');
      document.getElementById(steps[idx]).classList.add('done');
      idx++;
      document.getElementById(steps[idx]).classList.add('active');
      document.getElementById('loading-msg').textContent = msgs[idx];
    }
  }, 2500);

  const formData = new FormData();
  formData.append('image',  selectedFile);
  formData.append('budget', selectedBudget);

  try {
    const res  = await fetch('/analyze', { method:'POST', body: formData });
    const data = await res.json();
    if (data.error) { throw new Error(data.error); }

    // Save filename & URL for budget switching later
    savedImageUrl = data.image_url;
    const parts   = data.image_url.split('/');
    savedFilename = parts[parts.length - 1];

    analysisData = data;

    // Generate After image in browser via Pollinations (free)
    document.getElementById('loading-msg').textContent = 'Generating AI redesigned room…';
    const afterUrl = await generateAfterImage(data.image_prompt);
    data.after_image_url = afterUrl;

    clearInterval(stepTimer);
    steps.forEach(id => {
      document.getElementById(id).classList.remove('active');
      document.getElementById(id).classList.add('done');
    });

    setTimeout(() => {
      overlay.style.display = 'none';
      renderResults(data);
      showPage('dashboard', document.getElementById('nav-dashboard'));
      // Sync dashboard budget buttons
      document.querySelectorAll('.dash-budget-btn').forEach(b => b.classList.remove('active-dash-budget'));
      const db = document.getElementById('dbtn-' + selectedBudget);
      if (db) db.classList.add('active-dash-budget');
      window.scrollTo({ top:0, behavior:'smooth' });
    }, 400);

  } catch (err) {
    clearInterval(stepTimer);
    overlay.style.display = 'none';
    console.error(err);
    alert('Error: ' + err.message);
  }
}

// ===== POLLINATIONS — browser-side image generation (FREE) =====
function generateAfterImage(prompt) {
  return new Promise((resolve) => {
    // Add seed so each budget tier gives a different image
    const seed    = Math.floor(Math.random() * 999999);
    const encoded = encodeURIComponent(prompt);
    const url     = `https://image.pollinations.ai/prompt/${encoded}?width=800&height=600&nologo=true&enhance=true&seed=${seed}`;

    const img     = new Image();
    img.crossOrigin = 'anonymous';

    const timeout = setTimeout(() => resolve(''), 90000); // 90s timeout

    img.onload  = () => { clearTimeout(timeout); resolve(url); };
    img.onerror = () => { clearTimeout(timeout); resolve(''); };
    img.src = url;
  });
}

// ===== RENDER RESULTS =====
function renderResults(data) {
  document.getElementById('topbar-sub').textContent = 'Your AI Interior Design Results';

  // Budget tier badge
  const tierColors  = { low:'#2e7d32', medium:'#e65100', high:'#6a1b9a' };
  const tierLabels  = { low:'💚 Low Budget', medium:'💛 Medium Budget', high:'💎 Premium Budget' };
  const tier        = data.budget_tier || 'medium';
  const badge       = document.getElementById('budget-tier-badge');
  if (badge) {
    badge.textContent = tierLabels[tier];
    badge.style.color = tierColors[tier];
  }

  // Before image (always the original upload)
  document.getElementById('before-img').src = data.image_url;

  // After image — real Pollinations OR fallback visual
  const afterWrap   = document.getElementById('after-img-container');
  const afterVisual = document.getElementById('after-visual');
  const afterImg    = document.getElementById('after-img');

  if (data.after_image_url) {
    afterWrap.style.display   = 'block';
    afterVisual.style.display = 'none';
    afterImg.src = data.after_image_url;
    afterImg.onerror = () => {
      afterWrap.style.display   = 'none';
      afterVisual.style.display = 'block';
      applyVisualColor(data.wall_color_hex || '#6B9FD4');
    };
  } else {
    afterWrap.style.display   = 'none';
    afterVisual.style.display = 'block';
    applyVisualColor(data.wall_color_hex || '#6B9FD4');
  }

  renderDetectedItems(data.detected_items || {});
  renderSuggestions(data);
  renderBudget(data);
  renderBudgetOptions(data);
}

function applyVisualColor(hex) {
  const bg = document.getElementById('av-bg');
  if (bg) bg.style.background = `linear-gradient(160deg,${hex}cc,${hex}88)`;
  document.querySelectorAll('.av-curtain-left,.av-curtain-right')
    .forEach(c => { c.style.background = shadeColor(hex, -30); });
}

// ===== DETECTED ITEMS =====
function renderDetectedItems(items) {
  const order = ['Bed','Window','Door','Wardrobe','TV','Chair','Table','Sofa'];
  document.getElementById('detected-list').innerHTML = order.map(name => `
    <div class="det-item">
      <div class="det-left">
        <div class="det-icon">${ITEM_ICONS[name]||'📦'}</div>
        <span class="det-name">${name}</span>
      </div>
      <span class="det-count">${items[name] !== undefined ? items[name] : 0}</span>
    </div>`).join('');
}

// ===== DESIGN SUGGESTIONS =====
function renderSuggestions(data) {
  const items = [
    { icon:'🎨', label:'Wall Color',      value: data.wall_color      || '—' },
    { icon:'✨', label:'Theme',           value: data.theme           || '—' },
    { icon:'🪑', label:'Furniture Style', value: data.furniture_style || '—' },
    { icon:'💡', label:'Lighting',        value: data.lighting        || '—' },
    { icon:'🌿', label:'Decor',           value: data.decor           || '—' },
  ];
  document.getElementById('suggestions-list').innerHTML = items.map(i => `
    <div class="sug-item">
      <div class="sug-icon">${i.icon}</div>
      <span class="sug-label">${i.label}</span>
      <span class="sug-val">${i.value}</span>
    </div>`).join('');
}

// ===== BUDGET =====
function renderBudget(data) {
  const items = data.budget_items || [];
  document.getElementById('budget-tbody').innerHTML = items.map(i => `
    <tr>
      <td>${i.name}</td>
      <td style="text-align:right">₹ ${fmt(i.cost)}</td>
    </tr>`).join('');
  document.getElementById('budget-total').textContent = '₹ ' + fmt(data.budget_total || 0);
}

function renderBudgetOptions(data) {
  document.getElementById('bo-low').textContent =
    `₹ ${fmt(data.budget_low_min||25000)} – ₹ ${fmt(data.budget_low_max||35000)}`;
  document.getElementById('bo-mid').textContent =
    `₹ ${fmt(data.budget_mid_min||35000)} – ₹ ${fmt(data.budget_mid_max||60000)}`;
  document.getElementById('bo-premium').textContent =
    `₹ ${fmt(data.budget_premium_min||60000)}+`;
}

// ===== TOGGLE BEFORE/AFTER =====
let dimmed = false;
function toggleSlide() {
  const afterBox = document.querySelector('.ba-img-box:last-child');
  dimmed = !dimmed;
  afterBox.style.opacity = dimmed ? '0.3' : '1';
}

// ===== NEW DESIGN =====
function newDesign() {
  analysisData  = null;
  savedFilename = '';
  savedImageUrl = '';
  removeFile();
  selectBudget('medium');
  showPage('upload', document.getElementById('nav-upload'));
  window.scrollTo({ top:0, behavior:'smooth' });
  ['ls1','ls2','ls3','ls4'].forEach(id =>
    document.getElementById(id).classList.remove('active','done'));
}

// ===== HELPERS =====
function fmt(n) { return Number(n).toLocaleString('en-IN'); }
function shadeColor(hex, pct) {
  let num = parseInt(hex.replace('#',''), 16);
  let r   = Math.min(255, Math.max(0, (num>>16)       + pct));
  let g   = Math.min(255, Math.max(0, ((num>>8)&0xff) + pct));
  let b   = Math.min(255, Math.max(0, (num&0xff)      + pct));
  return `rgb(${r},${g},${b})`;
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  showPage('upload', document.getElementById('nav-upload'));
  selectBudget('medium');
});