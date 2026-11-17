// Generated, abstract player portraits (no real photos). Pure functions, no imports.
// The same player id always gets the same face, so a portrait never changes between visits.

const SKIN = ['#f1d3b3', '#e7c09a', '#d6a77c', '#b98258', '#8d5a3b', '#6b4329'];
const HAIR = ['#1d1a17', '#3b2a1e', '#6b4a2b', '#a0743f', '#2b2b2b'];

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#a32638';
const safeNumber = n => String(n ?? '').replace(/[^0-9]/g, '').slice(0, 2);

// Picks the darker of two inks so the jersey number stays readable on the team colour.
function inkOn(hex) {
  let c = hex.slice(1);
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? '#1d2a24' : '#f3ead3';
}

export function portraitFeatures(id) {
  const h = hash(id);
  return {
    skin: SKIN[h % SKIN.length],
    hair: HAIR[(h >>> 3) % HAIR.length],
    beard: (h >>> 6) % 4,      // 0 none, 1 stubble, 2 full, 3 moustache
    brim: (h >>> 8) % 2,       // 0 straight, 1 curved
    eyes: (h >>> 9) % 3,
  };
}

/**
 * Inline SVG portrait. `player` needs `id`; `jersey_number` is optional.
 * `color` is the team colour (hex). `label` is used as the accessible name.
 */
export function portraitSVG(player, color, { size = 96, label = '' } = {}) {
  const f = portraitFeatures(player?.id ?? 'unknown');
  const team = safeColor(color), ink = inkOn(team), num = safeNumber(player?.jersey_number);
  const eyeY = 54 + f.eyes;
  const beard = f.beard === 1 ? `<path d="M50 62 Q60 74 70 62" fill="none" stroke="${f.hair}" stroke-width="5" opacity=".35"/>`
    : f.beard === 2 ? `<path d="M44 56 Q46 78 60 80 Q74 78 76 56 Q70 70 60 70 Q50 70 44 56 Z" fill="${f.hair}"/>`
    : f.beard === 3 ? `<path d="M52 64 Q60 60 68 64" fill="none" stroke="${f.hair}" stroke-width="3.5" stroke-linecap="round"/>` : '';
  const brim = f.brim ? `<path d="M58 46 Q80 43 97 51" fill="none" stroke="#1d2a24" stroke-width="6" stroke-linecap="round"/>`
    : `<path d="M58 47 H96" stroke="#1d2a24" stroke-width="6" stroke-linecap="round"/>`;
  const name = String(label).replace(/[<>&"]/g, '');
  return `<svg class="portrait" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="${name ? name + '的' : ''}自動產生頭像"><rect width="120" height="120" fill="${team}"/><path d="M14 120 Q18 88 60 86 Q102 88 106 120 Z" fill="#f3ead3"/><path d="M50 86 L60 98 L70 86" fill="none" stroke="${team}" stroke-width="3"/>${num ? `<text x="60" y="114" text-anchor="middle" font-family="Oswald,Impact,sans-serif" font-weight="700" font-size="18" fill="${team}">${num}</text>` : ''}<rect x="52" y="70" width="16" height="16" fill="${f.skin}"/><ellipse cx="60" cy="56" rx="17" ry="20" fill="${f.skin}"/><circle cx="53" cy="${eyeY}" r="1.8" fill="#1d1a17"/><circle cx="67" cy="${eyeY}" r="1.8" fill="#1d1a17"/>${beard}<path d="M40 48 Q40 21 60 21 Q80 21 80 48 Z" fill="#1d2a24"/><path d="M43 46 Q43 26 60 26 Q77 26 77 46" fill="none" stroke="${ink === '#f3ead3' ? team : '#3a4a42'}" stroke-width="3" opacity=".9"/>${brim}</svg>`;
}

/** Small manager badge for the top bar: a cap in the team colour. */
export function managerCapSVG(color) {
  const team = safeColor(color);
  return `<svg class="portrait cap" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15 Q4 5 12 5 Q20 5 20 15 Z" fill="${team}"/><path d="M3 15 H22" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="5" r="1.3" fill="currentColor"/></svg>`;
}
