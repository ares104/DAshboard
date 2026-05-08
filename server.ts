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
    res.json({ status: "ok", service: "Nexus Audio .Node" });
  });

  // Spotify Auth: Get Authorize URL
  app.get("/api/spotify/auth-url", (req, res) => {
    const scope = "user-read-private user-read-email user-top-read playlist-read-private user-read-recently-played";
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
      
      // Store token in cookie (simple session management for this demo)
      res.cookie('spotify_token', access_token, { 
        httpOnly: true, 
        secure: true, 
        sameSite: 'none',
        maxAge: 3600 * 1000 // 1 hour
      });

      res.send(`
        <html>
          <body style="background: #000; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center;">
            <div style="border: 2px solid #fff; padding: 3rem; background: #000;">
              <h1 style="font-size: 3rem; font-weight: 900; text-transform: uppercase; font-style: italic; letter-spacing: -0.05em; margin: 0;">Uplink Secure</h1>
              <p style="text-transform: uppercase; letter-spacing: 0.2rem; font-size: 0.7rem; opacity: 0.5; margin-top: 1rem;">Nexus Audio Node Synchronized</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS' }, '*');
                  setTimeout(() => window.close(), 1000);
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
    const token = req.cookies.spotify_token;

    if (!token) return res.status(401).json({ error: "Unauthorized" });

    try {
      let spotifyUrl = "";
      switch (endpoint) {
        case 'top-tracks': spotifyUrl = "https://api.spotify.com/v1/me/top/tracks?limit=12"; break;
        case 'playlists': spotifyUrl = "https://api.spotify.com/v1/me/playlists?limit=8"; break;
        case 'me': spotifyUrl = "https://api.spotify.com/v1/me"; break;
        default: return res.status(404).json({ error: "Endpoint not found" });
      }

      const response = await axios.get(spotifyUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });

      res.json(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        res.clearCookie('spotify_token');
      }
      res.status(err.response?.status || 500).json({ error: "Spotify API Error" });
    }
  });

  app.get("/api/logout", (req, res) => {
    res.clearCookie('spotify_token');
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
    console.log(`Nexus Audio .Node active on port ${PORT}`);
  });
}

startServer().catch(console.error);
