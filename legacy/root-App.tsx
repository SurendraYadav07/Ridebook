import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Modal,
  Alert,
  Platform,
  Share,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ============================================================================
// 1. THEME & COLORS
// ============================================================================
const THEME = {
  background: '#0B0F19',
  card: '#161F30',
  secondary: '#1F2B42',
  muted: '#1A2333',
  foreground: '#F8FAFC',
  mutedForeground: '#94A3B8',
  border: '#2A374F',
  primary: '#4F46E5',
  primaryLight: '#6366F1',
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#F59E0B',
  radius: 16,
};

// ============================================================================
// 2. DATA MODELS & CONSTANTS
// ============================================================================
export interface Location {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  icon?: string;
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

export type RideType = 'economy' | 'premium' | 'xl';
export type RideStatus = 'scheduled' | 'searching' | 'active' | 'completed' | 'cancelled';

export interface Ride {
  id: string;
  pickup: Location;
  destination: Location;
  rideType: RideType;
  fare: number;
  originalFare?: number;
  discountAmount?: number;
  distance: number;
  duration: number;
  status: RideStatus;
  scheduledAt?: string;
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
  type: 'visa' | 'mastercard' | 'apple_pay' | 'cash';
  label: string;
  last4?: string;
  expiry?: string;
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
}

export const KNOWN_LOCATIONS: Location[] = [
  { id: 'loc1', name: 'Home', address: '42 Maple Street', lat: 37.7749, lng: -122.4194, icon: 'home', color: '#4F46E5' },
  { id: 'loc2', name: 'Office', address: '1 Market Street, SF', lat: 37.7945, lng: -122.3954, icon: 'briefcase', color: '#0891B2' },
  { id: 'loc3', name: 'Airport', address: 'SFO International Airport', lat: 37.6213, lng: -122.3790, icon: 'airplane', color: '#059669' },
  { id: 'loc4', name: 'Union Square', address: 'Union Square, San Francisco', lat: 37.7879, lng: -122.4075, icon: 'storefront', color: '#D97706' },
  { id: 'loc5', name: 'Golden Gate Bridge', address: 'Golden Gate Bridge, SF', lat: 37.8199, lng: -122.4783, icon: 'navigate', color: '#DC2626' },
];

export const RIDE_TYPES = [
  { id: 'economy' as RideType, name: 'Economy', seats: 4, baseFare: 8, perKm: 1.2, icon: 'car', eta: 4 },
  { id: 'premium' as RideType, name: 'Premium', seats: 4, baseFare: 16, perKm: 2.0, icon: 'car-sport', eta: 6 },
  { id: 'xl' as RideType, name: 'XL', seats: 6, baseFare: 20, perKm: 2.6, icon: 'bus', eta: 8 },
];

const PROMO_CODES: Record<string, { percent?: number; fixed?: number; desc: string }> = {
  RIDEGO20: { percent: 20, desc: '20% off any ride' },
  WELCOME50: { fixed: 5, desc: '$5 off your ride' },
  SAVE10: { percent: 10, desc: '10% off any trip' },
  AIRPORT15: { percent: 15, desc: '15% off airport rides' },
};

const DEMO_DRIVER: Driver = {
  id: 'd1',
  name: 'Carlos Mendez',
  rating: 4.9,
  vehicle: 'Toyota Camry Hybrid',
  vehicleColor: 'Midnight Black',
  plate: 'ABC 1234',
  phone: '+1 (555) 019-2834',
};

// ============================================================================
// 3. CONTEXT & STATE MANAGEMENT
// ============================================================================
interface AppState {
  user: { name: string; email: string; phone: string } | null;
  rides: Ride[];
  activeRide: Ride | null;
  paymentMethods: PaymentMethod[];
  activePayment: PaymentMethod;
  savedPlaces: Location[];
  emergencyContacts: EmergencyContact[];
  notifications: AppNotification[];
  unreadNotifs: number;
  bookRide: (p: Location, d: Location, type: RideType, fare: number, sched?: Date, opts?: any) => Ride;
  startRide: (id: string) => void;
  completeRide: (id: string) => void;
  cancelRide: (id: string) => void;
  rateRide: (id: string, stars: number, tip?: number, comps?: string[]) => void;
  applyPromo: (code: string, fare: number) => { valid: boolean; discount: number; finalFare: number; message: string };
  addPaymentMethod: (pm: PaymentMethod) => void;
  setActivePayment: (id: string) => void;
  addSavedPlace: (p: Location) => void;
  addEmergencyContact: (c: EmergencyContact) => void;
  markNotifsRead: () => void;
  login: (name: string, email: string) => void;
  logout: () => void;
}

const AppContext = createContext<AppState | null>(null);

// ============================================================================
// 4. MAIN APP CONTAINER
// ============================================================================
export default function App() {
  const [user, setUser] = useState<{ name: string; email: string; phone: string } | null>({
    name: 'Alex Johnson',
    email: 'alex@example.com',
    phone: '+1 (555) 012-3456',
  });

  const [rides, setRides] = useState<Ride[]>([
    {
      id: 'demo1',
      pickup: KNOWN_LOCATIONS[0],
      destination: KNOWN_LOCATIONS[2],
      rideType: 'premium',
      fare: 34.50,
      originalFare: 34.50,
      distance: 22.3,
      duration: 35,
      status: 'completed',
      driver: DEMO_DRIVER,
      rating: 5,
      tip: 3.00,
      compliments: ['Smooth driving 🚗', 'Clean car ✨'],
      paymentMethod: 'Visa ending in 4242',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ]);

  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [currentTab, setCurrentTab] = useState<'home' | 'activity' | 'schedule' | 'profile'>('home');
  const [screen, setScreen] = useState<'main' | 'booking' | 'tracking' | 'auth'>('main');

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    { id: 'pm1', type: 'visa', label: 'Visa ending in 4242', last4: '4242', expiry: '12/26' },
    { id: 'pm2', type: 'apple_pay', label: 'Apple Pay' },
    { id: 'pm3', type: 'cash', label: 'Cash on Arrival' },
  ]);
  const [activePaymentId, setActivePaymentId] = useState('pm1');

