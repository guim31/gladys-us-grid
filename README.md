# US Power Grids for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration: the New York power grid
live, from the public files of [NYISO](https://www.nyiso.com), the operator of the New York State
grid, no account, no key; and every US grid hourly through the open data of the
[EIA](https://www.eia.gov/opendata/) (U.S. Energy Information Administration), with a free key.

> Developed without an electricity account in the US (the data is public): feedback welcome on the
> [Gladys forum](https://community.gladysassistant.com).

## Features

- **New York power grid** device: load of the State, estimated CO₂ intensity, low-carbon and
  renewable shares, the share of each NYISO fuel category (dual fuel, natural gas, nuclear, other
  fossil fuels, other renewables, wind, hydro), and a one-sentence summary.
- One device per **price zone** followed (the eleven NYISO load zones, West to Long Island): the
  real-time price (LBMP, $/MWh, five-minute interval) and the load of the zone.
- **Scene triggers**: price above or below a threshold, negative price, low-carbon share above a
  threshold. Once per crossing, with a re-arm margin, remembered across restarts.
- **Dashboard widget**: the price of a zone, low-carbon share, CO₂, load, a 24-hour chart and the
  fuel mix as bars; the chart and the mix can be hidden.
- One device per **EIA grid** followed (about seventy balancing authorities and EIA regions:
  ERCOT, PJM, MISO, SPP, CAISO, ISO New England, TVA, Southeast, Northwest, Florida…), with a
  free EIA key: demand, forecast of the hour in progress, peak forecast of the next 24 hours,
  low-carbon and renewable shares, estimated CO₂, the share of gas, coal, nuclear, wind, solar,
  hydro and other sources, and the time of the figures. Hourly, one to eight hours late, no price.
- A **Test the connection to NYISO and the EIA** action.
- English, French, German and Spanish.

**The prices are wholesale prices**, not your electricity rate.

## Requirements

- Gladys Assistant 5.3.0 or later.
- Internet access from Gladys to `mis.nyiso.com` (and `api.eia.gov` for the EIA grids).
- For the EIA grids only: a free API key, asked on
  [eia.gov/opendata](https://www.eia.gov/opendata/register.php) with an e-mail address.

## Installation

In Gladys: **Integrations → Install from GitHub**, then the address of this repository,
`https://github.com/guim31/gladys-us-grid`. Pick your price zones in the configuration, then add
the devices from the Discovery tab. User documentation: [`docs/en.md`](docs/en.md)
([fr](docs/fr.md), [de](docs/de.md), [es](docs/es.md)).

## How it works

Every five minutes, only while something uses them (a device, a trigger threshold, the widget),
the container reads three public CSV files of NYISO:

| File                                  | Content                                                |
| ------------------------------------- | ------------------------------------------------------ |
| `realtime/realtime_zone_lbmp.csv`     | real-time price of every zone, current interval (1 KB) |
| `csv/rtfuelmix/YYYYMMDDrtfuelmix.csv` | generation by fuel category, the day                   |
| `csv/pal/YYYYMMDDpal.csv`             | actual load of every zone, the day                     |

Times are New York times: the daily files say EST or EDT on each row, the current price file is
read at the offset of its date (the fall-back hour as the reading nearest to now). The daily file
is the one of the date in New York; just after midnight, the file of the day before. Only the
latest complete interval is used, never a forecast row. A price older than 30 minutes, or a mix or
load older than an hour, is not published (no value rather than a stale one).

The CO₂ intensity is an **estimate**: the generation of each category times its lifecycle emission
factor (IPCC AR5 2014 medians, the defaults of Electricity Maps; gas and dual fuel 490 g/kWh, other
fossil fuels 650, other renewables 230, hydro 24, nuclear 12, wind 11). Imports are not counted.

### The EIA grids

Form EIA-930 (Hourly Electric Grid Monitor), through the API v2 of the EIA:
`/v2/electricity/rto/region-data` (demand `D`, day-ahead forecast `DF`) and `fuel-type-data`
(net generation by source). Once an hour, the container sends **one grouped request per dataset**
for every grid followed (paged past 5,000 rows), only while an EIA device is added, plus one read
when the key or the grids change, to check them (a configuration saved again within five minutes
is not read again). Periods are UTC
hours stamped with the end of the hour. The demand comes about an hour late, the fuel mix four to
eight hours late (more for some small authorities), hence the "Data time" feature. A demand older
than 6 hours or a mix older than 24 hours is not published. The forecasts are worked out at each
publication from the last read (the hour in progress, the highest hour of the next 24). Same
emission factors, plus coal 820, solar 45, geothermal 38, oil 650 and 700 for "other"; battery and
pumped storage are left out. The EIA publishes no hourly price. Without a key, NYISO alone; the key
is never logged.

## Other US grids

- All of them hourly through the EIA (above).
- California in real time: the [CAISO integration](https://github.com/LM1LC3N7/gladys-caiso) by
  LM1LC3N7.
- ISO New England: the CSV downloads of ISO Express answer 403 without a browser session, and
  the JSON the website uses is an internal endpoint; the documented web services need an account.
- MISO (the former public API answers "no data" and points to a keyed API), PJM (Data Miner needs
  a key), SPP (no answer), ERCOT (bot protection, API with an account): no open source, not
  offered in real time. Checked on 2026-11-07.

## Limitations

- Wholesale prices, not a retail rate.
- Generation shares are those of the generation inside New York: imports are not in the NYISO
  fuel mix.
- No NYISO quota is published for these files; the integration keeps to one read of each file every
  five minutes, with an honest User-Agent.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and real NYISO answers recorded on 2026-11-07
(`test/fixtures/`), never the network. See [`CLAUDE.md`](CLAUDE.md) for the project rules.
Versions, images and releases belong to the Release workflow (Actions → Release).

## Credits

- [NYISO](https://www.nyiso.com): the public market and operations data of
  [mis.nyiso.com](https://mis.nyiso.com/public/).
- [EIA](https://www.eia.gov/opendata/): Form EIA-930, Hourly Electric Grid Monitor, public domain.
- Emission factors: IPCC AR5 (2014), as used by [Electricity Maps](https://www.electricitymaps.com).
- The architecture, the conformity and language tests follow
  [gladys-rte](https://github.com/guim31/gladys-rte) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by NYISO (New York Independent System
Operator) nor by the U.S. Energy Information Administration (EIA). The NYISO logo on the cover belongs to NYISO.

## License

Apache-2.0
