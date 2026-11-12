// -----------------------------------------------------------------------------
// The EIA open data API v2 (https://www.eia.gov/opendata/), Form EIA-930
// "Hourly Electric Grid Monitor": every US balancing authority, hourly, with a
// free key (api.eia.gov, by e-mail).
//
//   - /electricity/rto/region-data      demand (type D) and day-ahead demand
//     forecast (type DF), MWh per hour = average MW;
//   - /electricity/rto/fuel-type-data   net generation by energy source.
//
// One grouped request per dataset covers every grid followed (paged past 5,000
// rows, the API's limit). Periods are UTC hours, stamped with the END of the
// hour ("2026-11-12T12" is 11:00 to 12:00 UTC). The EIA publishes demand about
// an hour late and the fuel mix several hours late (4 to 8 h seen on
// 2026-11-12); some small authorities lag more. No price: the EIA has none
// hourly.
// -----------------------------------------------------------------------------

import { HttpError, requestText } from './http.js';

export const EIA_URL = 'https://api.eia.gov/v2/electricity/rto';
const PAGE_ROWS = 5000;
const MAX_PAGES = 10;
const HOUR_MS = 3_600_000;
/** How far back the requests go: demand ~1 h late, the mix up to a day for small authorities. */
const DEMAND_WINDOW_MS = 30 * HOUR_MS;
const MIX_WINDOW_MS = 24 * HOUR_MS;
/** The peak forecast looks this far ahead. */
const PEAK_AHEAD_MS = 24 * HOUR_MS;

/**
 * EIA energy source → share key, lifecycle emission factor (g CO₂eq/kWh, IPCC
 * AR5 2014 medians, the defaults of Electricity Maps, as for NYISO) and class.
 * "OTH" mixes biomass, waste and the rest: counted as unknown (700, the
 * Electricity Maps default), like any code the EIA might add.
 */
export const EIA_FUELS = {
  NG: { key: 'natural_gas', factor: 490, renewable: false, lowCarbon: false },
  COL: { key: 'coal', factor: 820, renewable: false, lowCarbon: false },
  NUC: { key: 'nuclear', factor: 12, renewable: false, lowCarbon: true },
  WND: { key: 'wind', factor: 11, renewable: true, lowCarbon: true },
  SUN: { key: 'solar', factor: 45, renewable: true, lowCarbon: true },
  SNB: { key: 'solar', factor: 45, renewable: true, lowCarbon: true },
  WNB: { key: 'wind', factor: 11, renewable: true, lowCarbon: true },
  WAT: { key: 'hydro', factor: 24, renewable: true, lowCarbon: true },
  GEO: { key: 'other', factor: 38, renewable: true, lowCarbon: true },
  OIL: { key: 'other', factor: 650, renewable: false, lowCarbon: false },
};
const UNKNOWN_FUEL = { key: 'other', factor: 700, renewable: false, lowCarbon: false };
/**
 * Storage moves energy, it does not produce it (and charges at negative
 * output): left out of the mix, as Electricity Maps would without knowing
 * what charged it.
 */
const STORAGE = new Set(['BAT', 'PS', 'UES']);

export const EIA_FUEL_KEYS = ['natural_gas', 'coal', 'nuclear', 'wind', 'solar', 'hydro', 'other'];

/** An instant → the EIA hour "YYYY-MM-DDTHH" (UTC) that contains it. */
export const eiaHour = (at) => new Date(at).toISOString().slice(0, 13);

/** "2026-11-12T12" → epoch ms of the end of that hour; null if malformed. */
export function periodEnd(period) {
  const match = String(period).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/);
  return match ? Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4]) : null;
}

/**
 * The URL of one page. The key goes in the query string, as the API wants:
 * never log a URL.
 */
export function eiaUrl(dataset, { apiKey, regions, start, types = [], offset = 0 }) {
  const params = new URLSearchParams({
    api_key: apiKey,
    frequency: 'hourly',
    'data[0]': 'value',
    start,
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    offset: String(offset),
    length: String(PAGE_ROWS),
  });
  for (const code of regions) {
    params.append('facets[respondent][]', code);
  }
  for (const type of types) {
    params.append('facets[type][]', type);
  }
  return `${EIA_URL}/${dataset}/data/?${params}`;
}

/** Every row of a query, page after page. */
async function fetchRows(fetchImpl, dataset, query) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = eiaUrl(dataset, { ...query, offset: rows.length });
    let body;
    try {
      body = JSON.parse(await requestText(fetchImpl, url, 'EIA', 'application/json'));
    } catch (err) {
      if (err instanceof HttpError) {
        throw err;
      }
      throw new HttpError('EIA answered something that is not JSON');
    }
    if (body?.error) {
      // Some refusals come with HTTP 200 and an error object.
      throw new HttpError(`EIA refused the request (${body.error.code ?? 'error'})`);
    }
    const data = body?.response?.data;
    if (!Array.isArray(data)) {
      throw new HttpError('EIA answered without data');
    }
    rows.push(...data);
    const total = Number(body.response.total);
    if (data.length === 0 || !(rows.length < total)) {
      break;
    }
  }
  return rows;
}

const numberOf = (value) =>
  value === null || value === undefined || value === '' ? NaN : Number(value);

/** Rows by respondent. */
function byRegion(rows) {
  const groups = new Map();
  for (const row of rows) {
    groups.set(row.respondent, [...(groups.get(row.respondent) ?? []), row]);
  }
  return groups;
}

/**
 * region-data rows → per region `{ demand, forecasts }`: the latest demand
 * `{ at, mw }` (or null), and the day-ahead forecasts, oldest first.
 * @param {object[]} rows
 * @param {number} now
 */
