# Passenger navigation implementation status

Snapshot: 2026-10-31, branch `feature/navigation-implementation`. Parent [#154](https://github.com/JieGH/vibe_VLCmetroMap/issues/154) remains open until the acceptance gates below are satisfied.

| Sub-issue | Implementation and evidence |
|---|---|
| #155 | Unified transit/place search, explicit Destination preview, official 131-place landmark index with 13 university-library points, typo matching, configurable external address search. Real browser test found Biblioteca Histórica from `Bibliotca Històrica`. |
| #156 | Fixed local OTP API, current rail schedules and pedestrian routing, editable Starting Point, actual rail Journey verification. |
| #157 | Current EMT schedules and mixed-mode graph; real EMT-only and metro/bus Journeys verified. Per-operator calendar warnings preserve rail results when bus calendars expire. |
| #158 | Up to three distinct alternatives, fastest arrival first, walking cap and explicit longer-walk choice; actual GTFS branch duplicates corrected. |
| #159 | Explicit start, estimated/confirmed progress, boarding and call corrections, get-off banner, delayed-GPS protection, cleanup and native bridge. |
| #160 | Rail Arrival Memory immediately; explicit Start, Resume and Refresh request only the relevant transit stop. Cached EMT countdowns retain original timestamps, and predictions remain unconfirmed against a scheduled trip. |
| #161 | Persisted selected instructions, explicit resume with location/Arrival refresh attempts, offline/stale presentation, update-needed warnings, confirmed replacement and cancellation safeguards. Browser checks covered offline instructions, resume offer, manual landmark origin, retaining the old Journey during replanning, and saved-state cleanup. |
| #162 | iOS background location and OS notifications implemented and simulator-target app compiled. Physical-device acceptance remains open. |
| #163 | Android foreground service and OS notifications implemented; five native runtime regressions and debug/minified release builds pass. Physical-device acceptance remains open. |
| #164 | Shared integration and web QA implemented; final native device parity and production service configuration remain acceptance gates. |

## Verification and operational limits

- Full web suite: 1,392 tests passed. Lint completed with existing warnings. Two-axis review findings about GPS corrections, alert cleanup, resume refresh and recovery were fixed and verified.
- Native compilation does not establish locked-phone delivery, vibration, permission behavior or cleanup on a physical phone. Follow the platform validation documents before closing #162/#163.
- The local backend was built and queried against fresh official rail/EMT inputs. It has not been deployed as a production service. Native clients need a reachable configured navigation API; a phone's loopback address cannot reach this computer.
- External address search requires an explicitly configured compatible service. No account, paid hosting commitment, licence change or production deployment was made. The official landmark index works without that external service.
- Offline retention preserves selected instructions in a loaded website or the bundled native app; a website cold start while offline still depends on browser availability of the app shell. New offline routing/address searches are outside scope.
- Android lint additionally reports two pre-existing display-cutout `NewApi` errors; guidance-specific lint findings were fixed. The normal repository JavaScript lint command completes.

See [routing operations](../navigation-routing-operations.md), [iOS device validation](../capacitor/journey-guidance-ios.md), and [Android device validation](../capacitor/android-journey-guidance.md).
