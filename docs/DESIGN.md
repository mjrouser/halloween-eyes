# Halloween Eye Windows — Design Spec

*Date: 2026-09-17 · Target: Halloween, Saturday 2026-10-31 · Status: design approved, not yet implemented*

> **Style comparison page:** <https://claude.ai/artifact/957UFPcUM1CUoZ6jCpxCon>
> Side-by-side rendering of the candidate eye shapes and palettes that the §4.7 selection
> was made from. This is a private artifact — the link resolves only for the author, and
> will not open for anyone else reading this repository.

## 1. Goal

Two old monitors sit in the two front-facing second-floor windows. Each displays one
large animated eye. The eyes scan, blink, and occasionally do something funny — go
cross-eyed, look away from each other, or crowd into a single window. The effect should
read as playful and mischievous from the sidewalk, not frightening. Small children are
the primary audience.

Success is judged from the street at night, not from the room.

## 2. Scope

### In scope for 2026

- Two eyes, one per window, procedurally animated in a browser on a single Raspberry Pi 5.
- Seven expressions plus naturalistic idle scanning (eight rows in the pose table, §4.5).
- Gags firing roughly once every 60–90 seconds.
- A slow "energy" drift across the evening so the install is not identical at 6pm and 9:30pm —
  **unproven, and toggleable** (§4.8), since it may simply read as the display getting tired.
- Unattended operation: starts at dusk, stops at bedtime, survives a crash.
- Two shapes and two palettes (§4.7), **switchable at runtime from a phone** (§4.8), along with
  the energy drift and the crowd-in behaviour.

### Explicitly out of scope

- **Camera / motion reactivity.** Noted in `ideas.md` as the growth path. It roughly
  triples the build. Deferred.
- **Phone-triggered *gags*.** The control page added in §4.8 changes style and palette only.
  Firing a pose on cue is still deferred — but §4.8 builds the channel it would need, so what
  remains is a button wired to the director's named `fire(poseName)` entry point. Cheap to add
  later; not being added now, because timing a gag by hand competes with handing out sweets.
- **Sound.** Not discussed, not wanted.
- **Any second Pi.** One Pi 5 drives both monitors.

## 3. Hardware

| Item | Detail |
|---|---|
| Compute | Raspberry Pi 5. Two micro-HDMI outputs drive both monitors from one machine. |
| Spare | Raspberry Pi 3B, imaged and shelved as a cold spare. |
| Not used | Pi Zero / Zero W — too weak for smooth animation at panel resolution. |
| Displays | **2 × MSI PRO MP225** (matched pair, ordered 2026-09-19) — 21.5″, 1920×1080, 16:9, **IPS**, 250 nits, 1300:1, anti-glare, 178°/178° viewing angles. Inputs: HDMI 1.4b, VGA. 489 mm / 19.3″ wide, 2.3 kg / 5.1 lb. |
| Spare display | **Acer KA222Q** — 21.5″, 1920×1080, 16:9, VA. Held as a cold spare alongside the Pi 3B. |
| Window gap | Under 10 ft, same wall. Short cable runs; no network sync needed. |
| Window openings | **23″ inside width each. 44″ between the facing inside edges of the two openings.** Tape-measured 2026-09-17. Full span, outer edge to outer edge: 90″ (7′6″). A separate measurement put the bare wall between casings at ~34″, which implies ~5″ of trim per side — consistent, and the 44″ figure is the one the stage model uses. |
| Window opening (full) | **23″ wide × 48″ tall visible opening**, with ~3.25″ of wood top and bottom. Sill depth **1.25″**. Measured 2026-09-19. |
| Panel active area | 18.74″ × 10.54″ per monitor (21.5″ 16:9), **102.5 PPI**. Panel body ~19.3″ × ~11.2″ including bezel — clears the 23″ width by ~1.9″ per side, and occupies under a quarter of the 48″ opening height. |
| **Mounting** | **The sill cannot support the monitors.** At 1.25″ it is a lip, not a shelf — shallower than the panel body alone, before any stand. A separate support is required; see §12. The panels are VESA 100×100 and 5.1 lb each, so the load is trivial and the problem is purely geometric. |

### Monitor decision — settled 2026-09-19

**Two MSI PRO MP225, ordered as a matched pair. $59.99 each, $119.98 total, free 2-day
shipping, arriving 2026-09-24.**

History, because the reasoning moved twice: the original plan was a Dell P2214Hb plus an
Acer KA222Q already on hand, accepting a mismatched IPS/VA pair to avoid spending money on
the first iteration. That decision was voided when the Dell became unavailable — buying was
forced, and once a purchase was unavoidable, buying *two* dominated buying one. Hunting for a
single panel that happens to match an existing one is a losing game; buying a matched pair in
a single order is not.

The alternatives priced at the same time: Dell S2425H (24″ IPS, $69.99 — bigger image, but
only ~0.9″ side clearance in a 23″ opening and heavier), and the MSI PRO **MP225V** ($64.99 —
the VA sibling, near-identical name, easy to buy by mistake).

**Why IPS over the VA sibling.** VA offers ~4000:1 against IPS's 1300:1, and a darker black
genuinely matters here — it is what stops the panel reading as a lit rectangle. But VA's
contrast advantage is largest *on-axis* and decays off-axis: its blacks lift and gamma shifts
exactly where the deep black would be worth having. With the window centre ~15 ft up, the
audience spans roughly **14° off-axis from the street (40 ft), 27° halfway up the walk, and
45° at the door**. VA degrades visibly past ~30°, so the people closest to the house — the
actual trick-or-treaters — would get the worst version. IPS's 178°/178° holds instead.

This argument depends on running **without** a diffuser (§12). With a diffuser the diffuser
becomes the emitting surface, off-axis behaviour is largely neutralised, and VA's deeper
black would win. Since running bare is now a supported mode, IPS is the correct choice.

**What a matched pair eliminates:** per-viewport colour calibration (§4.2), the geometric
scale factor as a live concern (§4.2), and the question of which monitor goes in which window
(§13) — with two identical units it is arbitrary. Both units were ordered as quantity 2 of a
single listing, which is what actually guarantees the same SKU and panel revision.

