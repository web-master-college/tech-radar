# Tech Radar

A fixed Hebrew (RTL) daily briefing. The page loads `articles.json` in the browser and draws one card per article. A content update changes that file only. The layout, styles, and scripts stay as they are.

## Layout

| Path | Role |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The page. Text from the data file is inserted with `textContent`, never as HTML. |
| `format.js`, `links.js` | Date formatting (Asia/Jerusalem) and https link checks, shared by the page and the validator. |
| `articles.json` | The only file a daily update should edit. |
| `schema/articles.schema.json` | JSON Schema for that file. |
| `scripts/validate-articles.mjs` | Checks the schema, real calendar dates, https URLs, and duplicate links. |
| `scripts/briefing.test.mjs` | Tests for those rules and for safe rendering. |
| `.github/workflows/validate.yml` | Runs the tests and the validator on pull requests. |
| `.github/workflows/deploy-pages.yml` | On a push to `main`, validates again and then deploys with the official GitHub Pages actions. |
| `fonts/` | Self-hosted Heebo and Frank Ruhl Libre (SIL Open Font License, see `fonts/OFL.txt`). |
| `assets/topics/` | Original illustrations for the three topics, plus a neutral fallback. |

## Data format

`articles.json` is one object:

| Field | Required | Meaning |
| --- | --- | --- |
| `updatedAt` | yes | RFC 3339 date-time with a timezone, such as `2026-10-22T08:30:00+03:00`. Shown in Hebrew, Asia/Jerusalem. |
| `articles` | yes | Array of cards, lead story first. `[]` is valid. |
| `title`, `summary`, `source` | yes | Card text. Blank strings are rejected. |
| `publishedAt` | yes | `YYYY-MM-DD`, or a date-time with a timezone. A date-only value is shown without a clock time. |
| `eventAt` | no | Same formats as `publishedAt`. Omit it when there is no separate event. |
| `category` | no | `ai`, `engineering`, or `jobs`. Chooses the default illustration. Omit it for the neutral illustration. |
| `image` | no | `https` image URL. Omit it, together with `imageLicense`, to use the category illustration. |
| `imageLicense` | no | Required with `image`, and only with `image`. One of `cc0`, `cc-by`, `cc-by-sa`, `public-domain`. |
| `url` | yes | `https` link that opens the article. |

Anything else is rejected, including personal fields such as read state, notes, or ratings. Put `null` nowhere: omit optional fields instead.

The page shows `eventAt` when it adds information: the Jerusalem calendar day differs from `publishedAt`, or both values include a time and those instants differ.

Link duplicates are compared after normalization:

1. The scheme must be `https`, with a host and no username or password.
2. The host is lowercased.
3. The fragment (`#...`) is removed.
4. Port `443` is removed.
5. A trailing slash on the path is removed.
6. Query parameters are sorted. They are not stripped, so two links that differ by a query string are different articles.

`https://Example.com/a/` and `https://example.com/a#section` are the same link. `https://example.com/a?b=1&a=2` and `https://example.com/a?a=2&b=1` are the same link.

Dates must be real calendar dates. `2026-02-31` fails. A date-time without a timezone fails, so Jerusalem formatting is unambiguous.

A card shows `image` only when `imageLicense` is one of the licenses above. Otherwise it shows the illustration for `category` (`assets/topics/ai.svg`, `engineering.svg`, or `jobs.svg`). A missing category uses `neutral.svg`. If that file fails to load, the card shows the source monogram.

The example fixture in `scripts/fixtures/sample-articles.json` is labeled example data: titles start with `דוגמה`, and links use `example.com`. The published briefing does not use those entries.

## Data-only update

1. Edit `articles.json` and nothing else.
2. Open a pull request. The **Validate articles** check runs `npm test` and `npm run validate`.
3. Merge to `main` only when that check is green.
4. The deploy workflow validates again. The Pages publish step is skipped when validation fails, so a broken file does not replace the last working site.

No rebuild step reads the articles. The browser fetches `articles.json` next to the page (`cache: no-cache`) on each visit.

## Local preview

```bash
npm install
npm test
npm run validate
npm start
```

Open `http://127.0.0.1:4173`. Fetching the JSON file needs a local server; opening `index.html` from disk will fail the request, and the page shows the load error.

## One-time GitHub setting

The deploy workflow cannot switch this on by itself. Before the first publish:

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.

If workflows do not run, allow them under **Settings → Actions → General**.

The deploy workflow uses `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`, and the `github-pages` environment. It publishes only the staged site (`index.html`, styles, scripts, `articles.json`, the icon, the topic illustrations, and fonts), not the schema or the validator.

The workflow does not change the Pages source. Set **Source** to **GitHub Actions** once, by hand, before the first publish.
