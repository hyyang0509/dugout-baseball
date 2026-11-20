// BM27 scene art: flat scoreboard-style SVG illustrations (no photos, no real logos).
// Pure functions, no imports. Colours come from the page's CSS variables so both themes work.

const BOARD = 'var(--art-board)', INK = 'var(--art-ink)', GOLD = 'var(--art-gold)', RED = 'var(--art-red)', DIM = 'var(--art-dim)';

// Event / story → scene. Unknown stories fall back to the event type.
const STORY_SCENE = {
  slump_extra: 'training', slump_followup: 'training', analytics_shift: 'training', equipment_bats: 'training', scout_tip: 'training', nutrition_plan: 'training',
  hot_media: 'media', rival_talk: 'media', trade_rumor: 'media',
  clutch_cleanup: 'clubhouse', leader_speech: 'clubhouse', losing_meeting: 'clubhouse', feud: 'clubhouse', feud_followup: 'clubhouse', hothead_umpire: 'clubhouse',
  mentor_pair: 'clubhouse', rookie_breakthrough: 'clubhouse', rookie_nerves: 'clubhouse', rookie_grows: 'clubhouse', veteran_rest: 'clubhouse', quiet_homesick: 'clubhouse', comeback_vow: 'clubhouse',
  win_streak: 'fans', sold_out_outfield: 'fans', fan_signing: 'fans', theme_night: 'fans', theme_result: 'fans', legend_returns: 'fans',
  owner_visit: 'office', owner_title_bonus: 'office', agent_call: 'office', agent_return: 'office', sponsor_ad: 'office',
  grinder_hurt: 'medical', grinder_aftermath: 'medical', fragile_tweak: 'medical', bullpen_tired: 'medical', wellness_day: 'medical',
  travel_delay: 'travel', bus_karaoke: 'travel', heat_wave: 'weather',
  charity_hospital: 'community', loyal_hometown: 'community',
};
const TYPE_SCENE = {injury: 'medical', training: 'training', offfield: 'media', clubhouse: 'clubhouse', trade_offer: 'trade', league_trade: 'trade', team: 'office'};

export function sceneFor(e) {
  if (!e) return 'office';
  if (e.story && STORY_SCENE[e.story]) return STORY_SCENE[e.story];
  if (e.type === 'clubhouse' && e.scenario === 'bus') return 'travel';
  return TYPE_SCENE[e.type] || 'clubhouse';
}

// Scoreboard frame: dark board, a row of bulbs along the top, a faint grass line at the bottom.
const frame = inner => `<svg class="scene-art" viewBox="0 0 560 150" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><rect width="560" height="150" rx="10" fill="${BOARD}"/><g fill="${GOLD}" opacity=".55">${Array.from({length: 27}, (_, i) => `<circle cx="${20 + i * 20}" cy="12" r="2.2"/>`).join('')}</g><path d="M0 132h560" stroke="${DIM}" stroke-width="2" stroke-dasharray="6 8"/>${inner}</svg>`;

const jersey = (x, y, n, fill = INK, ink = BOARD) => `<g transform="translate(${x} ${y})"><path d="M-22-28h12q10 8 20 0h12l16 14-10 12-8-6v42h-40v-42l-8 6-10-12z" fill="${fill}"/><text x="0" y="8" text-anchor="middle" font-family="Oswald,Arial Narrow,sans-serif" font-size="20" font-weight="700" fill="${ink}">${n}</text></g>`;

