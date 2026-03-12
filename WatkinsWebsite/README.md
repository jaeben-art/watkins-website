# Watkins Website Scaffold

This is a static website scaffold for Watkins Shared Adventures.

## Connected Data

Trip data is loaded from the same Google Apps Script endpoint used in the mobile app.

- File: `assets/js/api.js`
- Route: `?route=trips`

## Pages

- `/` Home (shows featured trips)
- `/trips/` Bus trips listing (dynamic)
- `/trips/{slug}` Trip details (dynamic via Netlify rewrite to `/trip.html`)
- `/faq/` FAQ placeholder (static)
- `/contact/` Contact placeholder (static)
- `/terms/` Terms placeholder (static)

## Deploy

1. Push this folder to your GitHub repo.
2. In Netlify, set publish directory to `/` (root of this folder).
3. Netlify reads `netlify.toml` + `_redirects` for dynamic trip route rewrites.

## Next Steps

- Add FAQ and Contact fields to the JSON export, then wire those pages to dynamic data.
- Add form handling and lead capture.
- Replace placeholder copy with final business content.

