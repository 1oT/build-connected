# Build Connected — GitHub Pages handover

This repository is ready to publish as a static Astro site at
<https://build.1ot.com> using GitHub Actions and GitHub Pages.

## What is already configured

- Production URL: `https://build.1ot.com` in `astro.config.mjs`
- Static build output: `dist/`
- Deployment workflow: `.github/workflows/deploy.yml`
- Custom-domain marker: `public/CNAME`
- Reproducible dependency install: `package-lock.json`
- Node version: `.nvmrc` (Node 24)
- Search-engine endpoints: `/robots.txt` and `/sitemap.xml`
- Google Tag Manager container: `GTM-TRCWGKBV`

The generated `dist/` directory and `node_modules/` must not be committed. The
GitHub Actions workflow builds `dist/` on every deployment.

## 1. Create and push the GitHub repository

Create an empty repository in the intended GitHub organization. Do not add a
README, license, or `.gitignore` in GitHub because all required source files are
already included here.

From the extracted handover folder:

```sh
git init
git branch -M main
git add .
git commit -m "Initial Build Connected site"
git remote add origin git@github.com:<GITHUB_OWNER>/<REPOSITORY>.git
git push -u origin main
```

Replace `<GITHUB_OWNER>` and `<REPOSITORY>` with the actual organization/user
and repository names.

## 2. Enable GitHub Pages

In the repository:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Open **Actions** and confirm that **Deploy to GitHub Pages** completes.

The workflow runs automatically on each push to `main`, and it can also be run
manually from **Actions → Deploy to GitHub Pages → Run workflow**.

## 3. Connect `build.1ot.com`

Do these in order:

1. In **Settings → Pages → Custom domain**, enter `build.1ot.com` and save it.
2. At the DNS provider for `1ot.com`, add or update this record:

   | Type | Name/host | Target/value |
   | --- | --- | --- |
   | CNAME | `build` | `<GITHUB_OWNER>.github.io` |

   The target is the GitHub organization or user Pages hostname. Do not append
   the repository name.
3. Wait for GitHub's DNS check to pass. DNS propagation can take up to 24 hours.
4. Enable **Enforce HTTPS** in **Settings → Pages** once GitHub makes it available.

Recommended security step: verify the `1ot.com` domain in the GitHub
organization's Pages settings before publishing. Avoid wildcard DNS records.

Verify the public DNS record from a terminal:

```sh
dig build.1ot.com CNAME +short
```

The answer should be `<GITHUB_OWNER>.github.io.`

`public/CNAME` is included for portability and to document the intended domain,
but the custom domain must still be configured in **Settings → Pages**.

## 4. Local development and validation

```sh
nvm use
npm ci
npm run dev
```

Open <http://127.0.0.1:4321>.

Before merging a change:

```sh
npm run build
```

After deployment, smoke-test:

- `https://build.1ot.com/`
- `/sensoneo/`
- `/teledyne/`
- `/hiber/`
- `/starship-technologies/`
- `/robots.txt`
- `/sitemap.xml`
- the teaser playback and YouTube link
- the four upcoming-episode states and premiere dates
- the CookieHub consent banner and Google Tag Manager in a clean browser session

## 5. Episode release procedure

Official YouTube IDs are already stored in `src/data/episodes.yaml`. Episodes
1–4 remain intentionally unavailable until release because each has:

```yaml
videoAvailable: false
```

On an episode's premiere date, change only that episode to:

```yaml
videoAvailable: true
```

Then run `npm run build`, commit, and push to `main`. The page will switch from
“Coming soon” to the working play action without changing the premiere date.

Current release schedule:

| Item | Slug | Premiere | YouTube ID |
| --- | --- | --- | --- |
| Teaser | `/` | 2026-09-03 | `HsV8BcBzDSo` |
| Episode 01 — Sensoneo | `/sensoneo/` | 2026-09-10 | `w3-vnAZ69pE` |
| Episode 02 — Teledyne | `/teledyne/` | 2026-09-17 | `RNL42_aqQrQ` |
| Episode 03 — Hiber | `/hiber/` | 2026-09-24 | `T26221nzi70` |
| Episode 04 — Starship Technologies | `/starship-technologies/` | 2026-10-01 | `cuwN23R8SUU` |

## 6. Rollback

Revert the problematic commit on `main` and push the revert. The same workflow
will redeploy the last known-good source. GitHub's Actions log is the deployment
audit trail.

## Ownership still required from the engineer

- The final GitHub organization/user and repository name
- Permission to configure GitHub Pages and the custom domain
- DNS access for the `build.1ot.com` CNAME
- Confirmation that GitHub Actions are allowed by the organization policy
