import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Music, 
  Disc, 
  Layers, 
  User, 
  LogOut, 
  Activity, 
  ExternalLink, 
  ChevronRight,
  Play,
  Zap
} from 'lucide-react';

type UserProfile = {
  display_name: string;
  images: { url: string }[];
  id: string;
  product: string;
};

type Track = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  external_urls: { spotify: string };
};

type Playlist = {
  id: string;
  name: string;
  images: { url: string }[];
  tracks?: { total: number };
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    checkSession();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'SPOTIFY_AUTH_SUCCESS') {
        checkSession();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkSession = async () => {
    try {
      const res = await fetch('/api/spotify/me');
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        fetchDashboardData();
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const [tracksRes, playlistsRes] = await Promise.all([
        fetch('/api/spotify/top-tracks'),
        fetch('/api/spotify/playlists')
      ]);
      
      if (tracksRes.ok) setTopTracks((await tracksRes.json()).items || []);
      if (playlistsRes.ok) setPlaylists((await playlistsRes.json()).items || []);
    } catch (err) {
      console.error("Data fetch failed", err);
    }
  };

  const handleConnect = async () => {
    setAuthLoading(true);
    try {
      const res = await fetch('/api/spotify/auth-url');
      const { url } = await res.json();
      const width = 500, height = 700;
      const left = window.innerWidth / 2 - width / 2;
      const top = window.innerHeight / 2 - height / 2;
      window.open(url, 'Spotify Login', `width=${width},height=${height},top=${top},left=${left}`);
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setAuthLoading(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center font-mono text-[10px] tracking-[0.5em] text-white uppercase italic">
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }}>
          Uplink Initializing...
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-mono selection:bg-white selection:text-black antialiased overflow-x-hidden">
      {/* Brutalist Frame */}
      <div className="fixed inset-0 border-[16px] md:border-[32px] border-black pointer-events-none z-50 mix-blend-difference" />
      
      <main className="relative p-8 md:p-16 lg:p-24 max-w-screen-2xl mx-auto">
        <AnimatePresence mode="wait">
          {!user ? (
            <motion.div 
              key="auth"
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className="flex flex-col items-start justify-center min-h-[70vh] space-y-12"
            >
              <div className="space-y-6">
                <div className="inline-flex items-center gap-4 text-white/40">
                  <span className="h-0.5 w-12 bg-current" />
                  <span className="text-[10px] font-black uppercase tracking-[0.4em]">Nexus .Audio Uplink</span>
                </div>
                <h1 className="text-8xl md:text-[12rem] font-black italic uppercase tracking-tighter leading-[0.75]">
                  Sound<br />Node
                </h1>
                <p className="text-xl md:text-2xl text-white/50 max-w-xl font-bold uppercase italic tracking-tight">
                  High-fidelity interface for the distributed Spotify cloud network.
                </p>
              </div>

              <button 
                onClick={handleConnect}
                disabled={authLoading}
                className="group relative px-16 py-8 bg-white text-black font-black uppercase text-lg italic tracking-widest overflow-hidden hover:pr-20 transition-all disabled:opacity-50"
              >
                <div className="absolute inset-0 bg-black scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500" />
                <span className="relative z-10 group-hover:text-white flex items-center gap-6">
                  {authLoading ? "Decrypting..." : "Connect Spotify"}
                  <ChevronRight className="w-6 h-6 transition-transform group-hover:translate-x-2" />
                </span>
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-32"
            >
              {/* Header Interface */}
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-12 border-b-2 border-white pb-16">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.4em] text-white/30">
                    <Activity className="w-4 h-4" />
                    <span>Bridge Active // PID {user.id.substring(0, 8)}</span>
                  </div>
                  <h1 className="text-7xl md:text-[8rem] font-black italic uppercase tracking-tighter leading-none">
                    Control
                  </h1>
                </div>

                <div className="flex items-center gap-8 bg-white text-black p-8 md:p-12">
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-50 italic">Subscriber Account</p>
                    <p className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter">{user.display_name}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest mt-1">{user.product}</p>
                  </div>
                  {user.images?.[0] && (
                    <img src={user.images[0].url} className="w-24 h-24 object-cover border-2 border-black" alt="" />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-24">
                {/* Visual Audio Stream */}
                <div className="lg:col-span-8 space-y-24">
                  <section className="space-y-12">
                    <div className="flex items-center justify-between border-l-4 border-white pl-6">
                      <div className="flex items-center gap-4">
                        <Disc className="w-6 h-6 animate-spin-slow" />
                        <h2 className="text-xl font-black uppercase tracking-[0.4em] italic">Top Rotation</h2>
                      </div>
                      <span className="text-[10px] font-black opacity-20 italic">BUFFERING... 01-12</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {topTracks.map((track, i) => (
                        <motion.div 
                          key={track.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="group grid grid-cols-[60px_1fr_auto] items-center p-6 border border-white/5 hover:border-white transition-all cursor-crosshair"
                        >
                          <span className="text-lg font-black opacity-30 group-hover:opacity-100 group-hover:italic">{String(i + 1).padStart(2, '0')}</span>
                          <div className="truncate pr-8">
                            <p className="text-xl font-black uppercase italic tracking-tight truncate">{track.name}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white">{track.artists.map(a => a.name).join(' // ')}</p>
                          </div>
                          <a href={track.external_urls.spotify} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 hover:bg-white hover:text-black transition-colors rounded-full">
                            <Play className="w-5 h-5 fill-current" />
                          </a>
                        </motion.div>
                      ))}
                    </div>
                  </section>
                </div>

                {/* System Diagnostics / Collections */}
                <div className="lg:col-span-4 space-y-24">
                  <section className="space-y-12">
                    <div className="flex items-center gap-4 border-l-4 border-white pl-6">
                      <Layers className="w-6 h-6" />
                      <h2 className="text-xl font-black uppercase tracking-[0.4em] italic">Volumes</h2>
                    </div>
                    <div className="space-y-4">
                      {playlists.map((p) => (
                        <div key={p.id} className="flex items-center gap-6 group cursor-pointer border-b border-white/10 pb-6 hover:border-white transition-all">
                          <img src={p.images[0]?.url} className="w-16 h-16 grayscale group-hover:grayscale-0 transition-grayscale" alt="" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black uppercase italic truncate">{p.name}</p>
                            <div className="flex items-center justify-between mt-2">
                              <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">{p.tracks?.total ?? 0} Tracks</p>
                              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-40" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="bg-white/5 border border-white/10 p-10 space-y-8">
                    <div className="flex items-center gap-4">
                      <Zap className="w-5 h-5" />
                      <h2 className="text-[10px] font-black uppercase tracking-[0.5em] italic">System .Log</h2>
                    </div>
                    <div className="space-y-4 text-[9px] font-bold uppercase tracking-[0.3em] text-white/30">
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span>Status</span>
                        <span className="text-white">Encrypted</span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span>Latency</span>
                        <span className="text-white">12ms</span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span>Auth</span>
                        <span className="text-white italic">OAUTH_2.0</span>
                      </div>
                    </div>
                  </section>

                  <a 
                    href="/api/logout"
                    className="flex items-center justify-center w-full py-8 border-2 border-white hover:bg-white hover:text-black transition-all text-xs font-black uppercase tracking-[0.6em] italic"
                  >
                    Terminate Node
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Grid Pattern */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.05]" 
           style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      
      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-b from-transparent via-white/[0.02] to-transparent bg-[length:100%_4px] animate-scanline pointer-events-none z-[100]" />
    </div>
  );
}
