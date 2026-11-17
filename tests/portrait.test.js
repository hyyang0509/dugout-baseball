import test from 'node:test';
import assert from 'node:assert/strict';
import {portraitSVG, portraitFeatures, managerCapSVG} from '../dist/portrait.js';

test('portraits are deterministic per player id and vary across players', () => {
  assert.deepEqual(portraitFeatures('mlb:606466'), portraitFeatures('mlb:606466'));
  const looks = new Set(Array.from({length: 40}, (_, i) => JSON.stringify(portraitFeatures(`p${i}`))));
  assert.ok(looks.size > 15, `expected varied faces, got ${looks.size}`);
});

test('portrait SVG shows jersey number and team colour, and sanitises inputs', () => {
  const svg = portraitSVG({id: 'x', jersey_number: '4'}, '#a71930', {label: 'Ketel Marte'});
  assert.match(svg, /^<svg class="portrait"/);
  assert.match(svg, /fill="#a71930"/);
  assert.match(svg, />4<\/text>/);
  assert.match(svg, /aria-label="Ketel Marte的自動產生頭像"/);
  const evil = portraitSVG({id: 'y', jersey_number: '<script>'}, 'red;"><script>', {label: '<b>"x"</b>'});
  assert.doesNotMatch(evil, /<script|<b>/);
  assert.match(evil, /fill="#a32638"/); // invalid colour falls back to the default red
});

test('manager cap uses the team colour', () => {
  assert.match(managerCapSVG('#005a9c'), /fill="#005a9c"/);
  assert.match(managerCapSVG(undefined), /fill="#a32638"/);
});
