// TrainingPlanScreen — Nike-inspired. Pure black canvas. Bold typography IS the design.
// No cards. No borders. No containers. Content floats on black.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Pressable, Animated,
    Platform, ActivityIndicator, Alert, RefreshControl, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../context/UserContext';
import api from '../services/api';

const FONT_CONDENSED = Platform.OS === 'android' ? 'sans-serif-condensed' : 'HelveticaNeue-CondensedBold';

const TYPE_COLORS = {
    strength:  '#f97316',
    power:     '#ef4444',
    speed:     '#facc15',
    technique: '#06b6d4',
    recovery:  '#22c55e',
    rest:      '#4b5563',
};

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

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function TrainingPlanScreen({ navigation }) {
    const ins = useSafeAreaInsets();
    const { userData } = useUser();
    const athleteId = userData?.avatarId || 'athlete_01';

    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [completing, setCompleting] = useState(null);

    const today = new Date().toISOString().slice(0, 10);

    const fetchPlan = useCallback(async () => {
        const data = await api.getWeeklyPlan(athleteId);
        if (data) setPlan(data);
        setLoading(false);
    }, [athleteId]);

    useEffect(() => { fetchPlan(); }, [fetchPlan]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchPlan();
        setRefreshing(false);
    }, [fetchPlan]);

    const handleRegenerate = useCallback(async () => {
        Alert.alert(
            'Regenerate Plan',
            'This will create a fresh plan based on your latest data. Days already completed stay marked.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Regenerate',
                    onPress: async () => {
                        setLoading(true);
                        const data = await api.regeneratePlan(athleteId);
                        if (data) setPlan(data);
                        setLoading(false);
                    },
                },
            ],
        );
    }, [athleteId]);

    const handleComplete = useCallback(async (dateStr) => {
        setCompleting(dateStr);
        const result = await api.completePlanDay(athleteId, dateStr);
        if (result) {
            await fetchPlan();
        }
        setCompleting(null);
    }, [athleteId, fetchPlan]);

    // ── Loading ─────────────────────────────────────────────────────────
    if (loading && !plan) {
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

    // ── Error / empty ───────────────────────────────────────────────────
    if (!plan) {
        return (
            <View style={[$.root, { paddingTop: ins.top }]}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <View style={$.center}>
                    <Text style={$.errorText}>COULD NOT LOAD PLAN</Text>
                    <Tap onPress={fetchPlan} style={$.retryRow}>
                        <Text style={$.retryText}>RETRY</Text>
                        <Text style={$.retryArrow}>›</Text>
                    </Tap>
                </View>
            </View>
        );
    }

    const days = plan.days || [];

    return (
        <View style={[$.root, { paddingTop: ins.top }]}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" colors={['#06b6d4']} />}
            >

                {/* ═══ Header ═══ */}
                <Fade style={$.topBar}>
                    <View>
                        <Text style={$.brand}>TRAINING PLAN</Text>
                        <Text style={$.weekRange}>{plan.week_start} — {plan.week_end}</Text>
                    </View>
                    <Tap onPress={handleRegenerate}>
                        <Text style={$.regenText}>REGEN ›</Text>
                    </Tap>
                </Fade>

                {/* ═══ Summary + Adherence ═══ */}
                <Fade delay={100} style={$.summarySection}>
                    {plan.summary ? <Text style={$.summaryText}>{plan.summary}</Text> : null}
                    <View style={$.adherenceRow}>
                        <Text style={$.adherenceLabel}>ADHERENCE</Text>
                        <Text style={[$.adherenceValue, {
                            color: (plan.adherence_pct || 0) >= 80 ? '#22c55e' : (plan.adherence_pct || 0) >= 50 ? '#f97316' : '#ef4444'
                        }]}>{plan.adherence_pct || 0}%</Text>
                    </View>
                </Fade>

                {/* ═══ Day Sections ═══ */}
                {days.map((day, idx) => {
                    const color = TYPE_COLORS[day.type] || '#4b5563';
                    const isToday = day.date === today;

                    return (
                        <Fade key={day.date} delay={200 + idx * 80} style={$.daySection}>
                            {/* Day header */}
                            <View style={$.dayHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={[$.typeDot, { backgroundColor: color }]} />
                                    <Text style={$.dayName}>{day.day_name?.toUpperCase()}</Text>
                                    {isToday && <Text style={$.todayBadge}>TODAY</Text>}
                                    {day.completed && <Text style={$.doneBadge}>DONE</Text>}
                                </View>
                                <Text style={$.dayDate}>{day.date}</Text>
                            </View>

                            {/* Type label */}
                            <Text style={[$.typeLabel, { color }]}>{day.label}</Text>

                            {/* Meta */}
                            {day.type !== 'rest' && (
                                <Text style={$.dayMeta}>RPE {day.rpe}  ·  {day.duration_min} MIN</Text>
                            )}

                            {/* Rationale */}
                            {day.rationale ? (
                                <Text style={$.rationaleText}>{day.rationale}</Text>
                            ) : null}

                            {/* Drills */}
                            {day.drills?.length > 0 && (
                                <View style={$.drillsBlock}>
                                    {day.drills.map((drill, i) => (
                                        <View key={i} style={$.drillRow}>
                                            <Text style={[$.drillSets, { color }]}>{drill.sets}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={$.drillName}>{drill.name}</Text>
                                                {drill.cue ? <Text style={$.drillCue}>{drill.cue}</Text> : null}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Complete action */}
                            {!day.completed && day.type !== 'rest' && (
                                <>
                                    <View style={$.divider} />
                                    <Tap onPress={() => handleComplete(day.date)} style={$.actionRow}>
                                        <Text style={[$.actionTitle, { color }]}>MARK COMPLETE</Text>
                                        <Text style={$.actionArrow}>›</Text>
                                    </Tap>
                                </>
                            )}

                            {/* Bottom divider between days */}
                            <View style={$.thickDivider} />
                        </Fade>
                    );
                })}

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
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 24, paddingTop: 12, marginBottom: 24 },
    brand: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 3 },
    weekRange: { fontSize: 12, fontWeight: '600', color: '#4b5563', marginTop: 4, fontFamily: FONT_CONDENSED, letterSpacing: 1 },
    regenText: { fontSize: 12, fontWeight: '700', color: '#06b6d4', letterSpacing: 1 },

    // Summary
    summarySection: { paddingHorizontal: 24, marginBottom: 32 },
    summaryText: { fontSize: 14, fontWeight: '500', color: '#6b7280', lineHeight: 21, marginBottom: 16 },
    adherenceRow: { flexDirection: 'row', alignItems: 'center' },
    adherenceLabel: { fontSize: 9, fontWeight: '800', color: '#4b5563', letterSpacing: 2, marginRight: 10 },
    adherenceValue: { fontSize: 22, fontWeight: '900', fontFamily: FONT_CONDENSED },

    // Day section
    daySection: { paddingHorizontal: 24, marginBottom: 0 },
    dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    typeDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
    dayName: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 3, fontFamily: FONT_CONDENSED },
    dayDate: { fontSize: 11, fontWeight: '600', color: '#374151', fontFamily: FONT_CONDENSED },
    todayBadge: { fontSize: 9, fontWeight: '800', color: '#06b6d4', letterSpacing: 2, marginLeft: 10 },
    doneBadge: { fontSize: 9, fontWeight: '800', color: '#22c55e', letterSpacing: 2, marginLeft: 10 },

    typeLabel: { fontSize: 18, fontWeight: '800', fontFamily: FONT_CONDENSED, marginBottom: 4 },
    dayMeta: { fontSize: 11, fontWeight: '700', color: '#4b5563', letterSpacing: 2, marginBottom: 10 },

    rationaleText: { fontSize: 13, fontWeight: '400', color: '#6b7280', fontStyle: 'italic', lineHeight: 20, marginBottom: 12 },

    // Drills
    drillsBlock: { marginBottom: 8 },
    drillRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
    drillSets: { fontFamily: FONT_CONDENSED, fontSize: 12, fontWeight: '700', minWidth: 65, letterSpacing: 1 },
    drillName: { fontSize: 13, fontWeight: '600', color: '#d1d5db', marginBottom: 2 },
    drillCue: { fontSize: 11, fontWeight: '400', color: '#4b5563' },

    // Action row
    divider: { height: 1, backgroundColor: '#1a1a1a' },
    thickDivider: { height: 1, backgroundColor: '#1a1a1a', marginTop: 20, marginBottom: 24 },
    actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
    actionTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 2 },
    actionArrow: { fontSize: 22, color: '#4b5563', fontWeight: '300' },

    // States
    loadingText: { fontSize: 11, fontWeight: '800', color: '#4b5563', letterSpacing: 3, marginTop: 16 },
    errorText: { fontSize: 15, fontWeight: '700', color: '#ef4444', letterSpacing: 2, marginBottom: 20 },
    retryRow: { flexDirection: 'row', alignItems: 'center' },
    retryText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 2 },
    retryArrow: { fontSize: 22, color: '#4b5563', fontWeight: '300', marginLeft: 8 },
});
