/**
 * Turns a catalog row into something playable.
 *
 * The catalog holds nine kinds of video reference accumulated over the life of
 * the service, plus two shapes that are simply broken (a pasted <iframe> and a
 * URL that lost its leading "h"). Both are recoverable with certainty, so they
 * are repaired here rather than shown to the user as a dead item. This mirrors
 * the Android client so both apps play exactly the same set.
 */
import type { MediaItem } from '@shared/types';

export type PlaybackKind = 'native' | 'hls' | 'embed' | 'none';

export interface PlaybackSource {
  kind: PlaybackKind;
  url: string | null;
  /** Human-readable reason shown when kind is 'none'. */
  reason?: string;
}

const TG_CHANNELS: Record<string, string> = { zove8: '7282626428', ZOVE8: '7282626428' };

function cleanRef(raw: string): string {
  let v = (raw || '').trim();
  if (!v) return '';
  const iframe = v.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (iframe) v = iframe[1].trim();
  v = v.replace(/^(?:ttps?):\/\//i, (m) => (m.toLowerCase().startsWith('ttps') ? 'https://' : 'http://'));
  return v.replace(/&amp;/g, '&');
}

export function isHlsUrl(src: string | null): boolean {
  return !!src && (src.includes('.m3u8') || src.includes('Manifest.ism'));
}

const EMBED_HOSTS = [
  'youtube.com', 'youtu.be', 'drive.google.com', 'vimeo.com', 'dailymotion.com',
  'streamable.com', 'rumble.com', 'archive.org', 'kan.org.il', 'ok.ru', 't.me', 'kaltura.com',
];

export function buildSource(item: MediaItem, origin: string, startSeconds = 0): PlaybackSource {
  const vid = cleanRef(item.video_id || item.video_url || '');
  const type = (item.type || 'direct').toLowerCase();
  const t = Math.max(0, Math.floor(startSeconds || 0));
  const tgProxy = origin.replace(/\/+$/, '');

  if (!vid) return { kind: 'none', url: null, reason: 'לפריט הזה אין מקור וידאו בשרת' };

  const embed = (url: string): PlaybackSource => ({ kind: 'embed', url });

  if (vid.includes('kaltura.com')) return embed(vid);
  const kalturaParts = vid.match(/^(\d+)\/(\d+)\/([a-zA-Z0-9_]+)$/);
  if (type === 'kaltura' || kalturaParts) {
    const p = vid.split('/');
    if (p.length >= 3) {
      return embed(`https://cdnapisec.kaltura.com/p/${p[0]}/embedPlaykitJs/uiconf_id/${p[1]}?iframeembed=true&entry_id=${p[2]}`);
    }
    return { kind: 'none', url: null, reason: 'מזהה Kaltura לא תקין' };
  }
  if (type === 'youtube' || vid.includes('youtube.com') || vid.includes('youtu.be')) {
    const m = vid.match(/(?:v=|youtu\.be\/)([^&/?]+)/);
    const base = `https://www.youtube.com/embed/${m ? m[1] : vid}?autoplay=1`;
    return embed(t > 0 ? `${base}&start=${t}` : base);
  }
  if (type === 'drive' || vid.includes('drive.google.com')) {
    const m = vid.match(/\/d\/([^/?]+)/);
    return embed(`https://drive.google.com/file/d/${m ? m[1] : vid}/preview`);
  }
  if (type === 'vimeo' || vid.includes('vimeo.com')) {
    const m = vid.match(/vimeo\.com\/(\d+)/);
    const base = `https://player.vimeo.com/video/${m ? m[1] : vid}?autoplay=1`;
    return embed(t > 0 ? `${base}#t=${t}s` : base);
  }
  if (type === 'dailymotion' || vid.includes('dailymotion.com')) {
    const m = vid.match(/(?:video\/|dai\.ly\/)([a-zA-Z0-9]+)/);
    return embed(`https://www.dailymotion.com/embed/video/${m ? m[1] : vid}?autoplay=1`);
  }
  if (type === 'streamable' || vid.includes('streamable.com')) {
    const m = vid.match(/streamable\.com\/([a-zA-Z0-9]+)/);
    return embed(`https://streamable.com/e/${m ? m[1] : vid}?autoplay=1`);
  }
  if (type === 'rumble' || vid.includes('rumble.com')) {
    const m = vid.match(/(?:embed\/|video\/)([a-zA-Z0-9]+)/);
    return embed(`https://rumble.com/embed/${m ? m[1] : vid}/`);
  }
  if (type === 'archive' || vid.includes('archive.org')) {
    const m = vid.match(/archive\.org\/(?:embed|details)\/([^/?]+)/);
    return embed(`https://archive.org/embed/${m ? m[1] : vid}`);
  }
  if (type === 'kan' || vid.includes('kan.org.il')) {
    return embed(`https://www.kan.org.il/General/Embed.aspx?id=${vid}`);
  }
  if (type === 'okru' || vid.includes('ok.ru')) {
    const m = vid.match(/ok\.ru\/video\/(\d+)/);
    return embed(`https://ok.ru/videoembed/${m ? m[1] : vid}`);
  }
  if (type === 'telegram' || vid.includes('t.me')) {
    if (vid.startsWith('http') && !vid.includes('t.me')) {
      return { kind: isHlsUrl(vid) ? 'hls' : 'native', url: vid };
    }
    const tgId = vid.replace(/^https?:\/\/t\.me\//, '');
    const parts = tgId.split('/').filter(Boolean);
    const chanRaw = parts[0] || '';
    const msgId = parts[parts.length - 1];
    if (/^-?\d+$/.test(chanRaw) && msgId) return { kind: 'native', url: `${tgProxy}/stream/${chanRaw}/${msgId}` };
    const numeric = TG_CHANNELS[chanRaw] || TG_CHANNELS[chanRaw.toLowerCase()];
    if (numeric && msgId) return { kind: 'native', url: `${tgProxy}/stream/${numeric}/${msgId}` };
    return embed(`https://t.me/${tgId}?embed=1&mode=tme`);
  }

  if (!vid.startsWith('http')) return { kind: 'none', url: null, reason: 'כתובת הווידאו בשרת אינה תקינה' };
  if (EMBED_HOSTS.some((h) => vid.includes(h))) return embed(vid);
  return { kind: isHlsUrl(vid) ? 'hls' : 'native', url: vid };
}

/** Some thumbnails come back as site-relative paths. */
export function absoluteImage(url: string | null | undefined, origin: string): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return origin.replace(/\/+$/, '') + url;
  return url;
}