### Cabling

**Both panels take HDMI directly, so no adapters are required at all.** The Pi 5 outputs
**micro**-HDMI (type D) — not mini, which is the common mis-buy. Two micro-HDMI→HDMI cables
is the entire cabling bill. The previously specced HDMI→DVI-D adapter was for the Dell and is
no longer needed.

## 4. Architecture

### 4.1 Stage and viewports

Both eyes live on **one shared virtual stage** wider than either screen. Each monitor is a
**viewport** showing a slice of that stage. The gap between the slices corresponds to the
physical wall between the windows.

```
stage x:  0 ─────────────────────────────────────────────────── 1.0
          [  left viewport  ]      wall      [ right viewport  ]
                  eyeL                              eyeR
```

Each eye carries two independent transforms:

- **stage position** — where it sits in the world
- **gaze** — where it is looking

That separation is what makes the gags cheap. Cross-eyed is aiming two gaze values at each
other. Both-eyes-in-one-window is moving two stage positions. Nothing special-cases the
window boundary, so an eye can be partly clipped mid-travel.

Stage coordinates are normalised (0..1) and mapped to pixels per viewport, so the model is
independent of panel resolution.

#### The gap is a timing parameter, not a measurement

Measured geometry (§3): 18.74″ of screen, and 48.26″ between active areas once the screens
are centred in the 23″ openings (2.13″ of window either side of the image, plus the 44″
between openings). **The wall is 2.58× wider than a screen.** To scale that is a stage
85.74″ wide — 8,788 px at 102.5 PPI — of which only 2 × 1,920 px is ever visible:

```
stage:  0.000 ──── 0.219 ═══════════ 0.781 ──── 1.000
        [ left viewport ]    wall     [ right viewport ]
             1920px         4947px         1920px
```

An earlier draft of this spec claimed a to-scale gap lets an eye "genuinely disappear behind
the wall and emerge a beat later — much better than teleporting." **That was wrong, and the
measurements show why.** The wall region is never visible to anyone, so a to-scale gap buys
exactly one thing: transit duration. At 2.58 screen-widths, an eye crossing its own width in
a natural 1.5 s is invisible for **3.9 seconds** — both windows empty. That is a dead beat,
not a joke, and nobody in the street can perceive whether the transit was accurate.

The gap is therefore an **apparent gap**: a tunable timing value, defaulting to ~1.0–1.5×
screen width (roughly 19–28″ of stage) and tuned by eye, not the measured 2.58×. The true
measurement is recorded above for reference only.

A consequence for the both-eyes-one-window gag: prefer the second eye **entering from the
outer edge** of the target window over a literal traverse across the wall. Shorter dead time,
and it reads as the eye coming from somewhere rather than from nowhere.

#### Hard floor: the apparent gap must be at least one eye width

Found while prototyping the animation, and it is not obvious from the geometry.

If the apparent gap is narrower than one eye, an eye in transit is visible in **both**
windows at once — leading edge in one, trailing edge in the other. Each window is rendered
by its own browser process (§7.1), so those two halves are drawn by two independent
animation timelines. Any sub-frame difference between them shows as the halves failing to
line up: a visible tear straight down the middle of an object that is supposed to be one
thing.

The true geometry is immune, because the real wall is 2.58× a screen width and a
one-screen-wide eye can never straddle it. **The compression introduces the failure mode.**
Tuning the apparent gap below one eye width would demand frame-level sync between two
processes that the architecture deliberately does not provide — the whole point of
`showState(t)` is that the windows never talk to each other.

So the tunable range is bounded below: **apparent gap ≥ 1.0 × eye width**, and ~1.2× for
margin. This sits comfortably inside the 1.0–1.5× starting range above, so it costs nothing
in practice — but it must be enforced in config validation rather than left to judgement,
because the symptom is subtle, intermittent, and invisible on a desk.

**Also:** two full-size eyes cannot sit side by side in one window — each eye is nearly a full
screen wide. The gag requires both eyes to compress as they converge, and *how* they compress
is a live question with two plausible answers, so it is a toggle (`crowdStyle`, §4.8):

- **`shrink`** — uniform scale to ~0.5. Physically coherent, and what the prototype does.
  Reads as the eyes *receding*, which is not quite the intent.
- **`squash`** — horizontal compression only. Distorts the eye, which fights the spherical
  illusion the foreshortening work (§5) exists to create — but only for a beat, and it reads
  as the eyes being *crowded*, which is the actual joke. This is squash-and-stretch, a standard
  animation principle, and for a cartoon eye it is probably the funnier read.

Either way they must compress **together**: that shared beat is what makes the move read as
one deliberate action rather than one eye drifting while the other sprints.

### 4.2 Per-viewport calibration

**Geometric scaling is the identity.** Both panels are 21.5″ at 1920×1080, so a stage unit
maps to the same physical size on each and no scale correction is needed. The scale factor
stays in the config as a named value set to 1.0 rather than being removed — it costs nothing
and it is the thing that would need changing if a panel is ever swapped for a different size.

**Colour calibration is largely eliminated** by the matched-pair purchase (§3). Two units of
the same SKU, same revision, bought in one order, render the same amber the same way and fall
off identically off-axis. The per-viewport colour offset stays in the config — brightness,
gamma, saturation, defaulting to zero on both — but it exists as an escape hatch, not as a
task.

What remains is a five-minute check rather than the multi-step procedure this section used to
carry:

1. **Set both monitors' OSD to the same values.** Factory reset both, then leave them alone.
   Identical panels at identical settings need no further hardware matching.
2. **Look at them side by side, lit, at night, from the street.** If they match, done.
3. **Only if they visibly differ** — a panel-lottery outlier, a backlight that drifted — nudge
   one viewport's colour offset until they agree. Software only; do not start adjusting
   backlights, because with identical panels a difference in the OSD is more likely to be the
   cause than the cure.

Step 2 is still worth doing in the final physical position rather than on a desk. Viewing
angle is part of the optical path even without a diffuser, and a pair that matches at desk
height can still diverge when seen from 40 ft below.

