/**
 * GhostSkeletonScreen — Real AI Form Calibration
 * ─────────────────────────────────────────────────────────────────────────
 * Feature flow:
 *   1. Permission check
 *   2. 10-second countdown — show ghost skeleton over camera so user knows where to stand
 *   3. Post-countdown: every 800ms capture frame → POST /session/calibrate
 *      → receive real MediaPipe keypoints back
 *   4. Render two skeleton layers:
 *        • Ghost (green, 40% opacity): ideal pro form from IDEAL_SKELETONS constant
 *        • User  (cyan, full opacity): real keypoints from MediaPipe
 *   5. Deviation heat-map: each user joint colored by angular deviation from ideal
 *   6. Calibration bar: needs 3 consecutive frames with form_score ≥ 65
 *   7. Once ready: "Start Session" → navigate to Camera tab passing sport
 * ─────────────────────────────────────────────────────────────────────────
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet,
    Dimensions, Animated, Easing,
} from 'react-native';
import { Tap } from '../ui';
import { Camera, CameraView } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Circle, Text as SvgText } from 'react-native-svg';
import api from '../services/api';

const { width: W, height: H } = Dimensions.get('window');

// ─── Colors ──────────────────────────────────────────────────────────────────
const C = {
    bg: '#0f172a', cyan: '#06b6d4', green: '#22c55e',
    orange: '#f97316', red: '#ef4444', text: '#f1f5f9', muted: '#64748b',
    yellow: '#facc15',
};

// ─── MediaPipe Pose Connections ───────────────────────────────────────────────
const CONNECTIONS = [
    [11, 12],               // shoulders
    [11, 13], [13, 15],     // left arm
    [12, 14], [14, 16],     // right arm
    [11, 23], [12, 24],     // torso
    [23, 24],               // hips
    [23, 25], [25, 27],     // left leg
    [24, 26], [26, 28],     // right leg
];

// Joint labels for informative overlay
const JOINT_NAMES = {
    11: 'L.Sh', 12: 'R.Sh',
    13: 'L.El', 14: 'R.El',
    15: 'L.Wr', 16: 'R.Wr',
    23: 'L.Hip', 24: 'R.Hip',
    25: 'L.Kn', 26: 'R.Kn',
    27: 'L.An', 28: 'R.An',
};

// ─── Ideal "pro" skeletons per sport (normalized 0-1, mirrored for front camera) ─
// These represent the biomechanically optimal position for each sport phase.
const IDEAL_SKELETONS = {
    vertical_jump: {
        // Standing athletic ready position (pre-descent)
        11: [0.42, 0.28], 12: [0.58, 0.28],  // shoulders
        13: [0.36, 0.40], 14: [0.64, 0.40],  // elbows
        15: [0.32, 0.52], 16: [0.68, 0.52],  // wrists
        23: [0.43, 0.54], 24: [0.57, 0.54],  // hips
        25: [0.41, 0.72], 26: [0.59, 0.72],  // knees
        27: [0.40, 0.90], 28: [0.60, 0.90],  // ankles
    },
    snatch: {
        // Overhead squat receiving position
        11: [0.40, 0.24], 12: [0.60, 0.24],
        13: [0.28, 0.20], 14: [0.72, 0.20],
        15: [0.20, 0.16], 16: [0.80, 0.16],  // arms overhead
        23: [0.43, 0.50], 24: [0.57, 0.50],
        25: [0.39, 0.67], 26: [0.61, 0.67],  // knees bent ~100°
        27: [0.39, 0.88], 28: [0.61, 0.88],
    },
    sprint: {
        // Mid-stance running position
        11: [0.40, 0.26], 12: [0.60, 0.26],
        13: [0.32, 0.36], 14: [0.68, 0.36],
        15: [0.26, 0.28], 16: [0.74, 0.28],  // arm drive
        23: [0.43, 0.52], 24: [0.57, 0.52],
        25: [0.38, 0.68], 26: [0.58, 0.68],  // hip drive
        27: [0.36, 0.87], 28: [0.56, 0.87],
    },
    javelin: {
        // Release position
        11: [0.35, 0.28], 12: [0.65, 0.28],
        13: [0.28, 0.36], 14: [0.78, 0.30],  // throwing arm back
        15: [0.22, 0.44], 16: [0.88, 0.22],  // wrist high
        23: [0.40, 0.54], 24: [0.60, 0.54],
        25: [0.38, 0.72], 26: [0.60, 0.72],
        27: [0.38, 0.90], 28: [0.60, 0.90],
    },
    cricket_bat: {
        // Cover drive stance
        11: [0.40, 0.28], 12: [0.60, 0.28],
        13: [0.34, 0.42], 14: [0.66, 0.42],
        15: [0.30, 0.54], 16: [0.70, 0.54],
        23: [0.42, 0.56], 24: [0.58, 0.56],
        25: [0.40, 0.73], 26: [0.58, 0.73],
        27: [0.39, 0.90], 28: [0.59, 0.90],
    },
};

function getIdeal(sport) {
    return IDEAL_SKELETONS[sport] || IDEAL_SKELETONS.vertical_jump;
}

// Compute angular deviation between user and ideal keypoint positions
function deviationColor(userPt, idealPt, canvasW, canvasH) {
    const dx = ((userPt.x - idealPt[0]) * canvasW);
    const dy = ((userPt.y - idealPt[1]) * canvasH);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const threshold = canvasW * 0.06;  // 6% of width = fine
    if (dist < threshold) return C.green;
    if (dist < threshold * 2.2) return C.yellow;
    return C.orange;
}

// ─── Skeleton SVG Overlay ─────────────────────────────────────────────────────
function SkeletonOverlay({ userKP, idealKP, canvasW, canvasH, showLabels }) {
    // Build pixel maps
    const idealPts = {};
    Object.entries(idealKP).forEach(([idx, [nx, ny]]) => {
        idealPts[parseInt(idx)] = { x: nx * canvasW, y: ny * canvasH };
    });

    const userPts = {};
    if (userKP && userKP.length > 0) {
        userKP.forEach((kp, i) => {
            if ((kp.visibility ?? 1) >= 0.25) {
                userPts[i] = { x: kp.x * canvasW, y: kp.y * canvasH, vis: kp.visibility ?? 1 };
            }
        });
    }

    return (
        <Svg width={canvasW} height={canvasH} style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* ── GHOST skeleton (ideal, green translucent) ── */}
            {CONNECTIONS.map(([a, b], i) => {
                const pa = idealPts[a], pb = idealPts[b];
                if (!pa || !pb) return null;
                return (
                    <Line key={`g-${i}`}
                        x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                        stroke={C.green} strokeWidth={3} strokeOpacity={0.4}
                        strokeDasharray="8,4"
                    />
                );
            })}
            {Object.entries(idealPts).map(([idx, pt]) => (
                <Circle key={`gd-${idx}`}
                    cx={pt.x} cy={pt.y} r={7}
                    fill={C.green} fillOpacity={0.25}
                    stroke={C.green} strokeWidth={1.5} strokeOpacity={0.5}
                />
            ))}

            {/* ── USER skeleton (real MediaPipe, cyan with deviation coloring) ── */}
            {CONNECTIONS.map(([a, b], i) => {
                const pa = userPts[a], pb = userPts[b];
                if (!pa || !pb) return null;
                // Color the bone by average deviation of its two endpoints
                const idealA = idealKP[a];
                const idealB = idealKP[b];
                const colorA = idealA ? deviationColor(pa, idealA, canvasW, canvasH) : C.cyan;
                const colorB = idealB ? deviationColor(pb, idealB, canvasW, canvasH) : C.cyan;
                const boneColor = (colorA === C.orange || colorB === C.orange) ? C.orange
                    : (colorA === C.yellow || colorB === C.yellow) ? C.yellow : C.cyan;
                return (
                    <Line key={`u-${i}`}
                        x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                        stroke={boneColor} strokeWidth={3.5} strokeOpacity={0.95}
                    />
                );
            })}
            {Object.entries(userPts).map(([idx, pt]) => {
                const ideal = idealKP[parseInt(idx)];
                const dotColor = ideal ? deviationColor(pt, ideal, canvasW, canvasH) : C.cyan;
                return (
                    <React.Fragment key={`uf-${idx}`}>
                        <Circle cx={pt.x} cy={pt.y} r={8}
                            fill={dotColor} fillOpacity={0.95}
                            stroke="#000" strokeWidth={1.5}
                        />
                        {showLabels && JOINT_NAMES[idx] && (
                            <SvgText
                                x={pt.x + 10} y={pt.y - 5}
                                fill="#fff" fontSize={9} fontWeight="bold"
                                opacity={0.75}
                            >
                                {JOINT_NAMES[idx]}
                            </SvgText>
                        )}
                    </React.Fragment>
                );
            })}
        </Svg>
    );
}


