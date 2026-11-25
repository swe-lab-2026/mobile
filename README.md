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

The participant screen is intentionally search-first: the backend requires a
non-empty search term to list tickets for event staff. It does not fabricate an
attendee list. Reversal is checked by the server, and a `403` response is shown
to the user. The Undo (reverse check-in) action is shown only to users the
backend would allow (event owner, `PLATFORM_ADMIN`, or `EVENT_ADMIN` when the API
reports `staff_role`/`can_reverse_check_in` on `/events/assigned`).

Admission results are mapped from `error.details.admission_status`, so the
scanner and manual admission show distinct messages for admitted, invalid QR,
Campaign QR, wrong event, cancelled, refunded and already-used tickets. Network
failures keep the scanned payload so the same check-in can be retried.

The event detail screen reloads the event and attendance counters every time it
regains focus (for example after scanning), and shows a terminal state with a
retry action when the event is missing, access was revoked, or the API fails.

## Checks

```bash
npm run typecheck              # tsc --noEmit
npm run lint                   # expo lint
npm run doctor                 # expo-doctor
EXPO_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 npm run export:android
EXPO_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 npm run export:ios
```

`npm run check` runs typecheck, lint and doctor. The same steps, plus a clean
`npm ci` and both platform exports, run in `.github/workflows/mobile-checks.yml`.

## Learn more

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [NativeWind](https://www.nativewind.dev/)
