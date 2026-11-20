# Changelog

All notable changes to this site are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions
[Semantic Versioning](https://semver.org/).

## [1.3.6] - 2026-11-20

### Fixed

- The glass no longer reflects in hard-edged triangles. Since 1.3.5 the roof glass, the windscreen and
  the door windows showed sharp wedges and streaks in their reflections: the correction that cleaned
  up the glass's black edge band also flattened the shading of the clear glass around it, which is
  drawn with much larger triangles. It now applies to the band's small triangles alone, and the clear
  glass reflects in one smooth curve again.

## [1.3.5] - 2026-11-20

### Fixed

- The windscreen's black edge band no longer shows jagged pale patches: each pane keeps the detail of
  its band, and its distance to the edge is read again after the simplification for the web.
- The glass's black edges no longer look beaded, like a zipper, by the door mirrors, along the door
  windows' tops and beside the windscreen's pillars. Some points along a pane's edge took the light of
  the pane's other side, so the shading flipped within each small triangle; every point now takes the
  light of its own side.
- The cabin floor is a moulded carpet under the mats, with a visible pile, instead of a flat sheet.
- The rear seat belts lie over the seats' shoulders down to their anchors instead of hanging in the
  air, and the rear seats' channels are as even as the front's.
- The bonnet opens before the camera turns to the engine bay, so it no longer hides the engine.
- The rear seats are shaped round the rear wheel arches, as real ones are, instead of passing through
  the arches' linings, and their belts follow them.
- The engine's moving parts clear each other: the pistons no longer reach the crankshaft's
  counterweights or a solid block at the top of their bores, the jets that cool them stand outside
  their stroke, and the rear turbo's inlet elbow joins its housing in one piece.
- The defroster panel on the dash has an even rounded edge. Its ends were pinched in by 25 mm.
- Thin folds no longer catch the light of their other side, which showed as dark or pale flecks on the
  door pockets, the seals, the arch linings and the engine's head. The cabin's file is about 375 KB
  heavier for it; the body's is 19 KB lighter.

## [1.3.4] - 2026-11-18

### Fixed

- The rear quarter panels no longer show crumpled shading between the rear doors and the wheel
  arches. The simplification that lightens the car for the web had left each of them too few points
  to carry the soft shadow of the rear wheel; they are now kept whole on large screens (2 % more
  triangles in the car's body), and phones keep three times more of them than before.

## [1.3.3] - 2026-11-18

### Fixed

- The thin black line behind the rear tyres is gone. The modifier that gives each body panel its
  thickness threw a few points off the rear bumper and the rear quarter panels, where their edges fold
  under (one of them 12 cm off the bumper), and the simplification that lightens the car for the web
  stretched them into a sliver 20 cm long, read edge-on as a line beside the tyre. The export now puts
  those points back onto their panel, so the simplification has nothing to stretch.
- The windows no longer look crumpled. The glass, the gloss black trims, the chrome and the lamp
  lenses showed the facets of their web simplification in their reflections; they now keep their
  original smooth shading, at the same triangle count. The cabin and the engine are unchanged.

## [1.3.2] - 2026-11-18

### Fixed

- The car is rebuilt from the latest generators. Every part's doubled vertices are merged, so the
  honeycomb grilles' cells close and the gear selector's base ring loses its dark smears; the lettering
  on the plates, the doors' scripts and the tyres is welded; the engine bay's aprons now face the bay,
  so the light falls on them the right way. The car's shape and materials do not change. The exterior
  is 43 KB lighter, the phone's exterior 39 KB heavier and the wheels 38 KB heavier.

## [1.3.1] - 2026-11-17

### Fixed

- The loader's bar now fills as the car's file arrives on the live site too. GitHub Pages sends the
  file compressed, so its length is the compressed one: the bar stood at 10 % for the whole download,
  then jumped. It now counts the bytes as they come out against the file's known size, and the site's
  build refuses to run if that size ever stops matching the file.
- A slow connection no longer drops the visitor to the page without 3D while the car is still coming:
  every byte, and every file of the scene's code, now counts as the loading moving (a 1.1 Mbit/s visit
  took 24 s and came live). The bar also moves while that code loads, instead of waiting at 0 %.
  The page waits 30 s for a sign while that code comes (its biggest file gives none until it lands),
  12 s once the car's file is coming, and a minute and a half in all.

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
