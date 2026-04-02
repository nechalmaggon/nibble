// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY_ARTICLES = 'nibble_articles';
const STORAGE_KEY_CURRENT  = 'nibble_current';
const STORAGE_KEY_SEEN     = 'nibble_seen';

const GMAIL_SEARCH_URL =
  'https://www.googleapis.com/gmail/v1/users/me/messages?q=is%3Astarred&maxResults=50';

// Sender patterns to exclude (lowercased for comparison)
const EXCLUDE_PATTERNS = [
  'noreply', 'no-reply', 'donotreply',
  'notifications@', 'alert@', 'support@',
  'booking', 'indigo', 'makemytrip', 'cleartrip',
  'zomato', 'swiggy', 'amazon', 'flipkart',
  'bank', 'hdfc', 'icici', 'sbi', 'axis'
];

// Phrases that signal a "view in browser" link
const VIEW_IN_BROWSER_PHRASES = [
  'view in browser',
  'view online',
  'read online',
  'view as webpage',
  'view this email in your browser'
];

// Cookie mascot mapping (index 0–7, cycles daily)
const COOKIE_ASSETS = [
  'assets/cookies/cookie_sparkle.png',
  'assets/cookies/cookie_wink.png',
  'assets/cookies/cookie_shy.png',
  'assets/cookies/cookie_sleepy.png',
  'assets/cookies/cookie_excited.png',
  'assets/cookies/cookie_cup.png',
  'assets/cookies/cookie_strawberry.png',
  'assets/cookies/cookie_heart.png',
];

// Blooms flower colours for BLOOMS.SYS widget
const BLOOM_COLORS = [
  ['#FFB6C1', '#C4527A'],
  ['#C3A8E8', '#7a2040'],
  ['#8ADAB8', '#2d7a5a'],
  ['#FFD93D', '#7a6520'],
  ['#FFB6C1', '#7a2040'],
];


// ─── Entry point ──────────────────────────────────────────────────────────────

(async function main() {
  setCookieMascot();
  renderBlooms();
  renderShortcuts();
  renderRecentTabs();
  document.getElementById('search-form').addEventListener('submit', handleSearch);

  try {
    const today   = getToday();
    const storage = await storageGet([STORAGE_KEY_ARTICLES, STORAGE_KEY_CURRENT]);
    let articles  = storage[STORAGE_KEY_ARTICLES] || [];
    let current   = storage[STORAGE_KEY_CURRENT]  || null;

    // Reuse today's pick if it's still current
    if (current && current.date === today) {
      const article = articles.find(a => a.id === current.id);
      if (article) {
        renderArticle(article, articles);
        return;
      }
    }

    // Need a fresh pick — try from existing articles first
    let seen     = loadSeen(articles);
    let unseen   = articles.filter(a => !seen.includes(a.id));

    if (unseen.length === 0 && articles.length > 0) {
      // Seen everything — reset and start over
      seen   = [];
      unseen = articles;
    }

    if (unseen.length > 0) {
      const picked = unseen[Math.floor(Math.random() * unseen.length)];
      await saveCurrent(picked.id, today);
      addToSeen(picked.id);
      renderArticle(picked, articles);
      return;
    }

    // No local articles at all — fetch from Gmail
    const token   = await getAuthToken();
    const fetched = await fetchNewslettersFromGmail(token);

    if (fetched.length === 0) {
      renderEmpty();
      return;
    }

    // Merge new articles into the store (avoid duplicates)
    const existingIds = new Set(articles.map(a => a.id));
    const newArticles = fetched.filter(a => !existingIds.has(a.id));
    articles = [...articles, ...newArticles];
    await storageSet({ [STORAGE_KEY_ARTICLES]: articles });

    // Pick one from what we just fetched
    const picked = fetched[Math.floor(Math.random() * fetched.length)];
    await saveCurrent(picked.id, today);
    addToSeen(picked.id);
    renderArticle(picked, articles);

  } catch (err) {
    console.error('Nibble error:', err);
    renderEmpty();
  }
})();


// ─── Date ─────────────────────────────────────────────────────────────────────

function getToday() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}


// ─── chrome.storage.local helpers ─────────────────────────────────────────────

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}

function storageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

async function saveCurrent(id, date) {
  await storageSet({ [STORAGE_KEY_CURRENT]: { id, date } });
}


