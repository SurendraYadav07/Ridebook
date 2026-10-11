import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createRide as apiCreateRide,
  getRideFareQuote as apiGetFareQuote,
  getRideHistory as apiGetRideHistory,
  getUpcomingRides as apiGetUpcomingRides,
  getRide as apiGetRide,
  cancelRide as apiCancelRide,
  rateRide as apiRateRide,
  getRideMessages as apiGetRideMessages,
  sendRideMessage as apiSendRideMessage,
  createTripShareToken as apiCreateShareToken,
  triggerSos as apiTriggerSos,
  getEmergencyContacts as apiGetEmergencyContacts,
  createEmergencyContact as apiCreateEmergencyContact,
  deleteEmergencyContact as apiDeleteEmergencyContact,
  getSavedLocations as apiGetSavedLocations,
  createSavedLocation as apiCreateSavedLocation,
  deleteSavedLocation as apiDeleteSavedLocation,
  registerDriver as apiRegisterDriver,
  getDriverMe as apiGetDriverMe,
  setDriverStatus as apiSetDriverStatus,
  updateDriverLocation as apiUpdateDriverLocation,
  getDriverOffers as apiGetDriverOffers,
  acceptDriverOffer as apiAcceptDriverOffer,
  rejectDriverOffer as apiRejectDriverOffer,
  driverArrived as apiDriverArrived,
  startTrip as apiStartTrip,
  completeTrip as apiCompleteTrip,
  getDriverEarnings as apiGetDriverEarnings,
  getDriverWallet as apiGetDriverWallet,
  requestDriverPayout as apiRequestDriverPayout,
  validatePromo as apiValidatePromo,
  customFetch,
  type RideProfile,
  type DriverProfile,
  type DriverOfferItem,
} from '@workspace/api-client-react';
import { useAuth } from './AuthContext';
import type { IoniconName } from '@/lib/ionicon-name';
import { getApiBaseUrl } from '@/lib/api-url';

export interface Location {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  icon?: IoniconName;
  color?: string;
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

export type RideStatus =
  | 'scheduled'
  | 'scheduled_dispatching'
  | 'requested'
  | 'searching_driver'
  | 'driver_offer_sent'
  | 'driver_assigned'
  | 'driver_arriving'
  | 'driver_arrived'
  | 'passenger_no_show'
  | 'trip_started'
  | 'trip_completed'
  | 'completed'
  | 'payment_pending'
  | 'payment_completed'
  | 'payment_failed'
  | 'passenger_cancelled'
  | 'driver_cancelled'
  | 'expired'
  | 'disputed'
  | 'cancelled'
  | 'searching'
  | 'active';

export type RideType = 'shared' | 'economy' | 'premium' | 'xl';

export type RideSortField = 'eta' | 'price' | 'rating';
export type RideSortDirection = 'asc' | 'desc';

export interface RideSortOption {
  field: RideSortField;
  direction: RideSortDirection;
}

export interface Ride {
  id: string;
  passengerId?: string;
  driverId?: string;
  pickup: Location;
  destination: Location;
  stops?: Location[];
  rideType: RideType;
  fare: number;
  originalFare?: number;
  discountAmount?: number;
  distance: number;
  duration: number;
  status: RideStatus;
  isShared?: boolean;
  coRiderCount?: number;
  coRiderName?: string;
  coRiderPickupAddress?: string;
  coRiderDropoffAddress?: string;
  scheduledAt?: string;
  startTripOtp?: string;
  driver?: Driver;
  rating?: number;
  tip?: number;
  compliments?: string[];
  notes?: string;
  paymentMethod?: string;
  promoCode?: string;
  createdAt: string;
}

export interface PaymentMethod {
  id: string;
  type: 'visa' | 'mastercard' | 'amex' | 'apple_pay' | 'google_pay' | 'cash';
  label: string;
  last4?: string;
  expiry?: string;
  isDefault: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'ride' | 'promo' | 'system';
}

export interface PromoCode {
  code: string;
  discountPercent?: number;
  discountFixed?: number;
  minFare?: number;
  description: string;
}

export interface LiveDriverLocation {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  timestamp?: string;
}

export function estimateTripDistanceKm(points: Pick<Location, 'lat' | 'lng'>[]): number {
  if (points.length < 2) return 1;
  const earthRadiusKm = 6371;
  let directDistance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = toRadians(current.lat - previous.lat);
    const longitudeDelta = toRadians(current.lng - previous.lng);
    const latitude1 = toRadians(previous.lat);
    const latitude2 = toRadians(current.lat);
    const a =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
    directDistance += earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Math.max(1, Math.round(directDistance * 1.3 * 10) / 10);
}

export function estimateTripDurationMin(distanceKm: number): number {
  return Math.max(3, Math.round(distanceKm * 2.5));
}

interface RideContextType {
  rides: Ride[];
  activeRide: Ride | null;
  completedRide: Ride | null;
  currentPickup: Location | null;
  currentDestination: Location | null;
  liveDriverLocation: LiveDriverLocation | null;
  setCurrentPickup: (loc: Location | null) => void;
  setCurrentDestination: (loc: Location | null) => void;
  recentLocations: Location[];
  recordRecentLocation: (loc: Location) => void;
  bookRide: (
    pickup: Location,
    destination: Location,
    rideType: RideType,
    fare: number,
    scheduledAt?: Date,
    options?: {
      notes?: string;
      paymentMethodId?: string;
      promoCode?: string;
      discountAmount?: number;
      originalFare?: number;
      stops?: Location[];
      distanceKm?: number;
      durationMin?: number;
    }
  ) => Promise<Ride>;
  startRide: (rideId: string) => Promise<void>;
  completeRide: (rideId: string) => Promise<void>;
  cancelRide: (rideId: string, reason?: string) => Promise<void>;
  rateRide: (rideId: string, rating: number, tip?: number, compliments?: string[], review?: string) => Promise<void>;
  rebookRide: (ride: Ride) => void;
  refreshRides: () => Promise<void>;