export function parseRegionData(rows, now) {
  const result = {};
  for (const [code, list] of byRegion(rows)) {
    const points = list
      .map((row) => ({ type: row.type, at: periodEnd(row.period), mw: numberOf(row.value) }))
      .filter((point) => point.at !== null && Number.isFinite(point.mw));
    const demand = points
      .filter((point) => point.type === 'D' && point.at <= now)
      .sort((a, b) => b.at - a.at)[0];
    const forecasts = points
      .filter((point) => point.type === 'DF')
      .sort((a, b) => a.at - b.at)
      .map((point) => ({ at: new Date(point.at).toISOString(), mw: point.mw }));
    result[code] = {
      demand: demand ? { at: new Date(demand.at).toISOString(), mw: demand.mw } : null,
      forecasts,
    };
  }
  return result;
}

/**
 * At an instant, from the forecasts read: the forecast of the hour in progress
 * and the highest of the next 24 hours, each `{ at, mw }` or null. Worked out
 * at each publication: an hourly read stays right all hour long.
 * @param {Array<{ at: string, mw: number }>} forecasts
 * @param {number} now
 */
export function forecastAt(forecasts = [], now) {
  // The hour in progress ends at the next full hour (at 12:00 sharp, 13:00).
  const hourEnd = Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS;
  const ahead = forecasts.filter((point) => {
    const at = Date.parse(point.at);
    return at >= hourEnd && at <= now + PEAK_AHEAD_MS;
  });
  return {
    forecast: forecasts.find((point) => Date.parse(point.at) === hourEnd) ?? null,
    peak: ahead.reduce((best, point) => (!best || point.mw > best.mw ? point : best), null),
  };
}

/**
 * fuel-type-data rows → per region the mix of its latest complete hour. The
 * EIA fills an hour source by source: an hour is complete when it has as many
 * sources as the hours just before it (the median of the six previous), not
 * as the most complete hour of the window (a source reported only by day,
 * solar, would hold the mix back to the evening before).
 * @param {object[]} rows
 * @param {number} now
 */
export function parseFuelData(rows, now) {
  const result = {};
  for (const [code, list] of byRegion(rows)) {
    const hours = new Map();
    for (const row of list) {
      const at = periodEnd(row.period);
      const mw = numberOf(row.value);
      if (at === null || at > now || !row.fueltype || !Number.isFinite(mw)) {
        continue;
      }
      hours.set(at, [...(hours.get(at) ?? []), { fuel: row.fueltype, mw }]);
    }
    const instants = [...hours.keys()].sort((a, b) => b - a);
    const at = instants.find((instant, index) => {
      const before = instants
        .slice(index + 1, index + 7)
        .map((previous) => hours.get(previous).length)
        .sort((a, b) => a - b);
      const usual = before.length > 0 ? before[Math.floor(before.length / 2)] : 0;
      return hours.get(instant).length >= usual;
    });
    const mix = at === undefined ? null : eiaMix(at, hours.get(at));
    if (mix) {
      result[code] = mix;
    }
  }
  return result;
}

/** The figures of one hour; null when nothing was generated (or only storage). */
export function eiaMix(at, rows) {
  const generationMw = {};
  let total = 0;
  let renewable = 0;
  let lowCarbon = 0;
  let emissions = 0;
  for (const { fuel, mw: raw } of rows) {
    if (STORAGE.has(fuel)) {
      continue;
    }
    // A plant's own use can make its net output slightly negative.
    const mw = Math.max(0, raw);
    const known = EIA_FUELS[fuel] ?? UNKNOWN_FUEL;
    generationMw[known.key] = (generationMw[known.key] ?? 0) + mw;
    total += mw;
    renewable += known.renewable ? mw : 0;
    lowCarbon += known.lowCarbon ? mw : 0;
    emissions += mw * known.factor;
  }
  if (total <= 0) {
    return null;
  }
  return {
    at: new Date(at).toISOString(),
    generationMw: total,
    sharesPercent: Object.fromEntries(
      EIA_FUEL_KEYS.map((key) => [key, ((generationMw[key] ?? 0) / total) * 100]),
    ),
    renewablePercent: (renewable / total) * 100,
    lowCarbonPercent: (lowCarbon / total) * 100,
    carbonIntensity: emissions / total,
  };
}

/**
 * Read the grids: two grouped requests, demand and mix.
 * @param {typeof fetch} fetchImpl
 * @param {{ apiKey: string, regions: string[], now: number }} query
 * @returns {Promise<Record<string, { demand, forecasts, mix }>>}
 */
export async function fetchEia(fetchImpl, { apiKey, regions, now }) {
  const [regionRows, fuelRows] = await Promise.all([
    fetchRows(fetchImpl, 'region-data', {
      apiKey,
      regions,
      types: ['D', 'DF'],
      start: eiaHour(now - DEMAND_WINDOW_MS),
    }),
    fetchRows(fetchImpl, 'fuel-type-data', {
      apiKey,
      regions,
      start: eiaHour(now - MIX_WINDOW_MS),
    }),
  ]);
  const demand = parseRegionData(regionRows, now);
  const mix = parseFuelData(fuelRows, now);
  return Object.fromEntries(
    regions.map((code) => [
      code,
      {
        demand: demand[code]?.demand ?? null,
        forecasts: demand[code]?.forecasts ?? [],
        mix: mix[code] ?? null,
      },
    ]),
  );
}

/** The EIA refused the key (wrong, revoked) rather than failed. */
export const isKeyRefused = (err) => err?.status === 401 || err?.status === 403;
