# EDUNOJECH

A NERDC-aligned scheme of work, lesson plan, and lesson note generator for Nigerian teachers — installable as an app on Android, iPhone, and Windows, and discoverable via search engines.

## How to publish EDUNOJECH (step by step, free)

1. Get an Anthropic API key at console.anthropic.com.
2. Connect this repo to Cloudflare Pages (pages.cloudflare.com) — free, no card needed.
   - Build command: `npm run build`
   - Output directory: `dist`
3. In Cloudflare Pages → Settings → Environment Variables, add `ANTHROPIC_API_KEY` as a Secret with your key.
4. Update the placeholder URL (`edunojech.pages.dev`) in `index.html`, `public/robots.txt`, and `public/sitemap.xml` if your real URL is different, then push the change.
5. Open the live URL on Android, iPhone, and Windows to confirm Install works and lessons generate.
6. Submit the site + sitemap at search.google.com/search-console to get found on Google.
