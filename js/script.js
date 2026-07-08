(function() {
    'use strict';

    // ======================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ========================
    function applyFormatting(text) {
        let f = text;
        f = f.replace(/\|\|(.+?)\|\|/gs, '<span class="spoiler">$1</span>');
        f = f.replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>');
        f = f.replace(/__(.+?)__/gs, '<u>$1</u>');
        f = f.replace(/~~(.+?)~~/gs, '<s>$1</s>');
        f = f.replace(/\*(.+?)\*/gs, '<i>$1</i>');
        return f;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function mentionHighlight(text) {
        return text.replace(/@([\wа-яёА-ЯЁ\d_]+)/giu, '<span class="mention">@$1</span>');
    }

    function timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'только что';
        if (mins < 60) return `${mins} мин. назад`;
        const h = Math.floor(mins / 60);
        if (h < 24) return `${h} ч. назад`;
        const d = Math.floor(h / 24);
        if (d < 7) return `${d} д. назад`;
        return new Date(dateStr).toLocaleDateString('ru-RU');
    }

    function statusLabel(s) {
        return { completed: 'Завершён', ongoing: 'Онгоинг', announced: 'Анонс', dropped: 'Отменён' }[s] || s || 'Неизвестно';
    }

    function typeLabel(t) {
        return { tv: 'ТВ-сериал', movie: 'Фильм', ova: 'OVA', ona: 'ONA', special: 'Спецвыпуск' }[t] || t || 'ТВ-сериал';
    }

    function normalizeAnime(item) {
        if (!item) return null;
        return {
            ...item,
            poster: item.poster_url || item.poster || 'https://via.placeholder.com/200x300/1a1a20/ff5e57?text=Anime',
            banner: item.banner_url || item.banner || null,
            title: item.title_ru || item.title || '',
            titleOriginal: item.title_en || item.title || '',
            status: statusLabel(item.status),
            type: typeLabel(item.type),
            rating: parseFloat(item.rating_avg || item.rating || 0).toFixed(1),
            genres: Array.isArray(item.genres) ? item.genres : (item.genres ? [item.genres] : []),
            studio: (item.studios && item.studios[0]) || item.studio || 'Неизвестно',
            episodes: item.episodes_count || item.episodes || '?',
            year: item.year || (item.aired_from ? new Date(item.aired_from).getFullYear() : ''),
            release: item.aired_from ? new Date(item.aired_from).toLocaleDateString('ru-RU') : (item.release || 'TBA'),
            ageRating: item.age_rating || item.ageRating || '',
            mpaaRating: item.mpaa_rating || item.mpaaRating || '',
            duration: item.duration_min ? `${item.duration_min} мин. ~ серия` : (item.duration || ''),
            description: item.description || '',
            kodikId: item.kodik_id || item.kodikId || '',
            episodesMeta: item.episodesMeta || {},
            airDay: item.airDay || 0,
            mainCharacters: Array.isArray(item.mainCharacters) ? item.mainCharacters : [],
            source: item.source || 'Оригинал',
            director: item.director || '',
            voice: item.voice || '',
            season: item.season || '',
            originalAuthor: item.originalAuthor || '',
        };
    }

    const REACTION_EMOJIS = [
        { key: 'fire', emoji: '🔥', label: 'Огонь' },
        { key: 'horror', emoji: '😱', label: 'Шок' },
        { key: 'poop', emoji: '💩', label: 'Фу' },
        { key: 'heart', emoji: '❤️', label: 'Любовь' },
        { key: 'laugh', emoji: '😂', label: 'Смех' },
        { key: 'sad', emoji: '😢', label: 'Грусть' },
    ];

    // ======================== БАЗА ДАННЫХ (кэш) ========================
    let animeDatabase = [];
    let mangaDatabase = [
        { id: 101, title: 'Берсерк', poster: 'img/posters/berserk.jpg', year: 1989, status: 'Продолжается', type: 'Манга', rating: 9.2 },
        { id: 102, title: 'Ванпанчмен', poster: 'img/posters/opm_manga.jpg', year: 2012, status: 'Продолжается', type: 'Манга', rating: 8.9 },
        { id: 103, title: 'Магическая битва', poster: 'img/posters/jjk_manga.jpg', year: 2018, status: 'Завершён', type: 'Манга', rating: 8.8 },
        { id: 104, title: 'Клинок, рассекающий демонов', poster: 'img/posters/demonslayer_manga.jpg', year: 2016, status: 'Завершён', type: 'Манга', rating: 9.0 }
    ];

    // ======================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ========================
    let currentView = 'home';
    let currentAnimeId = null;
    let bookmarks = JSON.parse(localStorage.getItem('anime_bookmarks')) || {};
    let subscriptions = JSON.parse(localStorage.getItem('anime_subscriptions')) || {};
    let activeFilter = 'all';
    let popupTargetAnimeId = null;
    let currentUser = JSON.parse(localStorage.getItem('anijett_user')) || null;
    let activeAnimeTab = 'all';
    let activeBookmarksType = 'anime';

    const views = {
        home: document.getElementById('view-home'),
        anime: document.getElementById('view-anime'),
        manga: document.getElementById('view-manga'),
        bookmarks: document.getElementById('view-bookmarks'),
        auth: document.getElementById('view-auth'),
        profile: document.getElementById('view-profile'),
        animeDetails: document.getElementById('view-anime-details'),
        'footer-page': document.getElementById('view-footer-page')
    };
    const filtersHeader = document.getElementById('bookmarksFiltersHeader');
    const animeFiltersHeader = document.getElementById('animeFiltersHeader');
    const popup = document.getElementById('bookmarkPopup');
    const filterNameSpan = document.getElementById('filterNameSpan');

    window.popup = popup;

    // ======================== ЗАГРУЗКА АНИМЕ ========================
    async function loadAnimeDatabase() {
        if (animeDatabase.length > 0) return;
        try {
            const data = await API.anime.list({ limit: 200 });
            const items = data.data || data.anime || data || [];
            animeDatabase = items.map(normalizeAnime).filter(Boolean);
        } catch(e) {
            console.warn('Не удалось загрузить аниме с сервера:', e.message);
        }
    }

    // ======================== UI АВТОРИЗАЦИИ ========================
    function updateAuthUI() {
        const container = document.getElementById('authBlock');
        if (!container) return;
        if (currentUser) {
            const avatarUrl = currentUser.avatar_url || currentUser.avatar || './img/anj-favicon.png';
            const nick = currentUser.username || currentUser.nickname || currentUser.email?.split('@')[0] || 'Пользователь';
            container.innerHTML = `
                <div class="user-profile-wrapper">
                    <div class="user-profile" id="userProfileBtn">
                        <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(nick)}" onerror="this.src='./img/anj-favicon.png'">
                        <span class="user-nickname">${escapeHtml(nick)}</span>
                        <i class="fas fa-chevron-down" style="font-size: 12px; color: var(--text-dim);"></i>
                    </div>
                    <div class="profile-dropdown-menu hidden" id="profileDropdown">
                        <div class="profile-dropdown-item" data-action="profile"><i class="fas fa-user"></i> Профиль</div>
                        <div class="profile-dropdown-divider"></div>
                        <div class="profile-dropdown-item" data-action="logout"><i class="fas fa-sign-out-alt"></i> Выйти</div>
                        <div class="profile-dropdown-divider"></div>
                        <a href="https://t.me/anijett" target="_blank" class="profile-dropdown-item"><i class="fab fa-telegram-plane"></i> Telegram</a>
                        <a href="https://lolka.gg/SyMrCgh" target="_blank" class="profile-dropdown-item"><img src="./img/anj-favicon.png?v=10" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;border-radius:3px;"> Lolka</a>
                        <a href="https://discord.gg/anijett" target="_blank" class="profile-dropdown-item"><i class="fab fa-discord"></i> Discord</a>
                    </div>
                </div>
            `;
            const btn = document.getElementById('userProfileBtn');
            const dropdown = document.getElementById('profileDropdown');
            btn.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('hidden'); });
            document.addEventListener('click', (e) => {
                if (!btn.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.add('hidden');
            });
            dropdown.querySelectorAll('.profile-dropdown-item[data-action]').forEach(item => {
                item.addEventListener('click', () => {
                    const action = item.dataset.action;
                    dropdown.classList.add('hidden');
                    if (action === 'profile') navigateTo('/profile');
                    else if (action === 'logout') doLogout();
                });
            });
        } else {
            container.innerHTML = `<button class="login-btn" id="loginBtn"><i class="fas fa-sign-in-alt"></i> Вход</button>`;
            document.getElementById('loginBtn').addEventListener('click', () => navigateTo('/auth'));
        }
    }

    async function doLogout() {
        try { await API.auth.logout(); } catch {}
        currentUser = null;
        localStorage.removeItem('anijett_user');
        bookmarks = {};
        localStorage.removeItem('anime_bookmarks');
        updateAuthUI();
        refreshNotifBadge();
        navigateTo('/');
    }

    window.addEventListener('auth:logout', () => {
        currentUser = null;
        localStorage.removeItem('anijett_user');
        bookmarks = {};
        updateAuthUI();
        refreshNotifBadge();
    });

    // ======================== UID ========================
    function getOrCreateUID() {
        let uid = localStorage.getItem('anijett_uid');
        if (!uid) {
            uid = 'ANJ-' + Math.random().toString(36).substr(2, 8).toUpperCase();
            localStorage.setItem('anijett_uid', uid);
        }
        return uid;
    }

    // ======================== ГЕЙМИФИКАЦИЯ ========================
    function getUserStats() {
        return JSON.parse(localStorage.getItem('user_stats')) || { watched: 0, comments: 0, likes: 0 };
    }
    function updateStat(key, delta = 1) {
        const stats = getUserStats();
        stats[key] = (stats[key] || 0) + delta;
        localStorage.setItem('user_stats', JSON.stringify(stats));
    }

    // ======================== PUSH-УВЕДОМЛЕНИЯ ========================
    function showNotification(title, body) {
        if (Notification.permission === 'granted') {
            new Notification(title, { body, icon: 'img/anj-favicon.png' });
        }
    }

    function requestNotificationPermission() {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    async function subscribeToPush() {
        if (!currentUser || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
        try {
            const reg = await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            if (existing) return;
            const keyData = await API.push.vapidKey();
            const key = keyData.publicKey;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(key)
            });
            await API.push.subscribe(sub.toJSON());
        } catch(e) { /* Push подписка не обязательна */ }
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const out = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
        return out;
    }

    // ======================== НЕЧЁТКИЙ ПОИСК ========================
    function levenshtein(a, b) {
        const dp = Array(a.length+1).fill().map(() => Array(b.length+1).fill(0));
        for(let i=0;i<=a.length;i++) dp[i][0]=i;
        for(let j=0;j<=b.length;j++) dp[0][j]=j;
        for(let i=1;i<=a.length;i++)
            for(let j=1;j<=b.length;j++)
                dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(a[i-1]!==b[j-1]?1:0));
        return dp[a.length][b.length];
    }
    function fuzzySearch(query, item) {
        const title = item.title.toLowerCase();
        const q = query.toLowerCase();
        if (title.includes(q)) return 0;
        const words = title.split(/\s+/);
        for (const word of words) {
            if (word.includes(q) || q.includes(word)) return 0;
            const tol = Math.max(1, Math.floor(Math.min(q.length, word.length) / 3));
            if (levenshtein(q, word) <= tol) return 1;
            if (q.length >= 3 && levenshtein(q, word.substring(0, q.length)) <= tol) return 1;
        }
        const gt = Math.max(1, Math.floor(q.length / 3));
        if (levenshtein(q, title.substring(0, q.length)) <= gt) return 1;
        return Infinity;
    }

    // ======================== РОУТЕР ========================
    function navigateTo(path) {
        let route = path.replace(/^\/+/, '') || 'home';
        const animeMatch = route.match(/^anime\/([^/]+)$/);
        if (animeMatch) {
            const animeId = animeMatch[1];
            showAnimeDetails(animeId);
            window.history.pushState({ view: 'anime-details', id: animeId }, '', `/${route}`);
            updateActiveNav(null);
            return;
        }
        const footerMatch = route.match(/^footer\/(.+)$/);
        if (footerMatch) {
            const fullPath = `/${route}`;
            showFooterPage(fullPath);
            window.history.pushState({ view: 'footer-page', path: fullPath }, '', fullPath);
            updateActiveNav(null);
            return;
        }
        const routeMap = { 'home':'home', 'anime':'anime', 'manga':'manga', 'bookmarks':'bookmarks', 'auth':'auth', 'profile':'profile' };
        const viewName = routeMap[route] || 'home';
        showView(viewName);
        window.history.pushState({ view: viewName }, '', viewName === 'home' ? '/' : `/${viewName}`);
        updateActiveNav(viewName);
    }

    function showView(viewName) {
        Object.values(views).forEach(v => { if (v) v.style.display = 'none'; });
        if (views[viewName]) views[viewName].style.display = 'block';
        else { console.warn('Секция не найдена:', viewName); return; }
        currentView = viewName;
        if (filtersHeader) filtersHeader.style.display = viewName === 'bookmarks' ? 'block' : 'none';
        if (animeFiltersHeader) animeFiltersHeader.style.display = viewName === 'anime' ? 'block' : 'none';
        if (viewName === 'home') renderHomeGrid();
        else if (viewName === 'anime') renderAnimePageGrid(activeAnimeTab);
        else if (viewName === 'manga') renderMangaGrid();
        else if (viewName === 'bookmarks') renderBookmarksGrid();
        else if (viewName === 'auth') renderAuthForms();
        else if (viewName === 'profile') renderProfilePage();
    }

    async function showAnimeDetails(animeId) {
        Object.values(views).forEach(v => { if (v) v.style.display = 'none'; });
        views.animeDetails.style.display = 'block';
        currentView = 'anime-details';
        currentAnimeId = animeId;
        if (filtersHeader) filtersHeader.style.display = 'none';
        if (animeFiltersHeader) animeFiltersHeader.style.display = 'none';

        const container = document.querySelector('#view-anime-details .full-width');
        if (container) {
            container.innerHTML = `<div style="padding:100px 0;text-align:center;"><i class="fas fa-spinner fa-spin" style="font-size:36px;color:var(--primary)"></i><p style="margin-top:16px;color:var(--text-dim)">Загружаем аниме...</p></div>`;
        }

        let anime = animeDatabase.find(a => String(a.id) === String(animeId));
        if (!anime) {
            try {
                const raw = await API.anime.get(animeId);
                anime = normalizeAnime(raw);
                animeDatabase.push(anime);
            } catch(e) {
                if (container) container.innerHTML = `<div style="padding:80px 0;text-align:center;color:var(--text-dim)">Аниме не найдено. <button class="btn-primary" onclick="navigateTo('/')">На главную</button></div>`;
                return;
            }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        renderAnimeDetails(anime);
    }

    function updateActiveNav(viewName) {
        document.querySelectorAll('[data-nav-link]').forEach(link => {
            const li = link.closest('li');
            if (li) li.classList.toggle('active', link.dataset.navLink === viewName);
        });
    }

    function initNavigation() {
        document.querySelectorAll('[data-nav-link]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(link.dataset.navLink);
            });
        });

        document.querySelectorAll('.footer-spa-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(link.getAttribute('href'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        window.addEventListener('popstate', (e) => {
            const state = e.state;
            if (state && state.view === 'footer-page' && state.path) {
                showFooterPage(state.path); updateActiveNav(null);
            } else if (state && state.view === 'anime-details' && state.id) {
                showAnimeDetails(state.id); updateActiveNav(null);
            } else if (state && state.view) {
                showView(state.view); updateActiveNav(state.view);
            } else {
                const path = window.location.pathname;
                const m = path.match(/^\/anime\/([^/]+)$/);
                const fp = path.match(/^\/footer\/(.+)$/);
                if (m) { showAnimeDetails(m[1]); updateActiveNav(null); }
                else if (fp) { showFooterPage(path); updateActiveNav(null); }
                else { showView('home'); updateActiveNav('home'); }
            }
        });

        const path = window.location.pathname;
        const m = path.match(/^\/anime\/([^/]+)$/);
        const fp = path.match(/^\/footer\/(.+)$/);
        if (m) showAnimeDetails(m[1]);
        else if (fp) showFooterPage(path);
        else navigateTo(path);
    }

    // ======================== РЕНДЕРИНГ КАРТОЧЕК ========================
    function renderAnimeCards(dataArray, containerId, type = 'anime') {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!dataArray || dataArray.length === 0) {
            container.innerHTML = '<p style="color:var(--text-dim);padding:40px;text-align:center;">Ничего не найдено</p>';
            return;
        }
        let html = '';
        dataArray.forEach(item => {
            const isBookmarked = type === 'anime' && bookmarks.hasOwnProperty(String(item.id));
            const posterSrc = item.poster_url || item.poster || 'https://via.placeholder.com/200x300/1a1a20/ff5e57?text=Anime';
            const itemStatus = type === 'anime' ? statusLabel(item.status) : item.status;
            html += `
                <div class="anime-card" data-id="${escapeHtml(String(item.id))}" data-type="${type}">
                    <div class="card-poster">
                        <img src="${escapeHtml(posterSrc)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.src='https://via.placeholder.com/200x300/1a1a20/ff5e57?text=${type === 'anime' ? 'Anime' : 'Manga'}'">
                        <span class="card-badge">${escapeHtml(itemStatus)}</span>
                        ${type === 'anime' ? `
                        <button class="bookmark-toggle" data-id="${escapeHtml(String(item.id))}">
                            <i class="fas fa-bookmark" style="color: ${isBookmarked ? 'var(--primary)' : 'rgba(255,255,255,0.7)'};"></i>
                        </button>` : ''}
                    </div>
                    <div class="card-body">
                        <div class="card-title">${escapeHtml(item.title)}</div>
                        <div class="card-meta"><span>${item.year || ''}</span></div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

        container.querySelectorAll('.anime-card').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left, y = e.clientY - rect.top;
                const cx = rect.width / 2, cy = rect.height / 2;
                card.style.transform = `perspective(1000px) rotateX(${(cy-y)/15}deg) rotateY(${(x-cx)/15}deg) scale(1.01)`;
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
            });
            card.addEventListener('click', (e) => {
                if (e.target.closest('.bookmark-toggle')) return;
                if (card.dataset.type === 'anime') {
                    navigateTo(`/anime/${card.dataset.id}`);
                    updateStat('watched');
                } else {
                    alert('Страница комикса пока в разработке');
                }
            });
        });

        if (type === 'anime') {
            container.querySelectorAll('.bookmark-toggle').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showBookmarkPopup(btn.dataset.id, btn);
                });
            });
        }
    }

    function renderMangaGrid() { renderAnimeCards(mangaDatabase, 'mangaGrid', 'manga'); }

    async function renderAnimePageGrid(tab) {
        const titleEl = document.getElementById('animeSectionTitle');
        const container = document.getElementById('animePageGrid');
        if (!container) return;

        container.innerHTML = '<div style="padding:60px;text-align:center;"><i class="fas fa-spinner fa-spin" style="font-size:28px;color:var(--primary)"></i></div>';

        let params = { limit: 100 };
        if (tab === 'ongoing') {
            params.status = 'ongoing';
            if (titleEl) titleEl.textContent = 'Онгоинги';
        } else if (tab === 'popular') {
            params.sort = 'rating';
            if (titleEl) titleEl.textContent = 'Популярные аниме';
        } else {
            if (titleEl) titleEl.textContent = 'Все аниме';
        }

        try {
            const data = await API.anime.list(params);
            const items = (data.data || data.anime || data || []).map(normalizeAnime).filter(Boolean);
            if (items.length > 0) {
                items.forEach(a => {
                    if (!animeDatabase.find(x => x.id === a.id)) animeDatabase.push(a);
                });
            }
            renderAnimeCards(items, 'animePageGrid');
        } catch(e) {
            container.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-dim)">Не удалось загрузить аниме</div>';
        }
    }

    async function showFooterPage(path) {
        Object.values(views).forEach(v => { if (v) v.style.display = 'none'; });
        if (views['footer-page']) views['footer-page'].style.display = 'block';
        if (filtersHeader) filtersHeader.style.display = 'none';
        if (animeFiltersHeader) animeFiltersHeader.style.display = 'none';
        currentView = 'footer-page';
        updateActiveNav(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const container = document.getElementById('footerPageContent');
        container.innerHTML = `<div style="padding:80px 0;text-align:center;"><i class="fas fa-spinner fa-spin" style="font-size:32px;color:var(--primary)"></i></div>`;
        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const content = doc.querySelector('.policy-container') || doc.querySelector('.team-container') ||
                doc.querySelector('.faq-container') || doc.querySelector('main .container') || doc.querySelector('main');
            if (content) container.innerHTML = `<div class="policy-container">${content.innerHTML}</div>`;
            else container.innerHTML = `<p style="padding:60px 0;text-align:center;color:var(--text-dim)">Страница не найдена.</p>`;
        } catch(e) {
            container.innerHTML = `<p style="padding:60px 0;text-align:center;color:var(--text-dim)">Не удалось загрузить страницу.</p>`;
        }
    }

    async function renderBookmarksGrid() {
        const container = document.getElementById('bookmarksGrid');
        const emptyMsg = document.getElementById('emptyBookmarksMsg');
        if (!container) return;

        if (activeBookmarksType === 'manga') {
            const mangaIds = Object.keys(bookmarks).filter(id => mangaDatabase.find(m => String(m.id) === id));
            const filteredManga = mangaDatabase.filter(m => mangaIds.includes(String(m.id)));
            if (filteredManga.length === 0) {
                container.innerHTML = '';
                if (emptyMsg) emptyMsg.style.display = 'block';
            } else {
                if (emptyMsg) emptyMsg.style.display = 'none';
                renderAnimeCards(filteredManga, 'bookmarksGrid', 'manga');
            }
            if (filterNameSpan) filterNameSpan.textContent = '(Манга)';
            return;
        }

        if (!currentUser) {
            container.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-dim)"><i class="fas fa-lock" style="font-size:32px;margin-bottom:16px;display:block"></i>Войдите, чтобы видеть закладки</div>';
            if (emptyMsg) emptyMsg.style.display = 'none';
            return;
        }

        container.innerHTML = '<div style="padding:60px;text-align:center;"><i class="fas fa-spinner fa-spin" style="font-size:28px;color:var(--primary)"></i></div>';
        if (emptyMsg) emptyMsg.style.display = 'none';

        try {
            const status = activeFilter !== 'all' ? activeFilter : null;
            const data = await API.bookmarks.list(status);
            const items = (data.data || data || []).map(b => normalizeAnime(b.anime || b)).filter(Boolean);

            bookmarks = {};
            (data.data || data || []).forEach(b => {
                const animeObj = b.anime || b;
                if (animeObj && animeObj.id) bookmarks[String(animeObj.id)] = b.status || 'planned';
            });
            localStorage.setItem('anime_bookmarks', JSON.stringify(bookmarks));

            if (items.length === 0) {
                container.innerHTML = '';
                if (emptyMsg) emptyMsg.style.display = 'block';
            } else {
                if (emptyMsg) emptyMsg.style.display = 'none';
                renderAnimeCards(items, 'bookmarksGrid');
            }
        } catch(e) {
            container.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-dim)">Не удалось загрузить закладки</div>';
        }

        if (filterNameSpan) {
            const filterNames = { all:'Все', watching:'Смотрю', planned:'Буду смотреть', completed:'Просмотрено', dropped:'Брошено', onhold:'Отложено', notinterested:'Не интересно', favorite:'Любимое' };
            filterNameSpan.textContent = `(${filterNames[activeFilter] || 'Все'})`;
        }
    }

    // ======================== РЕКОМЕНДАЦИИ ========================
    function getRecommendations() {
        const favoriteIds = Object.entries(bookmarks)
            .filter(([, status]) => status === 'favorite')
            .map(([id]) => id);
        if (favoriteIds.length === 0 || animeDatabase.length === 0) {
            return [...animeDatabase].sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating)).slice(0, 6);
        }
        const favorites = animeDatabase.filter(a => favoriteIds.includes(String(a.id)));
        const favStudios = new Set(favorites.map(a => a.studio).filter(Boolean));
        const favGenres = new Set(favorites.flatMap(a => a.genres || []));
        const candidates = animeDatabase.filter(a => !favoriteIds.includes(String(a.id)));
        return candidates.map(anime => {
            let score = 0;
            if (favStudios.has(anime.studio)) score += 3;
            (anime.genres || []).forEach(g => { if (favGenres.has(g)) score += 2; });
            return { ...anime, score };
        }).filter(a => a.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
    }

    async function renderHomeGrid() {
        const homeGrid = document.getElementById('homeGrid');
        const recSection = document.getElementById('recommendationsSection');
        if (!homeGrid) return;

        homeGrid.innerHTML = '<div style="padding:60px;text-align:center;"><i class="fas fa-spinner fa-spin" style="font-size:28px;color:var(--primary)"></i></div>';

        try {
            const data = await API.anime.list({ limit: 50, sort: 'created_at' });
            const items = (data.data || data.anime || data || []).map(normalizeAnime).filter(Boolean);
            animeDatabase = items;

            const recommendations = getRecommendations();
            if (recSection) {
                if (recommendations.length > 0) {
                    recSection.classList.remove('hidden');
                    renderAnimeCards(recommendations, 'recommendationsGrid');
                } else {
                    recSection.classList.add('hidden');
                }
            }
            renderAnimeCards(items, 'homeGrid');
        } catch(e) {
            homeGrid.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-dim)">Не удалось загрузить аниме</div>';
        }
    }

    // ======================== ПОИСК ========================
    function initSearch() {
        const wrapper = document.getElementById('searchWrapper');
        const toggleBtn = document.getElementById('searchToggleBtn');
        const input = document.getElementById('globalSearchInput');
        const resultsDiv = document.getElementById('globalSearchResults');
        let debounceTimer;
        let lastResults = [];

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            wrapper.classList.add('expanded');
            input.focus();
        });

        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                wrapper.classList.remove('expanded');
                resultsDiv.classList.add('hidden');
                input.value = '';
            }
        });

        function renderResults(results) {
            if (results.length === 0) {
                resultsDiv.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-dim);">Ничего не найдено</div>';
                resultsDiv.classList.remove('hidden');
                return;
            }
            resultsDiv.innerHTML = results.map(a => `
                <div class="search-result-item" data-id="${escapeHtml(String(a.id))}">
                    <img src="${escapeHtml(a.poster_url || a.poster || '')}" alt="${escapeHtml(a.title)}" onerror="this.src='https://via.placeholder.com/40x60/1a1a20/ff5e57?text=Anime'">
                    <div class="search-result-info">
                        <div class="search-result-title">${escapeHtml(a.title)}</div>
                        <div class="search-result-meta">${a.year || ''} • ${statusLabel(a.status)}</div>
                    </div>
                </div>
            `).join('');
            resultsDiv.classList.remove('hidden');
            resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    navigateTo(`/anime/${item.dataset.id}`);
                    wrapper.classList.remove('expanded');
                    input.value = '';
                    resultsDiv.classList.add('hidden');
                    lastResults = [];
                });
            });
        }

        async function performSearch(query) {
            if (query.length < 2) { resultsDiv.classList.add('hidden'); return; }
            const local = animeDatabase.filter(a => fuzzySearch(query, a) <= 1);
            if (local.length > 0) { lastResults = local; renderResults(local); }
            try {
                const data = await API.anime.search(query);
                const remote = (data.data || data.anime || data || []).map(normalizeAnime).filter(Boolean);
                if (remote.length > 0) { lastResults = remote; renderResults(remote); }
                else if (local.length === 0) { lastResults = []; renderResults([]); }
            } catch {}
        }

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = input.value.trim();
            if (!q) { resultsDiv.classList.add('hidden'); lastResults = []; return; }
            debounceTimer = setTimeout(() => performSearch(q), 300);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                wrapper.classList.remove('expanded');
                resultsDiv.classList.add('hidden');
                input.value = '';
                lastResults = [];
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (lastResults.length > 0) {
                    navigateTo(`/anime/${lastResults[0].id}`);
                    wrapper.classList.remove('expanded');
                    input.value = '';
                    resultsDiv.classList.add('hidden');
                    lastResults = [];
                }
            }
        });
    }

    // ======================== УВЕДОМЛЕНИЯ ========================
    let notifBadgeEl = null;

    async function refreshNotifBadge() {
        if (!notifBadgeEl) notifBadgeEl = document.getElementById('notifBadge');
        if (!notifBadgeEl) return;
        if (!currentUser) { notifBadgeEl.style.display = 'none'; return; }
        try {
            const data = await API.notifications.unreadCount();
            const items = data.data || data || [];
            const count = Array.isArray(items) ? items.length : (data.unread_count || 0);
            if (count > 0) {
                notifBadgeEl.textContent = count > 99 ? '99+' : count;
                notifBadgeEl.style.display = '';
            } else {
                notifBadgeEl.style.display = 'none';
            }
        } catch { notifBadgeEl.style.display = 'none'; }
    }

    function initNotifications() {
        const btn = document.getElementById('notificationsBtn');
        const panel = document.getElementById('notificationsPanel');
        const badge = document.getElementById('notifBadge');
        const markReadBtn = document.getElementById('markReadBtn');
        const notifList = document.getElementById('notifList');
        if (!btn || !panel) return;
        notifBadgeEl = badge;

        if (badge) badge.style.display = 'none';

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden') && currentUser) {
                await loadNotifications(notifList, badge);
            }
        });

        if (markReadBtn && notifList) {
            markReadBtn.addEventListener('click', async () => {
                try {
                    await API.notifications.markAllRead();
                    notifList.querySelectorAll('.notification-item.unread').forEach(item => item.classList.remove('unread'));
                    if (badge) badge.style.display = 'none';
                } catch {}
            });
        }

        document.addEventListener('click', (e) => {
            if (!panel.classList.contains('hidden') && !btn.contains(e.target) && !panel.contains(e.target)) {
                panel.classList.add('hidden');
            }
        });

        if (currentUser) refreshNotifBadge();
    }

    async function loadNotifications(listEl, badgeEl) {
        if (!listEl) return;
        if (!currentUser) {
            listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim)">Войдите, чтобы видеть уведомления</div>';
            return;
        }
        listEl.innerHTML = '<div style="padding:20px;text-align:center;"><i class="fas fa-spinner fa-spin"></i></div>';
        try {
            const data = await API.notifications.list();
            const items = data.data || data || [];
            if (!items.length) {
                listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim)">Нет уведомлений</div>';
                if (badgeEl) badgeEl.style.display = 'none';
                return;
            }
            const unread = items.filter(n => !n.is_read).length;
            if (badgeEl) {
                if (unread > 0) { badgeEl.textContent = unread; badgeEl.style.display = ''; }
                else badgeEl.style.display = 'none';
            }
            listEl.innerHTML = items.map(n => `
                <div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${escapeHtml(String(n.id))}">
                    <div class="notif-icon"><i class="fas ${notifIcon(n.type)}"></i></div>
                    <div class="notif-content">
                        <div class="notif-text">${escapeHtml(n.message || n.content || '')}</div>
                        <div class="notif-time">${timeAgo(n.created_at)}</div>
                    </div>
                </div>
            `).join('');
            listEl.querySelectorAll('.notification-item.unread').forEach(item => {
                item.addEventListener('click', async () => {
                    const id = item.dataset.id;
                    try { await API.notifications.markRead(id); item.classList.remove('unread'); } catch {}
                    await refreshNotifBadge();
                });
            });
        } catch(e) {
            listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim)">Ошибка загрузки</div>';
        }
    }

    function notifIcon(type) {
        const icons = { mention: 'fa-at', reply: 'fa-reply', reaction: 'fa-smile', new_episode: 'fa-play', system: 'fa-info-circle' };
        return icons[type] || 'fa-bell';
    }

    // ======================== ФИЛЬТРЫ ЗАКЛАДОК ========================
    function initBookmarkFilters() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-list li').forEach(li => li.classList.remove('active'));
                btn.closest('li').classList.add('active');
                activeFilter = btn.dataset.filter;
                renderBookmarksGrid();
            });
        });
    }

    // ======================== ПОПАП ЗАКЛАДОК ========================
    function showBookmarkPopup(animeId, triggerBtn) {
        popupTargetAnimeId = String(animeId);
        const popup = document.getElementById('bookmarkPopup');
        const rect = triggerBtn.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
        popup.style.top = `${rect.bottom + scrollTop + 8}px`;
        popup.style.left = `${Math.min(rect.left + scrollLeft, document.documentElement.clientWidth - 250)}px`;
        popup.classList.remove('hidden');
        popup.style.display = 'block';
        const currentStatus = bookmarks[String(animeId)];
        document.querySelectorAll('#popupStatusList li').forEach(li => {
            li.style.background = li.dataset.status === currentStatus ? 'var(--border-light)' : '';
        });
        window._bookmarkPopupJustOpened = true;
        setTimeout(() => { window._bookmarkPopupJustOpened = false; }, 100);
    }

    window.showBookmarkPopup = showBookmarkPopup;

    function hidePopup() {
        const popup = document.getElementById('bookmarkPopup');
        popup.classList.add('hidden');
        popup.style.display = 'none';
        popupTargetAnimeId = null;
    }

    async function setBookmarkStatus(animeId, status) {
        const aid = String(animeId);
        if (status === 'remove') {
            delete bookmarks[aid];
        } else {
            bookmarks[aid] = status;
        }
        localStorage.setItem('anime_bookmarks', JSON.stringify(bookmarks));
        hidePopup();

        document.querySelectorAll(`.bookmark-toggle[data-id="${aid}"] i`).forEach(icon => {
            icon.style.color = bookmarks[aid] ? 'var(--primary)' : 'rgba(255,255,255,0.7)';
        });

        if (currentView === 'bookmarks') renderBookmarksGrid();

        if (currentUser) {
            try {
                if (status === 'remove') await API.bookmarks.remove(aid);
                else await API.bookmarks.set(aid, status);
            } catch(e) {
                console.warn('Ошибка синхронизации закладки:', e.message);
            }
        }
    }

    function initBookmarkPopup() {
        document.getElementById('popupCloseBtn').addEventListener('click', hidePopup);
        document.querySelectorAll('#popupStatusList li').forEach(li => {
            li.addEventListener('click', () => {
                if (popupTargetAnimeId) setBookmarkStatus(popupTargetAnimeId, li.dataset.status);
            });
        });
        document.getElementById('popupRemoveBtn').addEventListener('click', () => {
            if (popupTargetAnimeId) setBookmarkStatus(popupTargetAnimeId, 'remove');
        });
        document.addEventListener('click', (e) => {
            if (window._bookmarkPopupJustOpened) return;
            const popup = document.getElementById('bookmarkPopup');
            if (!popup.contains(e.target) && !e.target.closest('.bookmark-toggle')) hidePopup();
        });
        window.addEventListener('scroll', () => {
            if (popupTargetAnimeId !== null) hidePopup();
        }, { passive: true });
    }

    // ======================== ТАБЫ АНИМЕ ========================
    function initAnimeTabs() {
        document.querySelectorAll('[data-anime-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                activeAnimeTab = btn.dataset.animeTab;
                document.querySelectorAll('[data-anime-tab]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (currentView === 'anime') renderAnimePageGrid(activeAnimeTab);
            });
        });
    }

    // ======================== ТАБЫ ЗАКЛАДОК ========================
    function initBookmarkTypeTabs() {
        document.querySelectorAll('[data-bm-type]').forEach(btn => {
            btn.addEventListener('click', () => {
                activeBookmarksType = btn.dataset.bmType;
                document.querySelectorAll('[data-bm-type]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filterRow = document.getElementById('bookmarkFilterRow');
                if (filterRow) filterRow.style.display = activeBookmarksType === 'anime' ? '' : 'none';
                renderBookmarksGrid();
            });
        });
    }

    // ======================== ПРОФИЛЬ ========================
    function renderProfilePage() {
        const container = document.getElementById('profilePageContainer');
        if (!currentUser) { navigateTo('/auth'); return; }

        const nick = currentUser.username || currentUser.nickname || currentUser.email?.split('@')[0] || 'Пользователь';
        const userData = {
            nickname: nick,
            email: currentUser.email || '',
            bio: currentUser.bio || 'Люблю аниме и доширак 🍜',
            avatar: currentUser.avatar_url || currentUser.avatar || './img/anj-favicon.png',
            banner: currentUser.banner || '',
            avatarBorder: currentUser.avatarBorder || '#ff5e57',
            stats: getUserStats(),
            achievements: [
                { icon: '🏆', name: 'Новичок', rarity: 'common', description: 'Зарегистрироваться на сайте', percent: 85 },
                { icon: '🎬', name: 'Киноман', rarity: 'rare', description: 'Посмотреть 50 аниме', percent: 35 },
                { icon: '💬', name: 'Комментатор', rarity: 'epic', description: 'Оставить 100 комментариев', percent: 12 },
                { icon: '👑', name: 'Легенда', rarity: 'legendary', description: 'Получить 1000 лайков', percent: 2 }
            ],
            friends: [],
            commentsHistory: []
        };

        const level = Math.floor(1 + Math.sqrt(userData.stats.watched) / 2);
        const nextLevelXp = (level * 2) ** 2;
        const currentXp = userData.stats.watched * 10 + userData.stats.comments * 5;
        const progress = Math.min(100, (currentXp / nextLevelXp) * 100);
        let activeTab = 'overview';

        function renderTabContent() {
            const contentDiv = document.getElementById('profileTabContent');
            switch (activeTab) {
                case 'overview':
                    contentDiv.innerHTML = `
                        <h3>Обо мне</h3>
                        <p style="margin-top: 16px; color: var(--text-dim);">${escapeHtml(userData.bio)}</p>
                        <div style="margin-top: 24px;">
                            <h4>Уровень ${level}</h4>
                            <div style="background:var(--border-light); border-radius:10px; height:8px; margin:8px 0;">
                                <div style="width:${progress}%; height:100%; background:var(--primary); border-radius:10px;"></div>
                            </div>
                            <small>${currentXp} / ${nextLevelXp} XP</small>
                        </div>
                        <div style="margin-top: 24px;">
                            <h4>Достижения</h4>
                            <div class="achievements-grid">
                                ${userData.achievements.map(a => `
                                    <div class="achievement-card ${a.rarity}" title="${escapeHtml(a.description)} (${a.percent}% пользователей)">
                                        <div class="achievement-icon">${a.icon}</div>
                                        <div class="achievement-name">${escapeHtml(a.name)}</div>
                                        <div class="achievement-percent">${a.percent}%</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                    break;
                case 'comments':
                    contentDiv.innerHTML = '<h3>История комментариев</h3><p style="color:var(--text-dim);margin-top:16px">Загружаем...</p>';
                    if (currentUser) {
                        API.users.get(currentUser.id || 'me').then(data => {
                            const hist = data.recent_comments || [];
                            contentDiv.querySelector('p').innerHTML = hist.length
                                ? hist.map(c => `
                                    <div class="comment-history-item">
                                        <img src="${escapeHtml(userData.avatar)}" class="comment-history-avatar">
                                        <div class="comment-history-content">
                                            <div class="comment-history-header">
                                                <span class="comment-history-time">${timeAgo(c.created_at)}</span>
                                            </div>
                                            <div class="comment-history-text">${applyFormatting(escapeHtml(c.text))}</div>
                                        </div>
                                    </div>
                                `).join('')
                                : '<span>Пока нет комментариев</span>';
                        }).catch(() => {
                            contentDiv.querySelector('p').textContent = 'Пока нет комментариев';
                        });
                    }
                    break;
                case 'friends':
                    contentDiv.innerHTML = '<p style="color: var(--text-dim);">Друзья появятся позже</p>';
                    break;
                case 'settings':
                    contentDiv.innerHTML = `
                        <h3>Настройки</h3>
                        <div class="settings-group">
                            <label class="settings-label">Имя пользователя</label>
                            <input type="text" class="settings-input" id="settingsNickname" value="${escapeHtml(userData.nickname)}">
                        </div>
                        <div class="settings-group">
                            <label class="settings-label">Описание</label>
                            <textarea class="settings-input" id="settingsBio" rows="3" style="resize: none;">${escapeHtml(userData.bio)}</textarea>
                        </div>
                        <div class="settings-group">
                            <label class="settings-label">Обложка профиля</label>
                            <input type="file" id="bannerUpload" accept="image/*">
                            ${userData.banner ? `<img src="${escapeHtml(userData.banner)}" style="max-width:100px;margin-top:8px;border-radius:8px;">` : ''}
                        </div>
                        <div class="settings-group">
                            <label class="settings-label">Цвет рамки аватарки</label>
                            <input type="color" id="avatarBorderColor" value="${escapeHtml(userData.avatarBorder)}">
                        </div>
                        <div class="settings-switch">
                            <span>Уведомления о новых сериях</span>
                            <label class="switch"><input type="checkbox" id="notifySwitch" checked><span class="slider"></span></label>
                        </div>
                        <div class="settings-switch">
                            <span>Приватный профиль</span>
                            <label class="switch"><input type="checkbox" id="privateSwitch"><span class="slider"></span></label>
                        </div>
                        <button class="btn-primary" id="saveSettingsBtn" style="margin-top: 20px;">Сохранить</button>
                    `;
                    setTimeout(() => {
                        document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
                            const newNick = document.getElementById('settingsNickname').value.trim();
                            const newBio = document.getElementById('settingsBio').value;
                            const bannerFile = document.getElementById('bannerUpload').files[0];
                            const borderColor = document.getElementById('avatarBorderColor').value;
                            if (newNick) { userData.nickname = newNick; currentUser.username = newNick; currentUser.nickname = newNick; }
                            if (newBio !== undefined) { userData.bio = newBio; currentUser.bio = newBio; }
                            currentUser.avatarBorder = borderColor;
                            if (bannerFile) {
                                const reader = new FileReader();
                                reader.onload = (e) => {
                                    currentUser.banner = e.target.result;
                                    localStorage.setItem('anijett_user', JSON.stringify(currentUser));
                                };
                                reader.readAsDataURL(bannerFile);
                            } else {
                                localStorage.setItem('anijett_user', JSON.stringify(currentUser));
                            }
                            if (currentUser) {
                                try { await API.users.update({ bio: newBio, username: newNick }); } catch {}
                            }
                            updateAuthUI();
                            alert('Настройки сохранены');
                        });
                    }, 0);
                    break;
            }
        }

        container.innerHTML = `
            <div class="profile-header-card" style="background-image: url(${escapeHtml(userData.banner)}); background-size: cover; background-position: center;">
                <div style="background: rgba(0,0,0,0.5); border-radius: 24px; padding: 32px; display: flex; gap: 32px; align-items: center;">
                    <div class="profile-avatar-section">
                        <img src="${escapeHtml(userData.avatar)}" class="profile-avatar-edit avatar-border-custom" id="profileAvatar" style="border-color: ${escapeHtml(userData.avatarBorder)};" onerror="this.src='./img/anj-favicon.png'">
                        <input type="file" id="avatarUpload" class="avatar-upload-input" accept="image/*">
                    </div>
                    <div class="profile-info-section">
                        <div class="profile-nickname">${escapeHtml(userData.nickname)} <i class="fas fa-pen" id="editNicknameBtn"></i></div>
                        <div class="profile-uid">UID: ${escapeHtml(getOrCreateUID())}</div>
                        <div class="profile-bio">${escapeHtml(userData.bio)}</div>
                        <button class="edit-profile-btn" id="editProfileBtn">Редактировать профиль</button>
                    </div>
                </div>
            </div>
            <div class="profile-stats-grid">
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-check-circle"></i></div><div class="stat-value">${userData.stats.watched}</div><div class="stat-label">Просмотрено</div></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-play-circle"></i></div><div class="stat-value">${userData.stats.watching || 0}</div><div class="stat-label">Смотрю</div></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-clock"></i></div><div class="stat-value">${userData.stats.planned || 0}</div><div class="stat-label">Запланировано</div></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-comment"></i></div><div class="stat-value">${userData.stats.comments}</div><div class="stat-label">Комментариев</div></div>
            </div>
            <div class="profile-tabs">
                <button class="profile-tab ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">Обзор</button>
                <button class="profile-tab ${activeTab === 'comments' ? 'active' : ''}" data-tab="comments">Комментарии</button>
                <button class="profile-tab ${activeTab === 'friends' ? 'active' : ''}" data-tab="friends">Друзья</button>
                <button class="profile-tab ${activeTab === 'settings' ? 'active' : ''}" data-tab="settings">Настройки</button>
            </div>
            <div class="profile-tab-content" id="profileTabContent"></div>
        `;

        renderTabContent();

        document.querySelectorAll('.profile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activeTab = tab.dataset.tab;
                renderTabContent();
            });
        });

        const avatarImg = document.getElementById('profileAvatar');
        const avatarInput = document.getElementById('avatarUpload');
        avatarImg.addEventListener('click', () => avatarInput.click());
        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                avatarImg.src = event.target.result;
                currentUser.avatar = event.target.result;
                currentUser.avatar_url = event.target.result;
                localStorage.setItem('anijett_user', JSON.stringify(currentUser));
                updateAuthUI();
            };
            reader.readAsDataURL(file);
            avatarInput.value = '';
        });

        document.getElementById('editNicknameBtn').addEventListener('click', () => {
            const newNick = prompt('Введите новый ник:', userData.nickname);
            if (newNick && newNick.trim()) {
                userData.nickname = newNick.trim();
                currentUser.username = newNick.trim();
                currentUser.nickname = newNick.trim();
                localStorage.setItem('anijett_user', JSON.stringify(currentUser));
                document.querySelector('.profile-nickname').innerHTML = `${escapeHtml(newNick)} <i class="fas fa-pen" id="editNicknameBtn"></i>`;
                updateAuthUI();
            }
        });

        document.getElementById('editProfileBtn').addEventListener('click', () => {
            activeTab = 'settings';
            document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('[data-tab="settings"]').classList.add('active');
            renderTabContent();
        });
    }

    // ======================== АВТОРИЗАЦИЯ ========================
    function renderAuthForms() {
        const container = document.getElementById('authContainer');
        container.innerHTML = `
            <div class="auth-tabs">
                <span class="auth-tab active" data-tab="login">Вход</span>
                <span class="auth-tab" data-tab="register">Регистрация</span>
            </div>
            <div id="loginForm" class="auth-form">
                <div class="form-group"><label>Логин или email</label><input type="text" class="form-input" id="loginEmail" placeholder="your@email.com или nickname"></div>
                <div class="form-group"><label>Пароль</label><div class="password-wrapper"><input type="password" class="form-input" id="loginPassword" placeholder="••••••••"><i class="far fa-eye password-toggle"></i></div></div>
                <div id="loginError" style="color:#ff5e57;font-size:14px;margin-bottom:8px;display:none;"></div>
                <button class="auth-submit" id="loginSubmit">Войти</button>
                <div class="auth-footer">Ещё нет аккаунта? <a href="#" id="switchToRegister">Зарегистрируйтесь</a></div>
            </div>
            <div id="registerForm" class="auth-form" style="display:none;position:relative;">
                <!-- Загрузочный оверлей (отправка кода) -->
                <div id="regSendingOverlay" class="reg-sending-overlay" style="display:none;">
                    <div class="reg-sending-box">
                        <div class="reg-sending-spin"></div>
                        <div class="reg-sending-label" id="regSendingLabel">Отправляем код на почту...</div>
                        <div class="reg-sending-sub" id="regSendingEmail"></div>
                    </div>
                </div>
                <!-- Прогресс-индикатор -->
                <div class="reg-step-header">
                    <div class="reg-step-dot active" id="rsDot1">1</div>
                    <div class="reg-step-line" id="rsLine1"></div>
                    <div class="reg-step-dot" id="rsDot2">2</div>
                    <div class="reg-step-line" id="rsLine2"></div>
                    <div class="reg-step-dot" id="rsDot3">3</div>
                </div>

                <!-- Шаг 1: email -->
                <div id="regStep1">
                    <div class="form-group">
                        <label>Электронная почта</label>
                        <div class="send-code-row">
                            <input type="email" class="form-input" id="regEmail" placeholder="your@email.com" autocomplete="email">
                            <button class="btn-send-code" id="btnSendCode" disabled>Отправить</button>
                        </div>
                    </div>
                    <div id="sendCodeMsg" style="font-size:13px;margin-bottom:8px;display:none;"></div>
                </div>

                <!-- Шаг 2: код -->
                <div id="regStep2" style="display:none;">
                    <div id="regEmailConfirmed" class="reg-success-badge" style="margin-bottom:12px;">
                        <i class="fas fa-envelope-circle-check"></i>
                        <span id="regEmailConfirmedText">Код отправлен на your@email.com</span>
                    </div>
                    <div class="form-group">
                        <label style="text-align:center;display:block;margin-bottom:10px;">Введите 4-значный код</label>
                        <div class="code-inputs">
                            <input class="code-digit" id="cd1" type="text" inputmode="numeric" maxlength="1">
                            <input class="code-digit" id="cd2" type="text" inputmode="numeric" maxlength="1">
                            <input class="code-digit" id="cd3" type="text" inputmode="numeric" maxlength="1">
                            <input class="code-digit" id="cd4" type="text" inputmode="numeric" maxlength="1">
                        </div>
                        <div class="code-hint">Не пришло письмо? <a id="resendCode">Отправить снова</a></div>
                    </div>
                    <div id="codeError" style="color:#ff5e57;font-size:13px;margin-bottom:8px;display:none;text-align:center;"></div>
                </div>

                <!-- Шаг 3: данные аккаунта -->
                <div id="regStep3" style="display:none;">
                    <div class="reg-success-badge" style="margin-bottom:14px;">
                        <i class="fas fa-circle-check"></i>
                        <span>Email подтверждён!</span>
                    </div>
                    <div class="form-group"><label>Отображаемое имя (ник)</label><input type="text" class="form-input" id="regNickname" placeholder="AnimeFan" autocomplete="username"></div>
                    <div class="form-group"><label>Пароль</label><div class="password-wrapper"><input type="password" class="form-input" id="regPassword" placeholder="••••••••" autocomplete="new-password"><i class="far fa-eye password-toggle"></i></div></div>
                    <div class="form-group"><label>Повторите пароль</label><div class="password-wrapper"><input type="password" class="form-input" id="regPasswordConfirm" placeholder="••••••••" autocomplete="new-password"><i class="far fa-eye password-toggle"></i></div></div>
                    <div class="checkbox-group"><input type="checkbox" id="agreeTerms"><label for="agreeTerms">Принимаю <a href="./policy/terms.html">Пользовательское соглашение</a> и <a href="./policy/police.html">Политику конфиденциальности</a></label></div>
                    <div id="regError" style="color:#ff5e57;font-size:14px;margin-bottom:8px;display:none;"></div>
                    <button class="auth-submit" id="registerSubmit" disabled>Зарегистрироваться</button>
                </div>

                <div class="auth-footer">Уже есть аккаунт? <a href="#" id="switchToLogin">Войти</a></div>
            </div>
        `;

        container.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
            container.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const isLogin = tab.dataset.tab === 'login';
            document.getElementById('loginForm').style.display = isLogin ? 'flex' : 'none';
            document.getElementById('registerForm').style.display = isLogin ? 'none' : 'flex';
        }));

        document.getElementById('switchToRegister').addEventListener('click', e => {
            e.preventDefault(); container.querySelector('[data-tab="register"]').click();
        });
        document.getElementById('switchToLogin').addEventListener('click', e => {
            e.preventDefault(); container.querySelector('[data-tab="login"]').click();
        });

        const loginError = document.getElementById('loginError');
        document.getElementById('loginSubmit').addEventListener('click', async () => {
            const login = document.getElementById('loginEmail').value.trim();
            const pass = document.getElementById('loginPassword').value;
            if (!login || !pass) { loginError.textContent = 'Заполните все поля'; loginError.style.display = ''; return; }
            const btn = document.getElementById('loginSubmit');
            btn.disabled = true; btn.textContent = 'Входим...';
            try {
                const data = await API.auth.login(login, pass);
                API.setTokens(data.accessToken, data.refreshToken);
                currentUser = data.user;
                localStorage.setItem('anijett_user', JSON.stringify(data.user));
                await syncBookmarksFromServer();
                updateAuthUI();
                refreshNotifBadge();
                subscribeToPush();
                navigateTo('/');
            } catch(e) {
                loginError.textContent = e.data?.error || 'Неверный логин или пароль';
                loginError.style.display = '';
                btn.disabled = false; btn.textContent = 'Войти';
            }
        });

        // ====== РЕГИСТРАЦИЯ: многошаговая форма с email-верификацией ======
        let verifiedEmail = '';
        let verifiedCode = '';

        // Шаг 1: ввод email → кнопка "Отправить"
        const regEmailInput = document.getElementById('regEmail');
        const btnSendCode = document.getElementById('btnSendCode');
        const sendCodeMsg = document.getElementById('sendCodeMsg');

        regEmailInput.addEventListener('input', () => {
            const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmailInput.value.trim());
            btnSendCode.disabled = !valid;
            btnSendCode.classList.toggle('ready', valid);
        });

        async function doSendCode() {
            const email = regEmailInput.value.trim();
            btnSendCode.disabled = true;
            btnSendCode.classList.remove('ready');
            sendCodeMsg.style.display = 'none';
            // Показываем загрузочный оверлей
            const overlay = document.getElementById('regSendingOverlay');
            document.getElementById('regSendingEmail').textContent = email;
            document.getElementById('regSendingLabel').textContent = 'Отправляем код на почту...';
            overlay.style.display = 'flex';
            try {
                await API.auth.sendCode(email);
                verifiedEmail = email;
                document.getElementById('regEmailConfirmedText').textContent = `Код отправлен на ${email}`;
                overlay.style.display = 'none';
                sendCodeMsg.textContent = '';
                btnSendCode.textContent = 'Отправлено';
                btnSendCode.classList.add('sent');
                // Переходим к шагу 2
                document.getElementById('regStep1').style.display = 'none';
                document.getElementById('regStep2').style.display = '';
                document.getElementById('rsDot1').className = 'reg-step-dot done';
                document.getElementById('rsDot1').innerHTML = '<i class="fas fa-check" style="font-size:10px"></i>';
                document.getElementById('rsLine1').classList.add('done');
                document.getElementById('rsDot2').classList.add('active');
                document.getElementById('cd1').focus();
            } catch(e) {
                overlay.style.display = 'none';
                sendCodeMsg.textContent = e.data?.error || 'Не удалось отправить код';
                sendCodeMsg.style.color = '#ff5e57';
                sendCodeMsg.style.display = '';
                btnSendCode.disabled = false;
                btnSendCode.textContent = 'Отправить';
                btnSendCode.classList.add('ready');
            }
        }

        btnSendCode.addEventListener('click', doSendCode);
        document.getElementById('resendCode').addEventListener('click', async () => {
            document.getElementById('regStep2').style.display = 'none';
            document.getElementById('regStep1').style.display = '';
            document.getElementById('rsDot1').className = 'reg-step-dot active';
            document.getElementById('rsDot1').textContent = '1';
            document.getElementById('rsLine1').classList.remove('done');
            document.getElementById('rsDot2').className = 'reg-step-dot';
            btnSendCode.textContent = 'Отправить';
            btnSendCode.className = 'btn-send-code ready';
            btnSendCode.disabled = false;
        });

        // Шаг 2: ввод 4-значного кода
        const codeDigits = [
            document.getElementById('cd1'),
            document.getElementById('cd2'),
            document.getElementById('cd3'),
            document.getElementById('cd4'),
        ];

        const getFullCode = () => codeDigits.map(d => d.value).join('');

        codeDigits.forEach((input, i) => {
            input.addEventListener('input', () => {
                const val = input.value.replace(/\D/g, '');
                input.value = val ? val[0] : '';
                if (val && i < 3) codeDigits[i + 1].focus();
                input.classList.toggle('filled', !!input.value);
                if (getFullCode().length === 4) checkCode();
            });
            input.addEventListener('keydown', e => {
                if (e.key === 'Backspace' && !input.value && i > 0) {
                    codeDigits[i - 1].value = '';
                    codeDigits[i - 1].classList.remove('filled');
                    codeDigits[i - 1].focus();
                }
            });
            input.addEventListener('paste', e => {
                e.preventDefault();
                const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 4);
                paste.split('').forEach((ch, idx) => {
                    if (codeDigits[idx]) { codeDigits[idx].value = ch; codeDigits[idx].classList.add('filled'); }
                });
                if (paste.length === 4) checkCode();
            });
        });

        async function checkCode() {
            const code = getFullCode();
            if (code.length !== 4) return;
            const codeError = document.getElementById('codeError');
            codeError.style.display = 'none';
            // Показываем мини-оверлей с проверкой
            const overlay = document.getElementById('regSendingOverlay');
            document.getElementById('regSendingLabel').textContent = 'Проверяем код...';
            document.getElementById('regSendingEmail').textContent = '';
            overlay.style.display = 'flex';
            try {
                await API.auth.verifyCode(verifiedEmail, code);
                verifiedCode = code;
                overlay.style.display = 'none';
                // Переходим к шагу 3
                document.getElementById('regStep2').style.display = 'none';
                document.getElementById('regStep3').style.display = '';
                document.getElementById('rsDot2').className = 'reg-step-dot done';
                document.getElementById('rsDot2').innerHTML = '<i class="fas fa-check" style="font-size:10px"></i>';
                document.getElementById('rsLine2').classList.add('done');
                document.getElementById('rsDot3').classList.add('active');
                document.getElementById('regNickname').focus();
            } catch(e) {
                overlay.style.display = 'none';
                codeError.textContent = e.data?.error || 'Неверный код. Попробуйте снова.';
                codeError.style.display = '';
                // Сбрасываем поля кода
                codeDigits.forEach(d => { d.value = ''; d.classList.remove('filled'); });
                codeDigits[0].focus();
            }
        }

        // Шаг 3: ник + пароль + регистрация
        const regNick = document.getElementById('regNickname');
        const regPass = document.getElementById('regPassword');
        const regPassConfirm = document.getElementById('regPasswordConfirm');
        const agreeTerms = document.getElementById('agreeTerms');
        const regSubmit = document.getElementById('registerSubmit');
        const regError = document.getElementById('regError');

        const validateRegister = () => {
            regSubmit.disabled = !(
                regNick.value.length >= 3 &&
                regPass.value.length >= 6 &&
                regPass.value === regPassConfirm.value &&
                agreeTerms.checked
            );
        };
        [regNick, regPass, regPassConfirm].forEach(f => f.addEventListener('input', validateRegister));
        agreeTerms.addEventListener('change', validateRegister);

        regSubmit.addEventListener('click', async () => {
            regSubmit.disabled = true; regSubmit.textContent = 'Регистрируемся...';
            try {
                const data = await API.auth.register(regNick.value.trim(), verifiedEmail, regPass.value, verifiedCode);
                API.setTokens(data.accessToken, data.refreshToken);
                currentUser = data.user;
                localStorage.setItem('anijett_user', JSON.stringify(data.user));
                updateAuthUI();
                refreshNotifBadge();
                subscribeToPush();
                navigateTo('/');
            } catch(e) {
                regError.textContent = e.data?.error || 'Ошибка регистрации';
                regError.style.display = '';
                regSubmit.disabled = false; regSubmit.textContent = 'Зарегистрироваться';
            }
        });

        container.querySelectorAll('.password-toggle').forEach(toggle => toggle.addEventListener('click', () => {
            const input = toggle.previousElementSibling;
            input.type = input.type === 'password' ? 'text' : 'password';
            toggle.classList.toggle('fa-eye'); toggle.classList.toggle('fa-eye-slash');
        }));
    }

    async function syncBookmarksFromServer() {
        if (!currentUser) return;
        try {
            const data = await API.bookmarks.list();
            const items = data.data || data || [];
            bookmarks = {};
            items.forEach(b => {
                const animeObj = b.anime || b;
                if (animeObj && animeObj.id) bookmarks[String(animeObj.id)] = b.status || 'planned';
            });
            localStorage.setItem('anime_bookmarks', JSON.stringify(bookmarks));
        } catch {}
    }

    // ======================== ДЕТАЛИ АНИМЕ ========================
    function renderAnimeDetails(anime) {
        const container = document.querySelector('#view-anime-details .full-width');
        if (!container) return;

        const genresStr = Array.isArray(anime.genres) ? anime.genres.join(', ') : (anime.genres || '');
        const charactersStr = Array.isArray(anime.mainCharacters) ? anime.mainCharacters.join(', ') : (anime.mainCharacters || '');
        const totalEps = anime.episodes === '?' ? 12 : parseInt(anime.episodes) || 1;
        const totalEps2 = Math.max(1, totalEps - 2) || 6;
        const isBookmarked = !!bookmarks[String(anime.id)];

        const seasonLabels = { winter: 'Зима', spring: 'Весна', summer: 'Лето', fall: 'Осень' };
        const bannerSrc = anime.banner || null;
        const episodesLabel = anime.episodes && anime.episodes !== '?' ? `${anime.episodes} эп.` : '?';
        const durationLabel = anime.episode_duration ? `${anime.episode_duration} мин.` : (anime.duration || '');
        const seasonStr = anime.season ? (seasonLabels[anime.season] || anime.season) : '';
        const yearSeasonStr = [anime.year, seasonStr].filter(Boolean).join(', ');

        container.innerHTML = `
            ${bannerSrc ? `
            <div class="details-banner">
                <img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(anime.title)}" onerror="this.style.display='none'">
                <div class="details-banner-gradient"></div>
                <div class="details-banner-meta">
                    <img class="details-banner-poster" src="${escapeHtml(anime.poster)}" alt="" onerror="this.style.display='none'">
                    <div class="details-banner-info">
                        <h1>${escapeHtml(anime.title)}</h1>
                        ${anime.titleOriginal && anime.titleOriginal !== anime.title ? `<span class="banner-subtitle">${escapeHtml(anime.titleOriginal)}</span>` : ''}
                    </div>
                </div>
            </div>` : ''}
            <div class="details-panel">
                <div class="details-content">
                    <div class="details-left">
                        <div class="details-poster">
                            <img src="${escapeHtml(anime.poster)}" alt="${escapeHtml(anime.title)}" onerror="this.src='https://via.placeholder.com/260x370/1a1a20/ff5e57?text=Anime'">
                        </div>
                        <div class="details-actions">
                            <button class="btn-primary" id="watchNowBtn"><i class="fas fa-play"></i> Смотреть онлайн</button>
                            <button class="btn-secondary" id="addToListBtn"><i class="fas fa-plus"></i> Добавить в закладки</button>
                            <button class="btn-subscribe" id="subscribeBtn"><i class="fas fa-bell"></i> Подписаться</button>
                        </div>
                    </div>
                    <div class="details-right">
                        <h1 class="details-title">${escapeHtml(anime.title)}</h1>
                        ${anime.titleOriginal && anime.titleOriginal !== anime.title ? `<p style="color:var(--text-dim);font-size:14px;margin-bottom:8px">${escapeHtml(anime.titleOriginal)}</p>` : ''}
                        <div class="details-subtitle">
                            <div class="details-rating">
                                <div class="star-rating" data-anime-id="${escapeHtml(String(anime.id))}">
                                    <div class="stars-container">
                                        ${Array.from({length:10},(_,i)=>`<i class="fas fa-star" data-value="${i+1}"></i>`).join('')}
                                    </div>
                                    <span class="rating-value">${anime.rating}</span><span>/ 10</span>
                                </div>
                            </div>
                            ${anime.ageRating ? `<span class="age-restriction">${escapeHtml(anime.ageRating)}</span>` : ''}
                        </div>
                        <div class="details-specs">
                            <div class="specs-grid">
                                <div class="spec-item"><span class="spec-label">Тип</span><span class="spec-value">${escapeHtml(anime.type)}</span></div>
                                <div class="spec-item"><span class="spec-label">Статус</span><span class="spec-value">${escapeHtml(anime.status)}</span></div>
                                ${anime.year ? `<div class="spec-item"><span class="spec-label">Год выхода</span><span class="spec-value">${escapeHtml(String(yearSeasonStr))}</span></div>` : ''}
                                <div class="spec-item"><span class="spec-label">Серий</span><span class="spec-value">${escapeHtml(episodesLabel)}</span></div>
                                ${durationLabel ? `<div class="spec-item"><span class="spec-label">Длительность</span><span class="spec-value">${escapeHtml(durationLabel)} / эп.</span></div>` : ''}
                                ${anime.studio && anime.studio !== 'Неизвестно' ? `<div class="spec-item"><span class="spec-label">Студия</span><span class="spec-value">${escapeHtml(anime.studio)}</span></div>` : ''}
                                ${genresStr ? `<div class="spec-item spec-item-wide"><span class="spec-label">Жанры</span><span class="spec-value">${escapeHtml(genresStr)}</span></div>` : ''}
                                ${anime.source && anime.source !== 'Оригинал' ? `<div class="spec-item"><span class="spec-label">Первоисточник</span><span class="spec-value">${escapeHtml(anime.source)}</span></div>` : ''}
                                ${anime.ageRating ? `<div class="spec-item"><span class="spec-label">Возрастной рейтинг</span><span class="spec-value">${escapeHtml(anime.ageRating)}</span></div>` : ''}
                                ${anime.mpaaRating ? `<div class="spec-item"><span class="spec-label">MPAA</span><span class="spec-value">${escapeHtml(anime.mpaaRating)}</span></div>` : ''}
                                ${anime.director ? `<div class="spec-item"><span class="spec-label">Режиссёр</span><span class="spec-value">${escapeHtml(anime.director)}</span></div>` : ''}
                                ${anime.originalAuthor ? `<div class="spec-item"><span class="spec-label">Автор</span><span class="spec-value">${escapeHtml(anime.originalAuthor)}</span></div>` : ''}
                                ${charactersStr ? `<div class="spec-item spec-item-wide"><span class="spec-label">Главные герои</span><span class="spec-value">${escapeHtml(charactersStr)}</span></div>` : ''}
                                ${anime.voice ? `<div class="spec-item spec-item-wide"><span class="spec-label">Озвучка</span><span class="spec-value">${escapeHtml(anime.voice)}</span></div>` : ''}
                            </div>
                        </div>
                        <div class="details-description">
                            <h3>Описание</h3>
                            <p class="description-text" id="descriptionText">${escapeHtml(anime.description || 'Описание отсутствует.')}</p>
                            <button class="description-toggle" id="toggleDescription"><span>Развернуть</span><i class="fas fa-chevron-down"></i></button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="anime-players" id="animePlayersSection">
                <div class="player-top-bar">
                    <span class="player-anime-name">${escapeHtml(anime.title)}</span>
                </div>
                <div class="player-main-layout">
                    <div class="player-wrapper" id="animePlayerWrapper">
                        <div class="player-placeholder"><i class="fas fa-play-circle"></i><span>Выберите серию</span></div>
                    </div>
                    <div class="dubbing-panel">
                        <h4>Озвучка</h4>
                        <ul class="dubbing-list" id="dubbingList"></ul>
                    </div>
                </div>
                <div class="episodes-section">
                    <div class="seasons-row">
                        <button class="season-btn active" data-season="1">Сезон 1</button>
                        <button class="season-btn" data-season="2">Сезон 2</button>
                    </div>
                    <div class="episodes-grid" id="episodesGrid"></div>
                </div>
            </div>

            <div class="similar-anime">
                <h2>Похожие аниме</h2>
                <div class="similar-grid" id="similarGrid">
                    <div style="padding:20px;color:var(--text-dim)"><i class="fas fa-spinner fa-spin"></i></div>
                </div>
            </div>

            <div class="comments-section">
                <h2>Комментарии</h2>
                ${currentUser ? `
                    <div class="comment-form">
                        <img src="${escapeHtml(currentUser.avatar_url || currentUser.avatar || './img/anj-favicon.png')}" class="comment-avatar" onerror="this.src='./img/anj-favicon.png'">
                        <div class="comment-input-wrap">
                            <div class="comment-toolbar">
                                <button class="tool-btn" data-tag="b" title="Жирный"><i class="fas fa-bold"></i></button>
                                <button class="tool-btn" data-tag="i" title="Курсив"><i class="fas fa-italic"></i></button>
                                <button class="tool-btn" data-tag="u" title="Подчёркнутый"><i class="fas fa-underline"></i></button>
                                <button class="tool-btn" data-tag="s" title="Зачёркнутый"><i class="fas fa-strikethrough"></i></button>
                                <button class="tool-btn" data-tag="spoiler" title="Спойлер"><i class="fas fa-eye-slash"></i></button>
                                <button class="tool-btn" data-tag="emoji" title="Эмодзи"><i class="fas fa-smile"></i></button>
                            </div>
                            <textarea id="newCommentText" placeholder="Напишите комментарий..."></textarea>
                            <div class="comment-form-actions">
                                <button class="btn-primary" id="submitCommentBtn">Отправить</button>
                            </div>
                        </div>
                    </div>
                ` : `
                    <div class="comment-auth-notice">
                        <i class="fas fa-lock"></i>
                        <span>Чтобы оставить комментарий, <button class="link-btn" onclick="navigateTo('/auth')">войдите</button></span>
                    </div>
                `}
                <div class="comments-list" id="commentsList"></div>
            </div>
        `;

        // Описание toggle
        const descText = document.getElementById('descriptionText');
        const toggleBtn = document.getElementById('toggleDescription');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                descText.classList.toggle('expanded');
                toggleBtn.innerHTML = descText.classList.contains('expanded')
                    ? '<span>Свернуть</span><i class="fas fa-chevron-up"></i>'
                    : '<span>Развернуть</span><i class="fas fa-chevron-down"></i>';
            });
        }

        // Звёздный рейтинг
        const starRating = container.querySelector('.star-rating');
        if (starRating) {
            const stars = starRating.querySelectorAll('.fa-star');
            const ratingSpan = starRating.querySelector('.rating-value');
            let currentRating = parseFloat(anime.rating) || 0;

            const updateStars = (value) => {
                stars.forEach((star, index) => {
                    star.classList.toggle('fas', index < value);
                    star.classList.toggle('far', index >= value);
                });
                ratingSpan.textContent = value || anime.rating;
            };

            // Загружаем пользовательский рейтинг
            if (currentUser) {
                API.ratings.get(anime.id).then(data => {
                    if (data && data.score) { currentRating = data.score; updateStars(currentRating); }
                }).catch(() => {});
            }

            stars.forEach((star, index) => {
                star.addEventListener('click', async () => {
                    if (!currentUser) { alert('Войдите, чтобы ставить оценки'); return; }
                    currentRating = index + 1;
                    updateStars(currentRating);
                    try { await API.ratings.set(anime.id, currentRating); } catch {}
                });
                star.addEventListener('mouseenter', () => updateStars(index + 1));
            });
            starRating.addEventListener('mouseleave', () => updateStars(currentRating));
            updateStars(Math.round(currentRating));
        }

        // Озвучка
        const dubbingList = document.getElementById('dubbingList');
        if (dubbingList) {
            const dubbers = ['AniLiberty (AniLibria)', 'DreamCast', 'AniDub', 'TVShows', 'AniFilm', 'Субтитры'];
            dubbingList.innerHTML = dubbers.map(d => `<li>${escapeHtml(d)}</li>`).join('');
            dubbingList.querySelectorAll('li').forEach(li => li.addEventListener('click', () => {
                dubbingList.querySelectorAll('li').forEach(l => l.classList.remove('active'));
                li.classList.add('active');
                alert(`Озвучка "${li.textContent}" выбрана (эмуляция)`);
            }));
        }

        // Плеер
        const playerWrapper = document.getElementById('animePlayerWrapper');
        let ajpInstance = null;

        function extractYouTubeId(url) {
            const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
            return m ? m[1] : null;
        }

        const FALLBACK_VIDEO_ID = 'WTZ5VSmPU9Q';

        function showPlayerIframe(videoId, ep) {
            const wrapper = document.getElementById('animePlayerWrapper');
            if (!wrapper) return;
            const section = document.getElementById('animePlayersSection');
            if (section) section.style.display = '';
            const q = new URLSearchParams();
            const isLocalSrc = videoId && videoId.startsWith('/');
            if (isLocalSrc) {
                q.set('src', videoId);
            } else {
                q.set('v', videoId || FALLBACK_VIDEO_ID);
            }
            if (anime && anime.mal_id) q.set('malId', anime.mal_id);
            if (ep) q.set('ep', ep);
            wrapper.innerHTML = `<iframe
                src="/player.html?${q}"
                style="width:100%;height:460px;border:none;display:block;"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; fullscreen"
                allowfullscreen
            ></iframe>`;
        }

        const loadEpisode = async (season, episode) => {
            document.querySelectorAll('.episode-btn').forEach(b => {
                b.classList.toggle('active', parseInt(b.textContent) === episode);
            });

            // Сразу показываем наш плеер с тестовым видео пока грузятся данные
            showPlayerIframe(FALLBACK_VIDEO_ID, episode);

            try {
                const data = await API.episodes.get(anime.id, season, episode);

                if (!data || !data.video_url) {
                    // Нет данных в БД — оставляем тестовый плеер
                    return;
                }

                const ytId = extractYouTubeId(data.video_url);
                if (ytId) {
                    showPlayerIframe(ytId, episode);
                } else {
                    showPlayerIframe(data.video_url, episode);
                }

            } catch (err) {
                // При ошибке API оставляем тестовый плеер
            }
        };

        document.getElementById('watchNowBtn').addEventListener('click', () => {
            document.getElementById('animePlayersSection')?.scrollIntoView({ behavior: 'smooth' });
        });

        // Автоматически загружаем плеер при открытии страницы
        showPlayerIframe(FALLBACK_VIDEO_ID, 1);

        // Сезоны/серии
        const seasonBtns = document.querySelectorAll('.season-btn');
        const episodesGrid = document.getElementById('episodesGrid');
        let currentSeason = 1, currentEpisode = 1;

        const renderEpisodes = (season) => {
            episodesGrid.innerHTML = '';
            const total = season === 1 ? totalEps : totalEps2;
            for (let i = 1; i <= total; i++) {
                const btn = document.createElement('button');
                btn.className = 'episode-btn' + (i === currentEpisode && season === currentSeason ? ' active' : '');
                btn.textContent = i;
                const meta = anime.episodesMeta?.[i] || {};
                if (meta.filler || meta.ova || meta.short) {
                    const badge = document.createElement('span');
                    badge.className = 'episode-badge';
                    badge.textContent = meta.filler ? 'F' : meta.ova ? 'OVA' : 'К';
                    btn.appendChild(badge);
                }
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentSeason = season; currentEpisode = i;
                    loadEpisode(season, i);
                });
                episodesGrid.appendChild(btn);
            }
        };

        seasonBtns.forEach(btn => btn.addEventListener('click', () => {
            seasonBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const season = parseInt(btn.dataset.season);
            currentSeason = season; currentEpisode = 1;
            renderEpisodes(season);
            loadEpisode(season, 1);
        }));
        renderEpisodes(1);

        // Похожие аниме
        loadSimilarAnime(anime);

        // Кнопка «Добавить в закладки»
        const addToListBtn = document.getElementById('addToListBtn');
        if (addToListBtn) {
            if (isBookmarked) {
                addToListBtn.innerHTML = '<i class="fas fa-check"></i> В закладках';
                addToListBtn.style.borderColor = 'var(--primary)';
            }
            addToListBtn.addEventListener('click', () => {
                if (typeof window.showBookmarkPopup === 'function') {
                    const fakeBtn = document.createElement('button');
                    fakeBtn.style.cssText = 'position:fixed;top:100px;left:100px;visibility:hidden';
                    document.body.appendChild(fakeBtn);
                    window.showBookmarkPopup(anime.id, fakeBtn);
                    setTimeout(() => fakeBtn.remove(), 100);
                }
            });
        }

        // Подписка
        const subscribeBtn = document.getElementById('subscribeBtn');
        if (subscribeBtn) {
            const updateSubBtn = (isSubbed) => {
                subscribeBtn.classList.toggle('subscribed', isSubbed);
                subscribeBtn.innerHTML = isSubbed
                    ? '<i class="fas fa-bell"></i> Вы подписаны'
                    : '<i class="fas fa-bell"></i> Подписаться';
            };

            if (subscriptions[String(anime.id)]) updateSubBtn(true);

            if (currentUser) {
                API.subscriptions.check(anime.id).then(data => {
                    updateSubBtn(!!data.subscribed);
                    subscriptions[String(anime.id)] = data.subscribed || false;
                }).catch(() => {});
            }

            subscribeBtn.addEventListener('click', async () => {
                if (!currentUser) { alert('Войдите, чтобы подписаться'); navigateTo('/auth'); return; }
                const isSubbed = !!subscriptions[String(anime.id)];
                try {
                    if (isSubbed) {
                        await API.subscriptions.unsubscribe(anime.id);
                        delete subscriptions[String(anime.id)];
                        updateSubBtn(false);
                    } else {
                        await API.subscriptions.subscribe(anime.id);
                        subscriptions[String(anime.id)] = true;
                        updateSubBtn(true);
                        if (typeof showNotification === 'function') {
                            showNotification('AniJett', `Вы подписаны на ${anime.title}. Ждите новую серию!`);
                        }
                    }
                    localStorage.setItem('anime_subscriptions', JSON.stringify(subscriptions));
                } catch(e) { alert('Ошибка: ' + (e.message || 'попробуйте позже')); }
            });
        }

        // Форматирование комментария
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tag = btn.dataset.tag;
                const textarea = document.getElementById('newCommentText');
                if (!textarea) return;
                if (tag === 'emoji') {
                    e.stopPropagation();
                    showEmojiPicker(btn, textarea);
                    return;
                }
                const start = textarea.selectionStart, end = textarea.selectionEnd;
                const text = textarea.value;
                let replacement = '', cursorOffset = 0;
                switch (tag) {
                    case 'b': replacement = `**${text.substring(start, end)}**`; cursorOffset = 2; break;
                    case 'i': replacement = `*${text.substring(start, end)}*`; cursorOffset = 1; break;
                    case 'u': replacement = `__${text.substring(start, end)}__`; cursorOffset = 2; break;
                    case 's': replacement = `~~${text.substring(start, end)}~~`; cursorOffset = 2; break;
                    case 'spoiler': replacement = `||${text.substring(start, end)}||`; cursorOffset = 2; break;
                }
                textarea.setRangeText(replacement, start, end, 'end');
                textarea.focus();
                textarea.setSelectionRange(start + cursorOffset, start + replacement.length - cursorOffset);
            });
        });

        // Отправка комментария
        const submitBtn = document.getElementById('submitCommentBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', async () => {
                if (!currentUser) { navigateTo('/auth'); return; }
                const textarea = document.getElementById('newCommentText');
                const text = textarea.value.trim();
                if (!text) return;
                submitBtn.disabled = true;
                try {
                    await API.comments.post(anime.id, text);
                    textarea.value = '';
                    updateStat('comments');
                    await loadComments(anime.id);
                } catch(e) {
                    alert('Ошибка отправки: ' + (e.data?.error || e.message));
                } finally {
                    submitBtn.disabled = false;
                }
            });
        }

        // Загрузка комментариев
        loadComments(anime.id);
    }

    async function loadSimilarAnime(anime) {
        const similarGrid = document.getElementById('similarGrid');
        if (!similarGrid) return;
        try {
            const genres = (anime.genres || []).slice(0, 2);
            const params = { limit: 6 };
            if (genres.length) params.genre = genres[0];
            const data = await API.anime.list(params);
            const items = (data.data || data.anime || data || [])
                .map(normalizeAnime)
                .filter(a => a && String(a.id) !== String(anime.id))
                .slice(0, 6);
            if (!items.length) { similarGrid.innerHTML = '<p style="color:var(--text-dim)">Нет похожих аниме</p>'; return; }
            similarGrid.innerHTML = items.map(a => `
                <div class="similar-card" data-id="${escapeHtml(String(a.id))}" style="cursor:pointer">
                    <img src="${escapeHtml(a.poster)}" alt="${escapeHtml(a.title)}" onerror="this.src='https://via.placeholder.com/120x170/1a1a20/ff5e57?text=Anime'">
                    <div class="similar-title">${escapeHtml(a.title)}</div>
                </div>
            `).join('');
            similarGrid.querySelectorAll('.similar-card').forEach(card => {
                card.addEventListener('click', () => navigateTo(`/anime/${card.dataset.id}`));
            });
        } catch { similarGrid.innerHTML = '<p style="color:var(--text-dim)">Нет похожих аниме</p>'; }
    }

    // ======================== КОММЕНТАРИИ ========================
    async function loadComments(animeId) {
        const commentsList = document.getElementById('commentsList');
        if (!commentsList) return;
        commentsList.innerHTML = '<div style="padding:30px;text-align:center;"><i class="fas fa-spinner fa-spin" style="font-size:24px;color:var(--primary)"></i></div>';
        try {
            const data = await API.comments.list(animeId);
            const comments = data.data || [];
            renderCommentsHTML(commentsList, comments, animeId);
        } catch {
            commentsList.innerHTML = '<div style="color:var(--text-dim);padding:20px;">Не удалось загрузить комментарии.</div>';
        }
    }

    function renderCommentsHTML(container, comments, animeId) {
        if (!comments.length) {
            container.innerHTML = '<div style="color:var(--text-dim);padding:20px;">Комментариев пока нет. Будьте первым!</div>';
            return;
        }
        container.innerHTML = comments.map(c => renderSingleComment(c, false)).join('');
        bindCommentEvents(container, animeId);
    }

    function renderSingleComment(c, isReply) {
        const avatar = c.avatar_url || `https://i.pravatar.cc/48?u=${encodeURIComponent(c.user_id || c.username || 'x')}`;
        const roleBadge = c.role === 'admin'
            ? '<span class="role-badge admin">Админ</span>'
            : c.role === 'moderator'
            ? '<span class="role-badge mod">Мод</span>'
            : '';
        const reactions = c.reactions || {};
        const userReaction = c.user_reaction;

        return `
            <div class="comment-item ${isReply ? 'comment-reply' : ''}" data-comment-id="${escapeHtml(String(c.id))}">
                <img src="${escapeHtml(avatar)}" class="comment-avatar" onerror="this.src='./img/anj-favicon.png'">
                <div class="comment-main">
                    <div class="comment-header">
                        <span class="comment-author">${escapeHtml(c.username || 'Пользователь')}</span>
                        ${roleBadge}
                        <span class="comment-time">${timeAgo(c.created_at)}</span>
                    </div>
                    <div class="comment-text">${applyFormatting(mentionHighlight(escapeHtml(c.text)))}</div>
                    <div class="comment-footer">
                        <div class="comment-reactions-bar">
                            ${REACTION_EMOJIS.map(r => `
                                <button class="reaction-btn ${userReaction === r.key ? 'active' : ''}" data-reaction="${r.key}" title="${r.label}">
                                    ${r.emoji} <span class="reaction-count">${reactions[r.key] || 0}</span>
                                </button>
                            `).join('')}
                        </div>
                        ${!isReply ? `<button class="reply-btn" data-comment-id="${escapeHtml(String(c.id))}" data-author="${escapeHtml(c.username || '')}"><i class="fas fa-reply"></i> Ответить</button>` : ''}
                        <button class="report-comment-btn" data-comment-id="${escapeHtml(String(c.id))}" data-author="${escapeHtml(c.username || '')}"><i class="fas fa-flag"></i></button>
                    </div>
                    ${!isReply ? `
                        <div class="reply-form hidden" id="reply-form-${escapeHtml(String(c.id))}">
                            <textarea class="reply-textarea" placeholder="@${escapeHtml(c.username || '')} ответьте здесь..."></textarea>
                            <div class="reply-form-actions">
                                <button class="reply-submit btn-primary">Ответить</button>
                                <button class="reply-cancel btn-secondary">Отмена</button>
                            </div>
                        </div>
                        ${c.replies && c.replies.length > 0 ? `
                            <div class="comment-replies">
                                ${c.replies.map(r => renderSingleComment(r, true)).join('')}
                            </div>
                        ` : ''}
                    ` : ''}
                </div>
            </div>
        `;
    }

    function bindCommentEvents(container, animeId) {
        // Спойлеры
        container.querySelectorAll('.spoiler').forEach(sp => sp.addEventListener('click', () => sp.classList.toggle('revealed')));

        // Реакции
        container.querySelectorAll('.reaction-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!currentUser) { alert('Войдите, чтобы ставить реакции'); return; }
                const commentItem = btn.closest('.comment-item');
                const commentId = commentItem?.dataset.commentId;
                const reaction = btn.dataset.reaction;
                if (!commentId) return;
                try {
                    const data = await API.comments.react(commentId, reaction);
                    const reactions = data.reactions || {};
                    const userReaction = data.user_reaction;
                    const bar = commentItem.querySelector('.comment-reactions-bar');
                    if (bar) {
                        bar.querySelectorAll('.reaction-btn').forEach(b => {
                            const key = b.dataset.reaction;
                            b.classList.toggle('active', userReaction === key);
                            const countEl = b.querySelector('.reaction-count');
                            if (countEl) countEl.textContent = reactions[key] || 0;
                        });
                    }
                } catch(e) { console.warn('Ошибка реакции:', e.message); }
            });
        });

        // Ответы
        container.querySelectorAll('.reply-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!currentUser) { navigateTo('/auth'); return; }
                const commentId = btn.dataset.commentId;
                const form = document.getElementById(`reply-form-${commentId}`);
                if (!form) return;
                form.classList.toggle('hidden');
                const ta = form.querySelector('.reply-textarea');
                if (ta && !form.classList.contains('hidden')) {
                    ta.focus();
                    const author = btn.dataset.author;
                    if (author && !ta.value) ta.value = `@${author} `;
                }
            });
        });

        container.querySelectorAll('.reply-submit').forEach(btn => {
            btn.addEventListener('click', async () => {
                const form = btn.closest('.reply-form');
                const ta = form?.querySelector('.reply-textarea');
                const text = ta?.value?.trim();
                if (!text) return;
                const commentItem = form?.closest('.comment-item');
                const parentId = commentItem?.dataset.commentId;
                if (!parentId) return;
                btn.disabled = true;
                try {
                    await API.comments.post(animeId, text, parentId);
                    ta.value = '';
                    form.classList.add('hidden');
                    await loadComments(animeId);
                } catch(e) {
                    alert('Ошибка: ' + (e.data?.error || e.message));
                } finally { btn.disabled = false; }
            });
        });

        container.querySelectorAll('.reply-cancel').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.reply-form')?.classList.add('hidden');
            });
        });

        // Жалобы
        container.querySelectorAll('.report-comment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof openReportModal === 'function') {
                    openReportModal({ type: 'comment', id: btn.dataset.commentId, author: btn.dataset.author });
                }
            });
        });
    }

    // ======================== ЖАЛОБЫ ========================
    let reportTarget = null;
    function openReportModal(target) {
        reportTarget = target;
        const modal = document.getElementById('reportModal');
        document.getElementById('reportTargetName').textContent = `«${escapeHtml(target.author)}»`;
        document.querySelectorAll('.report-reasons li').forEach(li => li.classList.remove('selected'));
        document.getElementById('reportComment').value = '';
        document.getElementById('reportSubmitBtn').disabled = true;
        document.getElementById('reportAuthWarning').classList.toggle('hidden', !!currentUser);
        modal.classList.remove('hidden');
        document.querySelectorAll('.report-reasons li').forEach(li => li.addEventListener('click', () => {
            if (!currentUser) return;
            document.querySelectorAll('.report-reasons li').forEach(l => l.classList.remove('selected'));
            li.classList.add('selected');
            document.getElementById('reportSubmitBtn').disabled = false;
        }));
    }

    function closeReportModal() { document.getElementById('reportModal').classList.add('hidden'); reportTarget = null; }

    function initReportModal() {
        const modal = document.getElementById('reportModal');
        document.getElementById('reportCloseBtn').addEventListener('click', closeReportModal);
        document.getElementById('reportCancelBtn').addEventListener('click', closeReportModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeReportModal(); });
        document.getElementById('reportSubmitBtn').addEventListener('click', () => {
            if (!currentUser || !reportTarget) return;
            const selected = document.querySelector('.report-reasons li.selected');
            if (!selected) return;
            alert('Жалоба отправлена. Спасибо!');
            closeReportModal();
        });
    }

    // ======================== МОДАЛКА "НА КОФЕ" ========================
    function initCoffeeModal() {
        const modal = document.getElementById('coffeeModal');
        if (!modal) return;
        if (localStorage.getItem('coffee_hidden') === 'true') return;
        modal.classList.remove('hidden');
        document.getElementById('coffeeHideForever').addEventListener('click', () => {
            localStorage.setItem('coffee_hidden', 'true');
            modal.classList.add('hidden');
        });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    }

    // ======================== ПИКЕР СМАЙЛИКОВ ========================
    const EMOJI_CATEGORIES = [
        {
            label: '😊 Эмоции',
            emojis: ['😊','😂','🤣','😭','🥺','😍','🥰','🤩','😎','🤔','😤','😏','🙄','😑','😒','😒','😩','😫','🥱','😴','🤯','🤬','😡','😠','🤮','🤢','😵','😇','🥳','🤑']
        },
        {
            label: '🔥 Реакции',
            emojis: ['🔥','💯','👍','👎','❤️','💔','💀','☠️','👏','🎉','💪','🙏','🤝','✌️','👌','🤌','💅','🫡','🫶','💘']
        },
        {
            label: '🎌 Аниме',
            emojis: ['⚔️','🗡️','🛡️','🌸','✨','💫','🌙','⭐','🌟','🎭','🎬','📺','🎮','🎴','🃏','🀄','🧧','👺','👹','🦊']
        },
        {
            label: '🐾 Животные',
            emojis: ['🐱','🐶','🐰','🦊','🐺','🐻','🐼','🐨','🦁','🐯','🦄','🐲','🦋','🐸','🐧','🐦','🦅','🐙','🦑','🐠']
        },
        {
            label: '💬 Символы',
            emojis: ['❗','❓','‼️','⁉️','💢','💥','💦','💨','🕳️','💬','💭','🗨️','🔔','🔕','🎵','🎶','🔊','📢','📣','⚡']
        }
    ];

    let emojiPickerEl = null;
    let emojiTargetTextarea = null;
    let emojiActiveCategory = 0;

    function createEmojiPicker() {
        const div = document.createElement('div');
        div.id = 'emojiPickerPopup';
        div.className = 'emoji-picker-popup hidden';
        div.innerHTML = `
            <div class="emoji-picker-header">
                <span class="emoji-picker-title">✨ Смайлики</span>
                <span class="emoji-picker-hint">Скоро: кастомные эмодзи</span>
            </div>
            <div class="emoji-picker-tabs" id="emojiPickerTabs"></div>
            <div class="emoji-picker-grid" id="emojiPickerGrid"></div>
        `;
        document.body.appendChild(div);

        // Закрытие по клику вне
        document.addEventListener('click', (e) => {
            if (!div.contains(e.target) && !e.target.closest('[data-tag="emoji"]')) {
                closeEmojiPicker();
            }
        });

        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeEmojiPicker();
        });

        return div;
    }

    function renderEmojiPickerContent() {
        if (!emojiPickerEl) return;
        const tabsEl = document.getElementById('emojiPickerTabs');
        const gridEl = document.getElementById('emojiPickerGrid');
        if (!tabsEl || !gridEl) return;

        tabsEl.innerHTML = EMOJI_CATEGORIES.map((cat, i) => `
            <button class="emoji-tab-btn ${i === emojiActiveCategory ? 'active' : ''}" data-cat="${i}" title="${cat.label}">
                ${cat.emojis[0]}
            </button>
        `).join('');

        gridEl.innerHTML = EMOJI_CATEGORIES[emojiActiveCategory].emojis.map(e =>
            `<button class="emoji-item" data-emoji="${e}">${e}</button>`
        ).join('');

        tabsEl.querySelectorAll('.emoji-tab-btn').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                emojiActiveCategory = parseInt(btn.dataset.cat);
                renderEmojiPickerContent();
            });
        });

        gridEl.querySelectorAll('.emoji-item').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                insertEmoji(btn.dataset.emoji);
            });
        });
    }

    function showEmojiPicker(triggerBtn, textarea) {
        if (!emojiPickerEl) emojiPickerEl = createEmojiPicker();
        emojiTargetTextarea = textarea;

        const isVisible = !emojiPickerEl.classList.contains('hidden');
        if (isVisible) { closeEmojiPicker(); return; }

        renderEmojiPickerContent();

        // Позиционирование над кнопкой
        const rect = triggerBtn.getBoundingClientRect();
        const pickerWidth = 300;
        const pickerHeight = 270;
        const scrollTop = window.scrollY;
        const scrollLeft = window.scrollX;

        let top = rect.top + scrollTop - pickerHeight - 8;
        let left = rect.left + scrollLeft;

        if (top < scrollTop + 8) top = rect.bottom + scrollTop + 8;
        if (left + pickerWidth > document.documentElement.clientWidth - 8) {
            left = document.documentElement.clientWidth - pickerWidth - 8 + scrollLeft;
        }

        emojiPickerEl.style.top = `${top}px`;
        emojiPickerEl.style.left = `${left}px`;
        emojiPickerEl.classList.remove('hidden');
    }

    function closeEmojiPicker() {
        if (emojiPickerEl) emojiPickerEl.classList.add('hidden');
    }

    function insertEmoji(emoji) {
        const ta = emojiTargetTextarea || document.getElementById('newCommentText');
        if (!ta) return;
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? ta.value.length;
        ta.setRangeText(emoji, start, end, 'end');
        ta.focus();
        closeEmojiPicker();
    }

    // ======================== ИНИЦИАЛИЗАЦИЯ ========================
    async function init() {
        // Восстановление сессии по токену
        const token = API.getToken();
        if (token && !currentUser) {
            try {
                const me = await API.auth.me();
                currentUser = me;
                localStorage.setItem('anijett_user', JSON.stringify(me));
            } catch { API.clearTokens(); currentUser = null; }
        } else if (token && currentUser) {
            API.auth.me().then(me => {
                currentUser = me;
                localStorage.setItem('anijett_user', JSON.stringify(me));
                updateAuthUI();
            }).catch(() => {});
        }

        if (currentUser) {
            syncBookmarksFromServer();
            setTimeout(refreshNotifBadge, 1000);
        }

        updateAuthUI();
        initNavigation();
        initBookmarkFilters();
        initBookmarkTypeTabs();
        initAnimeTabs();
        initNotifications();
        initBookmarkPopup();
        initSearch();
        initReportModal();
        initCoffeeModal();
        requestNotificationPermission();

        // Тема
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            if (localStorage.getItem('theme') === 'light') {
                document.body.classList.add('light');
                themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            }
            themeToggle.addEventListener('click', () => {
                document.body.classList.toggle('light');
                const isLight = document.body.classList.contains('light');
                localStorage.setItem('theme', isLight ? 'light' : 'dark');
                themeToggle.innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            });
        }

        const topBtn = document.getElementById('scrollTopBtn');
        if (topBtn) {
            window.addEventListener('scroll', () => topBtn.classList.toggle('visible', window.scrollY > 300));
            topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        }

        // Cookies
        const cookiesBanner = document.getElementById('cookiesBanner');
        if (cookiesBanner) {
            const consent = localStorage.getItem('cookies_consent');
            if (consent === 'accepted' || consent === 'declined') {
                cookiesBanner.classList.add('hidden');
            } else {
                document.getElementById('acceptCookies')?.addEventListener('click', () => {
                    localStorage.setItem('cookies_consent', 'accepted');
                    cookiesBanner.classList.add('hidden');
                });
                document.getElementById('declineCookies')?.addEventListener('click', () => {
                    localStorage.setItem('cookies_consent', 'declined');
                    cookiesBanner.classList.add('hidden');
                });
            }
        }

        // Бургер-меню
        const burgerBtn = document.getElementById('burgerBtn');
        const mainNav = document.getElementById('mainNav');
        if (burgerBtn && mainNav) {
            burgerBtn.addEventListener('click', () => {
                const isOpen = mainNav.classList.toggle('open');
                burgerBtn.classList.toggle('open', isOpen);
                burgerBtn.setAttribute('aria-expanded', isOpen);
            });
            mainNav.querySelectorAll('a[data-nav-link]').forEach(link => {
                link.addEventListener('click', () => {
                    mainNav.classList.remove('open');
                    burgerBtn.classList.remove('open');
                    burgerBtn.setAttribute('aria-expanded', 'false');
                });
            });
        }

        // Периодическое обновление бейджа уведомлений
        if (currentUser) setInterval(refreshNotifBadge, 60000);
    }

    init();
})();
