import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory token store (replaces Firebase as requested)
const tokenStore = new Map<string, string>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  const getRedirectUri = (req: express.Request) => {
    if (process.env.APP_URL) {
      return `${process.env.APP_URL.replace(/\/$/, "")}/api/spotify/callback`;
    }
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const finalProtocol = (protocol as string).split(',')[0].trim();
    const finalHost = (host as string).split(',')[0].trim();
    return `${finalProtocol}://${finalHost}/api/spotify/callback`;
  };

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "Dash .Node" });
  });

  // Spotify Auth: Get Authorize URL
  app.get("/api/spotify/auth-url", (req, res) => {
    const scope = "user-read-private user-read-email user-top-read playlist-read-private user-read-recently-played user-read-playback-state user-modify-playback-state user-read-currently-playing";
    const redirectUri = getRedirectUri(req);
    
    const params = new URLSearchParams({
      client_id: process.env.SPOTIFY_CLIENT_ID || "",
      response_type: "code",
      redirect_uri: redirectUri,
      scope: scope,
      show_dialog: "true"
    });

    res.json({ url: `https://accounts.spotify.com/authorize?${params.toString()}` });
  });

  // Spotify Auth: Callback
  app.get("/api/spotify/callback", async (req, res) => {
    const { code } = req.query;
    const redirectUri = getRedirectUri(req);

    if (!code) return res.status(400).send("No code provided");

    try {
      const response = await axios.post("https://accounts.spotify.com/api/token", 
        new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: redirectUri,
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(
              `${(process.env.SPOTIFY_CLIENT_ID || "").trim()}:${(process.env.SPOTIFY_CLIENT_SECRET || "").trim()}`
            ).toString("base64")}`,
          },
        }
      );

      const { access_token } = response.data;
      
      const profileResponse = await axios.get("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${access_token}` }
      });

      const spotifyUid = profileResponse.data.id;
      tokenStore.set(spotifyUid, access_token);

      res.cookie('spotify_uid', spotifyUid, { 
        httpOnly: true, 
        secure: true, 
        sameSite: 'none',
        maxAge: 3600 * 1000 
      });

      res.send(`
        <html>
          <body style="background: #000; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center;">
            <div style="background: #000; border: 2px solid #fff; padding: 3.5rem; border-radius: 0;">
              <h1 style="color: #fff; font-size: 2.5rem; margin-bottom: 0.5rem; font-weight: 900; text-transform: uppercase; font-style: italic;">Dash .Node</h1>
              <p style="opacity: 0.6; margin-bottom: 2.5rem; text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.7rem;">Spotify node linked successfully.</p>
              <div style="height: 2px; width: 40px; background: #fff; margin: 0 auto;"></div>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS' }, '*');
                  setTimeout(() => window.close(), 1500);
                } else {
                  window.location.href = '/';
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Spotify Auth Error:", error.response?.data || error.message);
      res.status(500).send("Authentication failed.");
    }
  });

  // Spotify Proxy Endpoints
  app.get("/api/spotify/:endpoint", async (req, res) => {
    const { endpoint } = req.params;
    const spotifyUid = req.cookies.spotify_uid;
    const token = spotifyUid ? tokenStore.get(spotifyUid) : null;

    if (!token) return res.status(401).json({ error: "Unauthorized" });

    try {
      let spotifyUrl = "";
      let method = "GET";

      let data = undefined;
      let params = {};

      switch (endpoint) {
        case 'top-tracks': spotifyUrl = "https://api.spotify.com/v1/me/top/tracks?limit=12"; break;
        case 'playlists': spotifyUrl = "https://api.spotify.com/v1/me/playlists?limit=8"; break;
        case 'me': spotifyUrl = "https://api.spotify.com/v1/me"; break;
        case 'now-playing': spotifyUrl = "https://api.spotify.com/v1/me/player/currently-playing"; break;
        case 'play': 
          spotifyUrl = "https://api.spotify.com/v1/me/player/play"; 
          method = "PUT";
          break;
        case 'pause': 
          spotifyUrl = "https://api.spotify.com/v1/me/player/pause"; 
          method = "PUT";
          break;
        case 'next': 
          spotifyUrl = "https://api.spotify.com/v1/me/player/next"; 
          method = "POST";
          break;
        case 'previous': 
          spotifyUrl = "https://api.spotify.com/v1/me/player/previous"; 
          method = "POST";
          break;
        case 'seek':
          spotifyUrl = "https://api.spotify.com/v1/me/player/seek";
          method = "PUT";
          params = { position_ms: req.query.position_ms };
          break;
        case 'volume':
          spotifyUrl = "https://api.spotify.com/v1/me/player/volume";
          method = "PUT";
          params = { volume_percent: req.query.volume_percent };
          break;
        case 'devices':
          spotifyUrl = "https://api.spotify.com/v1/me/player/devices";
          break;
        case 'transfer':
          const deviceId = req.query.device_id;
          spotifyUrl = "https://api.spotify.com/v1/me/player";
          method = "PUT";
          data = { device_ids: [deviceId], play: true };
          break;
        default: return res.status(404).json({ error: "Endpoint not found" });
      }

      const response = await axios({
        url: spotifyUrl,
        method: method,
        headers: { Authorization: `Bearer ${token}` },
        params: Object.keys(params).length > 0 ? params : undefined,
        data: data || (method === 'PUT' || method === 'POST' ? {} : undefined)
      });

      if (response.status === 204) {
        return res.status(204).send();
      }

      res.json(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        res.clearCookie('spotify_uid');
        if (spotifyUid) tokenStore.delete(spotifyUid);
      }
      if (err.response?.status === 204) {
        return res.status(204).send();
      }
      res.status(err.response?.status || 500).json({ error: "Spotify API Error", details: err.response?.data });
    }
  });

  app.get("/api/logout", (req, res) => {
    const spotifyUid = req.cookies.spotify_uid;
    if (spotifyUid) tokenStore.delete(spotifyUid);
    res.clearCookie('spotify_uid', { 
      httpOnly: true, 
      secure: true, 
      sameSite: 'none' 
    });
    res.redirect('/');
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Dash .Node active on port ${PORT}`);
  });
}

startServer().catch(console.error);
