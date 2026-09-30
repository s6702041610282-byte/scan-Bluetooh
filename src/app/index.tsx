import { Buffer } from 'buffer';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
const CHAR_UUID    = 'cde07b1a-889b-44b7-a99f-c888dddac729';

type Step = 1 | 2 | 3 | 4;

// ─── palette ───────────────────────────────────────────────
const C = {
  bg:        '#04000F',
  surface:   '#0A0520',
  border:    '#1D0D40',
  neon:      '#BF5FFF',   // electric violet
  neonDim:   '#7B2FBE',
  neonGlow:  '#D89EFF',
  magenta:   '#FF2CDF',
  indigo:    '#4F35E8',
  white:     '#F0E6FF',
  muted:     '#5A4878',
  textMuted: '#7A5FA0',
  green:     '#1AFFD5',
  red:       '#FF3366',
};

export default function Index() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading]   = useState(false);
  const [step, setStep]             = useState<Step>(1);
  const [initialValue, setInitialValue] = useState('');
  const [myName, setMyName]         = useState('');
  const [buddyName, setBuddyName]   = useState('');
  const [gradeResult, setGradeResult] = useState('');

  // animations
  const scanRing  = useRef(new Animated.Value(0)).current;
  const gradePop  = useRef(new Animated.Value(0)).current;
  const gradeGlow = useRef(new Animated.Value(0)).current;
  const headerBob = useRef(new Animated.Value(0)).current;

  // gentle bobbing for header icon
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(headerBob, { toValue: -8, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(headerBob, { toValue:  0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.timing(scanRing, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true })
      ).start();
    } else {
      scanRing.setValue(0);
    }
  }, [isScanning]);

  useEffect(() => {
    if (gradeResult) {
      Animated.spring(gradePop, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(gradeGlow, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(gradeGlow, { toValue: 0.4, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      gradePop.setValue(0);
      gradeGlow.setValue(0);
    }
  }, [gradeResult]);

  useEffect(() => {
    return () => { manager.stopDeviceScan(); manager.destroy(); };
  }, []);

  // ── permissions ──────────────────────────────────────────
  async function requestPermissions() {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        const g = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          g['android.permission.BLUETOOTH_SCAN']    === PermissionsAndroid.RESULTS.GRANTED &&
          g['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
          g['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
        );
      }
      const g = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      return g === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }

  // ── Step 1 ───────────────────────────────────────────────
  const startScan = async () => {
    if ((await manager.state()) !== State.PoweredOn) {
      Alert.alert('Bluetooth Off', 'Please enable Bluetooth first.'); return;
    }
    if (!(await requestPermissions())) {
      Alert.alert('Permission Denied', 'Bluetooth & Location required.'); return;
    }
    setDevices([]); setIsScanning(true);
    // scan ALL nearby BLE devices (no UUID filter) so user can pick any device
    manager.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
      if (err) { setIsScanning(false); Alert.alert('Scan Error', err.message); return; }
      if (device && (device.name || device.localName)) {
        setDevices(p => p.some(d => d.id === device.id) ? p : [...p, device]);
      }
    });
    setTimeout(() => { manager.stopDeviceScan(); setIsScanning(false); }, 15000);
  };

  const connectToDevice = async (device: Device) => {
    manager.stopDeviceScan(); setIsScanning(false); setIsLoading(true);
    try {
      const c = await manager.connectToDevice(device.id);
      const d = await c.discoverAllServicesAndCharacteristics();
      setConnectedDevice(d); setStep(2);
    } catch (e: any) { Alert.alert('Connect Failed', e?.message); }
    finally { setIsLoading(false); }
  };

  // ── Step 2 ───────────────────────────────────────────────
  const readInitialValue = async () => {
    if (!connectedDevice) return; setIsLoading(true);
    try {
      const ch = await manager.readCharacteristicForDevice(connectedDevice.id, SERVICE_UUID, CHAR_UUID);
      setInitialValue(Buffer.from(ch.value || '', 'base64').toString('utf-8'));
      setStep(3);
    } catch (e: any) { Alert.alert('Read Failed', e?.message); }
    finally { setIsLoading(false); }
  };

  // ── Step 3 ───────────────────────────────────────────────
  const sendNames = async () => {
    if (!connectedDevice) return;
    if (!myName.trim() || !buddyName.trim()) {
      Alert.alert('Missing Info', 'Enter both names.'); return;
    }
    setIsLoading(true);
    try {
      const payload = `${myName.trim()}, ${buddyName.trim()}`;
      await manager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id, SERVICE_UUID, CHAR_UUID,
        Buffer.from(payload, 'utf-8').toString('base64')
      );
      setStep(4);
    } catch (e: any) { Alert.alert('Send Failed', e?.message); }
    finally { setIsLoading(false); }
  };

  // ── Step 4 ───────────────────────────────────────────────
  const readGrade = async () => {
    if (!connectedDevice) return; setIsLoading(true);
    try {
      const ch = await manager.readCharacteristicForDevice(connectedDevice.id, SERVICE_UUID, CHAR_UUID);
      setGradeResult(Buffer.from(ch.value || '', 'base64').toString('utf-8'));
    } catch (e: any) { Alert.alert('Read Failed', e?.message); }
    finally { setIsLoading(false); }
  };

  const disconnectDevice = async () => {
    try { if (connectedDevice) await manager.cancelDeviceConnection(connectedDevice.id); } catch (_) {}
    setConnectedDevice(null); setStep(1); setDevices([]);
    setInitialValue(''); setMyName(''); setBuddyName(''); setGradeResult('');
  };

  // ── small helpers ────────────────────────────────────────
  const isActive  = (s: Step) => step === s;
  const isDone    = (s: Step) => step > s;
  const isLocked  = (s: Step) => step < s;

  const scanRingScale   = scanRing.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const scanRingOpacity = scanRing.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  // ── render ───────────────────────────────────────────────
  return (
    <View style={s.root}>

      {/* ── decorative corner marks ── */}
      <View style={[s.corner, s.cornerTL]} /><View style={[s.corner, s.cornerTR]} />
      <View style={[s.corner, s.cornerBL]} /><View style={[s.corner, s.cornerBR]} />

      {/* ── horizontal scan‑line stripes (static ambiance) ── */}
      {[0.15, 0.38, 0.62, 0.85].map((t, i) => (
        <View key={i} style={[s.ambientLine, { top: `${t * 100}%` as any }]} />
      ))}

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ══════════ HEADER ══════════ */}
        <View style={s.headerWrap}>
          {/* outer ring */}
          <View style={s.orbitRing}>
            <Animated.View style={[s.orbitDot, {
              transform: [{
                rotate: headerBob.interpolate({ inputRange: [-8, 0], outputRange: ['0deg', '360deg'] })
              }]
            }]} />
          </View>

          <Animated.View style={[s.crystalBall, { transform: [{ translateY: headerBob }] }]}>
            <Text style={s.crystalEmoji}>🔮</Text>
          </Animated.View>

          <Text style={s.title}>BLE GRADE PREDICTOR</Text>
          <View style={s.titleUnderline} />
          <Text style={s.subtitle}>[ BLUETOOTH SMART ASSESSMENT ]</Text>
        </View>

        {/* ══════════ STEP PIPELINE ══════════ */}
        <View style={s.pipeline}>
          {([1,2,3,4] as Step[]).map((n, i) => (
            <React.Fragment key={n}>
              <View style={s.pipeNode}>
                <View style={[
                  s.pipeCircle,
                  isActive(n) && s.pipeCircleActive,
                  isDone(n)   && s.pipeCircleDone,
                ]}>
                  <Text style={[s.pipeNum, (isActive(n)||isDone(n)) && s.pipeNumBright]}>
                    {isDone(n) ? '✓' : n}
                  </Text>
                </View>
              </View>
              {i < 3 && (
                <View style={[s.pipeLine, isDone(n) && s.pipeLineFilled]} />
              )}
            </React.Fragment>
          ))}
        </View>

        {/* ══════════ CARD 1 – SCAN ══════════ */}
        <CardShell step={1} current={step} icon="01" title="SCAN & CONNECT" tag="BLE DISCOVERY">
          {!connectedDevice ? (
            <>
              <TouchableOpacity
                style={[s.neonBtn, isScanning && s.neonBtnActive]}
                onPress={startScan}
                disabled={isScanning || isLoading}
                activeOpacity={0.75}
              >
                {isScanning && (
                  <View style={s.rippleWrap}>
                    <Animated.View style={[s.ripple, {
                      transform: [{ scale: scanRingScale }],
                      opacity: scanRingOpacity,
                    }]} />
                  </View>
                )}
                <Text style={s.neonBtnText}>
                  {isScanning ? '◉  SCANNING…' : '◎  START SCAN'}
                </Text>
              </TouchableOpacity>

              {devices.length > 0 && (
                <View style={s.devList}>
                  <Text style={s.secLabel}>// NEARBY DEVICES</Text>
                  {devices.map(dev => (
                    <TouchableOpacity key={dev.id} style={s.devRow} onPress={() => connectToDevice(dev)} activeOpacity={0.7}>
                      <View style={s.devSignal}>
                        <View style={[s.bar, s.bar1]} /><View style={[s.bar, s.bar2]} /><View style={[s.bar, s.bar3]} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.devName}>{dev.name || dev.localName || 'Unknown Device'}</Text>
                        <Text style={s.devId}>{dev.id}</Text>
                      </View>
                      <Text style={s.devArrow}>⟩</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {isScanning && devices.length === 0 && (
                <Text style={s.hint}>Searching for BLE devices nearby…</Text>
              )}
            </>
          ) : (
            <View style={s.connRow}>
              <View style={s.connLeft}>
                <View style={s.onlineDot} />
                <View>
                  <Text style={s.onlineLabel}>CONNECTED</Text>
                  <Text style={s.onlineName}>{connectedDevice.name || connectedDevice.id}</Text>
                </View>
              </View>
              <TouchableOpacity style={s.killBtn} onPress={disconnectDevice}>
                <Text style={s.killText}>✕ END</Text>
              </TouchableOpacity>
            </View>
          )}
        </CardShell>

        {/* ══════════ CARD 2 – READ INITIAL ══════════ */}
        <CardShell step={2} current={step} icon="02" title="READ INITIAL DATA" tag="RX CHANNEL">
          <TouchableOpacity
            style={[s.neonBtn, !isActive(2) && s.neonBtnLocked]}
            onPress={readInitialValue}
            disabled={!isActive(2) || isLoading}
            activeOpacity={0.75}
          >
            <Text style={s.neonBtnText}>▼  FETCH DATA</Text>
          </TouchableOpacity>
          {initialValue !== '' && (
            <View style={s.dataPanel}>
              <Text style={s.dataPanelLabel}>DEVICE RESPONSE ──────</Text>
              <Text style={s.dataPanelValue}>{initialValue}</Text>
            </View>
          )}
        </CardShell>

        {/* ══════════ CARD 3 – SEND NAMES ══════════ */}
        <CardShell step={3} current={step} icon="03" title="SEND NAMES" tag="TX CHANNEL">
          <Text style={s.fieldLabel}>YOUR NAME</Text>
          <TextInput
            style={[s.textField, !isActive(3) && s.textFieldLocked]}
            placeholder="e.g. Somchai"
            placeholderTextColor={C.muted}
            value={myName}
            onChangeText={setMyName}
            editable={isActive(3)}
          />
          <Text style={s.fieldLabel}>BUDDY'S NAME</Text>
          <TextInput
            style={[s.textField, !isActive(3) && s.textFieldLocked]}
            placeholder="e.g. Malee"
            placeholderTextColor={C.muted}
            value={buddyName}
            onChangeText={setBuddyName}
            editable={isActive(3)}
          />
          <TouchableOpacity
            style={[s.magentaBtn, !isActive(3) && s.neonBtnLocked]}
            onPress={sendNames}
            disabled={!isActive(3) || isLoading}
            activeOpacity={0.75}
          >
            <Text style={s.magentaBtnText}>▲  TRANSMIT</Text>
          </TouchableOpacity>
        </CardShell>

        {/* ══════════ CARD 4 – GRADE ══════════ */}
        <CardShell step={4} current={step} icon="04" title="GRADE PREDICTION" tag="AI ORACLE">
          <TouchableOpacity
            style={[s.accentBtn, !isActive(4) && s.neonBtnLocked]}
            onPress={readGrade}
            disabled={!isActive(4) || isLoading}
            activeOpacity={0.75}
          >
            <Text style={s.accentBtnText}>✦  REVEAL GRADE</Text>
          </TouchableOpacity>

          {gradeResult !== '' && (
            <Animated.View style={[s.gradeReveal, {
              transform: [{ scale: gradePop }],
              opacity: gradePop,
            }]}>
              {/* top bar */}
              <View style={s.gradeTopBar}>
                <View style={s.gradeTopDash} /><View style={s.gradeTopDash} /><View style={s.gradeTopDash} />
              </View>

              <Text style={s.gradeLabel}>✦  PREDICTED GRADE  ✦</Text>

              <Animated.Text style={[s.gradeChar, { opacity: gradeGlow.interpolate({ inputRange: [0.4, 1], outputRange: [0.75, 1] }) }]}>
                {gradeResult}
              </Animated.Text>

              {/* corner accents */}
              <View style={[s.gradeCorner, s.gCTL]} /><View style={[s.gradeCorner, s.gCTR]} />
              <View style={[s.gradeCorner, s.gCBL]} /><View style={[s.gradeCorner, s.gCBR]} />
            </Animated.View>
          )}
        </CardShell>

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ══════════ LOADING OVERLAY ══════════ */}
      {isLoading && (
        <View style={s.overlay}>
          <View style={s.overlayPanel}>
            <View style={[s.gradeCorner, s.gCTL]} /><View style={[s.gradeCorner, s.gCTR]} />
            <View style={[s.gradeCorner, s.gCBL]} /><View style={[s.gradeCorner, s.gCBR]} />
            <ActivityIndicator size="large" color={C.neon} />
            <Text style={s.overlayText}>PROCESSING</Text>
            <Text style={s.overlayDots}>• • •</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Card shell component ────────────────────────────────────────────────────
type CardProps = {
  step: Step; current: Step;
  icon: string; title: string; tag: string;
  children: React.ReactNode;
};
function CardShell({ step, current, icon, title, tag, children }: CardProps) {
  const active = current === step;
  const done   = current > step;
  const locked = current < step;
  return (
    <View style={[
      s.card,
      active && s.cardActive,
      done   && s.cardDone,
      locked && s.cardLocked,
    ]}>
      {/* left neon strip */}
      <View style={[s.cardStrip, active && s.cardStripActive, done && s.cardStripDone]} />

      {/* top-right tag */}
      <View style={[s.cardTag, active && s.cardTagActive]}>
        <Text style={s.cardTagText}>{tag}</Text>
      </View>

      {/* header row */}
      <View style={s.cardHead}>
        <View style={[s.cardNum, active && s.cardNumActive, done && s.cardNumDone]}>
          <Text style={s.cardNumText}>{done ? '✓' : icon}</Text>
        </View>
        <Text style={[s.cardTitle, active && s.cardTitleActive]}>{title}</Text>
      </View>

      <View style={s.cardDivider} />

      <View style={s.cardBody}>{children}</View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({

  root: { flex: 1, backgroundColor: C.bg },

  // ambient decorations
  corner: {
    position: 'absolute', width: 20, height: 20,
    borderColor: C.neonDim, opacity: 0.4,
  },
  cornerTL: { top: 18, left: 18, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTR: { top: 18, right: 18, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBL: { bottom: 18, left: 18, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 18, right: 18, borderBottomWidth: 2, borderRightWidth: 2 },
  ambientLine: {
    position: 'absolute', left: 0, right: 0, height: 1,
    backgroundColor: C.neon, opacity: 0.03,
  },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 60, paddingBottom: 20 },

  // ── Header ──
  headerWrap: { alignItems: 'center', marginBottom: 36 },
  orbitRing: {
    position: 'absolute', top: -6,
    width: 90, height: 90, borderRadius: 45,
    borderWidth: 1, borderColor: C.neonDim,
    borderStyle: 'dashed', opacity: 0.4,
  },
  orbitDot: {
    position: 'absolute', top: -4, left: '50%',
    marginLeft: -4, width: 8, height: 8,
    borderRadius: 4, backgroundColor: C.neon,
  },
  crystalBall: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: '#140830',
    borderWidth: 1.5, borderColor: C.neon,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: C.neon,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 22, elevation: 12,
    marginBottom: 18,
  },
  crystalEmoji: { fontSize: 36 },
  title: {
    fontSize: 20, fontWeight: '900', color: C.white,
    letterSpacing: 3, textAlign: 'center',
  },
  titleUnderline: {
    width: 120, height: 2, marginTop: 8, marginBottom: 8,
    backgroundColor: C.neon, opacity: 0.7,
    shadowColor: C.neon, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 8,
  },
  subtitle: {
    fontSize: 10, color: C.textMuted,
    letterSpacing: 2.5, fontWeight: '600',
  },

  // ── Pipeline ──
  pipeline: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28, paddingHorizontal: 8,
  },
  pipeNode: { alignItems: 'center' },
  pipeCircle: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  pipeCircleActive: {
    borderColor: C.neon, backgroundColor: '#200A40',
    shadowColor: C.neon, shadowOpacity: 0.8, shadowRadius: 10, elevation: 4,
  },
  pipeCircleDone: { borderColor: C.neonDim, backgroundColor: '#2A0E50' },
  pipeNum: { fontSize: 12, fontWeight: '800', color: C.muted },
  pipeNumBright: { color: C.neonGlow },
  pipeLine: {
    flex: 1, height: 1.5, marginHorizontal: 4,
    backgroundColor: C.border,
  },
  pipeLineFilled: { backgroundColor: C.neonDim },

  // ── Card ──
  card: {
    marginBottom: 16, borderRadius: 4,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  cardActive: {
    borderColor: C.neon,
    shadowColor: C.neon,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35, shadowRadius: 18, elevation: 8,
  },
  cardDone:   { borderColor: '#261045', opacity: 0.65 },
  cardLocked: { opacity: 0.28 },

  cardStrip: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.border },
  cardStripActive: { backgroundColor: C.neon, shadowColor: C.neon, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8 },
  cardStripDone: { backgroundColor: C.neonDim },

  cardTag: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: C.border,
    paddingHorizontal: 8, paddingVertical: 3,
    borderBottomLeftRadius: 6,
  },
  cardTagActive: { backgroundColor: '#1A0840' },
  cardTagText: { fontSize: 9, color: C.textMuted, letterSpacing: 1.5, fontWeight: '700' },

  cardHead: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12,
  },
  cardNum: {
    width: 34, height: 34, borderRadius: 2,
    borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#0D0525',
  },
  cardNumActive: {
    borderColor: C.neon, backgroundColor: '#1E0840',
    shadowColor: C.neon, shadowOpacity: 0.6, shadowRadius: 8,
  },
  cardNumDone: { borderColor: C.neonDim, backgroundColor: '#180540' },
  cardNumText: { fontSize: 12, fontWeight: '900', color: C.neonGlow },
  cardTitle: { fontSize: 13, fontWeight: '900', color: C.muted, letterSpacing: 2 },
  cardTitleActive: { color: C.white },

  cardDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 18, marginBottom: 16 },
  cardBody: { paddingHorizontal: 18, paddingBottom: 18 },

  // ── Buttons ──
  neonBtn: {
    borderWidth: 1, borderColor: C.neonDim,
    borderRadius: 3, paddingVertical: 14,
    alignItems: 'center', backgroundColor: '#130828',
    marginBottom: 4, position: 'relative', overflow: 'hidden',
  },
  neonBtnActive: { borderColor: C.neon, backgroundColor: '#1D0C3C' },
  neonBtnLocked: { opacity: 0.35 },
  neonBtnText: { color: C.neonGlow, fontWeight: '800', fontSize: 13, letterSpacing: 2.5 },

  magentaBtn: {
    borderWidth: 1, borderColor: C.magenta,
    borderRadius: 3, paddingVertical: 14,
    alignItems: 'center', backgroundColor: '#20062A',
    shadowColor: C.magenta, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 4,
  },
  magentaBtnText: { color: C.magenta, fontWeight: '900', fontSize: 13, letterSpacing: 2.5 },

  accentBtn: {
    borderWidth: 1.5, borderColor: C.neon,
    borderRadius: 3, paddingVertical: 16,
    alignItems: 'center', backgroundColor: '#1B0A3C',
    shadowColor: C.neon, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 14, elevation: 6,
  },
  accentBtnText: { color: C.neon, fontWeight: '900', fontSize: 14, letterSpacing: 3 },

  // ── Scan ripple ──
  rippleWrap: {
    position: 'absolute', width: 44, height: 44,
    borderRadius: 22, alignSelf: 'center',
  },
  ripple: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.neon, position: 'absolute',
  },

  // ── Device list ──
  devList: { marginTop: 14 },
  secLabel: { fontSize: 10, color: C.textMuted, letterSpacing: 2, fontWeight: '700', marginBottom: 10 },
  devRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0D0524', borderWidth: 1, borderColor: '#1D0D40',
    borderRadius: 3, padding: 12, marginBottom: 8,
  },
  devSignal: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 20 },
  bar: { width: 3, backgroundColor: C.neonDim, borderRadius: 1 },
  bar1: { height: 6 }, bar2: { height: 11 }, bar3: { height: 18 },
  devName: { fontSize: 13, fontWeight: '700', color: C.white },
  devId:   { fontSize: 10, color: C.textMuted, marginTop: 2 },
  devArrow:{ fontSize: 18, color: C.neon, fontWeight: '300' },

  hint: { textAlign: 'center', color: C.muted, fontSize: 12, marginTop: 12, fontStyle: 'italic' },

  // ── Connected ──
  connRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0D0524', borderWidth: 1, borderColor: C.neon,
    borderRadius: 3, padding: 14,
    shadowColor: C.neon, shadowOpacity: 0.2, shadowRadius: 8,
  },
  connLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  onlineDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: C.green,
    shadowColor: C.green, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 6,
  },
  onlineLabel: { fontSize: 9, color: C.green, fontWeight: '800', letterSpacing: 2 },
  onlineName:  { fontSize: 12, color: C.white, fontWeight: '600', marginTop: 2 },
  killBtn: {
    borderWidth: 1, borderColor: C.red, borderRadius: 2,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#1A0010',
  },
  killText: { color: C.red, fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  // ── Data panel ──
  dataPanel: {
    marginTop: 14, backgroundColor: '#080220',
    borderWidth: 1, borderColor: '#2A1050',
    borderRadius: 2, padding: 16,
    borderLeftWidth: 3, borderLeftColor: C.indigo,
  },
  dataPanelLabel: {
    fontSize: 9, color: C.indigo, fontWeight: '800',
    letterSpacing: 2, marginBottom: 8,
  },
  dataPanelValue: { fontSize: 17, color: C.neonGlow, fontWeight: '700' },

  // ── Inputs ──
  fieldLabel: {
    fontSize: 9, color: C.textMuted, fontWeight: '800',
    letterSpacing: 2, marginBottom: 6, marginTop: 4,
  },
  textField: {
    backgroundColor: '#080220', borderWidth: 1, borderColor: '#2A1050',
    borderRadius: 2, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.white, fontWeight: '500',
    marginBottom: 10,
    borderLeftWidth: 2, borderLeftColor: C.neonDim,
  },
  textFieldLocked: { opacity: 0.4 },

  // ── Grade reveal ──
  gradeReveal: {
    marginTop: 18, borderWidth: 1.5, borderColor: C.neon,
    borderRadius: 4, backgroundColor: '#0A0222',
    paddingVertical: 28, alignItems: 'center', overflow: 'hidden',
    shadowColor: C.neon, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 24, elevation: 10,
  },
  gradeTopBar: {
    flexDirection: 'row', gap: 6, marginBottom: 16,
  },
  gradeTopDash: { width: 24, height: 2, backgroundColor: C.neonDim },
  gradeLabel: {
    fontSize: 10, color: C.neonGlow, fontWeight: '900',
    letterSpacing: 3, marginBottom: 14,
  },
  gradeChar: {
    fontSize: 96, fontWeight: '900', color: C.neon,
    lineHeight: 104,
    textShadowColor: C.neon,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 28,
  },
  // corner tick marks inside grade card
  gradeCorner: { position: 'absolute', width: 12, height: 12, borderColor: C.neonDim },
  gCTL: { top: 6, left: 6,   borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  gCTR: { top: 6, right: 6,  borderTopWidth: 1.5, borderRightWidth: 1.5 },
  gCBL: { bottom: 6, left: 6,  borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  gCBR: { bottom: 6, right: 6, borderBottomWidth: 1.5, borderRightWidth: 1.5 },

  // ── Overlay ──
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(4,0,15,0.9)',
    justifyContent: 'center', alignItems: 'center', zIndex: 999,
  },
  overlayPanel: {
    backgroundColor: '#0D0525', borderWidth: 1.5, borderColor: C.neon,
    borderRadius: 4, padding: 36, alignItems: 'center',
    shadowColor: C.neon, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },
  overlayText: {
    marginTop: 16, fontSize: 11, color: C.neon,
    fontWeight: '900', letterSpacing: 4,
  },
  overlayDots: {
    marginTop: 8, fontSize: 14, color: C.neonDim, letterSpacing: 4,
  },
});