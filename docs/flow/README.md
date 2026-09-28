# Google Flow hero assets

The Flow project [MyNaiA Hero Loops](https://flow.google.com/project/0ba84deb-2053-4cd5-9943-5f8b5435e1c6) contains two newly generated reference portraits and one 8-second talking clip per character. References used Nano Banana 2 at zero credits. Both clips used Veo 3.1 Lite, 720p, one generation each, 10 credits each. No retry was run. The clips show decorative talking motion; do not describe them as verified live avatar lip sync or audio.

The four original exports are stored in [MyNaiA Hero Assets on Drive](https://drive.google.com/drive/u/0/folders/1mGxz9JxRLlpDT_YMkFkWtg6Q9zvwqj8z). The editable [My Naia Sheet](https://docs.google.com/spreadsheets/d/1l0wdyL3W3l9a5J3eMfyKtdQ9x-FzXaFu9lTkcmPZ2v0/edit?gid=0#gid=0) contains the published `hero_assets` tab: `key, poster_url, video_url, enabled, version, label`. Only the asset catalog tab is published. The app requests its small CSV and uses its enabled flag and master URL identity to accept each local loop.

Direct `drive.usercontent.google.com` JPG/MP4 embedding was blocked in browser testing by cross-origin media policy. A Node HTTP range request succeeding did not prove browser playback. To keep Vercel use low, local web copies were encoded from the Drive masters:

| Character | Poster | Loop | Combined |
| --- | ---: | ---: | ---: |
| Naia | ~70 KB JPG | ~280 KB MP4 | ~350 KB |
| Dr. Paws | ~70 KB JPG | ~236 KB MP4 | ~306 KB |

The source derivatives live in `app/frontend/assets/hero/`. `scripts/build-web.mjs` copies only those four small files into `public/assets/hero/`, plus a manifest derived from `catalog.json`. The original Flow downloads in `docs/flow/generated/` are ignored by Git and excluded from Vercel. Earlier large PNG posters remain source history and are excluded from Vercel. No Supabase media storage or full media proxy is involved.

The loop video is muted, inline, and pauses when the document is hidden, reduced motion is requested, or a live Tavus call starts. Missing catalog, blocked autoplay, or media error leaves the still poster. The animation does not replace the Tavus live face or alter PAL, memory, profiles, access control, transcript flow, or conversation minutes.

For updates: create/download one reviewed Flow master per character, store it in Drive, update its Sheet row and `catalog.json`, encode the compact JPG/MP4 derivatives with FFmpeg, run `npm run check`, `npm test`, and `npm run build`, then deploy. Do not use automatic generation retries or start Tavus sessions for visual asset QA.
