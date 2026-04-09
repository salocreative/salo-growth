# Salo Growth Presentation

Static presentation page powered by a Google Sheet data source.

## Local preview

Use any static server from the project root:

- `python3 -m http.server 8000`
- Open `http://localhost:8000`

## Deploy to Cloudflare Pages

1. Push this repository to GitHub.
2. In Cloudflare Dashboard, go to **Workers & Pages** -> **Create** -> **Pages** -> **Connect to Git**.
3. Select this repo.
4. Build settings:
   - Framework preset: `None`
   - Build command: *(leave empty)*
   - Build output directory: `/`
5. Deploy.

## Protect with Cloudflare Access

1. Open Cloudflare **Zero Trust**.
2. Go to **Access** -> **Applications** -> **Add application**.
3. Choose **Self-hosted** and enter your Pages domain.
4. Create an **Allow** policy for your team emails or SSO group.
5. Save and test in an incognito window.

## Data source

The app reads data live from this Google Sheet:

- `https://docs.google.com/spreadsheets/d/1AlFfgJNvyJEGAJ_-XOY4Qtvq94lnVTcWNsf9bwkD7S0/edit?usp=sharing`

Make sure the sheet remains viewable by link so the browser can load chart data.
