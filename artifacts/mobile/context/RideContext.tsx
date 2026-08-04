import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Location {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Driver {
  id: string;
  name: string;
  rating: number;
  vehicle: string;
  vehicleColor: string;
  plate: string;
  phone: string;
}

export type RideStatus = 'scheduled' | 'searching' | 'active' | 'completed' | 'cancelled';
export type RideType = 'economy' | 'premium' | 'xl';

export interface Ride {
  id: string;
  pickup: Location;
  destination: Location;
  rideType: RideType;
  fare: number;
  distance: number;
  duration: number;
  status: RideStatus;
  scheduledAt?: string;
  driver?: Driver;
  rating?: number;
  createdAt: string;
}

interface RideContextType {
  rides: Ride[];
  activeRide: Ride | null;
  currentPickup: Location | null;
  currentDestination: Location | null;
  setCurrentPickup: (loc: Location | null) => void;
  setCurrentDestination: (loc: Location | null) => void;
  bookRide: (pickup: Location, destination: Location, rideType: RideType, fare: number, scheduledAt?: Date) => Promise<Ride>;
  startRide: (rideId: string) => void;
  completeRide: (rideId: string) => void;
  cancelRide: (rideId: string) => void;
  rateRide: (rideId: string, rating: number) => void;
}

const RideContext = createContext<RideContextType | null>(null);

const DEMO_DRIVERS: Driver[] = [
  { id: 'd1', name: 'Carlos M.', rating: 4.9, vehicle: 'Toyota Camry', vehicleColor: 'Black', plate: 'ABC 1234', phone: '+1 555-0101' },
  { id: 'd2', name: 'Priya S.', rating: 4.8, vehicle: 'Honda Civic', vehicleColor: 'White', plate: 'XYZ 5678', phone: '+1 555-0202' },
  { id: 'd3', name: 'James W.', rating: 4.7, vehicle: 'Tesla Model 3', vehicleColor: 'Silver', plate: 'EV 2024', phone: '+1 555-0303' },
  { id: 'd4', name: 'Aisha K.', rating: 4.9, vehicle: 'Ford Explorer', vehicleColor: 'Blue', plate: 'JKL 7890', phone: '+1 555-0404' },
];

const DEMO_RIDES: Ride[] = [
  {
    id: 'demo1',
    pickup: { id: 'l1', name: 'Home', address: '42 Maple Street', lat: 37.7749, lng: -122.4194 },
    destination: { id: 'l2', name: 'Airport', address: 'SFO International Airport', lat: 37.6213, lng: -122.3790 },
    rideType: 'premium',
    fare: 34.50,
    distance: 22.3,
    duration: 35,
    status: 'completed',
    driver: DEMO_DRIVERS[0],
    rating: 5,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo2',
    pickup: { id: 'l3', name: 'Office', address: '1 Market Street, SF', lat: 37.7945, lng: -122.3954 },
    destination: { id: 'l1', name: 'Home', address: '42 Maple Street', lat: 37.7749, lng: -122.4194 },
    rideType: 'economy',
    fare: 12.80,
    distance: 8.1,
    duration: 18,
    status: 'completed',
    driver: DEMO_DRIVERS[1],
    rating: 4,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo3',
    pickup: { id: 'l4', name: 'Union Square', address: 'Union Square, San Francisco', lat: 37.7879, lng: -122.4075 },
    destination: { id: 'l5', name: "Fisherman's Wharf", address: "Fisherman's Wharf, SF", lat: 37.8082, lng: -122.4175 },
    rideType: 'xl',
    fare: 22.40,
    distance: 9.8,
    duration: 22,
    status: 'completed',
    driver: DEMO_DRIVERS[2],
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function RideProvider({ children }: { children: ReactNode }) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [currentPickup, setCurrentPickup] = useState<Location | null>(null);
  const [currentDestination, setCurrentDestination] = useState<Location | null>(null);

  useEffect(() => {
    loadRides();
  }, []);

  const loadRides = async () => {
    try {
      const stored = await AsyncStorage.getItem('@ridego_rides');
      if (stored) {
        const parsed: Ride[] = JSON.parse(stored);
        setRides(parsed);
        const active = parsed.find(r => r.status === 'active' || r.status === 'searching');
        if (active) setActiveRide(active);
      } else {
        setRides(DEMO_RIDES);
        await AsyncStorage.setItem('@ridego_rides', JSON.stringify(DEMO_RIDES));
      }
    } catch {
      setRides(DEMO_RIDES);
    }
  };

  const persistRides = async (updated: Ride[]) => {
    setRides(updated);
    await AsyncStorage.setItem('@ridego_rides', JSON.stringify(updated));
  };

  const bookRide = async (
    pickup: Location,
    destination: Location,
    rideType: RideType,
    fare: number,
    scheduledAt?: Date,
  ): Promise<Ride> => {
    const ride: Ride = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      pickup,
      destination,
      rideType,
      fare,
      distance: Math.round((Math.random() * 18 + 3) * 10) / 10,
      duration: Math.round(Math.random() * 28 + 10),
      status: scheduledAt ? 'scheduled' : 'searching',
      scheduledAt: scheduledAt?.toISOString(),
      createdAt: new Date().toISOString(),
    };
    const updated = [ride, ...rides];
    await persistRides(updated);
    if (!scheduledAt) setActiveRide(ride);
    return ride;
  };

  const startRide = (rideId: string) => {
    const driver = DEMO_DRIVERS[Math.floor(Math.random() * DEMO_DRIVERS.length)];
    setRides(prev => {
      const updated = prev.map(r =>
        r.id === rideId ? { ...r, status: 'active' as const, driver } : r,
      );
      AsyncStorage.setItem('@ridego_rides', JSON.stringify(updated));
      const active = updated.find(r => r.id === rideId);
      if (active) setActiveRide(active);
      return updated;
    });
  };

  const completeRide = (rideId: string) => {
    setRides(prev => {
      const updated = prev.map(r =>
        r.id === rideId ? { ...r, status: 'completed' as const } : r,
      );
      AsyncStorage.setItem('@ridego_rides', JSON.stringify(updated));
      return updated;
    });
    setActiveRide(null);
  };

  const cancelRide = (rideId: string) => {
    setRides(prev => {
      const updated = prev.map(r =>
        r.id === rideId ? { ...r, status: 'cancelled' as const } : r,
      );
      AsyncStorage.setItem('@ridego_rides', JSON.stringify(updated));
      return updated;
    });
    setActiveRide(null);
  };

  const rateRide = (rideId: string, rating: number) => {
    setRides(prev => {
      const updated = prev.map(r =>
        r.id === rideId ? { ...r, rating } : r,
      );
      AsyncStorage.setItem('@ridego_rides', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <RideContext.Provider
      value={{
        rides,
        activeRide,
        currentPickup,
        currentDestination,
        setCurrentPickup,
        setCurrentDestination,
        bookRide,
        startRide,
        completeRide,
        cancelRide,
        rateRide,
      }}
    >
      {children}
    </RideContext.Provider>
  );
}

export function useRide() {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error('useRide must be used within RideProvider');
  return ctx;
}

export const KNOWN_LOCATIONS: Location[] = [
  { id: 'loc1', name: 'Home', address: '42 Maple Street', lat: 37.7749, lng: -122.4194 },
  { id: 'loc2', name: 'Office', address: '1 Market Street, SF', lat: 37.7945, lng: -122.3954 },
  { id: 'loc3', name: 'Airport', address: 'SFO International Airport', lat: 37.6213, lng: -122.3790 },
  { id: 'loc4', name: 'Union Square', address: 'Union Square, San Francisco', lat: 37.7879, lng: -122.4075 },
  { id: 'loc5', name: "Fisherman's Wharf", address: "Fisherman's Wharf, SF", lat: 37.8082, lng: -122.4175 },
  { id: 'loc6', name: 'Golden Gate Park', address: 'Golden Gate Park, SF', lat: 37.7694, lng: -122.4862 },
  { id: 'loc7', name: 'Caltrain Station', address: '4th & King Street, SF', lat: 37.7766, lng: -122.3950 },
  { id: 'loc8', name: 'Oracle Park', address: 'Oracle Park, SF', lat: 37.7786, lng: -122.3893 },
  { id: 'loc9', name: 'Salesforce Tower', address: '415 Mission St, SF', lat: 37.7895, lng: -122.3973 },
  { id: 'loc10', name: 'Golden Gate Bridge', address: 'Golden Gate Bridge, SF', lat: 37.8199, lng: -122.4783 },
];

export const RIDE_TYPES = [
  { id: 'economy' as RideType, name: 'Economy', seats: 4, baseFare: 8, perKm: 1.2, icon: 'car', eta: 4 },
  { id: 'premium' as RideType, name: 'Premium', seats: 4, baseFare: 16, perKm: 2.0, icon: 'car-sport', eta: 6 },
  { id: 'xl' as RideType, name: 'XL', seats: 6, baseFare: 20, perKm: 2.6, icon: 'bus', eta: 8 },
];
