# Bench devlog

Notes from building **Bench rev C**, a hardware tester that lives in a browser tab.

---

## The idea

Every "keyboard tester" or "dead pixel test" site I've used does one thing, is
covered in ads, and forgets everything when you close it. I wanted one page that
does the full bench check you'd run on a second-hand laptop before handing over
money. Keys, mouse, screen, speakers, mic, camera, controller, touchscreen. At
the end you get one sheet you can print or paste into a listing.

Ground rules I set at the start:

- **No framework, no build step.** Double-click `index.html` and it runs. A
  hardware tester shouldn't need `npm install`.
- **Nothing leaves the machine.** No analytics, no uploads. Results go to
  `localStorage` and that's it.
- **It shouldn't look like a template.** No purple gradients, no glassy cards,
  no emoji in headings.

---

## Day 1 · Look and skeleton

### Picking a look

The idea was a service manual left open on a workbench: warm paper (`#f3f0e7`),
near-black ink, and one signal-orange accent (`#d4470f`) for anything live or
"needs attention". The background is a faint 24px grid, like engineering paper.

Type is IBM Plex Sans for prose and IBM Plex Mono for anything you'd read off a
meter. Section numbers are big orange mono (`01`, `02`…) and there's a row of
ruler tick marks under each heading. The "rev C" tag in the header is rotated
-3° so it looks like a sticker someone slapped on.

Panels use a fieldset-style label that sits on the top border (`LIVE`, `BOARD`,
`PAD`) instead of a heading inside the card. Buttons have a hard 2px bottom
shadow and physically press down 2px when clicked.

Dark mode was planned from the start. Every colour is a CSS variable, and
canvases read the current palette through `Bench.colors()`, which is cached and
cleared when the theme changes.

### Architecture

Small and boring on purpose:

```
js/core.js         h() hyperscript, storage, scope, canvas helpers
js/app.js          rail, hash routing, verdict bar, theme toggle
js/modules/*.js    one file per test, each calls Bench.register({...})
```

The piece I'm happiest with is **`Bench.scope()`**. Every module gets one in
`mount(root, scope)` and registers listeners, rAF loops, intervals and timeouts
through it. When you navigate away, the app calls `scope.dispose()`. That kills
everything, so the camera light goes off, the mic releases, and audio contexts
close. No module needs its own cleanup bookkeeping.

Routing is just `location.hash`, so `#mouse` is bookmarkable and `[` / `]`
step through tests.

---

## Day 1 · Keyboard (01)

The keyboard drawing is laid out in **key units**. Every key has `x, y, w, h`
in "u" (1u = one letter key). There are three clusters: main block at x=0, nav
cluster at 15.5, numpad at 19. The function row sits half a unit above the rest
like on a real board. Total size is 23u × 6.5u. A `ResizeObserver` sets `--u`
on the container and CSS does `left: calc(var(--x) * var(--u))`, so the whole
board scales with one variable.

What it tracks:

- **Keys tested** out of a total that depends on the layout profile (Full-size
  / TKL / Laptop). Keys outside the profile are drawn dashed and faded so the
  board doesn't change shape.
- **Rollover**, meaning the most keys held at once.
- **Chatter**: the same key pressed again within 40 ms of being released.
  Fingers can't do that, worn switches can. The key flashes red and the log
  entry turns red.
- **Extra keys**: anything with a `code` that isn't on the drawing (volume keys,
  `Lang1`, F13…) shows up as a chip.

Quirks I had to handle:

- **macOS ⌘ swallows keyups.** Hold ⌘, tap A, release both, and A never gets a
  keyup. Without a fix, A stays "held" forever. When ⌘ goes up, I now release
  every non-modifier key.
- **Alt-tab mid-press** leaves keys stuck for the same reason. Fixed by clearing
  everything on window `blur`.
- **Don't eat real shortcuts.** Everything gets `preventDefault()` *except*
  combos with Ctrl/⌘ plus a non-modifier, so reload and devtools still work.

---

## Day 1 · Mouse (02)

The first version used pointer events and was wrong right away. With pointer
events, pressing a second button while the first is held doesn't fire
`pointerdown`, only `pointermove` with a changed `buttons` mask. Switched to
`mousedown`/`mouseup` for button counting.

- **Double-click detection** measures release to next press, per button.
  Default threshold is 60 ms and there's a slider. A deliberate human
  double-click is almost never under ~80 ms.
