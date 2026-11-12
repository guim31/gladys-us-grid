// -----------------------------------------------------------------------------
// The grids the EIA publishes hourly (Form EIA-930, Hourly Electric Grid
// Monitor): the balancing authorities of the United States and the EIA's own
// regions, keyed by the EIA `respondent` code. The code is the platform id of
// the EIA devices and the value of the options of the manifest: never change
// one. The list is the `respondent` facet of /v2/electricity/rto/fuel-type-data
// read on 2026-11-12. Names are proper names, the same in every language.
// -----------------------------------------------------------------------------

/** EIA regions (sums of balancing authorities), shown first. */
export const EIA_AREAS = {
  US48: 'United States Lower 48',
  CAL: 'California',
  CAR: 'Carolinas',
  CENT: 'Central',
  FLA: 'Florida',
  MIDA: 'Mid-Atlantic',
  MIDW: 'Midwest',
  NE: 'New England',
  NY: 'New York',
  NW: 'Northwest',
  SE: 'Southeast',
  SW: 'Southwest',
  TEN: 'Tennessee',
  TEX: 'Texas',
};

/** Balancing authorities: grid operators and utilities. */
export const EIA_AUTHORITIES = {
  AEC: 'PowerSouth Energy Cooperative',
  AECI: 'Associated Electric Cooperative',
  AVA: 'Avista',
  AVRN: 'Avangrid Renewables',
  AZPS: 'Arizona Public Service',
  BANC: 'Balancing Authority of Northern California',
  BHBA: 'Black Hills Energy',
  BPAT: 'Bonneville Power Administration',
  CHPD: 'Chelan County PUD',
  CISO: 'CAISO (California ISO)',
  CPLE: 'Duke Energy Progress East',
  CPLW: 'Duke Energy Progress West',
  DEAA: 'Arlington Valley',
  DOPD: 'Douglas County PUD',
  DUK: 'Duke Energy Carolinas',
  EEI: 'Electric Energy, Inc.',
  EPE: 'El Paso Electric',
  ERCO: 'ERCOT (Texas)',
  FMPP: 'Florida Municipal Power Pool',
  FPC: 'Duke Energy Florida',
  FPL: 'Florida Power & Light',
  GCPD: 'Grant County PUD',
  GLHB: 'GridLiance',
  GRID: 'Gridforce Energy Management',
  GRIF: 'Griffith Energy',
  GVL: 'Gainesville Regional Utilities',
  GWA: 'NaturEner Power Watch',
  HGMA: 'New Harquahala Generating Company',
  HST: 'City of Homestead',
  IID: 'Imperial Irrigation District',
  IPCO: 'Idaho Power',
  ISNE: 'ISO New England',
  JEA: 'JEA',
  LDWP: 'Los Angeles Department of Water and Power',
  LGEE: 'LG&E and KU',
  MISO: 'MISO (Midcontinent ISO)',
  NEVP: 'Nevada Power',
  NSB: 'New Smyrna Beach Utilities',
  NWMT: 'NorthWestern Energy',
  NYIS: 'NYISO (New York ISO)',
  PACE: 'PacifiCorp East',
  PACW: 'PacifiCorp West',
  PGE: 'Portland General Electric',
  PJM: 'PJM Interconnection',
  PNM: 'Public Service Company of New Mexico',
  PSCO: 'Public Service Company of Colorado',
  PSEI: 'Puget Sound Energy',
  SC: 'Santee Cooper',
  SCEG: 'Dominion Energy South Carolina',
  SCL: 'Seattle City Light',
  SEC: 'Seminole Electric Cooperative',
  SEPA: 'Southeastern Power Administration',
  SIKE: 'Sikeston Board of Municipal Utilities',
  SOCO: 'Southern Company',
  SPA: 'Southwestern Power Administration',
  SRP: 'Salt River Project',
  SWPP: 'SPP (Southwest Power Pool)',
  SWPW: 'SPP West',
  TAL: 'City of Tallahassee',
  TEC: 'Tampa Electric',
  TEPC: 'Tucson Electric Power',
  TIDC: 'Turlock Irrigation District',
  TPWR: 'Tacoma Power',
  TVA: 'Tennessee Valley Authority',
  WACM: 'WAPA Rocky Mountain',
  WALC: 'WAPA Desert Southwest',
  WAUW: 'WAPA Upper Great Plains West',
  WWA: 'NaturEner Wind Watch',
  YAD: 'Alcoa Power Generating (Yadkin)',
};

/** Code → name, the regions first, then the authorities by name. */
export const EIA_REGIONS = Object.fromEntries([
  ...Object.entries(EIA_AREAS),
  ...Object.entries(EIA_AUTHORITIES).sort(([, a], [, b]) => a.localeCompare(b, 'en')),
]);

export const EIA_REGION_CODES = Object.keys(EIA_REGIONS);

/** "ERCOT (Texas) · ERCO", the label of the options. */
export const eiaLabel = (code) => `${EIA_REGIONS[code]} · ${code}`;
