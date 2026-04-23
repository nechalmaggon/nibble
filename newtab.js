// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY_ARTICLES        = 'nibble_articles';
const STORAGE_KEY_CURRENT         = 'nibble_current';
const STORAGE_KEY_SEEN            = 'nibble_seen';
const STORAGE_KEY_HISTORY         = 'nibble_history';
const STORAGE_KEY_CUSTOM_SHORTCUTS = 'nibble_custom_shortcuts';

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



// ─── Entry point ──────────────────────────────────────────────────────────────

// ─── Theme ────────────────────────────────────────────────────────────────────

async function applyTheme(theme) {
  const themeKey = theme || 'default';

  if (themeKey === 'default') {
    delete document.body.dataset.theme;
  } else {
    document.body.setAttribute('data-theme', themeKey);
  }

  document.querySelectorAll('.theme-row').forEach(row => {
    row.classList.toggle('active', row.dataset.themeKey === themeKey);
  });

  try {
    const res = await fetch(chrome.runtime.getURL(`assets/deco/${themeKey}.svg`));
    if (!res.ok) return;
    const svgText = await res.text();
    const decoLayer = document.getElementById('deco-layer');
    if (decoLayer && svgText) {
      decoLayer.outerHTML = svgText;
    }
  } catch {}
}

function initThemeSwitcher(currentTheme) {
  const switcher  = document.getElementById('theme-switcher');
  const panel     = document.getElementById('theme-panel');
  const toggleBtn = document.getElementById('theme-toggle-btn');

  // Mark active row on load
  document.querySelectorAll('.theme-row').forEach(row => {
    row.classList.toggle('active', row.dataset.themeKey === currentTheme);
  });

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });

  document.querySelectorAll('.theme-row').forEach(row => {
    row.addEventListener('click', async () => {
      const key = row.dataset.themeKey;
      await applyTheme(key);
      storageSet({ nibble_theme: key });
      renderGarden();
      panel.classList.remove('open');
    });
  });

  document.addEventListener('click', (e) => {
    if (!switcher.contains(e.target)) panel.classList.remove('open');
  });
}

(async function main() {
  // Load theme from storage (no-op if unset; :root defaults apply)
  const themeResult = await storageGet(['nibble_theme']);
  const savedTheme  = themeResult.nibble_theme || 'default';
  await applyTheme(savedTheme);
  initThemeSwitcher(savedTheme);

  setCookieMascot();
  drainHealthIfNeeded().then(() => renderGarden());
  renderShortcuts();
  renderRecentTabs();

  try {
    const today   = getLocalDateString();
    const storage = await storageGet([STORAGE_KEY_ARTICLES, STORAGE_KEY_CURRENT, STORAGE_KEY_HISTORY]);
    let articles  = storage[STORAGE_KEY_ARTICLES] || [];
    let current   = storage[STORAGE_KEY_CURRENT]  || null;
    let history   = storage[STORAGE_KEY_HISTORY]  || [];

    // Reuse today's pick if it's still current
    if (current && current.date === today) {
      const article = articles.find(a => a.id === current.id);
      if (article) {
        renderArticle(article, articles);
        return;
      }
    }

    // Need a fresh pick — check unseen local articles first
    let seen   = loadSeen();
    let unseen = articles.filter(a => !seen.includes(a.id));

    // If nothing unseen locally (or no articles at all), fetch from Gmail
    if (unseen.length === 0) {
      const token   = await getAuthToken();
      const fetched = await fetchNewslettersFromGmail(token);

      if (fetched.length > 0) {
        const existingIds = new Set(articles.map(a => a.id));
        const newArticles = fetched.filter(a => !existingIds.has(a.id));
        articles = [...articles, ...newArticles];
        await storageSet({ [STORAGE_KEY_ARTICLES]: articles });

        // Re-evaluate unseen after merge
        seen   = loadSeen();
        unseen = articles.filter(a => !seen.includes(a.id));
      }
    }

    if (unseen.length === 0) {
      renderEmpty('all nibbled up! ✦ star more newsletters to see them here');
      return;
    }

    const picked = selectArticleForToday(articles, history);
    if (!picked) {
      renderEmpty('all nibbled up! ✦ star more newsletters to see them here');
      return;
    }
    await saveCurrent(picked.id, today);
    addToSeen(picked.id);
    history = appendToHistory(history, picked, today);
    await storageSet({ [STORAGE_KEY_HISTORY]: history });
    renderArticle(picked, articles);

  } catch (err) {
    console.error('Nibble error:', err);
    renderEmpty();
  }
})();