  // Saved Places
  savedPlaces: Location[];
  addSavedPlace: (place: Omit<Location, 'id'>) => Promise<void>;
  removeSavedPlace: (id: string) => Promise<void>;

  // Payment Methods
  paymentMethods: PaymentMethod[];
  activePaymentMethod: PaymentMethod;
  setActivePaymentMethod: (id: string) => void;
  removePaymentMethod: (id: string) => Promise<void>;

  // Emergency & SOS
  emergencyContacts: EmergencyContact[];
  addEmergencyContact: (contact: Omit<EmergencyContact, 'id'>) => Promise<void>;
  removeEmergencyContact: (id: string) => Promise<void>;
  triggerEmergencySos: (rideId?: string) => Promise<void>;

  // Public Trip Sharing
  generateShareLink: (rideId: string) => Promise<string>;

  // In-App Chat
  chatMessages: Array<{ id: string; senderId: string; body: string; createdAt: string }>;
  fetchMessages: (rideId: string) => Promise<void>;
  sendMessage: (rideId: string, text: string) => Promise<void>;

  // Notifications
  notifications: AppNotification[];
  unreadCount: number;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Promo Code Validation
  applyPromo: (
    code: string,
    fare: number,
    rideType?: RideType,
  ) => Promise<{ valid: boolean; discount: number; finalFare: number; message: string; promoCodeId?: string }>;

  // Driver Mode
  driverProfile: DriverProfile | null;
  isDriverOnline: boolean;
  driverOffers: DriverOfferItem[];
  toggleDriverOnline: (online: boolean) => Promise<void>;
  acceptOffer: (offerId: string) => Promise<void>;
  rejectOffer: (offerId: string) => Promise<void>;
  markDriverArrived: (rideId: string) => Promise<void>;
  startDriverTrip: (rideId: string, otpCode?: string) => Promise<void>;
  completeDriverTrip: (rideId: string) => Promise<void>;

