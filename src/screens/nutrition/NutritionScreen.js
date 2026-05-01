// NutritionScreen — WN-15 (daily meal overview) + WN-18 (quick add)
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    SafeAreaView, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { C } from '../../styles/colors';
import api from '../../services/api';
import { getOrCreateAnonymousAthleteId } from '../../services/deviceIdentity';
import ProgressRing from '../../components/ProgressRing';

const tap = () => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} };

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

function fmtDate(d) {
    const today = new Date().toISOString().slice(0, 10);
    if (d === today) return 'Today';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getMealCTA() {
    const hour = new Date().getHours();
    if (hour < 12) return 'breakfast';
    if (hour < 16) return 'lunch';
    if (hour < 20) return 'dinner';
    return 'snack';
}

function dateAdd(d, days) {
    const dt = new Date(d + 'T00:00:00');
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0, 10);
}

export default function NutritionScreen({ navigation, route }) {
    const [athleteId, setAthleteId] = useState(route.params?.athleteId || null);
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [meals, setMeals] = useState({});
    const [summary, setSummary] = useState(null);
    const [recentMeals, setRecentMeals] = useState({});
    const [sportTips, setSportTips] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [expanded, setExpanded] = useState({ breakfast: true, lunch: true, dinner: true, snack: true });

    useEffect(() => {
        if (!athleteId) {
            getOrCreateAnonymousAthleteId().then(setAthleteId).catch(() => {});
        }
    }, []);

    const loadData = useCallback(async (id, d) => {
        if (!id) return;
        setLoading(true);
        setError(false);
        try {
            const [mealsRes, summaryRes, athleteRes] = await Promise.all([
                api.get(`/athlete/${id}/meals?date=${d}`),
                api.get(`/athlete/${id}/nutrition/summary?on_date=${d}`),
                api.get(`/athlete/${id}`),
            ]);
            setMeals(mealsRes?.meals || {});
            setSummary(summaryRes);
            const sport = athleteRes?.sport;
            if (sport) {
                try {
                    const tips = await api.get(`/foods/tips/${sport}`);
                    setSportTips(tips);
                } catch {}
            }
        } catch (e) {
            console.warn('[NutritionScreen] load error', e);
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (athleteId) loadData(athleteId, date); }, [athleteId, date, loadData]);

    useEffect(() => {
        (async () => {
            const recent = {};
            for (const slot of SLOTS) {
                try {
                    const raw = await AsyncStorage.getItem(`@recent_meals_${slot}`);
                    recent[slot] = raw ? JSON.parse(raw) : [];
                } catch { recent[slot] = []; }
            }
            setRecentMeals(recent);
        })();
    }, [date]);

    const handleDelete = async (slot) => {
        try {
            await api.delete(`/athlete/${athleteId}/meals/${date}/${slot}`);
            loadData();
        } catch (e) { console.warn('[NutritionScreen] delete error', e); }
    };

    const goals = summary?.goals || {};
    const pct = summary?.pct_of_goal || {};
    const consumed = {
        calories: summary?.calories || 0,
        protein_g: summary?.protein_g || 0,
        carbs_g: summary?.carbs_g || 0,
        fat_g: summary?.fat_g || 0,
    };
    const today = new Date().toISOString().slice(0, 10);

    return (
        <SafeAreaView style={s.safe}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={s.title}>Nutrition</Text>
                <View style={{ width: 60 }} />
            </View>

            <View style={s.dateNav}>
                <TouchableOpacity onPress={() => setDate(d => dateAdd(d, -1))} style={s.navBtn}>
                    <Text style={s.navArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={s.dateLabel}>{fmtDate(date)}</Text>
                <TouchableOpacity onPress={() => setDate(d => dateAdd(d, 1))} disabled={date === today} style={s.navBtn}>
                    <Text style={[s.navArrow, date === today && { opacity: 0.3 }]}>›</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator color={C.cyan} style={{ marginTop: 40 }} />
            ) : error ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                    <Text style={{ color: C.muted, fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
                        Could not load nutrition data.
                    </Text>
                    <TouchableOpacity onPress={() => athleteId && loadData(athleteId, date)} style={{ backgroundColor: C.cyan, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
                        <Text style={{ color: '#FBFBF8', fontWeight: '700' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: 14 }}>
                    {/* Summary or empty state */}
                    {Object.values(meals).some(m => (m?.items || []).length > 0) ? (
                        <View style={s.summaryCard}>
                            <Text style={s.summaryTitle}>
                                {Math.round(consumed.calories)} / {goals.calories || 2400} kcal
                            </Text>
                            <View style={s.ringsRow}>
                                <ProgressRing value={pct.calories || 0} size={68} strokeWidth={7} label={`${pct.calories || 0}%`} sublabel="Cal" />
                                <ProgressRing value={pct.protein_g || 0} size={58} strokeWidth={6} color="#8b5cf6" label={`${Math.round(consumed.protein_g)}g`} sublabel="Protein" />
                                <ProgressRing value={pct.carbs_g || 0} size={58} strokeWidth={6} color="#f59e0b" label={`${Math.round(consumed.carbs_g)}g`} sublabel="Carbs" />
                                <ProgressRing value={pct.fat_g || 0} size={58} strokeWidth={6} color="#ef4444" label={`${Math.round(consumed.fat_g)}g`} sublabel="Fat" />
                            </View>
                        </View>
                    ) : (
                        <View style={s.emptyStateCard}>
                            <Text style={s.emptyStateTitle}>Log a meal to see your macros trend through the day.</Text>
                            <TouchableOpacity
                                style={s.emptyStateCTA}
                                onPress={() => {
                                    tap();
                                    const slot = getMealCTA();
                                    navigation.navigate('MealLog', { athleteId, date, slot });
                                }}
                            >
                                <Text style={s.emptyStateCTAText}>Log {SLOT_LABELS[getMealCTA()]}</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Meal slots */}
                    {SLOTS.map(slot => {
                        const slotData = meals[slot];
                        const items = slotData?.items || [];
                        const slotCals = Math.round(slotData?.total?.calories || 0);
                        const isExpanded = expanded[slot];
                        const recents = recentMeals[slot] || [];
                        return (
                            <View key={slot} style={s.slotCard}>
                                <TouchableOpacity style={s.slotHeader} onPress={() => setExpanded(e => ({ ...e, [slot]: !e[slot] }))}>
                                    <Text style={s.slotName}>{SLOT_LABELS[slot]}</Text>
                                    <Text style={s.slotCals}>{slotCals > 0 ? `${slotCals} kcal` : '—'}</Text>
                                    <Text style={s.slotChevron}>{isExpanded ? '▲' : '▼'}</Text>
                                </TouchableOpacity>
                                {isExpanded && (
                                    <>
                                        {items.length === 0 ? (
                                            <Text style={s.emptySlot}>No meals logged. Tap + to add.</Text>
                                        ) : (
                                            items.map((item, i) => (
                                                <View key={i} style={s.foodRow}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={s.foodName}>{item.food_name}</Text>
                                                        <Text style={s.foodMeta}>{item.qty_g}g · {Math.round(item.macros?.calories || 0)} kcal</Text>
                                                    </View>
                                                    {i === items.length - 1 && (
                                                        <TouchableOpacity onPress={() => handleDelete(slot)} style={s.deleteBtn}>
                                                            <Text style={s.deleteText}>Remove</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            ))
                                        )}
                                        <TouchableOpacity style={s.addFoodBtn} onPress={() => { tap(); navigation.navigate('MealLog', { athleteId, date, slot }); }}>
                                            <Text style={s.addFoodText}>+ Add Food</Text>
                                        </TouchableOpacity>
                                        {recents.length > 0 && (
                                            <View style={s.quickAddSection}>
                                                <Text style={s.quickAddTitle}>Quick Add</Text>
                                                {recents.slice(0, 3).map((r, i) => (
                                                    <TouchableOpacity key={i} style={s.quickAddRow}
                                                        onPress={() => navigation.navigate('MealLog', { athleteId, date, slot, quickFoodId: r.food_id, quickQty: r.qty_g })}>
                                                        <Text style={s.quickAddLabel} numberOfLines={1}>{r.label} · {r.calories} kcal</Text>
                                                        <Text style={s.quickAddPlus}>+</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        )}
                                    </>
                                )}
                            </View>
                        );
                    })}

                    <TouchableOpacity style={s.goalsLink} onPress={() => { tap(); navigation.navigate('NutritionGoals', { athleteId }); }}>
                        <Text style={s.goalsLinkText}>Set Custom Goals →</Text>
                    </TouchableOpacity>

                    {/* Sport-specific nutrition tips */}
                    {sportTips && (
                        <View style={s.tipsCard}>
                            <Text style={s.tipsTitle}>
                                {sportTips.sport?.replace(/_/g, ' ').toUpperCase()} NUTRITION
                            </Text>
                            <Text style={s.tipsFocus}>{sportTips.focus}</Text>

                            <Text style={s.tipsSectionLabel}>Pre-workout</Text>
                            <View style={s.tipsRow}>
                                {(sportTips.pre_workout || []).map((f, i) => (
                                    <View key={i} style={s.tipsPill}><Text style={s.tipsPillText}>{f}</Text></View>
                                ))}
                            </View>

                            <Text style={s.tipsSectionLabel}>Post-workout</Text>
                            <View style={s.tipsRow}>
                                {(sportTips.post_workout || []).map((f, i) => (
                                    <View key={i} style={[s.tipsPill, s.tipsPillGreen]}><Text style={[s.tipsPillText, { color: '#10b981' }]}>{f}</Text></View>
                                ))}
                            </View>

                            {(sportTips.avoid || []).length > 0 && (
                                <>
                                    <Text style={s.tipsSectionLabel}>Avoid</Text>
                                    {sportTips.avoid.map((a, i) => (
                                        <Text key={i} style={s.tipsAvoidText}>• {a}</Text>
                                    ))}
                                </>
                            )}
                        </View>
                    )}

                    <View style={{ height: 16 }} />
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
    backBtn: { width: 60 },
    backText: { color: C.cyan, fontSize: 14 },
    title: { color: C.text, fontSize: 18, fontWeight: '700' },
    dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingBottom: 6 },
    navBtn: { padding: 8 },
    navArrow: { color: C.cyan, fontSize: 26, fontWeight: '700' },
    dateLabel: { color: C.text, fontSize: 15, fontWeight: '600', minWidth: 100, textAlign: 'center' },
    summaryCard: { backgroundColor: C.surf, borderRadius: 14, padding: 16, marginBottom: 12 },
    summaryTitle: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
    ringsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
    slotCard: { backgroundColor: C.surf, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
    slotHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    slotName: { flex: 1, color: C.text, fontSize: 15, fontWeight: '600' },
    slotCals: { color: C.cyan, fontSize: 13, fontWeight: '600', marginRight: 8 },
    slotChevron: { color: C.muted, fontSize: 11 },
    emptySlot: { color: C.muted, fontSize: 13, padding: 12, paddingTop: 4 },
    foodRow: { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: C.border },
    foodName: { color: C.text, fontSize: 13, fontWeight: '500' },
    foodMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
    deleteBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    deleteText: { color: C.red, fontSize: 12, fontWeight: '600' },
    addFoodBtn: { margin: 10, backgroundColor: 'rgba(6,182,212,0.08)', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)', borderStyle: 'dashed' },
    addFoodText: { color: C.cyan, fontSize: 13, fontWeight: '600' },
    quickAddSection: { paddingHorizontal: 10, paddingBottom: 10 },
    quickAddTitle: { color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    quickAddRow: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 6, marginBottom: 4 },
    quickAddLabel: { flex: 1, color: C.textSub, fontSize: 12 },
    quickAddPlus: { color: C.cyan, fontSize: 20, fontWeight: '700', marginLeft: 8 },
    goalsLink: { alignItems: 'center', padding: 16 },
    goalsLinkText: { color: C.cyan, fontSize: 13, fontWeight: '600' },
    emptyStateCard: { backgroundColor: C.surf, borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 12 },
    emptyStateTitle: { color: C.muted, fontSize: 15, lineHeight: 22, marginBottom: 16, textAlign: 'center' },
    emptyStateCTA: { backgroundColor: C.cyan, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
    emptyStateCTAText: { color: C.bg, fontSize: 14, fontWeight: '700' },
    tipsCard: { backgroundColor: C.surf, borderRadius: 14, padding: 16, marginBottom: 12 },
    tipsTitle: { color: C.cyan, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
    tipsFocus: { color: C.textSub, fontSize: 12, marginBottom: 12, lineHeight: 17 },
    tipsSectionLabel: { color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 8 },
    tipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tipsPill: { backgroundColor: 'rgba(252,76,2,0.08)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    tipsPillGreen: { backgroundColor: 'rgba(16,185,129,0.08)' },
    tipsPillText: { color: C.cyan, fontSize: 12, fontWeight: '500' },
    tipsAvoidText: { color: C.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
});
