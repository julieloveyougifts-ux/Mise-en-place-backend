# Mise en place — Video Backend

This small Node.js server handles video recipe extraction for the Mise en place app.
It uploads videos to Google's File API, waits for processing, then uses Gemini to extract
the recipe, and returns it as JSON to your HTML app.

---

## Deploy to Railway (free, ~5 minutes)

### 1. Get a Gemini API key
If you don't have one yet, go to https://aistudio.google.com/apikey and create a free key.

### 2. Push this folder to GitHub
Create a new GitHub repository and push the contents of this folder to it:

```bash
cd mise-backend
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/mise-backend.git
git push -u origin main
```

### 3. Deploy on Railway
1. Go to https://railway.app and sign in with GitHub (free account, no credit card needed)
2. Click **New Project → Deploy from GitHub repo**
3. Select your `mise-backend` repository
4. Railway will auto-detect Node.js and deploy it

### 4. Add your Gemini API key as an environment variable
1. In your Railway project, click the service → **Variables** tab
2. Add a new variable:
   - Name: `GEMINI_API_KEY`
   - Value: your key (starts with `AIza…`)
3. Railway will redeploy automatically

### 5. Get your server URL
In Railway, click your service → **Settings** → copy the public domain.
It will look like: `https://mise-backend-production-xxxx.railway.app`

### 6. Add the URL to your app
Open `mise-en-place.html` in your browser, go to Add Recipe → **Import from video**,
and paste your Railway URL into the "Backend server URL" field. It's saved automatically.

---

## Running locally (optional)

```bash
cd mise-backend
npm install
GEMINI_API_KEY=your-key-here npm start
```

The server runs on http://localhost:3000. Use `http://localhost:3000` as your backend URL in the app.

---

## How it works

1. You pick a Facebook video (mp4/mov) in the app
2. The app POSTs the file to `/extract-video` on your Railway server
3. The server uploads it to Google's File API using a resumable upload
4. It polls until Google finishes processing the video
5. It sends the video to Gemini 2.0 Flash with a prompt to extract the recipe
6. The recipe JSON is returned to your app and pre-fills the form
7. The uploaded file is deleted from Google's servers

## File size limits

- The server accepts up to **200 MB** per video
- Google's File API supports up to **2 GB** (free tier: 20 GB storage total)
- Typical Facebook recipe videos are 20–80 MB and work well

## Notes

- Videos are deleted from Google's File API immediately after extraction
- The server itself stores nothing — it's stateless
- Railway's free tier gives you 500 hours/month, plenty for personal use