// ─── Date ─────────────────────────────────────────────────────────────────────

function getLocalDateString(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeAuthor(author) {
  return String(author || 'unknown').trim().toLowerCase();
}

function getRecentAuthorSets(history, today = new Date()) {
  const normalizedHistory = Array.isArray(history) ? history : [];
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);

  const last4Dates = new Set();
  for (let i = 1; i <= 4; i += 1) {
    const day = new Date(base);
    day.setDate(base.getDate() - i);
    last4Dates.add(getLocalDateString(day));
  }

  const yesterday = new Date(base);
  yesterday.setDate(base.getDate() - 1);
  const yesterdayDate = getLocalDateString(yesterday);

  const last4DayAuthors = new Set();
  const yesterdayAuthors = new Set();

  for (const entry of normalizedHistory) {
    if (!entry || !entry.date) continue;
    const author = normalizeAuthor(entry.author);
    if (last4Dates.has(entry.date)) last4DayAuthors.add(author);
    if (entry.date === yesterdayDate) yesterdayAuthors.add(author);
  }

  return { last4DayAuthors, yesterdayAuthors };
}

function appendToHistory(history, article, dateStr) {
  const nextHistory = Array.isArray(history) ? [...history] : [];
  if (!article?.id || !dateStr) return nextHistory.slice(-30);

  const exists = nextHistory.some(
    entry => entry && entry.date === dateStr && entry.articleId === article.id
  );
  if (exists) return nextHistory.slice(-30);

  const withoutSameDay = nextHistory.filter(entry => entry?.date !== dateStr);
  withoutSameDay.push({
    articleId: article.id,
    author: article.author || 'unknown',
    date: dateStr
  });

  return withoutSameDay.slice(-30);
}

function selectArticleForToday(articles, history, today = new Date()) {
  const seen = loadSeen();
  const unseen = (Array.isArray(articles) ? articles : []).filter(a => !seen.includes(a.id));
  return selectArticleWithAuthorCooldown(unseen, history, today);
}

