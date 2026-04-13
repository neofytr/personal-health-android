// Shared UI primitives — used across all screens.
// Tap feedback, fade-in animation, haptic touch, typography helpers.

import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Platform, StyleSheet, Text, View, Vibration } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

let Haptics;
try { Haptics = require('expo-haptics'); } catch (_) {}

const CONDENSED = Platform.OS === 'android' ? 'sans-serif-condensed' : 'HelveticaNeue-CondensedBold';
const MONO = Platform.OS === 'android' ? 'monospace' : 'Courier';

// ── Tap with spring scale + haptic ──────────────────────────────────────────

export function Tap({ onPress, children, style, haptic = true }) {
    const scale = useRef(new Animated.Value(1)).current;
    const onIn = () => {
        Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
        if (haptic && Haptics) {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (_) {}
        }
    };
    const onOut = () => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
    };
    return (
        <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
            <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
        </Pressable>
    );
}

// ── Fade-in on mount (staggered) ────────────────────────────────────────────

export function Fade({ delay = 0, distance = 24, duration = 650, children, style }) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(distance)).current;
    useEffect(() => {
        const anim = Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration, delay, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: duration + 50, delay, useNativeDriver: true }),
        ]);
        anim.start();
        return () => anim.stop();
    }, []);
    return (
        <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
            {children}
        </Animated.View>
    );
}

// ── Animated number counter (with flash on finish) ─────────────────────────

export function CountUp({ to, duration = 800, delay = 0, style }) {
    const val = useRef(new Animated.Value(0)).current;
    const flashOpacity = useRef(new Animated.Value(1)).current;
    const [display, setDisplay] = React.useState(0);
    useEffect(() => {
        const listener = val.addListener(({ value }) => setDisplay(Math.round(value)));
        Animated.timing(val, { toValue: to, duration, delay, useNativeDriver: false }).start(() => {
            // #5 Number color flash — brief brightness pulse when counting finishes
            Animated.sequence([
                Animated.timing(flashOpacity, { toValue: 0.5, duration: 120, useNativeDriver: true }),
                Animated.timing(flashOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();
        });
        return () => val.removeListener(listener);
    }, [to]);
    return <Animated.Text style={[style, { opacity: flashOpacity }]}>{display || '—'}</Animated.Text>;
}

// ── Section label ───────────────────────────────────────────────────────────

export function SectionLabel({ children }) {
    return <Text style={ui.sectionLabel}>{children}</Text>;
}

// ── Pulsing live dot (#1) ───────────────────────────────────────────────────

export function PulsingDot({ color, size = 8 }) {
    const scale = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(scale, { toValue: 1.4, duration: 1000, useNativeDriver: true }),
                Animated.timing(scale, { toValue: 1, duration: 1000, useNativeDriver: true }),
            ])
        ).start();
    }, []);
    return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, transform: [{ scale }] }} />;
}

// ── Gradient divider (#9) ───────────────────────────────────────────────────

export function GradientDivider({ color = '#06b6d4' }) {
    return (
        <LinearGradient
            colors={['transparent', color, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 1, opacity: 0.25 }}
        />
    );
}

// ── Action row with slide effect (#6) ───────────────────────────────────────

export function ActionRow({ label, color, onPress }) {
    const scale = useRef(new Animated.Value(1)).current;
    const slideX = useRef(new Animated.Value(0)).current;
    const onIn = () => {
        Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
        Animated.spring(slideX, { toValue: 4, useNativeDriver: true, speed: 50 }).start();
    };
    const onOut = () => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
    };
    return (
        <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
            <Animated.View style={[ui.actionRow, { transform: [{ scale }] }]}>
                <View style={ui.actionLeft}>
                    {color && <View style={[ui.actionDot, { backgroundColor: color }]} />}
                    <Animated.Text style={[ui.actionTitle, { transform: [{ translateX: slideX }] }]}>{label}</Animated.Text>
                </View>
                <Text style={ui.actionArrow}>›</Text>
            </Animated.View>
        </Pressable>
    );
}

// ── Thin divider ────────────────────────────────────────────────────────────

export function Divider({ thick }) {
    return <View style={[ui.divider, thick && ui.dividerThick]} />;
}

// ── Progress ring ───────────────────────────────────────────────────────────

export { default as Svg, Circle } from 'react-native-svg';

export function ProgressRing({ pct, color, size = 140, stroke = 6 }) {
    const Svg = require('react-native-svg').default;
    const Circle = require('react-native-svg').Circle;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return (
        <Svg width={size} height={size}>
            <Circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.06)" fill="none" strokeWidth={stroke} />
            <Circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, (pct||0)/100))}
                strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
        </Svg>
    );
}

// ── Shared styles ───────────────────────────────────────────────────────────

const ui = StyleSheet.create({
    sectionLabel: { fontSize: 11, fontWeight: '800', color: '#4b5563', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 },
    actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18 },
    actionLeft: { flexDirection: 'row', alignItems: 'center' },
    actionDot: { width: 8, height: 8, borderRadius: 4, marginRight: 14 },
    actionTitle: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 2 },
    actionArrow: { fontSize: 22, color: '#4b5563', fontWeight: '300' },
    divider: { height: 1, backgroundColor: '#1a1a1a' },
    dividerThick: { height: 2, backgroundColor: '#111' },
});

export { CONDENSED, MONO };
export default ui;
