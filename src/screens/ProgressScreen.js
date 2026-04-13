// ProgressScreen — Nike-inspired. Pure black canvas. Bold typography IS the design.
// No cards. No borders. No containers. Content floats on black.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, ScrollView, StyleSheet, Pressable, Animated,
    Dimensions, Platform, ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Circle, Line, Text as SvgText, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { useUser } from '../context/UserContext';
import api from '../services/api';

const { width: W } = Dimensions.get('window');
const FONT_CONDENSED = Platform.OS === 'android' ? 'sans-serif-condensed' : 'HelveticaNeue-CondensedBold';

const PERIODS = [
    { label: '7D', days: 7 },
    { label: '30D', days: 30 },
    { label: '90D', days: 90 },
];

const RISK_COLORS = { low: '#22c55e', watch: '#f97316', high: '#ef4444' };

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

function ProgressRing({ pct, color, size = 140, stroke = 6 }) {
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

function scoreColor(v) {
    if (v >= 75) return '#22c55e';
    if (v >= 50) return '#f97316';
    return '#ef4444';
}

function titleCase(s) {
    return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtDate(d) {
    const dt = new Date(d);
    return `${dt.getDate()}/${dt.getMonth() + 1}`;
}

// ── SVG Form Trend Chart (on pure black) ────────────────────────────────────

function FormTrendChart({ data, trendPct }) {
    if (!data || data.length < 2) return null;

    const chartW = W - 48;
    const chartH = 160;
    const padT = 16;
    const padB = 24;
    const padL = 32;
    const padR = 8;
    const innerW = chartW - padL - padR;
    const innerH = chartH - padT - padB;

    const pts = data.map((d, i) => {
        const x = padL + (i / (data.length - 1)) * innerW;
        const y = padT + innerH - ((d.score / 100) * innerH);
        return { x, y, score: d.score, date: d.date };
    });

    const polyStr = pts.map(p => `${p.x},${p.y}`).join(' ');
    const areaStr = `${pts[0].x},${padT + innerH} ${polyStr} ${pts[pts.length - 1].x},${padT + innerH}`;
    const yLines = [0, 25, 50, 75, 100];

    return (
        <View style={{ marginBottom: 32 }}>
            <Svg width={chartW} height={chartH}>
                <Defs>
                    <SvgGrad id="areaFill" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor="#06b6d4" stopOpacity="0.15" />
                        <Stop offset="1" stopColor="#06b6d4" stopOpacity="0.01" />
                    </SvgGrad>
                </Defs>

                {yLines.map(v => {
                    const y = padT + innerH - ((v / 100) * innerH);
                    return (
                        <React.Fragment key={v}>
                            <Line x1={padL} y1={y} x2={padL + innerW} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                            <SvgText x={padL - 6} y={y + 4} fontSize={9} fill="#4b5563" textAnchor="end" fontWeight="700">{v}</SvgText>
                        </React.Fragment>
                    );
                })}

                <Polyline points={areaStr} fill="url(#areaFill)" stroke="none" />
                <Polyline points={polyStr} fill="none" stroke="#06b6d4" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

                {pts.map((p, i) => (
                    <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#06b6d4" stroke="#000" strokeWidth={2} />
                ))}

                {[0, Math.floor(data.length / 2), data.length - 1].map(idx => (
                    <SvgText key={idx} x={pts[idx].x} y={chartH - 4} fontSize={8} fill="#4b5563" textAnchor="middle" fontWeight="700">
                        {fmtDate(data[idx].date)}
                    </SvgText>
                ))}
            </Svg>
        </View>
    );
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function ProgressScreen() {
    const ins = useSafeAreaInsets();
    const { userData } = useUser();
    const athleteId = userData?.avatarId || 'athlete_01';

    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const [progress, setProgress] = useState(null);
    const [weakJoints, setWeakJoints] = useState(null);
    const [injuryRisk, setInjuryRisk] = useState(null);
    const [readiness, setReadiness] = useState(null);
    const [summary, setSummary] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const [prog, wj, ir, rd, ws] = await Promise.all([
                api.getProgress(athleteId, days),
                api.getWeakJoints(athleteId, days),
                api.getInjuryRisk(athleteId, Math.min(days, 14)),
                api.getReadiness(athleteId, Math.min(days, 14)),
                api.getWeeklySummary(athleteId, Math.min(days, 7)),
            ]);
            setProgress(prog);
            setWeakJoints(wj);
            setInjuryRisk(ir);
            setReadiness(rd);
            setSummary(ws);
        } catch (e) {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [athleteId, days]);

    useEffect(() => { load(); }, [load]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        load().finally(() => setRefreshing(false));
    }, [load]);

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

    // ── Error ───────────────────────────────────────────────────────────
    if (error) {
        return (
            <View style={[$.root, { paddingTop: ins.top }]}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <View style={$.center}>
                    <Text style={$.errorText}>COULD NOT LOAD DATA</Text>
                    <Tap onPress={load} style={$.retryRow}>
                        <Text style={$.retryText}>RETRY</Text>
                        <Text style={$.retryArrow}>›</Text>
                    </Tap>
                </View>
            </View>
        );
    }

    // ── Empty ───────────────────────────────────────────────────────────
    const hasData = progress?.session_count > 0;
    if (!hasData) {
        return (
            <View style={[$.root, { paddingTop: ins.top }]}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <View style={$.center}>
                    <Text style={$.emptyTitle}>COMPLETE YOUR{'\n'}FIRST SESSION</Text>
                    <Text style={$.emptySubtext}>Progress data will appear here</Text>
                </View>
            </View>
        );
    }

    // ── Data ────────────────────────────────────────────────────────────
    const avgScore = progress?.avg_form_score ?? 0;
    const bestJump = progress?.best_jump_cm ?? 0;
    const sessions = progress?.session_count ?? 0;
    const bpiDelta = progress?.bpi_delta ?? 0;
    const trendPct = progress?.form_trend_pct ?? 0;
    const trendUp = trendPct >= 0;
    const currentScore = progress?.form_score_trend?.length
        ? progress.form_score_trend[progress.form_score_trend.length - 1].score
        : avgScore;

    const riskData = injuryRisk;
    const riskColor = RISK_COLORS[riskData?.risk] || '#4b5563';

    const rd = readiness;
    const rdColor = rd ? (rd.score >= 65 ? '#22c55e' : rd.score >= 45 ? '#f97316' : '#ef4444') : '#4b5563';

    return (
        <View style={[$.root, { paddingTop: ins.top }]}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />
            <ScrollView showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#333" progressBackgroundColor="#000" colors={['#06b6d4']} />}
            >

                {/* ═══ Header + Period Tabs ═══ */}
                <Fade style={$.topBar}>
                    <Text style={$.brand}>PROGRESS</Text>
                    <View style={$.periodRow}>
                        {PERIODS.map(p => (
                            <Tap key={p.days} onPress={() => setDays(p.days)}>
                                <View style={$.periodTab}>
                                    <Text style={[$.periodText, days === p.days && $.periodTextActive]}>{p.label}</Text>
                                    {days === p.days && <View style={$.periodUnderline} />}
                                </View>
                            </Tap>
                        ))}
                    </View>
                </Fade>

                {/* ═══ Form Trend Hero ═══ */}
                <Fade delay={100} style={$.heroSection}>
                    <Text style={$.sectionLabel}>FORM SCORE</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                        <Text style={[$.heroNumber, { color: '#06b6d4' }]}>{currentScore.toFixed(0)}</Text>
                        <Text style={[$.trendArrow, { color: trendUp ? '#22c55e' : '#ef4444' }]}>
                            {trendUp ? '\u25B2' : '\u25BC'} {Math.abs(trendPct).toFixed(1)}%
                        </Text>
                    </View>
                </Fade>

                {/* ═══ SVG Chart ═══ */}
                <Fade delay={200} style={{ paddingHorizontal: 24 }}>
                    <FormTrendChart data={progress?.form_score_trend} trendPct={trendPct} />
                </Fade>

                {/* ═══ Stats Row ═══ */}
                <Fade delay={300} style={$.statsSection}>
                    <Text style={$.sectionLabel}>STATS</Text>
                    <View style={$.statsRow}>
                        <View style={$.statItem}>
                            <Text style={[$.statNumber, { color: '#06b6d4' }]}>{avgScore.toFixed(1)}</Text>
                            <Text style={$.statLabel}>AVG SCORE</Text>
                        </View>
                        <View style={$.statDivider} />
                        <View style={$.statItem}>
                            <Text style={[$.statNumber, { color: '#f97316' }]}>{bestJump.toFixed(1)}</Text>
                            <Text style={$.statLabel}>BEST JUMP</Text>
                        </View>
                        <View style={$.statDivider} />
                        <View style={$.statItem}>
                            <Text style={[$.statNumber, { color: '#22c55e' }]}>{sessions}</Text>
                            <Text style={$.statLabel}>SESSIONS</Text>
                        </View>
                        <View style={$.statDivider} />
                        <View style={$.statItem}>
                            <Text style={[$.statNumber, { color: bpiDelta >= 0 ? '#22c55e' : '#ef4444' }]}>
                                {bpiDelta >= 0 ? '+' : ''}{bpiDelta}
                            </Text>
                            <Text style={$.statLabel}>BPI DELTA</Text>
                        </View>
                    </View>
                </Fade>

                {/* ═══ Weak Points ═══ */}
                {weakJoints?.weak_joints?.length > 0 && (
                    <Fade delay={400} style={$.section}>
                        <Text style={$.sectionLabel}>WEAK POINTS</Text>
                        {weakJoints.weak_joints.slice(0, 4).map((j, i) => {
                            const outOfRange = j.mean_deg < j.ideal_min || j.mean_deg > j.ideal_max;
                            const dotColor = outOfRange ? '#f97316' : '#22c55e';
                            return (
                                <React.Fragment key={i}>
                                    <View style={$.jointRow}>
                                        <Text style={$.jointName}>{titleCase(j.joint)}</Text>
                                        <Text style={[$.jointDev, { color: dotColor }]}>{j.deviation_deg.toFixed(1)}deg</Text>
                                    </View>
                                    {i < weakJoints.weak_joints.length - 1 && (
                                        <LinearGradient colors={['transparent', '#06b6d4', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1, opacity: 0.2 }} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </Fade>
                )}

                {/* ═══ Injury Risk ═══ */}
                {riskData && (
                    <Fade delay={500} style={$.section}>
                        <Text style={$.sectionLabel}>INJURY RISK</Text>
                        <View style={$.riskRow}>
                            <View style={[$.riskDot, { backgroundColor: riskColor }]} />
                            <Text style={[$.riskBand, { color: riskColor }]}>{(riskData.risk || '').toUpperCase()}</Text>
                            <Text style={$.riskPct}>{riskData.deviation_pct}%</Text>
                        </View>
                        {riskData.reason ? (
                            <Text style={$.riskReason}>{riskData.reason}</Text>
                        ) : null}
                        {riskData.mean_symmetry != null && (
                            <View style={$.riskSymRow}>
                                <Text style={$.riskSymLabel}>SYMMETRY</Text>
                                <Text style={$.riskSymValue}>{(riskData.mean_symmetry * 100).toFixed(1)}%</Text>
                            </View>
                        )}
                    </Fade>
                )}

                {/* ═══ AI Coaching ═══ */}
                {summary?.coaching_note?.bullets?.length > 0 && (
                    <Fade delay={600} style={$.section}>
                        <Text style={[$.sectionLabel, { color: '#06b6d4' }]}>AI COACHING</Text>
                        {summary.coaching_note.bullets.slice(0, 4).map((b, i) => (
                            <View key={i} style={$.bulletRow}>
                                <View style={$.bulletDot} />
                                <Text style={$.bulletText}>{b}</Text>
                            </View>
                        ))}
                    </Fade>
                )}

                {/* ═══ Competition Readiness ═══ */}
                {rd && (
                    <Fade delay={700} style={$.readinessSection}>
                        <Text style={$.sectionLabel}>COMPETITION READINESS</Text>
                        <View style={$.readinessHero}>
                            <View style={$.ringContainer}>
                                <ProgressRing pct={rd.score} color={rdColor} size={120} stroke={6} />
                                <View style={$.ringInner}>
                                    <Text style={[$.readinessNumber, { color: rdColor }]}>{Math.round(rd.score)}</Text>
                                </View>
                            </View>
                            <Text style={[$.readinessBand, { color: rdColor }]}>{(rd.band || '').toUpperCase()}</Text>
                        </View>

                        {rd.components && Object.entries(rd.components).map(([key, comp]) => {
                            const pct = comp.value || 0;
                            const barColor = pct >= 70 ? '#22c55e' : pct >= 50 ? '#f97316' : '#ef4444';
                            const labels = { form: 'FORM', symmetry: 'SYMMETRY', volume: 'VOLUME', hrv: 'RECOVERY' };
                            return (
                                <View key={key} style={$.compRow}>
                                    <Text style={$.compLabel}>{labels[key] || key.toUpperCase()}</Text>
                                    <View style={$.compBarBg}>
                                        <View style={[$.compBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                                    </View>
                                    <Text style={[$.compPct, { color: barColor }]}>{Math.round(pct)}</Text>
                                </View>
                            );
                        })}
                    </Fade>
                )}

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
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 12, marginBottom: 8 },
    brand: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 3 },

    // Period tabs
    periodRow: { flexDirection: 'row', gap: 20 },
    periodTab: { alignItems: 'center', paddingVertical: 4 },
    periodText: { fontSize: 13, fontWeight: '700', color: '#4b5563', letterSpacing: 2 },
    periodTextActive: { color: '#fff' },
    periodUnderline: { width: 20, height: 2, backgroundColor: '#06b6d4', marginTop: 4, borderRadius: 1 },

    // Hero
    heroSection: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8 },
    heroNumber: { fontSize: 64, fontWeight: '900', fontFamily: FONT_CONDENSED, lineHeight: 68 },
    trendArrow: { fontSize: 16, fontWeight: '800', fontFamily: FONT_CONDENSED, marginLeft: 12, marginBottom: 10 },

    // Section
    section: { paddingHorizontal: 24, marginBottom: 32 },
    sectionLabel: { fontSize: 11, fontWeight: '800', color: '#4b5563', letterSpacing: 3, marginBottom: 16 },

    // Stats row
    statsSection: { paddingHorizontal: 24, marginBottom: 32 },
    statsRow: { flexDirection: 'row', alignItems: 'center' },
    statItem: { flex: 1, alignItems: 'center' },
    statNumber: { fontSize: 22, fontWeight: '800', fontFamily: FONT_CONDENSED },
    statLabel: { fontSize: 9, fontWeight: '600', color: '#4b5563', letterSpacing: 2, marginTop: 4 },
    statDivider: { width: 1, height: 32, backgroundColor: '#1a1a1a', opacity: 0.6 },

    // Weak joints
    jointRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    jointName: { fontSize: 14, fontWeight: '600', color: '#fff' },
    jointDev: { fontSize: 16, fontWeight: '800', fontFamily: FONT_CONDENSED },
    divider: { height: 1, backgroundColor: '#1a1a1a' },

    // Injury risk
    riskRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    riskDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
    riskBand: { fontSize: 18, fontWeight: '900', fontFamily: FONT_CONDENSED, letterSpacing: 2 },
    riskPct: { fontSize: 14, fontWeight: '700', color: '#4b5563', fontFamily: FONT_CONDENSED, marginLeft: 'auto' },
    riskReason: { fontSize: 13, fontWeight: '500', color: '#6b7280', lineHeight: 20 },
    riskSymRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
    riskSymLabel: { fontSize: 9, fontWeight: '800', color: '#4b5563', letterSpacing: 2 },
    riskSymValue: { fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: FONT_CONDENSED, marginLeft: 10 },

    // Coaching bullets
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#06b6d4', marginTop: 7, marginRight: 12 },
    bulletText: { fontSize: 14, fontWeight: '500', color: '#d1d5db', flex: 1, lineHeight: 21 },

    // Competition readiness
    readinessSection: { paddingHorizontal: 24, marginBottom: 32 },
    readinessHero: { alignItems: 'center', marginBottom: 24 },
    ringContainer: { marginBottom: 8 },
    ringInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    readinessNumber: { fontSize: 36, fontWeight: '900', fontFamily: FONT_CONDENSED },
    readinessBand: { fontSize: 11, fontWeight: '800', letterSpacing: 3 },
    compRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    compLabel: { width: 80, fontSize: 10, fontWeight: '700', color: '#4b5563', letterSpacing: 1 },
    compBarBg: { flex: 1, height: 3, backgroundColor: '#111', borderRadius: 2, overflow: 'hidden', marginHorizontal: 10 },
    compBarFill: { height: 3, borderRadius: 2 },
    compPct: { width: 28, fontSize: 13, fontWeight: '800', fontFamily: FONT_CONDENSED, textAlign: 'right' },

    // States
    loadingText: { fontSize: 11, fontWeight: '800', color: '#4b5563', letterSpacing: 3, marginTop: 16 },
    errorText: { fontSize: 15, fontWeight: '700', color: '#ef4444', letterSpacing: 2, marginBottom: 20 },
    retryRow: { flexDirection: 'row', alignItems: 'center' },
    retryText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 2 },
    retryArrow: { fontSize: 22, color: '#4b5563', fontWeight: '300', marginLeft: 8 },
    emptyTitle: { fontSize: 28, fontWeight: '900', color: '#fff', fontFamily: FONT_CONDENSED, textAlign: 'center', letterSpacing: 2, lineHeight: 34 },
    emptySubtext: { fontSize: 13, fontWeight: '500', color: '#4b5563', marginTop: 12 },
});
