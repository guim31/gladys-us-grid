// -----------------------------------------------------------------------------
// The integration, wired on a Gladys client (the real one in index.js, the
// SDK's fake Gladys in the tests).
//
// Refresh (the core does not poll external devices reliably, Gladys#3198):
// the container ticks every minute on its own timer. A tick
//   - reads the current NYISO prices every five minutes (the pace of the
//     market), when a zone is followed or a dashboard showed the widget in the
//     last hour;
//   - reads the fuel mix and the load every five minutes, when a device is
//     added, the low-carbon trigger has a threshold, or the widget was shown;
//   - fires the triggers whose threshold a new reading crossed;
//   - reads the EIA grids every hour (two grouped requests), when one of their
//     devices is added: the EIA publishes hourly, one to eight hours late;
//   - publishes the states that changed, each value sent again at least every
//     6 hours (heartbeat). Nothing is published from a stale or failed read.
// The core's onPoll, called every minute for the devices it does poll, only
// runs a tick when the timer missed one: it is the fallback.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import {
  GRID,
  MIX_MAX_AGE_MS,
  PRICE_MAX_AGE_MS,
  buildDevices,
  eiaIds,
  eiaRegions,
  eiaStates,
  fresh,
  gridIds,
  gridStates,
  zoneIds,
  zoneStates,
} from './devices.js';
import { MESSAGES, TEXT, pick } from './i18n.js';
import { fetchEia, isKeyRefused } from './eia.js';
import { createIssueLog } from './issues.js';
import { fetchFuelMix, fetchLoad, fetchPrices } from './nyiso.js';
import { Store } from './store.js';
import {
  LOW_CARBON_ABOVE,
  NEGATIVE_PRICE,
  PRICE_ABOVE,
  PRICE_BELOW,
  lowCarbonEvent,
  priceEvents,
} from './triggers.js';
import { WIDGET_KEY, buildWidgetContent, normalizeSettings } from './widgets.js';
import { DEFAULT_ZONE, ZONES } from './zones.js';

const logger = createLogger({ name: 'us-grid' });

export const TICK_MS = 60 * 1000;
export const PERIOD_MS = 5 * 60 * 1000;
export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
/** The EIA publishes hourly: one read an hour. */
export const EIA_PERIOD_MS = 60 * 60 * 1000;
/** A device just added reads the EIA at once, but not twice within this. */
const EIA_MIN_GAP_MS = 5 * 60 * 1000;
/** A widget shown in the last hour keeps NYISO read without any device. */
const WIDGET_INTEREST_MS = 60 * 60 * 1000;

export const ACTION_KEY = 'test_connection';
export { GRID };

/**
 * @param {object} gladys GladysIntegration, or the SDK's fake Gladys
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {Store} [options.store]
 * @param {() => number} [options.now]
 * @param {boolean} [options.timers] run the minute timer
 */
