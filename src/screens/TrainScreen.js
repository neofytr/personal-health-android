// TrainScreen — AI Vision Engine (Nike Design Language)
// Camera fix: use `Camera` from 'expo-camera' (legacy API, has takePictureAsync)
// CameraView from expo-camera/next does NOT have takePictureAsync — that's why
// real AI analysis was always falling back to simulation mode.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView, Pressable, Animated , Platform } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../context/UserContext';
import api from '../services/api';
import { Tap, Fade, ProgressRing, CONDENSED, MONO } from '../ui';

const { width: W } = Dimensions.get('window');

const SPORTS = [
    { key: 'general',       label: 'GENERAL' },
    { key: 'vertical_jump', label: 'VJ' },
    { key: 'squat',         label: 'SQUAT' },
    { key: 'push_up',       label: 'PUSH UP' },
    { key: 'pull_up',       label: 'PULL UP' },
    { key: 'sprint',        label: 'SPRINT' },
    { key: 'snatch',        label: 'SNATCH' },
    { key: 'javelin',       label: 'JAVELIN' },
    { key: 'cricket_bat',   label: 'CRICKET' },
];

const SPORT_RANGES = {
    vertical_jump: { knee: [85, 110],  hip: [80, 110],  trunk: [8, 18],  sym: 0.94, jh: [32, 65] },
    snatch:        { knee: [95, 125],  hip: [85, 100],  trunk: [18, 30], sym: 0.95, jh: [0, 0]  },
    sprint:        { knee: [85, 115],  hip: [42, 62],   trunk: [12, 22], sym: 0.88, jh: [0, 0]  },
    javelin:       { knee: [140, 165], hip: [105, 125], trunk: [28, 45], sym: 0.76, jh: [0, 0]  },
    cricket_bat:   { knee: [132, 158], hip: [118, 145], trunk: [18, 30], sym: 0.82, jh: [0, 0]  },
    squat:         { knee: [75, 110],  hip: [75, 105],  trunk: [0, 25],  sym: 0.92, jh: [0, 0]  },
    push_up:       { knee: [165, 180], hip: [165, 180], trunk: [0, 8],   sym: 0.92, jh: [0, 0]  },
    pull_up:       { knee: [140, 180], hip: [140, 180], trunk: [0, 15],  sym: 0.90, jh: [0, 0]  },
};

const REP_TRANSITIONS = {
    vertical_jump: ['descent', 'takeoff'],
    squat:         ['descent', 'setup'],
    push_up:       ['descent', 'setup'],
    pull_up:       ['descent', 'setup'],
    snatch:        ['descent', 'catch'],
    sprint:        ['drive', 'flight'],
    javelin:       ['wind_up', 'release'],
    cricket_bat:   ['backswing', 'contact'],
};

function rng(lo, hi) { return lo + Math.random() * (hi - lo); }

function simulateFrame(sport) {
    const p = SPORT_RANGES[sport] || SPORT_RANGES.vertical_jump;
    const kneeL = rng(...p.knee), kneeR = rng(...p.knee);
    const hipL = rng(...p.hip), hipR = rng(...p.hip);
    const trunk = rng(...p.trunk);
    const sym = p.sym + (Math.random() - 0.5) * 0.06;
    const jh = p.jh[1] > 0 ? rng(...p.jh) : 0;
    const score = Math.round(60 + Math.random() * 35);
    const quality = score >= 90 ? 'elite' : score >= 75 ? 'good' : score >= 55 ? 'average' : 'poor';
    const feedback = {
        elite: 'Elite biomechanics! Maintain this pattern.',
        good: 'Good form. Focus on symmetry.',
        average: 'Lower your hips. Control trunk lean.',
        poor: 'LOWER HIPS — critical form deviation!',
    }[quality];
    return {
        knee_angle_l: kneeL, knee_angle_r: kneeR, hip_angle_l: hipL, hip_angle_r: hipR,
        trunk_lean: trunk, limb_symmetry_idx: sym, estimated_jump_height: jh,
        form_score: score, form_quality: quality, primary_feedback: feedback, phase: 'descent'
    };
}

const Q_COLORS = { elite: '#22c55e', good: '#06b6d4', average: '#f97316', poor: '#ef4444' };

