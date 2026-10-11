# RideGo

A ride-sharing mobile app for iOS and Android — book instant rides or schedule them in advance, track your driver live, and manage your trip history.

## Run & Operate

- `pnpm --filter @workspace/mobile run dev` — start Expo dev server (scan QR code in Expo Go to test on device)
- `pnpm --filter @workspace/api-server run dev` — build and run the API server (port 4000 by default)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm run db:generate` — generate a Drizzle SQL migration after schema changes
- `pnpm run db:migrate` — apply checked-in migrations to the configured PostgreSQL database
- Copy `.env.example` to the repository root `.env` and configure `DATABASE_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` before starting the API. The API also loads `artifacts/api-server/.env` for local overrides. Production also needs an SMS provider, map keys, and payment credentials for those features.
- Provision PostgreSQL with PostGIS enabled by a database administrator before applying migrations; the initial migration creates the app schema.

### Local PostgreSQL on macOS

Install PostgreSQL 17 and PostGIS, then start PostgreSQL:

```sh
brew install postgresql@17 postgis
brew services start postgresql@17
```

Create an app-specific database role and database. Enable PostGIS as the local PostgreSQL administrator before running migrations:

```sh
createuser ridebooker
createdb --owner=ridebooker ridebooker
psql -d ridebooker -c 'CREATE EXTENSION postgis;'
```

Set `DATABASE_URL=postgresql://ridebooker:<password>@localhost:5432/ridebooker` in the root `.env`, then run `pnpm run db:migrate`.

## Stack

- **Mobile:** Expo (React Native), Expo Router, React Query, AsyncStorage
- **Maps:** react-native-maps@1.20.1 (Expo SDK 54 compatible)
- **API:** Express 5 + TypeScript in `@workspace/api-server`
- **DB:** PostgreSQL + Drizzle ORM in `@workspace/db` (fully wired to API and mobile client)
- **Real-Time:** WebSocket telemetry server for live driver position tracking and offer dispatching
- **Build tools:** pnpm workspaces, esbuild, TypeScript 5.9

## Where things live

- `artifacts/mobile/app/(tabs)/` — 4 main screens: Home, Schedule, Activity, Profile
- `artifacts/mobile/app/booking.tsx` — ride selection + driver matching flow
- `artifacts/mobile/app/tracking.tsx` — live driver tracking screen
- `artifacts/mobile/context/RideContext.tsx` — global ride state + AsyncStorage persistence
- `artifacts/mobile/components/RideMap.native.tsx` + `RideMap.web.tsx` — platform-specific map shims
- `lib/api-spec/openapi.yaml` — API contract and generated typed mobile client

## Architecture decisions

- **Authoritative Backend**: All ride booking, driver matching, pricing/promo validation, payments, and KYC verification run through the Express API server with PostgreSQL and Drizzle ORM.
- **Platform-specific map shims**: Import `{ MapView, Marker, Polyline }` from `@/components/RideMap` — Metro auto-picks `.native` vs `.web` files.
- **Real-Time Driver Tracking**: Uses WebSocket telemetry streaming with smooth interpolation and bearing alignment.

## Product

- **Book a ride**: Home tab → "Where to?" → pick destination → choose Economy/Premium/XL → confirm → driver matching → live tracking
- **Schedule a ride**: Schedule tab → set pickup, destination, date, time, ride type → schedule
- **Activity**: Upcoming (scheduled) and Past (completed) ride history with star ratings
- **Profile**: User stats, payment method, notification preferences

## User preferences

_Populate as you build._

## Production setup

1. Configure a PostgreSQL database with PostGIS, then set `DATABASE_URL` and run `pnpm run db:migrate`.
2. Set separate high-entropy `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values.
3. Configure `CORS_ALLOWED_ORIGINS`, an SMS provider, Google Maps keys, Razorpay keys and webhook secret, and object storage as needed by enabled features. Missing production provider configuration fails closed for payment and OTP flows.
4. Start the API with `pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/api-server run start`. The process checks database connectivity before listening; `/api/healthz` also checks database readiness.
5. Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_GOOGLE_MAPS_CLIENT_API_KEY` in EAS environments, link an EAS project, then build with the profiles in `artifacts/mobile/eas.json`.

Always import map components from `@/components/RideMap`, not directly from `react-native-maps`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `expo` skill for mobile development guidelines
