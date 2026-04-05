# Nibble — Product Specification

**Version:** 1.3
**Last updated:** 2026-04-05

---

## What is Nibble?

Nibble is a Chrome browser extension that helps people work through their newsletter reading backlog — one article a day. It targets users who subscribe to many email newsletters but can't keep up with them in an overcrowded inbox.

**Core idea:** Instead of reading newsletters in Gmail, the user "stars" interesting emails as they arrive. Nibble quietly picks one starred newsletter each day and surfaces it on the new tab page. One article, one nibble, no pressure.

---

## How It Works — End to End

### Setup
1. User installs the Chrome extension.
2. On first load, Nibble requests Gmail read access via Google OAuth (Chrome Identity API, `interactive: true`). The extension uses the OAuth2 client ID `149091077220-fjfe97pher3520kkt4b734do60bhqise.apps.googleusercontent.com` with scope `gmail.readonly`.
3. No separate configuration is required — the extension is immediately active.

### Daily Workflow
1. User receives newsletters in Gmail and stars anything interesting (using Gmail's native star feature).
2. Every time the user opens a new tab, Nibble's page loads.
3. Nibble selects one newsletter to show for the day.
4. The user can click **Nibble** to read it, which opens the article in a new tab.

### Article Selection Logic (in order)

```
Open new tab
    │
    ▼
Is there a current article saved for today?
    │ YES → Show it (same article all day)
    │ NO  ▼
Load local article store (chrome.storage.local)
    │
    ▼
Filter out already-seen articles (localStorage)
    │
    ├─ Unseen articles exist? → Pick one randomly → Save as today's → Show
    │
    ├─ All articles seen? → Show empty state: "all nibbled up! ✦ star more newsletters to see them here"
    │
    └─ No local articles at all?
            │
            ▼
        Fetch from Gmail API (up to 50 starred emails, in batches of 10)
            │
            ▼
        Filter to newsletters only (see: Newsletter Filter)
        Stop once 5 valid newsletters found
            │
            ├─ Found some → Merge into local store → Pick one randomly → Show
            │
            └─ Found none → Show empty state ("no nibble today :(")
```

### Newsletter Filter

When parsing Gmail messages, only emails that pass all of these checks become articles:

1. **Must have a `List-Unsubscribe` header** — the clearest signal that something is a newsletter, not a transactional email.
2. **Sender address must not match any exclude pattern** (checked as lowercase):
   - `noreply`, `no-reply`, `donotreply`
   - `notifications@`, `alert@`, `support@`
   - `booking`, `indigo`, `makemytrip`, `cleartrip`
   - `zomato`, `swiggy`, `amazon`, `flipkart`
   - `bank`, `hdfc`, `icici`, `sbi`, `axis`

These patterns exclude automated notifications, travel booking confirmations, food delivery updates, and banking alerts.

### Article Object (stored in chrome.storage.local)

| Field | Type | Description |
|---|---|---|
| `id` | string | Gmail message ID |
| `title` | string | Email subject line |
| `author` | string | Sender display name |
| `source` | string | Sender's email domain (e.g. `substack.com`) |
| `url` | string | "View in browser" link from email body, or fallback to Gmail starred URL |
| `description` | string | First 30 words of plain-text body (or stripped HTML) |
| `receivedAt` | number | Timestamp from `Date` email header |
| `read` | boolean | Set to `true` when user clicks Nibble button |
| `addedAt` | number | Timestamp when added to local store |

### "View in Browser" URL Extraction

Nibble parses the HTML body of each email looking for anchor tags whose visible text matches any of:
- "view in browser"
- "view online"
- "read online"
- "view as webpage"
- "view this email in your browser"

If a match is found and the href starts with `http`, that URL is used. Otherwise, Nibble falls back to the Gmail direct link: `https://mail.google.com/mail/u/0/#starred/{messageId}`.

### Storage

| Location | Key | What it stores |
|---|---|---|
| `chrome.storage.local` | `nibble_articles` | Full array of all fetched article objects |
| `chrome.storage.local` | `nibble_current` | `{ id, date }` — today's selected article |
| `chrome.storage.local` | `nibble_custom_shortcuts` | Array of user-added shortcuts: `{ id, title, url, addedAt }` |
| `chrome.storage.local` | `nibble_theme` | Active theme key (`"default"`, `"matcha"`, `"oceandrift"`, or `"inkrose"`); absent = default |
| `localStorage` | `nibble_seen` | Array of article IDs already shown on previous days |

---

## Chrome Extension Details

- **Manifest version:** 3
- **Override:** Replaces Chrome's default new tab page (`newtab.html`)
- **Permissions:**
  - `identity` — OAuth token via Chrome Identity API
  - `storage` — `chrome.storage.local` for article persistence
  - `topSites` — Chrome's most-visited sites for Shortcuts
  - `sessions` — Recently closed tabs for the Tabs panel
  - `tabs` — Tab access
- **Host permissions:** `https://www.googleapis.com/*` — Gmail API calls
- **Web accessible resources:** `assets/deco/*.svg` (matched on `<all_urls>`) so `newtab.js` can fetch theme decoration SVGs

---

## UI Layout

The page is a single, centred composition. Everything is visible at once — no scrolling.

```
┌──────────────────────────────────────────────────────────────┐
│              "your nibble for the day"  (heading)            │
│                                                              │
│  ┌─────────────┐    [cookie mascot]    ┌─────────────────┐   │
│  │ TABS.SYS    │   ┌─────────────────┐ │  BLOOMS.SYS     │   │
│  │             │   │   nibble.exe    │ │                 │   │
│  │ (recently   │   │  Author @ src   │ │  ✿ today's     │   │
│  │  closed     │   │  Date           │ │    garden ✿    │   │
│  │  tabs)      │   │  Article title  │ │                 │   │
│  │             │   │  Description    │ │  (6 SVG flowers)│   │
│  └─────────────┘   │  [Nibble btn]   │ └─────────────────┘   │
│                    └─────────────────┘                       │
│                                                              │
│            ○ ○ ○ ○ ○   (shortcuts row 1)                     │
│              ○ ○ [···] [+]  (shortcuts row 2)                │
│                                                              │
│  [kawaii characters floating on left and right edges]        │
└──────────────────────────────────────────────────────────────┘
```

The background is a blush pink (#FFF8FA) with a subtle pink grid pattern (39px squares, `rgba(255,182,193,.28)`).

---

## Components

### 1. Page Heading
- Text: **"your nibble for the day"**
- Font: Press Start 2P (pixel/retro font), 14px, berry color (`#C4527A`), letter-spacing 3px

### 2. Cookie Mascot
- A kawaii cookie character sits above the main article card, overlapping it slightly (`margin-bottom: -20px`, `z-index: 25`).
- 80px wide, with a pink drop-shadow.
- **Rotates daily** — index is calculated as `Math.floor(Date.now() / 86400000) % 8`, so it changes at UTC midnight.
- **8 variations:**
  1. `cookie_sparkle.png`
  2. `cookie_wink.png`
  3. `cookie_shy.png`
  4. `cookie_sleepy.png`
  5. `cookie_excited.png`
  6. `cookie_cup.png`
  7. `cookie_strawberry.png`
  8. `cookie_heart.png`

### 3. Nibble Card (`nibble.exe`)
The main article display — a white window-style card (510px wide) with:
- Berry-colored border (`#C4527A`), 2.5px, with a solid 7px drop shadow
- A pink (`#FFB6C1`) title bar with macOS-style red/yellow/green traffic light dots labeled **"nibble.exe"**
- Gentle floating animation (5s ease-in-out loop, ±7px vertical)

**Contents (top to bottom):**
| Element | Details |
|---|---|
| Author pill | `Author @ domain.com` — outlined pink pill, 8px font |
| Date | Formatted as "Mon DD, YYYY" (e.g. "Apr 3, 2026"), 9px, muted berry |
| Article title | Email subject, 13px, dark text (`#3d1a28`), centered, 1.85 line-height |
| Description | First 30 words of email body, 7px, muted, up to 370px wide |
| Nibble button | Berry-colored pill button — opens article URL in new tab, marks as read |

**Empty state:** The author pill, date, description, and button are all hidden. Two messages are possible:
- `"no nibble today :("` — no newsletters found in Gmail at all
- `"all nibbled up! ✦ star more newsletters to see them here"` — all fetched newsletters have already been shown; the seen list is **not** reset

**Nibble button behavior:**
- Opens `article.url` in a new tab
- Marks the article's `read` field as `true` in storage

### 4. TABS.SYS (Recently Closed Tabs)
- Left panel, 200px wide
- Yellow-tinted window (`#FFFCF4`, `#FFF3BF` title bar) labeled **"continue.tabs.sys"**
- Shows up to **4 recently closed tabs** from `chrome.sessions.getRecentlyClosed({ maxResults: 8 })`
- Each tab item shows: favicon (14×14px) + title truncated to 28 characters
- Hover: subtle yellow highlight
- Empty state: "nothing here yet ♡"

### 5. BLOOMS.SYS (Bloom Garden)
- Right panel, 200px wide
- Mint-tinted window (`#f2fffb`, mint border/shadow) labeled **"BLOOMS.SYS"**
- Sub-label: **"✿ today's garden ✿"**
- Renders **6 SVG flowers**, each 36×36px
- Each flower: 6 petals (circles at hex positions, radius 6, opacity 0.85) + center circle (radius 5, opacity 0.7)
- **6 color pairs** (petal / center):
  1. `#FFB6C1` / `#C4527A` (pink/berry)
  2. `#C3A8E8` / `#7a2040` (lavender/dark berry)
  3. `#8ADAB8` / `#2d7a5a` (mint/dark green)
  4. `#FFD93D` / `#7a6520` (yellow/dark gold)
  5. `#FFB6C1` / `#7a2040` (pink/dark berry)
  6. `#FFDDE8` / `#C4527A` (light pink/berry)

> Note: The flowers are currently static (same palette every day). The "daily" aspect mentioned in the product vision is not yet implemented in code.

### 6. Shortcuts
- Two rows of circular shortcut buttons below the main card
- Sourced from `chrome.topSites.get()` (Chrome's most-visited sites)
- **Row 1:** 5 shortcuts
- **Row 2:** 2 shortcuts + optional "More" button + always-present "Add" button

**Shortcut circle design:**
- 52×52px white circle, pink border + 3px pink shadow
- Shows Google favicon (32px, via `https://www.google.com/s2/favicons?domain=X&sz=32`)
- Label below: site title truncated to 10 characters, 9px font
- Hover: 1px translate + reduced shadow

**"More" button (lavender):** Appears when there are more than 7 top sites. Clicking toggles a popup showing overflow shortcuts in a horizontal grid of 4 columns. If there are more than 8 overflow shortcuts (2 rows of 4), the popup becomes vertically scrollable. Closes on any outside click.

**"Add" button (yellow):** Always shown last in row 2. Clicking opens the `add.shortcut` modal (see below). Custom shortcuts are saved to `chrome.storage.local` under `nibble_custom_shortcuts` as an array of `{ id, title, url, addedAt }`. They are merged with `topSites` results in the shortcuts row — custom shortcuts appear first, deduplicated by URL.

**`add.shortcut` modal:**
- Matches the OS-window aesthetic: berry border, pink title bar, traffic-light dots, Press Start 2P font
- Soft drop shadow: `0 8px 32px rgba(196, 82, 122, 0.18)`
- Fields: **name** (label 9px) and **url** (label 9px), input text 10px
- Validates that the URL is a valid `http`/`https` URL before saving; shows an inline error if not
- Closes on: red dot click, outside click (overlay), or Escape key
- On save, the shortcuts row re-renders immediately without a page reload

### 7. Theme Switcher

A floating pill button fixed to the **bottom-right corner** (`bottom: 24px; right: 24px`) that lets the user change the page's color theme.

**Button:**
- Label: `✦ set the vibe ✦` in Press Start 2P, 9px
- Shape: pill (`border-radius: 999px`)
- Background: `var(--surface-bg)`, border: `1px solid var(--soft-border)`
- Shadow: `0 4px 16px var(--card-ambient-shadow)` (soft only — no hard offset)
- `z-index: 300` (above all other layers)
- Clicking toggles the picker panel open/closed

**Picker panel:**
- Appears directly above the button, right-aligned
- Small rounded card with the same soft shadow and border as the button
- No title bar — just a list of theme rows
- Closes when clicking anywhere outside

**Theme rows:**
Each row contains a swatch cluster (3 × 12px circles with slight overlap), the theme name in Press Start 2P at 8px, and a `✓` checkmark (in `var(--accent)`) on the active row. Hover tints the row with `var(--page-grid-color)`.

**Available themes:**

| Key | Display name | Swatch colours |
|---|---|---|
| `default` | cherry blossom | `#FFF8FA`, `#FFB6C1`, `#C4527A` |
| `matcha` | matcha | `#F4FAF6`, `#A8C5A0`, `#3D6B4F` |
| `oceandrift` | ocean drift | `#EDF6F9`, `#83C5BE`, `#006D77` |
| `inkrose` | ink & rose | `#1C1014`, `#8B3A56`, `#E8759A` |

**Theme application:**
- Themes are implemented as CSS `[data-theme="key"]` overrides on `<body>` that re-define all design tokens. The `default` theme removes the `data-theme` attribute entirely so the `:root` defaults apply.
- The selected theme is saved to `chrome.storage.local` under `nibble_theme` and restored on every page load.
- All UI components use `var()` tokens throughout, so they re-skin automatically when the theme changes.
- The decoration layer is also theme-swapped in `applyTheme(theme)`: it fetches `assets/deco/${themeKey}.svg` (`themeKey = "default"` when unset) and replaces `#deco-layer` via `outerHTML`.
- Decoration fetch failures are intentionally silent; if a file fails to load, the current decoration layer remains in place.

### 8. Kawaii Characters
Six floating kawaii characters positioned around the left and right edges of the screen. They are purely decorative (`pointer-events: none`).

| ID | Image | Position | Animation |
|---|---|---|---|
| `kc-cloudclock` | `char_cloudclock.png` (66px) | Left, 11% / 12% | float3 (8s) |
| `kc-plantpot` | `char_plantpot.png` (62px) | Left, 11% / 40% | float2 (6s) |
| `kc-moon` | `char_moon.png` (62px) | Left, 11% / 65% | float (7s) |
| `kc-blob` | `char_blob.png` (56px) | Right, 11% / 12% | float2 (7s) |
| `kc-notebook` | `char_notebook.png` (66px) | Right, 11% / 40% | float3 (5.5s) |
| `kc-toast` | `char_toast.png` (66px) | Right, 11% / 65% | float2 (6.5s) |

**Three float animations:**
- `float`: pure vertical, ±7px
- `float2`: vertical ±5px + slight rotation (−2° to +2°)
- `float3`: vertical ±6px + slight rotation (+1° to −1°)

Note: A 7th character asset (`char_shoe.png`) and an 8th (`char_workout.png`) exist in the assets folder but are not used in the current layout.

### 9. Decoration Layer
The decoration layer is loaded dynamically per theme from standalone SVG files in `assets/deco/`.

- `newtab.html` contains an empty placeholder: `<div id="deco-layer"></div>`
- On init, `applyTheme(savedTheme)` runs after reading `nibble_theme`, so the correct decoration SVG is injected immediately on every new tab open.
- Each SVG uses `id="deco-layer"`, `position: fixed`, `width="100%"`, `height="100%"`, `pointer-events: none`, and `z-index: 3`.

`assets/deco/default.svg` (cherry blossom) contains:
- **Flowers** (circle-petal style): 6 variations in pink/blush at various corners
- **Four-petal flowers** (ellipse style): 2 variations in pink/blush on left and right edges
- **Sparkle stars** (8-pointed path): 8 variations across the page
- **5-pointed star outlines** (polygon): 5 scattered instances in pink/lavender
- **Heart outlines** (path): 5 instances in pink/berry
- **Loose dots**: 7 small circles in pink/lavender/berry
- **Leaf clusters** (ellipse groups): 2 in mint green at bottom corners
- **Plus signs**: 4 small crosses in pink/lavender

`assets/deco/matcha.svg` keeps the same element count, positions, and spread, but is reskinned:
- Flowers recoloured to sage tones (`#A8C5A0`, `#C8DFC4`)
- Four-petal flowers recoloured (`#8ABF94`, `#C8DFC4`)
- Sparkle stars recoloured (`#3D6B4F`, `#A8C5A0`)
- 5-pointed star outlines recoloured (`#A8C5A0`, `#6BAF8A`)
- Heart outlines replaced with simple leaf-outline paths (`#3D6B4F`, `#6BAF8A`)
- Loose dots recoloured (`#A8C5A0`, `#6BAF8A`, `#3D6B4F`)
- Leaf clusters deepened (`#6BAF8A`, `#3D6B4F`)
- Plus signs recoloured (`#A8C5A0`, `#8ABF94`)

`assets/deco/oceandrift.svg` keeps the same fixed full-screen structure and comparable visual density/spread, with coastal reskin motifs:
- Coral/anemone-style bloom clusters in mixed cool + warm tones (`#83C5BE`, `#CDECEC`, `#FFDDD2`, `#E29578`)
- Bubble-cluster shimmer marks replacing sparkle paths (still edge-distributed at similar positions)
- Pale aqua/teal star outlines retained (`#CDECEC`, `#83C5BE`, `#DDF3F1`)
- Shell-like outline motifs replacing hearts (`#E29578`, `#FFDDD2`, `#8C5B4D`)
- Loose dots recoloured to ocean + shell accents (`#83C5BE`, `#5E7B80`, `#006D77`, `#E29578`)
- Soft rounded seaweed frond clusters at the lower corners (`#83C5BE`, `#67B5AE`, `#CDECEC`)
- Plus signs retained and recoloured to teal/aqua (`#83C5BE`, `#CDECEC`, `#006D77`)

`assets/deco/inkrose.svg` keeps the same element count, positions, and spread as `default.svg`, but is reskinned:
- Flowers recoloured to rose/mauve/blush (`#8B3A56`, `#A0728B`, `#D8A8B8`)
- Sparkles recoloured (`#E8759A`, `#D8A8B8`)
- 5-pointed star outlines recoloured (`#A0728B`, `#8B3A56`)
- Heart outlines recoloured (`#E8759A`, `#8B3A56`)
- Loose dots recoloured with rose/plum tones (`#8B3A56`, `#A0728B`, `#D8A8B8`, `#E8759A`, `#24161B`)
- Leaf clusters deepened (`#355E4D`, `#24161B`)
- Plus signs recoloured (`#8B3A56`, `#A0728B`)

---

## Design System

### Theming Architecture

All colours are defined as CSS custom properties on `:root`. Theme overrides are applied via `[data-theme="key"]` blocks on `<body>` that redefine any tokens that change. Components reference only `var()` tokens — no hardcoded hex values — so they re-skin automatically.

**Theme keys:**
- `default` — no `data-theme` attribute; `:root` values apply (cherry blossom palette)
- `matcha` — `data-theme="matcha"` on `<body>`
- `oceandrift` — `data-theme="oceandrift"` on `<body>`
- `inkrose` — `data-theme="inkrose"` on `<body>`

### Colors (CSS Custom Properties)

**Semantic tokens (used by all components):**

| Token | Default value | Usage |
|---|---|---|
| `--page-bg` | `#FFF8FA` | Page background |
| `--page-grid-color` | `rgba(255,182,193,.28)` | Background grid lines |
| `--accent` | `#C4527A` | Primary action color, headings, checkmarks |
| `--accent-dark` | `#7a2040` | Button shadow, deep accent |
| `--surface-bg` | `#fff` | Card / modal / button background |
| `--text-primary` | `#3d1a28` | Primary body text |
| `--heading-color` | `#C4527A` | Page heading |
| `--article-date-color` | `#8a5070` | Article date |
| `--article-desc-color` | `#8a6a74` | Article description |
| `--titlebar-bg` | `#FFB6C1` | Window title bar background |
| `--soft-border` | `#FFB6C1` | Card / modal borders |
| `--popup-border` | `#FFDDE8` | Popup / overflow panel borders |
| `--mascot-shadow` | `rgba(196,82,122,.25)` | Cookie mascot drop-shadow |
| `--card-ambient-shadow` | `rgba(196,82,122,.12)` | Soft ambient shadow (theme switcher, panels) |
| `--modal-overlay-bg` | `rgba(196,82,122,.18)` | Shortcut modal backdrop |
| `--popup-shadow` | `rgba(196,82,122,.13)` | Overflow popup shadow |
| `--char-shadow` | `rgba(196,82,122,.18)` | Kawaii character shadows |
| `--tabs-bg` | `#FFFCF4` | TABS.SYS panel background |
| `--tabs-accent` | `#FFF3BF` | TABS.SYS title bar |
| `--tabs-text` | `#7a6520` | TABS.SYS text |
| `--tab-hover-bg` | `rgba(226,208,117,.2)` | Tab item hover tint |
| `--blooms-bg` | `#f2fffb` | BLOOMS.SYS panel background |
| `--blooms-border` | `#8ADAB8` | BLOOMS.SYS border/shadow |
| `--blooms-titlebar-bg` | `#D4F5E9` | BLOOMS.SYS title bar |
| `--blooms-text` | `#2d7a5a` | BLOOMS.SYS text |
| `--more-btn-bg` | `#E8D5F5` | "More" shortcut button background |
| `--more-btn-border` | `#C3A8E8` | "More" shortcut button border |
| `--more-btn-color` | `#6b3fa0` | "More" shortcut button text |
| `--add-btn-bg` | `#FFF3CC` | "Add" shortcut button background |
| `--add-btn-border` | `#E2D075` | "Add" shortcut button border |
| `--add-btn-color` | `#7a6520` | "Add" shortcut button text |
| `--grid-size` | `40px` | Background grid spacing |

**Ink & Rose theme overrides (`[data-theme="inkrose"]`):**

| Token | Ink & Rose value |
|---|---|
| `--page-bg` | `#1C1014` |
| `--page-grid-color` | `rgba(232, 117, 154, 0.12)` |
| `--accent` | `#E8759A` |
| `--accent-dark` | `#5A2034` |
| `--surface-bg` | `#2B1B22` |
| `--text-primary` | `#F5E6EC` |
| `--heading-color` | `#E8759A` |
| `--article-date-color` | `#C89AAA` |
| `--article-desc-color` | `#B88A9B` |
| `--titlebar-bg` | `#8B3A56` |
| `--soft-border` | `#8B3A56` |
| `--popup-border` | `#B76883` |
| `--tabs-bg` | `#332028` |
| `--tabs-accent` | `#A55B75` |
| `--tabs-text` | `#F2D9E2` |
| `--tab-hover-bg` | `rgba(232, 117, 154, 0.16)` |
| `--blooms-bg` | `#38242C` |
| `--blooms-border` | `#C27A95` |
| `--blooms-titlebar-bg` | `#A55B75` |
| `--blooms-text` | `#F7E7ED` |
| `--more-btn-bg` | `#3A2530` |
| `--more-btn-border` | `#A0728B` |
| `--more-btn-color` | `#F0D8E2` |
| `--add-btn-bg` | `#472A35` |
| `--add-btn-border` | `#D07A9A` |
| `--add-btn-color` | `#FFE9F1` |
| Shadow tokens | `--mascot-shadow`, `--card-ambient-shadow`, `--modal-overlay-bg`, `--popup-shadow`, and `--char-shadow` are dark rose/plum variants |

**Matcha theme overrides (`[data-theme="matcha"]`):**

| Token | Matcha value |
|---|---|
| `--page-bg` | `#F4FAF6` |
| `--page-grid-color` | `rgba(168,197,160,.25)` |
| `--accent` | `#3D6B4F` |
| `--accent-dark` | `#2A4A36` |
| `--text-primary` | `#1A2E22` |
| `--heading-color` | `#3D6B4F` |
| `--article-date-color` | `#4A7A5A` |
| `--article-desc-color` | `#5A7A64` |
| `--titlebar-bg` | `#A8C5A0` |
| `--soft-border` | `#A8C5A0` |
| `--popup-border` | `#C8DFC4` |
| `--tabs-bg` | `#FAFFF4` |
| `--tabs-accent` | `#D4EDDA` |
| `--tabs-text` | `#3D6B4F` |
| `--tab-hover-bg` | `rgba(168,197,160,.2)` |
| `--blooms-bg` | `#F0FBF4` |
| `--blooms-border` | `#6BAF8A` |
| `--blooms-titlebar-bg` | `#B8E8CC` |
| `--blooms-text` | `#2A5A40` |
| `--more-btn-bg` | `#D5EDD8` |
| `--more-btn-border` | `#8ABF94` |
| `--more-btn-color` | `#2A5A40` |
| `--add-btn-bg` | `#EDFAF0` |
| `--add-btn-border` | `#8ABF94` |
| `--add-btn-color` | `#3D6B4F` |
| Shadow tokens | Adjusted to `rgba(61,107,79,…)` equivalents |

**Ocean Drift theme overrides (`[data-theme="oceandrift"]`):**

| Token | Ocean Drift value |
|---|---|
| `--page-bg` | `#EDF6F9` |
| `--page-grid-color` | `rgba(131, 197, 190, 0.20)` |
| `--accent` | `#006D77` |
| `--accent-dark` | `#004F57` |
| `--surface-bg` | `#FCFEFF` |
| `--text-primary` | `#1F3A40` |
| `--heading-color` | `#006D77` |
| `--article-date-color` | `#5E7B80` |
| `--article-desc-color` | `#6E8B90` |
| `--titlebar-bg` | `#83C5BE` |
| `--soft-border` | `#67B5AE` |
| `--popup-border` | `#CDECEC` |
| `--tabs-bg` | `#FFF4EF` |
| `--tabs-accent` | `#FFDDD2` |
| `--tabs-text` | `#8C5B4D` |
| `--tab-hover-bg` | `rgba(226, 149, 120, 0.18)` |
| `--blooms-bg` | `#F3FCFC` |
| `--blooms-border` | `#83C5BE` |
| `--blooms-titlebar-bg` | `#CDECEC` |
| `--blooms-text` | `#006D77` |
| `--more-btn-bg` | `#DDF3F1` |
| `--more-btn-border` | `#83C5BE` |
| `--more-btn-color` | `#006D77` |
| `--add-btn-bg` | `#FFF1EC` |
| `--add-btn-border` | `#E29578` |
| `--add-btn-color` | `#8C5B4D` |
| `--grid-size` | `40px` |
| Shadow tokens | Adjusted to `rgba(0,109,119,…)` equivalents |

### Typography
- **Font:** Press Start 2P (Google Fonts) — a pixel/retro monospace font used throughout
- **Sizes in use:** 5.5px, 7px, 8px, 9px, 10px, 13px, 14px, 20px

### UI Aesthetic — "Cozy Retro"
All panels are styled as skeuomorphic OS windows:
- Traffic light dots (red/yellow/green)
- Solid-offset box shadows (flat, no blur — gives a "pixel art" feel)
- `border-radius: 12–14px` for softness
- Window title labels in lowercase, styled like system filenames (e.g. `nibble.exe`, `BLOOMS.SYS`, `continue.tabs.sys`)

Button hover interactions use a 2px translate + reduced shadow to simulate a "press" effect.

---

## Files

```
nibble/
├── manifest.json          Chrome extension config (MV3)
├── newtab.html            Full page — HTML structure + all CSS
├── newtab.js              All application logic
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── assets/
    ├── cookies/           Cookie mascot variants (8 files)
    │   ├── cookie_sparkle.png
    │   ├── cookie_wink.png
    │   ├── cookie_shy.png
    │   ├── cookie_sleepy.png
    │   ├── cookie_excited.png
    │   ├── cookie_cup.png
    │   ├── cookie_strawberry.png
    │   └── cookie_heart.png
    ├── characters/        Kawaii characters (8 files, 6 in use)
    │   ├── char_cloudclock.png   ✓ used
    │   ├── char_plantpot.png     ✓ used
    │   ├── char_moon.png         ✓ used
    │   ├── char_blob.png         ✓ used
    │   ├── char_notebook.png     ✓ used
    │   ├── char_toast.png        ✓ used
    │   ├── char_shoe.png         ✗ not used
    │   └── char_workout.png      ✗ not used
    └── deco/              Theme decoration SVG layers
        ├── default.svg    Cherry blossom decoration layer
        ├── inkrose.svg    Ink & Rose decoration layer
        ├── matcha.svg     Matcha decoration layer
        └── oceandrift.svg Ocean Drift decoration layer
```

---

## Known Gaps / Not Yet Implemented

| Feature | Status |
|---|---|
| Bloom garden changes daily | Not implemented — flowers are static (same 6 colors every day) |
| `char_shoe.png` and `char_workout.png` | Assets exist but not placed on screen |
| Article refresh / manual re-fetch | No way for user to force a new fetch without clearing storage |
| Seen-list persistence across browser profiles | `localStorage` is tab-page local; won't sync across devices |
| Additional themes | Four themes currently exist (cherry blossom, matcha, ocean drift, ink & rose); picker supports more rows |
