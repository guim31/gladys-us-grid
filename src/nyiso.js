// -----------------------------------------------------------------------------
// The NYISO public files (https://mis.nyiso.com/public/), CSV without a key:
//
//   - realtime/realtime_zone_lbmp.csv  the real-time price (LBMP, $/MWh) of
//     every zone for the current five-minute interval, under 1 KB;
//   - csv/rtfuelmix/YYYYMMDDrtfuelmix.csv  the generation by fuel category,
//     every five minutes, of one day;
//   - csv/pal/YYYYMMDDpal.csv  the actual load of every zone, every five
//     minutes, of one day.
//
// Time: every time stamp is the wall clock of New York. The daily files say
// EST or EDT on each row (the fall-back hour shows twice, once each); the
// current price file does not, so its time is read as the instant nearest to
// now among the valid readings. The daily file is named after the date in New
// York: just after midnight, before the new file has a complete interval, the
// file of the day before is read.
// -----------------------------------------------------------------------------

import { requestText } from './http.js';
import { ZONES } from './zones.js';

export const BASE_URL = 'https://mis.nyiso.com/public';
export const PRICE_URL = `${BASE_URL}/realtime/realtime_zone_lbmp.csv`;
export const fuelMixUrl = (day) => `${BASE_URL}/csv/rtfuelmix/${day}rtfuelmix.csv`;
export const loadUrl = (day) => `${BASE_URL}/csv/pal/${day}pal.csv`;

const TIME_ZONE = 'America/New_York';
const OFFSETS_MS = { EST: -5 * 3_600_000, EDT: -4 * 3_600_000 };
/** A row stamped later than this after now is a forecast, not a reading. */
const FUTURE_TOLERANCE_MS = 2 * 60 * 1000;

/**
 * NYISO fuel category → key, with the lifecycle emission factor used for the
 * estimated carbon intensity (g CO₂eq/kWh, IPCC AR5 2014 medians, the defaults
 * of Electricity Maps) and its class. "Dual Fuel" units burn gas or oil, gas
 * almost always: counted as gas. "Other Renewables" is mostly biomass, refuse
 * and landfill gas, and some solar: counted as biomass.
 */
export const FUELS = {
  'Dual Fuel': { key: 'dual_fuel', factor: 490, renewable: false, lowCarbon: false },
  'Natural Gas': { key: 'natural_gas', factor: 490, renewable: false, lowCarbon: false },
  Nuclear: { key: 'nuclear', factor: 12, renewable: false, lowCarbon: true },
  'Other Fossil Fuels': { key: 'other_fossil', factor: 650, renewable: false, lowCarbon: false },
  'Other Renewables': { key: 'other_renewables', factor: 230, renewable: true, lowCarbon: true },
  Wind: { key: 'wind', factor: 11, renewable: true, lowCarbon: true },
  Hydro: { key: 'hydro', factor: 24, renewable: true, lowCarbon: true },
};
export const FUEL_KEYS = Object.values(FUELS).map((fuel) => fuel.key);
/** A category NYISO might add one day: counted as unknown (Electricity Maps' default). */
const UNKNOWN_FACTOR = 700;

/** One CSV line → its fields (quotes removed; NYISO never quotes a comma). */
export function parseCsvLine(line) {
  return line.split(',').map((field) => field.trim().replace(/^"(.*)"$/, '$1'));
}

function parseCsv(text) {
  return String(text)
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim() !== '')
    .map(parseCsvLine);
}

/** The offset of New York at an instant, in ms (−5 h or −4 h). */
export function newYorkOffset(at) {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(new Date(at))
    .find((part) => part.type === 'timeZoneName').value;
  const match = name.match(/GMT([+-]\d+)(?::(\d+))?/);
  return match ? Number(match[1]) * 3_600_000 : 0;
}

/**
 * "11/07/2026 18:25:00" (New York wall clock) → epoch ms.
 * @param {string} stamp
 * @param {object} [options]
 * @param {string} [options.zone] "EST" or "EDT" when the file says it
 * @param {number} [options.now] without a zone: the valid reading nearest to now
 * @returns {number | null}
 */
export function parseEasternTime(stamp, { zone, now } = {}) {
  const match = String(stamp).match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }
  const [, month, day, year, hour, minute, second = '0'] = match.map((part) => part ?? '0');
  const wall = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  if (OFFSETS_MS[zone] !== undefined) {
    return wall - OFFSETS_MS[zone];
  }
  // Both readings, kept when New York really had that offset at that instant.
  const candidates = Object.values(OFFSETS_MS)
    .map((offset) => wall - offset)
    .filter((at) => newYorkOffset(at) === wall - at);
  if (candidates.length === 0) {
    // The spring-forward gap: no such wall time, read it as standard time.
    return wall - OFFSETS_MS.EST;
  }
  const reference = now ?? candidates[0];
  candidates.sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference));
  return candidates[0];
}

/** The date in New York, "YYYYMMDD", `daysBack` days before the instant. */
export function newYorkDay(at, daysBack = 0) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(at))
      .map((part) => [part.type, part.value]),
  );
  const date = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day - daysBack));
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

/**
 * The current price file → `{ at, prices: { ptid: $/MWh } }` (load zones only).
 * @param {string} text
 * @param {number} now
 */
