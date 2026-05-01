// ChallengesScreen — daily micro-challenges per sport
// Generates a fresh set of 3 challenges every day from the athlete's sport.
// Completion is persisted locally in AsyncStorage keyed by date so progress
// survives app restarts without a backend round-trip.
import React, { useCallback, useEffect, useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { getOrCreateAnonymousAthleteId } from '../../services/deviceIdentity';

const BG      = '#FBFBF8';
const SURFACE = '#FFFFFF';
const ACCENT  = '#FC4C02';
const TEXT    = '#242428';
const MUTED   = '#9CA3AF';
const SUCCESS = '#10b981';
const BORDER  = '#E6E6EA';

const tap = () => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} };
const tick = () => { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {} };

const TODAY = new Date().toISOString().slice(0, 10);
const STORAGE_KEY = `@challenges_${TODAY}`;

// Fallback challenges when backend is unavailable
const FALLBACK_CHALLENGES: Record<string, Array<{id: string; title: string; reps: string; xp: number}>> = {
    vertical_jump: [
        { id: 'vj_1', title: 'Box Jump Warm-Up', reps: '3 × 5 reps', xp: 50 },
        { id: 'vj_2', title: 'Broad Jump Distance', reps: '3 attempts, max distance', xp: 75 },
        { id: 'vj_3', title: 'Single-Leg Calf Raise Finisher', reps: '2 × 20 each side', xp: 40 },
    ],
    sprint: [
        { id: 'sp_1', title: '30 m Acceleration Run', reps: '4 × 30 m', xp: 60 },
        { id: 'sp_2', title: 'High Knees Drill', reps: '3 × 20 m', xp: 40 },
        { id: 'sp_3', title: 'Bounding Strides', reps: '3 × 30 m', xp: 50 },
    ],
    squat: [
        { id: 'sq_1', title: 'Goblet Squat Depth Hold', reps: '3 × 8, 3 s pause', xp: 55 },
        { id: 'sq_2', title: 'Jump Squat Power Set', reps: '4 × 6 reps', xp: 70 },
        { id: 'sq_3', title: 'Wall Sit Endurance', reps: '3 × 45 s', xp: 45 },
    ],
    push_up: [
        { id: 'pu_1', title: 'Tempo Push-Up Set', reps: '3 × 10 (3-1-1)', xp: 50 },
        { id: 'pu_2', title: 'Wide-Grip Burnout', reps: 'Max reps × 2 sets', xp: 65 },
        { id: 'pu_3', title: 'Pike Push-Up Shoulder Prep', reps: '3 × 8', xp: 40 },
    ],
    pull_up: [
        { id: 'pl_1', title: 'Dead Hang Hold', reps: '3 × 30 s', xp: 40 },
        { id: 'pl_2', title: 'Negative Pull-Ups', reps: '3 × 5 (5 s descent)', xp: 70 },
        { id: 'pl_3', title: 'Scapular Pull-Ups', reps: '3 × 10', xp: 45 },
    ],
    snatch: [
        { id: 'sn_1', title: 'Overhead Squat Mobility', reps: '3 × 5 (light)', xp: 50 },
        { id: 'sn_2', title: 'Hang Pull Technique', reps: '4 × 4', xp: 65 },
        { id: 'sn_3', title: 'Pause Squat Strength', reps: '3 × 5 (3 s hold)', xp: 55 },
    ],
    cricket_bat: [
        { id: 'cb_1', title: 'Shadow Cover Drive (L+R)', reps: '3 × 20 swings each', xp: 45 },
        { id: 'cb_2', title: 'Tee Batting Front Foot', reps: '3 × 15 hits', xp: 60 },
        { id: 'cb_3', title: 'Throw-Down Off-Spin Reading', reps: '20 deliveries', xp: 55 },
    ],
    javelin: [
        { id: 'jv_1', title: 'Med-Ball Rotation Throws', reps: '3 × 8 each side', xp: 60 },
        { id: 'jv_2', title: 'Standing Release Drill', reps: '3 × 10 releases', xp: 50 },
        { id: 'jv_3', title: 'Step-Step-Throw Sequence', reps: '3 × 6', xp: 65 },
    ],
};

function ChallengeCard({ challenge, completed, onToggle }) {
    return (
        <TouchableOpacity
            style={[s.card, completed && s.cardDone]}
            onPress={() => { tap(); onToggle(challenge.id); }}
            activeOpacity={0.75}
        >
            <View style={s.cardLeft}>
                <View style={[s.checkbox, completed && s.checkboxDone]}>
                    {completed && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[s.challengeTitle, completed && s.textDone]}>{challenge.title}</Text>
                    <Text style={s.reps}>{challenge.reps}</Text>
                </View>
            </View>
            <View style={[s.xpBadge, completed && s.xpBadgeDone]}>
                <Text style={[s.xpText, completed && s.xpTextDone]}>+{challenge.xp} XP</Text>
            </View>
        </TouchableOpacity>
    );
}