If a panel is ever replaced with a different model, this section reverts to real work, and
the geometric scale factor above stops being 1.0. Both are why the knobs stay in the config.

### 4.3 Determinism: the show is a function of wall-clock time

The show is **not** a timer that starts and animates. It is a pure function:

```
showState(t) -> { eyeL: {...}, eyeR: {...} }     where t = Date.now()
```

All randomness derives from hashing a **time-slot index** (`floor(t / SLOT_MS)`), never from
`Math.random()`. Slot 4,827 always produces the same content for anyone who asks.

Both browser windows read the same system clock on the same machine, so they independently
compute identical output with no messaging, no handshake, and no leader election.

This is load-bearing, not incidental:

- **Start order does not matter.** No coordination on boot.
- **Crash recovery is free.** Restart one window mid-show and it rejoins already in phase.
- **The show is reproducible.** Jump to any timestamp to see exactly what it does, which
  makes "show me the wall-eyed gag" a URL rather than a two-minute wait.
- **A future two-Pi split is nearly free** — same code, add NTP.

**The one discipline this imposes:** no `Math.random()` anywhere in show logic. This must be
enforced by a lint rule, because a single stray call desynchronises the two windows in a way
that is easy to miss on a desk and obvious from the street.

### 4.4 Poses vs. motion profiles

These are two separate tables. Conflating them was a design error caught during brainstorming.

A **pose** is where things point — five numbers per eye:

| Field | Meaning |
|---|---|
| `gx` | horizontal gaze, −1..1 |
| `gy` | vertical gaze, −1..1 |
| `lid` | lid closure, 0 open .. 1 shut |
| `brow` | brow depth multiplier |
| `pup` | pupil dilation multiplier |

A **motion profile** is how it gets there — attack duration, easing, hold duration, release
duration. A snap-and-hold and a slow drift can target the *same* pose and read as completely
different behaviours.

#### The eyes are yoked

**Both eyes always share one timeline.** Vertebrate eyes are yoked: a pair saccades together,
to the same target, at the same instant. There is no such thing as one eye starting a movement
a beat before the other.

Staggering them is tempting — it feels like it would read as more organic than perfect
synchrony — and it is wrong twice over. It makes the pair read as two separate creatures that
happen to share a house rather than one face. And it quietly spends the contrast the gags run
on: cross-eyed and wall-eyed are funny **because** they break the yoking, so if the eyes are
already slightly independent at rest, breaking it is no longer a departure from anything.

The only legitimate asymmetry between the two eyes is geometric — the mirrored brow and the
mirrored specular glint, both derived from `side` (§4.7). Never timing.

This makes vergence a first-class concept rather than an incidental one: the two gaze values
are normally locked together, and a gag is an explicit, temporary unlock. Implement it that
way — one shared gaze target plus a vergence offset — rather than as two independent eyes
that happen to agree most of the time. The latter will drift.

**The model also covers asymmetric poses, which is not obvious.** With
`eyeL = target + vergence` and `eyeR = target − vergence`:

| Pose | target | vergence |
|---|---|---|
| Idle | scan value | 0 |
| Cross-eyed | 0 | +k |
| Wall-eyed | 0 | −k |
| **Wandering eye** (one forward, one wide) | **+k/2** | **−k/2** |

The wandering eye needs no new mechanism — it is the same two numbers with the shared target
moved off centre. Worth knowing before anyone reaches for a per-eye override, which would
reintroduce exactly the drift this section exists to prevent.

**Wandering eye drifts out slowly and snaps back.** This is a motion-profile decision rather
than a pose one, and it is where the separation pays off. Settled 2026-09-20:

- **Out: slow drift**, ~2.5 s. Passive — the eye loses fixation, no effort involved.
- **Hold: ~1.5 s** at the extreme. **This dwell is where the joke lives.** Without a beat there
  the snap has nothing to snap from and nobody has had time to register that an eye has gone.
- **Back: snap**, ~0.12 s, with a couple of percent of **overshoot** before settling. The
  overshoot is what sells a yank as a yank rather than a slide.
- The anchor eye holds perfectly still throughout. Its stillness is what makes the other one
  read as misbehaving.

Timings are starting points to tune on the house, not measurements.

#### The rule for assigning motion profiles

The asymmetry above is not a one-off. It generalises, and the general form is better than
tuning eight poses by taste:

> **The effortful direction is fast. The passive direction is slow.**

| Pose | Fast phase | Slow phase | Why |
|---|---|---|---|
| Wandering eye | return | drift out | drift is passive; refixation is an active saccade |
| Cross-eyed | going in | coming out | convergence is muscular; release is relaxation |
| Blink | closing | opening | real blinks close in ~100 ms, open in ~150–200 ms |
| Lock-on | brow snap down | release | corrugator contraction vs. letting go |
| Mock surprise | brow lift | settle | frontalis contraction vs. relaxation |

Cross-eyed comes out **opposite** to the wandering eye — fast in, slow out — which is not
something taste would have suggested. That is the value of having a rule: it makes each pose's
profile derivable rather than guessed, and it is why the physiology is worth consulting even
for a cartoon.

Deliberate violations are allowed where a gag is funnier for breaking the rule. They should be
deliberate, and noted as such.

**The test a pose must pass:** it must use an axis that idle scanning does not. Scanning
already moves both eyes together through the full gaze range, so a pose earns its place only
by using divergence, lids, brow, pupil, or stage position. ("Side-eye" was cut for failing
this — it was a scan extreme with a 20% brow change, and the thing that sells side-eye on a
real face is eyes-move-head-stays, which does not exist here.)

### 4.5 Pose table (v1)

| Pose | Category | Earning axis |
|---|---|---|
| Idle scan | resting state | baseline — both eyes track loosely together |
| Cross-eyed | gag | eyes converge toward each other |
| Wall-eyed | gag | eyes diverge — the better joke of the two |
| Wandering eye | gag | eyes diverge *asymmetrically* — one holds forward, the other drifts wide |
| Both eyes, one window | gag | stage position; far window goes dark |
| Lock-on | reaction | brow snap + pupil dilation, held for a beat |
| Suspicious squint | reaction | lid closure + heavy brow |
| Mock surprise | reaction | brow lift + pupil contraction |