  const [savedPlaces, setSavedPlaces] = useState<Location[]>(KNOWN_LOCATIONS.slice(0, 3));
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([
    { id: 'ec1', name: 'Sarah Connor', phone: '+1 (555) 987-6543', relationship: 'Partner' },
    { id: 'ec2', name: 'John Doe', phone: '+1 (555) 456-7890', relationship: 'Family' },
  ]);

  const [notifications, setNotifications] = useState<AppNotification[]>([
    { id: 'n1', title: '20% Off Promo Available!', message: 'Use code RIDEGO20 at checkout for 20% discount.', timestamp: '2h ago', read: false },
    { id: 'n2', title: 'Trip Receipt Ready', message: 'Your trip to SFO Airport has been processed ($37.50).', timestamp: 'Yesterday', read: false },
  ]);

  const activePayment = paymentMethods.find(p => p.id === activePaymentId) || paymentMethods[0];

  const bookRide = (pickup: Location, destination: Location, rideType: RideType, fare: number, sched?: Date, opts?: any) => {
    const newRide: Ride = {
      id: 'ride_' + Date.now(),
      pickup,
      destination,
      rideType,
      fare,
      originalFare: opts?.originalFare,
      discountAmount: opts?.discountAmount,
      distance: 14.5,
      duration: 25,
      status: sched ? 'scheduled' : 'searching',
      scheduledAt: sched?.toISOString(),
      notes: opts?.notes,
      paymentMethod: activePayment.label,
      promoCode: opts?.promoCode,
      createdAt: new Date().toISOString(),
    };

    setRides(prev => [newRide, ...prev]);
    if (!sched) {
      setActiveRide(newRide);
    }
    return newRide;
  };

  const startRide = (id: string) => {
    setActiveRide(prev => prev ? { ...prev, status: 'active', driver: DEMO_DRIVER } : null);
    setRides(prev => prev.map(r => r.id === id ? { ...r, status: 'active', driver: DEMO_DRIVER } : r));
  };

  const completeRide = (id: string) => {
    setActiveRide(prev => prev ? { ...prev, status: 'completed' } : null);
    setRides(prev => prev.map(r => r.id === id ? { ...r, status: 'completed' } : r));
  };