export function parsePrices(text, now) {
  const prices = {};
  let at = null;
  for (const [stamp, , ptid, lbmp] of parseCsv(text)) {
    const value = Number(lbmp);
    if (!ZONES[ptid] || lbmp === '' || !Number.isFinite(value)) {
      continue;
    }
    prices[ptid] = value;
    at = Math.max(at ?? -Infinity, parseEasternTime(stamp, { now }) ?? -Infinity);
  }
  if (Object.keys(prices).length === 0 || !Number.isFinite(at)) {
    throw new Error('NYISO price file without any load zone');
  }
  return { at: new Date(at).toISOString(), prices };
}

/**
 * Rows grouped by instant, the latest complete group not in the future.
 * @param {Array<{ at: number }>} rows
 * @param {(group: object[]) => boolean} complete
 * @param {number} now
 */
function latestGroup(rows, complete, now) {
  const groups = new Map();
  for (const row of rows) {
    if (row.at !== null && row.at <= now + FUTURE_TOLERANCE_MS) {
      groups.set(row.at, [...(groups.get(row.at) ?? []), row]);
    }
  }
  const instants = [...groups.keys()].sort((a, b) => b - a);
  const at = instants.find((instant) => complete(groups.get(instant)));
  return at === undefined ? null : { at, rows: groups.get(at) };
}

/**
 * A fuel mix file → the latest complete interval, with its shares and the
 * estimated carbon intensity; null when the file has none yet.
 * @param {string} text
 * @param {number} now
 */
export function parseFuelMix(text, now) {
  const rows = parseCsv(text)
    .map(([stamp, zone, fuel, mw]) => ({
      at: parseEasternTime(stamp, { zone }),
      fuel,
      mw: Number(mw),
    }))
    .filter((row) => row.fuel && Number.isFinite(row.mw));
  const categories = new Set(rows.map((row) => row.fuel));
  const group = latestGroup(
    rows,
    (list) => new Set(list.map((row) => row.fuel)).size === categories.size,
    now,
  );
  return group ? mixOf(group.at, group.rows) : null;
}

/** The figures of one interval. Negative outputs (storage charging) count as zero. */
export function mixOf(at, rows) {
  const generationMw = {};
  let total = 0;
  let renewable = 0;
  let lowCarbon = 0;
  let emissions = 0;
  for (const row of rows) {
    const mw = Math.max(0, row.mw);
    const known = FUELS[row.fuel];
    const key = known?.key ?? 'other';
    generationMw[key] = (generationMw[key] ?? 0) + mw;
    total += mw;
    renewable += known?.renewable ? mw : 0;
    lowCarbon += known?.lowCarbon ? mw : 0;
    emissions += mw * (known?.factor ?? UNKNOWN_FACTOR);
  }
  if (total <= 0) {
    return null;
  }
  const sharesPercent = Object.fromEntries(
    FUEL_KEYS.map((key) => [key, ((generationMw[key] ?? 0) / total) * 100]),
  );
  return {
    at: new Date(at).toISOString(),
    generationMw: total,
    sharesPercent,
    renewablePercent: (renewable / total) * 100,
    lowCarbonPercent: (lowCarbon / total) * 100,
    carbonIntensity: emissions / total,
  };
}

/**
 * A load file → the latest interval with every zone: `{ at, totalMw, zonesMw }`.
 * @param {string} text
 * @param {number} now
 */
export function parseLoad(text, now) {
  const rows = parseCsv(text)
    .map(([stamp, zone, , ptid, load]) => ({
      at: parseEasternTime(stamp, { zone }),
      ptid,
      mw: load === '' ? NaN : Number(load),
    }))
    .filter((row) => ZONES[row.ptid] && Number.isFinite(row.mw));
  const zoneCount = Object.keys(ZONES).length;
  const group = latestGroup(
    rows,
    (list) => new Set(list.map((row) => row.ptid)).size === zoneCount,
    now,
  );
  if (!group) {
    return null;
  }
  const zonesMw = Object.fromEntries(group.rows.map((row) => [row.ptid, row.mw]));
  return {
    at: new Date(group.at).toISOString(),
    totalMw: Object.values(zonesMw).reduce((sum, mw) => sum + mw, 0),
    zonesMw,
  };
}

/** Read the current prices. */
export async function fetchPrices(fetchImpl, now) {
  return parsePrices(await requestText(fetchImpl, PRICE_URL, 'NYISO prices'), now);
}

/**
 * Read a daily file, today's in New York, or yesterday's when today's has no
 * complete interval yet (just after midnight).
 */
async function fetchDaily(fetchImpl, now, urlOf, parse, what) {
  let firstError = null;
  for (const daysBack of [0, 1]) {
    try {
      const parsed = parse(
        await requestText(fetchImpl, urlOf(newYorkDay(now, daysBack)), what),
        now,
      );
      if (parsed) {
        return parsed;
      }
    } catch (err) {
      // A 404 of today's file just after midnight: yesterday's is tried.
      firstError ??= err;
    }
  }
  throw firstError ?? new Error(`${what}: no complete interval`);
}

export const fetchFuelMix = (fetchImpl, now) =>
  fetchDaily(fetchImpl, now, fuelMixUrl, parseFuelMix, 'NYISO fuel mix');
export const fetchLoad = (fetchImpl, now) =>
  fetchDaily(fetchImpl, now, loadUrl, parseLoad, 'NYISO load');
