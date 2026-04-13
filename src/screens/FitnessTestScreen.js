// FitnessTestScreen — Standardised Fitness Assessment
// Tests: BMI (height + weight), Sit & Reach (flexibility), 600M Run/Walk (stamina)
// Scoring: L1 (Work Harder) → L7 (Excellent) matching the Fit India framework
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TextInput, Animated, Dimensions, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tap } from '../ui';
import { C, LEVEL_COLORS, LEVEL_LABELS } from '../styles/colors';
import { computeFitnessScore, FITNESS_TEST_BANDS } from '../data/constants';
import { useUser } from '../context/UserContext';
import api from '../services/api';

const HISTORY_KEY = '@fitness_test_history';
const { width: SW } = Dimensions.get('window');

// ─── L1–L7 Band Indicator ─────────────────────────────────────────────────────
function LevelBand({ score, level }) {
    return (
        <View style={lb.container}>
            <View style={lb.track}>
                {FITNESS_TEST_BANDS.map((band, i) => {
                    const isActive = level === band.level;
                    return (
                        <View key={band.level} style={[lb.segment, { backgroundColor: band.color, opacity: isActive ? 1 : 0.35 }]}>
                            <Text style={lb.segLabel}>L{band.level}</Text>
                        </View>
                    );
                })}
            </View>
            <View style={lb.scoreRow}>
                <Text style={[lb.scoreNum, { color: LEVEL_COLORS[level] || C.muted }]}>{score}%</Text>
                <Text style={[lb.scoreLabel, { color: LEVEL_COLORS[level] || C.muted }]}>
                    {LEVEL_LABELS[level] || 'Not Scored'}
                </Text>
            </View>
            <View style={lb.legend}>
                {[
                    ['Work Harder', '#ef4444'],
                    ['Must Improve', '#f97316'],
                    ['Can do better', '#eab308'],
                    ['Good', '#84cc16'],
                    ['Very Good', '#22c55e'],
                    ['Athletic', '#06b6d4'],
                    ['Excellent', '#8b5cf6'],
                ].map(([lbl, clr]) => (
                    <View key={lbl} style={lb.legendItem}>
                        <View style={[lb.legendDot, { backgroundColor: clr }]} />
                        <Text style={lb.legendText}>{lbl}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

// ─── Score Component Row ──────────────────────────────────────────────────────
function ScoreComponent({ icon, label, subLabel, points, barColor, recommendation, onRetake }) {
    const barWidth = Math.min(100, points);
    return (
        <View style={sc.compCard}>
            <View style={sc.compHeader}>
                <View style={{ flex: 1 }}>
                    <Text style={sc.compLabel}>{icon} {label}</Text>
                    <Text style={sc.compSubLabel}>{subLabel}</Text>
                </View>
                <View style={[sc.compPts, { backgroundColor: barColor + '25' }]}>
                    <Text style={[sc.compPtsText, { color: barColor }]}>{points} pts</Text>
                </View>
            </View>
            <View style={sc.compBarBg}>
                <View style={[sc.compBarFill, { width: `${barWidth}%`, backgroundColor: barColor }]} />
            </View>
            <Text style={sc.compRec}>{recommendation}</Text>
            {onRetake && (
                <Tap onPress={onRetake}>
                    <Text style={sc.retakeBtn}>Retake Test ↺</Text>
                </Tap>
            )}
        </View>
    );
}

// ─── Timer Component ──────────────────────────────────────────────────────────
function RunTimer({ onTimeSet }) {
    const [running, setRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [done, setDone] = useState(false);
    const interval = useRef(null);

    useEffect(() => {
        return () => { if (interval.current) clearInterval(interval.current); };
    }, []);

    const start = () => {
        setRunning(true);
        setDone(false);
        const t0 = Date.now() - elapsed * 1000;
        interval.current = setInterval(() => {
            setElapsed(Math.floor((Date.now() - t0) / 1000));
        }, 500);
    };

    const stop = () => {
        clearInterval(interval.current);
        setRunning(false);
        setDone(true);
        onTimeSet(elapsed);
    };

    const reset = () => {
        clearInterval(interval.current);
        setRunning(false);
        setDone(false);
        setElapsed(0);
        onTimeSet(0);
    };

    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');

    return (
        <View style={rt.container}>
            <Text style={rt.time}>{mins}:{secs}</Text>
            <View style={rt.btnRow}>
                {!running && !done && (
                    <Tap style={[rt.btn, { backgroundColor: C.green }]} onPress={start}>
                        <Text style={rt.btnText}>START TIMER</Text>
                    </Tap>
                )}
                {running && (
                    <Tap style={[rt.btn, { backgroundColor: C.red }]} onPress={stop}>
                        <Text style={rt.btnText}>STOP</Text>
                    </Tap>
                )}
                {done && (
                    <Tap style={[rt.btn, { backgroundColor: C.muted }]} onPress={reset}>
                        <Text style={rt.btnText}>RESET</Text>
                    </Tap>
                )}
            </View>
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FitnessTestScreen({ navigation }) {
    const ins = useSafeAreaInsets();
    const { userData, updateFitnessScore } = useUser();
    const [step, setStep] = useState('intro'); // intro | bmi | results
    const [saving, setSaving] = useState(false);

    // Inputs
    const [heightCm, setHeightCm]   = useState('');
    const [weightKg, setWeightKg]   = useState('');
    const [reachCm, setReachCm]     = useState('');
    const [runSeconds, setRunSeconds] = useState(0);
    const [runInput, setRunInput]   = useState('');
    const [useTimer, setUseTimer]   = useState(true);

    // Results
    const [results, setResults] = useState(null);

    const bmi = heightCm && weightKg
        ? (parseFloat(weightKg) / Math.pow(parseFloat(heightCm) / 100, 2)).toFixed(1)
        : null;

    const calculate = useCallback(() => {
        const h = parseFloat(heightCm);
        const w = parseFloat(weightKg);
        const r = parseFloat(reachCm);
        const t = runSeconds || parseFloat(runInput) || 0;
        if (!h || !w || !r || !t) return;
        if (h < 50 || h > 250) { Alert.alert('Invalid Input', 'Height must be between 50–250 cm.'); return; }
        if (w < 10 || w > 300) { Alert.alert('Invalid Input', 'Weight must be between 10–300 kg.'); return; }
        if (r < 0 || r > 60)  { Alert.alert('Invalid Input', 'Sit & Reach must be between 0–60 cm.'); return; }
        if (t < 30 || t > 900) { Alert.alert('Invalid Input', 'Run time must be between 30–900 seconds.'); return; }
        const result = computeFitnessScore(w / Math.pow(h / 100, 2), r, t);
        setResults(result);
        setStep('results');
    }, [heightCm, weightKg, reachCm, runSeconds, runInput]);

    const saveResults = useCallback(async () => {
        if (!results) return;
        setSaving(true);
        updateFitnessScore(results.overall, results.level, results.label, results.color);

        // Save history
        try {
            const raw = await AsyncStorage.getItem(HISTORY_KEY);
            const history = raw ? JSON.parse(raw) : [];
            history.unshift({ ...results, date: new Date().toISOString(), name: userData.name });
            if (history.length > 5) history.length = 5;
            await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch (_) {}

        // Also POST to backend (fire and forget)
        api.submitFitnessTest(userData.avatarId, {
            score: results.overall, level: results.level,
            bmi: parseFloat(bmi), sit_reach_cm: parseFloat(reachCm),
            run_600_seconds: runSeconds || parseFloat(runInput),
        });

        setSaving(false);
        navigation.goBack();
    }, [results, bmi, reachCm, runSeconds, runInput, userData, updateFitnessScore, navigation]);

    const bmiCategory = (b) => {
        if (!b) return '';
        const v = parseFloat(b);
        if (v < 18.5) return 'Underweight';
        if (v < 25)   return 'Normal ✓';
        if (v < 30)   return 'Overweight';
        return 'Obese';
    };

    const bandColor = (score) => {
        const b = FITNESS_TEST_BANDS.find(b => score >= b.minScore && score < b.maxScore);
        return b?.color || LEVEL_COLORS[7];
    };

    const recs = {
        bmi:  results?.bmiScore  < 70 ? 'Maintain a balanced diet and track calorie intake.' : 'Great BMI! Keep your current lifestyle habits.',
        flex: results?.flexScore < 50 ? 'You can do stretching, yoga and various sports activities.' : 'Good flexibility. Try advanced yoga poses for improvement.',
        run:  results?.runScore  < 50 ? 'You can do pranayam, cycling, swimming, aerobics, running.' : 'Great stamina! Try interval training to push further.',
    };

    // ── INTRO ────────────────────────────────────────────────────────────
    if (step === 'intro') {
        return (
            <View style={[s.safe, { paddingTop: ins.top, paddingBottom: ins.bottom }]}>
                <View style={s.topbar}>
                    <Tap onPress={() => navigation.goBack()}>
                        <Text style={s.back}>‹ Back</Text>
                    </Tap>
                    <Text style={s.title}>Fitness Test</Text>
                    <View style={{ width: 60 }} />
                </View>
                <ScrollView contentContainerStyle={[s.introContent, { paddingBottom: ins.bottom + 20 }]}>
                    <Text style={s.introEmoji}>🏃</Text>
                    <Text style={s.introTitle}>Take your Fitness Test</Text>
                    <Text style={s.introDesc}>
                        {userData.name}
                    </Text>
                    <Text style={s.introBody}>
                        This standardised test measures your fitness level across three areas — BMI, flexibility, and stamina — and gives you an overall score from L1 to L7.
                    </Text>
                    <View style={s.testList}>
                        {[
                            ['📏', 'BMI', 'Height & Weight measurement'],
                            ['🤸', 'Sit & Reach', 'Flexibility test'],
                            ['🏃', '600M Run/Walk', 'Stamina test'],
                        ].map(([icon, name, desc]) => (
                            <View key={name} style={s.testItem}>
                                <Text style={s.testIcon}>{icon}</Text>
                                <View>
                                    <Text style={s.testName}>{name}</Text>
                                    <Text style={s.testDesc}>{desc}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                    <Tap style={s.startBtn} onPress={() => setStep('bmi')}>
                        <Text style={s.startBtnText}>Start Test →</Text>
                    </Tap>
                </ScrollView>
            </View>
        );
    }

    // ── BMI + FLEXIBILITY + RUN ──────────────────────────────────────────
    if (step === 'bmi') {
        return (
            <View style={[s.safe, { paddingTop: ins.top, paddingBottom: ins.bottom }]}>
                <View style={s.topbar}>
                    <Tap onPress={() => setStep('intro')}>
                        <Text style={s.back}>‹ Back</Text>
                    </Tap>
                    <Text style={s.title}>Take your Fitness Test</Text>
                    <View style={{ width: 60 }} />
                </View>
                <View style={s.userBadge}>
                    <Text style={s.userBadgeText}>👤 {userData.name}</Text>
                </View>
                <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: ins.bottom + 20 }}>

                    {/* BMI */}
                    <View style={s.inputCard}>
                        <View style={s.inputHeader}>
                            <View>
                                <Text style={s.inputTitle}>BMI</Text>
                                <Text style={s.inputSub}>Body Mass Index</Text>
                            </View>
                            <Text style={{ fontSize: 32 }}>🏃</Text>
                        </View>
                        <View style={s.inputRow}>
                            <View style={s.inputGroup}>
                                <Text style={s.inputLabel}>Height (cm)</Text>
                                <TextInput
                                    style={s.input}
                                    keyboardType="decimal-pad"
                                    placeholder="170"
                                    placeholderTextColor={C.muted}
                                    value={heightCm}
                                    onChangeText={setHeightCm}
                                    maxLength={5}
                                />
                            </View>
                            <View style={s.inputGroup}>
                                <Text style={s.inputLabel}>Weight (kg)</Text>
                                <TextInput
                                    style={s.input}
                                    keyboardType="decimal-pad"
                                    placeholder="65"
                                    placeholderTextColor={C.muted}
                                    value={weightKg}
                                    onChangeText={setWeightKg}
                                    maxLength={5}
                                />
                            </View>
                        </View>
                        {bmi && (
                            <View style={s.bmiResult}>
                                <Text style={s.bmiVal}>BMI: {bmi}</Text>
                                <Text style={[s.bmiCat, { color: parseFloat(bmi) >= 18.5 && parseFloat(bmi) < 25 ? C.green : C.orange }]}>
                                    {bmiCategory(bmi)}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Sit & Reach */}
                    <View style={s.inputCard}>
                        <View style={s.inputHeader}>
                            <View>
                                <Text style={s.inputTitle}>Sit and Reach test</Text>
                                <Text style={s.inputSub}>Flexibility</Text>
                            </View>
                            <Text style={{ fontSize: 32 }}>🤸</Text>
                        </View>
                        <Text style={s.inputLabel}>Distance (cm)</Text>
                        <TextInput
                            style={[s.input, { marginTop: 8 }]}
                            keyboardType="decimal-pad"
                            placeholder="13.3"
                            placeholderTextColor={C.muted}
                            value={reachCm}
                            onChangeText={setReachCm}
                            maxLength={5}
                        />
                        <Text style={s.inputHint}>Sit flat on floor, legs straight. Reach forward as far as you can.</Text>
                    </View>

                    {/* 600M Run */}
                    <View style={s.inputCard}>
                        <View style={s.inputHeader}>
                            <View>
                                <Text style={s.inputTitle}>600 MT Run / Walk</Text>
                                <Text style={s.inputSub}>Stamina</Text>
                            </View>
                            <Text style={{ fontSize: 32 }}>🏃</Text>
                        </View>
                        <View style={s.timerToggle}>
                            <Tap
                                style={[s.toggleBtn, useTimer && s.toggleBtnActive]}
                                onPress={() => setUseTimer(true)}
                            >
                                <Text style={[s.toggleText, useTimer && { color: C.bg }]}>Use Timer</Text>
                            </Tap>
                            <Tap
                                style={[s.toggleBtn, !useTimer && s.toggleBtnActive]}
                                onPress={() => setUseTimer(false)}
                            >
                                <Text style={[s.toggleText, !useTimer && { color: C.bg }]}>Enter Time</Text>
                            </Tap>
                        </View>
                        {useTimer ? (
                            <RunTimer onTimeSet={setRunSeconds} />
                        ) : (
                            <>
                                <Text style={s.inputLabel}>Time (seconds)</Text>
                                <TextInput
                                    style={[s.input, { marginTop: 8 }]}
                                    keyboardType="decimal-pad"
                                    placeholder="180"
                                    placeholderTextColor={C.muted}
                                    value={runInput}
                                    onChangeText={setRunInput}
                                    maxLength={5}
                                />
                            </>
                        )}
                    </View>

                    <Tap
                        style={[s.startBtn, { opacity: (heightCm && weightKg && reachCm && (runSeconds > 0 || runInput)) ? 1 : 0.4 }]}
                        onPress={calculate}
                    >
                        <Text style={s.startBtnText}>Calculate Score →</Text>
                    </Tap>
                </ScrollView>
            </View>
        );
    }

    // ── RESULTS ──────────────────────────────────────────────────────────
    return (
        <View style={[s.safe, { paddingTop: ins.top, paddingBottom: ins.bottom }]}>
            <View style={s.topbar}>
                <Tap onPress={() => setStep('bmi')}>
                    <Text style={s.back}>‹ Retake</Text>
                </Tap>
                <Text style={s.title}>Your Results</Text>
                <View style={{ width: 60 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: ins.bottom + 20 }}>

                <Text style={s.overallLabel}>Overall Fitness Score</Text>
                <LevelBand score={results.overall} level={results.level} />

                <ScoreComponent
                    icon="🏃" label="Flexibility" subLabel="Sit and Reach test"
                    points={results.flexScore} barColor={bandColor(results.flexScore)}
                    recommendation={recs.flex}
                    onRetake={() => setStep('bmi')}
                />
                <ScoreComponent
                    icon="⏱️" label="Stamina" subLabel="600 MT Run / Walk"
                    points={results.runScore} barColor={bandColor(results.runScore)}
                    recommendation={recs.run}
                    onRetake={() => setStep('bmi')}
                />
                <ScoreComponent
                    icon="📏" label="BMI" subLabel="Body Mass Index"
                    points={results.bmiScore} barColor={bandColor(results.bmiScore)}
                    recommendation={recs.bmi}
                />

                <Tap
                    style={[s.startBtn, { backgroundColor: saving ? C.muted : results.color }]}
                    onPress={saveResults}
                >
                    <Text style={[s.startBtnText, { color: '#fff' }]}>
                        {saving ? 'Saving…' : 'Save to Profile ✓'}
                    </Text>
                </Tap>

                <Tap style={s.ghostBtn} onPress={() => setStep('bmi')}>
                    <Text style={s.ghostBtnText}>Retake Test ↺</Text>
                </Tap>
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe:         { flex: 1, backgroundColor: C.bg },
    topbar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 12 },
    back:         { color: C.cyan, fontSize: 16, fontWeight: '700' },
    title:        { fontSize: 16, fontWeight: '900', color: C.text },
    userBadge:    { alignSelf: 'center', backgroundColor: C.surf, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 8 },
    userBadgeText:{ fontSize: 12, color: C.text, fontWeight: '700' },
    overallLabel: { fontSize: 16, fontWeight: '900', color: C.text, textAlign: 'center', marginBottom: 16 },

    // Intro
    introContent: { alignItems: 'center', padding: 24, paddingBottom: 40 },
    introEmoji:   { fontSize: 64, marginBottom: 16 },
    introTitle:   { fontSize: 22, fontWeight: '900', color: C.text, marginBottom: 4 },
    introDesc:    { fontSize: 13, color: C.muted, marginBottom: 16 },
    introBody:    { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    testList:     { width: '100%', backgroundColor: C.surf, borderRadius: 18, padding: 16, marginBottom: 24, gap: 14 },
    testItem:     { flexDirection: 'row', alignItems: 'center', gap: 14 },
    testIcon:     { fontSize: 28 },
    testName:     { fontSize: 14, fontWeight: '800', color: C.text },
    testDesc:     { fontSize: 11, color: C.muted },

    // Input cards
    inputCard:    { backgroundColor: C.surf, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border },
    inputHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    inputTitle:   { fontSize: 15, fontWeight: '900', color: C.text },
    inputSub:     { fontSize: 11, color: C.muted, marginTop: 2 },
    inputRow:     { flexDirection: 'row', gap: 12 },
    inputGroup:   { flex: 1 },
    inputLabel:   { fontSize: 10, color: C.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    input:        { backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 16, fontWeight: '700', borderWidth: 1, borderColor: C.border },
    inputHint:    { fontSize: 10, color: C.muted, marginTop: 8, lineHeight: 15 },
    bmiResult:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12, padding: 10, marginTop: 12 },
    bmiVal:       { fontSize: 14, fontWeight: '900', color: C.text },
    bmiCat:       { fontSize: 12, fontWeight: '700' },

    // Timer toggle
    timerToggle:  { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 12, padding: 3, marginBottom: 14 },
    toggleBtn:    { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
    toggleBtnActive: { backgroundColor: C.cyan },
    toggleText:   { fontSize: 12, fontWeight: '800', color: C.muted },

    // Buttons
    startBtn:     { backgroundColor: C.cyan, borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 16 },
    startBtnText: { fontSize: 15, fontWeight: '900', color: C.bg },
    ghostBtn:     { borderRadius: 16, padding: 14, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: C.border },
    ghostBtnText: { fontSize: 13, fontWeight: '700', color: C.muted },
});

const lb = StyleSheet.create({
    container: { backgroundColor: C.surf, borderRadius: 18, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: C.border },
    track:     { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', height: 24, marginBottom: 12 },
    segment:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
    segLabel:  { fontSize: 9, color: 'rgba(255,255,255,0.85)', fontWeight: '800' },
    scoreRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 12 },
    scoreNum:  { fontSize: 28, fontWeight: '900' },
    scoreLabel:{ fontSize: 14, fontWeight: '800' },
    legend:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText:{ fontSize: 9, color: C.muted, fontWeight: '600' },
});

const sc = StyleSheet.create({
    compCard:   { backgroundColor: C.surf, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    compHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    compLabel:  { fontSize: 14, fontWeight: '800', color: C.text },
    compSubLabel:{ fontSize: 11, color: C.muted, marginTop: 2 },
    compPts:    { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    compPtsText:{ fontSize: 12, fontWeight: '900' },
    compBarBg:  { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 },
    compBarFill:{ height: '100%', borderRadius: 99 },
    compRec:    { fontSize: 11, color: C.textSub, lineHeight: 17 },
    retakeBtn:  { fontSize: 11, color: C.cyan, fontWeight: '700', marginTop: 8 },
});

const rt = StyleSheet.create({
    container: { alignItems: 'center', paddingVertical: 8 },
    time:      { fontSize: 48, fontWeight: '900', color: C.text, fontVariant: ['tabular-nums'], marginBottom: 16 },
    btnRow:    { flexDirection: 'row', gap: 12 },
    btn:       { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
    btnText:   { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
});
