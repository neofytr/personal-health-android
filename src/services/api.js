// Personal Health — API Service Layer
// All networking config is read from constants.js — edit that file to change
// your backend IP. No hardcoded addresses here.

import { Platform } from 'react-native';
import {
    BACKEND_HOST,
    FASTAPI_PORT,
    API_BASE as BASE_URL,
    WS_BASE as WS_URL,
    API_TIMEOUT,
} from '../constants';

// Direct to FastAPI backend
export const API_BASE = BASE_URL;

// WebSocket direct to FastAPI (no proxy — proxy causes issues with WS paths)
const WS_BASE_RESOLVED = `ws://${BACKEND_HOST}:${FASTAPI_PORT}`;

// ─── Core fetch helper ───────────────────────────────────────────────────────
async function fetchJSON(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT);
    try {
        const res = await fetch(`${API_BASE}${path}`, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            signal: controller.signal,
            ...options,
        });
        clearTimeout(timer);
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${text}`);
        }
        return await res.json();
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
            console.warn(`[API] Timeout: ${path}`);
        } else {
            console.warn(`[API] ${path} ->`, err.message);
        }
        return null;
    }
}

// ─── Session API ─────────────────────────────────────────────────────────────
export const api = {
    /** Check if API is reachable */
    ping: () => fetchJSON('/health'),

    /** Start a new session, returns { session_id, sport, athlete_id } */
    startSession: (athlete_id, sport) => fetchJSON('/session/start', {
        method: 'POST',
        body: JSON.stringify({ athlete_id, sport }),
    }),

    /**
     * Send one biomechanical frame to the server (V1 HTTP mode).
     * frameData can contain image_b64 for server-side MediaPipe processing.
     */
    sendFrame: (sessionId, frameData) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        return fetch(`${API_BASE}/session/${sessionId}/frame`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(frameData),
            signal: controller.signal,
        })
            .then(res => { clearTimeout(timer); return res.ok ? res.json() : null; })
            .catch(err => { clearTimeout(timer); return null; });
    },

    /**
     * Poll latest AI analysis result for a session.
     * Call every 3-4s after sending frames.
     */
    getLatestResult: (sessionId) =>
        fetchJSON(`/session/${sessionId}/latest-result`),

    /** Ghost Skeleton calibration — returns keypoints + deviations without session */
    calibrate: (imageB64) => fetchJSON('/session/calibrate', {
        method: 'POST',
        body: JSON.stringify({ image_b64: imageB64 }),
    }),

    /** rPPG heart rate: WebSocket stream. Sends image frames, receives BPM/HRV metrics. */
    connectRPPGLiveStream: (sessionId, onMessage, onError, onClose) => {
        const wsUrl = `${WS_BASE_RESOLVED}/rppg/live-stream/${sessionId}`;
        console.log(`[WS-RPPG] Connecting: ${wsUrl}`);

        const ws = new WebSocket(wsUrl);
        ws.onopen  = () => console.log(`[WS-RPPG] Connected: session ${sessionId}`);
        ws.onmessage = (e) => {
            try { onMessage(JSON.parse(e.data)); } catch (_) {}
        };
        ws.onerror = (e) => {
            console.warn('[WS-RPPG] Error:', e.message);
            if (onError) onError(e);
        };
        ws.onclose = () => {
            console.log('[WS-RPPG] Closed');
            if (onClose) onClose();
        };
        return ws;
    },

    /** End session, returns summary with avg_form_score, xp_earned, etc. */
    endSession: (sessionId) =>
        fetchJSON(`/session/${sessionId}/end`, { method: 'POST' }),

    /** Fetch session history for an athlete */
    getSessions: (athleteId, limit = 10) =>
        fetchJSON(`/sessions?athlete_id=${athleteId}&status=completed&limit=${limit}`),

    /** Fetch a single athlete's profile */
    getAthlete: (id) => fetchJSON(`/athlete/${id}`),

    /** Fetch all athletes */
    getAthletes: () => fetchJSON('/athletes'),

    /** Leaderboard — sport is optional */
    getLeaderboard: (sport = '') =>
        fetchJSON(`/leaderboard${sport ? `?sport=${encodeURIComponent(sport)}` : ''}`),

    /** Banner check for HomeScreen connectivity widget */
    getBanner: () => fetchJSON('/banner'),

    // ─── Daily Tracker ───────────────────────────────────────────────────
    getDailyTracker: (athleteId) =>
        fetchJSON(`/athlete/${athleteId}/daily-tracker`),

    updateDailyTracker: (athleteId, data) =>
        fetchJSON(`/athlete/${athleteId}/daily-tracker`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // ─── Fitness Test ────────────────────────────────────────────────────
    submitFitnessTest: (athleteId, results) =>
        fetchJSON('/fitness-test', {
            method: 'POST',
            body: JSON.stringify({ athlete_id: athleteId, ...results }),
        }),

    getFitnessTestHistory: (athleteId) =>
        fetchJSON(`/fitness-test/history/${athleteId}`),

    // ─── Playfields ──────────────────────────────────────────────────────
    getPlayfields: (lat, lng, radius = 5) =>
        fetchJSON(`/playfields?lat=${lat}&lng=${lng}&radius=${radius}`),

    // ─── PE Classes ──────────────────────────────────────────────────────
    getClasses: (athleteId) =>
        fetchJSON(`/classes?athlete_id=${encodeURIComponent(athleteId)}`),

    // ─── Social Feed ─────────────────────────────────────────────────────
    getFeed: (athleteId, tab = 'for_you', page = 1) =>
        fetchJSON(`/feed?athlete_id=${encodeURIComponent(athleteId)}&tab=${tab}&page=${page}`),

    getTrendingCreators: () =>
        fetchJSON('/creators/trending'),

    followCreator: (athleteId, creatorId) =>
        fetchJSON('/follow', {
            method: 'POST',
            body: JSON.stringify({ follower: athleteId, following: creatorId }),
        }),

    // ─── Dynamic Training Plan ───────────────────────────────────────────
    /** Get this week's personalized training plan (generates if missing) */
    getWeeklyPlan: (athleteId) =>
        fetchJSON(`/plan/${athleteId}/weekly`),

    /** Force a fresh plan for the current week */
    regeneratePlan: (athleteId) =>
        fetchJSON(`/plan/${athleteId}/regenerate`, { method: 'POST' }),

    /** Mark a plan day as completed (adherence tracking) */
    completePlanDay: (athleteId, dateStr) =>
        fetchJSON(`/plan/${athleteId}/day/${dateStr}/complete`, { method: 'POST' }),

    /** Fetch up to N past weeks of plans */
    getPlanHistory: (athleteId, limit = 4) =>
        fetchJSON(`/plan/${athleteId}/history?limit=${limit}`),

    // ─── Progress & Readiness ──────────────────────────────────────────
    /** Multi-day form trend, BPI curve, session stats */
    getProgress: (id, days = 30) =>
        fetchJSON(`/progress/${id}?days=${days}`),

    /** Joints deviating most from ideal ranges */
    getWeakJoints: (id, days = 30) =>
        fetchJSON(`/weak-joints/${id}?days=${days}`),

    /** Injury risk band + symmetry deviation */
    getInjuryRisk: (id, days = 14) =>
        fetchJSON(`/injury-risk/${id}?days=${days}`),

    /** Competition readiness score with component breakdown */
    getReadiness: (id, days = 14) =>
        fetchJSON(`/readiness/${id}?days=${days}`),

    // ─── Weekly Summary ────────────────────────────────────────────────
    /** Structured weekly recap with coaching note */
    getWeeklySummary: (athleteId, days = 7) =>
        fetchJSON(`/athlete/${athleteId}/weekly-summary?days=${days}`),

    // ─── Progressive Load ────────────────────────────────────────────────
    /** ACWR-based load recommendation */
    getLoadRecommendation: (athleteId) =>
        fetchJSON(`/athlete/${athleteId}/load-recommendation`),

    // ─── Score Card ──────────────────────────────────────────────────────
    /** Get JSON scorecard data for a completed session */
    getScorecard: (sessionId) =>
        fetchJSON(`/session/${sessionId}/scorecard`),

    /** Get scorecard PNG URL (for sharing) */
    getScorecardImageUrl: (sessionId) =>
        `${API_BASE}/session/${sessionId}/scorecard.png`,

    // ─── Huddle Mode ─────────────────────────────────────────────────────
    /** Create a group training huddle */
    createHuddle: (name, sport, coachId = null) =>
        fetchJSON('/huddle/create', {
            method: 'POST',
            body: JSON.stringify({ name, sport, coach_id: coachId }),
        }),

    /** Join an existing huddle */
    joinHuddle: (huddleId, athleteId) =>
        fetchJSON(`/huddle/${huddleId}/join`, {
            method: 'POST',
            body: JSON.stringify({ athlete_id: athleteId }),
        }),

    /** Get live huddle leaderboard */
    getHuddleLive: (huddleId) =>
        fetchJSON(`/huddle/${huddleId}/live`),

    /** List all huddles */
    getHuddles: (status = '') =>
        fetchJSON(`/huddles${status ? `?status=${status}` : ''}`),

    // ─── Nutrition AI ────────────────────────────────────────────────────
    /** Analyze food photo via Claude vision */
    analyzeFood: (athleteId, imageBase64) =>
        fetchJSON('/nutrition/analyze', {
            method: 'POST',
            body: JSON.stringify({ athlete_id: athleteId, image_b64: imageBase64 }),
        }),

    // ─── Data Export ─────────────────────────────────────────────────────
    /** Get dataset stats (data flywheel monitoring) */
    getExportStats: () =>
        fetchJSON('/admin/export/stats'),

    /** Biomechanics live stream: WebSocket for real-time keypoint/pose data. */
    connectLiveStream: (sessionId, onMessage, onError, onClose) => {
        const wsUrl = `${WS_BASE_RESOLVED}/session/${sessionId}/live-stream`;
        console.log(`[WS-STREAM] Connecting: ${wsUrl}`);

        const ws = new WebSocket(wsUrl);
        ws.onopen  = () => console.log(`[WS-STREAM] Connected: session ${sessionId}`);
        ws.onmessage = (e) => {
            try { onMessage(JSON.parse(e.data)); } catch (_) {}
        };
        ws.onerror = (e) => {
            console.warn('[WS-STREAM] Error:', e.message);
            if (onError) onError(e);
        };
        ws.onclose = () => {
            console.log('[WS-STREAM] Closed');
            if (onClose) onClose();
        };
        return ws;
    },
};

export default api;
