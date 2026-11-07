// -----------------------------------------------------------------------------
// The scene triggers: a value crossing a threshold, once per crossing.
//
// A Gladys scene can already start on a device value, but only once the device
// is added, and it fires again at every reading on the wrong side of a
// threshold the market crosses back and forth every five minutes. These
// triggers fire once when the value crosses, and only re-arm once it has gone
// back past the threshold by a margin (hysteresis):
//
//   price_above       a followed zone's price rises above `price_high`
//   price_below       a followed zone's price falls below `price_low`
//   negative_price    a followed zone's price turns negative
//   low_carbon_above  the low-carbon share rises above `low_carbon_high`
//
// What is "on" is kept under /data with its threshold: a restart does not fire
// again, a new threshold starts afresh (and fires if already crossed).
// -----------------------------------------------------------------------------

export const PRICE_ABOVE = 'price_above';
export const PRICE_BELOW = 'price_below';
export const NEGATIVE_PRICE = 'negative_price';
export const LOW_CARBON_ABOVE = 'low_carbon_above';
export const TRIGGER_KEYS = [PRICE_ABOVE, PRICE_BELOW, NEGATIVE_PRICE, LOW_CARBON_ABOVE];

/** Re-arm margins: $/MWh for the prices, points for the share. */
export const PRICE_MARGIN = 5;
export const NEGATIVE_MARGIN = 1;
export const SHARE_MARGIN = 2;

/**
 * One crossing detector.
 * @param {object} entry the persisted `{ threshold, on: { id: true } }`, or undefined
 * @param {number} threshold
 * @param {string} id what crosses (a zone PTID, or "grid")
 * @param {number} value
 * @param {(value: number) => boolean} isOn the value is past the threshold
 * @param {(value: number) => boolean} isOff the value is back past the margin
 * @returns {{ entry: object, fire: boolean }}
 */
export function cross(entry, threshold, id, value, isOn, isOff) {
  const next =
    entry && entry.threshold === threshold
      ? { threshold, on: { ...entry.on } }
      : { threshold, on: {} };
  if (next.on[id]) {
    if (isOff(value)) {
      delete next.on[id];
    }
    return { entry: next, fire: false };
  }
  if (isOn(value)) {
    next.on[id] = true;
    return { entry: next, fire: true };
  }
  return { entry: next, fire: false };
}

/**
 * The events due for a new price reading, and the new persisted state.
 * @param {object} state persisted `{ price_above, price_below, negative_price }`
 * @param {Record<string, number>} prices PTID → $/MWh
 * @param {ReturnType<import('./config.js').normalizeConfig>} config
 * @returns {{ state: object, events: Array<{ key: string, ptid: string, price: number, threshold: number }> }}
 */
export function priceEvents(state, prices, config) {
  const next = { ...state };
  const events = [];
  const rules = [
    [PRICE_ABOVE, config.price_high, (t) => (v) => v > t, (t) => (v) => v <= t - PRICE_MARGIN],
    [PRICE_BELOW, config.price_low, (t) => (v) => v < t, (t) => (v) => v >= t + PRICE_MARGIN],
    [NEGATIVE_PRICE, 0, (t) => (v) => v < t, (t) => (v) => v >= t + NEGATIVE_MARGIN],
  ];
  for (const [key, threshold, on, off] of rules) {
    if (threshold === null) {
      delete next[key];
      continue;
    }
    let entry = next[key];
    for (const ptid of config.zones) {
      const price = prices[ptid];
      if (price === undefined) {
        continue;
      }
      const result = cross(entry, threshold, ptid, price, on(threshold), off(threshold));
      entry = result.entry;
      if (result.fire) {
        events.push({ key, ptid, price, threshold });
      }
    }
    // Zones no longer followed are forgotten.
    if (entry) {
      entry.on = Object.fromEntries(
        Object.entries(entry.on).filter(([ptid]) => config.zones.includes(ptid)),
      );
      next[key] = entry;
    }
  }
  return { state: next, events };
}

/**
 * The low-carbon event due for a new mix, and the new persisted state.
 * @param {object} state persisted `{ low_carbon_above }`
 * @param {number} share low-carbon share, %
 * @param {number | null} threshold
 */
export function lowCarbonEvent(state, share, threshold) {
  const next = { ...state };
  if (threshold === null) {
    delete next[LOW_CARBON_ABOVE];
    return { state: next, fire: false };
  }
  const result = cross(
    next[LOW_CARBON_ABOVE],
    threshold,
    'grid',
    share,
    (v) => v > threshold,
    (v) => v <= threshold - SHARE_MARGIN,
  );
  next[LOW_CARBON_ABOVE] = result.entry;
  return { state: next, fire: result.fire };
}
