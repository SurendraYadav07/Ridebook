import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  searchPlacesAutocomplete,
  geocodeAddress,
  reverseGeocode,
  calculateRoute,
  calculateMultiStopRoute,
} from "../lib/routing";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Zod Request Validation Schemas
// ---------------------------------------------------------------------------
const autocompleteQuerySchema = z.object({
  input: z.string().optional().default(""),
});

const geocodeQuerySchema = z.object({
  address: z.string().min(1, "Address is required"),
});

const reverseGeocodeQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90, "Latitude must be between -90 and 90"),
  longitude: z.coerce.number().min(-180).max(180, "Longitude must be between -180 and 180"),
});

const routeQuerySchema = z.object({
  originLat: z.coerce.number().min(-90).max(90, "Origin latitude must be between -90 and 90"),
  originLng: z.coerce.number().min(-180).max(180, "Origin longitude must be between -180 and 180"),
  destLat: z.coerce.number().min(-90).max(90, "Destination latitude must be between -90 and 90"),
  destLng: z.coerce.number().min(-180).max(180, "Destination longitude must be between -180 and 180"),
  waypoints: z.string().optional(),
});

// ---------------------------------------------------------------------------
// GET /maps/autocomplete — Places search autocomplete
// ---------------------------------------------------------------------------
router.get("/maps/autocomplete", async (req, res) => {
  try {
    const parsed = autocompleteQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_request",
        message: parsed.error.issues[0]?.message || "Invalid autocomplete input parameter.",
      });
      return;
    }

    const input = parsed.data.input.trim();
    if (!input) {
      res.status(200).json([]);
      return;
    }

    const results = await searchPlacesAutocomplete(input);
    res.status(200).json(results);
  } catch (err: any) {
    console.error("[Autocomplete Route Error]", err);
    res.status(500).json({
      error: "internal_error",
      message: "Failed to process autocomplete request.",
    });
  }
});

// ---------------------------------------------------------------------------
// GET /maps/geocode — Forward geocode address to coordinates
// ---------------------------------------------------------------------------
router.get("/maps/geocode", async (req, res) => {
  try {
    const parsed = geocodeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_request",
        message: parsed.error.issues[0]?.message || "Valid address parameter is required.",
      });
      return;
    }

    const result = await geocodeAddress(parsed.data.address);
    res.status(200).json(result);
  } catch (err: any) {
    console.error("[Geocode Route Error]", err);
    res.status(500).json({
      error: "internal_error",
      message: "Failed to geocode address.",
    });
  }
});

// ---------------------------------------------------------------------------
// GET /maps/reverse-geocode — Reverse geocode LatLng to address
// ---------------------------------------------------------------------------
router.get("/maps/reverse-geocode", async (req, res) => {
  try {
    const parsed = reverseGeocodeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_request",
        message: parsed.error.issues[0]?.message || "Valid latitude and longitude are required.",
      });
      return;
    }

    const result = await reverseGeocode({
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    });
    res.status(200).json(result);
  } catch (err: any) {
    console.error("[Reverse Geocode Route Error]", err);
    res.status(500).json({
      error: "internal_error",
      message: "Failed to reverse geocode coordinates.",
    });
  }
});

// ---------------------------------------------------------------------------
// GET /maps/route — Calculate road distance, duration, and polyline
// ---------------------------------------------------------------------------
router.get("/maps/route", async (req, res) => {
  try {
    const parsed = routeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_request",
        message: parsed.error.issues[0]?.message || "Valid origin and destination coordinates are required.",
      });
      return;
    }

    const origin = { latitude: parsed.data.originLat, longitude: parsed.data.originLng };
    const dest = { latitude: parsed.data.destLat, longitude: parsed.data.destLng };

    const waypointsList: Array<{ latitude: number; longitude: number }> = [];
    if (parsed.data.waypoints) {
      try {
        const parts = parsed.data.waypoints.split("|");
        for (const p of parts) {
          const [latStr, lngStr] = p.split(",");
          const lat = parseFloat(latStr);
          const lng = parseFloat(lngStr);
          if (!isNaN(lat) && !isNaN(lng)) {
            waypointsList.push({ latitude: lat, longitude: lng });
          }
        }
      } catch {}
    }

    const result = waypointsList.length > 0
      ? await calculateMultiStopRoute([origin, ...waypointsList, dest])
      : await calculateRoute(origin, dest);

    res.status(200).json(result);
  } catch (err: any) {
    console.error("[Route Directions Error]", err);
    res.status(500).json({
      error: "internal_error",
      message: "Failed to calculate route.",
    });
  }
});

export default router;
