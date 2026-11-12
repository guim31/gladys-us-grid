# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.1.0] - 2026-11-12

### Added

- Every US power grid, hourly, through the open data of the EIA (U.S. Energy
  Information Administration), with a free API key: one device per grid
  followed (about seventy balancing authorities and EIA regions, such as
  ERCOT, PJM, MISO, SPP, CAISO, ISO New England, TVA, Southeast, Florida),
  with the demand, the forecast of the hour in progress, the peak forecast of
  the next 24 hours, the low-carbon and renewable shares, the estimated CO₂,
  the share of gas, coal, nuclear, wind, solar, hydro and other sources, and
  the time of the figures (the EIA is one to eight hours late, without
  price). One grouped read an hour. Without a key, NYISO alone, as before.
- The test action also checks the EIA; the Configuration screen says when
  the EIA key is missing or refused.

### Changed

- The integration is now named "US Power Grids".

## [1.0.0] - 2026-11-09

### Added

- The New York power grid (NYISO) live, from its public files, no account:
  load, estimated CO₂ intensity, low-carbon and renewable shares, the share of
  each fuel category, and a one-sentence summary.
- One device per price zone followed (eleven NYISO zones): real-time price in
  $/MWh and zone load.
- Scene triggers: price above or below a threshold, negative price, low-carbon
  share above a threshold, once per crossing.
- A dashboard widget: the price of a zone, low-carbon share, CO₂, load, a
  24-hour chart and the fuel mix as bars.
- A "Test the connection to NYISO" action.
- Texts, feature names and documentation in English, French, German and
  Spanish.

[Unreleased]: https://github.com/guim31/gladys-us-grid/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/guim31/gladys-us-grid/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/guim31/gladys-us-grid/releases/tag/v1.0.0
