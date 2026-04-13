// ActiveBharat — Global User Context (with DataBridge)
// ─────────────────────────────────────────────────────────────────────────────
// DataBridge: tracks whether we're on mock or real data.
// Real-data mode activates when athlete.sessions > 3 from API.
// All screens read from userData — one consistent source of truth.
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INITIAL_USER_DATA } from '../data/constants';
import api from '../services/api';

const FITNESS_SCORE_KEY = '@fitness_test_latest';
const STREAK_KEY = '@streak_data';

const UserContext = createContext(null);

export function UserProvider({ children }) {
    const [userData, setUserData] = useState(INITIAL_USER_DATA);
    const [recentSession, setRecentSession] = useState(null);
    const [dataMode, setDataMode] = useState('mock'); // 'mock' | 'real' | 'hybrid'
    const [fitnessScore, setFitnessScoreState] = useState({
        score: 0, level: 0, label: 'Not Tested', color: '#64748b', lastTested: null,
    });

    // On mount: load athlete data + persisted fitness score + streak
    useEffect(() => {
        AsyncStorage.getItem(FITNESS_SCORE_KEY).then(raw => {
            if (raw) { try { setFitnessScoreState(JSON.parse(raw)); } catch (_) {} }
        });
        AsyncStorage.getItem(STREAK_KEY).then(raw => {
            if (!raw) return;
            try {
                const { lastDate, streak } = JSON.parse(raw);
                const today = new Date().toISOString().slice(0, 10);
                const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
                if (lastDate === today || lastDate === yesterday) {
                    setUserData(prev => ({ ...prev, streak }));
                } else {
                    // Streak expired
                    setUserData(prev => ({ ...prev, streak: 0 }));
                }
            } catch (_) {}
        });

        api.getAthlete(INITIAL_USER_DATA.avatarId).then(athlete => {
            if (!athlete?.id) return;
            const realSessions = athlete.sessions || 0;
            const newMode = realSessions > 3 ? 'real' : realSessions > 0 ? 'hybrid' : 'mock';
            setDataMode(newMode);
            setUserData(prev => ({
                ...prev,
                bpi: athlete.bpi ?? prev.bpi,
                sessions: realSessions ?? prev.sessions,
                scoutReadiness: prev.scoutReadiness, // computed locally for now
                // name/tier/level/xp/streak stay as-is until auth is implemented
            }));
        }).catch(() => { });
    }, []);

    const addXp = useCallback((xpEarned, sessionSummary = null) => {
        setUserData(prev => {
            const newXp = prev.xp + xpEarned;
            const newBpi = (prev.bpi ?? 12450) + Math.round(xpEarned * 0.5);
            const levelUp = newXp >= prev.xpRequired && prev.level < 7;
            const newSessions = (prev.sessions ?? 0) + 1;
            // Unlock real-data mode once enough sessions are recorded
            if (newSessions > 3) setDataMode('real');
            else if (newSessions > 0) setDataMode('hybrid');
            return {
                ...prev,
                xp: newXp,
                bpi: newBpi,
                sessions: newSessions,
                level: levelUp ? prev.level + 1 : prev.level,
                xpRequired: levelUp ? Math.round(prev.xpRequired * 1.4) : prev.xpRequired,
                streak: prev.streak + 1,
                // Bump scout readiness slightly per session
                scoutReadiness: Math.min(100, prev.scoutReadiness + Math.round(xpEarned / 120)),
            };
        });
        if (sessionSummary) setRecentSession(sessionSummary);
        // Persist streak
        setUserData(curr => {
            const today = new Date().toISOString().slice(0, 10);
            AsyncStorage.setItem(STREAK_KEY, JSON.stringify({ lastDate: today, streak: curr.streak })).catch(() => {});
            return curr;
        });
    }, []);

    const updateScoutReadiness = useCallback((delta) => {
        setUserData(prev => ({
            ...prev,
            scoutReadiness: Math.min(100, Math.max(0, prev.scoutReadiness + delta)),
        }));
    }, []);

    const updateFitnessScore = useCallback((score, level, label, color) => {
        const updated = { score, level, label, color, lastTested: new Date().toISOString() };
        setFitnessScoreState(updated);
        AsyncStorage.setItem(FITNESS_SCORE_KEY, JSON.stringify(updated)).catch(() => {});
    }, []);

    return (
        <UserContext.Provider value={{ userData, addXp, updateScoutReadiness, recentSession, dataMode, fitnessScore, updateFitnessScore }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const ctx = useContext(UserContext);
    if (!ctx) {
        // Safe fallback — prevents crash if accidentally used outside provider
        return {
            userData: INITIAL_USER_DATA,
            addXp: () => {},
            updateScoutReadiness: () => {},
            recentSession: null,
            dataMode: 'mock',
            fitnessScore: { score: 0, level: 0, label: 'Not Tested', color: '#64748b', lastTested: null },
            updateFitnessScore: () => {},
        };
    }
    return ctx;
}
