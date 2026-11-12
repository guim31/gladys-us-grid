// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake NYISO (the three public
// files, real answers recorded on 2026-11-07, behind one fake `fetch`), a
// temporary /data and a manual clock, with the integration wired on top
// through registerHandlers. No timer runs unless `timers: true` (with
// node:test mock timers): the tests call `app.tick()`. No test touches the
// network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { PRICE_URL, fuelMixUrl, loadUrl } from '../../src/nyiso.js';
import { eiaIds, gridIds, zoneIds } from '../../src/devices.js';
import { EIA_URL } from '../../src/eia.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const fixture = (name) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

/** Real NYISO answers of 2026-11-07, evening in New York (EST). */
export const PRICES_CSV = fixture('nyiso-realtime-zone-lbmp.csv');
export const MIX_CSV = fixture('nyiso-rtfuelmix.csv');
export const LOAD_CSV = fixture('nyiso-pal.csv');
export const DAY = '20261107';

/** 2026-11-07 18:28 in New York (UTC−5): three minutes after the price interval. */
export const START = Date.UTC(2026, 10, 7, 23, 28, 0);
export const PRICES_AT = '2026-11-07T23:25:00.000Z';
export const NYC = '61761';
export const LONG_ISLAND = '61762';

/**
 * Real EIA answers of 2026-11-12 13:22 UTC (ERCO, PJM, MISO, AVA), moved to
 * the clock of the NYISO files: every period shifted by a whole number of
 * hours, so the fixtures stay consistent with START (13:22 → 23:22 UTC).
 */
export const EIA_SHIFT_MS = Date.UTC(2026, 10, 7, 23) - Date.UTC(2026, 10, 12, 13);
const shiftPeriod = (period) =>
  new Date(Date.parse(`${period}:00:00Z`) + EIA_SHIFT_MS).toISOString().slice(0, 13);
export const eiaFixture = (name) => {
  const body = JSON.parse(fixture(name));
  for (const row of body.response.data) {
    row.period = shiftPeriod(row.period);
  }
  return body;
};
export const EIA_REGION_JSON = eiaFixture('eia-region-data.json');
export const EIA_FUEL_JSON = eiaFixture('eia-fuel-type-data.json');
export const EIA_KEY = 'TEST-KEY-0123456789';

export const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** The answer of the fake EIA to a URL: the rows of the respondents asked, one page. */
export function eiaAnswer(url) {
  const query = new URL(url).searchParams;
  if (query.get('api_key') !== EIA_KEY) {
    return json(403, JSON.parse(fixture('eia-invalid-key.json')));
  }
  const regions = query.getAll('facets[respondent][]');
  const source = url.includes('/region-data/') ? EIA_REGION_JSON : EIA_FUEL_JSON;
  const data = source.response.data.filter((row) => regions.includes(row.respondent));
  return json(200, { response: { total: String(data.length), data } });
}

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const csv = (status, body) =>
  new Response(body, { status, headers: { 'content-type': 'text/csv' } });

/** Change the NYC price of the price file (the other zones keep theirs). */
export function withPrice(price, ptid = NYC, stamp = null) {
  return PRICES_CSV.split('\n')
    .map((line) => {
      const fields = line.split(',');
      if (stamp && line.startsWith('"11/')) {
        fields[0] = `"${stamp}"`;
      }
      if (fields[2] === ptid) {
        fields[3] = String(price);
      }
      return fields.join(',');
    })
    .join('\n');
}

/**
 * A fake NYISO. Its answers can be changed between two calls; every call is
 * recorded (url, headers).
 */
export function createFakeNyiso() {
  const nyiso = {
    calls: [],
    prices: () => csv(200, PRICES_CSV),
    mix: (day) => (day === DAY ? csv(200, MIX_CSV) : csv(404, 'Not Found')),
    load: (day) => (day === DAY ? csv(200, LOAD_CSV) : csv(404, 'Not Found')),
    eia: (url) => eiaAnswer(url),
    /** @type {typeof fetch} */
    fetch: async (url, init = {}) => {
      const request = { url: String(url), headers: init.headers ?? {} };
      nyiso.calls.push(request);
      if (request.url.startsWith(EIA_URL)) {
        return nyiso.eia(request.url);
      }
      if (request.url === PRICE_URL) {
        return nyiso.prices();
      }
      const day = request.url.match(/(\d{8})(rtfuelmix|pal)\.csv$/);
      if (day && request.url === fuelMixUrl(day[1])) {
        return nyiso.mix(day[1]);
      }
      if (day && request.url === loadUrl(day[1])) {
        return nyiso.load(day[1]);
      }
      throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
    },
    count: (kind) =>
      nyiso.calls.filter((c) =>
        kind === 'eia'
          ? c.url.startsWith(EIA_URL)
          : kind === 'prices'
            ? c.url === PRICE_URL
            : c.url.includes(kind === 'mix' ? 'rtfuelmix' : 'pal'),
      ).length,
  };
  return nyiso;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 */
export async function createWorld({
  clock = createClock(),
  nyiso = createFakeNyiso(),
  config = { language: 'fr', zones: [NYC] },
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-us-grid-')),
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: nyiso.fetch,
    store: new Store(dataDir),
    now: clock.now,
    timers,
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, fake: gladys.fake, nyiso, app, clock, dataDir };
}

export const gridId = (gladys) => gridIds(gladys);
export const zoneId = (gladys, ptid) => zoneIds(gladys, ptid);
export const eiaId = (gladys, code) => eiaIds(gladys, code);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

/** The discovered devices of a configuration. */
export async function discoveredDevices(config) {
  const world = await createWorld({ config, connect: true });
  const devices = world.fake.discoveredDevices;
  await world.app.stop();
  return devices;
}
