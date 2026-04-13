// NutritionScreen — AI Food Analysis (Nike Design Language)
// Photo your meal -> Claude vision -> nutrient breakdown + coaching

import React, { useState, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Animated, Easing,
    Dimensions, Platform, StatusBar,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../context/UserContext';
import api from '../services/api';
import { Tap, Fade, ProgressRing, CONDENSED, MONO } from '../ui';

const { width: W } = Dimensions.get('window');

// ── Nutrient bar colors ─────────────────────────────────────────────────────
const NUTRIENT_COLORS = {
    calories:  '#f97316',
    protein_g: '#22c55e',
    carbs_g:   '#06b6d4',
    fat_g:     '#eab308',
    fiber_g:   '#a855f7',
};

const NUTRIENT_LABELS = {
    calories:  'Calories',
    protein_g: 'Protein',
    carbs_g:   'Carbs',
    fat_g:     'Fat',
    fiber_g:   'Fiber',
};

const NUTRIENT_UNITS = {
    calories:  'kcal',
    protein_g: 'g',
    carbs_g:   'g',
    fat_g:     'g',
    fiber_g:   'g',
};

const NUTRIENT_MAX = {
    calories:  800,
    protein_g: 60,
    carbs_g:   100,
    fat_g:     40,
    fiber_g:   20,
};

// ── Pulsing loader ──────────────────────────────────────────────────────────
function PulsingLoader() {
    const scale = useRef(new Animated.Value(0.85)).current;
    const opacity = useRef(new Animated.Value(0.4)).current;

    React.useEffect(() => {
        const anim = Animated.loop(
            Animated.sequence([
                Animated.parallel([
                    Animated.timing(scale, { toValue: 1.1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
                ]),
                Animated.parallel([
                    Animated.timing(scale, { toValue: 0.85, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
                ]),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, []);

    return (
        <View style={s.loaderWrap}>
            <Animated.View style={[s.loaderRing, { transform: [{ scale }], opacity }]} />
            <Text style={s.loaderText}>ANALYZING</Text>
            <Text style={s.loaderSub}>Claude is scanning your meal...</Text>
        </View>
    );
}

// ── Nutrient bar ────────────────────────────────────────────────────────────
function NutrientBar({ nutrientKey, value }) {
    const barAnim = useRef(new Animated.Value(0)).current;
    const color = NUTRIENT_COLORS[nutrientKey] || '#06b6d4';
    const label = NUTRIENT_LABELS[nutrientKey] || nutrientKey;
    const unit = NUTRIENT_UNITS[nutrientKey] || '';
    const max = NUTRIENT_MAX[nutrientKey] || 100;
    const pct = Math.min(1, value / max);

    React.useEffect(() => {
        Animated.timing(barAnim, { toValue: pct, duration: 900, delay: 200, useNativeDriver: false }).start();
    }, [pct]);

    return (
        <View style={s.nutrientRow}>
            <View style={s.nutrientLabelRow}>
                <View style={[s.nutrientDot, { backgroundColor: color }]} />
                <Text style={s.nutrientLabel}>{label}</Text>
                <Text style={s.nutrientValue}>{Math.round(value)} {unit}</Text>
            </View>
            <View style={s.nutrientTrack}>
                <Animated.View style={[s.nutrientFill, {
                    backgroundColor: color,
                    width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                }]} />
            </View>
        </View>
    );
}

// ── Meal score ring ─────────────────────────────────────────────────────────
function MealScoreRing({ score }) {
    const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f97316' : '#ef4444';
    return (
        <View style={s.scoreRingWrap}>
            <ProgressRing pct={score} color={color} size={80} stroke={5} />
            <View style={s.scoreRingInner}>
                <Text style={[s.scoreRingNum, { color, fontFamily: CONDENSED }]}>{score}</Text>
                <Text style={s.scoreRingLabel}>SCORE</Text>
            </View>
        </View>
    );
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function NutritionScreen({ navigation }) {
    const ins = useSafeAreaInsets();
    const { userData } = useUser();
    const cameraRef = useRef(null);

    const [permission, setPermission] = useState(null);
    const [phase, setPhase] = useState('idle'); // idle | camera | analyzing | results
    const [result, setResult] = useState(null);

    // Request permission
    React.useEffect(() => {
        Camera.requestCameraPermissionsAsync().then(({ status }) => {
            setPermission({ granted: status === 'granted' });
        });
    }, []);

    const openCamera = useCallback(() => {
        setPhase('camera');
        setResult(null);
    }, []);

    const captureAndAnalyze = useCallback(async () => {
        if (!cameraRef.current) return;
        try {
            const photo = await cameraRef.current.takePictureAsync({
                base64: true,
                quality: 0.5,
                exif: false,
            });
            if (!photo?.base64) return;

            setPhase('analyzing');

            const res = await api.analyzeFood(userData.avatarId || 'athlete_01', photo.base64);
            if (res) {
                setResult(res);
                setPhase('results');
            } else {
                setResult({
                    food_items: ['Analysis failed'],
                    nutrients: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
                    meal_score: 0,
                    recommendation: 'Could not reach the server. Check your connection.',
                });
                setPhase('results');
            }
        } catch (e) {
            setPhase('idle');
        }
    }, [userData]);

    // ── No permission ────────────────────────────────────────────────────
    if (!permission) return <View style={s.root} />;

    if (!permission.granted) {
        return (
            <View style={[s.root, { paddingTop: ins.top, paddingBottom: ins.bottom }]}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <View style={s.permWrap}>
                    <Text style={s.permIcon}>🍽</Text>
                    <Text style={s.permTitle}>Camera Access Needed</Text>
                    <Text style={s.permBody}>
                        Take a photo of your meal and our AI will break down the nutrients instantly.
                    </Text>
                    <Tap style={s.permBtn} onPress={() => Camera.requestCameraPermissionsAsync().then(({ status }) => setPermission({ granted: status === 'granted' }))}>
                        <Text style={s.permBtnText}>Grant Camera Access</Text>
                    </Tap>
                </View>
            </View>
        );
    }

    // ── Camera phase ─────────────────────────────────────────────────────
    if (phase === 'camera') {
        return (
            <View style={s.root}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing="back"
                />
                {/* Top bar */}
                <View style={[s.camTop, { paddingTop: ins.top + 12 }]}>
                    <Tap style={s.camBackBtn} onPress={() => setPhase('idle')}>
                        <Text style={s.camBackTxt}>← Back</Text>
                    </Tap>
                    <Text style={s.camTitle}>POINT AT YOUR MEAL</Text>
                    <View style={{ width: 60 }} />
                </View>
                {/* Capture button */}
                <View style={[s.camBottom, { paddingBottom: ins.bottom + 30 }]}>
                    <Tap onPress={captureAndAnalyze}>
                        <View style={s.captureBtn}>
                            <View style={s.captureBtnInner} />
                        </View>
                    </Tap>
                </View>
            </View>
        );
    }

    // ── Analyzing phase ──────────────────────────────────────────────────
    if (phase === 'analyzing') {
        return (
            <View style={[s.root, { paddingTop: ins.top }]}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <View style={s.topBar}>
                    <Text style={[s.header, { fontFamily: CONDENSED }]}>NUTRITION</Text>
                </View>
                <PulsingLoader />
            </View>
        );
    }

    // ── Results phase ────────────────────────────────────────────────────
    if (phase === 'results' && result) {
        const nutrients = result.nutrients || {};
        return (
            <View style={[s.root, { paddingTop: ins.top }]}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <View style={s.topBar}>
                    <Tap onPress={() => navigation.goBack()}>
                        <Text style={s.backTxt}>← Back</Text>
                    </Tap>
                    <Text style={[s.header, { fontFamily: CONDENSED }]}>NUTRITION</Text>
                    <View style={{ width: 50 }} />
                </View>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: ins.bottom + 30 }}
                >
                    {/* Food items */}
                    <Fade delay={0}>
                        <Text style={s.sectionTitle}>DETECTED FOODS</Text>
                        <View style={s.foodList}>
                            {(result.food_items || []).map((item, i) => (
                                <View key={i} style={s.foodItem}>
                                    <View style={s.foodDot} />
                                    <Text style={s.foodText}>{item}</Text>
                                </View>
                            ))}
                        </View>
                    </Fade>

                    {/* Score + Nutrients */}
                    <Fade delay={100}>
                        <View style={s.scoreAndNutrients}>
                            <MealScoreRing score={result.meal_score || 0} />
                            <View style={s.nutrientsCol}>
                                {Object.keys(NUTRIENT_LABELS).map((key) => (
                                    <NutrientBar key={key} nutrientKey={key} value={nutrients[key] || 0} />
                                ))}
                            </View>
                        </View>
                    </Fade>

                    {/* Recommendation */}
                    <Fade delay={200}>
                        <View style={s.recCard}>
                            <Text style={s.recLabel}>COACHING TIP</Text>
                            <Text style={s.recText}>{result.recommendation}</Text>
                        </View>
                    </Fade>

                    {/* Scan Again */}
                    <Fade delay={300}>
                        <Tap onPress={openCamera}>
                            <LinearGradient
                                colors={['#0c4a6e', '#0891b2', '#06b6d4']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={s.scanAgainBtn}
                            >
                                <Text style={s.scanAgainText}>SCAN AGAIN</Text>
                            </LinearGradient>
                        </Tap>
                    </Fade>
                </ScrollView>
            </View>
        );
    }

    // ── Idle phase (landing) ─────────────────────────────────────────────
    return (
        <View style={[s.root, { paddingTop: ins.top }]}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />
            <View style={s.topBar}>
                <Tap onPress={() => navigation.goBack()}>
                    <Text style={s.backTxt}>← Back</Text>
                </Tap>
                <Text style={[s.header, { fontFamily: CONDENSED }]}>NUTRITION</Text>
                <View style={{ width: 50 }} />
            </View>

            <View style={s.idleContent}>
                <Fade delay={0}>
                    <Text style={s.idleEmoji}>🍽</Text>
                    <Text style={[s.idleTitle, { fontFamily: CONDENSED }]}>SCAN YOUR MEAL</Text>
                    <Text style={s.idleDesc}>
                        Take a photo of your food and our AI will instantly break down calories, protein, carbs, fat, and fiber.
                    </Text>
                </Fade>

                <Fade delay={150}>
                    <Tap onPress={openCamera}>
                        <LinearGradient
                            colors={['#0c4a6e', '#0891b2', '#06b6d4']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={s.ctaBtn}
                        >
                            <Text style={s.ctaEyebrow}>AI-POWERED</Text>
                            <Text style={[s.ctaTitle, { fontFamily: CONDENSED }]}>SCAN YOUR{'\n'}MEAL</Text>
                            <View style={s.ctaCircle}>
                                <Text style={s.ctaCircleText}>GO</Text>
                            </View>
                        </LinearGradient>
                    </Tap>
                </Fade>
            </View>
        </View>
    );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },

    // Permission
    permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    permIcon: { fontSize: 52, marginBottom: 16 },
    permTitle: { fontSize: 22, fontWeight: '900', color: '#f1f5f9', marginBottom: 10 },
    permBody: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
    permBtn: { backgroundColor: '#06b6d4', borderRadius: 14, paddingHorizontal: 30, paddingVertical: 13 },
    permBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },

    // Top bar
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14 },
    header: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 3 },
    backTxt: { color: '#06b6d4', fontSize: 14, fontWeight: '700' },

    // Camera
    camTop: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, zIndex: 10 },
    camBackBtn: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8 },
    camBackTxt: { color: '#f1f5f9', fontWeight: '700', fontSize: 13 },
    camTitle: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
    camBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
    captureBtn: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    captureBtnInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },

    // Loader
    loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loaderRing: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#06b6d4', marginBottom: 24 },
    loaderText: { fontSize: 16, fontWeight: '900', color: '#06b6d4', letterSpacing: 4 },
    loaderSub: { fontSize: 12, color: '#64748b', marginTop: 8 },

    // Idle
    idleContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    idleEmoji: { fontSize: 64, textAlign: 'center', marginBottom: 16 },
    idleTitle: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 2, textAlign: 'center', marginBottom: 8 },
    idleDesc: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 40 },

    // CTA
    ctaBtn: { borderRadius: 6, paddingVertical: 32, paddingHorizontal: 28, width: W - 64, position: 'relative',
        ...Platform.select({ android: { elevation: 12 }, ios: { shadowColor: '#06b6d4', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 12 }, shadowRadius: 28 } }),
    },
    ctaEyebrow: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 3, marginBottom: 8 },
    ctaTitle: { fontSize: 36, fontWeight: '900', color: '#fff', lineHeight: 40, letterSpacing: -1 },
    ctaCircle: { position: 'absolute', bottom: 24, right: 24, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    ctaCircleText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 1 },

    // Results — food items
    sectionTitle: { fontSize: 11, fontWeight: '800', color: '#4b5563', letterSpacing: 3, marginTop: 16, marginBottom: 12 },
    foodList: { backgroundColor: '#111a2e', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
    foodItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    foodDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#06b6d4', marginRight: 12 },
    foodText: { fontSize: 14, color: '#f1f5f9', fontWeight: '600' },

    // Score + Nutrients
    scoreAndNutrients: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
    scoreRingWrap: { marginRight: 20, alignItems: 'center' },
    scoreRingInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    scoreRingNum: { fontSize: 26, fontWeight: '900' },
    scoreRingLabel: { fontSize: 7, fontWeight: '700', color: '#4b5563', letterSpacing: 2, marginTop: -2 },
    nutrientsCol: { flex: 1 },
    nutrientRow: { marginBottom: 10 },
    nutrientLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    nutrientDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    nutrientLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '700', flex: 1 },
    nutrientValue: { fontSize: 12, color: '#f1f5f9', fontWeight: '800', fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier' },
    nutrientTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' },
    nutrientFill: { height: '100%', borderRadius: 2 },

    // Recommendation
    recCard: { backgroundColor: '#111a2e', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
    recLabel: { fontSize: 10, fontWeight: '800', color: '#4b5563', letterSpacing: 2, marginBottom: 8 },
    recText: { fontSize: 13, color: '#f1f5f9', fontStyle: 'italic', lineHeight: 20 },

    // Scan Again
    scanAgainBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    scanAgainText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 2 },
});