export default function TrainScreen({ showToast, navigation, route }) {
    const ins = useSafeAreaInsets();
    const { addXp, userData } = useUser();
    const [permission, setPermission] = useState(null);
    const initialSport = route?.params?.sport || 'general';
    const [sport, setSport] = useState(initialSport);
    const [isActive, setIsActive] = useState(false);
    const [metrics, setMetrics] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [frameNum, setFrameNum] = useState(0);
    const [scoreHistory, setScoreHistory] = useState([]);
    const [avgScore, setAvgScore] = useState(0);
    const [showSummary, setShowSummary] = useState(false);
    const [summary, setSummary] = useState(null);
    const [analysisMode, setAnalysisMode] = useState('sim'); // 'real' | 'sim' | 'no_pose'
    const intervalRef = useRef(null);
    const simIntervalRef = useRef(null);
    const sessionRef = useRef(null);
    const cameraRef = useRef(null);       // CameraView ref for takePictureAsync
    const isCapturingRef = useRef(false); // prevents overlapping captures
    const lastPhaseRef = useRef(null);
    const analysisModeRef = useRef('sim');
    const [repCount, setRepCount] = useState(0);

    // #3 Bouncy CTA on mount
    const ctaBounce = useRef(new Animated.Value(0.85)).current;
    useEffect(() => {
        Animated.spring(ctaBounce, { toValue: 1, useNativeDriver: true, speed: 4, bounciness: 14 }).start();
    }, []);

    // Request camera permission on mount
    useEffect(() => {
        Camera.requestCameraPermissionsAsync().then(({ status }) => {
            setPermission({ granted: status === 'granted' });
        });
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (simIntervalRef.current) clearInterval(simIntervalRef.current);
        };
    }, []);

    const requestPermission = async () => {
        const { status } = await Camera.requestCameraPermissionsAsync();
        setPermission({ granted: status === 'granted' });
    };

    // Update sport when navigated to with params (e.g., from GhostSkeleton)
    useEffect(() => {
        if (route?.params?.sport) setSport(route.params.sport);
    }, [route?.params?.sport]);

    // Separate ref for the result polling interval
    const resultIntervalRef = useRef(null);

    const checkRep = (phase) => {
        if (!phase) return;
        const [fromPhase, toPhase] = REP_TRANSITIONS[sport] || [];
        if (fromPhase && toPhase && lastPhaseRef.current === fromPhase && phase === toPhase) {
            setRepCount(c => c + 1);
        }
        lastPhaseRef.current = phase;
    };

    const startSession = async () => {
        // Clear any existing intervals from a previous session
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (simIntervalRef.current) clearInterval(simIntervalRef.current);
        if (resultIntervalRef.current) clearInterval(resultIntervalRef.current);

        const sData = await api.startSession(userData?.avatarId || 'athlete_01', sport);
        const sid = sData?.session_id || null;
        setSessionId(sid);
        sessionRef.current = sid;
        setIsActive(true);
        setFrameNum(0);
        setScoreHistory([]);
        setShowSummary(false);
        setSummary(null);
        setAnalysisMode('waiting');
        analysisModeRef.current = 'waiting';
        setRepCount(0);
        lastPhaseRef.current = null;

        // ── FRAME CAPTURE ────────────────────────────────────────────────────
        const captureAndSend = async () => {
            try {
                if (cameraRef.current && !isCapturingRef.current && sessionRef.current) {
                    isCapturingRef.current = true;
                    const photo = await cameraRef.current.takePictureAsync({
                        base64: true,
                        quality: 0.4,
                        skipProcessing: false,
                    });
                    isCapturingRef.current = false;
                    if (photo?.base64) {
                        setFrameNum(n => n + 1);
                        api.sendFrame(sessionRef.current, {
                            image_b64: photo.base64,
                            sport,
                            form_score: 0, form_quality: 'unknown', primary_feedback: ''
                        }).catch(() => {});
                    }
                }
            } catch {
                isCapturingRef.current = false;
            }
        };

        // Capture first frame after 1.5s (camera needs time to initialize)
        setTimeout(captureAndSend, 1500);
        // Then every 3s
        intervalRef.current = setInterval(captureAndSend, 3000);

        // Simulation disabled — only real AI data shown.
        // If no pose detected, UI shows "NO POSE" instead of fake numbers.

        // ── RESULT POLLING LOOP (every 3s) ─────────────────────────────────
        // Polls /latest-result → when AI finishes, real metrics appear in UI.
        resultIntervalRef.current = setInterval(async () => {
            if (!sessionRef.current) return;
            try {
                const result = await api.getLatestResult(sessionRef.current);
                if (result?.pose_detected && result.form_score > 0) {
                    // Real AI result — update UI
                    checkRep(result.phase);
                    const frame = {
                        form_score: result.form_score,
                        form_quality: result.form_quality,
                        primary_feedback: result.primary_feedback,
                        phase: result.phase,
                        knee_angle_l: result.knee_angle_l ?? 0,
                        knee_angle_r: result.knee_angle_r ?? 0,
                        hip_angle_l: result.hip_angle_l ?? 0,
                        hip_angle_r: result.hip_angle_r ?? 0,
                        trunk_lean: result.trunk_lean ?? 0,
                        limb_symmetry_idx: result.limb_symmetry_idx ?? 1,
                        estimated_jump_height: result.estimated_jump_height ?? 0,
                    };
                    setMetrics(frame);
                    setAnalysisMode('real');
                    analysisModeRef.current = 'real';
                    setFrameNum(n => n + 1);
                    setScoreHistory(h => {
                        const next = [...h, result.form_score];
                        if (next.length > 30) next.shift();
                        setAvgScore(Math.round(next.reduce((a, b) => a + b, 0) / next.length));
                        return next;
                    });
                } else if (result?.pose_detected === false) {
                    // Backend processed frame but no person detected
                    setAnalysisMode('no_pose');
                    analysisModeRef.current = 'no_pose';
                } else if (result?.data_source === 'none') {
                    // No frames analyzed yet — waiting
                    if (analysisModeRef.current !== 'real') {
                        setAnalysisMode('waiting');
                        analysisModeRef.current = 'waiting';
                    }
                }
            } catch (e) {
                // If we can't reach the server, show error state
                if (analysisModeRef.current !== 'real') {
                    setAnalysisMode('error');
                    analysisModeRef.current = 'error';
                }
            }
        }, 2000);

    };

    const endSession = async () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (resultIntervalRef.current) clearInterval(resultIntervalRef.current);
        if (simIntervalRef.current) clearInterval(simIntervalRef.current);
        setIsActive(false);
        setMetrics(null);

        let sum = null;
        if (sessionRef.current) {
            sum = await api.endSession(sessionRef.current);
        }
        const xpEarned = sum?.xp_earned ?? (Math.floor(avgScore * 1.5) + 50);
        const peakScore = sum?.peak_form_score ?? Math.max(...scoreHistory, 0);
        const peakVj = sum?.peak_jump_height_cm ?? 0;

        const finalSummary = { avgScore, peakScore, peakVj, xpEarned, frames: frameNum, reps: repCount };
        setSummary(finalSummary);
        setShowSummary(true);
    };

    const completeSummary = () => {
        if (summary) {
            addXp(summary.xpEarned, summary); // updates UserContext
            showToast(`+${summary.xpEarned} XP added to Bio-Passport!`);
        }
        setShowSummary(false);
        setSummary(null);
    };

    // ── Permissions ─────────────────────────────────────────────────────────────

    if (!permission) {
        return (
            <View style={s.center}>
                <Text style={s.mutedText}>Loading camera...</Text>
            </View>
        );
    }
    if (!permission.granted) {
        return (
            <View style={[s.root, { paddingTop: ins.top, paddingBottom: ins.bottom, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
                <Text style={{ fontSize: 13, color: '#4b5563', letterSpacing: 3, fontWeight: '800', marginBottom: 16 }}>CAMERA ACCESS</Text>
                <Text style={s.title}>PERMISSION REQUIRED</Text>
                <Text style={[s.subtitle, { textAlign: 'center', marginBottom: 24, marginTop: 8 }]}>
                    Camera access is needed to perform real-time biomechanics analysis.
                </Text>
                <Tap onPress={requestPermission}>
                    <LinearGradient colors={['#0c4a6e','#0891b2','#06b6d4']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.gradientBtn}>
                        <Text style={s.gradientBtnText}>GRANT CAMERA ACCESS</Text>
                    </LinearGradient>
                </Tap>
            </View>
        );
    }

    // ── Session Summary Screen ───────────────────────────────────────────────────

    if (showSummary && summary) {
        const qColor = Q_COLORS[summary.avgScore >= 90 ? 'elite' : summary.avgScore >= 75 ? 'good' : summary.avgScore >= 55 ? 'average' : 'poor'];
        return (
            <View style={[s.root, { paddingTop: ins.top, paddingBottom: ins.bottom }]}>
                <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: ins.bottom + 20 }} showsVerticalScrollIndicator={false}>
                    <Fade>
                        <Text style={s.summaryHeadline}>SESSION{'\n'}COMPLETE</Text>
                    </Fade>

                    <Fade delay={100} style={{ alignItems: 'center', marginVertical: 32 }}>
                        <View style={{ position: 'relative' }}>
                            <ProgressRing pct={summary.avgScore} color={qColor} size={160} stroke={6} />
                            <View style={s.ringInner}>
                                <Text style={[s.ringScore, { color: qColor, fontFamily: CONDENSED }]}>{summary.avgScore}</Text>
                                <Text style={s.ringLabel}>SCORE</Text>
                            </View>
                        </View>
                    </Fade>

                    <Fade delay={200}>
                        <View style={s.summaryStats}>
                            <SummaryRow label="Peak Score" value={`${summary.peakScore}%`} color="#22c55e" />
                            <View style={s.thinDivider} />
                            <SummaryRow label="Peak Jump Height" value={summary.peakVj > 0 ? `${summary.peakVj.toFixed(1)} cm` : '--'} color="#f97316" />
                            <View style={s.thinDivider} />
                            <SummaryRow label="Reps Counted" value={String(summary.reps ?? 0)} color="#f97316" />
                            <View style={s.thinDivider} />
                            <SummaryRow label="Frames Analyzed" value={String(summary.frames)} color="#a78bfa" />
                        </View>

                        <Text style={s.xpText}>+{summary.xpEarned} XP EARNED</Text>
                    </Fade>

                    <Fade delay={300}>
                        <Tap onPress={completeSummary}>
                            <LinearGradient colors={['#0c4a6e','#0891b2','#06b6d4']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.gradientBtn}>
                                <Text style={s.gradientBtnText}>SAVE</Text>
                            </LinearGradient>
                        </Tap>
                    </Fade>
                </ScrollView>
            </View>
        );
    }

    // ── Setup Screen ─────────────────────────────────────────────────────────────

    if (!isActive) {
        const sportLabel = SPORTS.find(sp => sp.key === sport)?.label || 'VERTICAL JUMP';
        return (
            <View style={[s.root, { paddingTop: ins.top }]}>
                <ScrollView contentContainerStyle={{ paddingBottom: ins.bottom + 40 }} showsVerticalScrollIndicator={false}>

                    {/* Hero section — the sport is the visual focus */}
                    <Fade style={s.setupHero}>
                        <Text style={s.setupEyebrow}>ACTIVEBHARAT</Text>
                        <Text style={s.setupTitle}>{sportLabel}</Text>
                        <Text style={s.setupSub}>AI-powered biomechanics session</Text>
                    </Fade>

                    {/* Sport selector — horizontal tabs */}
                    <Fade delay={80}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sportScroll}>
                            {SPORTS.map((sp) => (
                                <Tap key={sp.key} onPress={() => setSport(sp.key)} style={[s.sportItem, sport === sp.key && s.sportPill]} haptic={true}>
                                    <Text style={[s.sportTab, sport === sp.key && s.sportTabActive]}>{sp.label}</Text>
                                    {sport === sp.key && <View style={s.sportUnderline} />}
                                </Tap>
                            ))}
                        </ScrollView>
                    </Fade>

                    {/* CTA — dominant, full bleed gradient */}
                    <Fade delay={160}>
                        <Animated.View style={{ transform: [{ scale: ctaBounce }] }}>
                            <Tap onPress={startSession}>
                                <LinearGradient colors={['#0c4a6e','#0891b2','#06b6d4']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.setupCta}>
                                    <Text style={s.setupCtaLabel}>TAP TO BEGIN</Text>
                                    <Text style={s.setupCtaTitle}>START{'\n'}SESSION</Text>
                                    <View style={s.setupCtaCircle}><Text style={s.setupCtaGo}>GO</Text></View>
                                </LinearGradient>
                            </Tap>
                        </Animated.View>
                    </Fade>

                    {/* Tips — minimal, tucked at bottom */}
                    <Fade delay={240} style={s.tipsSection}>
                        <Text style={s.sectionLabel}>SETUP TIPS</Text>
                        {[
                            'Good lighting — face a window',
                            'Full body in frame — head to feet',
                            'Phone at waist height, 2m away',
                            'Fitted clothes for best tracking',
                        ].map((item) => (
                            <View key={item} style={s.tipRow}>
                                <View style={s.tipDot} />
                                <Text style={s.tipText}>{item}</Text>
                            </View>
                        ))}
                    </Fade>
                </ScrollView>
            </View>
        );
    }

    // ── Live Camera View ──────────────────────────────────────────────────────────

    const qColor = metrics ? (Q_COLORS[metrics.form_quality] || '#06b6d4') : '#06b6d4';
    const modeLabel = analysisMode === 'real' ? 'REAL AI'
        : analysisMode === 'no_pose' ? 'NO POSE'
        : analysisMode === 'waiting' ? 'ANALYZING...'
        : analysisMode === 'error' ? 'CONNECTION LOST'
        : 'WAITING';
    const modeColor = analysisMode === 'real' ? '#22c55e'
        : analysisMode === 'no_pose' ? '#f97316'
        : analysisMode === 'waiting' ? '#06b6d4'
        : analysisMode === 'error' ? '#ef4444'
        : '#64748b';

    return (
        <View style={s.cameraWrap}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={'back'} />

            {/* Top bar */}
            <View style={[s.camTopBar, { top: ins.top + 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={s.recDot} />
                    <Text style={s.recText}>REC</Text>
                </View>
                <Tap onPress={endSession}>
                    <Text style={s.finishText}>FINISH</Text>
                </Tap>
            </View>

            {/* Telemetry overlay */}
            <View style={[s.overlayMetrics, { top: ins.top + 60 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: modeColor, marginRight: 8 }} />
                    <Text style={[s.overlayMode, { color: modeColor }]}>{modeLabel}</Text>
                </View>
                {metrics && (
                    <>
                        <Text style={s.overlayAngle}>{`KNEE  ${metrics.knee_angle_l?.toFixed(0)}°`}</Text>
                        <Text style={s.overlayAngle}>{`HIP   ${metrics.hip_angle_l?.toFixed(0)}°`}</Text>
                        <Text style={s.overlayAngle}>{`TRUNK ${metrics.trunk_lean?.toFixed(0)}°`}</Text>
                        <Text style={s.overlayAngle}>{`SYM   ${metrics.limb_symmetry_idx?.toFixed(2)}`}</Text>
                    </>
                )}
            </View>

            {/* Bottom HUD */}
            <View style={[s.camBottomHUD, { bottom: ins.bottom + 20 }]}>
                <View style={[s.hudTopLine, { backgroundColor: analysisMode === 'real' ? qColor : modeColor }]} />
                <View style={s.hudContent}>
                    <View style={{ flex: 1 }}>
                        <Text style={[s.hudLabel, { color: analysisMode === 'real' ? qColor : modeColor }]}>
                            {analysisMode === 'real' ? 'LIVE CORRECTION'
                                : analysisMode === 'no_pose' ? 'NO PERSON DETECTED'
                                : analysisMode === 'error' ? 'CONNECTION ERROR'
                                : `ANALYZING · FRAME ${frameNum}`}
                        </Text>
                        <Text style={s.hudFeedback} numberOfLines={2}>
                            {analysisMode === 'no_pose'
                                ? 'Stand back — full body must be visible, head to feet'
                                : analysisMode === 'error'
                                ? 'Check your connection. Frames will be analyzed when reconnected.'
                                : analysisMode === 'real'
                                ? (metrics?.primary_feedback || 'Great form!')
                                : 'Point camera at your full body. Stay still...'}
                        </Text>
                    </View>
                    <View style={{ alignItems: 'center', marginHorizontal: 12 }}>
                        <Text style={s.hudStatLabel}>REPS</Text>
                        <Text style={[s.hudStatNum, { color: '#f97316' }]}>{repCount}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.hudStatLabel}>FORM</Text>
                        <Text style={[s.hudFormScore, { color: qColor }]}>{metrics?.form_score ?? '--'}%</Text>
                    </View>
                </View>
            </View>
        </View>
    );
}

function SummaryRow({ label, value, color }) {
    return (
        <View style={s.summaryRow}>
            <Text style={s.sumLabel}>{label}</Text>
            <Text style={[s.sumVal, { color }]}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
    mutedText: { color: '#64748b', fontSize: 14 },

    // Setup hero
    setupHero: { alignItems: 'center', paddingTop: 40, paddingBottom: 32 },
    setupEyebrow: { fontSize: 10, fontWeight: '800', color: '#4b5563', letterSpacing: 4, marginBottom: 16 },
    setupTitle: { fontSize: 52, fontWeight: '900', color: '#fff', letterSpacing: -1, fontFamily: CONDENSED, textAlign: 'center' },
    setupSub: { fontSize: 13, color: '#4b5563', fontWeight: '400', marginTop: 8 },

    // Sport tabs
    sportScroll: { paddingHorizontal: 24, paddingBottom: 4, marginBottom: 24 },
    sportItem: { marginRight: 24 },
    sportPill: { backgroundColor: 'rgba(6,182,212,0.12)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, marginRight: 16 },
    sportTab: { fontSize: 13, fontWeight: '700', color: '#4b5563', letterSpacing: 2, paddingBottom: 8 },
    sportTabActive: { color: '#fff' },
    sportUnderline: { height: 2, backgroundColor: '#06b6d4', borderRadius: 1 },

    // Setup CTA
    setupCta: { marginHorizontal: 20, borderRadius: 8, paddingVertical: 40, paddingHorizontal: 28, marginBottom: 36, position: 'relative',
        ...Platform.select({ android: { elevation: 16 }, ios: { shadowColor: '#06b6d4', shadowOpacity: 0.35, shadowOffset: { width: 0, height: 14 }, shadowRadius: 28 } }),
    },
    setupCtaLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.35)', letterSpacing: 4, marginBottom: 8 },
    setupCtaTitle: { fontSize: 48, fontWeight: '900', color: '#fff', lineHeight: 50, letterSpacing: -1, fontFamily: CONDENSED },
    setupCtaCircle: { position: 'absolute', bottom: 28, right: 28, width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    setupCtaGo: { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 1 },

    // Tips
    tipsSection: { paddingHorizontal: 24 },
    sectionLabel: { fontSize: 11, fontWeight: '800', color: '#374151', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14 },
    tipRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    tipDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#374151', marginRight: 12 },
    tipText: { fontSize: 13, color: '#6b7280', fontWeight: '400', lineHeight: 18 },

    // Gradient CTA (used in permission + summary)
    gradientBtn: { borderRadius: 6, paddingVertical: 18, alignItems: 'center', marginHorizontal: 20 },
    gradientBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 3, fontFamily: CONDENSED },

    // Camera view
    cameraWrap: { flex: 1, backgroundColor: '#000' },
    camTopBar: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, zIndex: 10 },
    recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444', marginRight: 8 },
    recText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
    finishText: { color: '#ef4444', fontWeight: '900', fontSize: 13, letterSpacing: 2 },

    overlayMetrics: { position: 'absolute', left: 16, zIndex: 10 },
    overlayMode: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    overlayAngle: { color: '#06b6d4', fontSize: 11, fontWeight: '700', marginBottom: 4, fontFamily: MONO, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },

    // Bottom HUD
    camBottomHUD: { position: 'absolute', left: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 16, overflow: 'hidden', zIndex: 10 },
    hudTopLine: { height: 2, width: '100%' },
    hudContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    hudLabel: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 },
    hudFeedback: { color: '#f1f5f9', fontWeight: '700', fontSize: 15 },
    hudStatLabel: { fontSize: 8, color: '#64748b', fontWeight: '700', letterSpacing: 2 },
    hudStatNum: { fontSize: 22, fontWeight: '900' },
    hudFormScore: { fontSize: 36, fontWeight: '900', fontFamily: CONDENSED },

    // Summary
    summaryHeadline: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: 2, fontFamily: CONDENSED, textAlign: 'center', lineHeight: 44 },
    ringInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    ringScore: { fontSize: 48, fontWeight: '900' },
    ringLabel: { fontSize: 9, fontWeight: '700', color: '#4b5563', letterSpacing: 3, marginTop: -4 },
    summaryStats: { marginBottom: 20 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    sumLabel: { fontSize: 13, color: '#6b7280', fontWeight: '400' },
    sumVal: { fontSize: 20, fontWeight: '900', fontFamily: CONDENSED },
    thinDivider: { height: 1, backgroundColor: '#1a1a1a' },
    xpText: { fontSize: 18, fontWeight: '900', color: '#06b6d4', textAlign: 'center', letterSpacing: 2, marginBottom: 32, fontFamily: CONDENSED },
});
