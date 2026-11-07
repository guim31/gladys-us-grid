# NYISO New York Grid

Live figures of the New York power grid in Gladys, from the public files of
NYISO, the operator of the grid of New York State: the real-time price of
each price zone, the load, the generation by fuel, the low-carbon share and
an estimated CO₂ intensity.

Developed without a New York electricity account, the data being public: feedback welcome.
Not affiliated with NYISO.

## What you get

- A **New York power grid** device: load of the State, estimated CO₂
  intensity, low-carbon and renewable shares, the share of each NYISO fuel
  category, and a one-sentence summary.
- One device per **price zone** you follow: its real-time price ($/MWh) and
  its load.
- Four scene triggers (price above, price below, negative price, low-carbon
  share above) and a dashboard widget.

**Prices are wholesale prices** of the NYISO real-time market, not your
electricity rate: your supplier adds delivery, taxes and its margin. They
still show when power is cheap or tight.

## Requirements

- Gladys 5.3.0 or later.
- Internet access from Gladys (the files are read on `mis.nyiso.com`). No
  account, no key.

## Installation

In Gladys, **Integrations → Install from GitHub**, then give the address of
the repository: `https://github.com/guim31/gladys-us-grid`.

## Configuration

1. **Price zones to follow**: pick your zone(s) among the eleven NYISO load
   zones (West, Genesee, Central, North, Mohawk Valley, Capital, Hudson
   Valley, Millwood, Dunwoodie, New York City, Long Island). Utility bills
   name the zone too; NYISO publishes a map on its site.
2. **Thresholds** (optional), for the triggers: high price and low price in
   $/MWh, low-carbon share in %. Left empty, the trigger stays off.
3. **Language of the names**: the language of the feature names (frozen when
   a device is added), of the summary and of the test message.
4. Save, then add the devices from the **Discovery** tab.

## Devices

### New York power grid

| Feature                     | Unit      | Note                                                                               |
| --------------------------- | --------- | ---------------------------------------------------------------------------------- |
| New York load               | kW        | the whole State (Gladys has no MW unit)                                            |
| CO₂ intensity (estimated)   | g CO₂/kWh | from the fuel mix, see below                                                       |
| Low-carbon share            | %         | nuclear, hydro, wind, other renewables                                             |
| Renewable share             | %         | hydro, wind, other renewables                                                      |
| Share of each fuel category | %         | dual fuel, natural gas, nuclear, other fossil fuels, other renewables, wind, hydro |
| Summary                     | text      | "16.5 GW used, 54 % low-carbon, …"                                                 |

The shares are those of the generation **inside New York**: imports from
neighboring grids are not in the NYISO fuel mix.

### Price zone

`NYISO <zone> (<letter>)`: the **real-time price** of the zone (LBMP, $/MWh,
five-minute interval) and the **load** of the zone (kW).

## Scenes

The triggers watch the zones you follow. Each fires **once per crossing**,
and re-arms when the value has gone back past the threshold by a margin
($5/MWh for the prices, $1 for a negative price, 2 points for the share):
the market crosses a threshold back and forth every five minutes. What is
crossed is kept across a restart.

### NYISO price above the threshold

A followed zone rises above the high price threshold. Filter: zones.
Variables: `zone` (NYISO PTID), `zone_name`, `price`, `threshold`.

### NYISO price below the threshold

A followed zone falls below the low price threshold. Same filter and
variables.

### NYISO negative price

The price of a followed zone turns negative (too much generation, often
wind and hydro at night). Variables: `zone`, `zone_name`, `price`.

### New York grid: low-carbon share high

The low-carbon share rises above its threshold: a good time to run
appliances. Variables: `low_carbon_share`, `renewable_share`,
`carbon_intensity`, `threshold`.

## Dashboard

### New York power grid widget

The price of a zone (setting, New York City by default, no device needed),
the low-carbon share, the estimated CO₂, the load, a 24-hour chart (the
zone's price once its device is added, else the CO₂ of the grid device) and
the fuel mix as bars. The chart and the mix each have a setting to hide them.

## Actions

**Test the connection to NYISO** reads the prices, the fuel mix and the load
now, and answers with the price of your first zone.

## Data and limits

- Source: NYISO public files, every five minutes: real-time zonal prices,
  real-time fuel mix, actual load. NYISO times are New York times (EST or
  EDT); Gladys shows them in its own time zone.
- The integration reads them every five minutes, only when something uses
  them (a device, a threshold, the widget): a few megabytes a day, compressed.
  NYISO states no quota for these public files.
- A figure older than 30 minutes (price) or one hour (mix, load) is never
  published: no value rather than a stale one, never a zero.
- **CO₂ intensity is an estimate**: each fuel category times its lifecycle
  emission factor (IPCC 2014 medians, as Electricity Maps uses): 490 g/kWh
  for gas and dual fuel, 650 for other fossil fuels (oil), 230 for other
  renewables (mostly biomass), 24 hydro, 12 nuclear, 11 wind. Imports are
  not counted.
- Only NYISO for now. California is covered by the
  [CAISO integration](https://github.com/LM1LC3N7/gladys-caiso)
  (gladys-caiso). ISO New England, MISO, SPP, PJM and ERCOT publish no
  open file that can be read without an account or a browser.

## Troubleshooting

- **"The NYISO price file cannot be read"** on the Configuration screen:
  NYISO did not answer; the integration retries every five minutes.
- Nothing in the devices: check that they are added, and use **Test the
  connection to NYISO**.
- Detailed logs: `LOG_LEVEL=debug` on the integration.

## Credits

Data: NYISO (New York Independent System Operator), public market and
operations data. Emission factors: IPCC AR5 (2014), via Electricity Maps.
Code under the Apache 2.0 license. Not affiliated with NYISO.
