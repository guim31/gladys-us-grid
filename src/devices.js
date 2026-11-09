// -----------------------------------------------------------------------------
// The devices and their states.
//
//   - "New York power grid" (always offered), the whole NYISO control area:
//       energy-sensor/power                   the load of New York, kW (Gladys
//                                             has no MW unit)
//       grid-carbon-sensor/carbon-intensity  estimated from the fuel mix
//       grid-carbon-sensor/…-percentage       the low-carbon and renewable shares
//       counter-sensor/integer + percent      the share of each NYISO fuel
//                                             category (Gladys has no generic
//                                             percentage sensor)
//       text/text                             a one-sentence summary
//   - one "NYISO <zone>" per price zone chosen:
//       currency/decimal + dollar             the real-time price, $/MWh
//       energy-sensor/power                   the load of the zone, kW
//
// Shares are of the generation inside New York: imports are not in the NYISO
// fuel mix. Ids are built from fixed platform ids ("nyiso", "nyiso-<PTID>"):
// they must never change.
//
// Both devices declare a one-minute poll (the core's onPoll is a fallback of
// the container's own timer, src/app.js): NYISO publishes every five minutes.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { FUEL_KEYS } from './nyiso.js';
import { MESSAGES, NAMES } from './i18n.js';
import { ZONES, zoneLabel } from './zones.js';

export const GRID = 'grid';
export const ZONE = 'zone';
const GRID_PLATFORM_ID = 'nyiso';

/** Feature keys: frozen once published (Gladys keys history and scenes on them). */
export const GRID_FEATURES = [
  'consumption',
  'carbon_intensity',
  'low_carbon_share',
  'renewable_share',
  ...FUEL_KEYS.map((key) => `${key}_share`),
  'summary',
];
export const ZONE_FEATURES = ['price', 'zone_load'];

/** A price older than this is not published: better no value than a stale one. */
export const PRICE_MAX_AGE_MS = 30 * 60 * 1000;
/** Same for the fuel mix and the load. */
export const MIX_MAX_AGE_MS = 60 * 60 * 1000;

/** New York's record load is about 34 GW: display bound, in kW. */
const LOAD_MAX_KW = 50_000_000;
/** New York City alone peaks near 12 GW. */
const ZONE_LOAD_MAX_KW = 20_000_000;
/** The NYISO offer cap is $1,000/MWh; prices go negative too: symmetric bounds. */
const PRICE_BOUND = 1000;

export const gridIds = (gladys) => gladys.externalIds(GRID, GRID_PLATFORM_ID);
export const zoneIds = (gladys, ptid) => gladys.externalIds(ZONE, `nyiso-${ptid}`);

const base = { read_only: true, has_feedback: false, keep_history: true };

function feature(ids, key, name, definition) {
  return { ...base, ...definition, name, external_id: ids.feature(key) };
}

/**
 * The discovery payload: the grid always, a device per zone chosen.
 * @param {object} gladys
 * @param {ReturnType<import('./config.js').normalizeConfig>} config
 */
export function buildDevices(gladys, config) {
  const names = NAMES[config.language] ?? NAMES.fr;
  return [
    buildGridDevice(gladys, names),
    ...config.zones.map((ptid) => buildZoneDevice(gladys, names, ptid)),
  ];
}

function buildGridDevice(gladys, names) {
  const ids = gridIds(gladys);
  const percent = (key, category, type) =>
    feature(ids, key, names[key], {
      category,
      type,
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      min: 0,
      max: 100,
    });
  return {
    name: names.grid,
    external_id: ids.device,
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: [
      feature(ids, 'consumption', names.consumption, {
        category: DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR,
        type: DEVICE_FEATURE_TYPES.ENERGY_SENSOR.POWER,
        unit: DEVICE_FEATURE_UNITS.KILOWATT,
        min: 0,
        max: LOAD_MAX_KW,
      }),
      feature(ids, 'carbon_intensity', names.carbon_intensity, {
        category: DEVICE_FEATURE_CATEGORIES.GRID_CARBON_SENSOR,
        type: DEVICE_FEATURE_TYPES.GRID_CARBON_SENSOR.CARBON_INTENSITY,
        unit: DEVICE_FEATURE_UNITS.GRAM_CO2_EQ_PER_KILOWATT_HOUR,
        min: 0,
        max: 1000,
      }),
      percent(
        'low_carbon_share',
        DEVICE_FEATURE_CATEGORIES.GRID_CARBON_SENSOR,
        DEVICE_FEATURE_TYPES.GRID_CARBON_SENSOR.CARBON_FREE_PERCENTAGE,
      ),
      percent(
        'renewable_share',
        DEVICE_FEATURE_CATEGORIES.GRID_CARBON_SENSOR,
        DEVICE_FEATURE_TYPES.GRID_CARBON_SENSOR.RENEWABLE_PERCENTAGE,
      ),
      ...FUEL_KEYS.map((key) =>
        percent(
          `${key}_share`,
          DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
          DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        ),
      ),
      // A sentence: no history (it changes every five minutes).
      feature(ids, 'summary', names.summary, {
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        keep_history: false,
        min: 0,
        max: 0,
      }),
    ],
  };
}