const SCENES = {
  medical: () => frame(`
    <circle cx="120" cy="76" r="40" fill="none" stroke="${INK}" stroke-width="4"/><path d="M110 50h20v16h16v20h-16v16h-20v-16h-16v-20h16z" fill="${RED}"/>
    <path d="M190 80h60l12-26 16 52 14-38 10 12h70" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="410" y="56" width="70" height="46" rx="10" fill="${INK}" opacity=".9"/><path d="M420 70h50M420 82h50M420 94h30" stroke="${BOARD}" stroke-width="3" opacity=".5"/><rect x="434" y="44" width="22" height="14" rx="4" fill="${INK}"/>`),
  clubhouse: () => frame(`
    ${[0, 1, 2, 3, 4].map(i => `<rect x="${60 + i * 92}" y="30" width="78" height="96" rx="4" fill="none" stroke="${DIM}" stroke-width="3"/><path d="M${72 + i * 92} 42h54" stroke="${DIM}" stroke-width="2" stroke-dasharray="4 4"/>`).join('')}
    ${jersey(99, 86, 7)}${jersey(191, 86, 18, GOLD)}${jersey(283, 86, 24)}${jersey(375, 86, 3, RED, 'var(--art-ink)')}${jersey(467, 86, 51)}
    <rect x="40" y="118" width="480" height="10" rx="3" fill="${GOLD}" opacity=".8"/>`),
  media: () => frame(`
    <rect x="90" y="36" width="14" height="60" rx="7" fill="${INK}"/><path d="M78 70q19 34 38 0" fill="none" stroke="${INK}" stroke-width="4"/><path d="M97 104v20M82 124h30" stroke="${INK}" stroke-width="4"/>
    <rect x="190" y="52" width="110" height="64" rx="8" fill="${INK}"/><circle cx="245" cy="84" r="20" fill="${BOARD}"/><circle cx="245" cy="84" r="10" fill="${GOLD}"/><rect x="204" y="42" width="30" height="12" rx="3" fill="${INK}"/><circle cx="286" cy="62" r="4" fill="${RED}"/>
    <path d="M350 34h150a10 10 0 0 1 10 10v36a10 10 0 0 1-10 10h-110l-22 18 4-18h-22a10 10 0 0 1-10-10v-36a10 10 0 0 1 10-10z" fill="none" stroke="${GOLD}" stroke-width="4"/><path d="M366 52h120M366 68h80" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`),
  fans: () => frame(`
    ${[0, 1, 2, 3].map(r => Array.from({length: 26 - r * 2}, (_, i) => `<circle cx="${30 + r * 20 + i * 20}" cy="${118 - r * 18}" r="6" fill="${(i + r) % 5 === 0 ? GOLD : (i + r) % 7 === 0 ? RED : INK}" opacity="${0.95 - r * 0.15}"/>`).join('')).join('')}
    <path d="M110 64V20l34 9-34 9" fill="${RED}"/><path d="M110 64V20" stroke="${INK}" stroke-width="3"/><path d="M440 64V20l34 9-34 9" fill="${GOLD}"/><path d="M440 64V20" stroke="${INK}" stroke-width="3"/>
    <g fill="${GOLD}"><rect x="262" y="22" width="36" height="12" rx="2"/></g><path d="M280 34v24" stroke="${DIM}" stroke-width="4"/>`),
  training: () => frame(`
    <path d="M60 120 210 40" stroke="${GOLD}" stroke-width="12" stroke-linecap="round"/><path d="M60 120l22-12" stroke="${INK}" stroke-width="14" stroke-linecap="round"/>
    <circle cx="250" cy="60" r="18" fill="${INK}"/><path d="M238 48q8 12 0 24M262 48q-8 12 0 24" fill="none" stroke="${RED}" stroke-width="2.5"/>
    ${[0, 1, 2].map(i => `<path d="M${320 + i * 60} 124l16-34 16 34z" fill="${i === 1 ? GOLD : RED}"/>`).join('')}
    <path d="M300 40h200M300 40v84M500 40v84" stroke="${DIM}" stroke-width="2"/>${Array.from({length: 9}, (_, i) => `<path d="M${300 + i * 25} 40v84" stroke="${DIM}" stroke-width="1" opacity=".6"/>`).join('')}`),
  travel: () => frame(`
    <path d="M70 96q170-90 340-40" fill="none" stroke="${DIM}" stroke-width="3" stroke-dasharray="8 8"/>
    <g transform="translate(410 56) rotate(12)"><path d="M-40 0h70q14 0 14 6t-14 6h-70z" fill="${INK}"/><path d="M-6 4l-22 26h12l26-26zM-6 2l-22-24h12l26 24zM-38 2l-10-14h8l12 14z" fill="${GOLD}"/></g>
    <rect x="60" y="80" width="150" height="40" rx="8" fill="${INK}"/>${[0, 1, 2, 3, 4].map(i => `<rect x="${70 + i * 26}" y="88" width="18" height="12" rx="2" fill="${BOARD}"/>`).join('')}<circle cx="90" cy="122" r="9" fill="${GOLD}"/><circle cx="180" cy="122" r="9" fill="${GOLD}"/>`),
  weather: () => frame(`
    <circle cx="140" cy="72" r="30" fill="${GOLD}"/>${Array.from({length: 10}, (_, i) => { const a = i * Math.PI / 5; return `<path d="M${140 + Math.cos(a) * 40} ${72 + Math.sin(a) * 40}L${140 + Math.cos(a) * 54} ${72 + Math.sin(a) * 54}" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>`; }).join('')}
    ${[0, 1, 2].map(i => `<path d="M${240} ${50 + i * 26}q20-12 40 0t40 0 40 0 40 0" fill="none" stroke="${RED}" stroke-width="4" stroke-linecap="round" opacity="${0.9 - i * 0.2}"/>`).join('')}
    <rect x="456" y="30" width="22" height="78" rx="11" fill="none" stroke="${INK}" stroke-width="4"/><circle cx="467" cy="112" r="16" fill="${RED}"/><rect x="462" y="52" width="10" height="56" fill="${RED}"/>`),
  office: () => frame(`
    <rect x="60" y="94" width="440" height="12" rx="3" fill="${GOLD}"/><path d="M90 106v20M470 106v20" stroke="${GOLD}" stroke-width="6"/>
    <rect x="100" y="40" width="96" height="54" rx="6" fill="${INK}"/><rect x="132" y="32" width="32" height="12" rx="4" fill="none" stroke="${INK}" stroke-width="4"/><path d="M100 60h96" stroke="${BOARD}" stroke-width="3" opacity=".5"/>
    <rect x="236" y="28" width="90" height="66" rx="4" fill="${INK}" opacity=".95"/><path d="M250 80l16-18 14 10 26-28" fill="none" stroke="${RED}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${[0, 1, 2, 3].map(i => `<ellipse cx="400" cy="${88 - i * 9}" rx="24" ry="7" fill="${i % 2 ? GOLD : INK}"/>`).join('')}${[0, 1].map(i => `<ellipse cx="448" cy="${88 - i * 9}" rx="24" ry="7" fill="${i % 2 ? INK : GOLD}"/>`).join('')}`),
  community: () => frame(`
    <path d="M70 120V70l60-36 60 36v50z" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><rect x="116" y="88" width="28" height="32" fill="${GOLD}"/><path d="M124 58h12v-10h8v10h12v8h-12v10h-8v-10h-12z" fill="${RED}" transform="translate(-10 0)"/>
    <path d="M280 104c-40-26-40-62-14-62 10 0 14 8 14 8s4-8 14-8c26 0 26 36-14 62z" fill="${RED}"/>
    ${[0, 1, 2].map(i => `<g transform="translate(${380 + i * 44} ${i === 1 ? 70 : 80})"><circle r="10" fill="${INK}"/><path d="M-14 50v-28q14-12 28 0v28z" fill="${i === 1 ? GOLD : INK}"/></g>`).join('')}`),
  trade: () => frame(`
    ${jersey(150, 82, 12)}${jersey(410, 82, 33, GOLD)}
    <path d="M220 62h110l-14-12M340 102H230l14 12" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="280" cy="82" r="5" fill="${RED}"/>`),
};

export function eventArt(e) {
  const scene = sceneFor(e);
  return (SCENES[scene] || SCENES.clubhouse)();
}
export const SCENE_NAMES = Object.keys(SCENES);

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
