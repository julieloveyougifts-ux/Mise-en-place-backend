import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(cors());
app.use(express.json());

// ── Health check ──
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Mise en place video backend' }));

// ── Shared helper: upload buffer to Google File API then extract recipe with Gemini ──
async function uploadAndExtract(buffer, mimetype, displayName) {
  const size = buffer.length;

  // Step 1: Initiate resumable upload
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': size,
        'X-Goog-Upload-Header-Content-Type': mimetype,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    }
  );
  if (!initRes.ok) throw new Error(`File API init failed: ${await initRes.text()}`);

  const uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('No upload URL returned by Google.');

  // Step 2: Upload bytes
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': size,
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
      'Content-Type': mimetype,
    },
    body: buffer,
  });
  if (!uploadRes.ok) throw new Error(`File upload failed: ${await uploadRes.text()}`);

  const fileData = await uploadRes.json();
  const fileUri = fileData?.file?.uri;
  const fileName = fileData?.file?.name;
  if (!fileUri) throw new Error('No file URI returned after upload.');
  console.log(`Uploaded to Google: ${fileUri}`);

  // Step 3: Poll until ACTIVE
  let state = fileData?.file?.state;
  let attempts = 0;
  while (state === 'PROCESSING' && attempts < 30) {
    await new Promise(r => setTimeout(r, 4000));
    const statusRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`
    );
    const statusData = await statusRes.json();
    state = statusData?.state;
    console.log(`Polling: ${state} (attempt ${++attempts})`);
  }
  if (state !== 'ACTIVE') throw new Error(`File not ready. Final state: ${state}`);

  // Step 4: Gemini extraction
  const prompt = `Watch this cooking video and extract the recipe being demonstrated. Return ONLY a JSON object (no markdown, no backticks) with these exact keys:
- name (string): the recipe name
- emoji (string): a single relevant food emoji
- category (string): one of breakfast, lunch, dinner, dessert, snack
- time (number): estimated total time in minutes
- servings (number): estimated servings
- ingredients (array of strings): all ingredients with quantities as shown
- steps (array of strings): clear step-by-step instructions based on what is shown in the video

If this video does not appear to contain a cooking recipe, return {"error": "not a recipe"}.`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { file_data: { mime_type: mimetype, file_uri: fileUri } },
          { text: prompt }
        ]}]
      })
    }
  );

  const geminiData = await geminiRes.json();
  const rawText = geminiData.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  const cleaned = rawText.replace(/```json|```/g, '').trim();

  // Step 5: Cleanup Google file (fire and forget)
  fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`, { method: 'DELETE' }).catch(() => {});

  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch { throw new Error(`Unparseable Gemini output: ${rawText.slice(0, 200)}`); }

  return parsed;
}

// ── POST /extract-video-url ──
// Accepts { url } JSON body, downloads via yt-dlp, extracts recipe
app.post('/extract-video-url', async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set on server.' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'No URL provided.' });

  console.log(`Downloading video from: ${url}`);

  let tmpDir, tmpFile;
  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'mise-'));
    tmpFile = join(tmpDir, 'video.mp4');

    // yt-dlp: download best quality mp4 under ~150MB
    await execFileAsync('yt-dlp', [
      '--no-playlist',
      '--format', 'bestvideo[ext=mp4][filesize<150M]+bestaudio[ext=m4a]/best[ext=mp4][filesize<150M]/best[filesize<150M]',
      '--merge-output-format', 'mp4',
      '--output', tmpFile,
      '--no-warnings',
      url,
    ], { timeout: 120_000 });

    const buffer = await readFile(tmpFile);
    console.log(`Downloaded: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);

    const parsed = await uploadAndExtract(buffer, 'video/mp4', 'recipe-video.mp4');
    return res.json(parsed);

  } catch (err) {
    console.error('URL extract error:', err.message);
    const userMsg = err.message.includes('yt-dlp') || err.message.includes('ERROR')
      ? 'Could not download that video. Make sure it is a public Facebook video and try again.'
      : err.message;
    return res.status(500).json({ error: userMsg });
  } finally {
    if (tmpFile) unlink(tmpFile).catch(() => {});
  }
});

app.listen(PORT, () => console.log(`Mise en place backend running on port ${PORT}`));
