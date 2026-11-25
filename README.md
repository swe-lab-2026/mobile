# BiletFlow Mobile

Expo Router + React Native + TypeScript + NativeWind client for the BiletFlow
FastAPI backend.

## Requirements

- Node.js and npm
- Expo Go or a development build (the QR scanner needs camera access)
- A running BiletFlow backend with the `/api/v1` API prefix enabled

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file from the example:

   ```bash
   cp .env.example .env
   ```

3. Set `EXPO_PUBLIC_API_BASE_URL` to the backend API URL. It must be an absolute
   `http(s)` URL and include `/api/v1`.

   | Target             | Example value                              |
   | ------------------ | ------------------------------------------ |
   | Android emulator   | `http://10.0.2.2:8000/api/v1`              |
   | iOS simulator      | `http://127.0.0.1:8000/api/v1`             |
   | Physical device    | `http://<your-computer-LAN-IP>:8000/api/v1` |
   | Deployed backend   | `https://api.example.com/api/v1`           |

   Physical devices cannot reach the computer through `localhost`; use the
   computer's LAN IP and make sure both devices are on the same network. Expo
   public environment variables are inlined at bundle time, so restart Metro
   after changing `.env`.

   **Release/demo builds require HTTPS.** Plain `http://` is accepted only in
   development builds (`__DEV__`) and only for local/LAN hosts (`localhost`,
   `127.0.0.1`, `10.0.2.2`, private `10.x`/`172.16-31.x`/`192.168.x`). Both the iOS
   and Android demo builds must use the same deployed API. Never put API secrets
   or private keys in `EXPO_PUBLIC_*` variables because they are included in the
   client bundle.

4. Start the app:

   ```bash
   npm run start
   # or: npm run android / npm run ios / npm run web
   ```

There is no built-in fallback URL. If `EXPO_PUBLIC_API_BASE_URL` is missing or
invalid for the build type, the app shows a configuration error screen instead of
sending requests anywhere. Trailing
slashes are normalized, and `/api/v1` is appended when the configured URL does
not already include it.

## Authentication and sessions

- Login calls `POST /api/v1/auth/login` and then `GET /api/v1/users/me`. The user
  is not considered authenticated until both requests succeed.
- Access tokens stay in memory. Refresh tokens are stored with
  `expo-secure-store` on Android and iOS.
- On web, SecureStore is not called. The refresh token is kept in
  `sessionStorage`, which is cleared when the browser tab closes.
- App startup restores the session by calling `POST /api/v1/auth/refresh`,
  persisting the rotated refresh token, and reloading the profile.
- Concurrent `401 TOKEN_EXPIRED` responses share one refresh request. Tokens are
  never refreshed in parallel, preventing refresh-token reuse revocation.
- Logout calls `POST /api/v1/auth/logout` with the refresh token and always clears
  local state, even if the network request fails.
- Network failures are treated as transient; only definitive `401`/`403`
  responses invalidate the local session.

## Authorization model

Global roles are `USER` and `PLATFORM_ADMIN`. Event permissions are scoped to an
event: owners and event staff with `EVENT_ADMIN` or `CHECK_IN_STAFF` can access
events returned by `GET /api/v1/events/assigned`. The mobile app does not treat
`EVENT_ADMIN` as a global role. The backend remains the source of truth for all
event and check-in permissions.

## Features backed by the API

- Assigned event list and event details
- Attendance statistics from `GET /api/v1/events/{event_id}/tickets/stats`
- QR check-in through `POST /api/v1/events/{event_id}/check-in`
- Manual ticket search through `GET /api/v1/events/{event_id}/tickets/search`
- Manual check-in and reversal through the ticket `public_id` endpoints

`GET /api/v1/events/assigned` is the single source of events in the app (it
already includes events the user owns), so every listed event can be opened and
scanned. Event details, the scanner and the participant screen re-check it on
every focus, so a revoked assignment is noticed immediately. Owner-only
management (edit, ticket types, administrators, publish, duplicate, cancel) is
shown only when `GET /api/v1/events/{id}` succeeds, which the backend allows only
for the owner or a platform admin; admission staff never see those actions.

The participant screen is intentionally search-first: the backend requires a
non-empty search term to list tickets for event staff (owners have a separate
attendee export that is not part of the admission workflow). Search is
server-side, debounced, paginated (50 per page, "Load more"/infinite scroll, no
result cap) and drops out-of-order responses. "Show/Hide details" only masks or
reveals names and emails on screen.

The Undo (reverse check-in) action follows the caller-specific
`can_reverse_check_in` flag from `GET /api/v1/events/assigned` (true for the event
owner, `PLATFORM_ADMIN` and assigned `EVENT_ADMIN`; false for `CHECK_IN_STAFF`).
If the flag is missing, Undo stays hidden. The backend still authorizes every
reversal request, and a confirmation is required first.

Admission results are mapped from `error.details.admission_status`, so the
scanner and manual admission show distinct messages for admitted, invalid QR,
ticket not found, Campaign QR, wrong event, cancelled, refunded, already-used
(with the original check-in time), permission, timeout, network and server
errors. The scanner runs the camera only while focused, allows one request at a
time, ignores the code that was just handled for a few seconds after "Scan next",
and offers a Retry for transient failures that cannot run concurrently.

**Lost responses.** Requests time out after 15 s and are never retried
automatically. If a check-in times out or the connection drops, the outcome is
unknown (the server may have recorded it). The scanner says so and offers Retry;
if the retry answers "already checked in" with a check-in time from around the
first attempt, the app shows "Check-in already recorded" rather than a duplicate
warning.

Attendance counters come only from `GET .../tickets/stats` and are never derived
from search results. They refresh on focus, after manual check-in and reversal,
on pull-to-refresh and via the Refresh link. When a refresh fails, the last
values stay visible with an explicit "could not refresh" notice.

## Localization

Russian (default), Kazakh and English cover the admission workflow, auth screens
and organizer management. The chosen language is persisted (SecureStore on
native, `localStorage` on web) and restored on launch. Event dates and times are
shown in the event's own timezone.

## Checks

```bash
npm run typecheck              # tsc --noEmit
npm run lint                   # expo lint
npm test                       # jest (jest-expo preset), src/__tests__
npm run doctor                 # expo-doctor
EXPO_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 npm run export:android
EXPO_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 npm run export:ios
```

Expo type declarations come from `"types": ["expo/types"]` in `tsconfig.json`,
so `npm run typecheck` works from a clean checkout without the generated
`expo-env.d.ts`. `npm run doctor` runs `expo-doctor` through `npx` (it is not a
project dependency). `npm run check` runs typecheck, lint, tests and doctor. The same steps, plus a clean
`npm ci` and both platform exports, run in `.github/workflows/mobile-checks.yml`.

## Learn more

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [NativeWind](https://www.nativewind.dev/)
