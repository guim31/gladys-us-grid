// -----------------------------------------------------------------------------
// Every text the integration shows, in the four languages of the Gladys
// interface (en, fr, de, es). German says "du", Spanish says "usted", like the
// rest of guim31's integrations. Brands and zone names (NYISO, New York City,
// Long Island) stay as is.
//
//   - NAMES    : device and feature names, written once in the language of
//                the configuration (Gladys freezes them when a device is added);
//   - TEXT     : the fixed texts (widget, configuration screen, actions);
//   - MESSAGES : the texts built from a value, numbers in the local format.
//
// test/i18n.test.js checks that every entry carries exactly the four
// languages, with no empty text and no polite German.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

export { LANGUAGES };

/** Device and feature names, by language then key. */
export const NAMES = {
  en: {
    grid: 'New York power grid',
    consumption: 'New York load',
    carbon_intensity: 'CO₂ intensity (estimated)',
    low_carbon_share: 'Low-carbon share',
    renewable_share: 'Renewable share',
    dual_fuel_share: 'Dual fuel share',
    natural_gas_share: 'Natural gas share',
    nuclear_share: 'Nuclear share',
    other_fossil_share: 'Other fossil fuels share',
    other_renewables_share: 'Other renewables share',
    wind_share: 'Wind share',
    hydro_share: 'Hydro share',
    summary: 'Summary',
    price: 'Real-time price ($/MWh)',
    zone_load: 'Zone load',
    demand: 'Demand',
    demand_forecast: 'Demand forecast, this hour',
    demand_forecast_peak: 'Peak forecast, next 24 h',
    coal_share: 'Coal share',
    solar_share: 'Solar share',
    other_share: 'Other sources share',
    data_time: 'Data time (EIA)',
  },
  fr: {
    grid: 'Réseau électrique de New York',
    consumption: 'Consommation de New York',
    carbon_intensity: 'Taux de CO₂ (estimé)',
    low_carbon_share: 'Part bas carbone',
    renewable_share: 'Part renouvelable',
    dual_fuel_share: 'Part bicombustible',
    natural_gas_share: 'Part du gaz naturel',
    nuclear_share: 'Part du nucléaire',
    other_fossil_share: 'Part des autres fossiles',
    other_renewables_share: 'Part des autres renouvelables',
    wind_share: "Part de l'éolien",
    hydro_share: "Part de l'hydraulique",
    summary: 'Résumé',
    price: 'Prix temps réel ($/MWh)',
    zone_load: 'Consommation de la zone',
    demand: 'Demande',
    demand_forecast: 'Prévision de demande, heure en cours',
    demand_forecast_peak: 'Pointe prévue sur 24 h',
    coal_share: 'Part du charbon',
    solar_share: 'Part du solaire',
    other_share: 'Part des autres sources',
    data_time: 'Heure des données (EIA)',
  },
  de: {
    grid: 'Stromnetz New York',
    consumption: 'Verbrauch New York',
    carbon_intensity: 'CO₂-Intensität (geschätzt)',
    low_carbon_share: 'CO₂-armer Anteil',
    renewable_share: 'Erneuerbarer Anteil',
    dual_fuel_share: 'Anteil Zweistoff',
    natural_gas_share: 'Anteil Erdgas',
    nuclear_share: 'Anteil Kernkraft',
    other_fossil_share: 'Anteil andere fossile',
    other_renewables_share: 'Anteil andere erneuerbare',
    wind_share: 'Anteil Wind',
    hydro_share: 'Anteil Wasserkraft',
    summary: 'Zusammenfassung',
    price: 'Echtzeitpreis ($/MWh)',
    zone_load: 'Verbrauch der Zone',
    demand: 'Verbrauch',
    demand_forecast: 'Verbrauchsprognose, diese Stunde',
    demand_forecast_peak: 'Prognostizierte Spitze, 24 h',
    coal_share: 'Anteil Kohle',
    solar_share: 'Anteil Solar',
    other_share: 'Anteil andere Quellen',
    data_time: 'Zeit der Daten (EIA)',
  },
  es: {
    grid: 'Red eléctrica de Nueva York',
    consumption: 'Consumo de Nueva York',
    carbon_intensity: 'Intensidad de CO₂ (estimada)',
    low_carbon_share: 'Proporción baja en carbono',
    renewable_share: 'Proporción renovable',
    dual_fuel_share: 'Proporción bicombustible',
    natural_gas_share: 'Proporción de gas natural',
    nuclear_share: 'Proporción nuclear',
    other_fossil_share: 'Proporción de otros fósiles',
    other_renewables_share: 'Proporción de otras renovables',
    wind_share: 'Proporción eólica',
    hydro_share: 'Proporción hidráulica',
    summary: 'Resumen',
    price: 'Precio en tiempo real ($/MWh)',
    zone_load: 'Consumo de la zona',
    demand: 'Demanda',
    demand_forecast: 'Previsión de demanda, hora actual',
    demand_forecast_peak: 'Pico previsto en 24 h',
    coal_share: 'Proporción de carbón',
    solar_share: 'Proporción solar',
    other_share: 'Proporción de otras fuentes',
    data_time: 'Hora de los datos (EIA)',
  },
};