### 4.6 Energy drift

A single global `energy` value, driven by clock time, biases lid rest position and gag
frequency across the evening: friskier early, droopier and slower by 9:30pm. This replaces
what was initially drafted as a "heavy lids" pose — it is a mood, not a beat. Costs almost
nothing and means the install is not the same at both ends of the night.

### 4.7 Theme config

Style is data, not code. The renderer never hardcodes a colour or a brow coordinate. The theme
holds a palette plus shape parameters, and the two are **independent axes** — any shape works
in any palette.

**Shortlist settled 2026-09-19** after review by a second reader:

| Axis | In scope | Cut |
|---|---|---|
| Shape | **Amber sclera** (bright field, dark pupil — most legible gaze) and **Ember orb** (no sclera, glowing ball — best atmosphere, softer extremes) | Wide Ember, white-sclera Cartoon |
| Palette | **Amber** (default, preferred) and **Cat green** (pale green; the sclera shape also takes a vertical slit pupil in this palette) | — |

Four live combinations. Cutting two shapes roughly pays for the runtime switching in §4.8.

**Geometry is derived from a single `side` parameter**, never hand-written per eye. The brow
polygon, the contact-shadow gradient direction, and the specular glint position all mirror
off that one value. Hand-mirroring produced an asymmetry bug during brainstorming where one
eye scowled harder than the other; deriving it removes that whole class of error and
guarantees the two eyes cannot drift apart.

### 4.8 Runtime style switching

Approved 2026-09-19. Both the shape and the palette can be changed while the show is running,
from a phone, without restarting anything.

**Why it earns its place.** Comparing Amber against Ember on the actual house otherwise means
walking inside, editing config, restarting, and walking back out — every single time. With the
installation live for three weeks before Halloween (§10), that is a comparison worth making
repeatedly rather than once, and the friction is what would stop it happening. It also removes
a deadline: the style never has to be finally decided, and can be changed on the night itself
based on how people actually react.

#### The problem, and why the obvious solution is wrong

A toggle is an *event*, and §4.3's architecture deliberately has no channel for events. The
two windows never talk to each other; each computes from the wall clock alone. Pushing a
change to one window and hoping the other gets it too reintroduces exactly the coordination
this design exists to avoid.

**The config therefore does not say "switch to ember". It says "ember, effective at T".**

Both windows poll the config, both read the same `T`, and both switch at that instant. They
are still each computing from the clock rather than reacting to each other, so drift is not
possible. Determinism is preserved rather than worked around.

#### Config

```json
{
  "shape":       "amber" | "ember",
  "palette":     "amber" | "green",
  "energyDrift": true | false,
  "crowdStyle":  "shrink" | "squash",
  "effectiveAt": 1790000000000
}
```

**What earns a toggle, and what does not.** A toggle is for a decision that genuinely cannot
be made in advance and is better judged live on the house. All four qualify: the two style
axes were deferred deliberately, the energy drift (§4.6) is unproven and may read as the
display simply getting tired, and the crowd behaviour (§4.1) has two plausible readings with
no way to pick between them from a desk.

That list should stop growing. The failure mode is a control page that turns into a settings
panel and a project that becomes *configurable* rather than *good*. Anything that can simply
be decided should be decided.

This file is the **persisted source of truth**. A reboot comes up in the last-chosen style
with no phone and no network involved.

#### Poll semantics

- Poll every **2 s**.
- A change is scheduled for `effectiveAt`, set **5 s** in the future when written.
- **Correctness condition: lead time must exceed the poll interval**, or a window can miss the
  window between two polls and apply the change late — which is precisely the tear this design
  is meant to prevent. 2 s poll / 5 s lead leaves generous margin; do not tighten one without
  the other.
- If `effectiveAt` is already in the past — a window that booted late, or restarted mid-show —
  apply immediately. Correct by construction: the config is the truth, not the transition.
- The switch itself is instant. A crossfade would also be safe, since both windows begin it at
  the same timestamp, but it is not worth the complexity for v1.

#### Control surface

A page served from the Pi with four buttons — two shapes, two palettes — opened on a phone
over the LAN. It validates the request against the enums and writes the config file.

#### Failure rules — the show never depends on this

This is the rule that keeps a convenience from becoming a liability on the one night it
matters:

- A failed poll is a **no-op**, never an error state. Network down, server dead, 404,
  malformed JSON: keep the current style, retry on the next tick, do not throw, never blank
  the screen.
- An unrecognised `shape` or `palette` value is **ignored entirely** — keep the current style
  rather than rendering nothing.
- A missing `effectiveAt` is treated as "now".
- WiFi loss disables the toggle and nothing else. The eyes keep running.

#### Security

Small surface, but it is a write endpoint, so: **bind to the LAN only and never port-forward
it.** It is unauthenticated, which is acceptable here because the blast radius is two enum
values on a Halloween decoration — but only as long as it stays off the public internet.
Validate server-side against the enums and write only the known schema; never persist a
request body directly.

#### Build timing

Build this **last**, in week 6, after the show itself works. It is additive by design and must
not be able to destabilise anything in the run-up to freeze.

## 5. Visual spec — the eye

Vector shapes, no raster assets, no pre-rendered video. An eye is geometrically simple, so it
renders cheaply and stays fully controllable.

**Sizing.** At the prototype's sclera proportions (1.31 : 1), the eye is **height**-constrained
by the landscape panel: filling the 10.54″ screen height gives roughly 13.75″ of width, or
about 73% of the 18.74″ available. The remaining ~2.5″ per side is useful headroom for the
eye to shift stage position slightly within its own window. At 40 ft that eye subtends about
1.6° — far above the threshold where detail survives, so legibility is not the binding
constraint; contrast and motion are.

**Layers, bottom to top:** sclera (radial gradient) → iris (radial gradient) → pupil →
specular glint → hard brow polygon → socket ambient → contact shadow → lids. All clipped to
the sclera ellipse.