export function registerHandlers(
  gladys,
  {
    fetch: fetchImpl = globalThis.fetch,
    store = new Store(),
    now = () => Date.now(),
    timers = true,
  } = {},
) {
  let config = normalizeConfig(gladys.config ?? {});
  /** What /data keeps: `{ triggers: { price_above: { threshold, on }, … } }`. */
  let persisted = { triggers: {} };
  let prices = null;
  let mix = null;
  let load = null;
  let pricesAttemptAt = -Infinity;
  let mixAttemptAt = -Infinity;
  /** EIA code → `{ demand, forecasts, mix }`. */
  let eia = {};
  let eiaAttemptAt = -Infinity;
  let eiaKeyRefused = false;
  let eiaFirstRead = true;
  /** The key and grids of the last EIA read: a new one is read at once. */
  let eiaReadFor = null;
  let widgetShownAt = -Infinity;
  let lastTickAt = -Infinity;
  let lastStatus = null;
  let firstRead = true;
  let timer = null;
  let stopped = false;
  let ticking = null;

  const priceIssues = createIssueLog(logger.child('prices'));
  const mixIssues = createIssueLog(logger.child('mix'));
  const eiaIssues = createIssueLog(logger.child('eia'));
  const gladysIssues = createIssueLog(logger);

  const ready = store.load().then((data) => {
    persisted = {
      triggers: data.triggers && typeof data.triggers === 'object' ? data.triggers : {},
    };
  });

  const isCreatedId = (id) => (gladys.devices ?? []).some((device) => device.external_id === id);
  const isGridCreated = () => isCreatedId(gridIds(gladys).device);
  const isZoneCreated = (ptid) => isCreatedId(zoneIds(gladys, ptid).device);
  const isEiaCreated = (code) => isCreatedId(eiaIds(gladys, code).device);
  const wantsEia = () => eiaRegions(config).some(isEiaCreated);
  const eiaSignature = () => JSON.stringify([config.eia_api_key, eiaRegions(config)]);
  /**
   * A forced tick (start, new configuration) reads the EIA when its key or
   * grids changed, else not twice within a few minutes: saving the
   * configuration again and again must not use up the key's quota.
   */
  const eiaDue = (force) =>
    force
      ? eiaReadFor !== eiaSignature() || now() - eiaAttemptAt >= EIA_MIN_GAP_MS
      : wantsEia() && now() - eiaAttemptAt >= EIA_PERIOD_MS;
  const widgetWanted = () => now() - widgetShownAt < WIDGET_INTEREST_MS;
  const wantsPrices = () => config.zones.length > 0 || widgetWanted();
  const wantsMix = () =>
    isGridCreated() ||
    config.zones.some(isZoneCreated) ||
    config.low_carbon_high !== null ||
    widgetWanted();

  // --- Reading NYISO ----------------------------------------------------------

  async function refreshPrices() {
    pricesAttemptAt = now();
    try {
      const next = await fetchPrices(fetchImpl, now());
      const changed = next.at !== prices?.at;
      prices = next;
      priceIssues.ok('read', 'NYISO prices answer again');
      if (firstRead) {
        firstRead = false;
        logger.info(`NYISO reachable: prices of ${next.at}`);
      }
      if (changed) {
        logger.debug(`NYISO prices ${next.at}: ${JSON.stringify(next.prices)}`);
      }
      // Every read, not only a new one: a new threshold may already be crossed.
      if (fresh(next, PRICE_MAX_AGE_MS, now())) {
        await firePriceTriggers(next);
      }
      return true;
    } catch (err) {
      priceIssues.fail('read', `NYISO prices cannot be read: ${err.message}`);
      return false;
    }
  }

  async function refreshMix() {
    mixAttemptAt = now();
    const [mixRead, loadRead] = await Promise.allSettled([
      fetchFuelMix(fetchImpl, now()),
      fetchLoad(fetchImpl, now()),
    ]);
    // Never replace a reading with an older one.
    if (mixRead.status === 'fulfilled' && !(mix && mixRead.value.at < mix.at)) {
      const changed = mixRead.value.at !== mix?.at;
      mix = mixRead.value;
      if (changed) {
        logger.debug(
          `NYISO mix ${mix.at}: ${Math.round(mix.lowCarbonPercent)} % low-carbon, ` +
            `${Math.round(mix.carbonIntensity)} g/kWh`,
        );
      }
      if (fresh(mix, MIX_MAX_AGE_MS, now())) {
        await fireLowCarbonTrigger(mix);
      }
    }
    if (loadRead.status === 'fulfilled' && !(load && loadRead.value.at < load.at)) {
      load = loadRead.value;
      logger.debug(`NYISO load ${load.at}: ${Math.round(load.totalMw)} MW`);
    }
    const failure = [mixRead, loadRead].find((read) => read.status === 'rejected');
    if (failure) {
      mixIssues.fail('read', `NYISO fuel mix or load cannot be read: ${failure.reason.message}`);
      return false;
    }
    mixIssues.ok('read', 'NYISO fuel mix and load answer again');
    return true;
  }

  /** The EIA grids followed, in two grouped requests. */
  async function refreshEia() {
    const regions = eiaRegions(config);
    if (regions.length === 0) {
      // Nothing to read any more (key or grids removed): no failure either.
      eiaKeyRefused = false;
      eiaIssues.ok('read', 'No EIA grid to read any more');
      return true;
    }
    eiaAttemptAt = now();
    eiaReadFor = eiaSignature();
    try {
      const read = await fetchEia(fetchImpl, { apiKey: config.eia_api_key, regions, now: now() });
      const next = {};
      for (const code of regions) {
        // Never replace a figure with an older one, nor with none.
        const before = eia[code] ?? {};
        const after = read[code];
        const newest = (a, b) => (a && (!b || a.at >= b.at) ? a : b);
        next[code] = {
          demand: newest(after.demand, before.demand),
          forecasts: after.forecasts.length > 0 ? after.forecasts : (before.forecasts ?? []),
          mix: newest(after.mix, before.mix),
        };
      }
      eia = next;
      eiaKeyRefused = false;
      eiaIssues.ok('read', 'The EIA answers again');
      if (eiaFirstRead) {
        eiaFirstRead = false;
        logger.info(`EIA reachable: ${regions.length} grid(s) followed`);
      }
      logger.debug(`EIA read: ${JSON.stringify(Object.keys(read))}`);
      return true;
    } catch (err) {
      eiaKeyRefused = isKeyRefused(err);
      eiaIssues.fail(
        'read',
        eiaKeyRefused
          ? `The EIA refuses the API key (HTTP ${err.status})`
          : `The EIA cannot be read: ${err.message}`,
      );
      return false;
    }
  }

  // --- Triggers ---------------------------------------------------------------

  // A crossing is remembered even when Gladys refuses the event: it fires once
  // per crossing, never in a loop against a Gladys that is down.
  async function sendEvent(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
      logger.debug(`Trigger ${key}: ${JSON.stringify(data)}`);
    } catch (err) {
      gladysIssues.fail('scene-event', `Trigger ${key} not sent to Gladys: ${err.message}`);
    }
  }

  async function firePriceTriggers(read) {
    const { state, events } = priceEvents(persisted.triggers, read.prices, config);
    saveTriggers(state);
    for (const event of events) {
      await sendEvent(event.key, {
        zone: event.ptid,
        zone_name: ZONES[event.ptid].name,
        price: event.price,
        ...(event.key === NEGATIVE_PRICE ? {} : { threshold: event.threshold }),
      });
    }
  }

  async function fireLowCarbonTrigger(read) {
    const { state, fire } = lowCarbonEvent(
      persisted.triggers,
      read.lowCarbonPercent,
      config.low_carbon_high,
    );
    saveTriggers(state);
    if (fire) {
      await sendEvent(LOW_CARBON_ABOVE, {
        low_carbon_share: Math.round(read.lowCarbonPercent),
        renewable_share: Math.round(read.renewablePercent),
        carbon_intensity: Math.round(read.carbonIntensity),
        threshold: config.low_carbon_high,
      });
    }
  }

  /** Written only on change: the prices move every five minutes. */
  function saveTriggers(state) {
    if (JSON.stringify(state) !== JSON.stringify(persisted.triggers)) {
      persisted.triggers = state;
      store.save(persisted);
    }
  }

  // --- States ---------------------------------------------------------------

  const data = () => ({ prices, mix, load });

  async function publishStates() {
    const states = [
      ...(isGridCreated() ? gridStates(gladys, data(), config, now()) : []),
      ...config.zones
        .filter(isZoneCreated)
        .flatMap((ptid) => zoneStates(gladys, ptid, data(), now())),
      ...eiaRegions(config)
        .filter(isEiaCreated)
        .flatMap((code) => eiaStates(gladys, code, eia[code], config, now())),
    ];
    if (states.length === 0) {
      return;
    }
    try {
      const { count } = await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (count > 0) {
        logger.debug(`${count} state(s) published`);
      }
      gladysIssues.ok('states', 'States accepted by Gladys again');
    } catch (err) {
      gladysIssues.fail('states', `States not accepted by Gladys: ${err.message}`);
    }
  }

  /** The application status of the Configuration screen, sent on change only. */
  async function reportStatus() {
    let status = { connected: true };
    if (priceIssues.isFailing('read')) {
      status = { connected: false, message: TEXT.pricesDown };
    } else if (mixIssues.isFailing('read')) {
      status = { connected: false, message: TEXT.mixDown };
    } else if (eiaIssues.isFailing('read')) {
      status = {
        connected: false,
        message: eiaKeyRefused ? TEXT.eiaKeyRefused : TEXT.eiaDown,
      };
    } else if (config.eia_regions.length > 0 && !config.eia_api_key) {
      status = { connected: false, message: TEXT.eiaKeyMissing };
    }
    const key = JSON.stringify(status);
    if (key === lastStatus) {
      return;
    }
    try {
      // The four languages: the core 5.2+ refuses a plain string.
      await gladys.setConnectionStatus(status.connected, status.message);
      lastStatus = key;
    } catch (err) {
      logger.debug(`Connection status not sent: ${err.message}`);
    }
  }

  // --- The tick ---------------------------------------------------------------

  /**
   * Read what is due, publish what changed. One tick at a time: a second
   * caller waits for the one in progress.
   * @param {object} [options]
   * @param {boolean} [options.force] read everything now
   */
  async function tick({ force = false } = {}) {
    // A forced tick (new configuration) must not reuse a tick started with
    // the previous one: it waits for it, then runs.
    while (force && ticking) {
      await ticking.catch(() => {});
    }
    if (ticking) {
      return ticking;
    }
    ticking = (async () => {
      lastTickAt = now();
      if (gladys.connected === false) {
        logger.debug('Gladys unreachable: tick skipped');
        return;
      }
      let read = false;
      if (force || (wantsPrices() && now() - pricesAttemptAt >= PERIOD_MS)) {
        await refreshPrices();
        read = true;
      }
      if (force || (wantsMix() && now() - mixAttemptAt >= PERIOD_MS)) {
        await refreshMix();
        read = true;
      }
      if (eiaDue(force)) {
        await refreshEia();
      }
      await publishStates();
      await reportStatus();
      if (read && widgetWanted()) {
        gladys.requestWidgetRefresh(WIDGET_KEY);
      }
    })().finally(() => {
      ticking = null;
    });
    return ticking;
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await tick();
      } catch (err) {
        logger.error(`Refresh failed (${err.message})`);
      } finally {
        schedule();
      }
    }, TICK_MS);
  }

  /** (Re)start: publish the devices, read everything, then every minute. */
  async function start() {
    await ready;
    stopped = false;
    lastStatus = null;
    try {
      await gladys.publishDiscoveredDevices(buildDevices(gladys, config));
    } catch (err) {
      logger.error(`Publishing the devices failed: ${err.message}`);
    }
    schedule();
    await tick({ force: true });
  }

  // --- Handlers ---------------------------------------------------------------

  gladys.onScanRequest(async () => {
    await gladys.publishDiscoveredDevices(buildDevices(gladys, config));
  });

  gladys.onPoll(async () => {
    // Fallback of the timer: the core polls every minute, a tick runs only
    // when the timer has not ticked for most of a minute.
    if (now() - lastTickAt < TICK_MS * 0.9) {
      return;
    }
    await tick();
  });

  // A device just added: its states again now (the core dropped the ones it
  // received before the feature existed), and the widget gains its chart.
  const onDeviceAdded = async () => {
    if (!fresh(mix, MIX_MAX_AGE_MS, now()) || !fresh(load, MIX_MAX_AGE_MS, now())) {
      await refreshMix();
    }
    if (config.zones.length > 0 && !fresh(prices, PRICE_MAX_AGE_MS, now())) {
      await refreshPrices();
    }
    const eiaMissing = eiaRegions(config).some((code) => isEiaCreated(code) && !eia[code]);
    if (eiaMissing && now() - eiaAttemptAt >= EIA_MIN_GAP_MS) {
      await refreshEia();
    }
    await publishStates();
    gladys.requestWidgetRefresh(WIDGET_KEY);
  };
  gladys.onDeviceCreated(onDeviceAdded);
  gladys.onDeviceUpdated(onDeviceAdded);
  gladys.onDeviceDeleted(() => gladys.requestWidgetRefresh(WIDGET_KEY));

  gladys.onAction(ACTION_KEY, async () => {
    logger.info('Action: test the connection to NYISO and the EIA');
    const withEia = eiaRegions(config).length > 0;
    const [pricesOk, mixOk, eiaOk] = await Promise.all([
      refreshPrices(),
      refreshMix(),
      withEia ? refreshEia() : true,
    ]);
    await publishStates();
    await reportStatus();
    if (!pricesOk) {
      throw new Error(pick(TEXT.pricesDown, config.language));
    }
    const ptid = [...config.zones, DEFAULT_ZONE, ...Object.keys(prices.prices)].find((id) =>
      Number.isFinite(prices.prices[id]),
    );
    const time = new Date(prices.at).toLocaleTimeString(config.language, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const message = MESSAGES.testOk({
      zoneName: ZONES[ptid].name,
      price: prices.prices[ptid],
      time,
      lowCarbonPercent: mixOk ? mix.lowCarbonPercent : undefined,
    });
    const eiaPart = withEia
      ? MESSAGES.eiaTest({
          ok: eiaOk,
          count: Object.values(eia).filter((read) => read.demand || read.mix).length,
          keyRefused: eiaKeyRefused,
        })
      : null;
    return pick(message, config.language) + (eiaPart ? pick(eiaPart, config.language) : '');
  });

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings, language }) => {
    widgetShownAt = now();
    if (!fresh(prices, PRICE_MAX_AGE_MS, now()) && now() - pricesAttemptAt >= PERIOD_MS) {
      await refreshPrices();
    }
    if (!fresh(mix, MIX_MAX_AGE_MS, now()) && now() - mixAttemptAt >= PERIOD_MS) {
      await refreshMix();
    }
    const normalized = normalizeSettings(settings);
    return buildWidgetContent({
      prices: fresh(prices, PRICE_MAX_AGE_MS, now()),
      mix: fresh(mix, MIX_MAX_AGE_MS, now()),
      load: fresh(load, MIX_MAX_AGE_MS, now()),
      settings: normalized,
      config,
      priceFeature:
        config.zones.includes(normalized.zone) && isZoneCreated(normalized.zone)
          ? zoneIds(gladys, normalized.zone).feature('price')
          : null,
      co2Feature: isGridCreated() ? gridIds(gladys).feature('carbon_intensity') : null,
      failing: priceIssues.isFailing('read') || mixIssues.isFailing('read'),
      language,
    });
  });

  gladys.onConfigUpdated(async (raw) => {
    config = normalizeConfig(raw);
    logger.info('New configuration received');
    await start();
  });

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await start();
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
      await gladys.setConnectionStatus(false, TEXT.initFailed).catch(() => {});
    }
  });

  return {
    ready,
    tick,
    /** For the tests: what the integration holds. */
    get prices() {
      return prices;
    },
    get mix() {
      return mix;
    },
    get load() {
      return load;
    },
    get eia() {
      return eia;
    },
    get triggers() {
      return persisted.triggers;
    },
    /** Stop the timer and wait for the last write under /data. */
    async stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
      await ticking?.catch(() => {});
      await store.flush();
    },
  };
}

export const TRIGGER_KEYS = [PRICE_ABOVE, PRICE_BELOW, NEGATIVE_PRICE, LOW_CARBON_ABOVE];
