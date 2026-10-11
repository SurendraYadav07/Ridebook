import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import { db, rideLocationsTable, driversTable, ridesTable, usersTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { verifyAccessToken } from "./crypto";

export interface AuthenticatedSocket extends WebSocket {
  isAlive: boolean;
  userId?: string;
  role?: string;
  driverId?: string;
  subscribedRooms: Set<string>;
}

const rooms = new Map<string, Set<AuthenticatedSocket>>();
const userSockets = new Map<string, Set<AuthenticatedSocket>>();
const driverSockets = new Map<string, Set<AuthenticatedSocket>>();

let wss: WebSocketServer | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

export function initWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (url.pathname === "/ws" || url.pathname === "/api/ws") {
      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", async (ws: WebSocket, request: IncomingMessage) => {
    const authWs = ws as AuthenticatedSocket;
    authWs.isAlive = true;
    authWs.subscribedRooms = new Set();

    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    const token = url.searchParams.get("token") || request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      authWs.close(4401, "Authentication required");
      return;
    }

    try {
      const decoded = verifyAccessToken(token);
      const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, decoded.sub) });
      if (!user || user.status !== "active" || user.isBlocked || user.role !== decoded.role) {
        authWs.close(4401, "Invalid account session");
        return;
      }
      authWs.userId = user.id;
      authWs.role = user.role;
      if (!userSockets.has(user.id)) userSockets.set(user.id, new Set());
      userSockets.get(user.id)!.add(authWs);

      if (user.role === "driver") {
        const driver = await db.query.driversTable.findFirst({ where: eq(driversTable.userId, user.id) });
        if (!driver || driver.isBlocked) {
          authWs.close(4403, "Driver account unavailable");
          cleanupSocket(authWs);
          return;
        }
        authWs.driverId = driver.id;
        if (!driverSockets.has(driver.id)) driverSockets.set(driver.id, new Set());
        driverSockets.get(driver.id)!.add(authWs);
      }
    } catch {
      authWs.close(4401, "Invalid access token");
      return;
    }

    authWs.on("pong", () => {
      authWs.isAlive = true;
    });

    authWs.on("message", async (data: any) => {
      try {
        const payload = JSON.parse(data.toString());
        await handleSocketMessage(authWs, payload);
      } catch {}
    });

    authWs.on("close", () => {
      cleanupSocket(authWs);
    });
  });

  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws: WebSocket) => {
      const authWs = ws as AuthenticatedSocket;
      if (!authWs.isAlive) {
        cleanupSocket(authWs);
        return authWs.terminate();
      }
      authWs.isAlive = false;
      authWs.ping();
    });
  }, 30_000);

  return wss;
}

export function closeWebSocketServer(): Promise<void> {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (!wss) return Promise.resolve();
  const server = wss;
  wss = null;
  for (const client of server.clients) client.close(1001, "Server shutting down");
  return new Promise((resolve) => server.close(() => resolve()));
}

