# Station Focus and Dashboard Mode

The plan for [#10](https://github.com/JieGH/vib_metroValencia/issues/10). Written before the code, so the decisions are reviewable separately from the diff.

Evidence for the accessibility constraints below is in [`../research/transit-ui-best-practice.md`](../research/transit-ui-best-practice.md). Three UI prototypes were built and rejected first; they are kept on the `prototype/ui-ambient-vs-phone` branch. The split-dashboard variant was the closest, and this plan starts from it.

## The shape

The app becomes **two modes over one data model**.

| Mode | URL | For |
| :-- | :-- | :-- |
| **Map** (default) | `/` | Interactive. Click a Station, see its trains. Phone and tablet. |
| **Dashboard** | `/?mode=dashboard` | Ambient. A departure board on a tablet on a shelf, read across a room, untouched. |

You get into Dashboard from a toggle in the map UI, and out of it the same way; the URL is bookmarkable so an unattended tablet can boot straight into it.

## Map mode: Station Focus

Clicking a Station puts it **in focus**. Three things happen at once:

1. **The camera eases in** to centre the Station.
2. **The Station's marker expands** in place into a node showing both directions of travel, with the next train on each side.
3. **A Station panel opens** — docked right in landscape, bottom in portrait — with the full arrivals table.

```
 landscape                                      portrait
┌───────────────────────────┬───────────────┐  ┌───────────────────────┐
│                           │ ÀNGEL GUIMERÀ │  │                       │
│      ╭──────────────╮     │ ● LIVE API    │  │        map            │
│  ◄───┤  ÀNGEL G.    ├───► │───────────────│  │      ╭────────╮       │
│  L3● │ ▲ Rafelbunyol│     │ L3 Rafelbun. 2│  │  ◄───┤  À.G.  ├───►   │
│ 2min │ ▼ Aeroport   │     │ L1 Bétera    4│  │      ╰────────╯       │
│      ╰──────────────╯     │ L3 Aeroport  6│  ├───────────────────────┤
│                           │ L5 Marítim   9│  │ ÀNGEL GUIMERÀ ● LIVE  │
│         map               │ L9 Alboraia 12│  │ L3 Rafelbunyol      2 │
│                           │               │  │ L1 Bétera           4 │
└───────────────────────────┴───────────────┘  └───────────────────────┘
```

The panel is on the **right** in landscape because that is what was asked for, and it suits a right-handed thumb on a held tablet. Portrait docks it to the bottom, which is the only place a one-handed thumb reaches on a phone.

### Direction Groups

"Both directions if applicable" is the load-bearing phrase. A Station's arrivals are split into at most two **Direction Groups**, each labelled by the terminus it heads towards.

Direction comes from the engine, not from string-matching the headsign: `trainPositionEngine.resolveDirection(lineId, destination, station)` already answers "is this train travelling in the direction of increasing track distance", and that is the same axis for every Line through the Station. A terminus therefore yields one group, not two — hence "if applicable".

A Station served by several Lines puts all of them in the same two groups, ordered by countdown. The alternative — one group per Line per direction — was rejected: at Àngel Guimerà that is ten columns, which is a table, not a glance.

**The caveat this model carries**, found while building it: "forward" is per-Line, so at an interchange the two groups are *not* two compass directions. At Àngel Guimerà, L5 towards Marítim (east) lands in the same group as L3 towards Rafelbunyol (north), because both run towards increasing track distance on their own Line. It is exactly right at a Station on one or two Lines, which is most of the network, and rough at the handful of big interchanges. Two things keep it honest: the group label names every terminus in it, and each group carries the mean bearing of the track it leaves on — averaged as unit vectors, since bearings wrap — so the marker's arms point where the track actually goes rather than assuming up and down. If the hub case turns out to read badly, the fix is to group by bearing rather than by track direction, and that is a change to this one function.

### Countdown Heat

Each arrival's countdown is coloured on a red→amber→green ramp: imminent is hot.

Two constraints from the research bind this, and they are why the palette is not the one originally sketched:

- **Colour is never the only signal.** TCRP 45 §3.5.1: "Even if routes are color-coded, do not let the color of the route be the only identifier", and there is a practical ceiling of about nine distinguishable colours — Metrovalencia already runs ten Lines. So the heat ramp is confined to the **countdown value alone**. Line identity always rides on a labelled badge carrying the Line number. The countdown also always shows its number, so the colour is redundant encoding rather than the message.
- **Text must clear 4.5:1** (WCAG 2.2 SC 1.4.3). A single ramp cannot do that on both themes — the sketched amber `#ffb224` measures 1.80:1 on white. So there are two ramps, one per theme, holding the same hue order.

| Band | Dark (on `#1e1e24`) | | Light (on `#ffffff`) | |
| :-- | :-- | :-- | :-- | :-- |
| Due (≤ 0 s) | `#ff6369` | 5.72:1 | `#c62828` | 5.62:1 |
| ≤ 2 min | `#ff8b3d` | 7.12:1 | `#a34500` | 6.16:1 |
| ≤ 5 min | `#ffb224` | 9.20:1 | `#7a5200` | 6.92:1 |
| ≤ 10 min | `#a7c957` | 8.79:1 | `#4d7c0f` | 4.99:1 |
| > 10 min | `#3dd68c` | 8.84:1 | `#146c43` | 6.45:1 |

A test asserts every band clears 4.5:1 against its own theme's panel, so the ramp cannot be re-tuned into an inaccessible one by eye.

### Live API vs memory

The panel says which it is, because the two mean different things: a live answer was fetched now, a memory answer is a countdown running on from an older fetch. `arrivalStore.getCachedArrivals` already returns `isFresh` and `fetchedAt`; the panel surfaces them as a badge plus "confirmed N min ago". This is the existing `StationDetailCard` behaviour, kept and made more prominent.

## Dashboard mode

The rejected variant A, promoted and fixed. A departure board: no map, no interaction, rotating through a small set of Stations.

The research changes one thing about it materially. Ambient type has to be far larger than a normal layout: DfT *Inclusive Mobility* gives character height = viewing distance ÷ 137.5, TCRP 45 specifies 1/4° for wall-mounted maps, and tvOS body is 29 pt at ~8 ft. Those converge on roughly **42–75 CSS px at 2 m** on a tablet-class display. The prototype's 46 px destinations sat at the bottom of that band; the real thing targets the middle of it.

## Build order

| # | Slice | Depends on |
| :-- | :-- | :-- |
| 1 | Countdown Heat: the ramp, per theme, with the contrast test | — |
| 2 | Station Focus model: group a Station's arrivals into Direction Groups | — |
| 3 | Station panel: right in landscape, bottom in portrait | 1, 2 |
| 4 | Expanded Station marker on the map + camera ease-in | 2 |
| 5 | Dashboard mode: `?mode=dashboard`, the toggle, ambient type sizes | 1 |

1 and 2 are pure functions and get tests. 3, 4 and 5 are rendering and get judged by eye.

## Deliberately not in this plan

- **Per-Line direction groups.** Rejected above.
- **Rewriting the confidence fade.** The research found that opacity alone fails WCAG 1.4.11 (3:1 non-text contrast) — a real finding against `f0054ce`, shipped for [#7](https://github.com/JieGH/vib_metroValencia/issues/7). The fix is to hold marker outline contrast fixed and carry confidence in dash or badge instead, the way Simulated Trains already do it with shape rather than alpha. It is a separate ticket, not smuggled in here.
- **A withdrawal threshold for Dead Reckoning.** The research found no product ships a confidence *gradient*; the convention is binary plus withdrawing the vehicle entirely (Google Maps at 15 min, Transit at 10 min). Worth revisiting, but it changes the position model, not the UI.