  const cancelRide = (id: string) => {
    setActiveRide(null);
    setRides(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' } : r));
    setScreen('main');
  };

  const rateRide = (id: string, stars: number, tip = 0, comps: string[] = []) => {
    setRides(prev => prev.map(r => r.id === id ? { ...r, rating: stars, tip, compliments: comps } : r));
    setActiveRide(null);
    setScreen('main');
  };

  const applyPromo = (code: string, fare: number) => {
    const p = PROMO_CODES[code.trim().toUpperCase()];
    if (!p) return { valid: false, discount: 0, finalFare: fare, message: 'Invalid promo code' };
    const discount = p.percent ? (fare * p.percent) / 100 : (p.fixed || 0);
    const finalFare = Math.max(1, Math.round((fare - discount) * 100) / 100);
    return { valid: true, discount, finalFare, message: `${p.desc} applied!` };
  };

  return (
    <AppContext.Provider
      value={{
        user,
        rides,
        activeRide,
        paymentMethods,
        activePayment,
        savedPlaces,
        emergencyContacts,
        notifications,
        unreadNotifs: notifications.filter(n => !n.read).length,
        bookRide,
        startRide,
        completeRide,
        cancelRide,
        rateRide,
        applyPromo,
        addPaymentMethod: pm => setPaymentMethods(p => [...p, pm]),
        setActivePayment: setActivePaymentId,
        addSavedPlace: sp => setSavedPlaces(p => [...p, sp]),
        addEmergencyContact: ec => setEmergencyContacts(p => [...p, ec]),
        markNotifsRead: () => setNotifications(p => p.map(n => ({ ...n, read: true }))),
        login: (name, email) => setUser({ name, email, phone: '+1 (555) 012-3456' }),
        logout: () => setUser(null),
      }}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
        
        {/* Main Screen Switcher */}
        {screen === 'booking' ? (
          <BookingScreen onClose={() => setScreen('main')} onBooked={() => setScreen('tracking')} />
        ) : screen === 'tracking' ? (
          <TrackingScreen onClose={() => setScreen('main')} />
        ) : (
          <View style={styles.flex}>
            {currentTab === 'home' && <HomeScreen onOpenBooking={() => setScreen('booking')} onTrackRide={() => setScreen('tracking')} />}
            {currentTab === 'activity' && <ActivityScreen onRebook={() => setScreen('booking')} />}
            {currentTab === 'schedule' && <ScheduleScreen />}
            {currentTab === 'profile' && <ProfileScreen />}

            {/* Bottom Tab Bar */}
            <View style={styles.tabBar}>
              {[
                { key: 'home', icon: 'navigate', label: 'Ride' },
                { key: 'schedule', icon: 'calendar', label: 'Schedule' },
                { key: 'activity', icon: 'time', label: 'Activity' },
                { key: 'profile', icon: 'person', label: 'Account' },
              ].map(tab => {
                const isSelected = currentTab === tab.key;
                return (
                  <TouchableOpacity key={tab.key} style={styles.tabBtn} onPress={() => setCurrentTab(tab.key as any)}>
                    <Ionicons name={tab.icon as any} size={22} color={isSelected ? THEME.primaryLight : THEME.mutedForeground} />
                    <Text style={[styles.tabLabel, isSelected && styles.tabLabelActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </SafeAreaView>
    </AppContext.Provider>
  );
}

// ============================================================================
// 5. HOME SCREEN
// ============================================================================
function HomeScreen({ onOpenBooking, onTrackRide }: { onOpenBooking: () => void; onTrackRide: () => void }) {
  const ctx = useContext(AppContext)!;
  const [showNotifModal, setShowNotifModal] = useState(false);

  return (
    <View style={styles.flex}>
      {/* Map Header Simulation */}
      <View style={styles.mapContainer}>
        <View style={styles.mapGridPattern}>
          <Ionicons name="map-outline" size={64} color="#1E293B" />
          <Text style={{ color: '#475569', marginTop: 8, fontWeight: '600' }}>
            San Francisco Bay Area • Live GPS Active
          </Text>
        </View>

        {/* Top Header Overlay */}
        <View style={styles.homeHeader}>
          <View>
            <Text style={styles.greetingTitle}>Welcome back,</Text>
            <Text style={styles.greetingName}>{ctx.user?.name ?? 'Rider'}</Text>
          </View>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              setShowNotifModal(true);
              ctx.markNotifsRead();
            }}
          >
            <Ionicons name="notifications-outline" size={22} color="#FFF" />
            {ctx.unreadNotifs > 0 && <View style={styles.notifDot} />}
          </TouchableOpacity>
        </View>

        {/* Live Active Ride Banner */}
        {ctx.activeRide && (
          <TouchableOpacity style={styles.liveRideBanner} onPress={onTrackRide}>
            <Ionicons name="car-sport" size={22} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Ride in Progress</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Tap to open live GPS tracking & chat</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom Sheet Action Panel */}
      <View style={styles.bottomCard}>
        <TouchableOpacity style={styles.whereToBar} onPress={onOpenBooking}>
          <Ionicons name="search" size={20} color={THEME.primaryLight} />
          <Text style={styles.whereToText}>Where to?</Text>
        </TouchableOpacity>

        {/* Quick Picks */}
        <Text style={styles.sectionHeading}>Quick Destinations</Text>
        <View style={styles.quickRow}>
          {KNOWN_LOCATIONS.slice(0, 4).map(loc => (
            <TouchableOpacity key={loc.id} style={styles.quickItem} onPress={onOpenBooking}>
              <View style={[styles.quickIconCircle, { backgroundColor: (loc.color || THEME.primary) + '25' }]}>
                <Ionicons name={(loc.icon as any) || 'location'} size={22} color={loc.color || THEME.primaryLight} />
              </View>
              <Text style={styles.quickLabel}>{loc.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Places */}
        <Text style={[styles.sectionHeading, { marginTop: 16 }]}>Recent Trips</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {KNOWN_LOCATIONS.slice(1, 4).map(loc => (
            <TouchableOpacity key={loc.id} style={styles.recentRow} onPress={onOpenBooking}>
              <View style={styles.recentIconWrap}>
                <Ionicons name="time-outline" size={18} color={THEME.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recentTitle}>{loc.name}</Text>
                <Text style={styles.recentSub}>{loc.address}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={THEME.border} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Notifications Modal */}
      <Modal visible={showNotifModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifModal(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {ctx.notifications.map(n => (
                <View key={n.id} style={styles.notifItemCard}>
                  <Ionicons name="notifications" size={20} color={THEME.primaryLight} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifItemTitle}>{n.title}</Text>
                    <Text style={styles.notifItemBody}>{n.message}</Text>
                    <Text style={styles.notifItemTime}>{n.timestamp}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================================
// 6. BOOKING SCREEN
// ============================================================================
function BookingScreen({ onClose, onBooked }: { onClose: () => void; onBooked: () => void }) {
  const ctx = useContext(AppContext)!;
  const [pickup, setPickup] = useState<Location>(KNOWN_LOCATIONS[0]);
  const [destination, setDestination] = useState<Location>(KNOWN_LOCATIONS[2]);
  const [selectedType, setSelectedType] = useState<RideType>('economy');
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [isFinding, setIsFinding] = useState(false);

  const rawFare = selectedType === 'economy' ? 24.50 : selectedType === 'premium' ? 38.00 : 46.00;
  const promoRes = appliedPromo ? ctx.applyPromo(appliedPromo, rawFare) : { valid: false, discount: 0, finalFare: rawFare, message: '' };

  const handleApplyPromo = () => {
    const res = ctx.applyPromo(promoInput, rawFare);
    if (res.valid) {
      setAppliedPromo(promoInput.toUpperCase());
      Alert.alert('Promo Applied! 🎉', res.message);
    } else {
      Alert.alert('Invalid Promo', 'Code not recognized. Try RIDEGO20 or WELCOME50.');
    }
  };

  const handleConfirmRide = () => {
    setIsFinding(true);
    setTimeout(() => {
      ctx.bookRide(pickup, destination, selectedType, promoRes.finalFare, undefined, {
        notes: notes.trim(),
        promoCode: appliedPromo,
        originalFare: rawFare,
        discountAmount: promoRes.discount,
      });
      setIsFinding(false);
      onBooked();
    }, 2000);
  };

  if (isFinding) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: THEME.background }]}>
        <ActivityIndicator size="large" color={THEME.primaryLight} />
        <Text style={styles.findingTitle}>Finding Nearest Driver...</Text>
        <Text style={styles.findingSub}>Matching with Toyota Camry (Carlos M.)</Text>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: THEME.background }]}>
      {/* Header */}
      <View style={styles.screenHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={onClose}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Book Your Ride</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Route Select */}
        <View style={styles.routeCard}>
          <View style={styles.routeRowItem}>
            <Ionicons name="radio-button-on" size={16} color={THEME.primaryLight} />
            <Text style={styles.routeInputText}>{pickup.name} ({pickup.address})</Text>
          </View>
          <View style={styles.routeDivider} />
          <View style={styles.routeRowItem}>
            <Ionicons name="location" size={16} color={THEME.danger} />
            <Text style={styles.routeInputText}>{destination.name} ({destination.address})</Text>
          </View>
        </View>

        {/* Ride Options */}
        <Text style={styles.sectionHeading}>Choose Vehicle</Text>
        {RIDE_TYPES.map(rt => {
          const isSelected = selectedType === rt.id;
          const cost = rt.id === 'economy' ? 24.50 : rt.id === 'premium' ? 38.00 : 46.00;
          return (
            <TouchableOpacity
              key={rt.id}
              style={[styles.rideTypeCard, isSelected && styles.rideTypeCardActive]}
              onPress={() => setSelectedType(rt.id)}
            >
              <Ionicons name={rt.icon as any} size={28} color={isSelected ? THEME.primaryLight : '#94A3B8'} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.rideTypeName}>{rt.name}</Text>
                <Text style={styles.rideTypeSub}>{rt.seats} seats • ~{rt.eta} min away</Text>
              </View>
              <Text style={styles.rideTypePrice}>${cost.toFixed(2)}</Text>
            </TouchableOpacity>
          );
        })}

        {/* Promo Code Input */}
        <Text style={styles.sectionHeading}>Promo Code & Discount</Text>
        <View style={styles.promoBox}>
          <TextInput
            style={styles.promoTextInput}
            placeholder="Try RIDEGO20 or WELCOME50"
            placeholderTextColor="#64748B"
            value={promoInput}
            onChangeText={setPromoInput}
            autoCapitalize="characters"
          />
          <TouchableOpacity style={styles.promoApplyBtn} onPress={handleApplyPromo}>
            <Text style={{ color: '#FFF', fontWeight: '700' }}>Apply</Text>
          </TouchableOpacity>
        </View>
        {appliedPromo && (
          <Text style={{ color: THEME.success, fontSize: 13, marginTop: 6, fontWeight: '600' }}>
            ✓ {appliedPromo} applied (-${promoRes.discount.toFixed(2)})
          </Text>
        )}

        {/* Pickup Notes */}
        <TouchableOpacity style={styles.notesToggleRow} onPress={() => setShowNotes(!showNotes)}>
          <Ionicons name="chatbox-outline" size={18} color={THEME.mutedForeground} />
          <Text style={styles.notesToggleText}>{notes ? `Note: "${notes}"` : 'Add Driver Pickup Note (Optional)'}</Text>
          <Ionicons name={showNotes ? 'chevron-up' : 'chevron-down'} size={16} color={THEME.mutedForeground} />
        </TouchableOpacity>
        {showNotes && (
          <TextInput
            style={styles.notesInput}
            placeholder="e.g., Waiting near main glass entrance..."
            placeholderTextColor="#64748B"
            value={notes}
            onChangeText={setNotes}
          />
        )}

        {/* Payment Summary & Book Action */}
        <View style={styles.fareSummaryCard}>
          <View style={styles.fareRow}>
            <Text style={{ color: THEME.mutedForeground }}>Payment Method</Text>
            <Text style={{ color: '#FFF', fontWeight: '600' }}>{ctx.activePayment.label}</Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>Total Fare</Text>
            <Text style={{ color: THEME.primaryLight, fontSize: 22, fontWeight: '800' }}>
              ${promoRes.finalFare.toFixed(2)}
            </Text>
          </View>

          <TouchableOpacity style={styles.mainActionButton} onPress={handleConfirmRide}>
            <Text style={styles.mainActionButtonText}>Confirm & Request Ride</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// 7. LIVE TRACKING, DRIVER CHAT & SAFETY SOS SCREEN
// ============================================================================
function TrackingScreen({ onClose }: { onClose: () => void }) {
  const ctx = useContext(AppContext)!;
  const [tripStep, setTripStep] = useState<'arriving' | 'in_progress' | 'completed'>('arriving');

  // Chat state
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { id: '1', sender: 'driver', text: "Hello Alex! I'm en route in a black Camry." },
  ]);
  const [chatInput, setChatInput] = useState('');

  // Safety modal
  const [showSafety, setShowSafety] = useState(false);

  // Rating modal
  const [showRating, setShowRating] = useState(false);
  const [selectedStars, setSelectedStars] = useState(5);
  const [selectedTip, setSelectedTip] = useState(2);

  const ride = ctx.activeRide || ctx.rides[0];

  useEffect(() => {
    if (ctx.activeRide && !ctx.activeRide.driver) {
      ctx.startRide(ctx.activeRide.id);
    }
  }, []);

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || chatInput).trim();
    if (!text) return;
    setChatMessages(p => [...p, { id: Date.now().toString(), sender: 'user', text }]);
    setChatInput('');

    setTimeout(() => {
      setChatMessages(p => [...p, { id: (Date.now() + 1).toString(), sender: 'driver', text: 'Got it! See you in 2 mins.' }]);
    }, 1200);
  };

  const handleShareTrip = async () => {
    await Share.share({
      message: `I'm on a RideGo trip with driver ${DEMO_DRIVER.name} (${DEMO_DRIVER.plate}). Track live: https://ridego.app/track/${ride?.id}`,
    });
  };

  const handleFinishRating = () => {
    if (ride) {
      ctx.rateRide(ride.id, selectedStars, selectedTip, ['Smooth driving 🚗', 'Clean car ✨']);
    }
    setShowRating(false);
    onClose();
  };

  return (
    <View style={[styles.flex, { backgroundColor: THEME.background }]}>
      {/* Live Map Representation */}
      <View style={[styles.flex, styles.center, { backgroundColor: '#0F172A' }]}>
        <Ionicons name="navigate-circle" size={80} color={THEME.primaryLight} />
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 12 }}>
          {tripStep === 'arriving' ? 'Driver is 3 mins away' : tripStep === 'in_progress' ? 'Trip in Progress (22 min to Airport)' : 'Arrived at Destination!'}
        </Text>
        <Text style={{ color: THEME.mutedForeground, fontSize: 13, marginTop: 4 }}>
          Live GPS Route Active • {ride?.pickup.name} → {ride?.destination.name}
        </Text>

        {/* Safety SOS Quick Button */}
        <TouchableOpacity style={styles.floatingSafetyBtn} onPress={() => setShowSafety(true)}>
          <Ionicons name="shield-checkmark" size={20} color="#FFF" />
          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12, marginLeft: 6 }}>Safety Toolkit</Text>
        </TouchableOpacity>
      </View>

      {/* Driver Control Card */}
      <View style={styles.driverBottomCard}>
        <View style={styles.driverInfoRow}>
          <View style={styles.driverAvatar}>
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 18 }}>CM</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>{DEMO_DRIVER.name}</Text>
            <Text style={{ color: THEME.mutedForeground, fontSize: 13 }}>{DEMO_DRIVER.vehicleColor} {DEMO_DRIVER.vehicle}</Text>
          </View>
          <View style={styles.plateChip}>
            <Text style={{ color: '#FFF', fontWeight: '800', letterSpacing: 1 }}>{DEMO_DRIVER.plate}</Text>
          </View>
        </View>

        {/* Action Buttons (Call, Chat, Step Sim) */}
        <View style={styles.driverActionRow}>
          <TouchableOpacity style={styles.driverBtn} onPress={() => Alert.alert('Calling Driver', `${DEMO_DRIVER.name}: ${DEMO_DRIVER.phone}`)}>
            <Ionicons name="call" size={18} color="#FFF" />
            <Text style={styles.driverBtnText}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.driverBtn, { backgroundColor: THEME.secondary }]} onPress={() => setShowChat(true)}>
            <Ionicons name="chatbubble-ellipses" size={18} color={THEME.primaryLight} />
            <Text style={[styles.driverBtnText, { color: '#FFF' }]}>Chat</Text>
          </TouchableOpacity>

          {tripStep === 'arriving' ? (
            <TouchableOpacity style={[styles.driverBtn, { backgroundColor: THEME.success }]} onPress={() => setTripStep('in_progress')}>
              <Ionicons name="play" size={18} color="#FFF" />
              <Text style={styles.driverBtnText}>Start Trip</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.driverBtn, { backgroundColor: THEME.primary }]}
              onPress={() => {
                setTripStep('completed');
                ctx.completeRide(ride?.id || '');
                setShowRating(true);
              }}
            >
              <Ionicons name="checkmark-done" size={18} color="#FFF" />
              <Text style={styles.driverBtnText}>Complete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Driver Chat Modal */}
      <Modal visible={showChat} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Chat with {DEMO_DRIVER.name}</Text>
              <TouchableOpacity onPress={() => setShowChat(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ height: 220, marginVertical: 10 }}>
              {chatMessages.map(m => (
                <View
                  key={m.id}
                  style={[
                    styles.chatBubble,
                    m.sender === 'user' ? styles.chatBubbleUser : styles.chatBubbleDriver,
                  ]}
                >
                  <Text style={{ color: '#FFF', fontSize: 14 }}>{m.text}</Text>
                </View>
              ))}
            </ScrollView>

            {/* Quick chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {["I'm at the pickup point", 'Be there in 2 mins', "I'm in a black jacket"].map((c, i) => (
                <TouchableOpacity key={i} style={styles.quickReplyChip} onPress={() => handleSendMessage(c)}>
                  <Text style={{ color: '#FFF', fontSize: 12 }}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                placeholder="Type a message..."
                placeholderTextColor="#64748B"
                value={chatInput}
                onChangeText={setChatInput}
              />
              <TouchableOpacity style={styles.chatSendBtn} onPress={() => handleSendMessage()}>
                <Ionicons name="send" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Safety & SOS Toolkit Modal */}
      <Modal visible={showSafety} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: THEME.danger }]}>🛡️ Safety & SOS Toolkit</Text>
              <TouchableOpacity onPress={() => setShowSafety(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.safetyActionCard, { backgroundColor: '#EF444420' }]}
              onPress={() => Alert.alert('Emergency Call', 'Connecting direct to 911 Assistance...')}
            >
              <Ionicons name="call" size={24} color={THEME.danger} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: THEME.danger, fontWeight: '700', fontSize: 15 }}>Call 911 Emergency</Text>
                <Text style={{ color: THEME.mutedForeground, fontSize: 12 }}>Connect immediately with local dispatch</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.safetyActionCard} onPress={handleShareTrip}>
              <Ionicons name="share-social" size={24} color={THEME.primaryLight} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>Share Live Trip Link</Text>
                <Text style={{ color: THEME.mutedForeground, fontSize: 12 }}>Broadcast driver info & live GPS link</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.safetyActionCard}
              onPress={() => Alert.alert('Contacts Alerted', 'Live location broadcasted to trusted emergency contacts.')}
            >
              <Ionicons name="people" size={24} color={THEME.success} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>Alert Emergency Contacts</Text>
                <Text style={{ color: THEME.mutedForeground, fontSize: 12 }}>{ctx.emergencyContacts.length} trusted contacts on file</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Review & Tipping Modal */}
      <Modal visible={showRating} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Ionicons name="checkmark-circle" size={48} color={THEME.success} style={{ alignSelf: 'center', marginBottom: 8 }} />
            <Text style={[styles.modalTitle, { textAlign: 'center' }]}>Trip Complete!</Text>
            <Text style={{ color: THEME.mutedForeground, textAlign: 'center', marginBottom: 16 }}>
              How was your ride with {DEMO_DRIVER.name}?
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5].map(s => (
                <TouchableOpacity key={s} onPress={() => setSelectedStars(s)}>
                  <Ionicons name={selectedStars >= s ? 'star' : 'star-outline'} size={36} color="#FBBF24" />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionHeading}>Add a Tip for Carlos</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              {[0, 1, 2, 5].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tipPill, selectedTip === t && styles.tipPillActive]}
                  onPress={() => setSelectedTip(t)}
                >
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>{t === 0 ? 'No Tip' : `$${t}`}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.mainActionButton} onPress={handleFinishRating}>
              <Text style={styles.mainActionButtonText}>Submit Review</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================================
