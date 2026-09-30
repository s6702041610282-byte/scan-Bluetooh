import { Buffer } from 'buffer';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BleManager, Device, State } from 'react-native-ble-plx';

const manager = new BleManager();

const SERVICE_UUID = 'aee04821-1973-4e1f-a590-e84b10d580e7';
const CHAR_UUID = 'cde07b1a-889b-44b7-a99f-c888dddac729';

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: 'Scan & Connect',
  2: 'Read Initial Data',
  3: 'Send Names',
  4: 'Grade Prediction',
};

export default function Index() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [initialValue, setInitialValue] = useState('');
  const [myName, setMyName] = useState('');
  const [buddyName, setBuddyName] = useState('');
  const [gradeResult, setGradeResult] = useState('');

  // Pulse animation for scanning dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isScanning]);

  useEffect(() => {
    if (gradeResult) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    } else {
      glowAnim.setValue(0);
    }
  }, [gradeResult]);

  useEffect(() => {
    return () => {
      manager.stopDeviceScan();
      manager.destroy();
    };
  }, []);

  async function requestPermissions() {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    return true;
  }

  // ──────────────────────────────────────────────────────
  // Step 1 – Scan & Connect
  // ──────────────────────────────────────────────────────
  const startScan = async () => {
    const btState = await manager.state();
    if (btState !== State.PoweredOn) {
      Alert.alert('⚠️ Bluetooth Off', 'Please turn on Bluetooth and try again.');
      return;
    }
    const permGranted = await requestPermissions();
    if (!permGranted) {
      Alert.alert('⚠️ Permission Denied', 'Bluetooth & Location permissions are required.');
      return;
    }

    setDevices([]);
    setIsScanning(true);

    manager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        setIsScanning(false);
        Alert.alert('Scan Error', error.message);
        return;
      }
      if (device) {
        setDevices((prev) => {
          if (prev.some((d) => d.id === device.id)) return prev;
          return [...prev, device];
        });
      }
    });

    setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
    }, 10000);
  };

  const connectToDevice = async (device: Device) => {
    manager.stopDeviceScan();
    setIsScanning(false);
    setIsLoading(true);
    try {
      const connected = await manager.connectToDevice(device.id);
      const discovered = await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(discovered);
      setStep(2);
    } catch (error: any) {
      Alert.alert('Connection Failed', error?.message || 'Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────
  // Step 2 – Read Initial Value
  // ──────────────────────────────────────────────────────
  const readInitialValue = async () => {
    if (!connectedDevice) return;
    setIsLoading(true);
    try {
      const characteristic = await manager.readCharacteristicForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        CHAR_UUID
      );
      const raw = Buffer.from(characteristic.value || '', 'base64').toString('utf-8');
      setInitialValue(raw);
      setStep(3);
    } catch (error: any) {
      Alert.alert('Read Failed', error?.message || 'Failed to read data from device.');
    } finally {
      setIsLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────
  // Step 3 – Send Names
  // ──────────────────────────────────────────────────────
  const sendNames = async () => {
    if (!connectedDevice) return;
    if (!myName.trim() || !buddyName.trim()) {
      Alert.alert('⚠️ Missing Info', 'Please enter both your name and your buddy\'s name.');
      return;
    }
    setIsLoading(true);
    try {
      const payload = `${myName.trim()}, ${buddyName.trim()}`;
      const base64Value = Buffer.from(payload, 'utf-8').toString('base64');
      await manager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        CHAR_UUID,
        base64Value
      );
      setStep(4);
    } catch (error: any) {
      Alert.alert('Send Failed', error?.message || 'Failed to send data to device.');
    } finally {
      setIsLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────
  // Step 4 – Read Grade Prediction
  // ──────────────────────────────────────────────────────
  const readGrade = async () => {
    if (!connectedDevice) return;
    setIsLoading(true);
    try {
      const characteristic = await manager.readCharacteristicForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        CHAR_UUID
      );
      const raw = Buffer.from(characteristic.value || '', 'base64').toString('utf-8');
      setGradeResult(raw);
    } catch (error: any) {
      Alert.alert('Read Failed', error?.message || 'Failed to read grade result.');
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectDevice = async () => {
    if (!connectedDevice) return;
    try {
      await manager.cancelDeviceConnection(connectedDevice.id);
    } catch (_) {}
    setConnectedDevice(null);
    setStep(1);
    setDevices([]);
    setInitialValue('');
    setMyName('');
    setBuddyName('');
    setGradeResult('');
  };

  // ──────────────────────────────────────────────────────
  // Stepper Progress Bar
  // ──────────────────────────────────────────────────────
  const StepperBar = () => (
    <View style={styles.stepperContainer}>
      {([1, 2, 3, 4] as Step[]).map((s, i) => (
        <React.Fragment key={s}>
          <View style={styles.stepperNode}>
            <View style={[styles.stepperCircle, step >= s && styles.stepperCircleActive]}>
              {step > s ? (
                <Text style={styles.stepperCheck}>✓</Text>
              ) : (
                <Text style={[styles.stepperNum, step === s && styles.stepperNumActive]}>
                  {s}
                </Text>
              )}
            </View>
            <Text style={[styles.stepperLabel, step === s && styles.stepperLabelActive]}>
              {STEP_LABELS[s]}
            </Text>
          </View>
          {i < 3 && (
            <View style={[styles.stepperLine, step > s && styles.stepperLineActive]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      {/* Background gradient blobs */}
      <View style={styles.blob1} />
      <View style={styles.blob2} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.iconRing}>
            <Text style={styles.iconEmoji}>🔮</Text>
          </View>
          <Text style={styles.appTitle}>BLE Grade Predictor</Text>
          <Text style={styles.appSubtitle}>Bluetooth Smart Assessment System</Text>
        </View>

        {/* ── Stepper ── */}
        <StepperBar />

        {/* ═══════════════════════════════════════════
            STEP 1 – Scan & Connect
        ════════════════════════════════════════════ */}
        <View style={[styles.card, step === 1 ? styles.cardActive : step > 1 ? styles.cardDone : styles.cardLocked]}>
          <View style={styles.cardHeader}>
            <View style={[styles.badge, step === 1 && styles.badgeActive, step > 1 && styles.badgeDone]}>
              <Text style={styles.badgeText}>{step > 1 ? '✓' : '01'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Scan &amp; Connect Device</Text>
              <Text style={styles.cardDesc}>Find your instructor's BLE device</Text>
            </View>
          </View>

          {!connectedDevice ? (
            <>
              <TouchableOpacity
                style={[styles.btn, isScanning && styles.btnScanning]}
                onPress={startScan}
                disabled={isScanning || isLoading}
                activeOpacity={0.75}
              >
                {isScanning ? (
                  <View style={styles.scanningRow}>
                    <Animated.View style={[styles.scanDot, { transform: [{ scale: pulseAnim }] }]} />
                    <Text style={styles.btnText}>Scanning for devices...</Text>
                  </View>
                ) : (
                  <Text style={styles.btnText}>🔍  Scan Devices</Text>
                )}
              </TouchableOpacity>

              {devices.length > 0 && (
                <View style={styles.deviceList}>
                  <Text style={styles.listLabel}>Found Devices</Text>
                  {devices.map((device) => (
                    <TouchableOpacity
                      key={device.id}
                      style={styles.deviceItem}
                      onPress={() => connectToDevice(device)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.deviceIcon}>
                        <Text style={{ fontSize: 16 }}>📡</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.deviceName}>{device.name || 'Unknown Device'}</Text>
                        <Text style={styles.deviceId}>{device.id}</Text>
                      </View>
                      <Text style={styles.connectArrow}>›</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {isScanning && devices.length === 0 && (
                <View style={styles.emptyHint}>
                  <Text style={styles.emptyHintText}>Looking for nearby BLE devices…</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.connectedCard}>
              <View style={styles.connectedLeft}>
                <View style={styles.connectedDot} />
                <View>
                  <Text style={styles.connectedTitle}>Connected</Text>
                  <Text style={styles.connectedName}>{connectedDevice.name || connectedDevice.id}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.disconnectBtn} onPress={disconnectDevice}>
                <Text style={styles.disconnectText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ═══════════════════════════════════════════
            STEP 2 – Read Initial Value
        ════════════════════════════════════════════ */}
        <View style={[styles.card, step === 2 ? styles.cardActive : step > 2 ? styles.cardDone : styles.cardLocked]}>
          <View style={styles.cardHeader}>
            <View style={[styles.badge, step === 2 && styles.badgeActive, step > 2 && styles.badgeDone]}>
              <Text style={styles.badgeText}>{step > 2 ? '✓' : '02'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Read Initial Data</Text>
              <Text style={styles.cardDesc}>Fetch the first value from the device</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btn, step !== 2 && styles.btnDisabled]}
            onPress={readInitialValue}
            disabled={step !== 2 || isLoading}
            activeOpacity={0.75}
          >
            <Text style={styles.btnText}>📥  Read Data</Text>
          </TouchableOpacity>

          {initialValue !== '' && (
            <View style={styles.dataBox}>
              <Text style={styles.dataBoxLabel}>DEVICE RESPONSE</Text>
              <Text style={styles.dataBoxValue}>{initialValue}</Text>
            </View>
          )}
        </View>

        {/* ═══════════════════════════════════════════
            STEP 3 – Send Names
        ════════════════════════════════════════════ */}
        <View style={[styles.card, step === 3 ? styles.cardActive : step > 3 ? styles.cardDone : styles.cardLocked]}>
          <View style={styles.cardHeader}>
            <View style={[styles.badge, step === 3 && styles.badgeActive, step > 3 && styles.badgeDone]}>
              <Text style={styles.badgeText}>{step > 3 ? '✓' : '03'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Send Student Names</Text>
              <Text style={styles.cardDesc}>Enter your name &amp; your buddy's name</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Your Name</Text>
            <TextInput
              style={[styles.input, step !== 3 && styles.inputDisabled]}
              placeholder="e.g. Somchai"
              placeholderTextColor="#4B4570"
              value={myName}
              onChangeText={setMyName}
              editable={step === 3}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Buddy's Name</Text>
            <TextInput
              style={[styles.input, step !== 3 && styles.inputDisabled]}
              placeholder="e.g. Malee"
              placeholderTextColor="#4B4570"
              value={buddyName}
              onChangeText={setBuddyName}
              editable={step === 3}
            />
          </View>

          <TouchableOpacity
            style={[styles.btnPrimary, step !== 3 && styles.btnDisabled]}
            onPress={sendNames}
            disabled={step !== 3 || isLoading}
            activeOpacity={0.75}
          >
            <Text style={styles.btnPrimaryText}>📤  Send Names to Device</Text>
          </TouchableOpacity>
        </View>

        {/* ═══════════════════════════════════════════
            STEP 4 – Read Grade
        ════════════════════════════════════════════ */}
        <View style={[styles.card, step === 4 ? styles.cardActive : styles.cardLocked]}>
          <View style={styles.cardHeader}>
            <View style={[styles.badge, step === 4 && styles.badgeAccent]}>
              <Text style={styles.badgeText}>04</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Grade Prediction</Text>
              <Text style={styles.cardDesc}>Read the AI-predicted grade from device</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btnAccent, step !== 4 && styles.btnDisabled]}
            onPress={readGrade}
            disabled={step !== 4 || isLoading}
            activeOpacity={0.75}
          >
            <Text style={styles.btnAccentText}>🎯  Reveal My Grade</Text>
          </TouchableOpacity>

          {gradeResult !== '' && (
            <View style={styles.gradeCard}>
              <Text style={styles.gradeCardLabel}>✨  PREDICTED GRADE  ✨</Text>
              <Animated.Text
                style={[
                  styles.gradeValue,
                  {
                    opacity: glowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ]}
              >
                {gradeResult}
              </Animated.Text>
              <View style={styles.gradeGlow} />
            </View>
          )}
        </View>

        {/* bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Loading Overlay ── */}
      {isLoading && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color="#A855F7" />
            <Text style={styles.overlayText}>Processing…</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────
const PURPLE = '#8B5CF6';
const PURPLE_LIGHT = '#A855F7';
const PURPLE_DARK = '#6D28D9';
const BG = '#080612';
const CARD_BG = '#10091F';
const CARD_BORDER = '#1E1535';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  blob1: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(109,40,217,0.18)',
  },
  blob2: {
    position: 'absolute',
    bottom: 80,
    left: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(168,85,247,0.10)',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 20,
  },

  // ── Header ──
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: PURPLE,
    backgroundColor: '#1A0F35',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 8,
  },
  iconEmoji: { fontSize: 32 },
  appTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  appSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#9F7AEA',
    letterSpacing: 0.6,
    fontWeight: '500',
    textAlign: 'center',
  },

  // ── Stepper ──
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 28,
    paddingHorizontal: 4,
  },
  stepperNode: {
    alignItems: 'center',
    width: 68,
  },
  stepperCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#2A1F4A',
    backgroundColor: '#100B22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperCircleActive: {
    borderColor: PURPLE,
    backgroundColor: PURPLE,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 4,
  },
  stepperNum: { fontSize: 12, color: '#4B4570', fontWeight: '700' },
  stepperNumActive: { color: '#FFFFFF' },
  stepperCheck: { fontSize: 13, color: '#FFFFFF', fontWeight: '900' },
  stepperLabel: {
    marginTop: 5,
    fontSize: 9,
    color: '#4B4570',
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  stepperLabelActive: { color: '#C084FC' },
  stepperLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#1E1535',
    marginTop: 14,
    marginHorizontal: 2,
  },
  stepperLineActive: { backgroundColor: PURPLE },

  // ── Cards ──
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  cardActive: {
    borderColor: PURPLE,
    borderWidth: 1.5,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  cardDone: {
    borderColor: '#2A1F4A',
    opacity: 0.7,
  },
  cardLocked: {
    opacity: 0.35,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1030',
    borderWidth: 1,
    borderColor: '#2A1F4A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeActive: {
    backgroundColor: PURPLE_DARK,
    borderColor: PURPLE,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  badgeDone: {
    backgroundColor: '#4C1D95',
    borderColor: '#7C3AED',
  },
  badgeAccent: {
    backgroundColor: PURPLE_LIGHT,
    borderColor: '#DDD6FE',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F5F3FF',
    letterSpacing: 0.2,
  },
  cardDesc: {
    fontSize: 12,
    color: '#7C6FA0',
    marginTop: 2,
    fontWeight: '400',
  },

  // ── Buttons ──
  btn: {
    backgroundColor: '#1A1030',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B2D6A',
    marginBottom: 4,
  },
  btnScanning: {
    borderColor: PURPLE,
    backgroundColor: '#1D1240',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    color: '#DDD6FE',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.4,
  },
  btnPrimary: {
    backgroundColor: PURPLE_DARK,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PURPLE,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  btnAccent: {
    backgroundColor: PURPLE_LIGHT,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: PURPLE_LIGHT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 8,
  },
  btnAccentText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 0.6,
  },

  // ── Scanning row ──
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PURPLE_LIGHT,
    shadowColor: PURPLE_LIGHT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },

  // ── Device list ──
  deviceList: { marginTop: 14 },
  listLabel: {
    fontSize: 11,
    color: '#7C6FA0',
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14092A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#3B2D6A',
    gap: 12,
  },
  deviceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1040',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EDE9FE',
  },
  deviceId: {
    fontSize: 10,
    color: '#6D5FA0',
    marginTop: 2,
  },
  connectArrow: {
    fontSize: 22,
    color: PURPLE_LIGHT,
    fontWeight: '300',
  },
  emptyHint: {
    marginTop: 12,
    alignItems: 'center',
  },
  emptyHintText: {
    color: '#4B4570',
    fontSize: 13,
    fontStyle: 'italic',
  },

  // ── Connected ──
  connectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#14092A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: PURPLE,
  },
  connectedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  connectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34D399',
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  connectedTitle: {
    fontSize: 11,
    color: '#34D399',
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  connectedName: {
    fontSize: 13,
    color: '#DDD6FE',
    fontWeight: '600',
    marginTop: 1,
  },
  disconnectBtn: {
    backgroundColor: '#3D0C1C',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BE185D',
  },
  disconnectText: {
    color: '#FBCFE8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Data Box ──
  dataBox: {
    marginTop: 14,
    backgroundColor: '#12082A',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#4C1D95',
    alignItems: 'center',
  },
  dataBoxLabel: {
    fontSize: 10,
    color: '#9F7AEA',
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  dataBoxValue: {
    fontSize: 18,
    color: '#EDE9FE',
    fontWeight: '700',
    textAlign: 'center',
  },

  // ── Inputs ──
  inputGroup: { marginBottom: 12 },
  inputLabel: {
    fontSize: 11,
    color: '#7C6FA0',
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#0D0720',
    borderWidth: 1,
    borderColor: '#2A1F4A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: '#F5F3FF',
    fontWeight: '500',
  },
  inputDisabled: {
    opacity: 0.5,
  },

  // ── Grade card ──
  gradeCard: {
    marginTop: 18,
    backgroundColor: '#0F062B',
    borderRadius: 20,
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: PURPLE_LIGHT,
    shadowColor: PURPLE_LIGHT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 10,
    overflow: 'hidden',
  },
  gradeCardLabel: {
    fontSize: 11,
    color: '#C084FC',
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  gradeValue: {
    fontSize: 80,
    fontWeight: '900',
    color: '#E9D5FF',
    textShadowColor: 'rgba(168,85,247,0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    lineHeight: 90,
  },
  gradeGlow: {
    position: 'absolute',
    bottom: -40,
    width: 200,
    height: 100,
    borderRadius: 100,
    backgroundColor: 'rgba(168,85,247,0.15)',
  },

  // ── Overlay ──
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,6,18,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  overlayCard: {
    backgroundColor: '#12082A',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PURPLE,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  overlayText: {
    marginTop: 14,
    fontSize: 14,
    color: '#C084FC',
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});