function buildZoneDevice(gladys, names, ptid) {
  const ids = zoneIds(gladys, ptid);
  return {
    name: `NYISO ${zoneLabel(ptid)}`,
    external_id: ids.device,
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: [
      feature(ids, 'price', names.price, {
        category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
        type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.DOLLAR,
        min: -PRICE_BOUND,
        max: PRICE_BOUND,
      }),
      feature(ids, 'zone_load', names.zone_load, {
        category: DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR,
        type: DEVICE_FEATURE_TYPES.ENERGY_SENSOR.POWER,
        unit: DEVICE_FEATURE_UNITS.KILOWATT,
        min: 0,
        max: ZONE_LOAD_MAX_KW,
      }),
    ],
  };
}

/** The data if fresh enough, else null. */
export const fresh = (data, maxAge, now) =>
  data && now - Date.parse(data.at) <= maxAge ? data : null;

/**
 * The states of the grid device; a figure whose source is stale is left out.
 * @param {object} gladys
 * @param {object} data `{ mix, load, prices }` as read
 * @param {ReturnType<import('./config.js').normalizeConfig>} config
 * @param {number} now
 */
export function gridStates(gladys, { mix, load, prices }, config, now) {
  const ids = gridIds(gladys);
  const state = (key, value) => ({ device_feature_external_id: ids.feature(key), state: value });
  const states = [];
  const freshMix = fresh(mix, MIX_MAX_AGE_MS, now);
  const freshLoad = fresh(load, MIX_MAX_AGE_MS, now);
  if (freshLoad) {
    states.push(state('consumption', Math.round(freshLoad.totalMw * 1000)));
  }
  if (freshMix) {
    states.push(
      state('carbon_intensity', Math.round(freshMix.carbonIntensity)),
      state('low_carbon_share', Math.round(freshMix.lowCarbonPercent)),
      state('renewable_share', Math.round(freshMix.renewablePercent)),
      ...FUEL_KEYS.map((key) => state(`${key}_share`, Math.round(freshMix.sharesPercent[key]))),
    );
  }
  const text = summaryText({ mix: freshMix, load: freshLoad, prices }, config, now);
  if (text) {
    states.push({ device_feature_external_id: ids.feature('summary'), text });
  }
  return states;
}

/** The summary sentence in the configured language, with the first zone followed. */
export function summaryText({ mix, load, prices }, config, now) {
  const freshPrices = fresh(prices, PRICE_MAX_AGE_MS, now);
  const ptid = config.zones.find((id) => freshPrices?.prices[id] !== undefined);
  const text = MESSAGES.summary({
    loadMw: load?.totalMw,
    lowCarbonPercent: mix?.lowCarbonPercent,
    carbonIntensity: mix?.carbonIntensity,
    zoneName: ptid ? ZONES[ptid].name : null,
    price: ptid ? freshPrices.prices[ptid] : null,
  })[config.language];
  return text || null;
}

/**
 * The states of a zone device; a figure whose source is stale is left out.
 * @param {object} gladys
 * @param {string} ptid
 * @param {object} data `{ load, prices }` as read
 * @param {number} now
 */
export function zoneStates(gladys, ptid, { load, prices }, now) {
  const ids = zoneIds(gladys, ptid);
  const state = (key, value) => ({ device_feature_external_id: ids.feature(key), state: value });
  const states = [];
  const price = fresh(prices, PRICE_MAX_AGE_MS, now)?.prices[ptid];
  if (price !== undefined) {
    states.push(state('price', price));
  }
  const mw = fresh(load, MIX_MAX_AGE_MS, now)?.zonesMw[ptid];
  if (mw !== undefined) {
    states.push(state('zone_load', Math.round(mw * 1000)));
  }
  return states;
}
