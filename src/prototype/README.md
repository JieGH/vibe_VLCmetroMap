# PROTOTYPE — throwaway

Not production code. No tests, no error handling, no abstractions worth keeping.

**The question:** what should this app look like, given it has to serve two contexts that pull in opposite directions — a tablet propped up at home, read across a room with no interaction, and a phone used one-handed on the move?

Four options on the existing app route, switchable via `?variant=`:

| `?variant=` | Name | Bet it makes |
| :-- | :-- | :-- |
| `current` | Today's UI | The baseline to judge against. |
| `A` | Departure board | **Drop the map.** Ambient-first: if it's on a shelf, you want departures, not geography. |
| `B` | Map + bottom sheet | **Phone-first.** The standard transit-app pattern (Citymapper, Transit, Apple Maps): full-bleed map, sheet you drag with a thumb. |
| `C` | Split dashboard | **Keep both.** Map beside a live network column; ambient but still spatial. |

```bash
npm run dev
# http://localhost:5173/?variant=A
```

Then use the floating bar at the bottom, or `←` / `→`, to flip between them. The bar and every variant are gated on `import.meta.env.PROD`, so none of this can ship.

## Notes for judging

- Real live data. The upstream API was up when this was built; if it goes down the map falls back to Simulated Trains (hollow, dashed) and the arrival lists go empty. That is the app being honest, not the prototype breaking.
- Resize the window to judge the phone case, or open it on your phone via the LAN URL `npm run dev` prints.
- **Markers sometimes never appear in `npm run dev`** — a StrictMode double-mount races MapLibre's `style.load` ([#8](https://github.com/JieGH/vib_metroValencia/issues/8)). It looks exactly like a broken prototype and is not. Reload.

The interesting answer is usually "the header from A with the sheet from B", not a single winner.
