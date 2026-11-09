// -----------------------------------------------------------------------------
// The NYISO files, on real answers: prices of the load zones only, the latest
// complete interval of the mix and the load (never a forecast row), the New
// York clock with its EST/EDT change, and the file of the day before just
// after midnight.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICE_URL,
  fetchFuelMix,
  fetchLoad,
  fetchPrices,
  newYorkDay,
  parseEasternTime,
  parseFuelMix,
  parseLoad,
  parsePrices,
} from '../src/nyiso.js';
import { USER_AGENT } from '../src/http.js';
import { ZONE_IDS } from '../src/zones.js';
import {
  LOAD_CSV,
  MIX_CSV,
  PRICES_CSV,
  PRICES_AT,
  START,
  createFakeNyiso,
  csv,
  fixture,
} from './helpers/world.js';

test('the price file: the eleven load zones, not the external proxies', () => {
  const read = parsePrices(PRICES_CSV, START);
  assert.equal(read.at, PRICES_AT);
  assert.deepEqual(Object.keys(read.prices).sort(), [...ZONE_IDS].sort());
  assert.equal(read.prices['61761'], 32.46); // N.Y.C.
  assert.equal(read.prices['61752'], 29.24); // WEST
  assert.equal(read.prices['61845'], undefined); // NPX, a proxy
  assert.throws(() => parsePrices('"Time Stamp","Name"\n', START), /without any load zone/);
});