### Brow

Three independent parameters, because one of them was rejected while the other two were kept:

- **angle** — the brow sits lower at the *inner* edge of each eye, so the pair scowls inward
  toward each other. This is what makes two eyes read as one face rather than two props.
- **hard-edge depth** — approved at "medium".
- **contact falloff length** — see below.

The brow is **animated**, not fixed. Resting at medium, snapping heavier for a reaction,
lifting for mock surprise. This is what unlocks the reaction poses; a fixed brow cannot make
those faces at all. It costs upward gaze travel, which is an acceptable trade since the
audience is below the windows looking up.

### Shadow: two layers, two jobs

An earlier single-gradient version ran to 42px and sat ~37% opaque across the top of the
pupil, which dulled the pupil-against-sclera contrast that makes gaze readable at distance.
Replaced with:

- **Contact shadow** — the brow physically occluding light. A cast edge is tight, so it hugs
  the edge that casts it and dies ~16px down, clear of the pupil. Defined in **user space,
  perpendicular to the brow line**, so it is a consistent width along the whole edge. (A
  bounding-box gradient on a slanted polygon leans — that was the earlier bug.)
- **Socket ambient** — the eye recessed in a skull. Broad and weak: 18% at the top of the
  eye, fading to nothing by the centre line. ~4% at the top of the pupil, zero at its centre.

Neither layer reaches the pupil.

### Foreshortening

Horizontal gaze drives horizontal pupil squash automatically, computed from the same `gx`
that drives translation. It cannot be forgotten on a new pose. This is what makes the eye
read as a rotating sphere rather than a dot sliding on a disc.

**The magnitude is derived, not chosen.** For an iris travelling `x` across a sphere of
radius `R`, the compression is `cos(asin(x / R))`, equivalently `sqrt(1 - (x/R)²)`. At the
prototype's travel of 0.41 R that is **0.91** — which feels far too subtle when read as a
number. Choosing the value by eye instead produced 0.72, a roughly 3× exaggeration, and the
result read as a disc spinning in place rather than an eyeball turning. Pin the formula, not
a value.

Two corollaries, both found by getting them wrong first:

- **Express travel in the eye's own units, never as a percentage of an enclosing box.** A
  percentage that silently resolves against the iris group's bounding box rather than the
  eye's yields about a quarter of the intended travel. That compounds with an exaggerated
  squash: heavy compression plus almost no movement is precisely what "spinning in place"
  looks like.
- **The specular glint does not move with the iris.** It is a reflection of a fixed light, so
  it holds still in the eye's frame while the eyeball rotates underneath it. Parenting it to
  the moving group makes the eye read as a decal sliding across a surface. Small change,
  disproportionate effect on whether the thing looks spherical.

## 6. Show design

- Idle scanning is the face roughly 90% of the time. Long holds, snappy transitions between
  them — saccades, not drifting.
- Gags fire roughly **once every 60–90 seconds**. Deliberately rarer than feels right while
  building: a gag every 20 seconds is a gimmick, but one a passerby has to wait for makes
  the people who catch it feel like they found something.
- Blinks are frequent and irregular, including occasional doubles.
- Reactions are held for a beat, then released. A release that is too fast reads as a glitch.

## 7. Runtime and deployment

### 7.1 Display setup

Two fullscreen Chromium windows, one per HDMI output, each loading the same page with a
different viewport parameter.

**This is the one piece of unverified plumbing, and it needs correcting from what was said
during brainstorming.** Approach 2 avoids the *hard* Wayland problem — a client cannot place
one window spanning two outputs, and that capability is not coming back. But it does not
avoid per-output placement entirely: under Wayland a fullscreen window goes to the output the
compositor picks, and two fullscreen windows may both land on the primary. That is an easier
problem than spanning, but it is not free.

Fallback ladder, to be resolved by a spike in week 1:

1. **Compositor window rules.** labwc and wayfire can both assign a window to an output by
   app_id/title. Exact syntax depends on which compositor the installed image ships — check
   `echo $XDG_SESSION_TYPE` and the compositor version first.
2. **Switch the Pi to X11.** Then `chromium --window-position` places windows precisely and
   this becomes trivial. Swimming against the distro default, but well-trodden.
3. **Worst case,** X11 plus a single spanning window — approach 1, available as a fallback
   precisely because X11 is on this ladder anyway.

#### Viewport assignment must survive a reboot

An earlier draft said: "Do not design around which physical monitor gets which viewport — if
they land swapped, swap the URLs or swap the HDMI cables. Ten seconds, no plumbing."

**That was wrong, and it hides a real failure mode.** A one-time cable swap only works if the
assignment is *stable*. Two Chromium windows launching together is a race, and if the
compositor resolves it by launch order rather than by an explicit rule, the assignment can
differ between boots. Fixing it by hand once fixes nothing; it would simply come back at the
next power cut, potentially on the night.

Worse, **the failure is subtle rather than obvious.** Swapped viewports do not produce a blank
screen. Each eye's brow angle and specular glint are derived from its own `side` value (§4.7),
so a swapped pair scowls *outward* instead of inward and the highlights lean the wrong way.
It looks slightly wrong in a way that is easy to miss from the street and hard to diagnose in
the dark.

Three layers, in order of preference:

1. **Self-identifying viewports — the real fix.** Do not pass the viewport in at launch. Have
   the page read its own position (`window.screenX` against the extended-desktop layout) and
   choose which half of the stage it renders. A window then renders correctly *for wherever it
   actually is*, and launch order stops mattering entirely. Requires X11, since Wayland
   deliberately hides window position from clients — another entry on the scorecard for rung 2
   of the ladder above.
2. **Deterministic placement.** On X11, `xrandr` fixes HDMI-1 at x=0 and HDMI-2 at x=1920, and
   each window launches with an explicit `--window-position`. Deterministic by construction,
   no race to lose.
3. **Distinguishable windows.** If compositor rules are needed (the Wayland path), two
   identical Chromium windows cannot be targeted separately — rules match on app_id or title.
   Give each a unique `--class` or a distinct title so a rule can name it.

