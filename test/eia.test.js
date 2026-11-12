// -----------------------------------------------------------------------------
// The EIA client against real answers recorded on 2026-11-12 at 13:22 UTC
// (ERCO, PJM, MISO and Avista, a small authority), and the integration with
// EIA grids end to end, against the fake Gladys.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EIA_PERIOD_MS, TICK_MS } from '../src/app.js';
import { EIA_DEMAND_MAX_AGE_MS } from '../src/devices.js';
import {
  eiaMix,
  eiaUrl,
  fetchEia,
  forecastAt,
  isKeyRefused,
  parseFuelData,
  parseRegionData,
  periodEnd,
} from '../src/eia.js';
import { EIA_REGION_CODES, EIA_REGIONS } from '../src/eia-regions.js';
import { hideKey } from '../src/http.js';
import {
  EIA_KEY,
  EIA_SHIFT_MS,
  createAll,
  createWorld,
  eiaAnswer,
  eiaId,
  fixture,
  json,
} from './helpers/world.js';

const FIXTURE_NOW = Date.UTC(2026, 10, 12, 13, 22);
const raw = (name) => JSON.parse(fixture(name)).response.data;
const REGION_ROWS = raw('eia-region-data.json');
const FUEL_ROWS = raw('eia-fuel-type-data.json');
const EIA_CONFIG = { language: 'fr', eia_api_key: EIA_KEY, eia_regions: ['ERCO', 'AVA'] };

test('an EIA period is the end of its UTC hour', () => {
  assert.equal(periodEnd('2026-11-12T12'), Date.UTC(2026, 10, 12, 12));
  assert.equal(periodEnd('2026-11-12'), null);
});

test('demand: the latest hour, the forecast of the hour in progress, the peak ahead', () => {
  const regions = parseRegionData(REGION_ROWS, FIXTURE_NOW);
  assert.deepEqual(Object.keys(regions).sort(), ['AVA', 'ERCO', 'MISO', 'PJM']);
  assert.deepEqual(regions.ERCO.demand, { at: '2026-11-12T12:00:00.000Z', mw: 44805 });
  assert.deepEqual(forecastAt(regions.ERCO.forecasts, FIXTURE_NOW), {
    forecast: { at: '2026-11-12T14:00:00.000Z', mw: 48556 },
    peak: { at: '2026-11-12T22:00:00.000Z', mw: 55564 },
  });
  // One hour later, the same read gives the next hour.
  const later = forecastAt(regions.ERCO.forecasts, FIXTURE_NOW + 3_600_000);
  assert.equal(later.forecast.at, '2026-11-12T15:00:00.000Z');
  // Avista publishes no forecast for today yet.
  assert.deepEqual(forecastAt(regions.AVA.forecasts, FIXTURE_NOW), { forecast: null, peak: null });
  assert.deepEqual(forecastAt(undefined, FIXTURE_NOW), { forecast: null, peak: null });
});

test('fuel mix: the latest complete hour, shares, low-carbon and CO₂', () => {
  const mix = parseFuelData(FUEL_ROWS, FIXTURE_NOW);
  // The EIA mix is hours late: 05:00 for ERCOT at 13:22.
  assert.equal(mix.ERCO.at, '2026-11-12T05:00:00.000Z');
  assert.equal(Math.round(mix.ERCO.sharesPercent.natural_gas), 70);
  assert.equal(Math.round(mix.ERCO.sharesPercent.coal), 16);
  assert.equal(Math.round(mix.ERCO.lowCarbonPercent), 14);
  assert.equal(Math.round(mix.ERCO.carbonIntensity), 476);
  // Battery discharge (499 MW that hour) is not generation.
  assert.equal(mix.ERCO.generationMw, 46355);
  assert.equal(Math.round(mix.PJM.sharesPercent.nuclear), 35);
  assert.equal(Math.round(mix.AVA.sharesPercent.hydro), 50);
  assert.equal(Math.round(mix.AVA.lowCarbonPercent), 66);
  for (const read of Object.values(mix)) {
    const sum = Object.values(read.sharesPercent).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 1e-9);
  }
});

test('an hour still missing a source is skipped; storage alone is no mix', () => {
  const rows = FUEL_ROWS.filter((row) => row.respondent === 'AVA');
  // The EIA fills 07:00 source by source: wind not there yet.
  const partial = rows.filter((row) => !(row.period === '2026-11-12T07' && row.fueltype === 'WND'));
  assert.equal(parseFuelData(partial, FIXTURE_NOW).AVA.at, '2026-11-12T06:00:00.000Z');
  assert.equal(eiaMix(0, [{ fuel: 'BAT', mw: 120 }]), null);
  // An unknown source counts as "other", 700 g/kWh.
  assert.equal(eiaMix(0, [{ fuel: 'XYZ', mw: 10 }]).carbonIntensity, 700);
});

