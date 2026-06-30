// ═══════════════════════════════════════════════
//  AI Interior Design Assistant — app.js
//  BUG FIXES:
//  1. Stronger image prompt — output matches input room layout
//  2. Retry/regeneration now works reliably with fresh seeds
//  3. Furniture compatibility check with instant warning popup
// ═══════════════════════════════════════════════

// ── GLOBAL STATE ──────────────────────────────
const S = {
  file:          null,
  budget:        'medium',
  roomType:      'bedroom',
  filename:      '',
  imageUrl:      '',
  windowWall:    'back',
  doorWall:      'left',
  cameraAngle:   'corner',
  roomSize:      'medium',       // BUG 3 FIX: track room size for size warnings
  ceilingHeight: 'standard',
  floorMaterial: 'tile',
  currentUrl:    '',
  fallbackUrl:   '',
  hasResults:    false,
  lastData:      null,
  design: {
    wall_color:  '',
    furniture:   '',
    lighting:    '',
    curtains:    '',
    flooring:    '',
    decorations: [],
    theme:       '',
  },
};

const ROOM_ICONS  = {bedroom:'🛏️',living:'🛋️',kitchen:'🍳',dining:'🍽️',office:'💼',bathroom:'🚿'};
const ROOM_LABELS = {bedroom:'Bedroom',living:'Living Room',kitchen:'Kitchen',dining:'Dining Hall',office:'Office',bathroom:'Bathroom'};
const ITEM_ICONS  = {Bed:'🛏️',Window:'🪟',Door:'🚪',Wardrobe:'🗄️',TV:'📺',Chair:'🪑',Table:'🪵',Sofa:'🛋️'};
const BUDGET_LABELS = {low:'💚 Low Budget',medium:'💛 Medium Budget',premium:'💎 Premium Budget'};

// ── PAGE SWITCHING ────────────────────────────
function showPage(name, el) {
  ['upload','dashboard','design-ideas','budget','products','saved','about','contact'].forEach(p => {
    const pg = document.getElementById('page-' + p);
    if (pg) pg.style.display = 'none';
  });

  const subtitles = {
    'upload':       'Upload a room image to get started',
    'dashboard':    S.hasResults ? 'Your AI Interior Design Results' : 'Upload a room image first',
    'design-ideas': 'Explore design themes and inspirations',
    'budget':       'Budget planning for your interior project',
    'products':     'Recommended products and shopping links',
    'saved':        'Your saved designs',
    'about':        'About AI Interior Design Assistant',
    'contact':      'Get in touch with us',
  };
  document.getElementById('topbar-sub').textContent = subtitles[name] || '';
  setNav(el);

  if (name === 'dashboard' && !S.hasResults) {
    document.getElementById('page-upload').style.display = 'block';
    setNav(document.getElementById('nav-upload'));
    showToast('Please upload and analyse a room first!');
    return;
  }
  const pg = document.getElementById('page-' + name);
  if (pg) pg.style.display = 'block';
}

function setNav(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
}