async function handleSocketMessage(ws: AuthenticatedSocket, payload: any) {
  const { event, data } = payload;
  if (!event) return;

  switch (event) {
    case "subscribe": {
      const room = data?.room;
      if (room && typeof room === "string" && await canSubscribeToRoom(ws, room)) {
        subscribeToRoom(ws, room);
        ws.send(JSON.stringify({ event: "subscribed", data: { room } }));
        const rideRoom = room.match(/^ride:([0-9a-f-]{36})$/i);
        if (rideRoom) {
          const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, rideRoom[1]) });
          if (ride?.driverId) {
            const [lastRideLocation, driver] = await Promise.all([
              db.query.rideLocationsTable.findFirst({
                where: eq(rideLocationsTable.rideId, ride.id),
                orderBy: [desc(rideLocationsTable.recordedAt)],
              }),
              db.query.driversTable.findFirst({ where: eq(driversTable.id, ride.driverId) }),
            ]);
            const latitude = Number(lastRideLocation?.latitude ?? driver?.currentLatitude);
            const longitude = Number(lastRideLocation?.longitude ?? driver?.currentLongitude);
            const locationRecordedAt = lastRideLocation?.recordedAt ?? driver?.locationUpdatedAt;
            const locationAgeMs = locationRecordedAt ? Date.now() - locationRecordedAt.getTime() : Infinity;
            if (Number.isFinite(latitude) && Number.isFinite(longitude) && locationAgeMs >= -5000 && locationAgeMs <= 30000) {
              ws.send(JSON.stringify({
                event: "driver:location:update",
                data: {
                  rideId: ride.id,
                  driverId: ride.driverId,
                  latitude,
                  longitude,
                  heading: lastRideLocation?.heading == null ? null : Number(lastRideLocation.heading),
                  speed: lastRideLocation?.speedMetersPerSecond == null ? null : Number(lastRideLocation.speedMetersPerSecond),
                  timestamp: locationRecordedAt!.toISOString(),
                },
              }));
            }
          }
        }
      } else {
        ws.send(JSON.stringify({ event: "error", data: { message: "Not authorized to subscribe to this room." } }));
      }
      break;
    }

    case "unsubscribe": {
      const room = data?.room;
      if (room && typeof room === "string") {
        unsubscribeFromRoom(ws, room);
      }
      break;
    }

    case "driver:location": {
      if (ws.driverId && data?.latitude != null && data?.longitude != null) {
        const lat = Number(data.latitude);
        const lng = Number(data.longitude);
        const heading = data.heading != null ? Number(data.heading) : null;
        const speed = data.speed != null ? Number(data.speed) : null;
        if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180 ||
            (heading !== null && (!Number.isFinite(heading) || heading < 0 || heading >= 360)) ||
            (speed !== null && (!Number.isFinite(speed) || speed < 0))) return;

        if (data.rideId) {
          const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, String(data.rideId)) });
          if (!ride || ride.driverId !== ws.driverId || !["driver_assigned", "driver_arriving", "driver_arrived", "picking_up", "trip_started", "riding"].includes(ride.status)) return;
        }

        await db
          .update(driversTable)
          .set({
            currentLatitude: String(lat),
            currentLongitude: String(lng),
            location: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`,
            locationUpdatedAt: new Date(),
          })
          .where(eq(driversTable.id, ws.driverId));

        if (data.rideId) {
          await db.insert(rideLocationsTable).values({
            rideId: data.rideId,
            latitude: String(lat),
            longitude: String(lng),
            heading: heading != null ? String(heading) : null,
            speedMetersPerSecond: speed != null ? String(speed) : null,
          });

          broadcastToRoom(`ride:${data.rideId}`, "driver:location:update", {
            rideId: data.rideId,
            driverId: ws.driverId,
            latitude: lat,
            longitude: lng,
            heading,
            speed,
            timestamp: new Date().toISOString(),
          });
        }
      }
      break;
    }
  }
}

async function canSubscribeToRoom(ws: AuthenticatedSocket, room: string): Promise<boolean> {
  if (!ws.userId) return false;
  const userRoom = room.match(/^user:([0-9a-f-]{36})$/i);
  if (userRoom) return userRoom[1] === ws.userId;
  const driverRoom = room.match(/^driver:([0-9a-f-]{36})$/i);
  if (driverRoom) return driverRoom[1] === ws.driverId;
  const rideRoom = room.match(/^ride:([0-9a-f-]{36})$/i);
  if (!rideRoom) return false;
  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, rideRoom[1]) });
  if (!ride) return false;
  if (ride.passengerId === ws.userId) return true;
  return Boolean(ws.driverId && ride.driverId === ws.driverId);
}

export function subscribeToRoom(ws: AuthenticatedSocket, room: string) {
  ws.subscribedRooms.add(room);
  if (!rooms.has(room)) {
    rooms.set(room, new Set());
  }
  rooms.get(room)!.add(ws);
}

export function unsubscribeFromRoom(ws: AuthenticatedSocket, room: string) {
  ws.subscribedRooms.delete(room);
  rooms.get(room)?.delete(ws);
}

function cleanupSocket(ws: AuthenticatedSocket) {
  for (const room of ws.subscribedRooms) {
    rooms.get(room)?.delete(ws);
  }
  if (ws.userId) {
    userSockets.get(ws.userId)?.delete(ws);
  }
  if (ws.driverId) {
    driverSockets.get(ws.driverId)?.delete(ws);
  }
}

export function broadcastToRoom(room: string, event: string, data: any) {
  const subscribers = rooms.get(room);
  if (!subscribers) return;

  const msg = JSON.stringify({ event, data });
  subscribers.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

export function broadcastToRide(rideId: string, event: string, data: any) {
  broadcastToRoom(`ride:${rideId}`, event, data);
}

export function broadcastToDriver(driverId: string, event: string, data: any) {
  const sockets = driverSockets.get(driverId);
  if (!sockets) return;

  const msg = JSON.stringify({ event, data });
  sockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

export function broadcastToUser(userId: string, event: string, data: any) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  const msg = JSON.stringify({ event, data });
  sockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}