test('one grouped request per dataset, every grid in it, paged past 5,000 rows', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    const query = new URL(url).searchParams;
    if (url.includes('/fuel-type-data/') && query.get('offset') === '0') {
      // A first page short of the total: a second page is asked.
      const data = FUEL_ROWS.slice(0, 40);
      return json(200, { response: { total: String(FUEL_ROWS.length), data } });
    }
    if (url.includes('/fuel-type-data/')) {
      assert.equal(query.get('offset'), '40');
      return json(200, {
        response: { total: String(FUEL_ROWS.length), data: FUEL_ROWS.slice(40) },
      });
    }
    return json(200, { response: { total: String(REGION_ROWS.length), data: REGION_ROWS } });
  };
  const read = await fetchEia(fetchImpl, {
    apiKey: EIA_KEY,
    regions: ['ERCO', 'PJM', 'MISO', 'AVA', 'TVA'],
    now: FIXTURE_NOW,
  });
  assert.equal(urls.length, 3);
  const query = new URL(urls[0]).searchParams;
  assert.deepEqual(query.getAll('facets[respondent][]'), ['ERCO', 'PJM', 'MISO', 'AVA', 'TVA']);
  assert.deepEqual(query.getAll('facets[type][]'), ['D', 'DF']);
  assert.equal(query.get('frequency'), 'hourly');
  assert.equal(query.get('start'), '2026-11-11T07');
  assert.equal(read.PJM.mix.at, '2026-11-12T04:00:00.000Z');
  // A grid without data: nothing, not an error.
  assert.deepEqual(read.TVA, { demand: null, forecasts: [], mix: null });
});

test('a refused key, an error object, a non-JSON answer', async () => {
  const refused = await fetchEia(
    async () => json(403, JSON.parse(fixture('eia-invalid-key.json'))),
    {
      apiKey: 'WRONG',
      regions: ['ERCO'],
      now: FIXTURE_NOW,
    },
  ).catch((err) => err);
  assert.ok(isKeyRefused(refused));
  assert.doesNotMatch(refused.message, /WRONG/);
  const errorObject = await fetchEia(
    async () => json(200, { error: { code: 'OVER_RATE_LIMIT' } }),
    { apiKey: 'K', regions: ['ERCO'], now: FIXTURE_NOW },
  ).catch((err) => err);
  assert.match(errorObject.message, /OVER_RATE_LIMIT/);
  const html = await fetchEia(async () => new Response('<html>'), {
    apiKey: 'K',
    regions: ['ERCO'],
    now: FIXTURE_NOW,
  }).catch((err) => err);
  assert.match(html.message, /not JSON/);
  assert.equal(hideKey('https://x/?api_key=SECRET&a=1'), 'https://x/?api_key=***&a=1');
  assert.match(eiaUrl('region-data', { apiKey: 'K', regions: [], start: 'x' }), /api_key=K/);
});

test('the list of grids: unique codes, the regions first, the big operators named', () => {
  assert.equal(new Set(EIA_REGION_CODES).size, EIA_REGION_CODES.length);
  assert.equal(EIA_REGION_CODES[0], 'US48');
  for (const code of ['ERCO', 'PJM', 'MISO', 'SWPP', 'CISO', 'ISNE', 'NYIS', 'TVA', 'SOCO']) {
    assert.ok(EIA_REGIONS[code], code);
  }
});

test('EIA devices: one per grid, only with a key', async (t) => {
  const world = await createWorld({ config: EIA_CONFIG });
  t.after(() => world.app.stop());
  const names = world.fake.discoveredDevices.map((d) => d.name);
  assert.deepEqual(names, ['Réseau électrique de New York', 'Avista (EIA)', 'ERCOT (Texas) (EIA)']);
  assert.match(world.fake.discoveredDevices[2].external_id, /:eia:ERCO$/);

  const without = await createWorld({ config: { ...EIA_CONFIG, eia_api_key: '' } });
  t.after(() => without.app.stop());
  assert.equal(without.fake.discoveredDevices.length, 1);
  assert.equal(without.nyiso.count('eia'), 0);
  assert.equal(without.fake.connectionStatus.connected, false);
  assert.match(without.fake.connectionStatus.message.fr, /sans clé/);
});

