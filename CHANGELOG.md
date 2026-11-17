# Changelog

All notable changes to this site are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions
[Semantic Versioning](https://semver.org/).

## [1.3.0] - 2026-11-17

### Added

- A loader for the first visit. A visitor who scrolls before the car is ready is held at the top while
  it loads, with its real progress (the car's file, then the engine starting) at the foot of the screen
  and a way to the page without 3D; the drift then starts from the top. Before, the page scrolled on
  past a still car and the drift began half way down. A visitor who takes a moment before scrolling
  rarely sees it, and nothing changes for one who only looks.

### Changed

- The page gives up on the 3D scene when its loading stops moving for 12 s, or after a minute, instead
  of after a flat 8 s, which a slow first visit could pass while the car was still coming.

## [1.2.0] - 2026-11-17

### Added

- The Nacre interior, the store kits' 100,000-euro trim, now dresses the landing's car: pearl Nappa
  bolsters; dark microfibre on the dash, the steering wheel's rim and the inserts, which are
  perforated; contrast stitching. The wool blends and the other Nappa leathers stay as options.
- Carbon twill inlays under a full gloss coat, the landing's choice; the woods and the brushed
  aluminium stay as options.
- In the cabin: the steering wheel's key labels, lit vanity mirrors in the sun visors, the passenger
  airbag's key switch and its telltale in the roof console, the 12 V socket's cap.

### Changed

- The steering wheel sits 80 mm lower with its column, stalks and paddles, so the display reads
  above its rim from the driver's seat; its flat bottom rises 20 mm.
- The pedals, the footrest and the heel pad move 100 mm forward into a deeper footwell, with a longer
  driver's mat: room for tall drivers' legs. The engine bay's apron is notched to clear it.
- The seats' heads are closed in leather and their cushions' fronts rounded off; the rear mats are
  cut round the seat rails.
- The landing's car now totals €101,500 (Nacre +€2,200, carbon twill +€1,200).
- On a wide screen, the cabin's dock stays as narrow as the exterior's with five trims and six inlays:
  each trim gives its price a line of its own, and the inlays sit in two rows of three.

## [1.1.0] - 2026-11-16

### Changed

- The Six's straight-six in full detail, the same engine as its store kit: an open valve train (two
  camshafts, 24 valves, springs and roller followers), the timing chain, bladed turbo wheels, direct
  injection, the oil and cooling circuits, heat shields, the harness and the bolts. Its cover sits
  80 mm under the bonnet, and its notes point at the camshafts and the middle piston. The file grows
  from 1.6 to 2.8 MB and still loads only when the visitor heads for the configurators.

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
