# Acceptance Provider Contracts

## Human Design API

Official documentation: https://docs.humandesignapi.nl/

The agreed provider in the shared implementation plan is `humandesignapi.nl` (or an equivalent genuine Human Design chart provider), not a horoscope-personality endpoint. The official v2 simple-chart request is:

- `POST https://api.humandesignapi.nl/v2/charts/simple`
- `Authorization: Bearer <HD API key>`
- `HD-Geocode-Key: <Google geocoding key>` for location-based endpoints
- JSON body: `birthdate`, `birthtime`, `location`

The standard v2 response envelope contains `success`, `errorCode`, and `data`. The simple chart data includes `type`, `profile`, `gates`, `channelsShort`, and `centers`. Advanced endpoints also expose strategy, authority, incarnation cross, definition, activations, signature, and not-self theme.

Sources:

- https://docs.humandesignapi.nl/quickstart
- https://docs.humandesignapi.nl/authentication
- https://humandesignapi.nl/faq

The current project adapter is not a genuine Human Design integration: it defaults to `https://api.numerologyapi.com/api/v1/horoscope/sign/personality` and must not be accepted as Human Design.

## Dakidarts

Dakidarts is a separate numerology/horoscope/astrology provider. Its public product information identifies "The Numerology API" as its API product; it must not be conflated with Human Design.

Sources:

- https://dakidarts.com/api/the-numerology-api/
- https://github.com/dakidarts/the-numerology-api

Acceptance must therefore verify Human Design and Dakidarts independently. If either lacks credentials or a confirmed endpoint contract, it must be reported as blocked or not implemented rather than treated as complete.
