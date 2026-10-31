# Navigation service constraints

Research checked 2026-10-31. Free service accounts and a routing backend are acceptable to the user. No specific provider, hosting purchase, or licence change has been approved, and no account has been created.

## Address and landmark search

- Public Nominatim explicitly prohibits client autocomplete; its public instance cannot supply the agreed search-as-you-type experience. This restriction is specific to that public service. [Official policy](https://operations.osmfoundation.org/policies/nominatim/).
- Photon supports search-as-you-type, typo tolerance, multilingual search, and geographic bias/filtering. Its public demo allows reasonable use but has no availability guarantee; production reliability requires a deliberate hosting/service decision. [Official repository](https://github.com/komoot/photon).
- Geoapify offers a hosted free tier, currently 3,000 credits per day and 5 requests per second. Autocomplete costs one credit per request and supports address/place queries and geographic bias. Representative Valencia landmarks and misspellings still require quality testing; reviewed documentation does not establish full typo tolerance. [Pricing](https://www.geoapify.com/pricing/), [autocomplete documentation](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/).

## Journey planning

- Transitous's hosted service requires an appropriate open-source licence, noncommercial/light use, identifying headers, and attribution; higher traffic requires coordination. The repository's current all-rights-reserved licence does not qualify as-is. Do not change the licence to obtain access without an explicit user decision. [Official API policy](https://transitous.org/api/).
- OpenTripPlanner can be self-hosted using GTFS schedules and an OSM street graph. This requires backend hosting, graph builds, feed refresh, and coverage validation; it is not a free hosted API. [Official tutorial](https://docs.opentripplanner.org/en/latest/Basic-Tutorial/).
- The municipality publishes EMT GTFS schedules. A fresh download and calendar validation are still required. Existing EMT stop points and Line membership are insufficient routing input. [Official municipal dataset](https://opendata.vlci.valencia.es/dataset/google-transit-lines-stops-bus-schedules).
- Existing rail feed tooling downloads official Metrovalencia GTFS. The local Line 3 timetable is expired and does not cover complete passenger Journeys. Full rail and EMT feeds need refreshing and validation before route quality can be assessed.
- Current EMT arrival parsing does not expose a GTFS trip ID or Vehicle ID. Matching a live Arrival to a scheduled Journey requires a validated strategy with uncertainty handling; fleet coordinates alone do not identify the passenger's Vehicle.

## Tracking

- Web geolocation depends on a fully active, visible document; continuous locked-phone tracking cannot be promised for the website. [W3C Geolocation](https://w3c.github.io/geolocation/#request-a-position).
- The existing Capacitor Geolocation plugin does not directly support background geolocation. Native Journey tracking needs additional OS integration and validation. [Official plugin documentation](https://capacitorjs.com/docs/apis/geolocation).
- Android active navigation can use a foreground location service with a persistent notification. Background-location permission is not automatically required for every screen-off tracking design. [Android location permissions](https://developer.android.com/develop/sensors-and-location/location/permissions).
- Exact iOS background capability/session requirements remain to be verified against Apple documentation and on a device.

## Approved constraints and remaining validation

The user approved service accounts within free quotas and a backend for Journey planning (Q16). Provider selection still needs coverage, quota, operational, and licence validation. Bring any paid hosting or service commitment to the user before purchasing; do not assume that a public demo supplies a dependable free service.
