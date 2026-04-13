// ProfileScreen — Nike-inspired. Pure black canvas. Bold typography IS the design.
// No cards. No borders. No containers. Content floats on black.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, ScrollView, StyleSheet, Pressable, Animated,
    Dimensions, Platform, ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../context/UserContext';
import api from '../services/api';
import { LEVEL_COLORS, LEVEL_LABELS } from '../styles/colors';
import { SPORT_LABELS } from '../data/constants';

const { width: W } = Dimensions.get('window');
const FONT_CONDENSED = Platform.OS === 'android' ? 'sans-serif-condensed' : 'HelveticaNeue-CondensedBold';

// ── Shared: Tap with scale ──────────────────────────────────────────────────

function Tap({ onPress, children, style }) {
    const s = useRef(new Animated.Value(1)).current;
    return (
        <Pressable onPress={onPress}
            onPressIn={() => Animated.spring(s, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start()}
            onPressOut={() => Animated.spring(s, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }).start()}>
            <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
        </Pressable>
    );
}

// ── Shared: Fade in on mount ────────────────────────────────────────────────

function Fade({ delay = 0, children, style }) {
    const o = useRef(new Animated.Value(0)).current;
    const y = useRef(new Animated.Value(20)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(o, { toValue: 1, duration: 600, delay, useNativeDriver: true }),
            Animated.spring(y, { toValue: 0, delay, useNativeDriver: true, speed: 12 }),
        ]).start();
    }, []);
    return <Animated.View style={[style, { opacity: o, transform: [{ translateY: y }] }]}>{children}</Animated.View>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(name) {
    return (name || 'AB').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function scoreColor(v) {
    if (v >= 75) return '#22c55e';
    if (v >= 50) return '#f97316';
    return '#ef4444';
}

function fmtDate(d) {
    if (!d) return '--';
    const dt = new Date(d);
    const day = dt.getDate();
    const mon = dt.toLocaleString('en', { month: 'short' }).toUpperCase();
    return `${day} ${mon}`;
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function ProfileScreen({ navigation }) {
    const ins = useSafeAreaInsets();
    const { userData, fitnessScore, dataMode } = useUser();
    const athleteId = userData?.avatarId || 'athlete_01';

    const [sessions, setSessions] = useState(null);
    const [isOnline, setIsOnline] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [sess, ping] = await Promise.all([
                api.getSessions(athleteId, 10),
                api.ping(),
            ]);
            setSessions(sess?.sessions || sess || []);
            setIsOnline(!!ping);
        } catch (_) {
            setIsOnline(false);
        } finally {
            setLoading(false);
        }
    }, [athleteId]);

    useEffect(() => { load(); }, [load]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        load().finally(() => setRefreshing(false));
    }, [load]);

    const handleRetake = useCallback(() => {
        navigation.navigate('FitnessTest');
    }, [navigation]);

    const handleSessionTap = useCallback((session) => {
        const sid = session.session_id || session.id;
        if (sid) navigation.navigate('ScoreCard', { sessionId: sid });
    }, [navigation]);

    const sessionList = Array.isArray(sessions) ? sessions.slice(0, 10) : [];
    const sportLabel = SPORT_LABELS[userData?.sport] || 'Athlete';
    const hasTested = fitnessScore?.level > 0;
    const lvl = fitnessScore?.level || 0;
    const lvlColor = fitnessScore?.color || LEVEL_COLORS[lvl] || '#06b6d4';
    const lvlLabel = fitnessScore?.label || LEVEL_LABELS[lvl] || '';

    return (
        <View style={[$.root, { paddingTop: ins.top }]}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />
            <ScrollView showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#333" progressBackgroundColor="#000" colors={['#06b6d4']} />}
            >

                {/* ═══ Identity ═══ */}
                <Fade style={$.identitySection}>
                    <View style={$.avatarCircle}>
                        <Text style={$.avatarText}>{initials(userData?.name)}</Text>
                    </View>
                    <Text style={$.nameText}>{(userData?.name || 'Athlete').toUpperCase()}</Text>
                    <Text style={$.metaText}>{sportLabel.toUpperCase()}  ·  {(userData?.tier || 'District').toUpperCase()}</Text>
                </Fade>

                {/* ═══ Stats Row ═══ */}
                <Fade delay={100} style={$.statsSection}>
                    <View style={$.statsRow}>
                        <View style={$.statItem}>
                            <Text style={[$.statNumber, { color: '#06b6d4' }]}>{(userData?.bpi ?? 0).toLocaleString()}</Text>
                            <Text style={$.statLabel}>BPI</Text>
                        </View>
                        <View style={$.statDivider} />
                        <View style={$.statItem}>
                            <Text style={[$.statNumber, { color: '#f97316' }]}>{userData?.sessions ?? 0}</Text>
                            <Text style={$.statLabel}>SESSIONS</Text>
                        </View>
                        <View style={$.statDivider} />
                        <View style={$.statItem}>
                            <Text style={[$.statNumber, { color: '#22c55e' }]}>{userData?.streak ?? 0}</Text>
                            <Text style={$.statLabel}>DAY STREAK</Text>
                        </View>
                    </View>
                </Fade>

                {/* ═══ Fitness Level ═══ */}
                <Fade delay={200} style={$.section}>
                    <Text style={$.sectionLabel}>FITNESS LEVEL</Text>
                    {hasTested ? (
                        <>
                            <View style={$.levelBandRow}>
                                {[1, 2, 3, 4, 5, 6, 7].map(l => (
                                    <View
                                        key={l}
                                        style={[
                                            $.levelSeg,
                                            { backgroundColor: l <= lvl ? (LEVEL_COLORS[l] || '#4b5563') : '#1a1a1a' },
                                        ]}
                                    />
                                ))}
                            </View>
                            <View style={$.levelInfoRow}>
                                <Text style={[$.levelScore, { color: lvlColor }]}>{fitnessScore?.score || 0}</Text>
                                <Text style={[$.levelName, { color: lvlColor }]}>L{lvl} — {lvlLabel}</Text>
                            </View>
                            <LinearGradient colors={['transparent', '#06b6d4', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1, opacity: 0.2 }} />
                            <Tap onPress={handleRetake} style={$.actionRow}>
                                <Text style={$.actionTitle}>RETAKE TEST</Text>
                                <Text style={$.actionArrow}>›</Text>
                            </Tap>
                        </>
                    ) : (
                        <>
                            <Text style={$.emptyHint}>No fitness test taken yet</Text>
                            <LinearGradient colors={['transparent', '#06b6d4', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1, opacity: 0.2 }} />
                            <Tap onPress={handleRetake} style={$.actionRow}>
                                <Text style={$.actionTitle}>TAKE FITNESS TEST</Text>
                                <Text style={$.actionArrow}>›</Text>
                            </Tap>
                        </>
                    )}
                </Fade>

                {/* ═══ Recent Sessions ═══ */}
                <Fade delay={300} style={$.section}>
                    <Text style={$.sectionLabel}>RECENT SESSIONS</Text>
                    {loading ? (
                        <ActivityIndicator size="small" color="#06b6d4" style={{ marginTop: 16 }} />
                    ) : sessionList.length === 0 ? (
                        <Text style={$.emptyHint}>No sessions recorded yet</Text>
                    ) : (
                        sessionList.map((sess, i) => {
                            const formScore = sess.avg_form_score ?? sess.form_score ?? 0;
                            const sport = SPORT_LABELS[sess.sport] || sess.sport || 'Session';
                            const xp = sess.xp_earned ?? sess.xp ?? 0;
                            const color = scoreColor(formScore);
                            const date = fmtDate(sess.ended_at || sess.started_at || sess.date);
                            return (
                                <React.Fragment key={sess.session_id || sess.id || i}>
                                    <Tap onPress={() => handleSessionTap(sess)} style={$.sessionRow}>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <Text style={$.sessionDate}>{date}</Text>
                                                <Text style={$.sessionSep}>|</Text>
                                                <Text style={$.sessionSport}>{sport}</Text>
                                            </View>
                                        </View>
                                        <Text style={[$.sessionScore, { color }]}>{formScore.toFixed(0)}</Text>
                                        <Text style={$.sessionXp}>+{xp} XP</Text>
                                        <Text style={$.sessionArrow}>›</Text>
                                    </Tap>
                                    {i < sessionList.length - 1 && (
                                        <LinearGradient colors={['transparent', '#06b6d4', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1, opacity: 0.2 }} />
                                    )}
                                </React.Fragment>
                            );
                        })
                    )}
                </Fade>

                {/* ═══ System ═══ */}
                <Fade delay={400} style={$.section}>
                    <Text style={$.sectionLabel}>SYSTEM</Text>

                    <View style={$.systemRow}>
                        <Text style={$.systemLabel}>Backend</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={[$.statusDot, { backgroundColor: isOnline ? '#22c55e' : '#ef4444' }]} />
                            <Text style={[$.systemValue, { color: isOnline ? '#22c55e' : '#ef4444' }]}>
                                {isOnline ? 'CONNECTED' : 'OFFLINE'}
                            </Text>
                        </View>
                    </View>
                    <LinearGradient colors={['transparent', '#06b6d4', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1, opacity: 0.2 }} />

                    <View style={$.systemRow}>
                        <Text style={$.systemLabel}>Data Mode</Text>
                        <Text style={[$.systemValue, { color: dataMode === 'real' ? '#22c55e' : dataMode === 'hybrid' ? '#facc15' : '#f97316' }]}>
                            {(dataMode || 'mock').toUpperCase()}
                        </Text>
                    </View>
                    <LinearGradient colors={['transparent', '#06b6d4', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1, opacity: 0.2 }} />

                    <View style={$.systemRow}>
                        <Text style={$.systemLabel}>Version</Text>
                        <Text style={$.systemValue}>2.0.0</Text>
                    </View>
                </Fade>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

// ── Styles ───────────────────────────────────────────────────────────────────
// Pure black. No cards. No borders. Bold uppercase type. Nike DNA.

const $ = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },

    // Identity
    identitySection: { alignItems: 'center', paddingTop: 32, paddingBottom: 32 },
    avatarCircle: {
        width: 80, height: 80, borderRadius: 40, backgroundColor: '#111',
        alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        borderWidth: 2, borderColor: '#06b6d4',
    },
    avatarText: { fontSize: 28, fontWeight: '900', color: '#06b6d4', fontFamily: FONT_CONDENSED },
    nameText: { fontSize: 22, fontWeight: '900', color: '#fff', fontFamily: FONT_CONDENSED, letterSpacing: 4, marginBottom: 6 },
    metaText: { fontSize: 11, fontWeight: '700', color: '#4b5563', letterSpacing: 3 },

    // Stats row
    statsSection: { paddingHorizontal: 24, marginBottom: 40 },
    statsRow: { flexDirection: 'row', alignItems: 'center' },
    statItem: { flex: 1, alignItems: 'center' },
    statNumber: { fontSize: 24, fontWeight: '800', fontFamily: FONT_CONDENSED },
    statLabel: { fontSize: 9, fontWeight: '600', color: '#4b5563', letterSpacing: 2, marginTop: 4 },
    statDivider: { width: 1, height: 28, backgroundColor: '#1a1a1a' },

    // Section
    section: { paddingHorizontal: 24, marginBottom: 32 },
    sectionLabel: { fontSize: 11, fontWeight: '800', color: '#4b5563', letterSpacing: 3, marginBottom: 16 },

    // Divider
    divider: { height: 1, backgroundColor: '#1a1a1a' },

    // Fitness level
    levelBandRow: { flexDirection: 'row', gap: 3, height: 4, marginBottom: 16 },
    levelSeg: { flex: 1, borderRadius: 2 },
    levelInfoRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 16 },
    levelScore: { fontSize: 32, fontWeight: '900', fontFamily: FONT_CONDENSED, marginRight: 12 },
    levelName: { fontSize: 14, fontWeight: '700', letterSpacing: 2 },

    // Action row (Nike style)
    actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18 },
    actionTitle: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 2 },
    actionArrow: { fontSize: 22, color: '#4b5563', fontWeight: '300' },

    // Sessions
    sessionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
    sessionDate: { fontSize: 12, fontWeight: '700', color: '#4b5563', letterSpacing: 1 },
    sessionSep: { fontSize: 12, color: '#1a1a1a', marginHorizontal: 8 },
    sessionSport: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
    sessionScore: { fontSize: 20, fontWeight: '900', fontFamily: FONT_CONDENSED, marginRight: 10 },
    sessionXp: { fontSize: 11, fontWeight: '800', color: '#22c55e', fontFamily: FONT_CONDENSED, marginRight: 10 },
    sessionArrow: { fontSize: 18, color: '#4b5563', fontWeight: '300' },

    // System
    systemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
    systemLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
    systemValue: { fontSize: 12, fontWeight: '800', color: '#4b5563', letterSpacing: 1, fontFamily: FONT_CONDENSED },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },

    // Empty
    emptyHint: { fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 8 },
});
