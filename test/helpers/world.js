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
import { gridIds, zoneIds } from '../../src/devices.js';

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
    /** @type {typeof fetch} */
    fetch: async (url, init = {}) => {
      const request = { url: String(url), headers: init.headers ?? {} };
      nyiso.calls.push(request);
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
        kind === 'prices'
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