// ─── Seen-list (kept in localStorage for speed — tiny data) ──────────────────

function loadSeen(articles) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SEEN);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addToSeen(id) {
  try {
    const seen = loadSeen();
    if (!seen.includes(id)) {
      seen.push(id);
      localStorage.setItem(STORAGE_KEY_SEEN, JSON.stringify(seen));
    }
  } catch {}
}


// ─── OAuth ────────────────────────────────────────────────────────────────────

function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(token);
    });
  });
}


// ─── Gmail API ────────────────────────────────────────────────────────────────

async function gmailFetch(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}`);
  return res.json();
}

async function fetchNewslettersFromGmail(token) {
  const listData = await gmailFetch(GMAIL_SEARCH_URL, token);
  const messages = listData.messages || [];
  if (messages.length === 0) return [];

  shuffleArray(messages);

  const candidates = [];
  const BATCH = 10;

  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    const fetched = await Promise.all(
      batch.map(m =>
        gmailFetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
          token
        ).catch(() => null)
      )
    );

    for (const msg of fetched) {
      if (!msg) continue;
      const article = parseMessageToArticle(msg); // returns null if not a newsletter
      if (article) candidates.push(article);
    }

    if (candidates.length >= 5) break;
  }

  return candidates;
}


// ─── Message → Article ────────────────────────────────────────────────────────

// Returns a clean article object, or null if the message isn't a newsletter.
// Newsletter filtering is done here so the internal fields never reach storage.
function parseMessageToArticle(msg) {
  const headers    = getHeaders(msg);
  const subject    = headers['subject']  || '(No subject)';
  const from       = headers['from']     || '';
  const dateHeader = headers['date']     || '';
  const senderName = extractSenderName(from);
  const senderAddr = extractSenderAddress(from);

  // Newsletter filter — evaluated locally, never stored
  const hasUnsub = !!headers['list-unsubscribe'];
  if (!hasUnsub) return null;
  for (const pattern of EXCLUDE_PATTERNS) {
    if (senderAddr.includes(pattern)) return null;
  }

  const source      = extractDomain(senderAddr);
  const url         = extractViewInBrowserUrl(msg) ||
                      `https://mail.google.com/mail/u/0/#starred/${msg.id}`;
  const receivedAt  = dateHeader ? new Date(dateHeader).getTime() : Date.now();
  const description = extractSnippet(msg);

  return {
    id:          msg.id,
    title:       subject,
    author:      senderName,
    source,
    url,
    description,
    receivedAt,
    read:        false,
    addedAt:     Date.now(),
  };
}

function extractSnippet(msg) {
  // Try text/plain first — cleanest source of readable words
  const plain = findTextPlainPart(msg.payload);
  if (plain) {
    const words = plain.trim().split(/\s+/).filter(w => w.length > 0);
    return words.slice(0, 30).join(' ') + (words.length > 30 ? '…' : '');
  }
  // Fall back to stripping HTML
  const html = getBodyHtml(msg);
  if (html) {
    const doc   = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style,script,head').forEach(el => el.remove());
    const words = (doc.body?.textContent || '').trim().split(/\s+/).filter(w => w.length > 1);
    return words.slice(0, 30).join(' ') + (words.length > 30 ? '…' : '');
  }
  return '';
}

function findTextPlainPart(part) {
  if (!part) return null;
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return base64Decode(part.body.data);
  }
  if (part.parts) {
    for (const child of part.parts) {
      const result = findTextPlainPart(child);
      if (result) return result;
    }
  }
  return null;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}


function getHeaders(msg) {
  const headers = {};
  const parts   = msg.payload?.headers || [];
  for (const h of parts) headers[h.name.toLowerCase()] = h.value;
  return headers;
}

function extractSenderName(from) {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return extractSenderAddress(from);
}

function extractSenderAddress(from) {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  return from.toLowerCase().trim();
}

function extractDomain(email) {
  const domain = email.split('@')[1] || email;
  return domain.replace(/^www\./, '').toLowerCase();
}


// ─── "View in browser" link ───────────────────────────────────────────────────

