import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Hls from 'hls.js';
import {
  ArrowRight, Gauge, Loader2, Maximize, Minimize, Pause, PictureInPicture2, Play,
  RotateCcw, RotateCw, SkipForward, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import type { MediaItem } from '@shared/types';
import { useCatalog } from '@/lib/CatalogProvider';
import { serverOrigin, useApp } from '@/store/app';
import { useLibrary } from '@/store/library';
import { buildSource } from '@/lib/source';
import { episodeLabel, findNextEpisode, seriesKey } from '@/lib/catalog';
import { formatDuration } from '@/lib/format';
import { Button } from '@/components/ui/primitives';
import './player.css';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
/** Signed stream links expire; refresh well before they do. */
const STREAM_REFRESH_MS = 25 * 60 * 1000;
const SAVE_EVERY_MS = 10000;

export default function WatchScreen() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { model } = useCatalog();
  const settings = useApp((s) => s.settings);
  const progressMap = useLibrary((s) => s.progress);
  const recordProgress = useLibrary((s) => s.recordProgress);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<number | null>(null);
  const lastSave = useRef(0);
  const seekRef = useRef<HTMLDivElement>(null);

  const [item, setItem] = useState<MediaItem | null>(() => model.byId.get(id) ?? null);
  const [src, setSrc] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(settings?.defaultVolume ?? 0.9);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [rateOpen, setRateOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hoverTime, setHoverTime] = useState<{ x: number; t: number } | null>(null);
  const [showNext, setShowNext] = useState(false);

  const origin = serverOrigin();
  const seekStep = settings?.seekStep ?? 10;
  const isLive = item?.is_live === true;

  const source = useMemo(() => (item ? buildSource(item, origin) : null), [item, origin]);

  const nextEpisode = useMemo(() => {
    if (!item?.series_name) return null;
    const series = model.seriesByKey.get(seriesKey(item.series_name));
    return series ? findNextEpisode(series, item) : null;
  }, [item, model.seriesByKey]);

  const flash = useCallback((text: string) => {
    setHint(text);
    window.setTimeout(() => setHint((h) => (h === text ? null : h)), 1100);
  }, []);

  /* ── Load the item (the catalog copy may be missing on a deep link) ──── */
  useEffect(() => {
    let alive = true;
    const cached = model.byId.get(id);
    if (cached) setItem(cached);
    void window.zovex.content.item(id).then((full) => {
      if (alive && full) setItem((prev) => ({ ...(prev ?? full), ...full }));
    });
    return () => { alive = false; };
  }, [id, model.byId]);

  useEffect(() => {
    if (source?.url) setSrc(source.url);
    setError(source?.kind === 'none' ? source.reason ?? 'אין מקור וידאו' : null);
  }, [source]);

  /* ── Attach the stream ───────────────────────────────────────────────── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !source || source.kind === 'embed' || source.kind === 'none') return;

    setReady(false);
    setWaiting(true);
    setError(null);

    const canPlayNatively = video.canPlayType('application/vnd.apple.mpegurl');

    if (source.kind === 'hls' && Hls.isSupported() && !canPlayNatively) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,          // keep memory bounded on long sessions
        maxBufferLength: 40,
        manifestLoadingTimeOut: 20000,
        fragLoadingTimeOut: 30000,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setError('השידור נקטע ולא ניתן לשחזר אותו.');
      });
      return () => { hls.destroy(); hlsRef.current = null; };
    }

    video.src = src;
    video.load();
    return () => { video.removeAttribute('src'); video.load(); };
  }, [src, source]);

  /* ── Resume position ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!ready || isLive || params.get('restart') === '1' || !settings?.resumePlayback) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    void (async () => {
      const local = progressMap[id]?.position ?? 0;
      const remote = await window.zovex.playback.loadProgress(id).catch(() => 0);
      const start = Math.max(local, remote);
      if (!cancelled && start > 30 && duration > 0 && start < duration - 60) {
        video.currentTime = start;
        flash(`ממשיך מ־${formatDuration(start)}`);
      }
    })();
    return () => { cancelled = true; };
    // Resume runs once per item, when metadata is first known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id]);

  /* ── Keep the screen awake while playing ─────────────────────────────── */
  useEffect(() => {
    void window.zovex.playback.keepAwake(playing);
    return () => { void window.zovex.playback.keepAwake(false); };
  }, [playing]);

  /* ── Persist progress ────────────────────────────────────────────────── */
  const persist = useCallback((position: number, total: number, force = false) => {
    if (isLive || !item || total <= 0 || position <= 0) return;
    const now = Date.now();
    if (!force && now - lastSave.current < SAVE_EVERY_MS) return;
    lastSave.current = now;
    void recordProgress(item.id, {
      position, duration: total, updatedAt: now,
      title: item.title, thumb: item.thumbnail_url,
    });
    void window.zovex.playback.saveProgress(item.id, position, total);
  }, [isLive, item, recordProgress]);

  useEffect(() => {
    if (!item || isLive) return;
    void window.zovex.playback.saveHistory(item.id, item.title, item.thumbnail_url ?? '');
  }, [item, isLive]);

  // Leaving the screen must not lose the last few seconds.
  useEffect(() => () => {
    const video = videoRef.current;
    if (video && video.duration > 0 && video.currentTime > 0) {
      persist(video.currentTime, video.duration, true);
    }
  }, [persist]);

  /* ── Signed-URL refresh for long sessions ────────────────────────────── */
  useEffect(() => {
    if (!src || source?.kind === 'embed') return;
    const timer = window.setInterval(() => {
      void window.zovex.playback.refreshStream(src).then((fresh) => {
        if (!fresh || fresh === src) return;
        const video = videoRef.current;
        const at = video?.currentTime ?? 0;
        setSrc(fresh);
        window.setTimeout(() => {
          const v = videoRef.current;
          if (v && at > 0) { v.currentTime = at; void v.play().catch(() => {}); }
        }, 400);
      }).catch(() => {});
    }, STREAM_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [src, source]);

  /* ── Video element wiring ────────────────────────────────────────────── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
    video.playbackRate = rate;
  }, [volume, muted, rate]);

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setTime(video.currentTime);
    if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1));
    persist(video.currentTime, video.duration);
    if (!isLive && nextEpisode && video.duration > 0 && video.duration - video.currentTime < 40) setShowNext(true);
  };

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setError('הדפדפן חסם את הניגון. לחץ שוב על הפעלה.'));
    else video.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration);
    flash(delta > 0 ? `+${Math.abs(delta)} שניות` : `−${Math.abs(delta)} שניות`);
  }, [flash]);

  const seekTo = (clientX: number) => {
    const el = seekRef.current;
    const video = videoRef.current;
    if (!el || !video || !Number.isFinite(video.duration)) return;
    const rect = el.getBoundingClientRect();
    const raw = (clientX - rect.left) / rect.width;
    const ratio = document.dir === 'rtl' ? 1 - raw : raw;
    video.currentTime = Math.min(Math.max(0, ratio * video.duration), video.duration);
  };

  const toggleFullscreen = useCallback(() => {
    const next = !fullscreen;
    setFullscreen(next);
    void window.zovex.window.setFullScreen(next);
  }, [fullscreen]);

  const leave = useCallback(() => {
    if (fullscreen) void window.zovex.window.setFullScreen(false);
    navigate(-1);
  }, [fullscreen, navigate]);

  /* ── Keyboard ────────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key) {
        case ' ': case 'k': case 'K': e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': e.preventDefault(); seekBy(document.dir === 'rtl' ? -seekStep : seekStep); break;
        case 'ArrowLeft': e.preventDefault(); seekBy(document.dir === 'rtl' ? seekStep : -seekStep); break;
        case 'j': case 'J': seekBy(-30); break;
        case 'l': case 'L': seekBy(30); break;
        case 'ArrowUp': e.preventDefault(); setVolume((v) => { const n = Math.min(1, v + 0.05); flash(`עוצמה ${Math.round(n * 100)}%`); return n; }); break;
        case 'ArrowDown': e.preventDefault(); setVolume((v) => { const n = Math.max(0, v - 0.05); flash(`עוצמה ${Math.round(n * 100)}%`); return n; }); break;
        case 'm': case 'M': setMuted((m) => { flash(!m ? 'מושתק' : 'שמע פעיל'); return !m; }); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'Escape': if (fullscreen) { setFullscreen(false); void window.zovex.window.setFullScreen(false); } else leave(); break;
        case 'n': case 'N': if (nextEpisode) navigate(`/watch/${nextEpisode.id}`); break;
        default:
          if (/^[0-9]$/.test(e.key)) {
            const video = videoRef.current;
            if (video && Number.isFinite(video.duration)) video.currentTime = (Number(e.key) / 10) * video.duration;
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seekBy, seekStep, toggleFullscreen, fullscreen, leave, nextEpisode, navigate, flash]);

  /* ── Auto-hide chrome ────────────────────────────────────────────────── */
  const wake = useCallback(() => {
    setChromeHidden(false);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !rateOpen) setChromeHidden(true);
    }, 2800);
  }, [rateOpen]);

  useEffect(() => { wake(); return () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }; }, [wake]);

  const subtitle = item?.series_name
    ? `${item.series_name} · ${episodeLabel(item)}`
    : [item?.year, item?.category].filter(Boolean).join(' · ');

  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      className="player"
      data-surface="cinema"
      onMouseMove={wake}
      onMouseLeave={() => videoRef.current && !videoRef.current.paused && setChromeHidden(true)}
    >
      <div className="player__drag" />

      <div className="player__stage" onDoubleClick={toggleFullscreen}>
        {source?.kind === 'embed' && src ? (
          <iframe
            className="player__frame"
            src={src}
            title={item?.title ?? 'נגן'}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups-to-escape-sandbox"
          />
        ) : (
          <video
            ref={videoRef}
            className="player__video"
            playsInline
            autoPlay
            onClick={togglePlay}
            onPlay={() => { setPlaying(true); wake(); }}
            onPause={() => { setPlaying(false); setChromeHidden(false); }}
            onWaiting={() => setWaiting(true)}
            onPlaying={() => { setWaiting(false); setError(null); }}
            onCanPlay={() => { setWaiting(false); setReady(true); }}
            onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); setReady(true); }}
            onTimeUpdate={onTimeUpdate}
            onDurationChange={(e) => setDuration(e.currentTarget.duration)}
            onEnded={() => {
              if (nextEpisode && settings?.autoplayNext) navigate(`/watch/${nextEpisode.id}`);
              else setShowNext(Boolean(nextEpisode));
            }}
            onError={() => setError('לא ניתן לנגן את הקובץ. ייתכן שהקישור פג או שהמקור אינו זמין.')}
          />
        )}
      </div>

      {/* Buffering / first-frame indicator */}
      {source?.kind !== 'embed' && waiting && !error && (
        <div className="player__center">
          <Loader2 size={44} style={{ animation: 'spin 1s linear infinite', opacity: .85 }} />
        </div>
      )}

      {source?.kind !== 'embed' && !playing && !waiting && !error && (
        <div className="player__center">
          <button type="button" className="player__bigplay" onClick={togglePlay} aria-label="נגן">
            <Play size={34} fill="currentColor" />
          </button>
        </div>
      )}

      {hint && <div className="player__toast">{hint}</div>}

      {/* Error overlay — never a blank black window */}
      {error && (
        <div className="player__overlay">
          <div className="player__overlay-card">
            <h2>לא ניתן לנגן את הפריט</h2>
            <p>{error}</p>
            {src && <code>{src.slice(0, 160)}</code>}
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <Button
                variant="primary"
                onClick={() => {
                  setError(null);
                  if (src) {
                    void window.zovex.playback.refreshStream(src).then((fresh) => {
                      if (fresh) setSrc(fresh);
                      else videoRef.current?.load();
                    });
                  }
                }}
              >
                נסה שוב
              </Button>
              {source?.url && (
                <Button variant="secondary" onClick={() => void window.zovex.app.openExternal(source.url!)}>
                  פתח בדפדפן
                </Button>
              )}
              <Button variant="ghost" onClick={leave}>חזור</Button>
            </div>
          </div>
        </div>
      )}

      {/* Next-episode card */}
      {showNext && nextEpisode && (
        <div className="next-card">
          <div className="next-card__label">הפרק הבא</div>
          <div className="next-card__title truncate">{nextEpisode.episode_title?.trim() || nextEpisode.title}</div>
          <div className="next-card__sub">{episodeLabel(nextEpisode)}</div>
          <div className="next-card__actions">
            <Button size="sm" variant="primary" icon={<SkipForward size={14} />} onClick={() => navigate(`/watch/${nextEpisode.id}`)}>
              נגן עכשיו
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNext(false)}>לא עכשיו</Button>
          </div>
        </div>
      )}

      {/* Chrome */}
      <div className="player__chrome" data-hidden={chromeHidden && playing}>
        <div className="player__top">
          <button type="button" className="player__btn" onClick={leave} aria-label="חזור" title="חזור (Esc)">
            <ArrowRight size={20} />
          </button>
          <div className="player__title">
            <h1 className="truncate">{item?.title ?? 'טוען…'}</h1>
            {subtitle && <p className="truncate">{subtitle}</p>}
          </div>
        </div>

        <div className="player__bottom">
          {!isLive && source?.kind !== 'embed' && (
            <div
              className="seek"
              ref={seekRef}
              onClick={(e) => seekTo(e.clientX)}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const raw = (e.clientX - rect.left) / rect.width;
                const ratio = document.dir === 'rtl' ? 1 - raw : raw;
                setHoverTime({ x: e.clientX - rect.left, t: ratio * duration });
              }}
              onMouseLeave={() => setHoverTime(null)}
            >
              <div className="seek__track">
                <div className="seek__buffer" style={{ width: `${bufPct}%` }} />
                <div className="seek__fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="seek__dot" style={{ insetInlineStart: `${pct}%` }} />
              {hoverTime && Number.isFinite(hoverTime.t) && (
                <div className="seek__ghost" style={{ insetInlineStart: hoverTime.x }}>
                  {formatDuration(hoverTime.t)}
                </div>
              )}
            </div>
          )}

          <div className="player__controls">
            {source?.kind !== 'embed' && (
              <>
                <button type="button" className="player__btn player__btn--primary" onClick={togglePlay} aria-label={playing ? 'השהה' : 'נגן'} title="רווח">
                  {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                </button>
                {!isLive && (
                  <>
                    <button type="button" className="player__btn" onClick={() => seekBy(-seekStep)} aria-label="אחורה" title={`אחורה ${seekStep} שניות`}>
                      <RotateCcw size={19} />
                    </button>
                    <button type="button" className="player__btn" onClick={() => seekBy(seekStep)} aria-label="קדימה" title={`קדימה ${seekStep} שניות`}>
                      <RotateCw size={19} />
                    </button>
                  </>
                )}

                <div className="volume">
                  <button type="button" className="player__btn" onClick={() => setMuted((m) => !m)} aria-label="השתקה" title="השתקה (M)">
                    <VolumeIcon size={19} />
                  </button>
                  <input
                    className="slider volume__slider"
                    type="range" min={0} max={1} step={0.01}
                    value={muted ? 0 : volume}
                    aria-label="עוצמת שמע"
                    style={{ ['--fill' as string]: `${(muted ? 0 : volume) * 100}%` }}
                    onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
                  />
                </div>

                <span className="player__time">
                  {isLive ? 'שידור חי' : `${formatDuration(time)} / ${formatDuration(duration)}`}
                </span>
              </>
            )}

            <div className="player__spacer" />

            {nextEpisode && (
              <button type="button" className="player__btn" onClick={() => navigate(`/watch/${nextEpisode.id}`)} aria-label="הפרק הבא" title="הפרק הבא (N)">
                <SkipForward size={19} />
              </button>
            )}

            {source?.kind !== 'embed' && (
              <>
                <button type="button" className="player__btn" onClick={() => setRateOpen((o) => !o)} aria-label="מהירות ניגון" title="מהירות ניגון">
                  <Gauge size={19} />
                </button>
                <button
                  type="button"
                  className="player__btn"
                  onClick={() => { void videoRef.current?.requestPictureInPicture?.().catch(() => flash('תמונה בתוך תמונה אינה זמינה')); }}
                  aria-label="תמונה בתוך תמונה"
                  title="תמונה בתוך תמונה"
                >
                  <PictureInPicture2 size={19} />
                </button>
              </>
            )}

            <button type="button" className="player__btn" onClick={toggleFullscreen} aria-label="מסך מלא" title="מסך מלא (F)">
              {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
            </button>
          </div>
        </div>
      </div>

      {rateOpen && (
        <div className="rate-menu" onMouseLeave={() => setRateOpen(false)}>
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              className="rate-menu__item"
              data-active={r === rate}
              onClick={() => { setRate(r); setRateOpen(false); flash(`מהירות ${r}×`); }}
            >
              <span>{r === 1 ? 'רגילה' : `${r}×`}</span>
              {r === rate && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
