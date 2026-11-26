# Aplomb Cordeau

A fictional four-door GT, electric or straight-six, in real-time 3D on the web. The car drifts out of
the page on a wet road and arrives in the showroom; the visitor then configures its paint, wheels,
cabin and energy, and watches it leave as they made it.

**Live:** https://adamrodwebdev.github.io/aplomb-cordeau/

![The Cordeau in Céladon in the showroom, the words Balance, by design behind it](og.jpg)

A portfolio piece by [AdamRodWebTech](https://adamrodwebdev.com). Aplomb and the Cordeau are fictional:
nothing is for sale, no form sends anything, and the prices and figures are illustrations.

## What it shows

- **A story in six chapters:** the road at dawn, the showroom, the exterior, the cabin, the energy and
  the finale. The light follows it: dawn, a white or night studio, the warm workshop for the Six or the
  blue night for the E, then dusk. The paint reflects each one.
- **A configurator inside the scene:** eight paints, three wheel designs and their finishes, calipers
  and brightwork, five interior trims and six inlays (Nappa, microfibre and carbon twill by default),
  the light blade's colour, two energies and their versions. The price rolls like a counter. On a wide screen the choices sit in a compact dock in tabs,
  which folds away to leave the render whole.
- **The straight-six opens** into an exploded view as you scroll, with notes on its parts.
- **For every visitor:** a keyboard table of contents (the plumb line at the edge), light and dark
  themes, reduced motion respected (the page then stacks as bands), no horizontal scroll from 320 to
  2,560 px.

## How it is built

- Plain HTML, CSS and JavaScript modules: no framework and no build step. three.js r186 draws the scene
  (`vendor/three`, MIT licence).
- The car, the cabin and the engine come from our own procedural generators in Blender, exported as
  glTF with meshopt compression. The studio's lights are baked environment maps, decoded on the GPU.
- The first paint is an HTML poster of the scene's first frame; the scene boots when the visitor moves.
  A visitor who scrolls before it is up waits at the top with its real progress, or takes the page
  without 3D.
- Everything is served from this site: no cookies, no trackers, no request to another site. Each page
  carries a Content-Security-Policy with the hashes of its inline scripts.
- Fonts: Aplomb Estoc, by Ressac and licensed to this site only (see its
  [notice](fonts/AplombEstoc-LICENSE.md)), Archivo and Geist Mono (SIL Open Font License 1.1).

## Code map

| Path | What |
|---|---|
| `index.html`, `drift.css` | the page and its styles |
| `js/rules/` | the choreography, the catalogue and its prices: data and pure functions |
| `js/logic/` | the visitor's configuration and the scroll's state |
| `js/design/` | the scene, the configurator's panels, the docks, the index, the notices |
| `environment-*.png`, `poster-*` | the lights and the first frame |
| `assets.lock.json`, `tools/fetch-assets.mjs` | the private files this site copies in, and the script that copies them |
| `.github/workflows/pages.yml` | the deploy to GitHub Pages |
| `legal.html`, `404.html` | the legal notice and privacy page, the missing page |

The site is built from the project's working repository; this repository holds what is published.

## Private files and deployment

**The Aplomb Estoc typeface and the car's five models are not part of this repository.** They are
our own components, kept in a private repository and git-ignored here:
`fonts/AplombEstoc-VF.woff2`, `fonts/AplombEstoc-Fierce.woff2` and `cordeau7-exterior.glb`,
`cordeau7-exterior-phone.glb`, `cordeau7-cabin.glb`, `cordeau7-wheels.glb`,
`cordeau7-engine.glb`. No licence of this repository covers them.

`assets.lock.json` pins the private commit to read and each file's size and SHA-256.
`tools/fetch-assets.mjs` (Node 20 or later, no dependencies) copies the files in, checks each one's
size, SHA-256 and signature (`wOF2` for a font, `glTF` 2 for a model), and stops with the list of
problems when anything is missing or different.

```sh
node tools/fetch-assets.mjs --local     # from a clone of the private repo at ../private-assets
node tools/fetch-assets.mjs --check     # checks the files already in place
```

To change a file: commit it to the private repo and push, then run
`node tools/fetch-assets.mjs --local --relock` in this repository and commit the new
`assets.lock.json`.

**Deployment.** GitHub Actions publishes the site (`.github/workflows/pages.yml`) on every push to
`main`, or by hand from the Actions tab. It checks out the code, copies the private files in with
the read-only secret `PRIVATE_ASSETS_TOKEN` (given to that one step, sent in a header, never
printed), checks them again, then uploads and deploys the site. A missing secret or a file that does
not match the lock stops the deploy, and the site stays as it was. Work goes on `dev`; `main`
only receives a release.

## Credits

- [three.js](https://threejs.org/) (MIT).
- Archivo by Omnibus-Type and Geist Mono by Vercel (SIL Open Font License 1.1).
- The road's sky is derived from "Lenong 2" by [Poly Haven](https://polyhaven.com/) (CC0).

## Licence

All rights reserved: see [LICENSE](LICENSE). The third-party parts keep their own licences.
