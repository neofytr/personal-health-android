// ScoreCardScreen — Nike-inspired. Pure black canvas. Bold typography IS the design.
// No cards. No borders. No containers. Content floats on black.

import React, { useEffect, useState, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Pressable, Animated,
    Platform, ActivityIndicator, Share, Alert, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import api from '../services/api';

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

// ── Progress ring ───────────────────────────────────────────────────────────

function ProgressRing({ pct, color, size = 160, stroke = 6 }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return (
        <Svg width={size} height={size}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" fill="none" strokeWidth={stroke} />
            <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, (pct || 0) / 100))}
                strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </Svg>
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score) {
    if (score >= 80) return '#22c55e';
    if (score >= 65) return '#06b6d4';
    if (score >= 50) return '#f97316';
    return '#ef4444';
}

function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function ScoreCardScreen({ navigation, route }) {
    const ins = useSafeAreaInsets();
    const sessionId = route?.params?.sessionId;
    const [card, setCard] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!sessionId) return;
        api.getScorecard(sessionId).then(data => {
            setCard(data);
            setLoading(false);
        });
    }, [sessionId]);

    const handleShare = async () => {
        if (!card) return;
        const sc = card.avg_form_score;
        const msg = [
            `ActiveBharat Session Score: ${sc.toFixed(1)}`,
            `Sport: ${(card.sport || '').replace('_', ' ')}`,
            `Peak Jump: ${card.peak_jump_height_cm?.toFixed(1) || '\u2014'} cm`,
            `XP Earned: +${card.xp_earned}`,
            `Symmetry: ${((card.avg_symmetry || 0) * 100).toFixed(0)}%`,
            '',
            'Train smarter with ActiveBharat',
        ].join('\n');

        try {
            await Share.share({ message: msg, title: 'My Training Score Card' });
        } catch (err) {
            Alert.alert('Share failed', err.message);
        }
    };

    // ── Loading ─────────────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={[$.root, { paddingTop: ins.top }]}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <View style={$.center}>
                    <ActivityIndicator size="large" color="#06b6d4" />
                    <Text style={$.loadingText}>LOADING</Text>
                </View>
            </View>
        );
    }

    // ── Empty ───────────────────────────────────────────────────────────
    if (!card) {
        return (
            <View style={[$.root, { paddingTop: ins.top }]}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <View style={$.center}>
                    <Text style={$.errorText}>SCORE CARD NOT AVAILABLE</Text>
                    <Tap onPress={() => navigation.goBack()} style={$.retryRow}>
                        <Text style={$.retryText}>GO BACK</Text>
                        <Text style={$.retryArrow}>›</Text>
                    </Tap>
                </View>
            </View>
        );
    }

    const sc = card.avg_form_score || 0;
    const color = scoreColor(sc);
    const dist = card.quality_distribution || {};
    const total = (dist.elite || 0) + (dist.good || 0) + (dist.average || 0) + (dist.poor || 0);

    const stats = [
        { label: 'PEAK SCORE', value: card.peak_jump_height_cm?.toFixed(1) || '\u2014', unit: 'CM', color: '#06b6d4' },
        { label: 'SYMMETRY', value: `${((card.avg_symmetry || 0) * 100).toFixed(0)}%`, color: (card.avg_symmetry || 0) >= 0.95 ? '#22c55e' : '#f97316' },
        { label: 'XP EARNED', value: `+${card.xp_earned || 0}`, color: '#facc15' },
        { label: 'DURATION', value: formatDuration(card.duration_seconds || 0), color: '#a855f7' },
        { label: 'REPS', value: `${card.rep_count || '\u2014'}`, color: '#fff' },
    ];

    return (
        <View style={[$.root, { paddingTop: ins.top }]}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />
            <ScrollView showsVerticalScrollIndicator={false}>

                {/* ═══ Header ═══ */}
                <Fade style={$.topBar}>
                    <Text style={$.brand}>SESSION COMPLETE</Text>
                    <Text style={$.sportLabel}>{(card.sport || '').replace('_', ' ').toUpperCase()}</Text>
                </Fade>

                {/* ═══ Score Ring ═══ */}
                <Fade delay={100} style={$.heroSection}>
                    <View style={$.ringContainer}>
                        <ProgressRing pct={sc} color={color} />
                        <View style={$.ringInner}>
                            <Text style={[$.scoreNumber, { color }]}>{sc.toFixed(1)}</Text>
                            <Text style={$.scoreLabel}>FORM SCORE</Text>
                        </View>
                    </View>
                </Fade>

                {/* ═══ Stats Rows ═══ */}
                <Fade delay={200} style={$.statsSection}>
                    <Text style={$.sectionLabel}>STATS</Text>
                    {stats.map((st, i) => (
                        <React.Fragment key={i}>
                            <View style={$.statRow}>
                                <Text style={$.statRowLabel}>{st.label}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                    <Text style={[$.statRowValue, { color: st.color || '#fff' }]}>{st.value}</Text>
                                    {st.unit ? <Text style={$.statRowUnit}>{st.unit}</Text> : null}
                                </View>
                            </View>
                            {i < stats.length - 1 && <View style={$.divider} />}
                        </React.Fragment>
                    ))}
                </Fade>

                {/* ═══ Quality Bar ═══ */}
                {total > 0 && (
                    <Fade delay={300} style={$.qualSection}>
                        <Text style={$.sectionLabel}>QUALITY DISTRIBUTION</Text>
                        <View style={$.qualBar}>
                            {dist.elite > 0 && <View style={[$.qualSeg, { flex: dist.elite, backgroundColor: '#22c55e' }]} />}
                            {dist.good > 0 && <View style={[$.qualSeg, { flex: dist.good, backgroundColor: '#06b6d4' }]} />}
                            {dist.average > 0 && <View style={[$.qualSeg, { flex: dist.average, backgroundColor: '#f97316' }]} />}
                            {dist.poor > 0 && <View style={[$.qualSeg, { flex: dist.poor, backgroundColor: '#ef4444' }]} />}
                        </View>
                        <View style={$.qualLegend}>
                            <Text style={[$.qualLegendItem, { color: '#22c55e' }]}>ELITE {dist.elite || 0}</Text>
                            <Text style={[$.qualLegendItem, { color: '#06b6d4' }]}>GOOD {dist.good || 0}</Text>
                            <Text style={[$.qualLegendItem, { color: '#f97316' }]}>AVG {dist.average || 0}</Text>
                            <Text style={[$.qualLegendItem, { color: '#ef4444' }]}>POOR {dist.poor || 0}</Text>
                        </View>
                    </Fade>
                )}

                {/* ═══ Share CTA ═══ */}
                <Fade delay={400} style={{ paddingHorizontal: 20, marginBottom: 24 }}>
                    <Tap onPress={handleShare}>
                        <LinearGradient
                            colors={color === '#22c55e' ? ['#15803d', '#22c55e', '#4ade80'] :
                                    color === '#06b6d4' ? ['#0e7490', '#06b6d4', '#22d3ee'] :
                                    color === '#f97316' ? ['#c2410c', '#f97316', '#fb923c'] :
                                    ['#b91c1c', '#ef4444', '#f87171']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={$.shareBlock}
                        >
                            <Text style={$.shareLabel}>SHARE YOUR RESULTS</Text>
                            <Text style={$.shareTitle}>SHARE</Text>
                        </LinearGradient>
                    </Tap>
                </Fade>

                {/* ═══ Athlete ═══ */}
                <Fade delay={500} style={$.athleteSection}>
                    <Text style={$.athleteName}>{(card.athlete_name || card.athlete_id || '').toUpperCase()}</Text>
                    <Text style={$.athleteMeta}>{card.tier}  ·  BPI {card.bpi?.toLocaleString()}</Text>
                </Fade>

                <Text style={$.watermark}>ACTIVEBHARAT.IN</Text>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

// ── Styles ───────────────────────────────────────────────────────────────────
// Pure black. No cards. No borders. Bold uppercase type. Nike DNA.

const $ = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

    // Top bar
    topBar: { alignItems: 'center', paddingTop: 16, marginBottom: 8 },
    brand: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 3 },
    sportLabel: { fontSize: 11, fontWeight: '700', color: '#4b5563', letterSpacing: 3, marginTop: 4 },

    // Hero
    heroSection: { alignItems: 'center', paddingTop: 20, paddingBottom: 32 },
    ringContainer: { marginBottom: 0 },
    ringInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    scoreNumber: { fontSize: 48, fontWeight: '900', fontFamily: FONT_CONDENSED },
    scoreLabel: { fontSize: 9, fontWeight: '800', color: '#4b5563', letterSpacing: 2, marginTop: -2 },

    // Section
    sectionLabel: { fontSize: 11, fontWeight: '800', color: '#4b5563', letterSpacing: 3, marginBottom: 16 },

    // Stats
    statsSection: { paddingHorizontal: 24, marginBottom: 32 },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    statRowLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
    statRowValue: { fontSize: 22, fontWeight: '800', fontFamily: FONT_CONDENSED },
    statRowUnit: { fontSize: 11, fontWeight: '600', color: '#4b5563', marginLeft: 4 },
    divider: { height: 1, backgroundColor: '#1a1a1a' },

    // Quality bar
    qualSection: { paddingHorizontal: 24, marginBottom: 32 },
    qualBar: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 12 },
    qualSeg: { height: '100%' },
    qualLegend: { flexDirection: 'row', justifyContent: 'space-between' },
    qualLegendItem: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },

    // Share CTA
    shareBlock: { borderRadius: 4, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center' },
    shareLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 3, marginBottom: 6 },
    shareTitle: { fontSize: 32, fontWeight: '900', color: '#fff', fontFamily: FONT_CONDENSED, letterSpacing: 4 },

    // Athlete
    athleteSection: { alignItems: 'center', marginBottom: 20 },
    athleteName: { fontSize: 14, fontWeight: '700', color: '#6b7280', letterSpacing: 4 },
    athleteMeta: { fontSize: 11, fontWeight: '600', color: '#374151', marginTop: 4, letterSpacing: 2 },

    watermark: { textAlign: 'center', fontSize: 9, fontWeight: '600', color: '#1a1a1a', letterSpacing: 3, marginBottom: 8 },

    // States
    loadingText: { fontSize: 11, fontWeight: '800', color: '#4b5563', letterSpacing: 3, marginTop: 16 },
    errorText: { fontSize: 15, fontWeight: '700', color: '#ef4444', letterSpacing: 2, marginBottom: 20 },
    retryRow: { flexDirection: 'row', alignItems: 'center' },
    retryText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 2 },
    retryArrow: { fontSize: 22, color: '#4b5563', fontWeight: '300', marginLeft: 8 },
});