**A setup overlay is worth the ten lines.** A URL parameter or keypress that paints `LEFT` or
`RIGHT` across each screen makes assignment verifiable at a glance on install day, instead of
squinting at brow angles from the pavement.

**This must be verified across reboots, not once** — see §9. It is exactly the class of thing
that works when you set it up and bites months later.

Also required: screen blanking and DPMS disabled, cursor hidden, Chromium's crash-restore
bubble suppressed. Screen blanking is the classic failure — it will blank at the worst
possible moment if not explicitly disabled.

### 7.2 Autostart and supervision

A systemd service with `Restart=always`. Because the show is a function of wall-clock time,
a restarted window rejoins already in phase — supervision is genuinely sufficient here, with
no state to restore.

### 7.3 Schedule

**Settled 2026-09-19: on at 17:45, off at 23:30, every night, for most of October.**

Fixed clock times, not sunset-relative. Sunset moves only ~11 minutes across the run (≈6:37 pm
Oct 24, ≈6:26 pm Oct 31 — derived, worth confirming against an almanac), so a sunset
calculation would buy eleven minutes in exchange for a timezone library and a class of bug
that only shows up at the boundary. DST ends Nov 1, so Halloween itself is unaffected.

**Time-gated, never start-on-boot.** A reboot at 3 am must leave the windows dark. The
schedule decides whether the show runs, not the power state.

The 17:45 start is deliberately before dark. Trick-or-treating begins before civil twilight
ends (~6:55 pm on Oct 31), so the eyes will look washed out for the first 45 minutes and there
is nothing to be done about it — being *on* matters more than looking good at 18:05.

Implemented as cron or a systemd timer starting and stopping the service. A smart plug on the
monitors is a reasonable low-tech alternative and has the advantage of cutting the panels'
backlight rather than merely displaying black.

Neighbour constraint checked: no windows directly opposite, so the 23:30 shutdown is a
courtesy rather than a requirement.

#### Runtime implications of a month-long run

~5 h 45 m × ~31 nights ≈ **180 hours**, roughly six times the original single-week assumption.

- **Power is negligible.** Two panels at ~17 W plus the Pi at ~6 W is ~45 W, so ~8 kWh across
  the month — about $1.50 at Michigan residential rates.
- **Image retention now wants cheap insurance.** An earlier draft called burn-in a non-issue at
  ~30 hours. That was right for *that* number and is no longer the number. IPS retention is
  temporary and recoverable and the eye is a moving image, so the risk stays low — but the
  bright sclera does sit in roughly the same region for 180 hours. The mitigation is nearly
  free: let the idle stage position wander slowly across the evening, a few inches either way.
  The stage model (§4.1) already supports arbitrary positions, so this is a bias on an existing
  value rather than new machinery, and it makes the eyes look less bolted-down as a bonus.

### 7.4 Failure plan for the night itself

- **Code freeze Wednesday 2026-10-28.** No changes after that date. This is the single most
  valuable line in this document.
- 48-hour unattended soak test before freeze.
- Pi 3B imaged, configured, and shelved as a cold spare.
- Clean shutdown path so pulling power does not corrupt the SD card.
- A written one-page runbook taped near the Pi: how to restart, how to swap to the spare.
  Written for someone who is holding a bowl of candy and not thinking clearly.

## 8. Development workflow

Build and tune in a browser on the Mac, where iteration is instant. Deploy to the Pi with
`git pull`. Because the show is time-deterministic, any timestamp can be replayed on the
desk, so visual tuning does not require standing in the yard.

## 9. Testing

Proportional to stakes — this touches no real data and no external services, so the bar is
manual verification plus a small amount of automation where correctness is not eyeballable:

- **Unit:** pose renderer geometry — mirroring symmetry in particular, since that is where a
  bug already occurred. Assert the derived left and right geometry are true mirrors.
- **Unit:** `showState(t)` determinism — same `t` yields identical output across repeated
  calls and fresh module loads.
- **Lint:** fail the build on `Math.random()` in show logic.
- **Reboot test — do this at least five times, not once.** Power-cycle the Pi and confirm both
  windows come up on the correct monitors with the correct viewports every time (§7.1). Two
  windows launching together is a race, and a race that resolves correctly four times running
  has told you nothing. This is the single most likely thing to be quietly broken on the
  night, because the symptom is subtle rather than absent.
- **Manual:** the real test is from the sidewalk at night, at the actual distance, through
  the actual diffusion material. Everything else is a proxy. Budget at least two separate
  evenings for this, because the first one always reveals something.

## 10. Build order

Revised 2026-09-19, once the run changed from "works on Halloween" to "runs most of October".

| Week | Dates | Milestone |
|---|---|---|
| 1 | Sep 17–23 | Dual-output placement spike (§7.1) — **including reboot persistence and whether the page can detect its own output**, not just "can I place a window". Framerate smoke test. Cables ordered (§11). **Sightline mock-up** — see below. Monitors arrive Thu Sep 24. |
| 2 | Sep 24–30 | **Bench bring-up**: Pi driving both panels, dual-output solved, autostart, blanking off, schedule running. Everything except the windows. |
| 3 | Oct 1–7 | Away Oct 3–4. Renderer on the Mac: theme config, `side`-derived geometry, pose renderer. |
| 4 | Oct 8–14 | **Sat Oct 10 — physical install (§12).** Then stage/viewport model and `showState(t)`, deployed in place. |
| 5 | Oct 15–21 | Director: pose table, motion profiles, gag scheduling, energy drift. |
| 6 | Oct 22–28 | Runtime style switching (§4.8) — **last, and only once the show is solid**. Street tuning. Try bare first, then diffusion if wanted (§12). **Freeze Oct 28.** |
| — | Oct 29–31 | Soak. No changes. |

**Installing on Oct 10 gives 22 running nights.** Installing the weekend of Sep 26–27 instead —
available, and two days after the monitors land — would give 35. Either meets the goal; the
earlier date is worth taking if that weekend is free.

