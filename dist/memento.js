// GM career keepsake image (v3.6). mementoData() turns a career (career.js) into plain
// rows; drawMemento() paints them on a canvas the app turns into a PNG. Drawing uses only
// the 2D context API, so the layout is the same on phones and computers.
import {careerTotals, reputationPath, reputationLevel, stints, achievements, formatMoney, DIFFICULTY_LABEL, LEAGUE_SHORT} from './career.js?v=40';

export const MEMENTO_WIDTH = 1080;
const MAX_SEASON_ROWS = 18;

/** Everything the image shows, as plain values (testable without a canvas). */
export function mementoData(gm, {now = new Date(), teamName = id => id} = {}) {
  const t = careerTotals(gm), seasons = [...gm.seasons].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const {path} = reputationPath(gm), years = seasons.map(e => e.year);
  const pct = t.pct == null ? '—' : t.pct.toFixed(3).replace(/^0/, '');
  const rows = seasons.map((e, i) => e.unemployed ? {year: e.year, team: '沒有球隊', league: '', record: '—', result: '等待機會', note: '', difficulty: '', rep: path[i]?.after ?? null} : ({year: e.year, team: e.team || teamName(e.teamId), league: LEAGUE_SHORT[e.league] || e.league || '',
    record: `${e.w}–${e.l}`, result: e.champion ? '總冠軍' : e.fired && e.midseason ? '' : e.playoffs ? (e.rounds ? `季後賽晉級 ${e.rounds} 輪` : '季後賽') : e.legacy ? '' : '未進季後賽',
    note: e.fired ? (e.midseason ? '季中解職' : '解職') : e.leftEarly ? '跳槽' : e.joined ? '季中接任' : '', difficulty: DIFFICULTY_LABEL[e.difficulty] || '', rep: path[i]?.after ?? null}));
  return {
    name: gm.name || '無名 GM',
    span: years.length ? (Math.min(...years) === Math.max(...years) ? `${years[0]}` : `${Math.min(...years)}–${Math.max(...years)}`) : '尚未完成球季',
    retired: gm.retired ? `${gm.retired.year} 年退休` : '',
    reputation: t.reputation, level: reputationLevel(t.reputation), repPath: [20, ...path.map(p => p.after)],
    stats: [['總戰績', `${t.w}–${t.l}`], ['勝率', pct], ['季後賽', `${t.playoffs} 次`], ['總冠軍', `${t.champions} 座`], ['執掌球季', `${t.seasons} 季`], ['被解職', `${t.fired} 次`]],
    earnings: `${formatMoney(t.earnings)}（年薪 ${formatMoney(t.salary)}＋獎金 ${formatMoney(t.bonus)}${t.severance ? `＋解約金 ${formatMoney(t.severance)}` : ''}）`,
    stints: stints(gm).map(x => ({league: LEAGUE_SHORT[x.league] || x.league, years: x.from === x.to ? `${x.from}` : `${x.from}–${x.to}`, team: x.team || teamName(x.teamId),
      detail: `${x.w}–${x.l}${x.champions ? ` · 冠軍 ${x.champions}` : ''}${x.joined ? ' · 季中接任' : ''}${x.ended ? ` · ${x.ended}` : ''}`})),
    achievements: achievements(gm).map(a => `${a.label}（${a.year}）`),
    rows: rows.slice(-MAX_SEASON_ROWS).reverse(), moreRows: Math.max(0, rows.length - MAX_SEASON_ROWS),
    footer: `The Baseball Manager 2027 · 遊戲紀錄，非真實資料；年薪為遊戲設定 · ${now.toISOString().slice(0, 10)}`,
  };
}

const FONT = '"PingFang TC","Noto Sans TC","Microsoft JhengHei","Heiti TC",system-ui,sans-serif';
const C = {bg: '#07201a', panel: '#0d2e25', line: '#2c4a3f', gold: '#f4cf78', text: '#f1ead6', dim: '#9fb3a5', red: '#e07a86', green: '#7fbf7a'};

function fit(ctx, text, max) {
  text = String(text ?? '');
  if (ctx.measureText(text).width <= max) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
  return text + '…';
}
/** Wraps chips (achievements) into lines; returns the lines. */
function chipLines(ctx, items, max, gap = 14, pad = 28) {
  const lines = [[]]; let x = 0;
  for (const it of items) { const w = ctx.measureText(it).width + pad; if (x + w > max && lines.at(-1).length) { lines.push([]); x = 0; } lines.at(-1).push(it); x += w + gap; }
  return lines.filter(l => l.length);
}

