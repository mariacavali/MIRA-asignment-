# Dakidarts API integration notes

Authoritative sources reviewed on 11 July 2026:

- Dakidarts repository: https://github.com/dakidarts/the-numerology-api
- Dakidarts product documentation: https://docs.numerologyapi.com/
- Dakidarts API overview: https://dakidarts.com/api/the-numerology-api/
- Dakidarts terms: https://numerologyapi.com/terms

## Current direct API contract

The maintained direct platform uses the base URL `https://api.numerologyapi.com/api/v1`. The user supplied the platform's authorization protocol confirming server-side authentication through `X-API-Key: YOUR_API_KEY` and TLS transport. The public documentation describes clean JSON responses, GET and POST support, and an API-key dashboard at `https://dashboard.numerologyapi.com/`.

The official schema is available at `https://api.numerologyapi.com/openapi.json`. The user-provided endpoint catalog confirms `GET /api/v1/horoscope/sign/personality`. Mira will use this single route with a `dob=YYYY-MM-DD` query because it needs only the birth date. It is more data-minimizing than the birth-chart and personal-archetype routes and avoids transmitting a name, phone number, address, image, birth time, or location. Phone, career-code, compatibility, forecast, report, SVG, and all other API families are explicitly out of scope.

## Privacy and licensing constraints

The terms state that submitted data is processed to provide the service, API keys must remain confidential, results may be used in applications, and raw API data must not be bulk redistributed. Cached responses are permitted for up to 24 hours. The service describes numerology outputs as entertainment, educational, or informational and not as professional advice or a guaranteed basis for critical decisions.

## Project-specific conclusion

No Dakidarts connector or credential is currently configured in the task configuration. The Mira adapter therefore needs an optional server-only API key and a graceful unavailable/failed result. Raw vendor responses, vendor terminology, labels, and numeric values must remain server-private; only bounded qualitative reflection signals should be persisted and passed to Mira's adaptive and Recognition prompts.