#### "Install" is two jobs, and they are separated on purpose

Conflating them was the flaw in the previous plan.

- **Bench bring-up** is the risky work — dual-output placement, autostart, screen blanking,
  the schedule. None of it needs a window; two panels on a table are sufficient. Scheduled for
  week 2, before the trip.
- **Physical placement** is carrying, mounting, cabling and aiming.

Doing the bench work first means Oct 10 is a couple of hours of carrying and aiming rather
than a debugging session on a ladder after dark.

#### The sightline mock-up — do this before the hardware arrives

Prop **any** screen already in the house — a laptop, the spare Acer — in one of the windows
some evening and go look from the street. Twenty minutes, no mount, no new hardware, no code.

It tests the three things most likely to send you back up the stairs on install day: the
sightline, the right height within a 48″ opening, and how bright a screen actually reads
through that glass at night. It is the highest-value thing available before the monitors land.

#### Risk position

The adapter lead time is closed — no adapters are needed at all (§3). One open risk remains:
the dual-output window placement in §7.1, still front-loaded into week 1 because it is the
only item that could force an architectural change, and the fallback ladder needs time to walk
if the first rung fails.

The later install date removes a risk rather than adding one. An Oct 1 install would have
required putting the brainstorming prototype in the windows as a labelled placeholder; by
Oct 10 the real renderer exists, so the throwaway step disappears.

## 11. Supplies

| Item | Notes |
|---|---|
| 2× MSI PRO MP225 | **Ordered 2026-09-19**, $59.99 each, arriving 2026-09-24. |
| 2× micro-HDMI→HDMI cable, **2 m**, slim connector | See below. ~$8 each. **This is the entire cabling bill** — both panels take HDMI directly, so no adapters of any kind are required. |
| Lumber for 2× shop-built stands | See §12. Height set by the sightline mock-up, in the ~25–27″ region. **Cut after measuring the monitor's stand offset, not before.** |
| Extension cord or power strip | Pi plus two panels, run to the nearest socket. |
| Diffusion material | **Optional — see §12.** Sheer white fabric, frosted film, or a shower-curtain liner, ~$8. Buy it, but treat it as a tuning option to try on site rather than a required part. |
| Smart plug | Optional, for scheduling. |

#### Cable spec — the shell width is what matters

The Pi 5's two micro-HDMI ports sit roughly 13–15 mm apart centre to centre (approximate —
not confirmed against an authoritative drawing), and the receptacle itself is 6.5 mm wide. So
the constraint is the **width of the shell moulded around the plug**: it needs to be ≤ ~12 mm,
ideally ~10 mm, or the two plugs foul each other.

- **Do not buy micro-HDMI→HDMI-female adapter dongles.** A dongle plus a standard HDMI plug is
  bulky in both directions; two will not fit side by side, and it costs more than a direct
  cable. A single micro-HDMI (type D) → HDMI (type A) cable is the correct part.
- Skip right-angle connectors unless the bend direction is confirmed — the wrong orientation
  points into the neighbouring port.
- **Shortcut:** buy cables explicitly sold "for Raspberry Pi 4 / Pi 5". The slim shell is the
  entire reason those SKUs exist. The official Raspberry Pi cable is the safest single answer.
- **Count three connectors on that edge, not two.** USB-C power sits next to HDMI0, so a
  chunky third-party power supply can conflict with the HDMI plug beside it. The official Pi 5
  supply is slim.

**Length: 2 m.** With the Pi between the windows and panels centred in openings 44″ apart, each
run is ~33.5″ horizontally before any vertical rise, routing or service loop — call it 45–55″
in practice. A 1 m cable is 39.4″ and does not reach. If the Pi ends up on one of the two
tables rather than dead centre, one run approaches 70″. Slack coils harmlessly.

## 12. Physical and optical notes

The code is the easy half. This part is what makes or breaks it.

- **The room behind must be dark.** The illusion dies otherwise. This also hides the bezels.
- **Diffusion is optional, and the bare configuration is supported.** An earlier draft called
  it mandatory; that is no longer the requirement. Build it bare, look at it from the street,
  and add diffusion only if the bezels bother you. Nothing in the design depends on the
  choice, and the decision drove the IPS panel selection (§3) rather than the other way round.
- **Running bare changes two things.** The bezel and the backlight-leak rectangle become
  visible up close, and the window glass becomes the optical problem instead of the diffuser:
  a lit panel behind glass at night reflects in it, and double-pane glass produces two offset
  ghosts. Pushing the panel close to the glass minimises the offset. The panels' anti-glare
  coating handles room light but not this.
- **Trim masking is off the table, and matters less than expected.** The earlier plan was to
  set the panel *behind* the opening so the trim crops the bezel. The 1.25″ sill kills it:
  there is no reveal depth to recess into, and the panel is smaller than the opening in both
  dimensions, so the trim cannot crop it anyway. This costs less than it sounds. Against a
  dark room a black bezel simply disappears; what actually reveals the installation is the
  backlight-leak rectangle, and at 1300:1 in a dark room that is faint up close and invisible
  at 40 ft.
- **Push the panels right up against the glass.** Two unrelated reasons converge on it.
  Double-pane glass produces two offset reflections of a lit panel, and the offset shrinks as
  the panel approaches the glass. And a viewer looking steeply *up* at a window has their view
  of the room's interior cropped by the sill — an object deep in the room loses the lower part
  of the opening, while an object at the glass stays visible across nearly its full height.
  Close to the glass means more usable opening and fewer ghosts.
- **Vertical placement within the opening is now a design choice.** The panel occupies about
  11″ of a 48″ opening, so there is a lot of freedom and no obvious default. Decide it on site
  with the eyes actually running, viewed from the street — it is not a decision worth making
  from a drawing.

#### Mounting — required, not optional

The 1.25″ sill supports nothing. Options, cheapest first. All are easy: the panels are 5.1 lb
and VESA 100×100, so this is about geometry and not load.

1. **A simple shop-built stand, one per window, stands left on** — chosen 2026-09-20. No
   drilling into the house, fully reversible, and built to an exact height rather than chosen
   from what furniture happens to exist. See "Building the stands" below.
