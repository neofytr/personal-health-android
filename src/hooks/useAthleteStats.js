// useAthleteStats — shared hook for progress, streak, recovery, and injury risk
// Centralises the three most-fetched analytics endpoints so screens don't each
// manage their own loading / error state for the same data.

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { getOrCreateAnonymousAthleteId } from '../services/deviceIdentity';

const DEFAULT_STATE = {
    progress: null,
    streak: null,
    recovery: null,
    injuryRisk: null,
    loading: true,
    error: null,
};

export function useAthleteStats({ athleteId: propAthleteId = null, days = 30 } = {}) {
    const [athleteId, setAthleteId] = useState(propAthleteId);
    const [state, setState] = useState(DEFAULT_STATE);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (!propAthleteId) {
            getOrCreateAnonymousAthleteId()
                .then(id => { if (mountedRef.current) setAthleteId(id); })
                .catch(() => {});
        }
    }, [propAthleteId]);

    const fetch = useCallback(async (id) => {
        if (!id) return;
        setState(s => ({ ...s, loading: true, error: null }));
        try {
            const [progress, streak, recovery, injuryRisk] = await Promise.allSettled([
                api.get(`/progress/${id}?days=${days}`),
                api.get(`/streak/${id}`),
                api.get(`/athlete/${id}/recovery/recommendation`),
                api.get(`/injury-risk/${id}`),
            ]);

            if (!mountedRef.current) return;
            setState({
                progress: progress.status === 'fulfilled' ? progress.value : null,
                streak: streak.status === 'fulfilled' ? streak.value : null,
                recovery: recovery.status === 'fulfilled' ? recovery.value : null,
                injuryRisk: injuryRisk.status === 'fulfilled' ? injuryRisk.value : null,
                loading: false,
                error: null,
            });
        } catch (e) {
            if (!mountedRef.current) return;
            setState(s => ({ ...s, loading: false, error: e?.message || 'Failed to load stats' }));
        }
    }, [days]);

    useEffect(() => {
        if (athleteId) fetch(athleteId);
    }, [athleteId, fetch]);

    const refetch = useCallback(() => {
        if (athleteId) fetch(athleteId);
    }, [athleteId, fetch]);

    return { ...state, athleteId, refetch };
}
