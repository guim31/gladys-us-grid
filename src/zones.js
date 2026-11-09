// -----------------------------------------------------------------------------
// The eleven load zones of the New York control area (NYCA), the price zones
// of the NYISO real-time market. A zone is keyed by its PTID, the number NYISO
// gives it: stable, unlike the name ("N.Y.C.", "HUD VL"). The PTID is the
// platform id of the zone devices and the value of the zone options of the
// manifest (configuration, triggers, widget): never change one.
//
// The NYISO price files also carry the external proxies (H Q, NPX, O H, PJM):
// they are not load zones, nobody in New York pays them, they are ignored.
// -----------------------------------------------------------------------------

/** PTID → NYISO name, letter, and the name shown (the same in every language). */
export const ZONES = {
  61752: { nyiso: 'WEST', letter: 'A', name: 'West' },
  61753: { nyiso: 'GENESE', letter: 'B', name: 'Genesee' },
  61754: { nyiso: 'CENTRL', letter: 'C', name: 'Central' },
  61755: { nyiso: 'NORTH', letter: 'D', name: 'North' },
  61756: { nyiso: 'MHK VL', letter: 'E', name: 'Mohawk Valley' },
  61757: { nyiso: 'CAPITL', letter: 'F', name: 'Capital' },
  61758: { nyiso: 'HUD VL', letter: 'G', name: 'Hudson Valley' },
  61759: { nyiso: 'MILLWD', letter: 'H', name: 'Millwood' },
  61760: { nyiso: 'DUNWOD', letter: 'I', name: 'Dunwoodie' },
  61761: { nyiso: 'N.Y.C.', letter: 'J', name: 'New York City' },
  61762: { nyiso: 'LONGIL', letter: 'K', name: 'Long Island' },
};

export const ZONE_IDS = Object.keys(ZONES);

/** The zone the widget shows when its setting is empty. */
export const DEFAULT_ZONE = '61761';

/** "New York City (J)". */
export const zoneLabel = (ptid) => `${ZONES[ptid].name} (${ZONES[ptid].letter})`;
