(function () {
    'use strict';

    const BASE = '/api';
    const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

    let accessToken  = localStorage.getItem('anijett_access_token');
    let refreshToken = localStorage.getItem('anijett_refresh_token');
    let isRefreshing = false;
    let refreshQueue = [];

    function setTokens(at, rt) {
        accessToken  = at;
        refreshToken = rt;
        if (at) localStorage.setItem('anijett_access_token', at);
        else     localStorage.removeItem('anijett_access_token');
        if (rt) localStorage.setItem('anijett_refresh_token', rt);
        else     localStorage.removeItem('anijett_refresh_token');
    }

    function clearTokens() {
        setTokens(null, null);
        localStorage.removeItem('anijett_user');
        window.dispatchEvent(new Event('auth:logout'));
    }

    /**
     * Fetch with an AbortController-based timeout.
     * Rejects with a DOMException (AbortError) if the timeout fires.
     */
    function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, { ...options, signal: controller.signal })
            .finally(() => clearTimeout(timer));
    }

    async function doRefresh() {
        if (!refreshToken) { clearTokens(); throw new Error('No refresh token'); }
        let r;
        try {
            r = await fetchWithTimeout(`${BASE}/auth/refresh`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ refreshToken }),
            });
        } catch (err) {
            clearTokens();
            throw new Error(err.name === 'AbortError' ? 'Refresh timed out' : 'Refresh failed');
        }
        if (!r.ok) { clearTokens(); throw new Error('Refresh failed'); }
        const data = await r.json();
        setTokens(data.accessToken, data.refreshToken);
        return data.accessToken;
    }

    async function request(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        let response;
        try {
            response = await fetchWithTimeout(`${BASE}${path}`, { ...options, headers }, timeoutMs);
        } catch (err) {
            if (err.name === 'AbortError') {
                const e = new Error('Request timed out');
                e.status = 408;
                throw e;
            }
            const e = new Error('Network error — check your connection');
            e.status = 0;
            throw e;
        }

        // Attempt token refresh on 401
        if (response.status === 401 && refreshToken) {
            if (!isRefreshing) {
                isRefreshing = true;
                try {
                    const newToken = await doRefresh();
                    refreshQueue.forEach(fn => fn(newToken));
                    refreshQueue = [];
                } catch (e) {
                    refreshQueue.forEach(fn => fn(null));
                    refreshQueue = [];
                    isRefreshing = false;
                    throw e;
                }
                isRefreshing = false;
            } else {
                // Queue concurrent requests while a refresh is already in flight
                await new Promise(resolve => refreshQueue.push(resolve));
            }

            if (!accessToken) throw new Error('Not authenticated');
            headers['Authorization'] = `Bearer ${accessToken}`;
            try {
                response = await fetchWithTimeout(`${BASE}${path}`, { ...options, headers }, timeoutMs);
            } catch (err) {
                if (err.name === 'AbortError') {
                    const e = new Error('Request timed out');
                    e.status = 408;
                    throw e;
                }
                throw err;
            }
        }

        if (response.status === 204) return null;

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: response.statusText }));
            const e = new Error(err.error || 'Request failed');
            e.status = response.status;
            e.data   = err;
            throw e;
        }

        return response.json();
    }

    /**
     * Upload FormData (e.g. file upload). Omits Content-Type so the browser
     * sets the correct multipart boundary automatically.
     */
    async function upload(path, formData, timeoutMs = 120_000) {
        const headers = {};
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
        let response;
        try {
            response = await fetchWithTimeout(
                `${BASE}${path}`,
                { method: 'POST', headers, body: formData },
                timeoutMs
            );
        } catch (err) {
            if (err.name === 'AbortError') {
                const e = new Error('Upload timed out');
                e.status = 408;
                throw e;
            }
            throw err;
        }
        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: response.statusText }));
            const e = new Error(err.error || 'Upload failed');
            e.status = response.status;
            e.data   = err;
            throw e;
        }
        return response.json();
    }

    window.API = {
        auth: {
            sendCode:   (email) =>
                request('/auth/send-code', { method: 'POST', body: JSON.stringify({ email }) }),
            verifyCode: (email, code) =>
                request('/auth/verify-code', { method: 'POST', body: JSON.stringify({ email, code }) }),
            register:   (username, email, password, code) =>
                request('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password, code }) }),
            login:      (login, password) =>
                request('/auth/login', { method: 'POST', body: JSON.stringify({ login, password }) }),
            me:         () => request('/auth/me'),
            logout:     async () => {
                try { await request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }); } catch {}
                clearTokens();
            },
        },
        anime: {
            list:   (params = {}) => {
                const q = new URLSearchParams(params).toString();
                return request(`/anime${q ? '?' + q : ''}`);
            },
            get:    (id) => request(`/anime/${id}`),
            search: (query) => request(`/anime?search=${encodeURIComponent(query)}&limit=20`),
        },
        bookmarks: {
            list:   (status) => request('/bookmarks' + (status && status !== 'all' ? `?status=${status}` : '')),
            stats:  () => request('/bookmarks/stats'),
            set:    (anime_id, status, episodes_watched = 0) =>
                request('/bookmarks', { method: 'POST', body: JSON.stringify({ anime_id, status, episodes_watched }) }),
            remove: (animeId) => request(`/bookmarks/${animeId}`, { method: 'DELETE' }),
        },
        comments: {
            list:   (animeId, page = 1) => request(`/comments/${animeId}?page=${page}`),
            post:   (animeId, text, parent_id) =>
                request(`/comments/${animeId}`, {
                    method: 'POST',
                    body:   JSON.stringify(parent_id ? { text, parent_id } : { text }),
                }),
            react:  (commentId, reaction) =>
                request(`/comments/${commentId}/react`, { method: 'POST', body: JSON.stringify({ reaction }) }),
            edit:   (commentId, text) =>
                request(`/comments/${commentId}`, { method: 'PUT', body: JSON.stringify({ text }) }),
            delete: (commentId) => request(`/comments/${commentId}`, { method: 'DELETE' }),
        },
        ratings: {
            get:    (animeId) => request(`/ratings/${animeId}`),
            set:    (anime_id, score) =>
                request('/ratings', { method: 'POST', body: JSON.stringify({ anime_id, score }) }),
            remove: (animeId) => request(`/ratings/${animeId}`, { method: 'DELETE' }),
        },
        notifications: {
            list:       () => request('/notifications'),
            unreadCount:() => request('/notifications?unread=true'),
            markRead:   (id) => request(`/notifications/${id}/read`, { method: 'PUT' }),
            markAllRead:() => request('/notifications/read-all', { method: 'PUT' }),
            delete:     (id) => request(`/notifications/${id}`, { method: 'DELETE' }),
            clearAll:   () => request('/notifications', { method: 'DELETE' }),
        },
        subscriptions: {
            list:        () => request('/subscriptions'),
            subscribe:   (anime_id) =>
                request('/subscriptions', { method: 'POST', body: JSON.stringify({ anime_id }) }),
            unsubscribe: (animeId) => request(`/subscriptions/${animeId}`, { method: 'DELETE' }),
            check:       (animeId) => request(`/subscriptions/check/${animeId}`),
        },
        users: {
            me:     () => request('/users/me'),
            get:    (id) => request(`/users/${id}`),
            update: (data) => request('/users/me', { method: 'PUT', body: JSON.stringify(data) }),
        },
        push: {
            vapidKey:    () => request('/push/vapid-public-key'),
            subscribe:   (subscription) =>
                request('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }),
            unsubscribe: (endpoint) =>
                request('/push/unsubscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) }),
        },
        episodes: {
            list:   (animeId, season) =>
                request(`/episodes/${animeId}` + (season ? `?season=${season}` : '')),
            get:    (animeId, season, episode) =>
                request(`/episodes/${animeId}/${season}/${episode}`),
            save:   (animeId, data) =>
                request(`/episodes/${animeId}`, { method: 'POST', body: JSON.stringify(data) }),
            delete: (animeId, season, episode) =>
                request(`/episodes/${animeId}/${season}/${episode}`, { method: 'DELETE' }),
        },
        admin: {
            stats:        () => request('/admin/stats'),
            importTop:    (page = 1, limit = 25) =>
                request('/admin/anime/import/top', { method: 'POST', body: JSON.stringify({ page, limit }) }),
            importSearch: (q, limit = 10) =>
                request('/admin/anime/import/search', { method: 'POST', body: JSON.stringify({ q, limit }) }),
        },
        /** Upload a file as multipart/form-data. */
        upload,
        setTokens,
        clearTokens,
        getToken: () => accessToken,
    };
})();
