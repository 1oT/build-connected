# Build Connected

Static Astro site for the Build Connected video series, deployed to GitHub
Pages at <https://build.1ot.com>.

## Run locally

```sh
nvm use
npm ci
npm run dev
```

Open <http://127.0.0.1:4321>.

## Production build

```sh
npm run build
```

The production output is generated in `dist/`. Do not commit `dist/` or
`node_modules/`.

## Content

Episode content lives in `src/data/episodes.yaml`. Official YouTube IDs are
already present. Set an episode's `videoAvailable` value to `true` only when it
should become playable; until then the page displays its exact premiere date.

Background videos and posters live in `public/media/`. Background videos are
decorative, muted, and subject to reduced-motion and data-saving behavior.

## Deployment

Pushes to `main` deploy through `.github/workflows/deploy.yml`. See
[`HANDOVER.md`](./HANDOVER.md) for the complete GitHub Pages, DNS, release, and
rollback procedure.
