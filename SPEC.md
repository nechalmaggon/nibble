# Nibble — Product Specification

**Version:** 1.0
**Last updated:** 2026-04-03

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
    ├─ All articles seen? → Reset seen list → Pick randomly from all → Show
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

**Empty state:** If no newsletters are found, title shows "no nibble today :(" and the author pill, date, description, and button are all hidden.

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

**"More" button (lavender):** Appears when there are more than 7 top sites. Clicking toggles a popup showing overflow shortcuts in a wrapped grid. Closes on any outside click.

**"Add" button (yellow):** Always shown last in row 2. Currently renders the + button but has no click handler implemented — adding custom shortcuts is not yet functional.

### 7. Kawaii Characters
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

### 8. Decoration Layer
An SVG layer (`z-index: 3`) fills the entire background with scattered decorative elements:
- **Flowers** (circle-petal style): 6 variations in pink/blush at various corners
- **Four-petal flowers** (ellipse style): 2 variations in pink/blush on left and right edges
- **Sparkle stars** (8-pointed path): 8 variations across the page
- **5-pointed star outlines** (polygon): 5 scattered instances in pink/lavender
- **Heart outlines** (path): 5 instances in pink/berry
- **Loose dots**: 7 small circles in pink/lavender/berry
- **Leaf clusters** (ellipse groups): 2 in mint green at bottom corners
- **Plus signs**: 4 small crosses in pink/lavender

---

## Design System

### Colors (CSS Custom Properties)

| Token | Value | Usage |
|---|---|---|
| `--blush` | `#FFF8FA` | Page background |
| `--pink` | `#FFB6C1` | Primary accent, borders |
| `--pink-dark` | `#FFDDE8` | Light pink, popup borders |
| `--berry` | `#C4527A` | Primary action color, headings |
| `--berry-dark` | `#7a2040` | Button shadow, deep accent |
| `--lavender` | `#E8D5F5` | "More" button background |
| `--lavender-2` | `#C3A8E8` | "More" button border/shadow |
| `--yellow` | `#FFF3CC` | Tabs panel background |
| `--yellow-2` | `#E2D075` | Tabs panel border/shadow |
| `--mint` | `#D4F5E9` | Blooms panel title bar |
| `--mint-2` | `#8ADAB8` | Blooms panel border/shadow |
| `--peach` | `#FFECD2` | Defined but unused |
| `--text-dark` | `#3d1a28` | Primary body text |
| `--grid-size` | `39px` | Background grid spacing |

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
    └── characters/        Kawaii characters (8 files, 6 in use)
        ├── char_cloudclock.png   ✓ used
        ├── char_plantpot.png     ✓ used
        ├── char_moon.png         ✓ used
        ├── char_blob.png         ✓ used
        ├── char_notebook.png     ✓ used
        ├── char_toast.png        ✓ used
        ├── char_shoe.png         ✗ not used
        └── char_workout.png      ✗ not used
```

---

## Known Gaps / Not Yet Implemented

| Feature | Status |
|---|---|
| Bloom garden changes daily | Not implemented — flowers are static (same 6 colors every day) |
| "Add" shortcut button | Renders but has no click handler; custom shortcuts not supported |
| `char_shoe.png` and `char_workout.png` | Assets exist but not placed on screen |
| Article refresh / manual re-fetch | No way for user to force a new fetch without clearing storage |
| Seen-list persistence across browser profiles | `localStorage` is tab-page local; won't sync across devices |