// ─── Countdown Overlay ────────────────────────────────────────────────────────
function CountdownOverlay({ seconds }) {
    const scaleAnim = useRef(new Animated.Value(1.4)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 1.0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
    }, [seconds]);

    return (
        <View style={cd.wrap} pointerEvents="none">
            <View style={cd.ring}>
                <Animated.Text style={[cd.num, { transform: [{ scale: scaleAnim }] }]}>
                    {seconds}
                </Animated.Text>
            </View>
            <Text style={cd.hint}>Position yourself to match the skeleton</Text>
        </View>
    );
}

const cd = StyleSheet.create({
    wrap: { position: 'absolute', top: '25%', left: 0, right: 0, alignItems: 'center' },
    ring: {
        width: 110, height: 110, borderRadius: 55,
        borderWidth: 3, borderColor: C.cyan,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: C.cyan, shadowOpacity: 0.7, shadowOffset: { width: 0, height: 0 }, shadowRadius: 20,
    },
    num: { fontSize: 56, fontWeight: '900', color: C.cyan },
    hint: { color: C.text, fontSize: 13, fontWeight: '700', marginTop: 14, textAlign: 'center', paddingHorizontal: 30 },
});


// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GhostSkeletonScreen({ navigation, route }) {
    const ins = useSafeAreaInsets();
    const sport = route?.params?.sport || 'vertical_jump';
    const idealKP = getIdeal(sport);

    const [permission, setPermission] = useState(null);
    const cameraRef = useRef(null);
    const captureRef = useRef(false);
    const intervalRef = useRef(null);

    // Phase: 'countdown' | 'calibrating' | 'ready'
    const [phase, setPhase] = useState('countdown');
    const [countdown, setCountdown] = useState(10);
    const [userKP, setUserKP] = useState([]);
    const [goodFrames, setGoodFrames] = useState(0);
    const [formScore, setFormScore] = useState(null);
    const [feedback, setFeedback] = useState('Stand 1.5–2m from camera. Match the green skeleton.');
    const [showLabels, setShowLabels] = useState(false);

    // Request permission on mount
    useEffect(() => {
        Camera.requestCameraPermissionsAsync().then(({ status }) => {
            setPermission({ granted: status === 'granted' });
        });
    }, []);
    useEffect(() => {
        if (phase !== 'countdown') return;
        if (countdown <= 0) {
            setPhase('calibrating');
            setFeedback('Hold still — analyzing your pose...');
            return;
        }
        const t = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [countdown, phase]);

    // ── Calibration capture loop (starts after countdown) ────────────────────
    useEffect(() => {
        if (phase !== 'calibrating') return;
        if (!permission?.granted) return;

        intervalRef.current = setInterval(async () => {
            if (!cameraRef.current || captureRef.current) return;
            try {
                captureRef.current = true;

                const photo = await cameraRef.current.takePictureAsync({
                    base64: true,
                    quality: 0.1,
                    skipProcessing: true,
                    exif: false,
                });
                captureRef.current = false;

                if (!photo?.base64) {
                    setFeedback('Camera frame error — retrying...');
                    return;
                }

                const result = await api.calibrate(photo.base64);
                if (!result) return;

                // Update user skeleton with REAL MediaPipe keypoints
                if (result.keypoints && result.keypoints.length > 0) {
                    setUserKP(result.keypoints);
                }

                setFormScore(result.form_score ?? null);
                setFeedback(result.primary_feedback || getFeedbackMsg(result.form_score));

                const passed = result.pose_detected && (result.form_score ?? 0) >= 65;
                setGoodFrames(prev => {
                    const next = passed ? prev + 1 : Math.max(0, prev - 1);
                    if (next >= 3) setPhase('ready');
                    return next;
                });

            } catch (e) {
                captureRef.current = false;
                // Keep showing ghost — just note the API wasn't reachable
                setFeedback('Pose analysis server offline — ghost preview only');
            }
        }, 850);

        return () => clearInterval(intervalRef.current);
    }, [phase, permission?.granted]);

    const getFeedbackMsg = (score) => {
        if (!score) return 'Align your body with the green ghost skeleton';
        if (score >= 85) return 'Excellent! Hold this position...';
        if (score >= 70) return 'Good — straighten up a bit more';
        if (score >= 50) return 'Move closer to the ghost skeleton position';
        return 'Form too different — check camera angle and distance';
    };

    const handleStart = useCallback(() => {
        clearInterval(intervalRef.current);
        // Navigate to Camera tab via root Stack → Tabs navigator
        navigation?.navigate('Tabs', { screen: 'Train', params: { sport } });
    }, [sport, navigation]);

    // ── Permission states ────────────────────────────────────────────────────
    if (!permission) return <View style={s.fill} />;

    if (!permission.granted) {
        return (
            <View style={[s.safeBg, { paddingTop: ins.top, paddingBottom: ins.bottom }]}>
                <View style={s.center}>
                    <Text style={s.permTitle}>Camera Permission</Text>
                    <Text style={s.permText}>Camera access is needed to show the skeleton overlay and compare your form with the AI model.</Text>
                    <Tap style={s.grantBtn} onPress={() => Camera.requestCameraPermissionsAsync().then(({ status }) => setPermission({ granted: status === 'granted' }))}>
                        <Text style={s.btnText}>Grant Camera Access</Text>
                    </Tap>
                </View>
            </View>
        );
    }

    const scoreColor = (formScore ?? 0) >= 75 ? C.green : (formScore ?? 0) >= 50 ? C.yellow : C.red;
    const calibReady = phase === 'ready';

    return (
        <View style={s.fill}>
            {/* ── Camera feed ── */}
            <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={'front'}
            />

            {/* ── Skeleton overlay (always shown) ── */}
            <SkeletonOverlay
                userKP={userKP}
                idealKP={idealKP}
                canvasW={W}
                canvasH={H}
                showLabels={showLabels}
            />

            {/* ── Countdown overlay ── */}
            {phase === 'countdown' && <CountdownOverlay seconds={countdown} />}

            {/* ── Top HUD ── */}
            <View style={[s.hud, { paddingTop: ins.top + 8 }]}>
                <View style={s.hudRow}>
                    <Tap style={s.backBtn} onPress={() => navigation?.goBack()}>
                        <Text style={s.backTxt}>← Back</Text>
                    </Tap>

                    <View style={s.sportChip}>
                        <Text style={s.sportTxt}>{sport.replace(/_/g, ' ').toUpperCase()}</Text>
                    </View>

                    {formScore !== null && (
                        <View style={[s.scoreChip, { borderColor: scoreColor + '60' }]}>
                            <Text style={[s.scoreNum, { color: scoreColor }]}>{Math.round(formScore)}</Text>
                            <Text style={s.scoreLabel}>Form</Text>
                        </View>
                    )}
                </View>

                {/* Legend */}
                <View style={s.legend}>
                    <View style={s.legendPill}>
                        <View style={[s.legendDot, { backgroundColor: C.cyan }]} />
                        <Text style={s.legendTxt}>You</Text>
                    </View>
                    <View style={[s.legendPill, { marginLeft: 10 }]}>
                        <View style={[s.legendDot, { backgroundColor: C.green, opacity: 0.55 }]} />
                        <Text style={s.legendTxt}>Pro Ghost</Text>
                    </View>
                    <View style={[s.legendPill, { marginLeft: 10 }]}>
                        <View style={[s.legendDot, { backgroundColor: C.orange }]} />
                        <Text style={s.legendTxt}>Off-target</Text>
                    </View>
                    <Tap style={s.labelToggle} onPress={() => setShowLabels(l => !l)}>
                        <Text style={s.labelToggleTxt}>{showLabels ? 'Hide Labels' : 'Labels'}</Text>
                    </Tap>
                </View>
            </View>

            {/* ── Bottom Panel ── */}
            <View style={[s.bottom, { paddingBottom: ins.bottom + 20 }]}>
                {/* Calibration dots */}
                {phase === 'calibrating' || phase === 'ready' ? (
                    <View style={s.calibRow}>
                        {[0, 1, 2].map(i => (
                            <View key={i} style={[
                                s.calibDot,
                                { backgroundColor: i < goodFrames ? C.green : 'rgba(255,255,255,0.18)' }
                            ]} />
                        ))}
                        <Text style={s.calibHint}>
                            {calibReady ? 'Ready to start!' : `${Math.max(0, 3 - goodFrames)} more good frames needed`}
                        </Text>
                    </View>
                ) : (
                    <View style={s.calibRow}>
                        <Text style={s.calibHint}>
                            {`Countdown: ${countdown}s — position yourself`}
                        </Text>
                    </View>
                )}

                {/* Feedback text */}
                <Text style={s.feedbackTxt}>{feedback}</Text>

                {/* Start button */}
                <Tap
                    style={[s.startBtn, !calibReady && s.startBtnOff]}
                    onPress={calibReady ? handleStart : undefined}
                >
                    <Text style={[s.btnText, !calibReady && { color: 'rgba(0,0,0,0.5)' }]}>
                        {calibReady ? 'Start Session' : phase === 'countdown' ? 'Positioning...' : 'Calibrating...'}
                    </Text>
                </Tap>
            </View>
        </View>
    );
}


