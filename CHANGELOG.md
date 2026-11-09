# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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
