// -----------------------------------------------------------------------------
// The "New York power grid" dashboard widget: the real-time price of a zone
// (setting, New York City by default; every zone is in the price file, the
// zone needs no device), the low-carbon share, the estimated CO₂ intensity and
// the load as tiles, a 24-hour chart from the history Gladys keeps (the price
// of the zone once its device is added, else the CO₂ once the grid device is),
// and the mix as bars, one row per fuel category.
//
// The core vocabulary has no bar list: each row of the `status` component
// carries a ten-cell text bar ("███████░░░ 68 %"). Budget (core): 8
// components, 2 texts — this content uses at most 4 tiles, 1 chart, 1 status
// and 1 caption, in the order of importance (the core drops from the end).
// The chart and the mix each have a setting to hide them.
// -----------------------------------------------------------------------------

import {
  WIDGET_COLORS,
  WIDGET_CHART_INTERVALS,
  WIDGET_CHART_TYPES,
} from '@gladysassistant/integration-sdk';
import { FUEL_KEYS } from './nyiso.js';
import { MESSAGES, TEXT, formatNumber, pick } from './i18n.js';
import { DEFAULT_ZONE, ZONES } from './zones.js';

export const WIDGET_KEY = 'grid';

/** The content is cached by the core: refetched every 5 minutes at most. */
export const WIDGET_TTL_SECONDS = 300;

/** Fossil categories in orange, the rest in green. */
const FOSSIL = new Set(['dual_fuel', 'natural_gas', 'other_fossil']);

/** Same thresholds as the Gladys badge of the grid carbon category. */
export function co2Color(co2) {
  if (co2 < 150) {
    return WIDGET_COLORS.SUCCESS;
  }
  return co2 < 400 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.DANGER;
}

/** Green when negative or under the low threshold, red over the high one. */
export function priceColor(price, config) {
  if (price < 0 || (config.price_low !== null && price < config.price_low)) {
    return WIDGET_COLORS.SUCCESS;
  }
  if (config.price_high !== null && price > config.price_high) {
    return WIDGET_COLORS.DANGER;
  }
  return undefined;
}

/** "███████░░░" for 68 %. */
export function bar(percent) {
  const cells = Math.max(0, Math.min(10, Math.round(Math.abs(percent) / 10)));
  return '█'.repeat(cells) + '░'.repeat(10 - cells);
}

/** The widget settings, normalized: unknown zone → New York City, blocks shown. */
export function normalizeSettings(settings = {}) {
  const zone = String(settings.zone ?? '');
  return {
    zone: ZONES[zone] ? zone : DEFAULT_ZONE,
    showChart: settings.show_chart !== false,
    showMix: settings.show_mix !== false,
  };
}

/**
 * Build the widget content.
 * @param {object} options
 * @param {{ at: string, prices: Record<string, number> } | null} options.prices fresh enough to show
 * @param {ReturnType<import('./nyiso.js').mixOf> | null} options.mix fresh enough to show
 * @param {{ totalMw: number } | null} options.load fresh enough to show
 * @param {ReturnType<typeof normalizeSettings>} options.settings
 * @param {ReturnType<import('./config.js').normalizeConfig>} options.config
 * @param {string | null} options.priceFeature the zone's price feature, once its device exists
 * @param {string | null} options.co2Feature the CO₂ feature, once the grid device exists
 * @param {boolean} options.failing NYISO cannot be read right now
 * @param {string} options.language
 * @param {string} [options.timeZone] for the time of the figures (Gladys' TZ by default)
 */
export function buildWidgetContent({
  prices,
  mix,
  load,
  settings,
  config,
  priceFeature,
  co2Feature,
  failing,
  language,
  timeZone,
}) {
  const components = [];
  const price = prices?.prices[settings.zone];
  if (price !== undefined) {
    const color = priceColor(price, config);
    components.push({
      type: 'value',
      label: `${pick(TEXT.price, language)} · ${ZONES[settings.zone].name}`,
      value: Number(price.toFixed(2)),
      unit: '$/MWh',
      icon: 'dollar-sign',
      ...(color ? { color } : {}),
    });
  }
  if (mix) {
    components.push(
      {
        type: 'value',
        label: pick(TEXT.lowCarbon, language),
        value: Math.round(mix.lowCarbonPercent),
        unit: '%',
        icon: 'feather',
      },
      {
        type: 'value',
        label: pick(TEXT.co2, language),
        value: Math.round(mix.carbonIntensity),
        unit: 'g/kWh',
        icon: 'cloud',
        color: co2Color(mix.carbonIntensity),
      },
    );
  }
  if (load) {
    components.push({
      type: 'value',
      label: pick(TEXT.load, language),
      value: Number((load.totalMw / 1000).toFixed(1)),
      unit: 'GW',
      icon: 'zap',
    });
  }
  const chartFeature = priceFeature ?? co2Feature;
  if (settings.showChart && chartFeature) {
    components.push({
      type: 'chart',
      device_features: [chartFeature],
      interval: WIDGET_CHART_INTERVALS.LAST_DAY,
      chart_type: WIDGET_CHART_TYPES.LINE,
      title: pick(priceFeature ? TEXT.priceChart : TEXT.co2Chart, language),
      unit: priceFeature ? '$/MWh' : 'g/kWh',
    });
  }
  if (settings.showMix && mix) {
    const rows = FUEL_KEYS.map((key) => ({
      label: pick(TEXT[key], language),
      percent: mix.sharesPercent[key],
      color: FOSSIL.has(key) ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    })).filter((row) => row.percent >= 0.5);
    rows.sort((a, b) => b.percent - a.percent);
    if (rows.length > 0) {
      components.push({
        type: 'status',
        items: rows.map((row) => ({
          label: row.label,
          value: `${bar(row.percent)} ${formatNumber(row.percent, language)} %`,
          color: row.color,
        })),
      });
    }
  }
  const latest = [prices, mix, load]
    .filter(Boolean)
    .map((data) => Date.parse(data.at))
    .sort((a, b) => b - a)[0];
  if (latest !== undefined) {
    const time = new Date(latest).toLocaleTimeString(language, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(timeZone ? { timeZone } : {}),
    });
    components.push({
      type: 'text',
      variant: 'caption',
      text: pick(MESSAGES.updatedAt(time), language),
    });
  } else {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(failing ? TEXT.unreachable : TEXT.waiting, language),
    });
  }
  return { ttl_seconds: WIDGET_TTL_SECONDS, components };
}