const s = StyleSheet.create({
    fill: { flex: 1, backgroundColor: '#000' },
    safeBg: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
    permTitle: { color: C.cyan, fontSize: 22, fontWeight: '900', marginBottom: 12 },
    permText: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    grantBtn: { backgroundColor: C.cyan, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13 },
    hud: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    hudRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 },
    backBtn: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8 },
    backTxt: { color: C.text, fontWeight: '700', fontSize: 13 },
    sportChip: { flex: 1, backgroundColor: 'rgba(6,182,212,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center' },
    sportTxt: { color: C.cyan, fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },
    scoreChip: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5, alignItems: 'center', borderWidth: 1 },
    scoreNum: { fontSize: 22, fontWeight: '900' },
    scoreLabel: { fontSize: 8, color: C.muted, fontWeight: '700', textTransform: 'uppercase' },
    legend: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginTop: 8, flexWrap: 'wrap' },
    legendPill: { flexDirection: 'row', alignItems: 'center' },
    legendDot: { width: 9, height: 9, borderRadius: 5, marginRight: 4 },
    legendTxt: { color: C.text, fontSize: 10, fontWeight: '700' },
    labelToggle: { marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    labelToggleTxt: { color: C.muted, fontSize: 9, fontWeight: '700' },
    bottom: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: 'rgba(15,23,42,0.90)',
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        padding: 20,
    },
    calibRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    calibDot: { width: 13, height: 13, borderRadius: 7, marginRight: 9 },
    calibHint: { color: C.text, fontSize: 12, fontWeight: '700', flex: 1 },
    feedbackTxt: { color: C.muted, fontSize: 12, lineHeight: 18, marginBottom: 14 },
    startBtn: { backgroundColor: C.cyan, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    startBtnOff: { backgroundColor: 'rgba(6,182,212,0.18)' },
    btnText: { color: '#000', fontWeight: '900', fontSize: 14 },
});
