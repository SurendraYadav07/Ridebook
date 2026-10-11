import { customType } from "drizzle-orm/pg-core";

export interface LatLngPoint {
  latitude: number;
  longitude: number;
}

/**
 * Custom Drizzle mapping for PostGIS geography.
 */
export const geographyPoint = customType<{
  data: LatLngPoint | string;
  driverData: string;
}>({
  dataType() {
    // Keep this as the PostGIS base type. drizzle-kit quotes custom type names,
    // which makes a typmod string such as geography(Point, 4326) invalid SQL.
    return "geography";
  },
  toDriver(value: LatLngPoint | string): string {
    if (typeof value === "string") return value;
    return `SRID=4326;POINT(${value.longitude} ${value.latitude})`;
  },
  fromDriver(value: string): LatLngPoint | string {
    if (!value) return value;
    // PostGIS binary or WKT parse if needed
    if (typeof value === "string" && value.startsWith("POINT(")) {
      const match = value.match(/POINT\(([^ ]+) ([^ ]+)\)/);
      if (match) {
        return {
          longitude: parseFloat(match[1]),
          latitude: parseFloat(match[2]),
        };
      }
    }
    return value;
  },
});
