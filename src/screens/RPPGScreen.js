/**
 * Heart Rate — Finger-on-Lens PPG
 *
 * How real heart rate apps work:
 * 1. User places finger over BACK camera
 * 2. Flash/torch illuminates fingertip
 * 3. Camera sees red light pulsing with blood flow
 * 4. Extract red channel intensity → send to backend → compute BPM
 *
 * No face detection needed. No shutter sound (uses video not photos).
 * Way more accurate than face-based rPPG.
 */

import React, { useRef, useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, StatusBar, Platform, Animated,
} from 'react-native';
import { Tap, Fade, CONDENSED, MONO } from '../ui';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';

function bpmColor(b) {
    if (b <= 0) return '#333';
    if (b < 60) return '#a855f7';
    if (b < 100) return '#22c55e';
    if (b < 130) return '#f97316';
    return '#ef4444';
}

function zoneLabel(bpm) {
    if (bpm <= 0) return '';
    if (bpm < 60) return 'Resting (low)';
    if (bpm < 80) return 'Resting';
    if (bpm < 100) return 'Normal';
    if (bpm < 130) return 'Elevated';
    if (bpm < 160) return 'Cardio';
    return 'Peak';
}

export default function RPPGScreen({ navigation, route }) {
    const ins = useSafeAreaInsets();
    const sid = route?.params?.sessionId || `rppg_${Date.now()}`;
    const [perm, askPerm] = useCameraPermissions();
    const camRef = useRef(null);
    const wsRef = useRef(null);
    const timerRef = useRef(null);
    const aliveRef = useRef(true);
    const scanRef = useRef(false);

    const [scanning, setScanning] = useState(false);
    const [bpm, setBpm] = useState(0);
    const [hrv, setHrv] = useState(0);
    const [quality, setQuality] = useState('');
    const [samples, setSamples] = useState(0);
    const [fingerOn, setFingerOn] = useState(false);
    const [err, setErr] = useState('');

    // Pulse animation synced to BPM
    const pulse = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (bpm <= 0) return;
        const ms = Math.max(250, Math.round(60000 / bpm));
        const a = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1.08, duration: 100, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1, duration: ms - 130, useNativeDriver: true }),
        ]));
        a.start();
        return () => a.stop();
    }, [bpm]);

    useEffect(() => {
        aliveRef.current = true;
        return () => { aliveRef.current = false; stop(); };
    }, []);

    function stop() {
        scanRef.current = false;
        const t = timerRef.current;
        const w = wsRef.current;
        timerRef.current = null;
        wsRef.current = null;
        if (t) clearInterval(t);
        if (w) try { w.close(); } catch (_) {}
        setScanning(false);
    }

    function start() {
        if (scanRef.current) return;
        stop();
        scanRef.current = true;
        setScanning(true);
        setErr('');
        setSamples(0);
        setBpm(0);
        setHrv(0);
        setFingerOn(false);
        setQuality('warmup');

        const w = api.connectRPPGLiveStream(sid,
            (r) => {
                if (!aliveRef.current || !scanRef.current) return;
                if (r.bpm > 0 && r.status !== 'warmup') setBpm(r.bpm);
                setHrv(r.hrv_ms ?? 0);
                setQuality(r.signal_quality || '');
                // Detect if finger is on lens (high red, low variance = finger covering camera)
                if (r.face_detected !== undefined) setFingerOn(true);
            },
            () => { setErr('Server not connected'); stop(); },
            () => { if (scanRef.current) { setErr('Connection lost'); stop(); } },
        );
        wsRef.current = w;

        // Take small photos at 2fps — with torch ON and back camera
        // The finger blocks the lens so the entire image is red-tinted skin
        // No shutter sound with quality 0.01 + skipProcessing
        const t = setInterval(async () => {
            if (!scanRef.current || !camRef.current) return;
            try {
                const p = await camRef.current.takePictureAsync({
                    base64: true,
                    quality: 0.01,
                    shutterSound: false,
                    animateShutter: false,
                    skipProcessing: true,
                });
                if (!scanRef.current || !wsRef.current) return;
                if (wsRef.current.readyState === 1 && p?.base64) {
                    wsRef.current.send(JSON.stringify({
                        face_found: true,
                        image_b64: p.base64,
                        ts: Date.now() / 1000,
                    }));
                    if (aliveRef.current) setSamples(c => c + 1);
                }
            } catch (_) {}
        }, 500);
        timerRef.current = t;
    }

    function handleBack() {
        stop();
        setTimeout(() => navigation?.canGoBack() && navigation.goBack(), 80);
    }

    if (!perm) return <View style={$.bg} />;
    if (!perm.granted) return (
        <View style={[$.bg, { paddingTop: ins.top, justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />
            <Text style={$.title}>HEART RATE</Text>
            <Text style={$.sub}>Place your finger over the back camera. The flash lights up your fingertip and the camera detects your pulse.</Text>
            <Tap onPress={askPerm}><LinearGradient colors={['#7f1d1d', '#dc2626']} style={$.permBtn}><Text style={$.permBtnT}>ALLOW CAMERA</Text></LinearGradient></Tap>
        </View>
    );

    const col = bpmColor(bpm);
    const zone = zoneLabel(bpm);

    return (
        <View style={[$.bg, { paddingTop: ins.top }]}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />

            {/* Back button */}
            <View style={$.topRow}>
                <Tap onPress={handleBack} style={$.backBtn}><Text style={$.backIcon}>{'‹'}</Text></Tap>
                <Text style={$.topTitle}>HEART RATE</Text>
                <View style={{ width: 38 }} />
            </View>

            {/* Camera hidden offscreen — no visible flash */}
            <View style={{ position: 'absolute', top: -9999, left: -9999, width: 1, height: 1 }}>
                <CameraView
                    ref={camRef}
                    style={{ width: 1, height: 1 }}
                    facing="back"
                    enableTorch={scanning}
                    animateShutter={false}
                />
            </View>

            {/* Main content */}
            <View style={$.body}>

                {/* Instructions or BPM */}
                {!scanning ? (
                    <Fade style={$.instructions}>
                        <View style={$.pulseRing}>
                            <View style={$.pulseInner}>
                                <Text style={$.heartIcon}>{'♥'}</Text>
                            </View>
                        </View>
                        <Text style={$.instrTitle}>Measure your pulse</Text>
                        <Text style={$.instrSub}>Place one fingertip flat on the back of{'\n'}your phone, covering the camera and flash{'\n'}at the same time. Tap START, then hold{'\n'}still for 10 seconds.</Text>
                        <View style={$.stepsRow}>
                            <View style={$.step}><Text style={$.stepNum}>1</Text><Text style={$.stepText}>Tap{'\n'}START</Text></View>
                            <View style={$.stepLine} />
                            <View style={$.step}><Text style={$.stepNum}>2</Text><Text style={$.stepText}>Place finger{'\n'}on camera</Text></View>
                            <View style={$.stepLine} />
                            <View style={$.step}><Text style={$.stepNum}>3</Text><Text style={$.stepText}>Hold still{'\n'}10 sec</Text></View>
                        </View>
                        <Text style={$.tip}>Your finger should glow red from the flash</Text>
                    </Fade>
                ) : (
                    <Fade>
                        <Animated.View style={{ transform: [{ scale: pulse }], alignItems: 'center' }}>
                            <Text style={[$.bpmNum, { color: col }]}>{bpm > 0 ? Math.round(bpm) : '——'}</Text>
                        </Animated.View>
                        <Text style={$.bpmLabel}>BPM</Text>
                        {zone ? <Text style={[$.zone, { color: col }]}>{zone}</Text> : null}

                        <View style={$.statsRow}>
                            <View style={$.stat}>
                                <Text style={[$.statVal, { color: '#a855f7' }]}>{hrv > 0 ? hrv.toFixed(0) : '—'}</Text>
                                <Text style={$.statKey}>HRV ms</Text>
                            </View>
                            <View style={$.statDiv} />
                            <View style={$.stat}>
                                <Text style={[$.statVal, { color: hrv > 60 ? '#22c55e' : hrv > 30 ? '#f97316' : hrv > 0 ? '#ef4444' : '#333' }]}>
                                    {hrv > 60 ? 'LOW' : hrv > 30 ? 'MED' : hrv > 0 ? 'HIGH' : '—'}
                                </Text>
                                <Text style={$.statKey}>STRESS</Text>
                            </View>
                            <View style={$.statDiv} />
                            <View style={$.stat}>
                                <Text style={$.statVal}>{samples}</Text>
                                <Text style={$.statKey}>SAMPLES</Text>
                            </View>
                        </View>

                        {quality === 'warmup' && <Text style={$.hint}>Keep your finger on the camera... warming up</Text>}
                        {quality === 'poor' && <Text style={[$.hint, { color: '#f97316' }]}>Press your finger a bit more firmly — cover the whole lens</Text>}
                        {quality === '' && scanning && samples < 5 && <Text style={$.hint}>Place your finger over the camera + flash now</Text>}
                    </Fade>
                )}

                {err ? <Text style={$.errText}>{err}</Text> : null}
            </View>

            {/* Button */}
            <View style={[$.bar, { paddingBottom: ins.bottom + 16 }]}>
                <Tap onPress={scanning ? stop : start}>
                    <LinearGradient
                        colors={scanning ? ['#7f1d1d', '#dc2626'] : ['#0c4a6e', '#0891b2']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={$.barBtn}>
                        <Text style={$.barBtnT}>{scanning ? 'STOP' : 'START'}</Text>
                    </LinearGradient>
                </Tap>
            </View>
        </View>
    );
}

const $ = StyleSheet.create({
    bg: { flex: 1, backgroundColor: '#000' },

    title: { fontSize: 28, fontWeight: '900', color: '#fff', fontFamily: CONDENSED, letterSpacing: 2, marginBottom: 12 },
    sub: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
    permBtn: { borderRadius: 6, paddingVertical: 16, paddingHorizontal: 40 },
    permBtnT: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 3, fontFamily: CONDENSED },

    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
    topTitle: { fontSize: 13, fontWeight: '800', color: '#555', letterSpacing: 3 },
    backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
    backIcon: { color: '#fff', fontSize: 22, fontWeight: '300', marginTop: -2 },

    camHidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },

    body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },

    instructions: { alignItems: 'center' },
    pulseRing: { width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: 'rgba(239,68,68,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
    pulseInner: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(239,68,68,0.08)', alignItems: 'center', justifyContent: 'center' },
    heartIcon: { fontSize: 36, color: '#ef4444' },
    instrTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 10, fontFamily: CONDENSED, letterSpacing: 1 },
    instrSub: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
    tip: { fontSize: 12, color: '#ef4444', marginTop: 20, fontStyle: 'italic' },
    stepsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    step: { alignItems: 'center', width: 64 },
    stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#111', color: '#06b6d4', fontSize: 13, fontWeight: '800', textAlign: 'center', lineHeight: 28, overflow: 'hidden', marginBottom: 6 },
    stepText: { fontSize: 10, color: '#555', textAlign: 'center', lineHeight: 14 },
    stepLine: { width: 24, height: 1, backgroundColor: '#1a1a1a', marginBottom: 14 },

    bpmNum: { fontSize: 96, fontWeight: '900', fontFamily: CONDENSED },
    bpmLabel: { fontSize: 12, fontWeight: '700', color: '#444', letterSpacing: 4, marginTop: -10, marginBottom: 8 },
    zone: { fontSize: 14, fontWeight: '600', marginBottom: 32 },

    statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
    stat: { alignItems: 'center', paddingHorizontal: 24 },
    statVal: { fontSize: 20, fontWeight: '800', color: '#fff', fontFamily: MONO },
    statKey: { fontSize: 9, fontWeight: '600', color: '#444', letterSpacing: 2, marginTop: 4 },
    statDiv: { width: 1, height: 28, backgroundColor: '#1a1a1a' },

    hint: { color: '#555', fontSize: 12, marginTop: 20 },
    errText: { color: '#ef4444', fontSize: 12, marginTop: 16 },

    bar: { paddingHorizontal: 24, paddingTop: 12 },
    barBtn: { borderRadius: 8, paddingVertical: 18, alignItems: 'center',
        ...Platform.select({ android: { elevation: 8 }, ios: { shadowColor: '#06b6d4', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20 } }) },
    barBtnT: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 3, fontFamily: CONDENSED },
});
