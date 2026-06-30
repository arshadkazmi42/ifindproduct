let PRODUCTS = [];
const feed = document.getElementById('feed');
const counter = document.getElementById('counter');
let activeFilter = 'all';
let reactions = JSON.parse(localStorage.getItem('ifound-reactions') || '{}');
let seen = JSON.parse(localStorage.getItem('ifound-seen') || '[]');

async function loadProducts() {
  const res = await fetch('/data/products.json');
  PRODUCTS = await res.json();
  renderFeed();
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
  const unseen = products.filter(p => !seen.includes(p.id));
  const seenP = products.filter(p => seen.includes(p.id));
  return [...shuffleArray(unseen), ...shuffleArray(seenP)];
}

function markSeen(id) {
  if (!seen.includes(id)) {
    seen.push(id);
    localStorage.setItem('ifound-seen', JSON.stringify(seen));
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

const HIGHLIGHT_TAGS = ['solo maker', 'bootstrapped', 'open source', 'free'];

function createCard(product) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = product.id;

  const [c1, c2] = product.colors;
  const userReactions = reactions[product.id] || {};
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${product.domain}&sz=128`;
  const fallbackLetter = product.name[0].toUpperCase();
  const patternSvg = generatePattern(product.pattern, c1);
  const encodedPattern = `url("data:image/svg+xml,${patternSvg}")`;
  const isPHUrl = product.url.includes('producthunt.com');
  const localScreenshot = `/screenshots/${product.id}.jpg`;
  const remoteScreenshot = isPHUrl
    ? (product.thumbnail || '')
    : `https://image.thum.io/get/width/480/crop/960/noanimate/${product.url}`;

  const tagsHtml = product.tags.map(tag => {
    const hl = HIGHLIGHT_TAGS.includes(tag) ? 'highlight' : '';
    return `<span class="card-info-tag ${hl}">${tag}</span>`;
  }).join('');

  card.innerHTML = `
    <div class="card-hero">
      <div class="card-hero-shimmer" id="shimmer-${product.id}"></div>
      <div class="card-hero-fallback" id="fallback-${product.id}" style="background: linear-gradient(160deg, ${c1}18 0%, #0a0a0f 40%, ${c2}12 100%);">
        <div class="card-hero-fallback-pattern" style="background-image: ${encodedPattern}; background-repeat: repeat;"></div>
        <div class="card-hero-fallback-logo">
          <img src="${faviconUrl}" alt="${product.name}" onerror="this.parentElement.innerHTML='<span class=card-hero-fallback-logo-text>${fallbackLetter}</span>'">
        </div>
        <div class="card-hero-fallback-name">${product.name}</div>
        <span class="card-hero-fallback-url">${product.url.replace('https://', '')}</span>
      </div>
    </div>

    <div class="card-info">
      <div class="card-info-header">
        <div class="card-info-logo">
          <img src="${faviconUrl}" alt="" onerror="this.parentElement.innerHTML='<span class=card-info-logo-fallback>${fallbackLetter}</span>'">
        </div>
        <div class="card-info-text">
          <div class="card-info-name">${product.name}</div>
          <div class="card-info-category">${product.category}</div>
        </div>
      </div>
      <div class="card-info-tagline">${product.tagline}</div>
      <div class="card-info-tags">${tagsHtml}</div>
      <div class="card-info-footer">
        <span class="card-info-maker">by <strong>${product.maker}</strong></span>
        <span class="card-info-price">${product.price}</span>
        <button class="card-info-fire ${userReactions.fire ? 'reacted' : ''}" data-product="${product.id}">🔥</button>
        <a href="${product.url}" target="_blank" rel="noopener" class="card-info-cta">Visit →</a>
      </div>
    </div>
  `;

  card.dataset.localScreenshot = localScreenshot;
  card.dataset.remoteScreenshot = remoteScreenshot;
  return card;
}

function loadScreenshot(card) {
  const localUrl = card.dataset.localScreenshot;
  const remoteUrl = card.dataset.remoteScreenshot;
  const hero = card.querySelector('.card-hero');
  const fallback = card.querySelector('.card-hero-fallback');
  const shimmer = card.querySelector('.card-hero-shimmer');

  function showImage(url) {
    const img = new Image();
    img.className = 'card-hero-screenshot';
    img.alt = '';
    img.onload = () => {
      hero.insertBefore(img, fallback);
      fallback.classList.add('hidden');
      if (shimmer) shimmer.classList.add('hidden');
    };
    img.onerror = () => {
      if (url === localUrl && remoteUrl) {
        showImage(remoteUrl);
      } else {
        if (shimmer) shimmer.classList.add('hidden');
      }
    };
    img.src = url;
  }

  if (localUrl) {
    showImage(localUrl);
  } else if (remoteUrl) {
    showImage(remoteUrl);
  } else {
    if (shimmer) shimmer.classList.add('hidden');
  }
}

function updateCounter() {
  const products = getFilteredProducts();
  const idx = getCurrentCardIndex();
  counter.textContent = `${Math.min(idx + 1, products.length)} / ${products.length}`;
}

function getCurrentCardIndex() {
  const cards = document.querySelectorAll('.card');
  const scrollY = window.scrollY;
  let closest = 0, minDist = Infinity;
  cards.forEach((card, i) => {
    const dist = Math.abs(card.offsetTop - scrollY);
    if (dist < minDist) { minDist = dist; closest = i; }
  });
  return closest;
}

function renderFeed() {
  feed.innerHTML = '';
  const products = getFilteredProducts();

  if (products.length === 0) {
    feed.innerHTML = `
      <div class="empty-state">
        <div class="empty-inner">
          <span class="empty-emoji">🔭</span>
          <h2>Nothing here</h2>
          <p>No products match this filter.</p>
        </div>
      </div>
    `;
    counter.textContent = '';
    return;
  }

  products.forEach(p => feed.appendChild(createCard(p)));
  observeCards();
  updateCounter();
}

function observeCards() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        markSeen(parseInt(entry.target.dataset.id));
        updateCounter();

        if (!entry.target.dataset.screenshotLoaded) {
          entry.target.dataset.screenshotLoaded = 'true';
          loadScreenshot(entry.target);
        }
      }
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.card').forEach(c => observer.observe(c));
}

// Filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderFeed();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// Fire reaction
feed.addEventListener('click', (e) => {
  const btn = e.target.closest('.card-info-fire');
  if (!btn) return;

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
});

window.addEventListener('scroll', () => updateCounter(), { passive: true });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

loadProducts();
