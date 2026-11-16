# Changelog

All notable changes to this site are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions
[Semantic Versioning](https://semver.org/).

## [1.0.1] - 2026-11-16

### Fixed

- The fonts are declared in the stylesheet, and the two small ones preloaded. Added after the first
  paint, as Google's stylesheet once was, they swapped in late on a real network and slowed the page's
  Speed Index. The legal notice's few rules now sit in the page itself.

## [1.0.0] - 2026-11-16

### Added

- The site goes live on GitHub Pages: the drift landing (the road, the showroom), the configurator in
  the real-time scene (exterior, cabin, energy, finale), the tonal arc, the keyboard table of contents,
  light and dark themes.
- The configurator's docks in tabs, compact on a wide screen and folding away to leave the render whole.
- A notice for test drives and stock (Aplomb is a fictional brand), the legal notice and privacy page,
  and a 404 page.
- Fonts and three.js served with the site, nothing loaded from another site, and a
  Content-Security-Policy on every page.