2. **A VESA bracket or low-profile wall mount**, stands removed. Cleanest result and puts the
   panel closest to the glass, but it means fixing hardware to the wall for a decoration.
3. **A board spanning the opening**, braced below. Attractive in principle, but 1.25″ is not
   enough bearing to rest one on the sill — it would need its own support anyway, which makes
   it option 1 with extra steps.

Option 1 unless the height works out awkwardly.

#### Support height

Sill surface is **27.75″ above the bedroom floor** (measured 2026-09-20), and the sill
**overhangs 1.25″ into the room**. That overhang is the useful part: with the table top set
just *below* sill height, the monitor's stand base tucks underneath it and the panel itself
gets as close to the glass as it can — which is where the reflection and sightline arguments
above both want it.

**Target table height: ~25–27″.** Ordinary nightstand, end-table or TV-tray territory; nothing
custom. The exact figure depends on how far the stand lifts the panel's bottom edge above its
base, which is unverified until the monitors arrive — **measure that before buying furniture**,
or use something stackable and tune it on install day.

This puts the panel low in the 48″ opening, its bottom edge just above the sill. That began as
a constraint imposed by furniture heights and is probably the better composition regardless:
an eye peering over the windowsill reads more naturally than one floating mid-window.

#### Building the stands

Two shop-built stands from cheap lumber, rather than hunting for furniture at a specific
height.

**The requirement that decides it: both eyes must sit at exactly the same height.** A colour
mismatch between panels is subtle; a height mismatch is not. A pair of eyes reads as belonging
to one creature partly through their alignment — offset them an inch and they stop being a
face and become two props in two windows. Two bought tables both described as "about 26
inches" can easily differ by that much. Cut both sets of legs in one session without moving
the stop and they are identical by construction. Check the floor is level at both windows, and
shim rather than re-cut if it is not.

**Build constraints:**

- **Top reaches the wall**, so the stand base tucks under the sill overhang and the panel sits
  close to the glass. **Check for baseboard** — it will hold the stand off the wall by roughly
  half an inch, and the back edge may want notching.
- **Top below 27.75″** so the base clears beneath the sill.
- **Top deep enough for the monitor's stand base** — measure it when the panels arrive; plan
  for ~8″ minimum, more for stability.
- **A lower shelf is worth the extra cut.** It stiffens the stand against racking, gives
  somewhere to add weight if it feels tippy, and gives the Pi a home — which shortens and
  tidies the cable runs. It does not change the 2 m cable spec (§11), which is deliberately
  robust to wherever the Pi ends up.

**Sequence — do not cut early.** Building means the height is chosen rather than accepted, so
the sightline mock-up (§10) stops being a sanity check and becomes the thing that sets the
build: (1) mock up with any screen at a few heights and judge from the street, (2) measure the
stand offset when the monitors arrive, (3) then cut. Everything else in this project is
reversible; a leg cut an inch short is not.
- **Light spill reveals the installation.** A large bright area throws light onto the room,
  the window frame, the siding and the curtain. This is the real argument for a warm, lower-
  output palette over a bright white one — not the black background, which every candidate
  style shares.
- **An LCD's black is not black.** Backlight leak means a faint dark rectangle is visible up
  close regardless of design — 1300:1 on these panels, so the black sits at roughly 0.2 nits
  against 250. At 40 ft it is negligible; at the door it is visible. Diffusion does not remove
  it, it spreads it into a dim glow across the whole opening, which is arguably worse. Trim
  masking removes it properly. This is a property of the panel, not of the artwork, and it
  does not favour any style over another.
- **Check sightlines from the actual street position at night**, not from inside the room.
- Monitors want tilting downward; viewers are on the ground looking up.
- Blinds must stay up, and condensation on the glass is worth a look on a cold night.

## 13. Open questions

1. **Install date — Sep 26–27 or Oct 10.** The earlier weekend is available and two days after
   the monitors land; it buys 13 extra running nights. Now also gated on stand-building time,
   since the stands cannot be cut until the monitors are measured (§12).
2. **Eye height** — to be chosen from the sightline mock-up (§10) rather than derived. It sets
   the stand height, so it is the first thing the mock-up should answer.
3. **Monitor stand offset** — how far the MP225's stand lifts the panel's bottom edge above its
   base. Not a design question, just a number to measure on arrival; with the eye height it
   fixes the cut list (§12).

*Resolved 2026-09-17: monitor models, resolutions, diagonals and inputs (§3); window and wall
measurements, and the finding that the stage gap is a timing parameter rather than a
measurement (§4.1).*

*Resolved 2026-09-19: the monitor purchase — two MSI PRO MP225 as a matched IPS pair (§3);
cabling reduced to two micro-HDMI cables with no adapters (§3, §11); running without a
diffuser is a supported mode rather than a compromise (§12); and, following from the matched
pair, colour calibration (§4.2) and the question of which monitor goes in which window both
disappear.*

*Resolved 2026-09-19: window opening 23″ × 48″ with a 1.25″ sill (§3). The sill cannot support
the panels, so a separate support is required (§12), and trim masking is no longer available.*

*Resolved 2026-09-20: Pi sits between the windows, so both HDMI runs are ~33.5″ before routing
— 2 m cables, not 1 m (§11). Sill height 27.75″ above the floor, so support tables at ~25–27″
put the stand base under the sill overhang and the panel against the glass (§12).*

*Resolved 2026-09-19: the schedule — 17:45 to 23:30 nightly, fixed clock times, time-gated,
across most of October (§7.3). The month-long run raised total runtime roughly sixfold and
forced the build order to be rewritten: physical install moved from week 6 to week 4, and
"install" was split into bench bring-up and physical placement (§10).*

*Resolved 2026-09-19: the visual style. Narrowed by a second reader to two shapes — Amber
sclera and Ember orb — with amber as the preferred palette and cat green retained (§4.7).
Both axes are switchable at runtime from a phone (§4.8), so the style never has to be finally
decided and can be changed on the night itself. Wide Ember and Cartoon are cut.*
