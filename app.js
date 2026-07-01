let PRODUCTS = [];
const feed = document.getElementById('feed');
let activeFilter = 'all';
let reactions = JSON.parse(localStorage.getItem('ifound-reactions') || '{}');
let seen = new Set(JSON.parse(localStorage.getItem('ifound-seen') || '[]'));

// Splash shown from first paint (see index.html). Keep it up at least this long so
// a fast/cached load doesn't flash it for a few frames, then cross-fade it away.
const SPLASH_SHOWN_AT = performance.now();
const SPLASH_MIN_MS = 450;

function hideSplash() {
  const splash = document.getElementById('appSplash');
  if (!splash) return;
  const wait = Math.max(0, SPLASH_MIN_MS - (performance.now() - SPLASH_SHOWN_AT));
  setTimeout(() => {
    splash.classList.add('hidden'); // fade out (cross-fades with the first card's entrance)
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    setTimeout(() => splash.remove(), 700); // fallback if transitionend doesn't fire
  }, wait);
}

// Product fields come from scraped sources (Product Hunt, TrustMRR) and public
// submissions — treat them as untrusted before interpolating into innerHTML.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function safeUrl(url) {
  return /^https?:\/\//i.test(url || '') ? url : '';
}

function emptyStateHtml(emoji, title, message) {
  return `
    <div class="empty-state">
      <div class="empty-inner">
        <span class="empty-emoji">${emoji}</span>
        <h2>${title}</h2>
        <p>${message}</p>
      </div>
    </div>
  `;
}

async function loadProducts() {
  try {
    const res = await fetch('/data/products.json');
    PRODUCTS = await res.json();
    renderFeed();
  } catch (e) {
    feed.innerHTML = emptyStateHtml('📡', "Couldn't load the feed", 'Check your connection and try again.');
  } finally {
    hideSplash();
  }
}

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getFilteredProducts() {
  let products = PRODUCTS;
  if (activeFilter !== 'all') {
    products = products.filter(p =>
      p.category.toLowerCase().includes(activeFilter.toLowerCase())
    );
  }
  const unseen = products.filter(p => !seen.has(p.id));
  const seenP = products.filter(p => seen.has(p.id));
  return [...shuffleArray(unseen), ...shuffleArray(seenP)];
}

function markSeen(id) {
  if (!seen.has(id)) {
    seen.add(id);
    localStorage.setItem('ifound-seen', JSON.stringify([...seen]));
  }
}

function generatePattern(type, color) {
  const c = encodeURIComponent(color);
  const patterns = {
    circuit: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="20" cy="20" r="2" fill="${c}"/><circle cx="80" cy="40" r="2" fill="${c}"/><circle cx="50" cy="70" r="2" fill="${c}"/><line x1="20" y1="20" x2="80" y2="40" stroke="${c}" stroke-width="0.5"/><line x1="80" y1="40" x2="50" y2="70" stroke="${c}" stroke-width="0.5"/></svg>`,
    grid: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect x="0" y="0" width="40" height="40" fill="none" stroke="${c}" stroke-width="0.5"/></svg>`,
    dots: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="1.2" fill="${c}"/></svg>`,
    waves: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20"><path d="M0 10 Q30 0 60 10 Q90 20 120 10" fill="none" stroke="${c}" stroke-width="0.5"/></svg>`
  };
  return patterns[type] || patterns.dots;
}

// Crisp external-link glyph (Feather "external-link"). Inherits the link's color
// via currentColor and scales with font-size — replaces the clunky ↗ arrow.
const EXT_ICON = '<svg class="ext-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

