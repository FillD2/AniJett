(function() {
    'use strict';

    // ── URL params ─────────────────────────────────────────────────────────────
    const urlParams   = new URLSearchParams(window.location.search);
    const VIDEO_ID    = urlParams.get('v')     || 'WTZ5VSmPU9Q';
    const SRC_URL     = urlParams.get('src')   || '';
    const IS_HTML5    = !!SRC_URL;
    const MAL_ID      = urlParams.get('malId') || '';
    const EPISODE_NUM = parseInt(urlParams.get('ep') || '1', 10);

    // ── State ──────────────────────────────────────────────────────────────────
    let player          = null;
    let isPlayerReady   = false;
    let currentVolume   = 70;
    let isMuted         = false;
    let progressInterval= null;
    let hideTimer       = null;
    let autoSkipEnabled = false;
    let opInterval      = null; // { startTime, endTime }
    let edInterval      = null;
    let lastAutoSkipTime= -1;   // prevent repeated auto-skip fires

    // ── DOM refs ───────────────────────────────────────────────────────────────
    const videoWrapper         = document.getElementById('videoWrapper');
    const controlsBar          = document.getElementById('videoControls');
    const topPanel             = document.getElementById('topPanel');
    const playPauseBtn         = document.getElementById('playPauseBtn');
    const progressHidden       = document.getElementById('progressHidden');
    const progressFilled       = document.getElementById('progressFilled');
    const progressMarkers      = document.getElementById('progressMarkers');
    const currentTimeSpan      = document.getElementById('currentTime');
    const durationSpan         = document.getElementById('duration');
    const volumeSlider         = document.getElementById('volumeSlider');
    const muteBtn              = document.getElementById('muteBtn');
    const fullscreenBtn        = document.getElementById('fullscreenBtn');
    const fullscreenIcon       = document.getElementById('fullscreenIcon');
    const settingsBtn          = document.getElementById('settingsBtn');
    const screenshotBtn        = document.getElementById('screenshotBtn');
    const loadingOverlay       = document.getElementById('loadingOverlay');
    const settingsPopup        = document.getElementById('settingsPopup');
    const lightingToggle       = document.getElementById('lightingToggle');
    const autoSkipToggle       = document.getElementById('autoSkipToggle');
    const colorVisionSelect    = document.getElementById('colorVisionSelect');
    const qualitySelect        = document.getElementById('qualitySelect');
    const playbackSpeedSetting = document.getElementById('playbackSpeedSetting');
    const skipOpFloat          = document.getElementById('skipOpFloat');
    const skipEdFloat          = document.getElementById('skipEdFloat');
    const skipOpTime           = document.getElementById('skipOpTime');
    const skipEdTime           = document.getElementById('skipEdTime');
    const aplToast             = document.getElementById('aplToast');

    // ── Video filter container (for color-blindness / brightness) ──────────────
    const videoFilterContainer = document.createElement('div');
    videoFilterContainer.className = 'video-filter-container';
    const ytDiv = document.getElementById('youtube-player');
    videoWrapper.insertBefore(videoFilterContainer, ytDiv);
    videoFilterContainer.appendChild(ytDiv);

    // SVG color-blindness filters
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    document.body.appendChild(svgEl);
    ({
        protanopia:   '0.567,0.433,0,0,0  0.558,0.442,0,0,0  0,0.242,0.758,0,0  0,0,0,1,0',
        deuteranopia: '0.625,0.375,0,0,0  0.7,0.3,0,0,0  0,0.3,0.7,0,0  0,0,0,1,0',
        tritanopia:   '0.95,0.05,0,0,0  0,0.433,0.567,0,0  0,0.475,0.525,0,0  0,0,0,1,0',
    });
    Object.entries({
        protanopia:   '0.567,0.433,0,0,0  0.558,0.442,0,0,0  0,0.242,0.758,0,0  0,0,0,1,0',
        deuteranopia: '0.625,0.375,0,0,0  0.7,0.3,0,0,0  0,0.3,0.7,0,0  0,0,0,1,0',
        tritanopia:   '0.95,0.05,0,0,0  0,0.433,0.567,0,0  0,0.475,0.525,0,0  0,0,0,1,0',
    }).forEach(([id, matrix]) => {
        const f = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        f.id = id;
        f.innerHTML = `<feColorMatrix type="matrix" values="${matrix}"/>`;
        svgEl.appendChild(f);
    });

    // ── Toast ──────────────────────────────────────────────────────────────────
    let toastTimer = null;
    function showToast(msg, icon = '') {
        aplToast.innerHTML = icon ? `<i class="${icon}"></i> ${msg}` : msg;
        aplToast.classList.add('visible');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => aplToast.classList.remove('visible'), 2600);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    function formatTime(s) {
        if (isNaN(s) || s < 0) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
    }

    // ── AniSkip API ────────────────────────────────────────────────────────────
    async function fetchSkipTimes() {
        if (!MAL_ID) return;
        try {
            const url = `https://api.aniskip.com/v2/skip-times/${MAL_ID}/${EPISODE_NUM}?types[]=op&types[]=ed&episodeLength=0`;
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            if (!data.found || !data.results.length) return;
            data.results.forEach(r => {
                if (r.skipType === 'op') { opInterval = r.interval; }
                if (r.skipType === 'ed') { edInterval = r.interval; }
            });
            drawProgressMarkers();
        } catch(_) { /* AniSkip недоступен — используем фоллбэк */ }
    }

    // ── Progress markers on the timeline ──────────────────────────────────────
    function drawProgressMarkers() {
        progressMarkers.innerHTML = '';
        const dur = (isPlayerReady && player) ? player.getDuration() : 0;
        if (!dur) return;
        function addMarker(start, end, cls) {
            const m = document.createElement('div');
            m.className = `pmarker ${cls}`;
            m.style.left  = (start / dur * 100) + '%';
            m.style.width = ((end - start) / dur * 100) + '%';
            progressMarkers.appendChild(m);
        }
        if (opInterval) addMarker(opInterval.startTime, opInterval.endTime, 'pmarker--op');
        if (edInterval) addMarker(edInterval.startTime, edInterval.endTime, 'pmarker--ed');
    }

    // ── Floating skip buttons logic ────────────────────────────────────────────
    function updateSkipButtons(cur, dur) {
        // OP —————————————————————————
        let showOp = false;
        if (opInterval && cur >= opInterval.startTime && cur < opInterval.endTime) {
            showOp = true;
            const rem = opInterval.endTime - cur;
            skipOpTime.textContent = `→ ${formatTime(opInterval.endTime)} (осталось ${formatTime(rem)})`;
        } else if (!opInterval && dur > 0 && cur > 3 && cur < 90) {
            showOp = true;
            skipOpTime.textContent = '';
        }
        skipOpFloat.style.display = showOp ? '' : 'none';

        // ED —————————————————————————
        let showEd = false;
        if (edInterval && cur >= edInterval.startTime && cur < edInterval.endTime) {
            showEd = true;
            const rem = edInterval.endTime - cur;
            skipEdTime.textContent = `→ ${formatTime(edInterval.endTime)} (осталось ${formatTime(rem)})`;
        } else if (!edInterval && dur > 0 && cur > dur - 120 && cur < dur - 3) {
            showEd = true;
            skipEdTime.textContent = '';
        }
        skipEdFloat.style.display = showEd ? '' : 'none';

        // Auto-skip ——————————————————
        if (autoSkipEnabled && isPlayerReady && player) {
            if (opInterval && cur >= opInterval.startTime + 1 && cur < opInterval.endTime) {
                if (Math.abs(cur - lastAutoSkipTime) > 3) {
                    lastAutoSkipTime = cur;
                    player.seekTo(opInterval.endTime, true);
                    showToast('Опенинг пропущен автоматически', 'fas fa-forward');
                }
            }
            if (edInterval && cur >= edInterval.startTime + 1 && cur < edInterval.endTime) {
                if (Math.abs(cur - lastAutoSkipTime) > 3) {
                    lastAutoSkipTime = cur;
                    player.seekTo(edInterval.endTime, true);
                    showToast('Эндинг пропущен автоматически', 'fas fa-forward');
                }
            }
        }
    }

    // Skip button clicks
    skipOpFloat.addEventListener('click', () => {
        if (!isPlayerReady) return;
        const target = opInterval ? opInterval.endTime : 90;
        player.seekTo(target, true);
        skipOpFloat.style.display = 'none';
        showToast('Опенинг пропущен', 'fas fa-forward');
    });
    skipEdFloat.addEventListener('click', () => {
        if (!isPlayerReady) return;
        const target = edInterval ? edInterval.endTime : player.getDuration();
        player.seekTo(target, true);
        skipEdFloat.style.display = 'none';
        showToast('Эндинг пропущен', 'fas fa-forward');
    });

    // ── Visual filters ─────────────────────────────────────────────────────────
    function applyVisualFilters() {
        let f = '';
        if (lightingToggle.classList.contains('active')) f += 'brightness(1.12) contrast(1.18) saturate(1.1) ';
        const mode = colorVisionSelect.value;
        if (mode !== 'none') f += `url(#${mode}) `;
        videoFilterContainer.style.filter = f.trim() || 'none';
    }
    lightingToggle.addEventListener('click', () => { lightingToggle.classList.toggle('active'); applyVisualFilters(); });
    colorVisionSelect.addEventListener('change', applyVisualFilters);

    // ── Auto-hide controls ─────────────────────────────────────────────────────
    function showControls() {
        controlsBar.classList.remove('hidden');
        topPanel.classList.remove('hidden');
        resetHideTimer();
    }
    function hideControls() {
        if (!settingsPopup.classList.contains('active')) {
            controlsBar.classList.add('hidden');
            topPanel.classList.add('hidden');
        }
    }
    function resetHideTimer() {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(hideControls, 4000);
    }
    videoWrapper.addEventListener('mousemove', showControls);
    videoWrapper.addEventListener('mouseenter', showControls);
    videoWrapper.addEventListener('mouseleave', () => { if (!settingsPopup.classList.contains('active')) hideControls(); });
    controlsBar.addEventListener('mouseenter', resetHideTimer);
    topPanel.addEventListener('mouseenter', resetHideTimer);
    videoWrapper.addEventListener('touchstart', showControls, { passive: true });

    // ── Progress ───────────────────────────────────────────────────────────────
    function updateProgress() {
        if (!isPlayerReady || !player) return;
        try {
            const cur = player.getCurrentTime();
            const dur = player.getDuration();
            if (dur && isFinite(dur) && dur > 0) {
                const pct = (cur / dur) * 100;
                progressHidden.value = pct;
                progressFilled.style.width = pct + '%';
                currentTimeSpan.textContent = formatTime(cur);
                durationSpan.textContent    = formatTime(dur);
                updateSkipButtons(cur, dur);
            }
        } catch(_) {}
    }
    function startSync() {
        if (progressInterval) clearInterval(progressInterval);
        progressInterval = setInterval(updateProgress, 300);
    }

    // ── Play / Pause ───────────────────────────────────────────────────────────
    function updatePlayIcon() {
        if (!isPlayerReady) return;
        const playing = IS_HTML5
            ? !player._video.paused
            : player.getPlayerState() === YT.PlayerState.PLAYING;
        playPauseBtn.innerHTML = playing
            ? '<i class="fas fa-pause"></i>'
            : '<i class="fas fa-play"></i>';
    }
    function togglePlayPause() {
        if (!isPlayerReady) return;
        if (IS_HTML5) {
            player._video.paused ? player.playVideo() : player.pauseVideo();
        } else {
            player.getPlayerState() === YT.PlayerState.PLAYING
                ? player.pauseVideo()
                : player.playVideo();
        }
        updatePlayIcon();
    }

    // ── Volume ─────────────────────────────────────────────────────────────────
    function setVolume(val) {
        if (!isPlayerReady) return;
        val = Math.min(100, Math.max(0, val));
        currentVolume = val;
        player.setVolume(val);
        volumeSlider.value = val;
        isMuted = (val === 0);
        muteBtn.innerHTML = val === 0
            ? '<i class="fas fa-volume-mute"></i>'
            : val < 50
                ? '<i class="fas fa-volume-down"></i>'
                : '<i class="fas fa-volume-up"></i>';
        showToast(`Громкость: ${val}%`, 'fas fa-volume-up');
    }
    function toggleMute() {
        if (!isPlayerReady) return;
        if (isMuted) { player.unMute(); setVolume(currentVolume || 70); }
        else { player.mute(); setVolume(0); }
    }

    // ── Seek ───────────────────────────────────────────────────────────────────
    function seekBySeconds(sec) {
        if (!isPlayerReady) return;
        const cur = player.getCurrentTime();
        const dur = player.getDuration();
        const target = Math.min(dur, Math.max(0, cur + sec));
        player.seekTo(target, true);
        progressFilled.style.width = (target / dur * 100) + '%';
        showToast(sec > 0 ? `+${sec} сек` : `${sec} сек`, sec > 0 ? 'fas fa-forward' : 'fas fa-backward');
    }
    function seekToPercent(pct) {
        if (!isPlayerReady) return;
        pct = Math.min(100, Math.max(0, pct));
        player.seekTo((pct / 100) * player.getDuration(), true);
        progressFilled.style.width = pct + '%';
    }

    // ── Fullscreen ─────────────────────────────────────────────────────────────
    function updateFullscreenIcon(isFs) {
        fullscreenIcon.className = isFs ? 'fas fa-compress' : 'fas fa-expand';
    }
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            videoWrapper.requestFullscreen().catch(e => console.warn(e));
        } else {
            document.exitFullscreen().catch(e => console.warn(e));
        }
    }
    document.addEventListener('fullscreenchange', () => updateFullscreenIcon(!!document.fullscreenElement));

    // ── Screenshot (K key) ─────────────────────────────────────────────────────
    function captureFrame() {
        if (!isPlayerReady) return;
        const cur = formatTime(player.getCurrentTime());

        function drawOverlayAndSave(canvas, ctx) {
            const W = canvas.width, H = canvas.height;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, H - 54, W, 54);
            ctx.fillStyle = '#ff5e57';
            ctx.font = 'bold 22px Inter, Arial, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText('AniJett', 20, H - 27);
            ctx.fillStyle = '#eaeef2';
            ctx.font = '20px Inter, Arial, sans-serif';
            ctx.fillText(`Время: ${cur}`, 120, H - 27);
            ctx.fillStyle = '#9aa5b5';
            ctx.textAlign = 'right';
            ctx.fillText(new Date().toLocaleString('ru-RU'), W - 16, H - 27);
            canvas.toBlob(blob => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `anijett_${cur.replace(':', '-')}.png`;
                a.click();
            });
            showToast('Скриншот сохранён', 'fas fa-camera');
        }

        if (IS_HTML5) {
            const vid = player._video;
            const W = vid.videoWidth || 1280, H = vid.videoHeight || 720;
            const canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(vid, 0, 0, W, H);
            drawOverlayAndSave(canvas, ctx);
            return;
        }

        const W = 1280, H = 720;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { ctx.drawImage(img, 0, 0, W, H); drawOverlayAndSave(canvas, ctx); };
        img.onerror = () => {
            ctx.fillStyle = '#0f0f12';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#ff5e57';
            ctx.font = 'bold 36px Inter, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('AniJett', W/2, H/2 - 24);
            ctx.fillStyle = '#eaeef2';
            ctx.font = '28px Inter, Arial, sans-serif';
            ctx.fillText(cur, W/2, H/2 + 24);
            drawOverlayAndSave(canvas, ctx);
        };
        img.src = `https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg`;
    }

    // ── Keyboard shortcuts ─────────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        switch (e.key) {
            case ' ':
                e.preventDefault(); togglePlayPause(); break;
            case 'k': case 'K':
                e.preventDefault(); captureFrame(); break;
            case 'ArrowLeft':
                e.preventDefault(); seekBySeconds(-5); break;
            case 'ArrowRight':
                e.preventDefault(); seekBySeconds(5); break;
            case 'ArrowUp':
                e.preventDefault(); setVolume(currentVolume + 5); break;
            case 'ArrowDown':
                e.preventDefault(); setVolume(currentVolume - 5); break;
            case 'f': case 'F':
                e.preventDefault(); toggleFullscreen(); break;
            case 'm': case 'M':
                e.preventDefault(); toggleMute(); break;
        }
    });

    // ── Settings popup ─────────────────────────────────────────────────────────
    settingsBtn.addEventListener('click', e => {
        e.stopPropagation();
        settingsPopup.classList.toggle('active');
        settingsPopup.classList.contains('active') ? showControls() : resetHideTimer();
    });
    document.addEventListener('click', e => {
        if (!settingsPopup.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPopup.classList.remove('active');
            resetHideTimer();
        }
    });

    // Auto-skip toggle
    autoSkipToggle.addEventListener('click', () => {
        autoSkipToggle.classList.toggle('active');
        autoSkipEnabled = autoSkipToggle.classList.contains('active');
        showToast(autoSkipEnabled ? 'Авто-пропуск включён' : 'Авто-пропуск выключен', 'fas fa-forward');
    });

    // Quality / speed
    qualitySelect.addEventListener('change', e => { if (isPlayerReady) player.setPlaybackQuality(e.target.value); });
    playbackSpeedSetting.addEventListener('change', e => {
        if (isPlayerReady) {
            player.setPlaybackRate(parseFloat(e.target.value));
            showToast(`Скорость: ${e.target.value}×`, 'fas fa-tachometer-alt');
        }
    });

    // ── Controls bindings ──────────────────────────────────────────────────────
    playPauseBtn.addEventListener('click', togglePlayPause);
    progressHidden.addEventListener('input',  e => { progressFilled.style.width = e.target.value + '%'; });
    progressHidden.addEventListener('change', e => seekToPercent(parseFloat(e.target.value)));
    volumeSlider.addEventListener('input',    e => setVolume(parseInt(e.target.value)));
    muteBtn.addEventListener('click', toggleMute);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    screenshotBtn.addEventListener('click', captureFrame);

    videoWrapper.addEventListener('click', e => {
        if (e.target.closest('.video-controls, .video-top-panel, .settings-popup, .skip-float-btn')) return;
        togglePlayPause();
    });

    // ── YouTube IFrame API ─────────────────────────────────────────────────────
    function createPlayer() {
        if (player) return;
        player = new YT.Player('youtube-player', {
            videoId: VIDEO_ID,
            playerVars: {
                controls: 0, modestbranding: 1, rel: 0,
                fs: 0, disablekb: 1, origin: window.location.origin,
            },
            events: {
                onReady: () => {
                    isPlayerReady = true;
                    loadingOverlay.style.opacity = '0';
                    setTimeout(() => { loadingOverlay.style.display = 'none'; }, 400);
                    showControls();
                    setVolume(currentVolume);
                    player.setPlaybackRate(parseFloat(playbackSpeedSetting.value));
                    player.setPlaybackQuality(qualitySelect.value);
                    startSync();
                    updatePlayIcon();
                    updateFullscreenIcon(false);
                    // Draw markers once duration is known
                    setTimeout(drawProgressMarkers, 1500);
                },
                onStateChange: () => { updatePlayIcon(); updateProgress(); },
                onError: () => {
                    loadingOverlay.style.display = 'flex';
                    loadingOverlay.style.opacity = '1';
                    loadingOverlay.innerHTML =
                        '<i class="fas fa-exclamation-triangle" style="font-size:2rem;color:#ff5e57;margin-bottom:8px;"></i>' +
                        '<span>Ошибка загрузки видео</span>';
                },
            },
        });
    }

    function initPlayer() {
        if (typeof YT !== 'undefined' && YT.Player) {
            createPlayer();
        } else {
            window.onYouTubeIframeAPIReady = createPlayer;
            setTimeout(() => {
                if (!player) {
                    if (typeof YT === 'undefined') {
                        const s = document.createElement('script');
                        s.src = 'https://www.youtube.com/iframe_api';
                        document.head.appendChild(s);
                    } else {
                        createPlayer();
                    }
                }
            }, 1500);
        }
        setTimeout(() => { if (loadingOverlay) loadingOverlay.style.display = 'none'; }, 8000);
    }

    // ── Boot ───────────────────────────────────────────────────────────────────
    initPlayer();
    fetchSkipTimes();
})();
