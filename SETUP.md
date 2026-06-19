# Setting Up Nibble

Nibble is a Chrome extension that surfaces one starred newsletter from your Gmail everyday on a new tab. Follow the steps below to get it running locally.



## What You'll Need

- Google Chrome
- A Google account (the one you use for Gmail)
- About 10 minutes



## Step 1 — Download the Repository

1. Go to [github.com/nechalmaggon/nibble](https://github.com/nechalmaggon/nibble)
2. Click the green **Code** button → **Download ZIP**
3. Unzip the folder somewhere easy to find, like your Desktop

> If you're comfortable with Git, you can also run:
> ```
> git clone https://github.com/nechalmaggon/nibble.git
> ```



## Step 2 — Create a Google Cloud Project

Nibble reads your starred Gmail messages. To do that, it needs permission from Google — which you set up once through Google Cloud.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Sign in with the Google account you want to use with Nibble
3. Click **Select a project** at the top → **New Project**
4. Give it any name (e.g. `nibble`) and click **Create**
5. Make sure your new project is selected in the top dropdown before continuing



## Step 3 — Enable the Gmail API

1. In the left sidebar, go to **APIs & Services → Library**
2. Search for **Gmail API**
3. Click it and then click **Enable**



## Step 4 — Configure the OAuth Consent Screen

This is the screen users see when they're asked to grant Gmail access.

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** and click **Create**
3. Fill in the required fields:
   - **App name:** Nibble (or anything you like)
   - **User support email:** your email address
   - **Developer contact email:** your email address
4. Click **Save and Continue** through the remaining steps (you don't need to add scopes or test users manually)
5. On the final summary page, click **Back to Dashboard**



## Step 5 — Create OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. For **Application type**, choose **Chrome Extension**
4. For **Name**, enter anything (e.g. `Nibble Extension`)
5. Leave the **Extension ID** field blank for now — you'll fill this in after loading the extension in Step 7
6. Click **Create**
7. A popup will show your **Client ID** — copy it (it looks like `1234567890-abc...apps.googleusercontent.com`)



## Step 6 — Add Your Client ID to the Code

1. Open the `nibble` folder you downloaded in Step 1
2. Find the file called `manifest.json` and open it in any text editor (Notepad, TextEdit, VS Code, etc.)
3. Find this line:
   ```
   "client_id": "YOUR_GOOGLE_CLIENT_ID_HERE",
   ```
4. Replace `YOUR_GOOGLE_CLIENT_ID_HERE` with the Client ID you copied — keep the quotes around it
5. Save the file



## Step 7 — Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions` in the address bar
2. Turn on **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the `nibble` folder (the one containing `manifest.json`)
5. The Nibble extension will appear in your list — copy the **Extension ID** shown beneath its name (it's a long string of random letters like `abcdefghijklmnopqrstuvwxyz`)



## Step 8 — Add the Extension ID to Google Cloud

Now that you have the Extension ID, go back and complete the credential you created in Step 5.

1. Return to [console.cloud.google.com](https://console.cloud.google.com)
2. Go to **APIs & Services → Credentials**
3. Click the pencil (edit) icon next to your OAuth client
4. Paste your Extension ID into the **Extension ID** field
5. Click **Save**



## Step 9 — Add Yourself as a Test User

Because the app is in development mode, Google requires you to explicitly allow your account.

1. Go to **APIs & Services → OAuth consent screen**
2. Scroll down to the **Test users** section
3. Click **+ Add Users**
4. Enter your Gmail address and click **Save**



## Step 10 — Open a New Tab

1. Open a new tab in Chrome
2. Nibble will ask you to sign in with Google — click **Sign in** and approve the Gmail permission
3. That's it — your first starred newsletter will appear

> **Note:** If you don't see anything after signing in, make sure you have at least one starred email in Gmail that looks like a newsletter (not a booking confirmation or bank alert — Nibble filters those out).



## Troubleshooting

**The extension isn't showing on new tab**
Make sure the extension is enabled on the `chrome://extensions` page and that Developer mode is on.

**Sign-in fails or shows an error**
Double-check that your Client ID in `manifest.json` matches exactly what's in Google Cloud, and that your Extension ID is saved in the credential. Then reload the extension on `chrome://extensions` (click the refresh icon).

**I see a blank page or loading forever**
Try removing your starred label from a few emails and re-starring a clear newsletter. Nibble skips emails from automated senders.