/** Paints the keepsake. Call once with draw=false to get the height, then size the canvas and draw. */
export function drawMemento(ctx, d, {draw = true} = {}) {
  const W = MEMENTO_WIDTH, M = 64, inner = W - M * 2;
  let y = 0;
  const font = (size, weight = 400) => { ctx.font = `${weight} ${size}px ${FONT}`; };
  const text = (s, x, yy, {size = 28, weight = 400, color = C.text, align = 'left', max = inner} = {}) => { font(size, weight); if (!draw) return; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(fit(ctx, s, max), x, yy); };
  const rect = (x, yy, w, h, color, r = 14) => { if (!draw) return; ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, yy, w, h, r) : ctx.rect(x, yy, w, h); ctx.fill(); };
  const heading = label => { y += 56; text(label, M, y, {size: 30, weight: 700, color: C.gold}); y += 14; if (draw) { ctx.fillStyle = C.line; ctx.fillRect(M, y, inner, 2); } y += 22; };

  if (draw) { ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, ctx.canvas.height); ctx.fillStyle = C.gold; ctx.fillRect(0, 0, W, 10); }
  y = 96; text('BM27 · GM 生涯紀念', M, y, {size: 28, weight: 700, color: C.gold});
  y += 92; text(d.name, M, y, {size: 76, weight: 800, max: inner - 230});
  // Reputation badge.
  rect(W - M - 210, y - 92, 210, 140, C.panel);
  text('聲望', W - M - 105, y - 56, {size: 24, color: C.dim, align: 'center', max: 190});
  text(`${d.reputation}`, W - M - 105, y + 2, {size: 52, weight: 800, color: C.gold, align: 'center', max: 190});
  text(d.level, W - M - 105, y + 36, {size: 22, color: C.dim, align: 'center', max: 190});
  y += 56; text([d.span, d.retired].filter(Boolean).join(' · '), M, y, {size: 30, color: C.dim, max: inner - 230});

  // Stat tiles: 3 per row.
  y += 44; const tw = (inner - 2 * 18) / 3, th = 128;
  d.stats.forEach(([k, v], i) => {
    const x = M + (i % 3) * (tw + 18), yy = y + Math.floor(i / 3) * (th + 18);
    rect(x, yy, tw, th, C.panel);
    text(k, x + 24, yy + 44, {size: 24, color: C.dim, max: tw - 48});
    text(v, x + 24, yy + 100, {size: 44, weight: 800, max: tw - 48});
  });
  y += Math.ceil(d.stats.length / 3) * (th + 18) + 20;
  text(`個人收入 ${d.earnings}`, M, y, {size: 26, color: C.dim});

  // Reputation line.
  if (d.repPath.length > 1) {
    heading('聲望走勢');
    const h = 150, x0 = M, w = inner, pts = d.repPath, step = w / Math.max(1, pts.length - 1);
    if (draw) {
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; for (const v of [25, 50, 75]) { const yy = y + h - v / 100 * h; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); ctx.stroke(); }
      ctx.strokeStyle = C.gold; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.beginPath();
      pts.forEach((v, i) => { const px = x0 + i * step, py = y + h - v / 100 * h; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
      ctx.fillStyle = C.gold; const lx = x0 + (pts.length - 1) * step, ly = y + h - pts.at(-1) / 100 * h; ctx.beginPath(); ctx.arc(lx, ly, 8, 0, Math.PI * 2); ctx.fill();
    }
    y += h;
  }

  heading('帶過的球隊');
  if (!d.stints.length) { y += 10; text('完成第一季後會出現。', M, y, {size: 26, color: C.dim}); y += 10; }
  for (const s of d.stints) {
    y += 46;
    rect(M, y - 32, 88, 42, C.panel, 21); text(s.league, M + 44, y - 3, {size: 22, weight: 700, color: C.gold, align: 'center', max: 80});
    text(`${s.years}  ${s.team}`, M + 108, y, {size: 30, weight: 700, max: inner - 108});
    y += 36; text(s.detail, M + 108, y, {size: 24, color: C.dim, max: inner - 108});
  }

  heading('成就');
  font(24, 700);
  const lines = d.achievements.length ? chipLines(ctx, d.achievements, inner) : [];
  if (!lines.length) { y += 10; text('還沒有成就。', M, y, {size: 26, color: C.dim}); y += 10; }
  for (const line of lines) {
    let x = M; y += 10;
    for (const it of line) { font(24, 700); const w = ctx.measureText(it).width + 28; rect(x, y, w, 46, C.panel, 23); text(it, x + 14, y + 32, {size: 24, weight: 700, color: C.gold, max: w}); x += w + 14; }
    y += 46;
  }

  heading('每季紀錄');
  const cols = [[M, 90, '年'], [M + 100, 330, '球隊'], [M + 440, 150, '戰績'], [M + 600, 220, '成績'], [M + 830, 122, '聲望']];
  if (!d.rows.length) { y += 10; text('完成第一季後會出現。', M, y, {size: 26, color: C.dim}); y += 10; }
  else {
    y += 10; for (const [x, w, label] of cols) text(label, x, y, {size: 22, color: C.dim, max: w});
    for (const r of d.rows) {
      y += 50;
      text(`${r.year}`, cols[0][0], y, {size: 26, max: cols[0][1]});
      text(`${r.league} ${r.team}`, cols[1][0], y, {size: 26, max: cols[1][1]});
      text(r.record, cols[2][0], y, {size: 26, weight: 700, max: cols[2][1]});
      text([r.result, r.note].filter(Boolean).join(' · '), cols[3][0], y, {size: 24, color: r.note.includes('解職') ? C.red : r.result === '總冠軍' ? C.gold : C.text, max: cols[3][1]});
      text(r.rep == null ? '—' : `${r.rep}`, cols[4][0], y, {size: 26, color: C.dim, max: cols[4][1]});
      y += 12; if (draw) { ctx.fillStyle = C.line; ctx.fillRect(M, y, inner, 1); }
    }
    if (d.moreRows) { y += 40; text(`另有 ${d.moreRows} 季較早的紀錄`, M, y, {size: 22, color: C.dim}); }
  }

  y += 70; text(d.footer, M, y, {size: 20, color: C.dim});
  y += 44;
  return Math.ceil(y);
}