- **Polling rate** uses `pointerrawupdate` where Chrome has it, which gives the
  actual device rate. Otherwise it falls back to `getCoalescedEvents()`. I use
  the median interval of recent samples, not a count per second, because
  counting is too jumpy.
- The trail on the pad draws an orange dot per sample, so you can *see* the
  polling rate as dot spacing.
- **Back/forward buttons** would change the hash and leave the test. They're
  blocked with `preventDefault` on mousedown/mouseup/auxclick.

**Bug I caused:** my first back/forward blocker also called
`stopPropagation()` in the capture phase. That stopped the pad from ever seeing
buttons 3 and 4, so the test for those buttons couldn't detect them. Removed
it.

---

## Day 1 · Display (03)

Eleven patterns: white, black, R/G/B, mid grey, near-black, gradients, 1px
checker, geometry, motion.

Key decision: the fullscreen canvas is sized to **device pixels with no DPR
transform**, so the 1px checker really is one physical pixel. With normal
retina scaling it would come out as a grey blur, which defeats the point.

- **Gradients**: each band is a smooth ramp on top and 32 hard steps below, so
  you can count where near-black steps merge.
- **Geometry**: a true circle (looks like an egg if something's stretching the
  image), a 1px orange frame on the very edge pixels, and corner blocks for
  overscan.
- **Motion**: three blocks moving at 240 / 480 / 960 px/s for ghosting.

The refresh rate readout is a rolling median of `requestAnimationFrame` deltas.
It snaps to the usual numbers (60, 120, 144, 165…) when within 2.5%, and shows a
frame-time strip chart with late frames in orange.

**Bug:** the motion pattern's speed labels were clipped at the left edge. The
geometry pattern had set `ctx.textAlign = 'center'` and the shared context kept
it. Each pattern now draws inside `save()`/`restore()` with text state reset.

---

## Day 1 · Speakers (04)

One audio graph for the whole module:

```
source → env → (gL, gR) → merger → master → destination
                                          ↘ analyser
```

I drive left/right gains directly instead of using a `StereoPannerNode`, which
makes the polarity test trivial: set `gR = -1`.

- **Channel bursts**: three short blips per side, pink noise by default (easier
  to locate than a sine).
- **Pan L ↔ R**: equal-power curve over 6 seconds via `setValueCurveAtTime`.
  The speaker icons fade with it.
- **Sweep**: exponential 20 Hz → 20 kHz over 16 s.
- **Tone generator**: log-scale slider and four waveforms. Frequency changes use
  `setTargetAtTime` so there are no clicks.
- **Polarity check**: A (in phase) vs B (right inverted). In phase should sound
  solid, inverted should sound hollow. If it's the other way round, a speaker is
  wired backwards.

Pink noise is Paul Kellet's filter, three seconds, looped. The output scope
triggers on a rising zero crossing so a steady tone stands still.

---

## Day 1 · Microphone (05)

Echo cancellation, noise suppression and auto gain are **off by default**. The
point is to hear the mic, not what a call app would make of it. You can turn
them on to compare.

- Level meter (RMS fill plus peak hold that decays after 1.5 s) on a -60…0 dBFS
  scale, with a hatched red zone and a latching CLIP light.
- Waveform draws min/max per pixel column so short spikes don't vanish between
  samples.
- Spectrum on a log frequency axis, 40 Hz to 20 kHz.
- **Noise floor**: the quietest 10% of the first ~4 seconds of frames, graded
  good (< -60 dBFS) / bad (> -45).
- Record 5 s with `MediaRecorder` and auto-play it back.

The mic is deliberately **not** connected to the speakers. Feedback howl is not
a feature.

---

## Day 1 · Camera (06)

The interesting number is **reported fps vs measured fps**. Measured counts real
frames with `requestVideoFrameCallback`. In a dim room many webcams quietly drop
to 15 fps for longer exposure while still claiming 30, and this shows it.

**Bug avoided:** registering the frame callback twice on restart would
double-count frames. There's now an "armed" flag so only one callback chain
exists.

Also: resolution presets, mirror toggle, a rule-of-thirds grid fitted to the
letterboxed video rather than the box, and PNG snapshots (last four kept,
object URLs revoked when dropped).

---

## Day 1 · Gamepad (07)

The SVG controller follows the Gamepad API's "standard" mapping (Xbox layout).
Buttons fill as pressed, triggers fill with their analog value, stick caps move.
Non-standard pads still get the **raw grid** of every button and axis.