test('the fuel mix: the latest complete interval, shares, low-carbon and CO₂', () => {
  const mix = parseFuelMix(MIX_CSV, START);
  assert.equal(mix.at, '2026-11-07T23:05:00.000Z'); // 18:05 EST
  // Real figures of 18:05: 3492 + 2904 + 3331 + 0 + 229 + 837 + 3128 MW.
  assert.equal(mix.generationMw, 13921);
  const total = Object.values(mix.sharesPercent).reduce((sum, share) => sum + share, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
  assert.equal(Math.round(mix.lowCarbonPercent), 54);
  assert.equal(Math.round(mix.renewablePercent), 30);
  // (6396 × 490 + 3331 × 12 + 229 × 230 + 837 × 11 + 3128 × 24) / 13921
  assert.equal(Math.round(mix.carbonIntensity), 238);
});

test('an interval still missing a category is skipped', () => {
  const partial = `${MIX_CSV.trimEnd()}\n11/07/2026 18:10:00,EST,Nuclear,3330.0\n`;
  assert.equal(parseFuelMix(partial, START).at, '2026-11-07T23:05:00.000Z');
});

test('a category NYISO might add counts as unknown, never as low-carbon', () => {
  const extra = `${MIX_CSV.trimEnd()}\n${MIX_CSV.split('\n')
    .filter((line) => line.startsWith('11/07/2026 18:05'))
    .join('\n')}\n11/07/2026 18:05:00,EST,Batteries,1000.0\n`;
  const mix = parseFuelMix(extra.replaceAll('18:05:00', '18:10:00'), START);
  assert.ok(mix.lowCarbonPercent < 54);
});

test('the load: every zone of the latest complete interval, summed', () => {
  const load = parseLoad(LOAD_CSV, START);
  assert.equal(load.at, '2026-11-07T23:10:00.000Z');
  assert.equal(Object.keys(load.zonesMw).length, 11);
  assert.ok(load.totalMw > 15000 && load.totalMw < 20000);
  assert.equal(
    Math.round(load.totalMw),
    Math.round(Object.values(load.zonesMw).reduce((sum, mw) => sum + mw, 0)),
  );
});

test('rows stamped in the future are forecasts, not readings', () => {
  // An hour earlier, the latest interval in the file is ahead of now.
  const mix = parseFuelMix(MIX_CSV, Date.UTC(2026, 10, 7, 22, 0));
  assert.equal(mix.at, '2026-11-07T22:00:00.000Z');
  assert.equal(parseLoad(LOAD_CSV, Date.UTC(2026, 10, 7, 20, 0)), null);
});

test('New York time: EST, EDT, and the fall-back hour read twice', () => {
  assert.equal(
    parseEasternTime('11/07/2026 18:25:00', { zone: 'EST' }),
    Date.UTC(2026, 10, 7, 23, 25),
  );
  assert.equal(
    parseEasternTime('07/04/2026 12:00:00', { zone: 'EDT' }),
    Date.UTC(2026, 6, 4, 16, 0),
  );
  // Without a zone (the price file), the offset of the date.
  assert.equal(parseEasternTime('07/04/2026 12:00:00'), Date.UTC(2026, 6, 4, 16, 0));
  assert.equal(parseEasternTime('11/07/2026 18:25:00'), Date.UTC(2026, 10, 7, 23, 25));
  // 01:30 on 2026-11-01 happened twice: the one nearest to now.
  const first = Date.UTC(2026, 10, 1, 5, 30);
  const second = Date.UTC(2026, 10, 1, 6, 30);
  assert.equal(parseEasternTime('11/01/2026 01:30:00', { now: first + 60_000 }), first);
  assert.equal(parseEasternTime('11/01/2026 01:30:00', { now: second + 60_000 }), second);
  assert.equal(parseEasternTime('not a date'), null);
});

test('the fall-back day: the file says EDT then EST, the mix follows real time', () => {
  const dst = fixture('nyiso-rtfuelmix-dst.csv');
  // 01:55 EST = 06:55 UTC; the 01:55 EDT row is an hour older.
  assert.equal(parseFuelMix(dst, Date.UTC(2026, 10, 1, 6, 57)).at, '2026-11-01T06:55:00.000Z');
  assert.equal(parseFuelMix(dst, Date.UTC(2026, 10, 1, 5, 57)).at, '2026-11-01T05:55:00.000Z');
});

test('the daily file is named after the date in New York', () => {
  // 03:30 in Paris on the 8th is still the 7th in New York.
  assert.equal(newYorkDay(Date.UTC(2026, 10, 8, 2, 30)), '20261107');
  assert.equal(newYorkDay(Date.UTC(2026, 10, 8, 5, 30)), '20261108');
  assert.equal(newYorkDay(Date.UTC(2026, 10, 8, 5, 30), 1), '20261107');
  assert.equal(newYorkDay(Date.UTC(2026, 2, 1, 12), 1), '20260228');
});

test('just after midnight, the file of the day before is read', async () => {
  const nyiso = createFakeNyiso();
  // 00:04 on the 8th in New York: the file of the 8th does not exist yet.
  const now = Date.UTC(2026, 10, 8, 5, 4);
  const mix = await fetchFuelMix(nyiso.fetch, now);
  assert.equal(mix.at, '2026-11-07T23:05:00.000Z');
  assert.ok(nyiso.calls[0].url.endsWith('20261108rtfuelmix.csv'));
  assert.ok(nyiso.calls[1].url.endsWith('20261107rtfuelmix.csv'));
  const load = await fetchLoad(nyiso.fetch, now);
  assert.equal(load.at, '2026-11-07T23:10:00.000Z');
});

test('a failing source rejects with its HTTP status, honestly named', async () => {
  const nyiso = createFakeNyiso();
  nyiso.prices = () => csv(503, 'down');
  await assert.rejects(fetchPrices(nyiso.fetch, START), /NYISO prices answered HTTP 503/);
  assert.equal(nyiso.calls[0].url, PRICE_URL);
  assert.equal(nyiso.calls[0].headers['user-agent'], USER_AGENT);
  nyiso.mix = () => csv(404, 'Not Found');
  await assert.rejects(fetchFuelMix(nyiso.fetch, START), /fuel mix answered HTTP 404/);
  await assert.rejects(
    fetchPrices(async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }, START),
    /unreachable \(ECONNREFUSED\)/,
  );
});

test("a server error on today's file is an error, not yesterday's figures", async () => {
  const nyiso = createFakeNyiso();
  nyiso.load = () => csv(500, 'oops');
  await assert.rejects(fetchLoad(nyiso.fetch, START), /NYISO load answered HTTP 500/);
  assert.equal(nyiso.calls.length, 1);
});

test('in the fall-back hour, a stale stamp is not read as a future one', () => {
  // 01:45 EDT (05:45 UTC): a 01:00 stamp is 01:00 EDT, 45 minutes old, not
  // 01:00 EST, 15 minutes ahead.
  const now = Date.UTC(2026, 10, 1, 5, 45);
  assert.equal(parseEasternTime('11/01/2026 01:00:00', { now }), Date.UTC(2026, 10, 1, 5, 0));
  // The current interval, stamped a few minutes ahead, stays the current one.
  assert.equal(parseEasternTime('11/01/2026 01:50:00', { now }), Date.UTC(2026, 10, 1, 5, 50));
});