function extractViewInBrowserUrl(msg) {
  const html = getBodyHtml(msg);
  if (!html) return null;

  const parser  = new DOMParser();
  const doc     = parser.parseFromString(html, 'text/html');
  const anchors = doc.querySelectorAll('a[href]');

  for (const a of anchors) {
    const text = (a.textContent || '').toLowerCase().trim();
    for (const phrase of VIEW_IN_BROWSER_PHRASES) {
      if (text.includes(phrase)) {
        const href = a.getAttribute('href');
        if (href && href.startsWith('http')) return href;
      }
    }
  }
  return null;
}

function getBodyHtml(msg) {
  return msg.payload ? findHtmlPart(msg.payload) : null;
}

function findHtmlPart(part) {
  if (part.mimeType === 'text/html' && part.body?.data) {
    return base64Decode(part.body.data);
  }
  if (part.parts) {
    for (const child of part.parts) {
      const result = findHtmlPart(child);
      if (result) return result;
    }
  }
  return null;
}

function base64Decode(data) {
  const standard = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      atob(standard).split('').map(c =>
        '%' + c.charCodeAt(0).toString(16).padStart(2, '0')
      ).join('')
    );
  } catch { return atob(standard); }
}


// ─── Cookie mascot ────────────────────────────────────────────────────────────

function setCookieMascot() {
  const idx = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % 8;
  document.getElementById('cookie-img').src = COOKIE_ASSETS[idx];
}


// ─── BLOOMS.SYS flowers ───────────────────────────────────────────────────────

function renderBlooms() {
  const container = document.getElementById('blooms-flowers');
  if (!container) return;

  const NS = 'http://www.w3.org/2000/svg';
  const PETAL_POSITIONS = [
    [0, -9], [7.8, -4.5], [7.8, 4.5], [0, 9], [-7.8, 4.5], [-7.8, -4.5]
  ];

  function makeCircle(cx, cy, r, fill, opacity) {
    const el = document.createElementNS(NS, 'circle');
    el.setAttribute('cx', cx);
    el.setAttribute('cy', cy);
    el.setAttribute('r', r);
    el.setAttribute('fill', fill);
    el.setAttribute('opacity', opacity);
    return el;
  }

  BLOOM_COLORS.forEach(([petal, center]) => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '36');
    svg.setAttribute('height', '36');
    svg.setAttribute('viewBox', '-18 -18 36 36');

    PETAL_POSITIONS.forEach(([cx, cy]) => {
      svg.appendChild(makeCircle(cx, cy, 6, petal, '.85'));
    });
    svg.appendChild(makeCircle(0, 0, 5, center, '.7'));

    container.appendChild(svg);
  });
}


// ─── Render ───────────────────────────────────────────────────────────────────

function renderArticle(article, allArticles) {
  // Author pill
  const pill = document.getElementById('author-label');
  pill.textContent = `${article.author} @ ${article.source}`;
  pill.classList.remove('hidden');

  // Date
  const dateEl = document.getElementById('article-date');
  dateEl.textContent = article.receivedAt ? formatDate(article.receivedAt) : '';
  dateEl.classList.remove('hidden');

  // Title
  document.getElementById('article-title').textContent = article.title;

  // Description
  const descEl = document.getElementById('article-desc');
  descEl.textContent = article.description || '';
  descEl.classList.toggle('hidden', !article.description);

  // Nibble button — show, open article, mark as read
  const btn = document.getElementById('nibble-btn');
  btn.textContent = 'Nibble';
  btn.style.display = '';
  btn.onclick = async () => {
    window.open(article.url, '_blank');
    try {
      const storage  = await storageGet([STORAGE_KEY_ARTICLES]);
      const articles = (storage[STORAGE_KEY_ARTICLES] || []).map(a =>
        a.id === article.id ? { ...a, read: true } : a
      );
      await storageSet({ [STORAGE_KEY_ARTICLES]: articles });
    } catch {}
  };

  // Unread count
  const unread = (allArticles || []).filter(a => !a.read).length;
  document.getElementById('unread-count').textContent = `${unread} unread`;

  document.getElementById('btn-read-one').onclick = () => btn.click();
  document.getElementById('btn-ignore').onclick = () => {};
}

function renderEmpty() {
  document.getElementById('author-label').classList.add('hidden');
  document.getElementById('article-date').classList.add('hidden');
  document.getElementById('article-desc').classList.add('hidden');
  document.getElementById('article-title').textContent = 'no nibble today :(';
  document.getElementById('nibble-btn').style.display = 'none';
  document.getElementById('unread-count').textContent = '0 unread';
}


