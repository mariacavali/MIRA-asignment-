# Dakidarts Provider Notes

Verified on 12 July 2026 from official Dakidarts sources.

## Active direct platform contract

- Product: The Numerology API by Dakidarts.
- Direct base URL: `https://api.numerologyapi.com`.
- Endpoint prefix: `/api/v1/`.
- Authentication: `X-API-Key: <key>` or `Authorization: Bearer <key>`.
- Current official example: `GET /api/v1/life_path?birth_year=1990&birth_month=5&birth_day=15&lang=en`.
- The older RapidAPI route uses `https://the-numerology-api.p.rapidapi.com` with `x-rapidapi-key` and `x-rapidapi-host`; Mira should use one configured channel consistently and must not call horoscope routes.

## Current pricing

- The direct platform publishes pay-as-you-go credit pricing: 1 USD = 3,921.57 credits; one core request is one credit, approximately USD 0.000255.
- Thirteen separate approved requests therefore cost approximately USD 0.003315 per completed birth profile before caching.
- USD 5 represents approximately 19,607 core requests, or approximately 1,508 thirteen-request profiles.
- The platform also historically documented a RapidAPI free tier of 100 requests per month and subscription plans, but the direct platform now presents credit-based billing.

## Approved Mira scope

Mira may use only the user-approved private signals: Life Path, Destiny, Heart Desire, Personality, Challenge, Maturity, Pinnacle Cycles, Period Cycles, Essence Cycle, Hidden Passion, Karmic Lessons, Karmic Debt, and Personal Year. All other Dakidarts endpoint families—including horoscope, astrology, tarot, compatibility, business readings, and extended spiritual reports—are excluded.

## Verified endpoint contracts

The official integration guide documents the following core routes and parameters:

- `/life_path`: `year`, `month`, `day` on the legacy/RapidAPI contract; the direct-platform README currently demonstrates `birth_year`, `birth_month`, `birth_day`, and `lang=en`.
- `/expression_number`: `first_name`, `middle_name`, `last_name` (Destiny/Expression).
- `/soul_urge`: `first_name`, `middle_name`, `last_name` (Heart Desire/Soul Urge).
- `/personality_number`: `first_name`, `middle_name`, `last_name`.
- `/challenge_number`: `birth_day`, `birth_month`, `birth_year`.
- `/hidden-passion`: full-name-derived endpoint, GET and POST supported.
- `/maturity-number`: Life Path plus Destiny-derived endpoint, GET and POST supported.
- `/pinnacle-cycles`: birth-derived endpoint, GET and POST supported.
- The official product overview also confirms Karmic Lessons, Karmic Debt, Life Period Cycles, Personal Year, and other core numerology surfaces. Exact request parameters must be verified against the live direct documentation before relying on those routes.

Because Destiny, Heart Desire, Personality, Hidden Passion, and Karmic Lessons are name-derived, the Mira form must collect a legal/full birth name privately. Birth location, birth time, and timezone are not required for these approved numerology signals and must not be sent to horoscope or astrology routes.

The current direct-platform documentation at `https://docs.numerologyapi.com/` confirms these exact contracts:

| Approved signal | GET path under `https://api.numerologyapi.com/api/v1` | Required inputs |
| --- | --- | --- |
| Life Path | `/life_path` | `birth_year`, `birth_month`, `birth_day`; optional `num_sys=pythagorean`, `lang=en` |
| Heart Desire | `/heart_desire` | `first_name`, optional `middle_name`, `last_name`; optional `num_sys=pythagorean`, `lang=en` |
| Personality | `/personality_number` | `first_name`, optional `middle_name`, `last_name`; optional `num_sys=pythagorean`, `lang=en` |
| Hidden Passion | `/hidden-passion` | `fullname`; optional `num_sys=pythagorean`, `lang=en` |
| Maturity | `/maturity-number` | `dob` as `YYYY-MM-DD`, `full_name`; optional `num_sys=pythagorean`, `lang=en` |
| Pinnacle Cycles | `/pinnacle-cycles` | `dob` as `YYYY-MM-DD`; optional `lang=en` |
| Period Cycles | `/period_cycles` | `birth_year`, `birth_month`, `birth_day`; optional `lang=en` |
| Essence Cycle | `/essence-cycle` | `full_name`, `dob`, `start_year`; optional `num_sys=pythagorean`, `lang=en` |
| Personal Year | `/personal_year` | `birth_day`, `birth_month`, `prediction_year`; optional `lang=en` |
| Karmic Debt | `/karmic_debt` | `birth_year`, `birth_month`, `birth_day`; optional `lang=en` |
| Destiny / Expression | `/destiny_number` | `first_name`, optional `middle_name`, `last_name`; optional `num_sys=pythagorean`, `lang=en` |
| Karmic Lessons | `/karmic_lessons` | `full_name`; optional `num_sys=pythagorean`, `lang=en` |
| Challenge Number | `/challenge_number` | `birth_year`, `birth_month`, `birth_day`; optional `lang=en` |

Official source pages used: `https://docs.numerologyapi.com/api-reference/core/life-path/`, `/core/heart-desire/`, `/core/personality/`, `/core/hidden-passion/`, `/core/maturity-number/`, `/cycles/pinnacle-cycles/`, `/cycles/life-period-cycles/`, `/cycles/essence-cycle/`, `/cycles/personal-year/`, and `/karmic/debt/`.

Additional official source pages: `https://docs.numerologyapi.com/api-reference/core/destiny-number/`, `/karmic/lesson/`, and `/karmic/challenge/`.

## Live adapter verification

On 12 July 2026, the gated live-provider regression completed all thirteen approved calls successfully against the direct platform. The regression also confirmed that the adapter collapses those responses into one bounded, privacy-safe Recognition Layer and does not retain raw provider output or signal-level labels.

The live `/personality_number` contract currently rejects a missing or explicitly empty `middle_name`, despite the public documentation describing that field as optional. A populated three-part synthetic birth name was therefore used for the complete live contract regression. Mira must continue to treat provider failure as optional enrichment failure and must never block the core conversation journey.

The authenticated staging interface was also verified after a substantive first answer. The optional personalisation interlude appeared before question two with the approved explanation, full birth-name and birth-detail fields, a visible skip path, and a responsive 390 × 844 mobile layout.

## Sources

1. Dakidarts integration guide: https://dakidarts.com/p/how-to-integrate-the-dakidarts-numerology-api-into-your-website-or-mobile-app-with-examples/
2. Official repository and direct-platform contract: https://github.com/dakidarts/the-numerology-api
3. Official product and pricing page: https://numerologyapi.com/
4. Official API overview and historical pricing: https://dakidarts.com/api/the-numerology-api/
