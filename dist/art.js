// BM27 diagrams: the defensive alignment drawn as inline SVG (no photos, no real logos). Pure functions.
// v3.0 removed the event scene illustrations; events are text only.

// --- Defensive alignment diagram ------------------------------------------------
const SPOTS = {C: [220, 292], P: [220, 200], '1B': [304, 184], '2B': [266, 146], SS: [174, 146], '3B': [136, 184], LF: [104, 92], CF: [220, 54], RF: [336, 92]};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
// Latin names show the surname; CJK names stay whole.
export const shortName = name => { const n = String(name || ''); return /[A-Za-z]/.test(n) && n.includes(' ') ? n.split(' ').slice(-1)[0] : n; };

/** entries: [{pos:'SS', name:'...'}]. Positions outside the nine (DH) are listed under the diagram. */
export function defenseDiagram(entries) {
  const at = Object.fromEntries(entries.filter(e => SPOTS[e.pos]).map(e => [e.pos, e.name])), ids = Object.fromEntries(entries.filter(e => SPOTS[e.pos] && e.id).map(e => [e.pos, e.id]));
  const labels = Object.entries(SPOTS).map(([pos, [x, y]]) => `<g transform="translate(${x} ${y})"${ids[pos] ? ` class="defense-link" data-action="player" data-id="${esc(ids[pos])}" role="button" tabindex="0" aria-label="${esc(at[pos] || '')} 球員資訊"` : ''}><rect x="-38" y="-11" width="76" height="22" rx="4" fill="var(--art-board)" stroke="var(--art-gold)" stroke-width="1" opacity=".92"/><text y="4" text-anchor="middle" font-size="11" fill="var(--art-ink)"><tspan font-family="Oswald,Arial Narrow,sans-serif" font-weight="700" fill="var(--art-gold)">${pos}</tspan> ${esc(shortName(at[pos] || '—')).slice(0, 10)}</text></g>`).join('');
  return `<svg class="defense-art" viewBox="0 0 440 320" role="img" aria-label="守備配置圖"><path d="M220 300 34 116Q220-55 406 116Z" fill="#276647"/><path d="m220 295-91-91 91-91 91 91Z" fill="#ba9a65"/><path d="m220 275-71-71 71-71 71 71Z" fill="#3a7951"/><path d="M220 295 46 121M220 295 394 121" stroke="#e9e2c8" stroke-width="2" opacity=".7"/><circle cx="220" cy="204" r="13" fill="#ba9a65"/>${labels}</svg>`;
}
