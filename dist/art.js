// BM27 diagrams: the defensive alignment drawn as inline SVG (no photos, no real logos). Pure functions.
// v3.0 removed the event scene illustrations; events are text only.

// --- Defensive alignment diagram ------------------------------------------------
const SPOTS = {C: [220, 292], P: [220, 200], '1B': [304, 184], '2B': [266, 146], SS: [174, 146], '3B': [136, 184], LF: [104, 92], CF: [220, 54], RF: [336, 92]};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
// Latin names show the surname; CJK names stay whole.
// Suffixes such as Jr. or III are dropped so "Bobby Witt Jr." shows as Witt.
export const shortName = name => { const n = String(name || ''); if (!/[A-Za-z]/.test(n) || !n.includes(' ')) return n; const parts = n.split(' ').filter(w => !/^(Jr\.?|Sr\.?|II|III|IV)$/i.test(w)); return parts.at(-1) || n; };

/** entries: [{pos:'SS', name:'...'}]. Positions outside the nine (DH) are listed under the diagram. */
export function defenseDiagram(entries) {
  // entries: {pos, name, id?, tag?, tone?}. tag adds a second line (e.g. rating and rank); tone 'weak'/'strong' colours the frame.
  const by = Object.fromEntries(entries.filter(e => SPOTS[e.pos]).map(e => [e.pos, e]));
  const tall = entries.some(e => SPOTS[e.pos] && e.tag);
  const labels = Object.entries(SPOTS).map(([pos, [x, y]]) => {
    const e = by[pos] || {}, stroke = e.tone === 'weak' ? 'var(--art-red)' : 'var(--art-gold)', width = e.tone ? 2 : 1;
    const y0 = tall ? (pos === 'C' ? -24 : -15) : -11, h = tall ? 32 : 22;
    return `<g transform="translate(${x} ${y})"${e.id ? ` class="defense-link" data-action="player" data-id="${esc(e.id)}" role="button" tabindex="0" aria-label="${esc(e.name || '')} 球員資訊"` : ''}><rect x="-40" y="${y0}" width="80" height="${h}" rx="4" fill="var(--art-board)" stroke="${stroke}" stroke-width="${width}" opacity=".94"/><text y="${y0 + 15}" text-anchor="middle" font-size="11" fill="var(--art-ink)"><tspan font-family="Oswald,Arial Narrow,sans-serif" font-weight="700" fill="var(--art-gold)">${pos}</tspan> ${esc(shortName(e.name || '—')).slice(0, 10)}</text>${e.tag ? `<text y="${y0 + 27}" text-anchor="middle" font-size="9" fill="${e.tone === 'weak' ? 'var(--art-red)' : e.tone === 'strong' ? 'var(--art-gold)' : 'var(--art-ink)'}"${e.tone ? '' : ' opacity=".75"'}>${esc(e.tag)}</text>` : ''}</g>`;
  }).join('');
  return `<svg class="defense-art" viewBox="0 0 440 320" role="img" aria-label="守備配置圖"><path d="M220 300 34 116Q220-55 406 116Z" fill="#276647"/><path d="m220 295-91-91 91-91 91 91Z" fill="#ba9a65"/><path d="m220 275-71-71 71-71 71 71Z" fill="#3a7951"/><path d="M220 295 46 121M220 295 394 121" stroke="#e9e2c8" stroke-width="2" opacity=".7"/><circle cx="220" cy="204" r="13" fill="#ba9a65"/>${labels}</svg>`;
}