- **Stick plots** keep a trace of everywhere the stick has been.
- **Drift**: stick magnitude, but only once it's been near rest for 500 ms, so
  it doesn't report drift while you're moving it.
- **Circularity error**: max radius in 36 angular sectors vs 1.0. It needs 30
  sectors filled before it gives a number.
- Rumble buttons for the strong motor, weak motor and both.

Tested with a mocked `navigator.getGamepads()` since there was no controller on
the desk.

---

## Day 1 · Touch & pen (08)

Two modes. **Draw** gives each pointer its own colour, ID ring and crosshair,
with pen stroke width from pressure. **Coverage** splits the area into 12 × 8
cells. Drag over all of them, and any cell that won't fill is a dead spot on
the digitiser.

Finger IDs use the *lowest free number*. Lift finger 2 and put it back and it's
#2 again, not #7.

Added `lostpointercapture` as an end event too. Without it, a pointer could stay
"touching" forever in some edge cases.

---

## Day 1 · System (09)

Everything the browser will say: threads, memory (rounded on purpose, it's a
fingerprinting thing), WebGL renderer with the ANGLE wrapper stripped ("ANGLE
(Apple, ANGLE Metal Renderer: Apple M3…)" becomes "Apple M3"), WebGPU adapter,
battery, network, storage quota, architecture via `userAgentData`.

**CPU test**: xorshift in Web Workers built from a Blob. There's a 300 ms JIT
warm-up run that's thrown away, 2.5 s on one thread, then 3 s on all threads.
It reports M ops/s plus the scaling factor, and the last runs are kept so you
can compare plugged-in vs battery. This test machine: **361 single / 2661
multi / 7.4×** on 8 threads.

**Bug:** the browser showed as "Not?A_Brand 24". `userAgentData.brands`
includes a deliberate junk entry, and in an embedded Chromium the only other
brand is "Chromium", which my filter also excluded. Now it drops the junk entry
first and falls back to Chromium.

---

## Day 1 · Test sheet (10)

Pulls every verdict and note into one sheet with unit / serial / tester fields,
a stamp that rotates between IN PROGRESS, ALL CLEAR (green) and FAULTS FOUND
(red), the device summary, and signature lines.

- **Copy as text** gives fixed-width plain text that pastes cleanly into
  tickets. It falls back to a hidden textarea when the clipboard API is
  blocked.
- **Download .txt** names the file after the unit.
- **Print** has its own stylesheet: only the sheet, and only the chosen result
  per row.

Editing a verdict on the sheet edits the same data as the bar under each test,
and the rail dots update live (hollow = untested, green = pass, red diamond =
fail, dashed = skip).

---

## Polish pass · bugs found in the browser

Clicking through every page in a real browser turned up:

| Bug | Cause | Fix |
|---|---|---|
| Polarity hint had a grey box and border | `.hint.top` picked up the header's `.top` styles | Renamed the header class to `.topbar` |
| Orange line down the content edge | `main` (tabindex -1) got a `:focus-visible` outline after navigation | `main:focus { outline: none }` |
| Header clock showed `11시 14분 39초` | `toLocaleTimeString` follows the OS locale | Format HH:MM:SS by hand |
| Checkbox labels in ALL CAPS | Inherited `text-transform` from `.field` | Reset on `.check` |
| Camera stat tiles left an empty grey cell | 3 tiles in a narrow auto-fit grid | 2 columns, resolution spans full width |
| Hidden panels still visible | `.stack { display:flex }` beat the `hidden` attribute | `[hidden] { display:none !important }` |
| Big number overlapped title on phones | Number spanned two grid rows | Stack it above the title under 860px |

Also checked dark mode and the 375px phone layout. On phones the side rail
becomes a horizontal scrolling tab strip, and the keyboard scrolls sideways
inside its panel.

---

## Not verified yet

- **Mic and camera** with real permission granted. The UI and error paths
  render, but no live stream was tested.
- **Real gamepad.** Only the mock.
- **Refresh rate readout.** It stayed empty in the embedded preview pane, most
  likely because that pane throttles animation frames. It needs a check in a
  normal browser window.

---

## Numbers

- 10 tests, 13 source files, ~4,500 lines (CSS + JS + HTML)
- 0 dependencies (Google Fonts are optional; it falls back to system fonts)
- 0 bytes sent anywhere

## Next, maybe

- A non-US keyboard layout (ISO Enter, extra key by left Shift)
- A battery wear estimate from charge/discharge over a session
- A "guided run" that walks through every test in order and fills the sheet as
  it goes