// 8. SCHEDULE TAB
// ============================================================================
function ScheduleScreen() {
  const ctx = useContext(AppContext)!;
  const [pickup, setPickup] = useState<Location>(KNOWN_LOCATIONS[0]);
  const [destination, setDestination] = useState<Location>(KNOWN_LOCATIONS[2]);
  const [selectedDay, setSelectedDay] = useState('Tomorrow');
  const [selectedTime, setSelectedTime] = useState('08:30 AM');
  const [scheduledSuccess, setScheduledSuccess] = useState(false);

  const handleSchedule = () => {
    ctx.bookRide(pickup, destination, 'economy', 24.50, new Date(Date.now() + 86400000));
    setScheduledSuccess(true);
    setTimeout(() => setScheduledSuccess(false), 3000);
  };

  return (
    <ScrollView style={[styles.flex, { backgroundColor: THEME.background }]} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.pageTitle}>Schedule a Ride</Text>
      <Text style={styles.pageSub}>Reserve your pickup up to 7 days ahead</Text>

      {scheduledSuccess && (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={20} color="#FFF" />
          <Text style={{ color: '#FFF', fontWeight: '700', marginLeft: 8 }}>Ride successfully scheduled!</Text>
        </View>
      )}

      {/* Date Selector */}
      <Text style={styles.sectionHeading}>Pickup Date</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {['Today', 'Tomorrow', 'In 2 Days', 'Friday'].map(d => (
          <TouchableOpacity
            key={d}
            style={[styles.dateChip, selectedDay === d && styles.dateChipActive]}
            onPress={() => setSelectedDay(d)}
          >
            <Text style={{ color: '#FFF', fontWeight: '600' }}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Time Selector */}
      <Text style={styles.sectionHeading}>Pickup Time</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {['07:00 AM', '08:30 AM', '12:00 PM', '05:30 PM', '09:00 PM'].map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.timeChip, selectedTime === t && styles.timeChipActive]}
            onPress={() => setSelectedTime(t)}
          >
            <Text style={{ color: '#FFF', fontWeight: '600' }}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.mainActionButton} onPress={handleSchedule}>
        <Ionicons name="calendar" size={20} color="#FFF" style={{ marginRight: 8 }} />
        <Text style={styles.mainActionButtonText}>Confirm Scheduled Ride (~$24.50)</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ============================================================================
// 9. ACTIVITY & TRIP RECEIPTS TAB
// ============================================================================
function ActivityScreen({ onRebook }: { onRebook: () => void }) {
  const ctx = useContext(AppContext)!;
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);

  return (
    <View style={[styles.flex, { backgroundColor: THEME.background, padding: 20 }]}>
      <Text style={styles.pageTitle}>Your Activity</Text>
      <Text style={styles.pageSub}>Past rides & itemized receipts</Text>

      <FlatList
        data={ctx.rides}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.activityCard} onPress={() => setSelectedRide(item)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: THEME.mutedForeground, fontSize: 13 }}>
                {new Date(item.createdAt).toLocaleDateString()} • {item.rideType.toUpperCase()}
              </Text>
              <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>${item.fare.toFixed(2)}</Text>
            </View>
            <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>
              {item.pickup.name} → {item.destination.name}
            </Text>
            <View style={styles.activityFooterRow}>
              <View style={styles.statusBadge}>
                <Text style={{ color: THEME.success, fontSize: 12, fontWeight: '700' }}>{item.status.toUpperCase()}</Text>
              </View>
              <TouchableOpacity
                style={styles.rebookBtn}
                onPress={() => {
                  onRebook();
                }}
              >
                <Ionicons name="repeat" size={14} color={THEME.primaryLight} />
                <Text style={{ color: THEME.primaryLight, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Book Again</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Receipt Modal */}
      <Modal visible={!!selectedRide} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Trip Receipt</Text>
              <TouchableOpacity onPress={() => setSelectedRide(null)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            {selectedRide && (
              <ScrollView>
                <View style={styles.receiptBox}>
                  <View style={styles.fareRow}>
                    <Text style={{ color: THEME.mutedForeground }}>Base & Distance Fare</Text>
                    <Text style={{ color: '#FFF' }}>${(selectedRide.originalFare || selectedRide.fare).toFixed(2)}</Text>
                  </View>
                  {selectedRide.discountAmount ? (
                    <View style={styles.fareRow}>
                      <Text style={{ color: THEME.success }}>Promo Discount ({selectedRide.promoCode})</Text>
                      <Text style={{ color: THEME.success }}>-${selectedRide.discountAmount.toFixed(2)}</Text>
                    </View>
                  ) : null}
                  {selectedRide.tip ? (
                    <View style={styles.fareRow}>
                      <Text style={{ color: '#FFF' }}>Driver Tip</Text>
                      <Text style={{ color: '#FFF' }}>+${selectedRide.tip.toFixed(2)}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.fareRow, { borderTopWidth: 1, borderColor: THEME.border, paddingTop: 10, marginTop: 8 }]}>
                    <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>Total Charged</Text>
                    <Text style={{ color: THEME.primaryLight, fontWeight: '800', fontSize: 20 }}>
                      ${(selectedRide.fare + (selectedRide.tip || 0)).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.mainActionButton}
                  onPress={() => {
                    setSelectedRide(null);
                    onRebook();
                  }}
                >
                  <Ionicons name="repeat" size={18} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.mainActionButtonText}>Book This Route Again</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================================
// 10. PROFILE & SETTINGS HUB TAB
// ============================================================================
function ProfileScreen() {
  const ctx = useContext(AppContext)!;
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(ctx.user?.name || '');
  const [showPayments, setShowPayments] = useState(false);
  const [showPlaces, setShowPlaces] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <ScrollView style={[styles.flex, { backgroundColor: THEME.background }]} contentContainerStyle={{ padding: 20 }}>
      {/* User Header */}
      <View style={styles.profileHeaderCard}>
        <View style={styles.profileBigAvatar}>
          <Text style={{ color: '#FFF', fontSize: 32, fontWeight: '800' }}>
            {ctx.user?.name?.slice(0, 2).toUpperCase() ?? 'AJ'}
          </Text>
        </View>
        <Text style={styles.profileName}>{ctx.user?.name ?? 'Alex Johnson'}</Text>
        <Text style={styles.profileSub}>{ctx.user?.email ?? 'alex@example.com'}</Text>
        <TouchableOpacity style={styles.editProfileBtn} onPress={() => setShowEdit(true)}>
          <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 13 }}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Settings Rows */}
      <Text style={styles.sectionHeading}>Manage Account</Text>
      <View style={styles.settingsGroup}>
        <TouchableOpacity style={styles.settingsRow} onPress={() => setShowPayments(true)}>
          <Ionicons name="card-outline" size={20} color={THEME.primaryLight} />
          <Text style={styles.settingsLabel}>Payment Methods</Text>
          <Ionicons name="chevron-forward" size={16} color={THEME.mutedForeground} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingsRow} onPress={() => setShowPlaces(true)}>
          <Ionicons name="bookmark-outline" size={20} color={THEME.primaryLight} />
          <Text style={styles.settingsLabel}>Saved Favorite Places</Text>
          <Ionicons name="chevron-forward" size={16} color={THEME.mutedForeground} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingsRow} onPress={() => setShowHelp(true)}>
          <Ionicons name="help-circle-outline" size={20} color={THEME.primaryLight} />
          <Text style={styles.settingsLabel}>Help Center & FAQs</Text>
          <Ionicons name="chevron-forward" size={16} color={THEME.mutedForeground} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingsRow}
          onPress={() => Alert.alert('Sign Out', 'Are you sure you want to sign out?', [{ text: 'Cancel' }, { text: 'Sign Out', style: 'destructive', onPress: ctx.logout }])}
        >
          <Ionicons name="log-out-outline" size={20} color={THEME.danger} />
          <Text style={[styles.settingsLabel, { color: THEME.danger }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Edit Profile Modal */}
      <Modal visible={showEdit} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Profile Name</Text>
            <TextInput
              style={styles.modalTextInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              placeholderTextColor="#64748B"
            />
            <TouchableOpacity
              style={styles.mainActionButton}
              onPress={() => {
                ctx.login(editName, ctx.user?.email || 'alex@example.com');
                setShowEdit(false);
              }}
            >
              <Text style={styles.mainActionButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Payments Modal */}
      <Modal visible={showPayments} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Payment Cards</Text>
              <TouchableOpacity onPress={() => setShowPayments(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            {ctx.paymentMethods.map(pm => (
              <TouchableOpacity
                key={pm.id}
                style={styles.paymentMethodItem}
                onPress={() => {
                  ctx.setActivePayment(pm.id);
                  setShowPayments(false);
                }}
              >
                <Ionicons name="card" size={20} color={THEME.primaryLight} />
                <Text style={{ color: '#FFF', flex: 1, marginLeft: 12, fontWeight: '600' }}>{pm.label}</Text>
                {ctx.activePayment.id === pm.id && <Ionicons name="checkmark-circle" size={22} color={THEME.primaryLight} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Help Modal */}
      <Modal visible={showHelp} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Help & Support</Text>
              <TouchableOpacity onPress={() => setShowHelp(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {[
                { q: 'How is fare calculated?', a: 'Base rate + distance fee per km + vehicle type factor.' },
                { q: 'How do promo codes work?', a: 'Enter codes like RIDEGO20 in the booking screen before confirming.' },
                { q: 'How to use Safety SOS?', a: 'Tap the Safety shield on the live tracking screen to alert contacts or 911.' },
              ].map((faq, i) => (
                <View key={i} style={{ marginBottom: 14 }}>
                  <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>{faq.q}</Text>
                  <Text style={{ color: THEME.mutedForeground, fontSize: 13, marginTop: 2 }}>{faq.a}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ============================================================================
// 11. STYLES
// ============================================================================
const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  safeArea: { flex: 1, backgroundColor: THEME.background },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: THEME.card,
    borderTopWidth: 1,
    borderColor: THEME.border,
    paddingVertical: 10,
  },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 11, color: THEME.mutedForeground, marginTop: 4, fontWeight: '500' },
  tabLabelActive: { color: THEME.primaryLight, fontWeight: '700' },
  mapContainer: { height: SCREEN_HEIGHT * 0.45, backgroundColor: '#0A0F1D', position: 'relative' },
  mapGridPattern: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  homeHeader: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingTitle: { color: THEME.mutedForeground, fontSize: 13, fontWeight: '600' },
  greetingName: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.primaryLight,
  },
  liveRideBanner: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    right: 20,
    backgroundColor: THEME.primary,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bottomCard: {
    flex: 1,
    backgroundColor: THEME.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  whereToBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.secondary,
    borderRadius: 50,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 16,
  },
  whereToText: { color: THEME.mutedForeground, fontSize: 16, marginLeft: 10, fontWeight: '600' },
  sectionHeading: { color: THEME.mutedForeground, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  quickItem: { alignItems: 'center', width: (SCREEN_WIDTH - 60) / 4 },
  quickIconCircle: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  quickLabel: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: THEME.border },
  recentIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: THEME.secondary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  recentTitle: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  recentSub: { color: THEME.mutedForeground, fontSize: 12, marginTop: 2 },
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: THEME.card, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  routeCard: { backgroundColor: THEME.card, borderRadius: 16, padding: 16, marginBottom: 16 },
  routeRowItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routeInputText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  routeDivider: { width: 2, height: 16, backgroundColor: THEME.border, marginLeft: 7, marginVertical: 4 },
  rideTypeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: THEME.border },
  rideTypeCardActive: { borderColor: THEME.primaryLight, backgroundColor: THEME.primary + '18' },
  rideTypeName: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  rideTypeSub: { color: THEME.mutedForeground, fontSize: 12, marginTop: 2 },
  rideTypePrice: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  promoBox: { flexDirection: 'row', gap: 8 },
  promoTextInput: { flex: 1, backgroundColor: THEME.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#FFF', fontWeight: '600' },
  promoApplyBtn: { backgroundColor: THEME.primary, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  notesToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingVertical: 8 },
  notesToggleText: { color: '#FFF', fontSize: 13, fontWeight: '600', flex: 1 },
  notesInput: { backgroundColor: THEME.card, borderRadius: 12, padding: 12, color: '#FFF', marginTop: 6 },
  fareSummaryCard: { backgroundColor: THEME.card, borderRadius: 16, padding: 16, marginTop: 16 },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mainActionButton: { backgroundColor: THEME.primary, borderRadius: 50, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 12 },
  mainActionButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  findingTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginTop: 16 },
  findingSub: { color: THEME.mutedForeground, fontSize: 14, marginTop: 4 },
  floatingSafetyBtn: { position: 'absolute', top: 20, right: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.danger, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  driverBottomCard: { backgroundColor: THEME.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  driverInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  driverAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: THEME.primary, alignItems: 'center', justifyContent: 'center' },
  plateChip: { backgroundColor: THEME.secondary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  driverActionRow: { flexDirection: 'row', gap: 10 },
  driverBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.primary, borderRadius: 12, paddingVertical: 12, gap: 6 },
  driverBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: THEME.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  modalTextInput: { backgroundColor: THEME.secondary, borderRadius: 12, padding: 14, color: '#FFF', marginBottom: 14 },
  chatBubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, marginBottom: 8, maxWidth: '80%' },
  chatBubbleUser: { alignSelf: 'flex-end', backgroundColor: THEME.primary },
  chatBubbleDriver: { alignSelf: 'flex-start', backgroundColor: THEME.secondary },
  quickReplyChip: { backgroundColor: THEME.secondary, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  chatInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chatInput: { flex: 1, backgroundColor: THEME.secondary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#FFF' },
  chatSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: THEME.primary, alignItems: 'center', justifyContent: 'center' },
  safetyActionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.secondary, borderRadius: 14, padding: 14, marginBottom: 10 },
  tipPill: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: THEME.secondary, alignItems: 'center' },
  tipPillActive: { backgroundColor: THEME.primary },
  pageTitle: { color: '#FFF', fontSize: 26, fontWeight: '800' },
  pageSub: { color: THEME.mutedForeground, fontSize: 14, marginBottom: 20 },
  successBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.success, borderRadius: 12, padding: 12, marginBottom: 16 },
  dateChip: { flex: 1, backgroundColor: THEME.card, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  dateChipActive: { backgroundColor: THEME.primary },
  timeChip: { backgroundColor: THEME.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  timeChipActive: { backgroundColor: THEME.primary },
  activityCard: { backgroundColor: THEME.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: THEME.border },
  activityFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderColor: THEME.border },
  statusBadge: { backgroundColor: '#22C55E20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  rebookBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.primary + '20', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  receiptBox: { backgroundColor: THEME.secondary, borderRadius: 12, padding: 14, marginBottom: 14 },
  profileHeaderCard: { backgroundColor: THEME.card, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 20 },
  profileBigAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: THEME.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  profileName: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  profileSub: { color: THEME.mutedForeground, fontSize: 13, marginTop: 2 },
  editProfileBtn: { marginTop: 12, backgroundColor: THEME.secondary, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  settingsGroup: { backgroundColor: THEME.card, borderRadius: 16, overflow: 'hidden' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: THEME.border },
  settingsLabel: { color: '#FFF', fontSize: 15, fontWeight: '600', flex: 1, marginLeft: 14 },
  notifItemCard: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: THEME.border },
  notifItemTitle: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  notifItemBody: { color: THEME.mutedForeground, fontSize: 12, marginTop: 2 },
  notifItemTime: { color: '#64748B', fontSize: 11, marginTop: 4 },
  paymentMethodItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: THEME.border },
});
