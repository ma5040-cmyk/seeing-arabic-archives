# Media

Place final files here:

- `opening.mp3` — subtle opening cue
- `ambience.mp3` — room ambience
- `*.mp4` or `*.webm` — local small-screen media

GitHub Pages and hosting: keep each file under roughly 15 MB when practical.
Videos start muted when the café is reached and loop without audio.

To add a video to a screen:

1. Copy the file into this folder. Prefer H.264 MP4 (1080p, `yuv420p`, no audio, `+faststart`) or VP9 WebM; remote files must allow cross-origin requests.
2. Add an item to the `pool` array in `data/screens.json` with a unique `id`, `type` (`video` or `image`), title/date/archive fields, and `src`, for example `"src": "./media/my-clip.mp4"`.
3. Pin it by setting a `smallScreens` entry’s `pin` to the item id, for example `{ "name": "SCREEN_02", "pin": "my-clip", "url": "" }`. Leave `pin` empty to let the café cycle through the pool every 12 seconds.
4. For an image set `type` to `image` and point `src` to a local `.jpg`, `.png`, or `.webp`. Save the JSON and reload `http://localhost:8000/#cafe`.