/** Fixed texts, by key then language. */
export const TEXT = {
  price: { en: 'Price', fr: 'Prix', de: 'Preis', es: 'Precio' },
  lowCarbon: { en: 'Low-carbon', fr: 'Bas carbone', de: 'CO₂-arm', es: 'Bajo en carbono' },
  co2: { en: 'CO₂ (estimated)', fr: 'CO₂ (estimé)', de: 'CO₂ (geschätzt)', es: 'CO₂ (estimado)' },
  load: { en: 'Load', fr: 'Consommation', de: 'Verbrauch', es: 'Consumo' },
  dual_fuel: { en: 'Dual fuel', fr: 'Bicombustible', de: 'Zweistoff', es: 'Bicombustible' },
  natural_gas: { en: 'Natural gas', fr: 'Gaz naturel', de: 'Erdgas', es: 'Gas natural' },
  nuclear: { en: 'Nuclear', fr: 'Nucléaire', de: 'Kernkraft', es: 'Nuclear' },
  other_fossil: {
    en: 'Other fossil',
    fr: 'Autres fossiles',
    de: 'Andere fossile',
    es: 'Otros fósiles',
  },
  other_renewables: {
    en: 'Other renewables',
    fr: 'Autres renouvelables',
    de: 'Andere erneuerbare',
    es: 'Otras renovables',
  },
  wind: { en: 'Wind', fr: 'Éolien', de: 'Wind', es: 'Eólica' },
  hydro: { en: 'Hydro', fr: 'Hydraulique', de: 'Wasserkraft', es: 'Hidráulica' },
  priceChart: {
    en: 'Price, last 24 h',
    fr: 'Prix sur 24 h',
    de: 'Preis, letzte 24 h',
    es: 'Precio, últimas 24 h',
  },
  co2Chart: {
    en: 'CO₂, last 24 h',
    fr: 'CO₂ sur 24 h',
    de: 'CO₂, letzte 24 h',
    es: 'CO₂, últimas 24 h',
  },
  waiting: {
    en: 'Waiting for the first NYISO figures.',
    fr: 'En attente des premiers chiffres de NYISO.',
    de: 'Warte auf die ersten Zahlen von NYISO.',
    es: 'Esperando las primeras cifras de NYISO.',
  },
  unreachable: {
    en: 'NYISO cannot be reached right now: no figure is shown rather than an old one.',
    fr: "NYISO ne répond pas pour l'instant : aucun chiffre plutôt qu'un chiffre périmé.",
    de: 'NYISO ist gerade nicht erreichbar: lieber keine Zahl als eine veraltete.',
    es: 'NYISO no responde por ahora: mejor ninguna cifra que una caducada.',
  },
  pricesDown: {
    en: 'The NYISO price file cannot be read. Retrying every five minutes.',
    fr: 'Le fichier de prix de NYISO est illisible. Nouvel essai toutes les cinq minutes.',
    de: 'Die Preisdatei von NYISO ist nicht lesbar. Neuer Versuch alle fünf Minuten.',
    es: 'No se puede leer el archivo de precios de NYISO. Nuevo intento cada cinco minutos.',
  },
  mixDown: {
    en: 'The NYISO fuel mix or load cannot be read. Retrying every five minutes.',
    fr: 'Le mix ou la consommation de NYISO sont illisibles. Nouvel essai toutes les cinq minutes.',
    de: 'Strommix oder Verbrauch von NYISO sind nicht lesbar. Neuer Versuch alle fünf Minuten.',
    es: 'No se puede leer el mix o el consumo de NYISO. Nuevo intento cada cinco minutos.',
  },
  eiaDown: {
    en: 'The EIA cannot be read. Retrying every hour.',
    fr: "L'EIA est illisible. Nouvel essai toutes les heures.",
    de: 'Die EIA ist nicht lesbar. Neuer Versuch jede Stunde.',
    es: 'No se puede leer la EIA. Nuevo intento cada hora.',
  },
  eiaKeyRefused: {
    en: 'The EIA refuses the API key: check it in the configuration.',
    fr: "L'EIA refuse la clé d'API : vérifiez-la dans la configuration.",
    de: 'Die EIA lehnt den API-Schlüssel ab: prüfe ihn in der Konfiguration.',
    es: 'La EIA rechaza la clave de API: verifíquela en la configuración.',
  },
  eiaKeyMissing: {
    en: 'EIA grids chosen without an API key: they are not read.',
    fr: "Réseaux EIA choisis sans clé d'API : ils ne sont pas lus.",
    de: 'EIA-Netze gewählt, aber kein API-Schlüssel: keine Daten.',
    es: 'Redes EIA elegidas sin clave de API: no se leen.',
  },
  initFailed: {
    en: 'The integration could not start. See its logs.',
    fr: "L'intégration n'a pas pu démarrer. Voir ses journaux.",
    de: 'Die Integration konnte nicht starten. Sieh in ihre Logs.',
    es: 'La integración no pudo iniciarse. Consulte sus registros.',
  },
};

