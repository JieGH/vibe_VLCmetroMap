# Agent Guidelines

## Agent skills

### Issue tracker

GitHub issues at `JieGH/vib_metroValencia` using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`CONTEXT.md` and `docs/adr/` at repo root). See `docs/agents/domain.md`.

### Multi-Repository Architecture & Prototype UX Guardrails

**CRITICAL RULE FOR ALL AGENTS: DO NOT UNILATERALLY REDESIGN OR ALTER THE USER'S FINE-TUNED UX.**

1. **Workspace & Repositories Split:**
   - **Production App:** `/Users/peterab/Documents/GitHub/vib_metroValencia` (branch `main`).
   - **Prototype Worktree:** `/Users/peterab/Documents/GitHub/vib_bus_prototype` (branch `prototype/bus-roadmap`).
   - The user fine-tuned the multi-modal UX on `http://localhost:5174/?variant=A` culminating in commit `465201e` (*"feat: apply ping multimodal logic to GPS location with 5-min walk transit spawn and Where you're at hub"*).
   - **Never mix or overwrite working trees across these two directories.** Never push unvetted changes or introduce new layouts/tabs that break the user's fine-tuned Variant A design.

2. **EMT Bus Real-Time API Architecture (ADR-0011):**
   - **Live Arrivals Endpoint:** EMT SAE `https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php?sec=getSAE&parada={stopCode}&adaptados=false&idioma=va`.
   - **User-Agent Gate:** Standard browser `User-Agent` (`Mozilla/5.0...`) is mandatory. Default CLI scrapers (`curl`) receive a decoy error.
   - **Rate Budget & On-Demand Only:** EMT has 1,155 stops. **DO NOT background-poll all stops.** Fetch arrival predictions strictly **on-demand** when a user clicks a stop/station or drops a pin within range (<225m, the 3-minute walk radius, `src/utils/walkRadius.js`).
   - **Caching & Deduping:** 20-second in-memory TTL cache with in-flight request deduplication (`src/services/emtArrivalService.js`).
   - **"Train-First, Then Bus" Async Pattern:** Metro train arrivals render instantly (0ms) from local Arrival Memory; bus arrivals load in the background and pop in when ready.
   - **Live Fleet GPS:** If plotting buses on the map, query municipal ArcGIS Layer 384 (`Seguimiento_EMT`), which returns all active bus coordinates in 1 request (~130ms), rather than using timetable walks.
   - See `docs/research/realtime-bus-fetching.md` and `docs/research/emt-valencia-bus-api.md`.

### Workflow Completion Protocol

When returning completed work to the user:
1. Run all tests and verify linting passes (`npm test -- --run && npm run lint`).
2. Run `npm run build` to compile production assets and automatically trigger an **iOS Sync** (`postbuild: npx cap sync ios`).
3. Always include `test done` in the final response to the user.
The user runs the native app on their connected device directly via Xcode's Run (Play) button.
