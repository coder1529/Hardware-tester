# Bench

A hardware tester that runs in a browser tab. Keyboard, mouse, display,
speakers, mic, camera, gamepad, touch/pen, plus a system readout and a
printable test sheet that collects your pass/fail notes.

No build step, no dependencies. Plain HTML/CSS/JS.

## Running it

Double-clicking `index.html` mostly works. Camera, mic and the CPU test are
happier on localhost, so:

```
python3 -m http.server 5179
```

then open http://localhost:5179

## Layout

```
index.html
css/bench.css          everything visual, light + dark
js/core.js             helpers: h(), storage, scope (cleanup), canvas fit
js/app.js              rail, hash routing, verdict bar, theme
js/modules/*.js        one file per test, each calls Bench.register({...})
```

Adding a test: copy any module, give it a new `id` and `num`, add the
`<script>` tag to index.html. `mount(root, scope)` gets a scope; register
listeners/loops through it and they're torn down when you leave the page.

## Things that look like bugs but aren't

- macOS Caps Lock: keydown on, keyup off. One press looks like half a press.
- Polling rate reads ~60/120 Hz in Safari and Firefox. They coalesce to frames.
- Gamepads don't appear until you press a button (browser privacy rule).
- `deviceMemory` caps at 8 GB in some browsers and rounds in all of them.

Results live in localStorage under `bench.rev-c`. Nothing leaves the machine.