const locale = (language) => (LANGUAGES.includes(language) ? language : 'en');

/** A number in the format of a language. */
export function formatNumber(value, language, digits = 0) {
  return value.toLocaleString(locale(language), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** "12/11 08:00" (day/month, or month/day in English), in the time zone of Gladys. */
export function formatTime(at, language) {
  return new Date(at).toLocaleString(locale(language), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

const each = (build) =>
  Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));

/** Texts built from values: each returns the four languages. */
export const MESSAGES = {
  /** "Wholesale price, not your rate · 18:25". */
  updatedAt: (time) => ({
    en: `Wholesale prices, not your rate · ${time}`,
    fr: `Prix de gros, pas votre tarif · ${time}`,
    de: `Großhandelspreise, nicht dein Tarif · ${time}`,
    es: `Precios mayoristas, no su tarifa · ${time}`,
  }),
  /** The summary feature: the figures known, in one sentence. */
  summary: ({ loadMw, lowCarbonPercent, carbonIntensity, zoneName, price }) =>
    each((language) => {
      const words = {
        en: ['GW used', 'low-carbon', 'g CO₂/kWh'],
        fr: ['GW consommés', 'bas carbone', 'g CO₂/kWh'],
        de: ['GW Verbrauch', 'CO₂-arm', 'g CO₂/kWh'],
        es: ['GW consumidos', 'bajo en carbono', 'g CO₂/kWh'],
      }[language];
      const parts = [];
      if (Number.isFinite(loadMw)) {
        parts.push(`${formatNumber(loadMw / 1000, language, 1)} ${words[0]}`);
      }
      if (Number.isFinite(lowCarbonPercent)) {
        parts.push(`${formatNumber(lowCarbonPercent, language)} % ${words[1]}`);
      }
      if (Number.isFinite(carbonIntensity)) {
        parts.push(`${formatNumber(carbonIntensity, language)} ${words[2]}`);
      }
      if (zoneName && Number.isFinite(price)) {
        parts.push(`${zoneName} ${formatNumber(price, language, 2)} $/MWh`);
      }
      return parts.join(', ');
    }),
  /** The hours of the EIA figures, in the time zone of Gladys: "Demand 12/11 08:00, mix 03:00". */
  eiaDataTime: ({ demandAt, mixAt }) =>
    each((language) => {
      const words = {
        en: ['Demand', 'mix', 'Mix'],
        fr: ['Demande', 'mix', 'Mix'],
        de: ['Verbrauch', 'Strommix', 'Strommix'],
        es: ['Demanda', 'mix', 'Mix'],
      }[language];
      const parts = [];
      if (demandAt) {
        parts.push(`${words[0]} ${formatTime(demandAt, language)}`);
      }
      if (mixAt) {
        parts.push(`${parts.length ? words[1] : words[2]} ${formatTime(mixAt, language)}`);
      }
      return parts.join(' · ');
    }),
  /** The EIA part of the test action's answer. */
  eiaTest: ({ ok, count, keyRefused }) =>
    each((language) => {
      if (ok) {
        return {
          en: ` EIA answers: ${count} grid(s) read.`,
          fr: ` L'EIA répond : ${count} réseau(x) lu(s).`,
          de: ` Die EIA antwortet: ${count} Netz(e) gelesen.`,
          es: ` La EIA responde: ${count} red(es) leída(s).`,
        }[language];
      }
      return ` ${(keyRefused ? TEXT.eiaKeyRefused : TEXT.eiaDown)[language]}`;
    }),
  /** The answer of the test action. */
  testOk: ({ zoneName, price, time, lowCarbonPercent }) =>
    each((language) => {
      const head = {
        en: 'NYISO answers',
        fr: 'NYISO répond',
        de: 'NYISO antwortet',
        es: 'NYISO responde',
      }[language];
      const lowCarbon = Number.isFinite(lowCarbonPercent)
        ? {
            en: `, ${formatNumber(lowCarbonPercent, language)} % low-carbon`,
            fr: `, ${formatNumber(lowCarbonPercent, language)} % bas carbone`,
            de: `, ${formatNumber(lowCarbonPercent, language)} % CO₂-arm`,
            es: `, ${formatNumber(lowCarbonPercent, language)} % bajo en carbono`,
          }[language]
        : '';
      return `${head}: ${zoneName} ${formatNumber(price, language, 2)} $/MWh (${time})${lowCarbon}.`;
    }),
};

/** The text of a language, English when missing. */
export function pick(text, language) {
  return text[language] ?? text.en;
}
