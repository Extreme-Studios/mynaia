# Hero assets and manual Google Flow workflow

The two poster files are regenerated AI stills based on the supplied Tavus Anna Casual and Dr. Paws screenshot references. They are not original official Tavus source images. Built-in imagegen was used; no external video generation has been run. Inspect likeness before generation in Flow.

## Ready reference images

- ../../app/frontend/assets/hero/naia-hero-poster.png
- ../../app/frontend/assets/hero/dr-paws-hero-poster.png

Both are 1086x1448 PNG portrait references, with a complete head/ears and no UI/text. They replace the interim low-resolution crops. The imagegen brief preserves reference face/fur proportions, hair, jacket/coat, expression and room, regenerates sharp skin/fur detail, and frames a warm cinematic medium close-up in 3:4. The source crop is not upscaled and presented as an original photo.

## Asset contract

Put assets in app/frontend/assets/hero/:

| Character | Required poster | Optional videos |
| --- | --- | --- |
| Naia | naia-hero-poster.png | naia-hero-loop.webm, naia-hero-loop.mp4 |
| Dr. Paws | dr-paws-hero-poster.png | dr-paws-hero-loop.webm, dr-paws-hero-loop.mp4 |

Keep filenames unchanged. PNG is the current poster contract. Upload the corresponding poster in Google Flow as the image reference, paste the corresponding prompt, then generate manually. A 6-8 second portrait loop matching 3:4 is preferred. If Flow exports a wider frame, keep the whole face centered with generous headroom so the site can crop safely; check the output before replacing assets. Do not bake words or branding into the video. Export without audio (or remove audio locally); the player always mutes.

The prompts are naia-hero-prompt.md and dr-paws-hero-prompt.md. Do not generate a new face from text alone. Use the supplied reference. Reference framing/style should remain consistent across both posters and videos.

## Site behavior

Posters only: both character zones and precall render immediately. Missing optional video files generate no video requests and no 404 errors. Posters stay visible under the video layer.

Posters plus videos: npm run build discovers exact optional filenames and writes public/assets/hero/manifest.json. Browser adds only present video sources, prefers WebM then MP4, and fades to the loop after loadeddata. Loading, blocked autoplay, invalid/failed video, or manifest failure retain the poster. Reduced motion uses the poster. Hidden pages and active calls pause the videos and hide the decorative layer. Failed video does not get automatic playback retries.

## Replacing assets

1. Replace the source files above. Keep backup masters outside the deployed asset folder if desired.
2. Run npm run check, npm test, npm run build.
3. Commit and deploy the same Vercel project. Files dropped locally are discovered at build/deploy time, not remotely uploaded automatically.
4. Bump frontend release query/cache version when changing assets to refresh existing clients. Current patch is release 20.
5. Check Home and both precall modes on desktop/mobile for complete face/ears and readable actions. Do not start a Tavus call for decorative asset QA.

These hero videos only decorate Home/precall. They never replace Tavus live face/video or change PAL identity, memory, profiles, authentication, transcript flow, or conversation minutes.