export default function ChallengesScreen({ navigation, route }) {
    const [athleteId, setAthleteId] = useState(route.params?.athleteId || null);
    const [sport, setSport] = useState(route.params?.sport || null);
    const [challenges, setChallenges] = useState([]);
    const [completed, setCompleted] = useState({});
    const [loading, setLoading] = useState(true);
    const [totalXp, setTotalXp] = useState(0);

    useEffect(() => {
        if (!athleteId) {
            getOrCreateAnonymousAthleteId().then(setAthleteId).catch(() => {});
        }
    }, []);

    const loadChallenges = useCallback(async (id, sportKey) => {
        setLoading(true);
        try {
            const athlete = await api.get(`/athlete/${id}`);
            const activeSport = sportKey || athlete?.sport || 'vertical_jump';
            setSport(activeSport);

            // Try to get drills from backend intelligence endpoint
            let drills = null;
            try {
                const insightsRes = await api.get(`/athlete/${id}/insights`);
                const backendDrills = insightsRes?.coaching?.drills;
                if (backendDrills && backendDrills.length >= 3) {
                    drills = backendDrills.map((d, i) => ({
                        id: `backend_${i}`,
                        title: d.drill,
                        reps: d.focus,
                        xp: 50 + i * 15,
                    }));
                }
            } catch {}

            const finalChallenges = drills || FALLBACK_CHALLENGES[activeSport] || FALLBACK_CHALLENGES.vertical_jump;
            setChallenges(finalChallenges);

            // Restore saved completions for today
            const raw = await AsyncStorage.getItem(STORAGE_KEY);
            const saved = raw ? JSON.parse(raw) : {};
            setCompleted(saved);
            setTotalXp(finalChallenges.filter(c => saved[c.id]).reduce((sum, c) => sum + c.xp, 0));
        } catch (e) {
            console.warn('[ChallengesScreen] load error', e);
            const fallback = FALLBACK_CHALLENGES[sport || 'vertical_jump'];
            setChallenges(fallback);
        }
        setLoading(false);
    }, [sport]);

    useEffect(() => {
        if (athleteId) loadChallenges(athleteId, sport);
    }, [athleteId]);

    const toggleChallenge = useCallback(async (id) => {
        setCompleted(prev => {
            const next = { ...prev, [id]: !prev[id] };
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
            const earned = challenges.filter(c => next[c.id]).reduce((sum, c) => sum + c.xp, 0);
            setTotalXp(earned);
            if (!prev[id]) tick();
            return next;
        });
    }, [challenges]);

    const allDone = challenges.length > 0 && challenges.every(c => completed[c.id]);

    const handleClaimXp = () => {
        Alert.alert(
            'Challenges Complete!',
            `You earned ${totalXp} XP today. Keep the streak alive!`,
            [{ text: 'Nice!', style: 'default' }],
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={s.safe}>
                <ActivityIndicator size="large" color={ACCENT} style={{ marginTop: 60 }} />
            </SafeAreaView>
        );
    }

    const completedCount = challenges.filter(c => completed[c.id]).length;

    return (
        <SafeAreaView style={s.safe}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={TEXT} />
                </TouchableOpacity>
                <Text style={s.title}>Daily Challenges</Text>
                <View style={s.xpTotal}>
                    <Text style={s.xpTotalText}>{totalXp} XP</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={s.scroll}>
                {/* Progress bar */}
                <View style={s.progressSection}>
                    <View style={s.progressHeader}>
                        <Text style={s.progressLabel}>
                            {completedCount}/{challenges.length} done
                        </Text>
                        <Text style={s.dateLabel}>{new Date(TODAY + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</Text>
                    </View>
                    <View style={s.progressTrack}>
                        <View style={[s.progressFill, { width: `${(completedCount / challenges.length) * 100}%` }]} />
                    </View>
                </View>

                {/* Sport badge */}
                {sport && (
                    <View style={s.sportBadge}>
                        <Text style={s.sportBadgeText}>{sport.replace(/_/g, ' ').toUpperCase()}</Text>
                    </View>
                )}

                {/* Challenge cards */}
                {challenges.map(c => (
                    <ChallengeCard
                        key={c.id}
                        challenge={c}
                        completed={!!completed[c.id]}
                        onToggle={toggleChallenge}
                    />
                ))}

                {/* Claim button when all done */}
                {allDone && (
                    <TouchableOpacity style={s.claimBtn} onPress={handleClaimXp} activeOpacity={0.8}>
                        <Ionicons name="trophy" size={20} color="#fff" />
                        <Text style={s.claimText}>Claim {totalXp} XP</Text>
                    </TouchableOpacity>
                )}

                <View style={{ height: 32 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: BG },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 18, fontWeight: '700', color: TEXT },
    xpTotal: { backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    xpTotalText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    scroll: { padding: 16 },
    progressSection: { marginBottom: 16 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    progressLabel: { color: TEXT, fontWeight: '600', fontSize: 14 },
    dateLabel: { color: MUTED, fontSize: 12 },
    progressTrack: { height: 6, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 3 },
    sportBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(252,76,2,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 14 },
    sportBadgeText: { color: ACCENT, fontWeight: '700', fontSize: 11, letterSpacing: 1 },
    card: { backgroundColor: SURFACE, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: BORDER },
    cardDone: { opacity: 0.65, borderColor: SUCCESS },
    cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    checkbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: MUTED, alignItems: 'center', justifyContent: 'center' },
    checkboxDone: { backgroundColor: SUCCESS, borderColor: SUCCESS },
    challengeTitle: { color: TEXT, fontWeight: '600', fontSize: 14 },
    textDone: { textDecorationLine: 'line-through', color: MUTED },
    reps: { color: MUTED, fontSize: 12, marginTop: 2 },
    xpBadge: { backgroundColor: 'rgba(252,76,2,0.1)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    xpBadgeDone: { backgroundColor: 'rgba(16,185,129,0.1)' },
    xpText: { color: ACCENT, fontWeight: '700', fontSize: 12 },
    xpTextDone: { color: SUCCESS },
    claimBtn: { backgroundColor: SUCCESS, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
    claimText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