function createCard(product) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = product.id;

  const [c1, c2] = product.colors;
  const userReactions = reactions[product.id] || {};
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(product.domain)}&sz=128`;
  const fallbackLetter = (product.name || '?')[0].toUpperCase();
  const patternSvg = generatePattern(product.pattern, c1);
  // URL-encode the SVG so its quotes/angle brackets don't break out of the inline style="".
  const encodedPattern = `url('data:image/svg+xml,${encodeURIComponent(patternSvg)}')`;
  const productUrl = safeUrl(product.url);
  // Preview: the product's og:image (blur-filled), else the clean branded gradient.
  const ogImage = safeUrl(product.og_image);

  // Provenance: where the product was sourced from. Link to the product's page on
  // that source ONLY when we have its specific URL — never fall back to the source's
  // homepage (that sends people to the wrong place). Otherwise show plain attribution.
  const src = product.source === 'producthunt'
      ? { label: 'Product Hunt', url: safeUrl(product.ph_url) }
    : product.source === 'trustmrr'
      ? { label: 'TrustMRR', url: safeUrl(product.source_url) }
    : null;
  const sourceHtml = src
    ? (src.url
        ? ` · <a href="${esc(src.url)}" target="_blank" rel="noopener" class="card-info-source">via ${src.label}${EXT_ICON}</a>`
        : ` · <span class="card-info-source no-link">via ${src.label}</span>`)
    : '';

  card.innerHTML = `
    <div class="card-hero">
      <div class="card-hero-shimmer"></div>
      <div class="card-hero-fallback" style="background: linear-gradient(160deg, ${esc(c1)}18 0%, #0a0a0f 40%, ${esc(c2)}12 100%);">
        <div class="card-hero-fallback-pattern" style="background-image: ${encodedPattern}; background-repeat: repeat;"></div>
        <div class="card-hero-fallback-logo">
          <img src="${esc(faviconUrl)}" alt="${esc(product.name)}" loading="lazy" decoding="async">
        </div>
        <div class="card-hero-fallback-name">${esc(product.name)}</div>
        <span class="card-hero-fallback-url">${esc((productUrl || product.domain || '').replace('https://', ''))}</span>
      </div>
    </div>

    <div class="card-info">
      <div class="card-info-header">
        <div class="card-info-logo">
          <img src="${esc(faviconUrl)}" alt="" loading="lazy" decoding="async">
        </div>
        <div class="card-info-text">
          <div class="card-info-name">${esc(product.name)}${product.verified ? ' <span class="verified-badge" title="Verified maker">✓</span>' : ''}</div>
          <div class="card-info-category">${esc(product.category)}${sourceHtml}</div>
        </div>
      </div>
      <div class="card-info-tagline">${esc(product.tagline)}</div>
      <div class="card-info-footer">
        <span class="card-info-maker">by <strong>${esc(product.maker)}</strong></span>
        <span class="card-info-price">${esc(product.price)}</span>
        <button class="card-info-fire fire-btn ${userReactions.fire ? 'reacted' : ''}" data-product="${esc(product.id)}">🔥</button>
        ${productUrl ? `<a href="${esc(productUrl)}" target="_blank" rel="noopener" class="card-info-visit">Visit${EXT_ICON}</a>` : ''}
      </div>
    </div>
  `;

  // Favicon failed → show the product's first letter instead.
  const heroLogo = card.querySelector('.card-hero-fallback-logo img');
  heroLogo.addEventListener('error', () => {
    const span = document.createElement('span');
    span.className = 'card-hero-fallback-logo-text';
    span.textContent = fallbackLetter;
    heroLogo.replaceWith(span);
  }, { once: true });
  const infoLogo = card.querySelector('.card-info-logo img');
  infoLogo.addEventListener('error', () => {
    const span = document.createElement('span');
    span.className = 'card-info-logo-fallback';
    span.textContent = fallbackLetter;
    infoLogo.replaceWith(span);
  }, { once: true });

  card.dataset.ogImage = ogImage;
  return card;
}

// Card preview: the product's og:image — a blurred, darkened copy fills the card
// with the crisp copy centered on top. Missing/broken og:image → keep the branded
// gradient fallback that's already rendered underneath.
function loadPreview(card) {
  const url = card.dataset.ogImage;
  const shimmer = card.querySelector('.card-hero-shimmer');
  const showFallback = () => { if (shimmer) shimmer.classList.add('hidden'); };
  if (!url) { showFallback(); return; }

  const hero = card.querySelector('.card-hero');
  const fallback = card.querySelector('.card-hero-fallback');
  const crisp = new Image();
  crisp.alt = '';
  crisp.onload = () => {
    if (crisp.naturalWidth < 60) { showFallback(); return; } // broken/placeholder image
    crisp.className = 'card-hero-crisp';
    const blur = new Image();
    blur.className = 'card-hero-blur';
    blur.alt = '';
    blur.src = url; // already cached from the crisp load
    hero.insertBefore(blur, fallback);
    hero.insertBefore(crisp, fallback);
    fallback.classList.add('hidden');
    if (shimmer) shimmer.classList.add('hidden');
  };
  crisp.onerror = showFallback;
  crisp.src = url;
}

// ── Incremental rendering ──
// The feed holds thousands of products; building every card up-front means tens of
// thousands of DOM nodes and an immediate favicon request per card. Instead, render
// a small batch and append the next one when the user scrolls near the end (sentinel
// observer). Cards are viewport-height, so BATCH_SIZE is "screens ahead".
const BATCH_SIZE = 10;
let renderQueue = [];
let cardObserver = null;
let sentinelObserver = null;
let sentinel = null;

function renderFeed() {
  if (cardObserver) cardObserver.disconnect();
  if (sentinelObserver) sentinelObserver.disconnect();
  feed.innerHTML = '';
  renderQueue = getFilteredProducts();

  if (renderQueue.length === 0) {
    feed.innerHTML = emptyStateHtml('🔭', 'Nothing here', 'No products match this filter.');
    return;
  }

  cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        markSeen(parseInt(entry.target.dataset.id));

        if (!entry.target.dataset.previewLoaded) {
          entry.target.dataset.previewLoaded = 'true';
          loadPreview(entry.target);
        }
      }
    });
  }, { threshold: 0.3 });

  sentinel = document.createElement('div');
  sentinel.className = 'feed-sentinel';
  feed.appendChild(sentinel);

  appendNextBatch();

  // Top up when the sentinel comes within a few screens of the viewport.
  sentinelObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) appendNextBatch();
  }, { rootMargin: '300% 0px' });
  sentinelObserver.observe(sentinel);
}

function appendNextBatch() {
  const batch = renderQueue.splice(0, BATCH_SIZE);
  if (batch.length === 0) {
    if (sentinelObserver) sentinelObserver.disconnect();
    if (sentinel) sentinel.remove();
    return;
  }
  const frag = document.createDocumentFragment();
  batch.forEach(p => {
    const card = createCard(p);
    frag.appendChild(card);
    cardObserver.observe(card); // safe on detached nodes; fires once connected
  });
  feed.insertBefore(frag, sentinel);
}

// Filter panel
const filterPanel = document.getElementById('filterPanel');
const filterFab = document.getElementById('filterFab');

if (filterFab) {
  filterFab.addEventListener('click', () => filterPanel.classList.toggle('open'));
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    filterPanel.classList.remove('open');
    renderFeed();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// Filter toggle + fire reaction + close panel on outside tap
feed.addEventListener('click', (e) => {
  const btn = e.target.closest('.fire-btn');
  if (btn) {
    const productId = parseInt(btn.dataset.product);
    if (!reactions[productId]) reactions[productId] = {};
    if (reactions[productId].fire) {
      delete reactions[productId].fire;
      btn.classList.remove('reacted');
    } else {
      reactions[productId].fire = true;
      btn.classList.add('reacted');
    }
    localStorage.setItem('ifound-reactions', JSON.stringify(reactions));
    return;
  }

  if (filterPanel.classList.contains('open')) {
    filterPanel.classList.remove('open');
  }
});


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// PWA install banner
function showInstallBanner() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || navigator.standalone === true;
  const dismissed = localStorage.getItem('ifound-install-dismissed');
  if (isStandalone || dismissed) return;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  if (!isIOS && !isAndroid) return;

  const banner = document.createElement('div');
  banner.className = 'install-banner';
  banner.innerHTML = isIOS
    ? `<span>Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> for the full app experience</span><button class="install-dismiss">&times;</button>`
    : `<span>Add iFound to your home screen for the full app experience</span><button class="install-dismiss">&times;</button>`;
  document.body.appendChild(banner);

  setTimeout(() => banner.classList.add('visible'), 2000);

  banner.querySelector('.install-dismiss').addEventListener('click', () => {
    banner.classList.remove('visible');
    localStorage.setItem('ifound-install-dismissed', '1');
    setTimeout(() => banner.remove(), 300);
  });

  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    banner.innerHTML = `<span>Install iFound as an app</span><button class="install-btn-action">Install</button><button class="install-dismiss">&times;</button>`;
    banner.querySelector('.install-btn-action').addEventListener('click', () => {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => { banner.remove(); });
    });
    banner.querySelector('.install-dismiss').addEventListener('click', () => {
      banner.classList.remove('visible');
      localStorage.setItem('ifound-install-dismissed', '1');
      setTimeout(() => banner.remove(), 300);
    });
  });
}

showInstallBanner();
loadProducts();