  // Ride Sorting Preference (session-persisted)
  rideSortOption: RideSortOption;
  setRideSortOption: React.Dispatch<React.SetStateAction<RideSortOption>>;
}

const RideContext = createContext<RideContextType | null>(null);

export const KNOWN_LOCATIONS: Location[] = [
  // Jharkhand State Hubs & Educational Landmarks
  { id: 'loc_jh_cuj', name: 'Central University of Jharkhand (CUJ)', address: 'Cheri-Manatu Campus, Kanke, Ranchi, Jharkhand', lat: 23.4682, lng: 85.3402, icon: 'business', color: '#4F46E5' },
  { id: 'loc_jh_rnc', name: 'Ranchi Railway Station (RNC)', address: 'Station Road, Gosaintola, Ranchi, Jharkhand', lat: 23.3512, lng: 85.3340, icon: 'train', color: '#9333EA' },
  { id: 'loc_jh_ixr', name: 'Birsa Munda Airport (IXR)', address: 'Airport Road, Hinoo, Ranchi, Jharkhand', lat: 23.3143, lng: 85.3218, icon: 'airplane', color: '#059669' },
  { id: 'loc_jh_bit', name: 'BIT Mesra', address: 'Birla Institute of Technology, Mesra, Ranchi, Jharkhand', lat: 23.4244, lng: 85.4382, icon: 'school', color: '#0891B2' },
  { id: 'loc_jh_main_rd', name: 'Main Road Ranchi', address: 'Main Road, Hindpiri, Ranchi, Jharkhand', lat: 23.3644, lng: 85.3283, icon: 'storefront', color: '#D97706' },
  { id: 'loc_jh_tata', name: 'Tatanagar Junction', address: 'Khasmahal, Jamshedpur, Jharkhand', lat: 22.7712, lng: 86.2029, icon: 'train', color: '#EA580C' },
  { id: 'loc_jh_dhanbad', name: 'Dhanbad Railway Station', address: 'Dhanbad, Jharkhand', lat: 23.7915, lng: 86.4304, icon: 'train', color: '#2563EB' },
  // Hyderabad Hubs
  { id: 'loc1', name: 'Home', address: 'Road No. 36, Jubilee Hills, Hyderabad', lat: 17.4319, lng: 78.4073, icon: 'home', color: '#4F46E5' },
  { id: 'loc2', name: 'Office (Cyber Towers)', address: 'HITEC City, Madhapur, Hyderabad', lat: 17.4504, lng: 78.3808, icon: 'briefcase', color: '#0891B2' },
  { id: 'loc3', name: 'Airport (RGIA)', address: 'Rajiv Gandhi International Airport, Shamshabad, Hyderabad', lat: 17.2403, lng: 78.4294, icon: 'airplane', color: '#059669' },
  { id: 'loc4', name: 'Inorbit Mall', address: 'Mindspace, Madhapur, Hyderabad', lat: 17.4348, lng: 78.3867, icon: 'storefront', color: '#D97706' },
  { id: 'loc5', name: 'Secunderabad Junction', address: 'Secunderabad Railway Station, Secunderabad', lat: 17.4344, lng: 78.5015, icon: 'train', color: '#9333EA' },
  { id: 'loc6', name: 'Gachibowli Financial District', address: 'Nanakramguda, Gachibowli, Hyderabad', lat: 17.4168, lng: 78.3496, icon: 'business', color: '#16A34A' },
  { id: 'loc7', name: 'Charminar', address: 'Old City, Hyderabad, Telangana', lat: 17.3616, lng: 78.4747, icon: 'navigate', color: '#0284C7' },
  { id: 'loc8', name: 'Banjara Hills', address: 'Road No. 12, Banjara Hills, Hyderabad', lat: 17.4156, lng: 78.4350, icon: 'leaf', color: '#EA580C' },
  { id: 'loc9', name: 'DLF Cyber City', address: 'Gachibowli, Hyderabad, Telangana', lat: 17.4474, lng: 78.3582, icon: 'business', color: '#2563EB' },
  { id: 'loc10', name: 'IKEA Hyderabad', address: 'Raidurg, HITEC City, Hyderabad', lat: 17.4431, lng: 78.3776, icon: 'storefront', color: '#DC2626' },
  { id: 'loc11', name: 'Durgam Cheruvu Cable Bridge', address: 'Madhapur / Jubilee Hills, Hyderabad', lat: 17.4361, lng: 78.3879, icon: 'navigate', color: '#7C3AED' },
  { id: 'loc12', name: 'Golconda Fort', address: 'Ibrahim Bagh, Hyderabad, Telangana', lat: 17.3833, lng: 78.4011, icon: 'shield', color: '#B45309' },
  { id: 'loc13', name: 'Forum Sujana Mall', address: 'KPHB Colony, Kukatpally, Hyderabad', lat: 17.4851, lng: 78.3878, icon: 'storefront', color: '#E11D48' },
  { id: 'loc14', name: 'Hyderabad Deccan Station (Nampally)', address: 'Nampally, Hyderabad, Telangana', lat: 17.3920, lng: 78.4697, icon: 'train', color: '#4338CA' },
  { id: 'loc15', name: 'Kondapur RTO / Botanical Garden', address: 'Kondapur, Hyderabad, Telangana', lat: 17.4566, lng: 78.3638, icon: 'leaf', color: '#059669' },
  { id: 'loc16', name: 'Miyapur Metro Station', address: 'Miyapur, Hyderabad, Telangana', lat: 17.4969, lng: 78.3614, icon: 'subway', color: '#2563EB' },
  // Bengaluru Hubs
  { id: 'loc17', name: 'Kempegowda Airport (BLR)', address: 'Devanahalli, Bengaluru, Karnataka', lat: 13.1986, lng: 77.7066, icon: 'airplane', color: '#059669' },
  { id: 'loc18', name: 'Indiranagar 100ft Road', address: 'Indiranagar, Bengaluru, Karnataka', lat: 12.9784, lng: 77.6408, icon: 'cafe', color: '#D97706' },
  { id: 'loc19', name: 'Koramangala 5th Block', address: 'Koramangala, Bengaluru, Karnataka', lat: 12.9352, lng: 77.6245, icon: 'restaurant', color: '#EA580C' },
  { id: 'loc20', name: 'Manyata Tech Park', address: 'Hebbal, Outer Ring Road, Bengaluru', lat: 13.0494, lng: 77.6200, icon: 'business', color: '#2563EB' },
  { id: 'loc21', name: 'Electronic City Phase 1', address: 'Hosur Road, Bengaluru, Karnataka', lat: 12.8452, lng: 77.6602, icon: 'business', color: '#4F46E5' },
  { id: 'loc22', name: 'Whitefield (ITPL)', address: 'ITPL Main Road, Whitefield, Bengaluru', lat: 12.9855, lng: 77.7289, icon: 'business', color: '#0891B2' },
  // Mumbai Hubs
  { id: 'loc23', name: 'Gateway of India', address: 'Colaba, Mumbai, Maharashtra', lat: 18.9220, lng: 72.8347, icon: 'navigate', color: '#D97706' },
  { id: 'loc24', name: 'Mumbai Airport (BOM T2)', address: 'Sahar, Andheri East, Mumbai', lat: 19.0896, lng: 72.8656, icon: 'airplane', color: '#059669' },
  { id: 'loc25', name: 'Bandra Kurla Complex (BKC)', address: 'Bandra East, Mumbai, Maharashtra', lat: 19.0657, lng: 72.8687, icon: 'business', color: '#2563EB' },
  { id: 'loc26', name: 'Marine Drive', address: 'Nariman Point, Mumbai, Maharashtra', lat: 18.9432, lng: 72.8230, icon: 'navigate', color: '#0284C7' },
  // Delhi NCR Hubs
  { id: 'loc27', name: 'Connaught Place (CP)', address: 'Connaught Place, New Delhi, Delhi', lat: 28.6315, lng: 77.2167, icon: 'business', color: '#4F46E5' },
  { id: 'loc28', name: 'Delhi Airport (DEL T3)', address: 'Indira Gandhi International Airport, New Delhi', lat: 28.5562, lng: 77.1000, icon: 'airplane', color: '#059669' },
  { id: 'loc29', name: 'Cyber Hub Gurugram', address: 'DLF Cyber City, Gurugram, Haryana', lat: 28.4950, lng: 77.0895, icon: 'beer', color: '#EA580C' },
  { id: 'loc30', name: 'Noida Sector 18 (DLF Mall)', address: 'Sector 18, Noida, Uttar Pradesh', lat: 28.5694, lng: 77.3235, icon: 'storefront', color: '#DC2626' },
  // Chennai & Pune
  { id: 'loc31', name: 'Chennai Central Station', address: 'Periyamet, Chennai, Tamil Nadu', lat: 13.0827, lng: 80.2707, icon: 'train', color: '#9333EA' },
  { id: 'loc32', name: 'Hinjawadi IT Park', address: 'Hinjawadi Phase 1, Pune, Maharashtra', lat: 18.5913, lng: 73.7389, icon: 'business', color: '#2563EB' },
];

export interface RideTypeConfig {
  id: RideType;
  name: string;
  seats: number;
  baseFare: number;
  perKm: number;
  perMinute: number;
  minimumFare: number;
  icon: IoniconName;
  eta: number;
  badge?: string;
}

export const RIDE_TYPES: RideTypeConfig[] = [
  { id: 'shared' as RideType, name: 'Share & Save (Carpool)', seats: 1, baseFare: 35, perKm: 8.5, perMinute: 1.5, minimumFare: 55, icon: 'people', eta: 5, badge: 'Save ~35%' },
  { id: 'economy' as RideType, name: 'Economy (Auto/Mini)', seats: 4, baseFare: 50, perKm: 12, perMinute: 2, minimumFare: 80, icon: 'car', eta: 4 },
  { id: 'premium' as RideType, name: 'Premium (Sedan)', seats: 4, baseFare: 100, perKm: 20, perMinute: 3.5, minimumFare: 150, icon: 'car-sport', eta: 6 },
  { id: 'xl' as RideType, name: 'XL (SUV/6-Seater)', seats: 6, baseFare: 150, perKm: 26, perMinute: 4.5, minimumFare: 200, icon: 'bus', eta: 8 },
];

export function estimateRideFare(rideType: RideType, distanceKm: number, durationMin: number): number {
  const type = RIDE_TYPES.find((item) => item.id === rideType) ?? RIDE_TYPES[1];
  const subtotal = type.baseFare + distanceKm * type.perKm + durationMin * type.perMinute;
  return Math.round(Math.max(type.minimumFare, subtotal));
}

const DEFAULT_PAYMENTS: PaymentMethod[] = [
  { id: 'pm_upi', type: 'google_pay', label: 'UPI / Card (Razorpay)', isDefault: true },
  { id: 'pm_cash', type: 'cash', label: 'Cash to Driver', isDefault: false },
];

const PROMO_CODES: PromoCode[] = [
  { code: 'RIDEGO20', discountPercent: 20, description: '20% off on your ride' },
  { code: 'WELCOME50', discountFixed: 50, description: '₹50 off on your first ride' },
  { code: 'SAVE10', discountPercent: 10, description: '10% off any ride' },
  { code: 'AIRPORT15', discountPercent: 15, description: '15% off airport trips' },
];

export function RideProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, accessToken } = useAuth();

  const [rides, setRides] = useState<Ride[]>([]);
  const ridesRef = useRef<Ride[]>([]);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [completedRide, setCompletedRide] = useState<Ride | null>(null);
  const [currentPickup, setCurrentPickup] = useState<Location | null>(null);
  const [currentDestination, setCurrentDestination] = useState<Location | null>(null);
  const [recentLocations, setRecentLocations] = useState<Location[]>([]);
  const recentLocationsRef = useRef<Location[]>([]);
  const [liveDriverLocation, setLiveDriverLocation] = useState<LiveDriverLocation | null>(null);
  const previousActiveRideIdRef = useRef<string | undefined>(activeRide?.id);

  useEffect(() => {
    if (previousActiveRideIdRef.current !== activeRide?.id) {
      previousActiveRideIdRef.current = activeRide?.id;
      setLiveDriverLocation(null);
    }
  }, [activeRide?.id]);

  // Saved Places & Emergency Contacts
  const [savedPlaces, setSavedPlaces] = useState<Location[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(DEFAULT_PAYMENTS);
  const [activePaymentMethodId, setActivePaymentMethodId] = useState<string>('pm_upi');
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; senderId: string; body: string; createdAt: string }>>([]);

  // Driver Mode State
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [isDriverOnline, setIsDriverOnline] = useState<boolean>(false);
  const [driverOffers, setDriverOffers] = useState<DriverOfferItem[]>([]);

  // Ride Sorting Preference (session-persisted)
  const [rideSortOption, setRideSortOption] = useState<RideSortOption>({
    field: 'eta',
    direction: 'asc',
  });

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    recentLocationsRef.current = [];
    setRecentLocations([]);
    const storageKey = `@ridego_recent_locations:${user?.id ?? 'guest'}`;
    AsyncStorage.getItem(storageKey).then((stored) => {
      if (!stored || cancelled) return;
      try {
        const parsed = JSON.parse(stored);
        if (!cancelled && Array.isArray(parsed)) {
          recentLocationsRef.current = parsed.slice(0, 3);
          setRecentLocations(recentLocationsRef.current);
        }
      } catch {}
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const userKey = user?.id ?? 'guest';
    const methodsKey = `@ridego_payment_methods:${userKey}`;
    const activeKey = `@ridego_active_payment_method:${userKey}`;
    setPaymentMethods(DEFAULT_PAYMENTS);
    setActivePaymentMethodId('pm_upi');
    AsyncStorage.multiGet([methodsKey, activeKey]).then(([storedMethods, storedActive]) => {
      if (cancelled) return;
      try {
        const parsed: PaymentMethod[] = storedMethods[1] ? JSON.parse(storedMethods[1]) : [];
        // Older versions stored card details locally. Only retain payment choices that
        // can be represented without storing raw card data; cards are entered in Razorpay.
        const safeMethods = Array.isArray(parsed)
          ? parsed.filter((method) => method.type === 'cash' || method.type === 'google_pay')
          : [];
        const nextMethods = safeMethods.length > 0 ? safeMethods : DEFAULT_PAYMENTS;
        AsyncStorage.setItem(methodsKey, JSON.stringify(nextMethods)).catch(() => {});
        setPaymentMethods(nextMethods);
        setActivePaymentMethodId(
          nextMethods.some((method) => method.id === storedActive[1])
            ? storedActive[1]!
            : nextMethods[0].id,
        );
      } catch {}
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  const recordRecentLocation = (loc: Location) => {
    const key = (value: Location) => `${value.lat.toFixed(5)},${value.lng.toFixed(5)}`;
    const next = [loc, ...recentLocationsRef.current.filter((item) => key(item) !== key(loc))].slice(0, 3);
    recentLocationsRef.current = next;
    setRecentLocations(next);
    AsyncStorage.setItem(`@ridego_recent_locations:${user?.id ?? 'guest'}`, JSON.stringify(next)).catch(() => {});
  };

  const commitRides = (update: Ride[] | ((current: Ride[]) => Ride[])) => {
    const next = typeof update === 'function' ? update(ridesRef.current) : update;
    ridesRef.current = next;
    setRides(next);
    AsyncStorage.setItem('@ridego_rides', JSON.stringify(next.slice(0, 50))).catch(() => {});
  };

  // ---------------------------------------------------------------------------
  // Load Initial Backend & Local Data
  // ---------------------------------------------------------------------------
  const loadData = async () => {
    // 1. Read locally cached/scheduled rides from AsyncStorage first
    let localRides: Ride[] = [];
    try {
      const stored = await AsyncStorage.getItem('@ridego_rides');
      if (stored) {
        localRides = JSON.parse(stored);
      }
    } catch {}

    if (!isAuthenticated) {
      if (localRides.length > 0) {
        commitRides(localRides);
      }
      return;
    }

    try {
      // 2. Fetch upcoming / active rides from backend
      let upcomingTransformed: Ride[] = [];
      try {
        const upcomingRes = await apiGetUpcomingRides();
        if (upcomingRes.rides && upcomingRes.rides.length > 0) {
          upcomingTransformed = upcomingRes.rides.map(fromApiRideProfile);
          const active = upcomingTransformed.find((r) =>
            [
              'requested',
              'searching_driver',
              'driver_offer_sent',
              'driver_assigned',
              'driver_arriving',
              'driver_arrived',
              'trip_started',
              'active',
              'searching',
              'picking_up',
              'riding',
            ].includes(r.status)
          );
          if (active) setActiveRide(active);
        }
      } catch (err) {
        console.log('Error loading upcoming backend rides:', err);
      }

      // 3. Fetch completed ride history
      let historyTransformed: Ride[] = [];
      try {
        const historyRes = await apiGetRideHistory({ limit: 30 });
        if (historyRes.rides) {
          historyTransformed = historyRes.rides.map(fromApiRideProfile);
        }
      } catch (err) {
        console.log('Error loading ride history:', err);
      }

      // 4. Merge upcoming, local scheduled, and history rides without duplicate IDs
      const combinedMap = new Map<string, Ride>();
      for (const r of upcomingTransformed) combinedMap.set(r.id, r);
      for (const r of localRides) {
        if (!combinedMap.has(r.id)) combinedMap.set(r.id, r);
      }
      for (const r of historyTransformed) {
        if (!combinedMap.has(r.id)) combinedMap.set(r.id, r);
      }

      const merged = Array.from(combinedMap.values());
      commitRides(merged);
      try {
        await AsyncStorage.setItem('@ridego_rides', JSON.stringify(merged.slice(0, 50)));
      } catch {}

      // 5. Fetch Saved Places
      const placesRes = await apiGetSavedLocations();
      if (placesRes && placesRes.length > 0) {
        setSavedPlaces(
          placesRes.map((p) => ({
            id: p.id,
            name: p.label,
            address: p.address,
            lat: p.latitude,
            lng: p.longitude,
          }))
        );
      }

      // 6. Fetch Emergency Contacts
      const contactsRes = await apiGetEmergencyContacts();
      if (contactsRes) {
        setEmergencyContacts(
          contactsRes.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            relationship: c.relationship ?? 'Family',
          }))
        );
      }

      try {
        const notificationRows = await customFetch<Array<{
          id: string;
          type: string;
          title: string;
          body: string;
          readAt: string | null;
          createdAt: string;
        }>>('/users/notifications');
        setNotifications(notificationRows.map((notification) => ({
          id: notification.id,
          title: notification.title,
          message: notification.body,
          timestamp: new Date(notification.createdAt).toLocaleString('en-IN'),
          read: Boolean(notification.readAt),
          type: notification.type.toLowerCase().includes('promo')
            ? 'promo'
            : notification.type.toLowerCase().includes('ride') ? 'ride' : 'system',
        })));
      } catch (err) {
        console.log('Error loading notifications:', err);
      }

      // 7. If user is a driver, load driver profile
      if (user?.role === 'driver') {
        try {
          const dProfile = await apiGetDriverMe();
          setDriverProfile(dProfile);
          setIsDriverOnline(dProfile.isOnline);
        } catch {}
      }
    } catch (err) {
      console.log('Error loading backend data:', err);
    }
  };

  useEffect(() => {
    // Initial load from storage immediately
    AsyncStorage.getItem('@ridego_rides')
      .then((stored) => {
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              commitRides(parsed);
            }
          } catch {}
        }
      })
      .catch(() => {});

    loadData();
  }, [isAuthenticated, user?.id]);

  // ---------------------------------------------------------------------------
  // WebSocket Live Connection
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) {
      if (wsRef.current) wsRef.current.close();
      return;
    }

    let isCurrentConnection = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const connectWebSocket = () => {
      if (!isCurrentConnection) return;
      try {
        let wsUrl: string;
        const apiBaseUrl = getApiBaseUrl();
        if (apiBaseUrl) {
          const parsedApiUrl = new URL(apiBaseUrl);
          parsedApiUrl.protocol = parsedApiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
          parsedApiUrl.pathname = '/ws';
          parsedApiUrl.search = '';
          wsUrl = parsedApiUrl.toString();
        } else {
          throw new Error('Set EXPO_PUBLIC_API_URL before connecting to the API.');
        }

        if (accessToken) {
          wsUrl += `?token=${encodeURIComponent(accessToken)}`;
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (activeRide?.id) {
            ws.send(JSON.stringify({ event: 'subscribe', data: { room: `ride:${activeRide.id}` } }));
          }
          if (user?.id) {
            ws.send(JSON.stringify({ event: 'subscribe', data: { room: `user:${user.id}` } }));
          }
        };

        ws.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            const { event: evt, data } = parsed;

            if (evt === 'driver:location:update') {
              setLiveDriverLocation({
                latitude: data.latitude,
                longitude: data.longitude,
                heading: data.heading,
                speed: data.speed,
                timestamp: data.timestamp,
              });
            } else if (evt === 'ride:status:change') {
              const updatedRide = fromApiRideProfile(data);
              const isCompleted = ['trip_completed', 'payment_completed', 'completed'].includes(updatedRide.status);
              if (isCompleted) {
                setCompletedRide(updatedRide);
                setActiveRide((prev) => (prev?.id === updatedRide.id ? null : prev));
              } else {
                setActiveRide((prev) => (prev?.id === updatedRide.id ? updatedRide : prev));
              }
              commitRides((prev) => prev.map((r) => (r.id === updatedRide.id ? updatedRide : r)));
            } else if (evt === 'chat:message') {
              setChatMessages((prev) => [...prev, data]);
            } else if (evt === 'driver:offer:new') {
              setDriverOffers((prev) => [data, ...prev]);
            }
          } catch {}
        };

        ws.onerror = () => {};
        ws.onclose = () => {
          if (isCurrentConnection) {
            reconnectTimer = setTimeout(connectWebSocket, 5000);
          }
        };
      } catch {}
    };

    connectWebSocket();

    return () => {
      isCurrentConnection = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [isAuthenticated, activeRide?.id, accessToken]);

  // ---------------------------------------------------------------------------
  // Passenger Actions
  // ---------------------------------------------------------------------------
  const bookRide = async (
    pickup: Location,
    destination: Location,
    rideType: RideType,
    fare: number,
    scheduledAt?: Date,
    options?: {
      notes?: string;
      paymentMethodId?: string;
      promoCode?: string;
      discountAmount?: number;
      originalFare?: number;
      stops?: Location[];
      distanceKm?: number;
      durationMin?: number;
    }
  ): Promise<Ride> => {
    const apiRide = await apiCreateRide({
        rideType,
        pickup: {
          address: pickup.address,
          latitude: pickup.lat,
          longitude: pickup.lng,
        },
        destination: {
          address: destination.address,
          latitude: destination.lat,
          longitude: destination.lng,
        },
        stops: options?.stops?.map((s, idx) => ({
          address: s.address,
          latitude: s.lat,
          longitude: s.lng,
          name: s.name,
          sequenceOrder: idx + 1,
        })),
        promoCode: options?.promoCode,
        scheduledFor: scheduledAt ? scheduledAt.toISOString() : undefined,
        notes: options?.notes,
      });
    const transformed = fromApiRideProfile(apiRide);

    commitRides((prev) => [transformed, ...prev.filter((r) => r.id !== transformed.id)]);

    if (!scheduledAt) {
      setCompletedRide(null);
      setLiveDriverLocation(null);
      setActiveRide(transformed);
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'subscribe', data: { room: `ride:${transformed.id}` } }));
    }

    return transformed;
  };

  const cancelRide = async (rideId: string, reason?: string) => {
    const cancelled = await apiCancelRide(rideId, { reason });
    const transformed = fromApiRideProfile(cancelled);

    setActiveRide((prev) => (prev?.id === rideId ? null : prev));
    commitRides((prev) => prev.map((r) => {
        if (r.id === rideId) {
          return transformed;
        }
        return r;
      }));
  };

  const rateRide = async (rideId: string, rating: number, tip?: number, compliments?: string[], review?: string) => {
    await apiRateRide(rideId, {
      stars: rating,
      tip: tip || 0,
      compliments: compliments || [],
      review: review || '',
    });
    commitRides((prev) => prev.map((r) => (r.id === rideId ? { ...r, rating, tip, compliments } : r)));
    setCompletedRide((prev) => (prev?.id === rideId ? null : prev));
  };

  const startRide = async (rideId: string) => {
    await apiDriverArrived(rideId);
  };

  const completeRide = async (rideId: string) => {
    const completed = await apiCompleteTrip(rideId);
    const transformed = fromApiRideProfile(completed);
    setCompletedRide(transformed);
    setActiveRide((prev) => (prev?.id === rideId ? null : prev));
    commitRides((prev) => prev.map((r) => (r.id === rideId ? transformed : r)));
  };

  const rebookRide = (ride: Ride) => {
    setCurrentPickup(ride.pickup);
    setCurrentDestination(ride.destination);
  };

  const refreshRides = async () => {
    await loadData();
  };

  // ---------------------------------------------------------------------------
  // Saved Places CRUD
  // ---------------------------------------------------------------------------
  const addSavedPlace = async (place: Omit<Location, 'id'>) => {
    const created = await apiCreateSavedLocation({
      label: place.name,
      address: place.address,
      latitude: place.lat,
      longitude: place.lng,
    });
    const item: Location = {
      id: created.id,
      name: created.label,
      address: created.address,
      lat: created.latitude,
      lng: created.longitude,
    };
    setSavedPlaces((prev) => [...prev, item]);
  };

  const removeSavedPlace = async (id: string) => {
    await apiDeleteSavedLocation(id);
    setSavedPlaces((prev) => prev.filter((p) => p.id !== id));
  };

  // ---------------------------------------------------------------------------
  // Emergency Contacts & SOS
  // ---------------------------------------------------------------------------
  const addEmergencyContact = async (contact: Omit<EmergencyContact, 'id'>) => {
    const created = await apiCreateEmergencyContact({
      name: contact.name,
      phone: contact.phone,
      relationship: contact.relationship,
    });
    setEmergencyContacts((prev) => [
      ...prev,
      { id: created.id, name: created.name, phone: created.phone, relationship: created.relationship ?? 'Family' },
    ]);
  };

  const removeEmergencyContact = async (id: string) => {
    await apiDeleteEmergencyContact(id);
    setEmergencyContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const triggerEmergencySos = async (rideId?: string) => {
    const lat = liveDriverLocation?.latitude ?? currentPickup?.lat ?? 17.4435;
    const lng = liveDriverLocation?.longitude ?? currentPickup?.lng ?? 78.3772;
    await apiTriggerSos({
      rideId: rideId ?? activeRide?.id ?? null,
      latitude: lat,
      longitude: lng,
      details: 'SOS button pressed on mobile device',
    });
  };

  // ---------------------------------------------------------------------------
  // Public Trip Sharing
  // ---------------------------------------------------------------------------
  const generateShareLink = async (rideId: string) => {
    const res = await apiCreateShareToken(rideId);
    return res.shareUrl;
  };

  // ---------------------------------------------------------------------------
  // In-App Chat
  // ---------------------------------------------------------------------------
  const fetchMessages = async (rideId: string) => {
    const msgs = await apiGetRideMessages(rideId);
    setChatMessages(msgs.map((m) => ({ id: m.id, senderId: m.senderId, body: m.body, createdAt: m.createdAt })));
  };

  const sendMessage = async (rideId: string, text: string) => {
    const msg = await apiSendRideMessage(rideId, { body: text });
    setChatMessages((prev) => [...prev, { id: msg.id, senderId: msg.senderId, body: msg.body, createdAt: msg.createdAt }]);
  };

  // ---------------------------------------------------------------------------
  // Driver Mode Actions
  // ---------------------------------------------------------------------------
  const toggleDriverOnline = async (online: boolean) => {
    const res = await apiSetDriverStatus({ isOnline: online });
    setDriverProfile(res);
    setIsDriverOnline(res.isOnline);
    if (online) {
      const offers = await apiGetDriverOffers();
      setDriverOffers(offers);
    }
  };

  const acceptOffer = async (offerId: string) => {
    const ride = await apiAcceptDriverOffer(offerId);
    setActiveRide(fromApiRideProfile(ride));
    setDriverOffers((prev) => prev.filter((o) => o.offerId !== offerId));
  };

  const rejectOffer = async (offerId: string) => {
    await apiRejectDriverOffer(offerId);
    setDriverOffers((prev) => prev.filter((o) => o.offerId !== offerId));
  };

  const markDriverArrived = async (rideId: string) => {
    const updated = await apiDriverArrived(rideId);
    setActiveRide(fromApiRideProfile(updated));
  };

  const startDriverTrip = async (rideId: string, otpCode?: string) => {
    const updated = await apiStartTrip(rideId, { otpCode });
    setActiveRide(fromApiRideProfile(updated));
  };

  const completeDriverTrip = async (rideId: string) => {
    const updated = await apiCompleteTrip(rideId);
    const transformed = fromApiRideProfile(updated);
    setActiveRide((prev) => (prev?.id === rideId ? null : prev));
    commitRides((prev) => prev.map((ride) => (ride.id === rideId ? transformed : ride)));
  };

  // ---------------------------------------------------------------------------
  // Payment Methods
  // ---------------------------------------------------------------------------
  const activePaymentMethod =
    paymentMethods.find((p) => p.id === activePaymentMethodId) ?? paymentMethods[0] ?? DEFAULT_PAYMENTS[0];

  const removePaymentMethod = async (id: string) => {
    if (paymentMethods.length <= 1) return;
    const updated = paymentMethods.filter((p) => p.id !== id);
    setPaymentMethods(updated);
    if (activePaymentMethodId === id) {
      setActivePaymentMethodId(updated[0].id);
      await AsyncStorage.setItem(`@ridego_active_payment_method:${user?.id ?? 'guest'}`, updated[0].id);
    }
    await AsyncStorage.setItem(`@ridego_payment_methods:${user?.id ?? 'guest'}`, JSON.stringify(updated));
  };

  const setActivePaymentMethod = (id: string) => {
    setActivePaymentMethodId(id);
    AsyncStorage.setItem(`@ridego_active_payment_method:${user?.id ?? 'guest'}`, id).catch(() => {});
  };

  // ---------------------------------------------------------------------------
  // Promo Validation
  // ---------------------------------------------------------------------------
  const applyPromo = async (code: string, fare: number, rideType?: RideType) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      return { valid: false, discount: 0, finalFare: fare, message: 'Please enter a promo code' };
    }

    try {
      const res = await apiValidatePromo({
        code: normalized,
        fare,
        rideType: rideType ?? 'economy',
      });
      return {
        valid: res.valid,
        discount: res.discountAmount ?? 0,
        finalFare: res.finalFare ?? fare,
        message: res.message,
        promoCodeId: res.promoCodeId,
      };
    } catch (err: any) {
      // Fallback to local evaluation if offline or server unreachable
      const found = PROMO_CODES.find((p) => p.code === normalized);
      if (found) {
        let discount = 0;
        if (found.discountPercent) {
          discount = Math.round(fare * (found.discountPercent / 100) * 100) / 100;
        } else if (found.discountFixed) {
          discount = Math.min(fare, found.discountFixed);
        }
        const finalFare = Math.max(1, Math.round((fare - discount) * 100) / 100);
        return {
          valid: true,
          discount,
          finalFare,
          message: `${found.description} applied!`,
        };
      }
      return {
        valid: false,
        discount: 0,
        finalFare: fare,
        message: err?.response?.data?.message || err?.message || 'Invalid promo code',
      };
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const markNotificationRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await customFetch(`/users/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
    } catch (err) {
      console.log('Error marking notification read:', err);
    }
  };
  const markAllNotificationsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await Promise.all(notifications.filter((n) => !n.read).map((n) => markNotificationRead(n.id)));
  };

  return (
    <RideContext.Provider
      value={{
        rides,
        activeRide,
        completedRide,
        currentPickup,
        currentDestination,
        recentLocations,
        recordRecentLocation,
        liveDriverLocation,
        setCurrentPickup,
        setCurrentDestination,
        bookRide,
        startRide,
        completeRide,
        cancelRide,
        rateRide,
        rebookRide,
        refreshRides,

        savedPlaces,
        addSavedPlace,
        removeSavedPlace,

        paymentMethods,
        activePaymentMethod,
        setActivePaymentMethod,
        removePaymentMethod,

        emergencyContacts,
        addEmergencyContact,
        removeEmergencyContact,
        triggerEmergencySos,

        generateShareLink,
        chatMessages,
        fetchMessages,
        sendMessage,

        notifications,
        unreadCount,
        markNotificationRead,
        markAllNotificationsRead,

        applyPromo,

        driverProfile,
        isDriverOnline,
        driverOffers,
        toggleDriverOnline,
        acceptOffer,
        rejectOffer,
        markDriverArrived,
        startDriverTrip,
        completeDriverTrip,

        rideSortOption,
        setRideSortOption,
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

function fromApiRideProfile(profile: RideProfile): Ride {
  const pickup = {
    id: `p_${profile.id}`,
    name: profile.pickup.address.split(',')[0],
    address: profile.pickup.address,
    lat: profile.pickup.latitude,
    lng: profile.pickup.longitude,
  };
  const destination = {
    id: `d_${profile.id}`,
    name: profile.destination.address.split(',')[0],
    address: profile.destination.address,
    lat: profile.destination.latitude,
    lng: profile.destination.longitude,
  };
  const rideType = profile.rideType as RideType;
  const distance = profile.distanceMeters !== undefined
    ? Math.round((Number(profile.distanceMeters) / 1000) * 10) / 10
    : estimateTripDistanceKm([pickup, destination]);
  const duration = profile.etaSeconds !== undefined
    ? Math.ceil(Number(profile.etaSeconds) / 60)
    : estimateTripDurationMin(distance);

  return {
    id: profile.id,
    passengerId: profile.passengerId,
    driverId: profile.driverId ?? undefined,
    pickup,
    destination,
    stops: (profile as any).stops?.map((s: any, idx: number) => ({
      id: `s_${profile.id}_${idx}`,
      name: s.name || s.address.split(',')[0],
      address: s.address,
      lat: Number(s.latitude),
      lng: Number(s.longitude),
    })) ?? [],
    rideType,
    fare: Number(profile.finalFare ?? profile.estimatedFare ?? estimateRideFare(rideType, distance, duration)),
    distance,
    duration,
    status: profile.status as RideStatus,
    isShared: (profile as any).isShared ?? undefined,
    coRiderCount: (profile as any).coRiderCount ?? undefined,
    coRiderName: (profile as any).coRiderName ?? undefined,
    coRiderPickupAddress: (profile as any).coRiderPickupAddress ?? undefined,
    coRiderDropoffAddress: (profile as any).coRiderDropoffAddress ?? undefined,
    scheduledAt: profile.scheduledFor ?? undefined,
    startTripOtp: profile.startTripOtp ?? undefined,
    driver: profile.driver
      ? {
          id: profile.driver.id ?? 'd_assigned',
          name: profile.driver.name ?? 'Driver',
          rating: Number(profile.driver.rating ?? 0),
          vehicle: [profile.driver.vehicleMake, profile.driver.vehicleModel].filter(Boolean).join(' ') || 'Vehicle details unavailable',
          vehicleColor: profile.driver.vehicleColor ?? '',
          plate: profile.driver.plateNumber ?? '',
          phone: profile.driver.phone ?? '',
        }
      : undefined,
    createdAt: profile.createdAt,
  };
}
