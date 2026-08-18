# Mira V4 Entry Action Debug Record

## Initial reproduction — 1 August 2026

The V4 landing page rendered successfully in the isolated browser. Selecting **Enter my Brand World** redirected an unauthenticated browser session to the Manus OAuth sign-in route rather than directly creating a journey.

This confirms the entry action depends on authenticated session state. The user-reported in-page error still requires separate tracing from the authenticated create-journey procedure and its client error handling.

## Root cause and repair

The authenticated `miraV4.createJourney` request failed because the live `mira_v4_journeys` table was missing the `birthCountry` column that the current Drizzle schema includes in every insert and select. The matching `birthTimezone` column was present. This was an operational schema drift, not a redesign or client-flow issue.

The repair added the nullable `birthCountry varchar(128)` column in place. A post-repair live schema check confirmed the required location-column pair is now present (`1,1`), and the full regression suite and TypeScript check passed. The private V4 entry route also loaded successfully after restarting the staging service.

## Authenticated post-repair confirmation

At 17:04 UTC, the authenticated `miraV4.createJourney` request completed with HTTP 200 and returned journey ID `30001`. This confirms the primary action now creates and opens a new private Brand World after the live schema repair.
