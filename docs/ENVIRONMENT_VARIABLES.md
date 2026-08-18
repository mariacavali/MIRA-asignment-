# Local Environment Variable Template

Copy the variable names below into a local `.env` file when configuring a development environment. Leave provider variables blank until valid local credentials are supplied. **Do not commit the local `.env` file.**

```dotenv
# Core application and database
DATABASE_URL=
JWT_SECRET=
VITE_APP_ID=
OAUTH_SERVER_URL=
VITE_OAUTH_PORTAL_URL=

# Manus/Forge model, image, storage, and platform services
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=

# Optional semantic retrieval. Without these, MIRA uses deterministic lexical retrieval.
OPENAI_API_KEY=
OPENAI_EMBEDDING_BASE_URL=https://api.openai.com
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
VITE_FRONTEND_FORGE_API_URL=
VITE_FRONTEND_FORGE_API_KEY=

# Mira V3 feature flags
MIRA_V3_ENABLED=false
MIRA_V3_BIRTH_DATA_ENABLED=false

# Optional private V3 birth-context provider
DAKIDARTS_API_KEY=
DAKIDARTS_API_BASE_URL=https://api.numerologyapi.com/api/v1

# Optional local branding metadata
VITE_APP_TITLE=Mira
VITE_APP_LOGO=
```

The application reads the active server-side configuration through `server/_core/env.ts`. V4 has no separate feature flag or Human Design credential in the current implementation.
