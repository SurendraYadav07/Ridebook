# RideGo

A ride-sharing mobile app for iOS and Android — book instant rides or schedule them in advance, track your driver live, and manage your trip history.

## Run & Operate

- `pnpm --filter @workspace/mobile run dev` — start Expo dev server (scan QR code in Expo Go to test on device)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Required env: `DATABASE_URL` — Postgres connection string (for API server)

## Stack

- **Mobile:** Expo (React Native), Expo Router, React Query, AsyncStorage
- **Maps:** react-native-maps@1.18.0 (pinned — only version compatible with Expo Go)
- **API:** Express 5 + TypeScript
- **DB:** PostgreSQL + Drizzle ORM (not yet wired to mobile — uses AsyncStorage)
- **Build tools:** pnpm workspaces, esbuild, TypeScript 5.9

## Where things live

- `artifacts/mobile/app/(tabs)/` — 4 main screens: Home, Schedule, Activity, Profile
- `artifacts/mobile/app/booking.tsx` — ride selection + driver matching flow
- `artifacts/mobile/app/tracking.tsx` — live driver tracking screen
- `artifacts/mobile/context/RideContext.tsx` — global ride state + AsyncStorage persistence
- `artifacts/mobile/components/RideMap.native.tsx` + `RideMap.web.tsx` — platform-specific map shims
- `lib/api-spec/openapi.yaml` — API contract (currently only health check)

## Architecture decisions

- **react-native-maps pinned to 1.18.0**: Only version that works in Expo Go. 1.18.0 does NOT polyfill on web; use `components/RideMap.native.tsx` / `RideMap.web.tsx` platform shims to avoid Metro web bundling errors.
- **AsyncStorage-first**: All ride data lives locally. Backend wiring is deferred to a follow-up task.
- **Platform-specific map shims**: Import `{ MapView, Marker, Polyline }` from `@/components/RideMap` — Metro auto-picks `.native` vs `.web` files.
- **Simulated driver tracking**: Tracking screen animates driver position with `setInterval`. Replace with WebSocket for production.

## Product

- **Book a ride**: Home tab → "Where to?" → pick destination → choose Economy/Premium/XL → confirm → driver matching → live tracking
- **Schedule a ride**: Schedule tab → set pickup, destination, date, time, ride type → schedule
- **Activity**: Upcoming (scheduled) and Past (completed) ride history with star ratings
- **Profile**: User stats, payment method, notification preferences

## User preferences

_Populate as you build._

## Gotchas

- Never upgrade react-native-maps beyond 1.18.0 unless Expo Go compatibility is verified.
- Do NOT add react-native-maps to the `plugins` array in app.json — it crashes the app.
- Always import map components from `@/components/RideMap`, not directly from `react-native-maps`.
- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change before using updated hooks.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `expo` skill for mobile development guidelines
