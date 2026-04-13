// HomeScreen — Nike-inspired. Pure black canvas. Bold type. Premium polish.

import React, { useEffect, useState, useRef } from 'react';
import {
    View, Text, ScrollView, StyleSheet, Animated,
    Dimensions, Platform, StatusBar, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../context/UserContext';
import api from '../services/api';
import { DAILY_TRACKER_DEFAULTS } from '../data/constants';
import { Tap, Fade, CountUp, ActionRow, Divider, GradientDivider, PulsingDot, ProgressRing, CONDENSED, MONO } from '../ui';

const { width: W } = Dimensions.get('window');

function greet() {
    const h = new Date().getHours();
    return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function motivation(streak) {
    if (streak >= 14) return "You're on fire. Keep it up.";
    if (streak >= 7) return "A full week. That's real consistency.";
    if (streak >= 3) return "Building momentum. Stay with it.";
    if (streak >= 1) return "Yesterday was good. Make today better.";
    return "Every champion started with one session.";
}

// ── Animated bar ─────────────────────────────────────────────────────────────

function Bar({ pct, color, delay }) {
    const w = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(w, { toValue: pct, duration: 900, delay: delay + 200, useNativeDriver: false }).start();
    }, [pct]);
    return (
        <View style={$.barTrack}>
            <Animated.View style={[$.barFill, { backgroundColor: color, width: w.interpolate({ inputRange: [0,1], outputRange: ['0%','100%'] }) }]} />
        </View>
    );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
    const ins = useSafeAreaInsets();
    const { userData, fitnessScore } = useUser();
    const [online, setOnline] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [tracker, setTracker] = useState(DAILY_TRACKER_DEFAULTS);
    const TK = `@dt_${new Date().toISOString().slice(0,10)}`;

    const load = () => {
        AsyncStorage.getItem(TK).then(r => { if(r) try{setTracker(JSON.parse(r))}catch(_){} });
        api.ping().then(ok => setOnline(!!ok));
    };
    useEffect(load, []);
    useEffect(() => { AsyncStorage.setItem(TK, JSON.stringify(tracker)).catch(()=>{}); }, [tracker]);

    const onRefresh = () => { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 800); };

    // #2 Breathing score ring glow
    const ringGlow = useRef(new Animated.Value(0.8)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(ringGlow, { toValue: 1, duration: 2000, useNativeDriver: true }),
                Animated.timing(ringGlow, { toValue: 0.8, duration: 2000, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    // #3 Bouncy CTA
    const ctaBounce = useRef(new Animated.Value(0.85)).current;
    useEffect(() => {
        Animated.spring(ctaBounce, { toValue: 1, useNativeDriver: true, speed: 4, bounciness: 14 }).start();
    }, []);

    const sc = fitnessScore?.score || 0;
    const scColor = fitnessScore?.color || '#06b6d4';
    const first = userData.name?.split(' ')[0] || 'Athlete';
    const daily = Object.values(tracker);

    return (
        <View style={[$.root, { paddingTop: ins.top }]}>
            <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#333" progressBackgroundColor="#000" colors={['#06b6d4']} />}
            >

                {/* ═══ Top ═══ */}
                <Fade style={$.top}>
                    <Text style={$.brand}>ACTIVEBHARAT</Text>
                    <PulsingDot color={online ? '#22c55e' : online === false ? '#ef4444' : '#facc15'} size={8} />
                </Fade>

                {/* ═══ Greeting ═══ */}
                <Fade delay={40} style={$.greetSection}>
                    <Text style={$.greetText}>{greet()}, <Text style={$.greetName}>{first}</Text></Text>
                    <Text style={$.motivText}>{motivation(userData.streak || 0)}</Text>
                </Fade>

                {/* ═══ Hero ═══ */}
                <Fade delay={100} style={$.hero}>
                    <Animated.View style={[$.ringWrap, { opacity: ringGlow }]}>
                        <ProgressRing pct={sc} color={scColor} size={150} stroke={6} />
                        <View style={$.ringInner}>
                            <CountUp to={sc} duration={1200} delay={400} style={[$.scoreNum, { color: scColor, fontFamily: CONDENSED }]} />
                            <Text style={$.scoreUnit}>SCORE</Text>
                        </View>
                    </Animated.View>
                </Fade>

                {/* ═══ Stats ═══ */}
                <Fade delay={160} style={$.statsRow}>
                    <View style={$.stat}>
                        <CountUp to={userData.bpi||0} duration={1000} delay={500} style={[$.statNum, { color: '#06b6d4' }]} />
                        <Text style={$.statKey}>BPI</Text>
                    </View>
                    <View style={$.statDiv} />
                    <View style={$.stat}>
                        <CountUp to={userData.sessions||0} duration={800} delay={600} style={[$.statNum, { color: '#22c55e' }]} />
                        <Text style={$.statKey}>SESSIONS</Text>
                    </View>
                    <View style={$.statDiv} />
                    <View style={$.stat}>
                        <CountUp to={userData.streak||0} duration={600} delay={700} style={[$.statNum, { color: '#f97316' }]} />
                        <Text style={$.statKey}>STREAK</Text>
                    </View>
                </Fade>

                {/* ═══ CTA ═══ */}
                <Fade delay={240}>
                    <Animated.View style={{ transform: [{ scale: ctaBounce }] }}>
                        <Tap onPress={() => navigation.navigate('GhostSkeleton', { sport: userData.sport || 'general' })}>
                            <LinearGradient colors={['#0c4a6e','#0891b2','#06b6d4']} start={{x:0,y:0}} end={{x:1,y:1}} style={$.cta}>
                                <Text style={$.ctaEyebrow}>YOUR NEXT SESSION</Text>
                                <Text style={$.ctaTitle}>START{'\n'}TRAINING</Text>
                                <View style={$.ctaBtn}><Text style={$.ctaBtnText}>GO</Text></View>
                            </LinearGradient>
                        </Tap>
                    </Animated.View>
                </Fade>

                {/* ═══ Actions ═══ */}
                <Fade delay={320} style={$.actions}>
                    <ActionRow label="HEART RATE" color="#ef4444" onPress={() => navigation.navigate('HeartRate', { sessionId: 'rppg_'+Date.now() })} />
                    <GradientDivider color="#ef4444" />
                    <ActionRow label="WEEKLY PLAN" color="#22c55e" onPress={() => navigation.navigate('TrainingPlan')} />
                    <GradientDivider color="#22c55e" />
                    <ActionRow label="NUTRITION" color="#f97316" onPress={() => navigation.navigate('Nutrition')} />
                    <GradientDivider color="#f97316" />
                    <ActionRow label="FITNESS TEST" color="#06b6d4" onPress={() => navigation.navigate('FitnessTest')} />
                </Fade>

                {/* ═══ Today ═══ */}
                <Fade delay={400} style={$.today}>
                    <Text style={$.todayHead}>TODAY</Text>
                    {daily.slice(0, 5).map((t, i) => {
                        const pct = t.goal > 0 ? Math.min(1, t.current / t.goal) : 0;
                        const colors = ['#06b6d4','#f97316','#22c55e','#a855f7','#eab308'];
                        const val = typeof t.current === 'number' && t.current % 1 ? t.current.toFixed(1) : t.current;
                        return (
                            <Fade key={i} delay={450 + i * 50}>
                                <View style={$.metricRow}>
                                    <Text style={$.metricLabel}>{t.label}</Text>
                                    <Text style={$.metricVal}>{val}<Text style={$.metricGoal}> / {t.goal}</Text></Text>
                                </View>
                                <Bar pct={pct} color={colors[i]} delay={450 + i * 50} />
                                {i < daily.slice(0,5).length - 1 && <View style={{ height: 16 }} />}
                            </Fade>
                        );
                    })}
                </Fade>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const $ = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },

    top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 12, marginBottom: 12 },
    brand: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 3 },
    liveDot: { width: 8, height: 8, borderRadius: 4 },

    // Greeting
    greetSection: { paddingHorizontal: 24, marginBottom: 8 },
    greetText: { fontSize: 22, fontWeight: '400', color: '#9ca3af' },
    greetName: { fontWeight: '800', color: '#fff' },
    motivText: { fontSize: 13, color: '#4b5563', fontWeight: '400', marginTop: 6, fontStyle: 'italic' },

    hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 24 },
    ringWrap: { marginBottom: 16 },
    ringInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    scoreNum: { fontSize: 48, fontWeight: '900' },
    scoreUnit: { fontSize: 9, fontWeight: '700', color: '#4b5563', letterSpacing: 3, marginTop: -4 },
    // (name moved to greeting section)

    statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 36 },
    stat: { alignItems: 'center', paddingHorizontal: 24 },
    statNum: { fontSize: 26, fontWeight: '800', fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : 'HelveticaNeue-CondensedBold' },
    statKey: { fontSize: 9, fontWeight: '600', color: '#4b5563', letterSpacing: 2, marginTop: 4 },
    statDiv: { width: 1, height: 32, backgroundColor: '#1f2937' },

    cta: { marginHorizontal: 20, borderRadius: 6, paddingVertical: 32, paddingHorizontal: 28, marginBottom: 32, position: 'relative',
        ...Platform.select({ android: { elevation: 12 }, ios: { shadowColor: '#06b6d4', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 12 }, shadowRadius: 28 } }),
    },
    ctaEyebrow: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 3, marginBottom: 8 },
    ctaTitle: { fontSize: 40, fontWeight: '900', color: '#fff', lineHeight: 42, letterSpacing: -1, fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : 'HelveticaNeue-CondensedBold' },
    ctaBtn: { position: 'absolute', bottom: 24, right: 24, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    ctaBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 1 },

    actions: { paddingHorizontal: 24, marginBottom: 36 },

    today: { paddingHorizontal: 24 },
    todayHead: { fontSize: 11, fontWeight: '800', color: '#4b5563', letterSpacing: 3, marginBottom: 20 },
    metricRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    metricLabel: { fontSize: 13, color: '#6b7280', fontWeight: '400' },
    metricVal: { fontSize: 13, color: '#f9fafb', fontWeight: '700', fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : 'Courier' },
    metricGoal: { color: '#374151', fontWeight: '400' },
    barTrack: { height: 3, backgroundColor: '#111', borderRadius: 2, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 2 },
});
