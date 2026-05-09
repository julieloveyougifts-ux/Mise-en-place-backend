# Mise en place — Video Backend

This small Node.js server lets the Mise en place app extract recipes from Facebook video links.
You paste a URL, the server downloads the video using yt-dlp, sends it to Google's File API,
and Gemini watches it and returns a structured recipe.

---

## Deploy to Railway (free, ~5 minutes)

### 1. Get a Gemini API key
Go to https://aistudio.google.com/apikey and create a free key if you don't have one.

### 2. Push this folder to GitHub
Create a new GitHub repository and push server.js, package.json, and README.md to it.

### 3. Deploy on Railway
1. Go to https://railway.app and sign in with GitHub (free, no credit card needed)
2. Click New Project → Deploy from GitHub repo
3. Select your repository — Railway will detect Node.js automatically

### 4. Add environment variables
In your Railway project → Variables tab, add:
  GEMINI_API_KEY = AIza... (your key)

### 5. Get your server URL
Railway → your service → Settings → copy the public domain.
Example: https://mise-backend-production-xxxx.railway.app

### 6. Add the URL to your app
Open mise-en-place.html → Add Recipe → Import from video tab → paste your Railway URL.
It's saved automatically.

---

## How it works

1. You paste a public Facebook video URL into the app
2. The app sends the URL to your Railway server
3. The server runs yt-dlp to download the video (up to ~150 MB)
4. It uploads the video to Google's File API using a resumable upload
5. It polls until Google finishes processing the video
6. It asks Gemini 2.0 Flash to watch the video and extract the recipe
7. The recipe JSON is returned to your app and pre-fills the form
8. The video is deleted from Google's servers immediately after

## Notes

- Videos must be public on Facebook (not private or friends-only)
- yt-dlp is installed automatically via the postinstall script in package.json
- Railway's free tier gives 500 hours/month — plenty for personal use
- The server stores nothing; it is fully stateless

## Running locally

  cd mise-backend
  npm install
  GEMINI_API_KEY=your-key-here npm start

Server runs on http://localhost:3000. Use that as your backend URL in the app.