function selectArticleWithAuthorCooldown(unseenArticles, history, today = new Date()) {
  if (!Array.isArray(unseenArticles) || unseenArticles.length === 0) return null;

  const { last4DayAuthors, yesterdayAuthors } = getRecentAuthorSets(history, today);
  const tier1 = unseenArticles.filter(a => !last4DayAuthors.has(normalizeAuthor(a.author)));
  if (tier1.length > 0) return pickRandom(tier1);

  const tier2 = unseenArticles.filter(a => !yesterdayAuthors.has(normalizeAuthor(a.author)));
  if (tier2.length > 0) return pickRandom(tier2);

  return pickRandom(unseenArticles);
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
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

function loadSeen() {
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

const BOILERPLATE_PATTERNS = [
  /view\s+(this\s+)?(email|post|newsletter|message|it)\s+(in|on|online)/i,
  /unsubscribe/i,
  /manage\s+(your\s+)?preferences/i,
  /update\s+(your\s+)?email/i,
  /you('re| are)\s+receiving\s+this/i,
  /click\s+here\s+to/i,
  /privacy\s+policy/i,
  /terms\s+of\s+(service|use)/i,
  /follow\s+us\s+on/i,
  /copyright\s+©/i,
  /all\s+rights\s+reserved/i,
];

function isBoilerplateLine(line) {
  return BOILERPLATE_PATTERNS.some(re => re.test(line));
}

function cleanText(text) {
  const isUrl = w => /^https?:\/\//i.test(w);
  return text
    .split('\n')
    .filter(line => line.trim().length > 0 && !isBoilerplateLine(line))
    .join(' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && !isUrl(w));
}

function extractSnippet(msg) {
  const plain = findTextPlainPart(msg.payload);
  if (plain) {
    const words = cleanText(plain);
    return words.slice(0, 30).join(' ') + (words.length > 30 ? '…' : '');
  }
  const html = getBodyHtml(msg);
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style,script,head,footer,nav').forEach(el => el.remove());
    const words = cleanText(doc.body?.textContent || '');
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
  } 
  catch {
    try { return atob(standard); } catch { return ''; }
  }
}


// ─── Cookie mascot ────────────────────────────────────────────────────────────

function setCookieMascot() {
  const idx = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % 8;
  const el = document.getElementById('cookie-img');
  if (el) el.src = COOKIE_ASSETS[idx];
}


// ─── Reading Garden (BLOOMS.SYS) ─────────────────────────────────────────────

const STORAGE_KEY_TOTAL_READS    = 'nibble_total_reads';
const STORAGE_KEY_HEALTH         = 'nibble_health';
const STORAGE_KEY_HEALTH_DRAINED = 'nibble_health_last_drained';

const GARDEN_SOIL_Y = 84;
const GARDEN_SVG_W  = 156;
const GARDEN_SVG_H  = 110;

const GARDEN_FLOWER_COLORS = [
  { petal: '#FFB6C1', center: '#C4527A' },
  { petal: '#C3A8E8', center: '#7a2040' },
  { petal: '#8ADAB8', center: '#2d7a5a' },
  { petal: '#FFD93D', center: '#7a6520' },
  { petal: '#FFDDE8', center: '#C4527A' },
];

function getStage(totalReads) {
  if (totalReads === 0)  return 'seeds';
  if (totalReads <= 3)   return 'sapling';
  if (totalReads <= 9)   return 'sprout';
  if (totalReads <= 19)  return 'small-garden';
  if (totalReads <= 29)  return 'full-garden';
  return 'thriving';
}

function getHealthState(health) {
  if (health >= 80) return 'healthy';
  if (health >= 55) return 'thirsty';
  if (health >= 30) return 'wilting';
  if (health >= 10) return 'needs-you';
  return 'bare';
}

function getDrainPerDay(stage) {
  const map = { seeds: 0, sapling: 8, sprout: 10, 'small-garden': 12, 'full-garden': 15, thriving: 18 };
  return map[stage] || 0;
}

function getRecovery(stage) {
  const map = { sapling: 35, sprout: 30, 'small-garden': 25, 'full-garden': 20, thriving: 15 };
  return map[stage] !== undefined ? map[stage] : 35;
}

async function drainHealthIfNeeded() {
  const result = await storageGet([STORAGE_KEY_TOTAL_READS, STORAGE_KEY_HEALTH, STORAGE_KEY_HEALTH_DRAINED]);
  const totalReads  = result[STORAGE_KEY_TOTAL_READS] || 0;
  let   health      = result[STORAGE_KEY_HEALTH] !== undefined ? result[STORAGE_KEY_HEALTH] : 100;
  const lastDrained = result[STORAGE_KEY_HEALTH_DRAINED] || null;
  const today       = getLocalDateString();

  if (lastDrained === today) return;

  if (lastDrained) {
    const stage       = getStage(totalReads);
    const drainPerDay = getDrainPerDay(stage);
    if (drainPerDay > 0) {
      const lastDate  = new Date(lastDrained + 'T00:00:00');
      const todayDate = new Date(today + 'T00:00:00');
      const diffDays  = Math.floor((todayDate - lastDate) / (24 * 60 * 60 * 1000));
      const days      = Math.min(diffDays, 14);
      health          = Math.max(0, health - drainPerDay * days);
    }
  }

  await storageSet({ [STORAGE_KEY_HEALTH]: health, [STORAGE_KEY_HEALTH_DRAINED]: today });
}

// Build SVG markup for a single flower + stem + leaves.
// swayDuration > 0 enables the thriving sway animation.
function buildFlowerSVG(cx, cy, soilY, colors, healthState, swayDuration, swayDelay) {
  const { petal: petalColor, center: centerColor } = colors;
  const soilLocalY = soilY - cy;
  const mid        = (soilY + cy) / 2;
  const leafMidY   = soilY - (soilY - cy) * 0.4;

  // Stem
  let stemColor = '#6BAF8A', stemOpacity = 1, stemLean = 0;
  if (healthState === 'thirsty')   { stemOpacity = 0.6; }
  if (healthState === 'wilting')   { stemLean = 5;  stemOpacity = 0.7; }
  if (healthState === 'needs-you') { stemLean = 12; stemOpacity = 0.55; stemColor = '#aaa'; }
  if (healthState === 'bare')      { stemLean = 8;  stemOpacity = 0.45; stemColor = '#999'; }

  const stemPath = `<path d="M ${cx},${soilY} Q ${cx + stemLean},${mid} ${cx},${cy}" stroke="${stemColor}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="${stemOpacity}"/>`;

  // Leaves (hidden on bare / needs-you)
  let leaves = '';
  if (healthState !== 'bare' && healthState !== 'needs-you') {
    const lop  = healthState === 'wilting' ? 0.38 : (healthState === 'thirsty' ? 0.55 : 0.75);
    const rotL = healthState === 'wilting' ? -52 : -30;
    const rotR = healthState === 'wilting' ?  52 :  30;
    const llx = cx - 5, lly = leafMidY;
    const lrx = cx + 5, lry = leafMidY;
    leaves = `
      <ellipse cx="${llx}" cy="${lly}" rx="7" ry="2.2" fill="#8ADAB8" opacity="${lop}" transform="rotate(${rotL} ${llx} ${lly})"/>
      <ellipse cx="${lrx}" cy="${lry}" rx="7" ry="2.2" fill="#8ADAB8" opacity="${lop}" transform="rotate(${rotR} ${lrx} ${lry})"/>`;
  }

  // Petals & centre
  let petalsStr = '';
  let centreStr = '';

  if (healthState === 'healthy') {
    petalsStr = [0,30,60,90,120,150,180,210,240,270,300,330]
      .map(r => `<ellipse cx="0" cy="-10" rx="2.8" ry="10" fill="${petalColor}" opacity=".93" transform="rotate(${r})"/>`)
      .join('');
    centreStr = `<circle r="4" fill="${centerColor}" opacity=".95"/>`;

  } else if (healthState === 'thirsty') {
    petalsStr = [0,30,60,90,120,150,180,210,240,270,300,330]
      .map(r => `<ellipse cx="0" cy="-10" rx="2.8" ry="9" fill="${petalColor}" opacity=".55" transform="rotate(${r})"/>`)
      .join('');
    centreStr = `<circle r="4" fill="${centerColor}" opacity=".58"/>`;

  } else if (healthState === 'wilting') {
    // Per-petal explicit drooping angles — top near-upright, sides droop, bottom hang
    const wiltPetals = [
      [0, 0.55], [30, 0.55], [330, 0.55],
      [88, 0.4], [118, 0.4],
      [242, 0.4], [272, 0.4],
      [148, 0.32], [163, 0.30], [180, 0.28], [197, 0.30], [212, 0.32]
    ];
    petalsStr = wiltPetals.map(([angle, op]) =>
      `<ellipse cx="0" cy="-10" rx="2.8" ry="10" fill="${petalColor}" opacity="${op}" transform="rotate(${angle})"/>`
    ).join('');
    centreStr = `<circle r="4" fill="${centerColor}" opacity=".42"/>`;
    // Teardrop water drop near stem base (local space)
    const dropY = soilLocalY - 16;
    petalsStr += `<ellipse cx="3" cy="${dropY + 3}" rx="2.5" ry="3.5" fill="#a8d8ea" opacity=".5"/>
      <ellipse cx="3" cy="${dropY}" rx="1.5" ry="2" fill="#a8d8ea" opacity=".4"/>`;

  } else if (healthState === 'needs-you') {
    // Only 3 grey top petals remain
    const topPetals = [[0, 0.35], [30, 0.28], [330, 0.28]];
    petalsStr = topPetals.map(([angle, op]) =>
      `<ellipse cx="0" cy="-10" rx="2.8" ry="9" fill="#ccc" opacity="${op}" transform="rotate(${angle})"/>`
    ).join('');
    centreStr = `<circle r="4" fill="#aaa" opacity=".32"/>`;
    // Fallen petals scattered at soil level (local space)
    const fallenXs   = [-28, -18, -7, 4, 14, 24, 33, -38, 40];
    const fallenRots = [-25, 15, -10, 20, -15, 8, -22, 12, -5];
    fallenXs.forEach((px, i) => {
      const fy = soilLocalY - 1;
      const fc = i % 2 === 0 ? '#ddd' : '#ccc';
      const fo = (0.28 + (i % 3) * 0.04).toFixed(2);
      petalsStr += `<ellipse cx="${px}" cy="${fy}" rx="9" ry="2" fill="${fc}" opacity="${fo}" transform="rotate(${fallenRots[i]} ${px} ${fy})"/>`;
    });

  } else { // bare
    centreStr = `<circle r="3" fill="#bbb" opacity=".15"/>`;
  }

  // Sway inner wrapper (thriving + healthy only)
  let innerAttr = '';
  if (swayDuration > 0 && healthState === 'healthy') {
    innerAttr = ` style="transform-origin: 0px ${soilLocalY}px; animation: blooms-sway ${swayDuration}s ease-in-out ${swayDelay}s infinite;"`;
  }

  const flowerGroup = `<g transform="translate(${cx},${cy})"><g${innerAttr}>${petalsStr}${centreStr}</g></g>`;
  return stemPath + leaves + flowerGroup;
}

function buildSunSVG(opacity) {
  const cx = 138, cy = 14;
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const rad = (i * 45) * Math.PI / 180;
    const x1 = (cx + Math.cos(rad) * 8).toFixed(1);
    const y1 = (cy + Math.sin(rad) * 8).toFixed(1);
    const x2 = (cx + Math.cos(rad) * 13).toFixed(1);
    const y2 = (cy + Math.sin(rad) * 13).toFixed(1);
    rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#FFD93D" stroke-width="1.5" stroke-linecap="round" opacity="${(opacity * 0.85).toFixed(2)}"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="6" fill="#FFD93D" opacity="${opacity}"/>${rays}`;
}

function buildBeeSVG(opacity) {
  return `<g style="animation: blooms-beeDrift 4s ease-in-out infinite;" opacity="${opacity}">
    <ellipse cx="18" cy="18" rx="5" ry="3.5" fill="#FFD93D" opacity=".92"/>
    <line x1="15" y1="17.2" x2="21" y2="17.2" stroke="#7a6520" stroke-width="1" opacity=".6"/>
    <line x1="15.5" y1="18.8" x2="20.5" y2="18.8" stroke="#7a6520" stroke-width="1" opacity=".6"/>
    <ellipse cx="15.5" cy="15" rx="4" ry="2.5" fill="#C3A8E8" opacity=".72" transform="rotate(-20 15.5 15)"/>
    <ellipse cx="20.5" cy="15" rx="4" ry="2.5" fill="#C3A8E8" opacity=".72" transform="rotate(20 20.5 15)"/>
  </g>`;
}

function buildSparklesSVG(opacity) {
  const list = [
    { x: 70, y: 12, color: '#FFD93D', size: 9, dur: 2.5, delay: 0   },
    { x: 22, y: 40, color: '#C3A8E8', size: 8, dur: 2.0, delay: 0.7 },
    { x: 118, y: 30, color: '#FFD93D', size: 8, dur: 3.0, delay: 1.4 },
  ];
  return list.map(s =>
    `<text x="${s.x}" y="${s.y}" fill="${s.color}" font-size="${s.size}" text-anchor="middle" opacity="${(opacity * 0.85).toFixed(2)}" style="animation: blooms-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite;">✦</text>`
  ).join('');
}

function buildGrassSVG(healthState) {
  if (healthState === 'needs-you' || healthState === 'bare') return '';
  const op = healthState === 'wilting' ? 0.4 : 0.7;
  const soilY = GARDEN_SOIL_Y;
  const blades = [
    [14, -2, -1], [24, 2, 2], [36, -1, -2], [48, 3, 2], [62, -2, -3],
    [74, 1, 1], [90, -3, -2], [104, 2, 3], [116, -1, -1], [128, 3, 2], [140, -2, -2]
  ];
  return blades.map(([x, lean, leanTop], i) => {
    const stroke = i % 2 === 0 ? '#6BAF8A' : '#8ADAB8';
    return `<path d="M ${x},${soilY} Q ${x + lean},${soilY - 8} ${x + leanTop},${soilY - 14}" stroke="${stroke}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="${op}"/>`;
  }).join('');
}

function buildGardenSVG(stage, healthState) {
  const soilY = GARDEN_SOIL_Y;
  let content = '';

  // Soil line
  content += `<rect x="8" y="${soilY}" width="140" height="2.5" rx="1.2" fill="#C8DFC4" opacity=".5"/>`;

  if (stage === 'seeds') {
    const seedXs = [28, 50, 78, 106, 128];
    seedXs.forEach(x => {
      content += `<circle cx="${x}" cy="${soilY - 3}" r="2.5" fill="#C8DFC4" opacity=".7"/>`;
      content += `<path d="M ${x},${soilY - 3} Q ${x + 1},${soilY - 9} ${x},${soilY - 11}" stroke="#8ADAB8" stroke-width="1" fill="none" stroke-linecap="round" opacity=".5"/>`;
    });

  } else if (stage === 'sapling') {
    const cx = 78, budY = soilY - 42;
    const mid = (soilY + budY) / 2;
    const leafMidY = soilY - (soilY - budY) * 0.45;
    const llx = cx - 8, lly = leafMidY;
    const lrx = cx + 8, lry = leafMidY;

    let stemColor = '#6BAF8A', leafOp = 0.88, budOp = 0.85, tipOp = 0.7;
    if (healthState === 'thirsty')   { leafOp = 0.55; budOp = 0.55; tipOp = 0.55; }
    if (healthState === 'wilting')   { leafOp = 0.35; budOp = 0.45; tipOp = 0.35; }
    if (healthState === 'needs-you' || healthState === 'bare') {
      stemColor = '#aaa'; leafOp = 0; budOp = 0; tipOp = 0;
    }

    const rotL = healthState === 'wilting' ? -55 : -38;
    const rotR = healthState === 'wilting' ?  55 :  38;

    content += `<path d="M ${cx},${soilY} Q ${cx - 2},${mid} ${cx},${budY}" stroke="${stemColor}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
    if (leafOp > 0) {
      content += `<ellipse cx="${llx}" cy="${lly}" rx="9" ry="3.2" fill="#8ADAB8" opacity="${leafOp}" transform="rotate(${rotL} ${llx} ${lly})"/>`;
      content += `<ellipse cx="${lrx}" cy="${lry}" rx="9" ry="3.2" fill="#6BAF8A" opacity="${leafOp}" transform="rotate(${rotR} ${lrx} ${lry})"/>`;
    }
    if (budOp > 0) content += `<ellipse cx="${cx}" cy="${budY}" rx="3.5" ry="5" fill="#FFDDE8" opacity="${budOp}"/>`;
    if (tipOp > 0) content += `<ellipse cx="${cx}" cy="${budY - 4}" rx="2.2" ry="3" fill="#FFB6C1" opacity="${tipOp}"/>`;

  } else {
    // Flower stages: sprout, small-garden, full-garden, thriving
    const flowerDefs = [];

    if (stage === 'sprout') {
      flowerDefs.push({ cx: 78, cy: 52, ci: 0 });

    } else if (stage === 'small-garden') {
      flowerDefs.push({ cx: 44, cy: 56, ci: 0 });
      flowerDefs.push({ cx: 78, cy: 47, ci: 1 });
      flowerDefs.push({ cx: 112, cy: 52, ci: 2 });

    } else {
      // full-garden or thriving — small background flower first (rendered behind)
      flowerDefs.push({ cx: 94, cy: 63, ci: 2 });
      flowerDefs.push({ cx: 28, cy: 58, ci: 0, swayD: 4.2, swayDel: 0.3 });
      flowerDefs.push({ cx: 56, cy: 47, ci: 1, swayD: 3.5, swayDel: 0.9 });
      flowerDefs.push({ cx: 84, cy: 53, ci: 2, swayD: 5.0, swayDel: 0.0 });
      flowerDefs.push({ cx: 112, cy: 49, ci: 3, swayD: 3.8, swayDel: 1.4 });
      flowerDefs.push({ cx: 132, cy: 59, ci: 4, swayD: 4.6, swayDel: 0.6 });
    }

    // Thriving decorations
    if (stage === 'thriving') {
      const showDeco = healthState !== 'needs-you' && healthState !== 'bare';
      if (showDeco) {
        const decOp = healthState === 'thirsty' ? 0.5 : 1;
        if (healthState !== 'wilting') {
          content += buildSunSVG(decOp);
          content += buildBeeSVG(decOp);
        }
        content += buildGrassSVG(healthState);
      }
    }

    for (const fd of flowerDefs) {
      const colors  = GARDEN_FLOWER_COLORS[fd.ci];
      const swayD   = (stage === 'thriving' && healthState === 'healthy' && fd.swayD) ? fd.swayD : 0;
      const swayDel = fd.swayDel || 0;
      content += buildFlowerSVG(fd.cx, fd.cy, soilY, colors, healthState, swayD, swayDel);
    }

    // Thriving sparkles (drawn above everything)
    if (stage === 'thriving' && (healthState === 'healthy' || healthState === 'thirsty')) {
      content += buildSparklesSVG(healthState === 'thirsty' ? 0.5 : 1);
    }
  }

  // Animation keyframes injected into SVG (thriving only, prefixed to avoid conflicts)
  const styleStr = stage === 'thriving' ? `<style>
@keyframes blooms-sway {
  0%, 100% { transform: rotate(-2deg); }
  50% { transform: rotate(2deg); }
}
@keyframes blooms-beeDrift {
  0%, 100% { transform: translate(0px, 0px); }
  25% { transform: translate(3px, -2px); }
  50% { transform: translate(0px, -3px); }
  75% { transform: translate(-3px, -1px); }
}
@keyframes blooms-twinkle {
  0%, 100% { opacity: 0.2; transform: scale(0.8); }
  50% { opacity: 0.9; transform: scale(1.1); }
}
</style>` : '';

  return `<svg width="${GARDEN_SVG_W}" height="${GARDEN_SVG_H}" viewBox="0 0 ${GARDEN_SVG_W} ${GARDEN_SVG_H}" xmlns="http://www.w3.org/2000/svg">${styleStr}${content}</svg>`;
}

async function renderGarden() {
  const result     = await storageGet([STORAGE_KEY_TOTAL_READS, STORAGE_KEY_HEALTH]);
  const totalReads = result[STORAGE_KEY_TOTAL_READS] || 0;
  const health     = result[STORAGE_KEY_HEALTH] !== undefined ? result[STORAGE_KEY_HEALTH] : 100;
  const stage      = getStage(totalReads);
  const healthState = getHealthState(health);

  const container = document.getElementById('blooms-flowers');
  if (!container) return;
  container.innerHTML = buildGardenSVG(stage, healthState);
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

      // Garden: increment reads + recover health
      const gardenData = await storageGet([STORAGE_KEY_TOTAL_READS, STORAGE_KEY_HEALTH]);
      const newReads   = (gardenData[STORAGE_KEY_TOTAL_READS] || 0) + 1;
      const newStage   = getStage(newReads);
      const recovery   = getRecovery(newStage);
      const oldHealth  = gardenData[STORAGE_KEY_HEALTH] !== undefined ? gardenData[STORAGE_KEY_HEALTH] : 100;
      const newHealth  = Math.min(100, oldHealth + recovery);
      await storageSet({ [STORAGE_KEY_TOTAL_READS]: newReads, [STORAGE_KEY_HEALTH]: newHealth });
      renderGarden();
    } catch {}
  };

}

function renderEmpty(message = 'no nibble today :(') {
  document.getElementById('author-label').classList.add('hidden');
  document.getElementById('article-date').classList.add('hidden');
  document.getElementById('article-desc').classList.add('hidden');
  document.getElementById('article-title').textContent = message;
  document.getElementById('nibble-btn').style.display = 'none';
}


// ─── Shortcuts ────────────────────────────────────────────────────────────────

const ROW1_COUNT = 5;
const ROW2_COUNT = 2;

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
  chrome.storage.local.get([STORAGE_KEY_CUSTOM_SHORTCUTS], result => {
    const custom = result[STORAGE_KEY_CUSTOM_SHORTCUTS] || [];
    chrome.topSites.get(sites => {
      const row1 = document.getElementById('shortcuts-row-1');
      const row2 = document.getElementById('shortcuts-row-2');
      if (!row1 || !row2) return;

      // Merge: custom first, then topSites deduplicated by URL
      const customUrls = new Set(custom.map(c => c.url));
      const merged = [
        ...custom.map(c => ({ url: c.url, title: c.title })),
        ...sites.filter(s => !customUrls.has(s.url)),
      ];

      // Row 1: first 5
      merged.slice(0, ROW1_COUNT).forEach(site => row1.appendChild(buildShortcutCircle(site)));

      // Row 2: next 2
      const row2Sites = merged.slice(ROW1_COUNT, ROW1_COUNT + ROW2_COUNT);
      const overflow  = merged.slice(ROW1_COUNT + ROW2_COUNT);
      row2Sites.forEach(site => row2.appendChild(buildShortcutCircle(site)));

      // "More" — toggles a popup with overflow shortcuts
      if (overflow.length > 0) {
        const more = document.createElement('button');
        more.className = 'shortcut-item shortcut-more';
        const mCircle = document.createElement('div');
        mCircle.className = 'shortcut-circle';
        mCircle.textContent = '···';
        const mLabel = document.createElement('span');
        mLabel.className = 'shortcut-label';
        mLabel.textContent = 'more';
        more.appendChild(mCircle);
        more.appendChild(mLabel);

        // Build popup
        const popup = document.createElement('div');
        popup.id = 'more-popup';

        const popupGrid = document.createElement('div');
        popupGrid.id = 'more-popup-grid';
        overflow.forEach(site => popupGrid.appendChild(buildShortcutCircle(site)));

        popup.appendChild(popupGrid);
        more.appendChild(popup);

        more.onclick = (e) => {
          e.stopPropagation();
          const isOpen = more.classList.toggle('open');
          popup.classList.toggle('open', isOpen);
        };

        // Close popup when clicking outside
        document.addEventListener('click', () => {
          more.classList.remove('open');
          popup.classList.remove('open');
        });

        row2.appendChild(more);
      }

      // "Add" — always last in row 2
      const add = document.createElement('button');
      add.className = 'shortcut-item shortcut-add';
      const aCircle = document.createElement('div');
      aCircle.className = 'shortcut-circle';
      aCircle.textContent = '+';
      const aLabel = document.createElement('span');
      aLabel.className = 'shortcut-label';
      aLabel.textContent = 'add';
      add.appendChild(aCircle);
      add.appendChild(aLabel);
      add.addEventListener('click', openAddShortcutModal);
      row2.appendChild(add);
    });
  });
}


// ─── Add Shortcut Modal ───────────────────────────────────────────────────────

function openAddShortcutModal() {
  const overlay   = document.getElementById('shortcut-modal-overlay');
  const nameInput = document.getElementById('modal-name-input');
  const urlInput  = document.getElementById('modal-url-input');
  const errorEl   = document.getElementById('modal-error');

  nameInput.value = '';
  urlInput.value  = '';
  errorEl.textContent = '';
  overlay.classList.add('open');
  nameInput.focus();
}

function closeAddShortcutModal() {
  document.getElementById('shortcut-modal-overlay').classList.remove('open');
}

function isValidHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function saveCustomShortcut(title, url) {
  const result  = await storageGet([STORAGE_KEY_CUSTOM_SHORTCUTS]);
  const current = result[STORAGE_KEY_CUSTOM_SHORTCUTS] || [];
  const entry   = { id: Date.now().toString(), title, url, addedAt: Date.now() };
  await new Promise(resolve =>
    chrome.storage.local.set({ [STORAGE_KEY_CUSTOM_SHORTCUTS]: [entry, ...current] }, resolve)
  );
}

// Wire up modal once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const overlay   = document.getElementById('shortcut-modal-overlay');
  const saveBtn   = document.getElementById('modal-save-btn');
  const closeDot  = document.getElementById('modal-close-dot');
  const nameInput = document.getElementById('modal-name-input');
  const urlInput  = document.getElementById('modal-url-input');
  const errorEl   = document.getElementById('modal-error');
  const modal     = document.getElementById('shortcut-modal');

  closeDot.addEventListener('click', closeAddShortcutModal);

  // Close on outside click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeAddShortcutModal();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeAddShortcutModal();
    }
  });

  // Stop clicks inside modal from bubbling to overlay
  modal.addEventListener('click', (e) => e.stopPropagation());

  saveBtn.addEventListener('click', async () => {
    const title = nameInput.value.trim();
    const url   = urlInput.value.trim();

    errorEl.textContent = '';

    if (!title) { errorEl.textContent = 'please enter a name.'; return; }
    if (!isValidHttpUrl(url)) { errorEl.textContent = 'please enter a valid http/https url.'; return; }

    await saveCustomShortcut(title, url);
    closeAddShortcutModal();

    // Re-render shortcuts with the new entry
    const row1 = document.getElementById('shortcuts-row-1');
    const row2 = document.getElementById('shortcuts-row-2');
    row1.innerHTML = '';
    row2.innerHTML = '';
    renderShortcuts();
  });
});


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