test('an added EIA device gets its figures at once, then one read an hour', async (t) => {
  const world = await createWorld({ config: EIA_CONFIG });
  t.after(() => world.app.stop());
  // The start reads once (two requests) to check the key.
  assert.equal(world.nyiso.count('eia'), 2);
  assert.equal(world.fake.connectionStatus.connected, true);
  await createAll(world);
  const ercot = eiaId(world.gladys, 'ERCO');
  const last = (key) => world.fake.lastState(ercot.feature(key));
  assert.equal(last('demand'), 44_805_000);
  assert.equal(last('demand_forecast'), 48_556_000);
  assert.equal(last('demand_forecast_peak'), 55_564_000);
  assert.equal(last('natural_gas_share'), 70);
  assert.equal(last('coal_share'), 16);
  assert.equal(last('low_carbon_share'), 14);
  assert.equal(last('carbon_intensity'), 476);
  // 12:00 and 05:00 UTC in the fixture, shifted, read in the time zone of the test.
  const hour = (h) =>
    new Date(Date.UTC(2026, 10, 12, h) + EIA_SHIFT_MS).toLocaleString('fr', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  assert.equal(last('data_time'), `Demande ${hour(12)} · mix ${hour(5)}`);
  assert.equal(world.fake.lastState(eiaId(world.gladys, 'AVA').feature('hydro_share')), 50);
  assert.equal(world.nyiso.count('eia'), 2, 'the data of the start is reused');

  world.clock.advance(TICK_MS);
  await world.app.tick();
  assert.equal(world.nyiso.count('eia'), 2);
  world.clock.advance(EIA_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.nyiso.count('eia'), 4);
});

test('no EIA device added: the EIA is read at the start only', async (t) => {
  const world = await createWorld({ config: EIA_CONFIG });
  t.after(() => world.app.stop());
  world.clock.advance(2 * EIA_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.nyiso.count('eia'), 2);
});

test('a demand too old is not published, a refused key says so without leaking it', async (t) => {
  const world = await createWorld({ config: EIA_CONFIG });
  t.after(() => world.app.stop());
  await createAll(world);
  const demand = eiaId(world.gladys, 'ERCO').feature('demand');
  const before = world.fake.states.filter((s) => s.device_feature_external_id === demand).length;
  world.nyiso.eia = () => json(403, JSON.parse(fixture('eia-invalid-key.json')));
  world.clock.advance(EIA_DEMAND_MAX_AGE_MS);
  await world.app.tick();
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /refuses the API key/);
  assert.equal(
    world.fake.states.filter((s) => s.device_feature_external_id === demand).length,
    before,
  );
  assert.ok(!JSON.stringify(world.fake.connectionStatus).includes(EIA_KEY));
  // Back to normal.
  world.nyiso.eia = (url) => eiaAnswer(url);
  world.clock.advance(EIA_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('the test action reports the EIA too', async (t) => {
  const world = await createWorld({
    config: { ...EIA_CONFIG, language: 'en', zones: ['61761'] },
  });
  t.after(() => world.app.stop());
  const answer = await world.fake.action('test_connection', {});
  assert.match(answer.data.message, /EIA answers: 2 grid\(s\) read\.$/);
});

test('a source reported by day only does not hold the mix back to the evening before', () => {
  const row = (hour, fuel, value) => ({
    period: `2026-11-12T${String(hour).padStart(2, '0')}`,
    respondent: 'XX',
    fueltype: fuel,
    value: String(value),
  });
  // Solar reported until 00:00 UTC (evening in the US), then only gas and wind.
  const rows = [
    row(0, 'NG', 100),
    row(0, 'WND', 50),
    row(0, 'SUN', 10),
    ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((hour) => [row(hour, 'NG', 100), row(hour, 'WND', 50)]),
    // 09:00 being filled: gas only so far.
    row(9, 'NG', 100),
  ];
  const mix = parseFuelData(rows, Date.UTC(2026, 10, 12, 10)).XX;
  assert.equal(mix.at, '2026-11-12T08:00:00.000Z');
});

test('the forecast at a full hour is the one of the hour starting', () => {
  const forecasts = [
    { at: '2026-11-12T12:00:00.000Z', mw: 1 },
    { at: '2026-11-12T13:00:00.000Z', mw: 2 },
  ];
  assert.equal(forecastAt(forecasts, Date.UTC(2026, 10, 12, 12)).forecast.mw, 2);
});

test('removing the EIA grids clears an EIA failure; saving again does not read again', async (t) => {
  const world = await createWorld({ config: EIA_CONFIG });
  t.after(() => world.app.stop());
  assert.equal(world.nyiso.count('eia'), 2);
  // The same configuration saved again a minute later: no new read.
  world.clock.advance(TICK_MS);
  await world.fake.configUpdated(EIA_CONFIG);
  assert.equal(world.nyiso.count('eia'), 2);
  // Another grid: read at once.
  await world.fake.configUpdated({ ...EIA_CONFIG, eia_regions: ['ERCO', 'PJM'] });
  assert.equal(world.nyiso.count('eia'), 4);
  // The EIA refuses, then the grids are removed: the status comes back.
  world.nyiso.eia = () => json(429, { error: { code: 'OVER_RATE_LIMIT' } });
  await world.fake.configUpdated({ ...EIA_CONFIG, eia_regions: ['MISO'] });
  assert.equal(world.fake.connectionStatus.connected, false);
  await world.fake.configUpdated({ ...EIA_CONFIG, eia_regions: [] });
  assert.equal(world.fake.connectionStatus.connected, true);
});
