import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Music, 
  Disc, 
  Radio, 
  Layers, 
  Activity, 
  ExternalLink, 
  ChevronRight,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  LogOut,
  Zap,
  Volume2,
  VolumeX,
  Monitor,
  Smartphone,
  Speaker,
  Repeat,
  Shuffle
} from 'lucide-react';

type UserProfile = {
  display_name: string;
  images: { url: string }[];
  product: string;
  external_urls: { spotify: string };
};

type Track = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { 
    name: string;
    images: { url: string }[];
  };
};

type Device = {
  id: string;
  is_active: boolean;
  name: string;
  type: string;
  volume_percent: number;
};

type NowPlaying = {
  item: Track & { duration_ms: number } | null;
  is_playing: boolean;
  progress_ms: number;
  device?: Device;
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
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [localProgress, setLocalProgress] = useState<number>(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSeekTime = useRef<number>(0);

  // Sync canvas for PiP
  useEffect(() => {
    if (nowPlaying?.item && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const draw = () => {
          if (!nowPlaying.item || !ctx) return;
          // Background
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, 512, 512);
          
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = nowPlaying.item.album.images[0].url;
          img.onload = () => {
            ctx.drawImage(img, 0, 0, 512, 512);
            
            // Text Gradient Overlay
            const grad = ctx.createLinearGradient(0, 300, 0, 512);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,0,0.9)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 300, 512, 212);

            // Text
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 32px italic Inter';
            const name = nowPlaying.item.name.length > 25 ? nowPlaying.item.name.substring(0, 22) + '...' : nowPlaying.item.name;
            ctx.fillText(name.toUpperCase(), 30, 440);
            
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '700 24px Inter';
            const artist = nowPlaying.item.artists[0].name.length > 30 ? nowPlaying.item.artists[0].name.substring(0, 27) + '...' : nowPlaying.item.artists[0].name;
            ctx.fillText(artist, 30, 480);
          };
        };
        draw();
      }
    }
  }, [nowPlaying?.item?.id]);

  const togglePiP = async () => {
    // Attempt Document Picture-in-Picture (Floating window on top of other apps)
    if ('documentPictureInPicture' in window) {
      if (pipWindow) {
        pipWindow.close();
        setPipWindow(null);
        return;
      }

      try {
        const pip = await (window as any).documentPictureInPicture.requestWindow({
          width: 450,
          height: 80,
        });

        // Copy styles to the new window
        const styleSheetArray = Array.from(document.styleSheets);
        styleSheetArray.forEach((styleSheet) => {
          try {
            const cssRules = Array.from(styleSheet.cssRules).map((rule) => rule.cssText).join('');
            const style = document.createElement('style');
            style.textContent = cssRules;
            pip.document.head.appendChild(style);
          } catch (e) {
            const link = document.createElement('link');
            if (styleSheet.href) {
              link.rel = 'stylesheet';
              link.href = styleSheet.href;
              pip.document.head.appendChild(link);
            }
          }
        });

        // Handle window closing
        pip.addEventListener('pagehide', () => {
          setPipWindow(null);
        });

        // Synchronize some basic styles for the body
        pip.document.body.style.backgroundColor = 'black';
        pip.document.body.style.margin = '0';
        pip.document.body.style.overflow = 'hidden';

        setPipWindow(pip);
        setShowMiniPlayer(false); // Hide the in-app version when floating
      } catch (error) {
        console.error("Document PiP failed", error);
        // Fallback to standard Video PiP
        await performVideoPiP();
      }
    } else {
      await performVideoPiP();
    }
  };

  const performVideoPiP = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        const stream = canvasRef.current.captureStream(10);
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          videoRef.current?.requestPictureInPicture();
        };
      }
    } catch (error) {
      console.error("Video PiP failed", error);
    }
  };
  
  // Media Session API for OS-level control
  useEffect(() => {
    if ('mediaSession' in navigator && nowPlaying?.item) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: nowPlaying.item.name,
        artist: nowPlaying.item.artists.map(a => a.name).join(', '),
        album: nowPlaying.item.album.name,
        artwork: nowPlaying.item.album.images.map(img => ({
          src: img.url,
          sizes: '512x512',
          type: 'image/jpeg'
        }))
      });

      navigator.mediaSession.setActionHandler('play', () => handlePlayerControl('play'));
      navigator.mediaSession.setActionHandler('pause', () => handlePlayerControl('pause'));
      navigator.mediaSession.setActionHandler('previoustrack', () => handlePlayerControl('previous'));
      navigator.mediaSession.setActionHandler('nexttrack', () => handlePlayerControl('next'));
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          const position = details.seekTime * 1000;
          setLocalProgress(position);
          fetch(`/api/spotify/seek?position_ms=${Math.floor(position)}`);
        }
      });
    }
  }, [nowPlaying?.item?.id]);

  const pollInterval = useRef<NodeJS.Timeout| null>(null);
  const devicePollInterval = useRef<NodeJS.Timeout | null>(null);

  // Live progress tracking
  useEffect(() => {
    if (nowPlaying?.is_playing && !isSeeking) {
      const timer = setInterval(() => {
        setLocalProgress(prev => {
          if (!nowPlaying.item) return prev;
          const next = prev + 100;
          return next > nowPlaying.item.duration_ms ? nowPlaying.item.duration_ms : next;
        });
      }, 100);
      return () => clearInterval(timer);
    }
  }, [nowPlaying?.is_playing, nowPlaying?.item?.id, isSeeking]);

  useEffect(() => {
    checkSession();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'SPOTIFY_AUTH_SUCCESS') {
        checkSession();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);

  const checkSession = async () => {
    try {
      const res = await fetch('/api/spotify/me');
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        startPolling();
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Session check failed");
    } finally {
      setLoading(false);
      setAuthLoading(false);
    }
  };

  const startPolling = () => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    if (devicePollInterval.current) clearInterval(devicePollInterval.current);
    fetchNowPlaying();
    fetchDevices();
    pollInterval.current = setInterval(fetchNowPlaying, 2000);
    devicePollInterval.current = setInterval(fetchDevices, 10000);
  };

  const fetchDevices = async () => {
    try {
      const res = await fetch('/api/spotify/devices');
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
    } catch (err) {
      console.error("Devices fetch failed");
    }
  };

  const transferPlayback = async (deviceId: string) => {
    // Only transfer if selecting a DIFFERENT device
    const currentDevice = devices.find(d => d.is_active);
    if (currentDevice?.id === deviceId) return;

    // Optimistic update
    setDevices(prev => prev.map(d => ({ ...d, is_active: d.id === deviceId })));
    
    try {
      const res = await fetch(`/api/spotify/transfer?device_id=${deviceId}`);
      if (res.ok) {
        setTimeout(() => {
          fetchDevices();
          fetchNowPlaying();
        }, 800);
      }
    } catch (err) {
      console.error("Transfer failed", err);
      fetchDevices(); // Revert on failure
    }
  };

  const fetchNowPlaying = async () => {
    try {
      const res = await fetch('/api/spotify/now-playing');
      if (res.status === 204) {
        setNowPlaying(null);
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setNowPlaying(json);
        
        // Cooldown mechanism: Ignore server sync for 2.5s after a user seek
        const now = Date.now();
        if (!isSeeking && (now - lastSeekTime.current > 2500)) {
          setLocalProgress(json.progress_ms);
        }
      }
    } catch (err) {
      console.error("Now playing fetch failed");
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalProgress(parseInt(e.target.value));
    setIsSeeking(true);
  };

  const handleSeekCommit = async () => {
    setIsSeeking(false);
    lastSeekTime.current = Date.now(); // Mark seek time
    try {
      await fetch(`/api/spotify/seek?position_ms=${localProgress}`);
    } catch (err) {
      console.error("Seek failed", err);
    }
  };

  const handlePlayerControl = async (action: string) => {
    try {
      await fetch(`/api/spotify/${action}`);
      setTimeout(fetchNowPlaying, 500);
    } catch (err) {
      console.error("Player control failed", err);
    }
  };

  const handleConnect = async () => {
    setAuthLoading(true);
    try {
      const res = await fetch('/api/spotify/auth-url');
      const { url } = await res.json();
      const width = 600, height = 700;
      const left = (window.innerWidth - width) / 2;
      const top = (window.innerHeight - height) / 2;
      window.open(url, 'Spotify Auth', `width=${width},height=${height},left=${left},top=${top}`);
    } catch (err) {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    window.location.href = '/api/logout';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
          <Zap className="w-12 h-12 text-white" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/30 selection:text-white antialiased overflow-x-hidden">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-white/5 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:32px_32px]" />
      </div>

      <main className="relative p-6 md:p-12 lg:p-20 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {!user ? (
            <motion.div 
              key="auth"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-[85vh] flex flex-col items-center justify-center relative px-4"
            >
              <div className="absolute inset-0 z-0 flex items-center justify-center opacity-30 pointer-events-none">
                <motion.div 
                  animate={{ 
                    scale: [1, 1.3, 1],
                    rotate: [0, 45, 0],
                  }}
                  transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                  className="w-[600px] h-[600px] bg-gradient-to-br from-white/10 to-transparent rounded-full blur-[120px]"
                />
              </div>

              <div className="relative z-10 flex flex-col items-center text-center space-y-10 md:space-y-16">
                <div className="space-y-4">
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="flex items-center justify-center gap-3 text-white/30 text-[8px] sm:text-[10px] font-bold uppercase tracking-[0.5em] mb-2 sm:mb-4"
                  >
                    <Activity className="w-4 h-4 animate-pulse text-white/50" />
                    <span>Synchronizing Frequency</span>
                  </motion.div>
                  
                  <motion.h1 
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.8 }}
                    className="text-[18vw] sm:text-[15vw] md:text-[12vw] lg:text-[10vw] font-black italic tracking-[-0.08em] leading-[0.75] uppercase bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/10 select-none"
                  >
                    Dash
                  </motion.h1>
                  
                  <motion.p 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-base sm:text-lg md:text-2xl text-neutral-500 font-medium tracking-tight max-w-sm sm:max-w-xl mx-auto leading-relaxed px-4"
                  >
                    A clinical, high-performance interface for your <span className="text-white">Spotify</span> stream. 
                    Zero friction. Minimal footprint.
                  </motion.p>
                </div>

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <button
                    onClick={handleConnect}
                    disabled={authLoading}
                    className="group relative px-12 sm:px-20 py-5 sm:py-7 bg-white text-black font-black uppercase tracking-[0.4em] text-[10px] rounded-full shadow-[0_0_60px_rgba(255,255,255,0.1)] hover:shadow-[0_0_100px_rgba(255,255,255,0.2)] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 overflow-hidden"
                  >
                    <span className="relative z-10">
                      {authLoading ? 'Initializing...' : 'Authorize Uplink'}
                    </span>
                    <motion.div 
                      className="absolute inset-0 bg-neutral-100"
                      initial={{ x: "-100%" }}
                      whileHover={{ x: 0 }}
                      transition={{ duration: 0.4 }}
                    />
                  </button>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="flex items-center gap-10 text-[9px] font-bold uppercase tracking-[0.4em] text-neutral-700"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3" />
                    <span>Real-time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Monitor className="w-3 h-3" />
                    <span>Any Device</span>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 sm:space-y-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12"
            >
              <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-8 sm:pb-10 border-b border-white/5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-white/40 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em]">
                    <Activity className="w-3 h-3" />
                    <span>System Active // Node Connected</span>
                  </div>
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-[-0.05em] leading-none">
                    Dash
                  </h1>
                </div>

                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setShowMiniPlayer(!showMiniPlayer)} 
                    className={`w-12 h-12 flex items-center justify-center border rounded-2xl transition-all group ${
                      showMiniPlayer ? 'bg-white text-black border-white' : 'bg-white/5 text-neutral-500 hover:text-white border-white/5 hover:border-white/20'
                    }`}
                    title="Toggle Mini Node"
                  >
                    <Layers className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  </button>
                  <div className="flex items-center gap-4 bg-neutral-900/50 backdrop-blur-xl border border-white/5 p-2 pr-5 rounded-2xl">
                    <div className="w-10 h-10 overflow-hidden rounded-xl border border-white/10">
                      {user.images?.[0] ? (
                        <img src={user.images[0].url} className="w-full h-full object-cover grayscale" alt="" />
                      ) : (
                        <div className="w-full h-full bg-neutral-800 flex items-center justify-center"><Zap className="w-4 h-4"/></div>
                      )}
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500 leading-none mb-1">Uplinked</p>
                      <p className="font-bold text-sm tracking-tight leading-none truncate max-w-[120px]">{user.display_name}</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleLogout} 
                    className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 text-neutral-500 hover:text-white border border-white/5 hover:border-white/20 rounded-2xl transition-all group"
                    title="Terminate Session"
                  >
                    <LogOut className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  </button>
                </div>
              </header>

              <div className="flex justify-center">
                <div className="w-full max-w-5xl space-y-12">
                  {/* Now Playing */}
                  <div className="bg-neutral-900/40 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-6 sm:p-10 shadow-2xl overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <Radio className="w-40 h-40" />
                    </div>

                    <div className="relative z-10">
                      {nowPlaying?.item ? (
                        <div className="flex flex-col lg:flex-row gap-10 md:gap-16 items-center lg:items-start text-center lg:text-left">
                          <motion.div 
                            layoutId="album-art"
                            className="w-48 h-48 sm:w-64 sm:h-64 lg:w-80 lg:h-80 bg-neutral-800 rounded-3xl sm:rounded-[3rem] overflow-hidden shadow-2xl flex-shrink-0 group-hover:scale-105 transition-transform duration-500"
                          >
                            <img src={nowPlaying.item.album.images[0]?.url} className="w-full h-full object-cover grayscale" alt="" />
                          </motion.div>
                          
                          <div className="flex-1 space-y-8 lg:space-y-12 pt-4 w-full">
                            <div className="space-y-2 sm:space-y-4">
                              <div className="flex items-center justify-center lg:justify-start gap-2 text-white/40 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest mb-1">
                                <Activity className="w-3 h-3 animate-pulse" />
                                <span>Currently Transmitting</span>
                              </div>
                              <h2 className="text-3xl sm:text-5xl lg:text-7xl font-black italic tracking-[-0.04em] leading-[0.9] line-clamp-2 uppercase">{nowPlaying.item.name}</h2>
                              <p className="text-lg sm:text-xl md:text-2xl text-neutral-400 font-medium tracking-tight truncate">{nowPlaying.item.artists.map(a => a.name).join(' // ')}</p>
                            </div>

                            <div className="space-y-4 sm:space-y-6">
                              <div className="relative group/progress h-8 flex items-center">
                                {/* Track Background */}
                                <div className="absolute h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                  <motion.div 
                                    className="absolute h-full bg-white"
                                    animate={{ width: `${(localProgress / nowPlaying.item.duration_ms) * 100}%` }}
                                    transition={{ duration: isSeeking ? 0 : 0.1, ease: "linear" }}
                                  />
                                </div>
                                
                                {/* Visible Handle (Sleek Circular Design) */}
                                <motion.div 
                                  className="absolute w-3 h-3 sm:w-4 sm:h-4 bg-white rounded-full shadow-[0_0_10px_white] pointer-events-none z-10"
                                  animate={{ left: `calc(${(localProgress / nowPlaying.item.duration_ms) * 100}% - 8px)` }}
                                  transition={{ duration: isSeeking ? 0 : 0.1, ease: "linear" }}
                                />

                                {/* Hidden Input Range */}
                                <input
                                  type="range"
                                  min="0"
                                  max={nowPlaying.item.duration_ms}
                                  value={localProgress}
                                  onChange={handleSeek}
                                  onMouseUp={handleSeekCommit}
                                  onTouchEnd={handleSeekCommit}
                                  className="absolute w-full h-full opacity-0 cursor-pointer z-20"
                                />
                              </div>
                              <div className="flex justify-between text-[9px] sm:text-[10px] font-bold text-neutral-500 tracking-widest uppercase mb-4">
                                <span>{Math.floor(localProgress / 1000 / 60)}:{(Math.floor(localProgress / 1000) % 60).toString().padStart(2, '0')}</span>
                                <span>{Math.floor(nowPlaying.item.duration_ms / 1000 / 60)}:{(Math.floor(nowPlaying.item.duration_ms / 1000) % 60).toString().padStart(2, '0')}</span>
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-10">
                              <div className="flex items-center gap-8">
                                <button onClick={() => handlePlayerControl('previous')} className="text-neutral-400 hover:text-white transition-all transform active:scale-90">
                                  <SkipBack className="w-6 h-6 sm:w-8 sm:h-8" />
                                </button>
                                <button 
                                  onClick={() => handlePlayerControl(nowPlaying.is_playing ? 'pause' : 'play')}
                                  className="w-16 h-16 sm:w-20 sm:h-20 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)]"
                                >
                                  {nowPlaying.is_playing ? <Pause className="w-8 h-8 sm:w-10 sm:h-10" /> : <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current ml-1" />}
                                </button>
                                <button onClick={() => handlePlayerControl('next')} className="text-neutral-400 hover:text-white transition-all transform active:scale-90">
                                  <SkipForward className="w-6 h-6 sm:w-8 sm:h-8" />
                                </button>
                              </div>
                              
                              <div className="flex items-center gap-6 text-neutral-500">
                                <button className="hover:text-white transition-colors"><Repeat className="w-5 h-5" /></button>
                                <button className="hover:text-white transition-colors"><Shuffle className="w-5 h-5" /></button>
                              </div>
                            </div>

                            <div className="pt-8 border-t border-white/5 space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                                  <Monitor className="w-3 h-3" />
                                  <span>Output Node</span>
                                </div>
                              </div>

                              <div className="relative">
                                {devices.find(d => d.is_active) ? (
                                  <button
                                    onClick={() => setShowDevicePicker(!showDevicePicker)}
                                    className="flex items-center gap-3 bg-white text-black px-6 py-4 rounded-3xl w-full md:w-auto font-black uppercase tracking-widest text-[10px] shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95 transition-all"
                                  >
                                    <div className="flex items-center gap-3">
                                      {devices.find(d => d.is_active)?.type.toLowerCase() === 'computer' && <Monitor className="w-4 h-4" />}
                                      {devices.find(d => d.is_active)?.type.toLowerCase() === 'smartphone' && <Smartphone className="w-4 h-4" />}
                                      {!(['computer', 'smartphone'].includes(devices.find(d => d.is_active)?.type.toLowerCase() || '')) && <Speaker className="w-4 h-4" />}
                                      <span>{devices.find(d => d.is_active)?.name}</span>
                                    </div>
                                    <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${showDevicePicker ? 'rotate-90' : ''}`} />
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-4 rounded-3xl text-neutral-500">
                                    <Zap className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">No active output detected</span>
                                  </div>
                                )}

                                <AnimatePresence>
                                  {showDevicePicker && (
                                    <motion.div
                                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                      className="absolute bottom-full left-0 mb-4 w-full md:w-80 bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-4 shadow-2xl z-50 overflow-hidden"
                                    >
                                      <div className="space-y-2">
                                         <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 px-4 py-2">Available Nodes</p>
                                         <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                                           {devices.length > 0 ? devices.map((device) => (
                                             <button
                                               key={device.id}
                                               onClick={() => {
                                                 transferPlayback(device.id);
                                                 setShowDevicePicker(false);
                                               }}
                                               className={`w-full px-4 py-3 rounded-2xl flex items-center justify-between group transition-all ${
                                                 device.is_active 
                                                   ? 'bg-white text-black font-black' 
                                                   : 'hover:bg-white/10 text-neutral-400 hover:text-white'
                                               }`}
                                             >
                                               <div className="flex items-center gap-3">
                                                 {device.type.toLowerCase() === 'computer' && <Monitor className="w-4 h-4" />}
                                                 {device.type.toLowerCase() === 'smartphone' && <Smartphone className="w-4 h-4" />}
                                                 {!(['computer', 'smartphone'].includes(device.type.toLowerCase())) && <Speaker className="w-4 h-4" />}
                                                 <span className="text-xs uppercase tracking-widest truncate max-w-[120px]">{device.name}</span>
                                               </div>
                                               {device.is_active && <div className="w-1.5 h-1.5 bg-black rounded-full" />}
                                               {!device.is_active && <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />}
                                             </button>
                                           )) : (
                                             <p className="text-[10px] text-neutral-700 font-bold uppercase tracking-widest px-4 py-4">Scan returned 0 results</p>
                                           )}
                                         </div>
                                       </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>

                            <div className="pt-4 flex items-center justify-between">
                              <button 
                                onClick={() => window.open(user.external_urls.spotify, '_blank')}
                                className="text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-white transition-colors flex items-center gap-2"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View on Spotify
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-20 flex flex-col items-center justify-center text-center space-y-8">
                           <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/10 border-dashed">
                             <Disc className="w-10 h-10 text-neutral-700 animate-spin-slow" />
                           </div>
                           <div>
                             <h2 className="text-2xl font-black italic uppercase tracking-tighter text-neutral-500">Void State</h2>
                             <p className="text-xs font-bold text-neutral-700 uppercase tracking-widest mt-1">No active audio stream detected</p>
                           </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Mini Player (In-App) */}
      <AnimatePresence>
        {showMiniPlayer && nowPlaying?.item && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            drag
            dragMomentum={false}
            className="fixed bottom-8 right-8 z-[100] w-72 touch-none"
          >
            <div className="bg-neutral-900/60 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-3 shadow-[0_30px_70px_rgba(0,0,0,0.8)] overflow-hidden relative group">
              <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none" />
              
              <div className="flex items-center gap-3 relative z-10 text-left">
                <div className="w-16 h-16 bg-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex-shrink-0 relative group/art">
                  <img src={nowPlaying.item.album.images[0]?.url} className="w-full h-full object-cover grayscale brightness-110" alt="" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/art:opacity-100 transition-opacity flex items-center justify-center">
                    <Activity className="w-4 h-4 text-white animate-pulse" />
                  </div>
                </div>
                
                <div className="flex-1 min-w-0 pr-1 space-y-1.5">
                  <div className="overflow-hidden relative h-5">
                    <div className={`whitespace-nowrap ${nowPlaying.item.name.length > 15 ? 'animate-marquee' : ''}`}>
                      <h3 className="text-sm font-black italic tracking-tighter uppercase inline-block pr-6 text-white">
                        {nowPlaying.item.name}
                      </h3>
                      {nowPlaying.item.name.length > 15 && (
                        <h3 className="text-sm font-black italic tracking-tighter uppercase inline-block pr-6 text-white">
                          {nowPlaying.item.name}
                        </h3>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-neutral-400 font-bold tracking-tight truncate opacity-70 italic font-sans">{nowPlaying.item.artists[0]?.name}</p>
                  
                  <div className="space-y-2">
                    <div className="relative group/mini-progress h-3 flex items-center">
                      <div className="absolute h-0.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <motion.div 
                          className="absolute h-full bg-gradient-to-r from-neutral-500 to-white shadow-[0_0_10px_white]"
                          animate={{ width: `${(localProgress / nowPlaying.item.duration_ms) * 100}%` }}
                          transition={{ duration: isSeeking ? 0 : 0.1, ease: "linear" }}
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={nowPlaying.item.duration_ms}
                        value={localProgress}
                        onChange={handleSeek}
                        onMouseUp={handleSeekCommit}
                        onTouchEnd={handleSeekCommit}
                        className="absolute w-full h-full opacity-0 cursor-pointer z-20"
                      />
                    </div>

                    <div className="flex items-center gap-4">
                      <button onClick={() => handlePlayerControl('previous')} className="text-neutral-500 hover:text-white transition-all hover:scale-110 active:scale-90">
                        <SkipBack className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => handlePlayerControl(nowPlaying.is_playing ? 'pause' : 'play')}
                        className="w-8 h-8 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                      >
                        {nowPlaying.is_playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
                      </button>
                      <button onClick={() => handlePlayerControl('next')} className="text-neutral-500 hover:text-white transition-all hover:scale-110 active:scale-90">
                        <SkipForward className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 self-start">
                  <button 
                    onClick={togglePiP}
                    className="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white transition-colors bg-white/5 rounded-full"
                    title="Always on Top"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                  <button 
                    onClick={() => setShowMiniPlayer(false)}
                    className="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white transition-colors bg-white/5 rounded-full"
                    title="Close"
                  >
                    <Activity className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden bridge for PiP */}
      <canvas ref={canvasRef} width="512" height="512" className="hidden" />
      <video ref={videoRef} className="hidden" muted playsInline />

      {/* Document Picture-in-Picture Portal */}
      {pipWindow && nowPlaying?.item && createPortal(
        <div className="bg-neutral-950 text-white h-screen flex items-center px-4 font-sans overflow-hidden border-t border-white/10">
          <div className="flex items-center gap-4 w-full">
            <div className="w-14 h-14 bg-neutral-900 rounded-xl overflow-hidden shadow-2xl flex-shrink-0">
              <img src={nowPlaying.item.album.images[0]?.url} className="w-full h-full object-cover" alt="" />
            </div>
            
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <div className="overflow-hidden relative h-5">
                <div className={`whitespace-nowrap ${nowPlaying.item.name.length > 25 ? 'animate-marquee' : ''}`}>
                  <h3 className="text-sm font-black italic tracking-tighter uppercase inline-block pr-8">
                    {nowPlaying.item.name}
                  </h3>
                  {nowPlaying.item.name.length > 25 && (
                    <h3 className="text-sm font-black italic tracking-tighter uppercase inline-block pr-8">
                      {nowPlaying.item.name}
                    </h3>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-neutral-400 font-bold opacity-70 italic truncate">{nowPlaying.item.artists[0]?.name}</p>
              
              <div className="mt-1">
                <div className="relative h-1 w-full bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="absolute h-full bg-white shadow-[0_0_10px_white]"
                    style={{ width: `${(localProgress / nowPlaying.item.duration_ms) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 pl-2">
              <button onClick={() => handlePlayerControl('previous')} className="text-neutral-500 hover:text-white transition-all transform active:scale-90">
                <SkipBack className="w-4 h-4" />
              </button>
              <button 
                onClick={() => handlePlayerControl(nowPlaying.is_playing ? 'pause' : 'play')}
                className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-[0_0_15px_rgba(255,255,255,0.3)]"
              >
                {nowPlaying.is_playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>
              <button onClick={() => handlePlayerControl('next')} className="text-neutral-500 hover:text-white transition-all transform active:scale-90">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>,
        pipWindow.document.body
      )}
    </div>
  );
}