// ─── Shortcuts ────────────────────────────────────────────────────────────────

const MAX_SHORTCUTS = 6;

function buildShortcutCircle(site) {
  let hostname = '';
  try { hostname = new URL(site.url).hostname; } catch {}

  const a = document.createElement('a');
  a.className = 'shortcut-item';
  a.href = site.url;
  a.target = '_blank';

  const circle = document.createElement('div');
  circle.className = 'shortcut-circle';

  const img = document.createElement('img');
  img.src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  img.onerror = () => { img.style.display = 'none'; };

  circle.appendChild(img);

  const label = document.createElement('span');
  label.className = 'shortcut-label';
  const raw = site.title || hostname;
  label.textContent = raw.length > 10 ? raw.slice(0, 10) : raw;

  a.appendChild(circle);
  a.appendChild(label);
  return a;
}

function renderShortcuts() {
  chrome.topSites.get(sites => {
    const row = document.getElementById('shortcuts-row');
    if (!row) return;

    const visible  = sites.slice(0, MAX_SHORTCUTS);
    const overflow = sites.slice(MAX_SHORTCUTS);

    visible.forEach(site => row.appendChild(buildShortcutCircle(site)));

    // "More" button — expands overflow shortcuts inline
    if (overflow.length > 0) {
      const more = document.createElement('button');
      more.className = 'shortcut-item shortcut-more';

      const circle = document.createElement('div');
      circle.className = 'shortcut-circle';
      circle.textContent = '···';

      const label = document.createElement('span');
      label.className = 'shortcut-label';
      label.textContent = 'more';

      more.appendChild(circle);
      more.appendChild(label);
      more.onclick = () => {
        overflow.forEach(site => row.insertBefore(buildShortcutCircle(site), more));
        more.remove();
      };
      row.appendChild(more);
    }

    // "Add" circle — always last
    const add = document.createElement('button');
    add.className = 'shortcut-item shortcut-add';

    const addCircle = document.createElement('div');
    addCircle.className = 'shortcut-circle';
    addCircle.textContent = '+';

    const addLabel = document.createElement('span');
    addLabel.className = 'shortcut-label';
    addLabel.textContent = 'add';

    add.appendChild(addCircle);
    add.appendChild(addLabel);
    row.appendChild(add);
  });
}


// ─── Search ───────────────────────────────────────────────────────────────────

function handleSearch(e) {
  e.preventDefault();
  const q = document.getElementById('search-input').value.trim();
  if (q) {
    window.location.href = 'https://www.google.com/search?q=' + encodeURIComponent(q);
  }
}


// ─── Recent tabs ──────────────────────────────────────────────────────────────

function renderRecentTabs() {
  chrome.sessions.getRecentlyClosed({ maxResults: 8 }, sessions => {
    const list = document.getElementById('tabs-list');
    if (!list) return;

    let count = 0;
    for (const session of sessions) {
      if (count >= 4) break;
      const tab = session.tab ?? session.window?.tabs?.[0];
      if (!tab || !tab.url) continue;

      let hostname = '';
      try { hostname = new URL(tab.url).hostname; } catch {}
      const faviconSrc = tab.favIconUrl ||
        `https://www.google.com/s2/favicons?domain=${hostname}&sz=28`;

      const a = document.createElement('a');
      a.className = 'tab-item';
      a.href = tab.url;
      a.target = '_blank';

      const img = document.createElement('img');
      img.className = 'tab-favicon';
      img.src = faviconSrc;
      img.onerror = () => { img.style.display = 'none'; };

      const titleEl = document.createElement('span');
      titleEl.className = 'tab-title';
      const raw = tab.title || tab.url;
      titleEl.textContent = raw.length > 28 ? raw.slice(0, 28) + '…' : raw;

      a.appendChild(img);
      a.appendChild(titleEl);
      list.appendChild(a);
      count++;
    }

    if (count === 0) {
      const empty = document.createElement('p');
      empty.className = 'tabs-empty';
      empty.textContent = 'nothing here yet ♡';
      list.appendChild(empty);
    }
  });
}


// ─── Utilities ────────────────────────────────────────────────────────────────

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