// ── TOAST NOTIFICATION ────────────────────────
function showToast(msg, duration = 3500) {
  let toast = document.getElementById('toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-msg';
    toast.style.cssText = `
      position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
      background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:10px;
      font-size:13px;font-weight:500;z-index:9999;
      box-shadow:0 4px 20px rgba(0,0,0,.3);
      transition:opacity .3s;pointer-events:none;max-width:420px;text-align:center;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

// ═══════════════════════════════════════════════════════════════════
// BUG 3 FIX — COMPATIBILITY WARNING MODAL
// Shows immediately when user clicks incompatible furniture/color
// ═══════════════════════════════════════════════════════════════════
function showCompatWarning(data, onProceed) {
  // Remove any existing modal
  const existing = document.getElementById('compat-modal');
  if (existing) existing.remove();

  const isError = data.warning_type === 'incompatible';
  const modal   = document.createElement('div');
  modal.id      = 'compat-modal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:9998;
    background:rgba(0,0,0,.55);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;padding:20px;
  `;

  modal.innerHTML = `
    <div style="
      background:#fff;border-radius:16px;padding:28px 28px 22px;
      max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);
      border-top:4px solid ${isError ? '#e53935' : '#ff9800'};
    ">
      <div style="font-size:32px;margin-bottom:10px">${isError ? '🚫' : '📐'}</div>
      <h3 style="font-size:16px;font-weight:700;color:#1a1a2e;margin-bottom:8px">
        ${data.message}
      </h3>
      <p style="font-size:13px;color:#666;line-height:1.6;margin-bottom:18px">
        ${data.detail || data.message}
      </p>
      ${data.suggestion ? `
        <div style="background:#f8f9ff;border:1px solid #e8eaf0;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:12px;color:#555">
          💡 <b>Suggestion:</b> ${data.suggestion}
        </div>` : ''}
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="compat-cancel"
          style="background:#f5f6fa;color:#555;border:1px solid #ddd;border-radius:8px;
                 padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer">
          ✕ Cancel
        </button>
        ${!isError ? `
        <button id="compat-proceed"
          style="background:#ff9800;color:#fff;border:none;border-radius:8px;
                 padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer">
          ⚠️ Apply Anyway
        </button>` : ''}
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Cancel closes the modal without applying
  document.getElementById('compat-cancel').addEventListener('click', () => modal.remove());

  // Proceed applies despite warning (only shown for size warnings, not incompatible)
  const proceedBtn = document.getElementById('compat-proceed');
  if (proceedBtn) {
    proceedBtn.addEventListener('click', () => {
      modal.remove();
      if (onProceed) onProceed();
    });
  }

  // Click outside to close
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ── ROOM TYPE ─────────────────────────────────
function selectRoomType(type) {
  S.roomType = type;
  document.querySelectorAll('.rt-btn').forEach(b => b.classList.remove('active-rt'));
  const btn = document.getElementById('rt-' + type);
  if (btn) btn.classList.add('active-rt');
}

// ── BUDGET ────────────────────────────────────
function selectBudget(b) {
  S.budget = b;
  document.querySelectorAll('.budget-btn').forEach(el => el.classList.remove('active-budget'));
  const btn = document.getElementById('bsel-' + b);
  if (btn) btn.classList.add('active-budget');
}

// ── FILE HANDLING ─────────────────────────────
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && isValid(file)) setFile(file);
  else alert('Please upload JPG, PNG or WEBP.');
}
function handleFileInput(input) {
  if (input.files[0] && isValid(input.files[0])) setFile(input.files[0]);
}
function isValid(f) { return ['image/jpeg','image/png','image/webp'].includes(f.type); }
function setFile(file) {
  S.file = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('preview-img').src            = e.target.result;
    document.getElementById('drop-inner').style.display   = 'none';
    document.getElementById('preview-wrap').style.display = 'block';
    document.getElementById('btn-analyse').disabled       = false;
  };
  reader.readAsDataURL(file);
}
function removeFile() {
  S.file = null;
  document.getElementById('file-input').value            = '';
  document.getElementById('preview-wrap').style.display  = 'none';
  document.getElementById('drop-inner').style.display    = 'block';
  document.getElementById('btn-analyse').disabled        = true;
}

// ── ANALYSE ───────────────────────────────────
async function runAnalysis() {
  if (!S.file) return;
  showLoading('Analysing your room…', 'Starting AI pipeline…');
  animateSteps();

  const fd = new FormData();
  fd.append('image',     S.file);
  fd.append('budget',    S.budget);
  fd.append('room_type', S.roomType);

  try {
    const res  = await fetch('/analyze', { method:'POST', body: fd });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Analysis failed');

    S.filename      = data.filename;
    S.imageUrl      = data.image_url;
    S.roomType      = data.room_type || S.roomType;
    S.windowWall    = data.window_wall    || 'back';
    S.doorWall      = data.door_wall      || 'left';
    S.cameraAngle   = data.camera_angle   || 'corner';
    S.roomSize      = data.room_size      || 'medium';   // BUG 3 FIX
    S.ceilingHeight = data.ceiling_height || 'standard';
    S.floorMaterial = data.floor_material || 'tile';
    S.currentUrl    = data.after_image_url;
    S.fallbackUrl   = data.after_image_fallback || '';
    S.hasResults    = true;
    S.lastData      = data;

    if (data.wall_color)      S.design.wall_color  = data.wall_color;
    if (data.lighting)        S.design.lighting    = data.lighting;
    if (data.furniture_style) S.design.furniture   = data.furniture_style;

    hideLoading();
    renderAll(data);
    showPage('dashboard', document.getElementById('nav-dashboard'));

    document.querySelectorAll('.dash-budget-btn').forEach(b => b.classList.remove('active-dash'));
    const db = document.getElementById('dbtn-' + S.budget);
    if (db) db.classList.add('active-dash');

    window.scrollTo({ top:0, behavior:'smooth' });
  } catch(err) {
    hideLoading();
    alert('Error: ' + err.message);
    console.error(err);
  }
}

// ── RENDER ALL ────────────────────────────────
function renderAll(data) {
  const rt = data.room_type || S.roomType;
  document.getElementById('room-badge').textContent   = (ROOM_ICONS[rt]||'🏠') + ' ' + (ROOM_LABELS[rt]||rt);
  document.getElementById('budget-badge').textContent = BUDGET_LABELS[S.budget] || '💛 Medium';
  document.getElementById('before-img').src = data.image_url;

  if (data.room_observations) {
    document.getElementById('obs-note').textContent = '🔍 AI observed: ' + data.room_observations;
  }

  loadAfterImage(data.after_image_url, data.after_image_fallback);

  renderDetected(data.detected_items || {});
  renderSuggestions(data);
  renderBudget(data.budget_items || [], data.budget_total || 0);

  document.getElementById('bo-low').textContent  = '₹' + fmt(data.budget_low_min||25000)  + '–₹' + fmt(data.budget_low_max||35000);
  document.getElementById('bo-mid').textContent  = '₹' + fmt(data.budget_mid_min||35000)  + '–₹' + fmt(data.budget_mid_max||60000);
  document.getElementById('bo-prem').textContent = '₹' + fmt(data.budget_prem_min||60000) + '+';

  renderProducts(data.product_links || {});
  updateChips();

  renderDesignIdeasPage(data);
  renderBudgetPage(data);
  renderProductsPage(data.product_links || {});
}

// ═══════════════════════════════════════════════════════════════════
// BUG 2 FIX — AFTER IMAGE LOADER
// Two-stage fallback with proper retry (fresh seed each time).
// Stops showing "retry" forever — shows the fallback silently first.
// ═══════════════════════════════════════════════════════════════════
let _imageLoadTimer    = null;
let _fallbackAttempted = false;
let _retryCount        = 0;

function loadAfterImage(primaryUrl, fallbackUrl) {
  if (!primaryUrl) { showAfterError(); return; }

  S.currentUrl       = primaryUrl;
  S.fallbackUrl      = fallbackUrl || '';
  _fallbackAttempted = false;
  _retryCount        = 0;

  const afterImg     = document.getElementById('after-img');
  const afterLoading = document.getElementById('after-loading');
  const afterError   = document.getElementById('after-error');

  afterImg.style.display     = 'none';
  afterError.style.display   = 'none';
  afterLoading.style.display = 'flex';

  const hint = afterLoading.querySelector('.after-hint');
  if (hint) hint.textContent = 'Connecting to image generator…';

  attemptLoadImage(primaryUrl, fallbackUrl, false);
}

function attemptLoadImage(url, fallbackUrl, isFallback) {
  const afterImg     = document.getElementById('after-img');
  const afterLoading = document.getElementById('after-loading');
  const afterError   = document.getElementById('after-error');
  const hint         = afterLoading ? afterLoading.querySelector('.after-hint') : null;

  if (hint) {
    hint.textContent = isFallback
      ? 'Trying alternate model…'
      : 'Generating design (30–90s)…';
  }

  clearTimeout(_imageLoadTimer);
  const timeoutMs = isFallback ? 75000 : 100000;
  const img = new Image();

  _imageLoadTimer = setTimeout(() => {
    img.src = '';
    if (!isFallback && fallbackUrl && !_fallbackAttempted) {
      _fallbackAttempted = true;
      attemptLoadImage(fallbackUrl, '', true);
    } else {
      showAfterError();
    }
  }, timeoutMs);

  img.onload = () => {
    clearTimeout(_imageLoadTimer);
    afterImg.src               = url;
    afterImg.style.display     = 'block';
    afterLoading.style.display = 'none';
    afterError.style.display   = 'none';
    removeRegenOverlay();
    S.currentUrl = url;
  };

  img.onerror = () => {
    clearTimeout(_imageLoadTimer);
    if (!isFallback && fallbackUrl && !_fallbackAttempted) {
      _fallbackAttempted = true;
      attemptLoadImage(fallbackUrl, '', true);
    } else {
      // BUG 2 FIX: Auto-retry once with a fresh seed before showing error
      if (_retryCount < 1) {
        _retryCount++;
        const freshSeed  = Math.floor(Math.random() * 999999);
        const freshUrl   = S.currentUrl.replace(/&seed=\d+/, `&seed=${freshSeed}`);
        const freshFb    = S.fallbackUrl
          ? S.fallbackUrl.replace(/&seed=\d+/, `&seed=${freshSeed + 3}`)
          : '';
        _fallbackAttempted = false;
        S.currentUrl  = freshUrl;
        S.fallbackUrl = freshFb;
        const hint2 = afterLoading ? afterLoading.querySelector('.after-hint') : null;
        if (hint2) hint2.textContent = 'Auto-retrying with new seed…';
        attemptLoadImage(freshUrl, freshFb, false);
      } else {
        showAfterError();
      }
    }
  };

  img.src = url + (url.includes('?') ? '&' : '?') + `_cb=${Date.now()}`;
}

function showAfterError() {
  document.getElementById('after-loading').style.display = 'none';
  document.getElementById('after-img').style.display     = 'none';
  document.getElementById('after-error').style.display   = 'flex';
  removeRegenOverlay();
}

// BUG 2 FIX: retryImage generates a completely new seed each click
function retryImage() {
  _retryCount = 0;
  const freshSeed = Math.floor(Math.random() * 999999);

  // Replace or append seed param in both URLs
  const replaceSeed = (url, seed) => {
    if (!url) return '';
    return url.includes('seed=')
      ? url.replace(/seed=\d+/, `seed=${seed}`)
      : url + `&seed=${seed}`;
  };

  const freshPrimary  = replaceSeed(S.currentUrl,  freshSeed);
  const freshFallback = replaceSeed(S.fallbackUrl, freshSeed + 5);
  S.currentUrl  = freshPrimary;
  S.fallbackUrl = freshFallback;
  loadAfterImage(freshPrimary, freshFallback);
}

// ── DETECTED ITEMS ────────────────────────────
function renderDetected(items) {
  const order = ['Bed','Window','Door','Wardrobe','TV','Chair','Table','Sofa'];
  document.getElementById('detected-list').innerHTML = order.map(name => `
    <div class="det-row">
      <div class="det-left">
        <div class="det-icon">${ITEM_ICONS[name]||'📦'}</div>
        <span class="det-name">${name}</span>
      </div>
      <span class="det-count">${items[name] !== undefined ? items[name] : 0}</span>
    </div>`).join('');
}

// ── SUGGESTIONS ───────────────────────────────
function renderSuggestions(data) {
  const rows = [
    { icon:'🎨', label:'Wall Color',  val: data.wall_color      || '—' },
    { icon:'✨', label:'Theme',       val: data.theme           || '—' },
    { icon:'🪑', label:'Furniture',   val: data.furniture_style || '—' },
    { icon:'💡', label:'Lighting',    val: data.lighting        || '—' },
    { icon:'🌿', label:'Decor',       val: data.decor           || '—' },
  ];
  document.getElementById('suggestions-list').innerHTML = rows.map(r => `
    <div class="sug-row">
      <div class="sug-icon-wrap">${r.icon}</div>
      <div><div class="sug-label">${r.label}</div><div class="sug-val">${r.val}</div></div>
    </div>`).join('');
}

// ── BUDGET TABLE ──────────────────────────────
function renderBudget(items, total) {
  document.getElementById('budget-tbody').innerHTML = items.map(i =>
    `<tr><td>${i.name}</td><td>₹ ${fmt(i.cost)}</td></tr>`
  ).join('');
  document.getElementById('budget-total').textContent = '₹ ' + fmt(total);
}

// ── PRODUCTS ──────────────────────────────────
const PROD_ICONS = {
  'Asian Paints':'🎨','Berger Paints':'🖌️','IKEA India':'🛋️',
  'Pepperfry':'🪑','Urban Ladder':'🪵','Philips':'💡',
  'Havells':'🔦','Home Centre':'🏺',"D'Decor":'🖼️',
};
function renderProducts(links) {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  grid.innerHTML = Object.entries(links).map(([cat, items]) => `
    <div class="prod-col">
      <div class="prod-col-title">${cat}</div>
      <div class="prod-links">
        ${items.map(item => `
          <a href="${item.url}" target="_blank" class="prod-link">
            <span>${PROD_ICONS[item.name]||'🔗'}</span>
            <span>${item.name}</span>
          </a>`).join('')}
      </div>
    </div>`).join('');
}

// ── STATIC PAGES ──────────────────────────────
function renderDesignIdeasPage(data) {
  const el = document.getElementById('design-ideas-content');
  if (!el) return;
  const themes = [
    { name:'Modern Minimal', icon:'🏙️', desc:'Clean lines, neutral tones, functional furniture.' },
    { name:'Scandinavian',   icon:'❄️', desc:'Light woods, whites, cozy textures and simplicity.' },
    { name:'Luxury Classic', icon:'👑', desc:'Rich fabrics, gold accents, ornate details.' },
    { name:'Industrial',     icon:'⚙️', desc:'Raw materials, exposed brick, metal fixtures.' },
    { name:'Bohemian',       icon:'🌺', desc:'Colorful textiles, plants, eclectic decor.' },
    { name:'Traditional',    icon:'🏮', desc:'Warm wood tones, classic furniture, cultural motifs.' },
  ];
  el.innerHTML = `
    <h2 class="section-heading">Design Themes & Ideas</h2>
    ${data ? `<p style="color:#666;margin-bottom:16px">Based on your <b>${ROOM_LABELS[data.room_type]||'room'}</b> — AI suggests: <b>${data.theme||'Modern'}</b></p>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px">
      ${themes.map(t => `
        <div class="card" style="margin-bottom:0;text-align:center;padding:24px 16px;cursor:pointer;transition:transform .2s"
          onmouseenter="this.style.transform='translateY(-3px)'"
          onmouseleave="this.style.transform='translateY(0)'"
          onclick="applyThemeFromIdeas('${t.name}')">
          <div style="font-size:36px;margin-bottom:10px">${t.icon}</div>
          <div style="font-weight:700;font-size:14px;margin-bottom:6px">${t.name}</div>
          <div style="font-size:12px;color:#888">${t.desc}</div>
          <button style="margin-top:12px;background:#6c47ff;color:#fff;border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer">Apply Theme</button>
        </div>`).join('')}
    </div>`;
}

function applyThemeFromIdeas(themeName) {
  if (!S.hasResults) { showToast('Please analyse a room first!'); return; }
  S.design.theme = themeName;
  updateChips();
  showPage('dashboard', document.getElementById('nav-dashboard'));
  regenerate('theme', themeName);
}

function renderBudgetPage(data) {
  const el = document.getElementById('budget-page-content');
  if (!el) return;
  const tiers = [
    { key:'low',     icon:'💚', label:'Low Budget',     range:'₹25K – ₹35K', color:'#2e7d32', bg:'#e8f5e9',
      desc:'Basic and functional design. Simple materials, tube lighting, standard furniture.' },
    { key:'medium',  icon:'💛', label:'Medium Budget',  range:'₹35K – ₹60K', color:'#e65100', bg:'#fff8e1',
      desc:'Modern and comfortable. Solid wood furniture, LED lighting, quality finishing.' },
    { key:'premium', icon:'💎', label:'Premium Budget', range:'₹60K+',       color:'#6a1b9a', bg:'#ede7f6',
      desc:'Luxury and designer interiors. Premium materials, custom furniture, high-end decor.' },
  ];
  el.innerHTML = `
    <h2 class="section-heading">Budget Planning</h2>
    <div style="display:grid;gap:16px;margin-bottom:20px">
      ${tiers.map(t => `
        <div class="card" style="margin-bottom:0;border-left:4px solid ${t.color};cursor:pointer"
          onclick="switchBudget('${t.key}');showPage('dashboard',document.getElementById('nav-dashboard'))">
          <div style="display:flex;align-items:center;gap:16px">
            <div style="width:52px;height:52px;background:${t.bg};border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">${t.icon}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:15px;color:${t.color}">${t.label}</div>
              <div style="font-size:13px;font-weight:600;margin:2px 0">${t.range}</div>
              <div style="font-size:12px;color:#888">${t.desc}</div>
            </div>
            <div style="font-size:12px;color:#6c47ff;font-weight:600">Apply →</div>
          </div>
        </div>`).join('')}
    </div>
    ${data ? `
      <h2 class="section-heading">Current Estimate (${ROOM_LABELS[data.room_type]||'Room'} — ${data.budget_tier||S.budget})</h2>
      <div class="card" style="margin-bottom:0">
        <table class="budget-table">
          <thead><tr><th>Item</th><th>Estimated Cost (₹)</th></tr></thead>
          <tbody>${(data.budget_items||[]).map(i=>`<tr><td>${i.name}</td><td>₹ ${fmt(i.cost)}</td></tr>`).join('')}</tbody>
          <tfoot><tr class="total-row"><td>Total</td><td>₹ ${fmt(data.budget_total||0)}</td></tr></tfoot>
        </table>
      </div>` : '<p style="color:#888">Analyse a room to see budget breakdown.</p>'}
  `;
}

function renderProductsPage(links) {
  const el = document.getElementById('products-page-content');
  if (!el) return;
  el.innerHTML = `
    <h2 class="section-heading">Recommended Products & Brands</h2>
    <p style="color:#666;margin-bottom:18px">Shop from trusted Indian brands for your interior project.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px">
      ${Object.entries(links).map(([cat, items]) => `
        <div class="card" style="margin-bottom:0">
          <div style="font-weight:700;font-size:14px;margin-bottom:14px">${cat}</div>
          <div class="prod-links">
            ${items.map(item => `
              <a href="${item.url}" target="_blank" class="prod-link">
                <span>${PROD_ICONS[item.name]||'🔗'}</span>
                <span>${item.name}</span>
                <span style="margin-left:auto;font-size:11px;color:#6c47ff">Visit →</span>
              </a>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

function renderSavedPage() {
  const el = document.getElementById('saved-page-content');
  if (!el) return;
  el.innerHTML = `
    <h2 class="section-heading">Saved Designs</h2>
    <div style="text-align:center;padding:60px 20px;color:#888">
      <div style="font-size:48px;margin-bottom:16px">🔖</div>
      <p style="font-size:15px;font-weight:600;margin-bottom:8px">No saved designs yet</p>
      <p style="font-size:13px">Analyse a room and save your favourite designs here.</p>
    </div>`;
}

function renderAboutPage() {
  const el = document.getElementById('about-page-content');
  if (!el) return;
  el.innerHTML = `
    <h2 class="section-heading">About AI Interior Design Assistant</h2>
    <div class="card">
      <p style="font-size:14px;line-height:1.8;color:#555;margin-bottom:16px">
        AI Interior Design Assistant uses cutting-edge AI to transform your room photos into stunning redesigns.
        Our pipeline combines <b>YOLOv8</b> for object detection, <b>Google Gemini</b> for intelligent room analysis,
        and <b>FLUX.1</b> for photorealistic image generation.
      </p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px">
        ${[
          {icon:'🔍',title:'YOLOv8',desc:'Detects furniture and objects in your room photo'},
          {icon:'🧠',title:'Gemini AI',desc:'Analyses layout, style, and generates design prompts'},
          {icon:'🖼️',title:'FLUX.1',desc:'Generates photorealistic redesigned room images'},
        ].map(f=>`
          <div style="text-align:center;padding:20px;background:#f8f9ff;border-radius:12px;border:1px solid #e8eaf0">
            <div style="font-size:32px;margin-bottom:10px">${f.icon}</div>
            <div style="font-weight:700;font-size:13px;margin-bottom:6px">${f.title}</div>
            <div style="font-size:12px;color:#888">${f.desc}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderContactPage() {
  const el = document.getElementById('contact-page-content');
  if (!el) return;
  el.innerHTML = `
    <h2 class="section-heading">Contact Us</h2>
    <div class="card" style="max-width:500px">
      <p style="font-size:13px;color:#666;margin-bottom:20px">Have questions or feedback? We'd love to hear from you.</p>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:6px">Your Name</label>
          <input style="width:100%;padding:10px 14px;border:1.5px solid #e8eaf0;border-radius:8px;font-size:13px;outline:none;font-family:Inter,sans-serif" placeholder="Enter your name" onfocus="this.style.borderColor='#6c47ff'" onblur="this.style.borderColor='#e8eaf0'"/>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:6px">Email</label>
          <input type="email" style="width:100%;padding:10px 14px;border:1.5px solid #e8eaf0;border-radius:8px;font-size:13px;outline:none;font-family:Inter,sans-serif" placeholder="Enter your email" onfocus="this.style.borderColor='#6c47ff'" onblur="this.style.borderColor='#e8eaf0'"/>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:6px">Message</label>
          <textarea rows="4" style="width:100%;padding:10px 14px;border:1.5px solid #e8eaf0;border-radius:8px;font-size:13px;outline:none;resize:vertical;font-family:Inter,sans-serif" placeholder="Your message…" onfocus="this.style.borderColor='#6c47ff'" onblur="this.style.borderColor='#e8eaf0'"></textarea>
        </div>
        <button onclick="showToast('Message sent! We will get back to you soon. ✉️',4000)"
          style="background:#6c47ff;color:#fff;border:none;border-radius:8px;padding:12px;font-size:13px;font-weight:600;cursor:pointer">
          Send Message ✉️
        </button>
      </div>
    </div>`;
}

// ── SWITCH BUDGET ─────────────────────────────
async function switchBudget(b) {
  if (b === S.budget && S.hasResults) return;
  S.budget = b;
  document.querySelectorAll('.dash-budget-btn').forEach(el => el.classList.remove('active-dash'));
  const btn = document.getElementById('dbtn-' + b);
  if (btn) btn.classList.add('active-dash');
  document.getElementById('budget-badge').textContent = BUDGET_LABELS[b];
  if (!S.filename) return;
  await regenerate('budget', b);
}

// ═══════════════════════════════════════════════════════════════════
// BUG 3 FIX — APPLY EDIT WITH COMPATIBILITY CHECK
// Before regenerating, checks if furniture/item fits the room type.
// Shows a blocking modal for incompatible, a warning for size issues.
// ═══════════════════════════════════════════════════════════════════
async function applyEdit(type, value) {
  if (!S.filename) return;

  // Only check furniture changes
  if (type === 'furniture') {
    try {
      const res  = await fetch('/check_compatibility', {
        method:  'POST',
        headers: {'Content-Type':'application/json'},
        body:    JSON.stringify({
          room_type: S.roomType,
          furniture: value,
          room_size: S.roomSize,
        }),
      });
      const data = await res.json();

      if (!data.compatible) {
        // BLOCK: show incompatible modal — do NOT proceed
        showCompatWarning(data, null);
        return;
      }

      if (data.size_warning) {
        // WARN: show warning modal with option to proceed anyway
        showCompatWarning(data, () => {
          _doApplyEdit(type, value);
        });
        return;
      }
    } catch(e) {
      console.warn('Compatibility check failed, proceeding:', e);
    }
  }

  _doApplyEdit(type, value);
}

function _doApplyEdit(type, value) {
  S.design[type] = value;
  updateChips();
  highlightBtn(type, value);
  regenerate(type, value);
}

const selectedDecors = new Set();
function toggleDecor(btn, item) {
  if (selectedDecors.has(item)) {
    selectedDecors.delete(item);
    btn.classList.remove('active-decor');
  } else {
    selectedDecors.add(item);
    btn.classList.add('active-decor');
  }
}
async function applyDecorations() {
  if (!S.filename) return;
  S.design.decorations = [...selectedDecors];
  updateChips();
  await regenerate('decorations', S.design.decorations.join(', '));
}

// ── REGENERATE ────────────────────────────────
async function regenerate(changeType, changeValue) {
  showRegenOverlay();
  try {
    const res  = await fetch('/regenerate', {
      method:  'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        filename:       S.filename,
        budget:         S.budget,
        room_type:      S.roomType,
        design_state:   S.design,
        change_type:    changeType,
        change_value:   changeValue,
        window_wall:    S.windowWall,
        door_wall:      S.doorWall,
        camera_angle:   S.cameraAngle,
        room_size:      S.roomSize,      // BUG 1/3 FIX: pass room geometry
        ceiling_height: S.ceilingHeight,
        floor_material: S.floorMaterial,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Regen failed');

    // BUG 2 FIX: update room geometry from server response
    if (data.window_wall)    S.windowWall    = data.window_wall;
    if (data.door_wall)      S.doorWall      = data.door_wall;
    if (data.camera_angle)   S.cameraAngle   = data.camera_angle;
    if (data.room_size)      S.roomSize      = data.room_size;
    if (data.ceiling_height) S.ceilingHeight = data.ceiling_height;
    if (data.floor_material) S.floorMaterial = data.floor_material;

    if (data.budget_items) renderBudget(data.budget_items, data.budget_total || 0);
    if (data.analysis)     renderSuggestions(data.analysis);

    if (data.after_image_url) {
      S.fallbackUrl = data.after_image_fallback || '';
      loadAfterImage(data.after_image_url, data.after_image_fallback);
    } else {
      removeRegenOverlay();
    }
  } catch(err) {
    removeRegenOverlay();
    console.error(err);
    showToast('Regeneration failed: ' + err.message);
  }
}

function highlightBtn(type, value) {
  document.querySelectorAll(`.opt-btn[onclick*="'${type}'"]`).forEach(b => b.classList.remove('active-edit'));
  document.querySelectorAll(`.color-btn[onclick*="'${type}'"]`).forEach(b => b.classList.remove('active-edit'));
  document.querySelectorAll(`.opt-btn[onclick*="'${value}'"], .color-btn[onclick*="'${value}'"]`).forEach(b => {
    if ((b.getAttribute('onclick')||'').includes(`'${type}'`)) b.classList.add('active-edit');
  });
}

function resetDesign() {
  S.design = { wall_color:'', furniture:'', lighting:'', curtains:'', flooring:'', decorations:[], theme:'' };
  selectedDecors.clear();
  document.querySelectorAll('.opt-btn,.color-btn').forEach(b => b.classList.remove('active-edit','active-decor'));
  updateChips();
  regenerate('full', 'reset');
}

function updateChips() {
  const d = S.design;
  const items = [
    { label:'Wall',      val: d.wall_color },
    { label:'Furniture', val: d.furniture },
    { label:'Lighting',  val: d.lighting },
    { label:'Curtains',  val: d.curtains },
    { label:'Flooring',  val: d.flooring },
    { label:'Theme',     val: d.theme },
    { label:'Decor',     val: d.decorations?.length ? d.decorations.join(', ') : '' },
    { label:'Budget',    val: S.budget },
  ];
  document.getElementById('state-chips').innerHTML = items.map(i =>
    `<span class="chip ${i.val ? 'set':''}"><b>${i.label}:</b> ${i.val || 'Auto'}</span>`
  ).join('');
}

// ── REGEN OVERLAY ─────────────────────────────
function showRegenOverlay() {
  const box = document.querySelector('.after-box');
  if (!box || box.querySelector('.regen-overlay')) return;
  const ov = document.createElement('div');
  ov.className = 'regen-overlay';
  ov.innerHTML = '<div class="mini-spin"></div><span>Regenerating design…</span>';
  box.appendChild(ov);
  document.getElementById('after-img').style.display     = 'none';
  document.getElementById('after-error').style.display   = 'none';
  document.getElementById('after-loading').style.display = 'none';
}
function removeRegenOverlay() {
  document.querySelectorAll('.regen-overlay').forEach(el => el.remove());
}

// ── COMPARE TOGGLE ────────────────────────────
let compareMode = false;
function toggleCompare() {
  compareMode = !compareMode;
  const afterBox = document.querySelector('.after-box');
  if (afterBox) afterBox.style.opacity = compareMode ? '0.15' : '1';
}

// ── NEW DESIGN ────────────────────────────────
function newDesign() {
  clearTimeout(_imageLoadTimer);
  S.filename      = '';
  S.imageUrl      = '';
  S.hasResults    = false;
  S.lastData      = null;
  S.roomSize      = 'medium';
  S.ceilingHeight = 'standard';
  S.floorMaterial = 'tile';
  S.design        = { wall_color:'', furniture:'', lighting:'', curtains:'', flooring:'', decorations:[], theme:'' };
  selectedDecors.clear();
  removeFile();
  selectBudget('medium');
  selectRoomType('bedroom');
  showPage('upload', document.getElementById('nav-upload'));
  window.scrollTo({ top:0, behavior:'smooth' });
}

// ── LOADING ───────────────────────────────────
let stepTimer = null;
function showLoading(title, msg) {
  document.querySelector('.loading-box h3').textContent = title;
  document.getElementById('loading-msg').textContent    = msg;
  document.getElementById('loading-overlay').style.display = 'flex';
  ['ls1','ls2','ls3','ls4'].forEach(id =>
    document.getElementById(id).classList.remove('active','done'));
  document.getElementById('ls1').classList.add('active');
}
function animateSteps() {
  const ids  = ['ls1','ls2','ls3','ls4'];
  const msgs = ['YOLOv8 detecting furniture…','Gemini analysing room…','Building design prompt…','Generating image…'];
  let idx = 0;
  stepTimer = setInterval(() => {
    if (idx < ids.length - 1) {
      document.getElementById(ids[idx]).classList.replace('active','done');
      idx++;
      document.getElementById(ids[idx]).classList.add('active');
      document.getElementById('loading-msg').textContent = msgs[idx];
    }
  }, 3000);
}
function hideLoading() {
  clearInterval(stepTimer);
  document.getElementById('loading-overlay').style.display = 'none';
  ['ls1','ls2','ls3','ls4'].forEach(id => {
    document.getElementById(id).classList.remove('active');
    document.getElementById(id).classList.add('done');
  });
}

// ── HELPERS ───────────────────────────────────
function fmt(n) { return Number(n).toLocaleString('en-IN'); }

// ── INIT ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  showPage('upload', document.getElementById('nav-upload'));
  selectBudget('medium');
  selectRoomType('bedroom');
  updateChips();
  renderSavedPage();
  renderAboutPage();
  renderContactPage();
  renderDesignIdeasPage(null);
  renderBudgetPage(null);
  renderProductsPage({
    "Wall Paints": [
      {"name":"Asian Paints","url":"https://www.asianpaints.com/colour-catalogue.html"},
      {"name":"Berger Paints","url":"https://www.bergerpaints.com/colourbank"},
    ],
    "Furniture": [
      {"name":"IKEA India","url":"https://www.ikea.com/in/en/"},
      {"name":"Pepperfry","url":"https://www.pepperfry.com/"},
      {"name":"Urban Ladder","url":"https://www.urbanladder.com/"},
    ],
    "Lighting": [
      {"name":"Philips","url":"https://www.lighting.philips.co.in/consumer"},
      {"name":"Havells","url":"https://www.havells.com/en/consumer/lighting.html"},
    ],
    "Decor & More": [
      {"name":"Home Centre","url":"https://www.homecentre.com/in/en/"},
      {"name":"D'Decor","url":"https://www.ddecor.com/"},
    ],
  });
});  