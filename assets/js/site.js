(() => {
    'use strict';

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const columns = (el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    const RAD = Math.PI / 180;

    /* ---------- Nav ---------- */

    const nav = $('.nav');
    const toggle = $('.nav__toggle');
    const links = $('.nav__links');
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const setMenu = (open) => {
        links.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Close' : 'Menu';
    };
    toggle.addEventListener('click', () => setMenu(!links.classList.contains('is-open')));
    links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });

    /* ---------- Section colour themes ---------- */

    const THEME_COLOR = { paper: '#F2F4FA', ink: '#0D1033', ultra: '#2B3CF5', marigold: '#FFB21A' };
    const themeMeta = $('meta[name="theme-color"]');

    if ('IntersectionObserver' in window) {
        // A zero-height line 45% down the viewport: whichever section crosses it sets the theme.
        const themes = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                const t = e.target.dataset.theme;
                document.body.dataset.theme = t;
                if (themeMeta) themeMeta.content = THEME_COLOR[t];
            }
        }, { rootMargin: '-45% 0px -55% 0px' });
        $$('main > [data-theme]').forEach((s) => themes.observe(s));

        const reveal = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                e.target.classList.add('is-in');
                reveal.unobserve(e.target);
            }
        }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
        $$('[data-reveal]').forEach((el) => reveal.observe(el));
    } else {
        $$('[data-reveal]').forEach((el) => el.classList.add('is-in'));
    }

    /* ---------- Work filters ---------- */

    const filterBtns = $$('.filters__btn');
    const sites = $$('.site');
    filterBtns.forEach((btn) => btn.addEventListener('click', () => {
        const f = btn.dataset.filter;
        filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        sites.forEach((s) => {
            s.hidden = !(f === 'all' || s.dataset.cat === f);
            if (!s.hidden) s.classList.add('is-in');
        });
    }));

    /* ---------- Scroll motion: entry vectors, service names, logo wall ---------- */

    if (!reduce) initMotion();

    function initMotion() {
        const grid = $('#site-grid');
        const logos = $('.logos');
        const quotesBox = $('.quotes');
        const names = $$('.kit dt');
        const services = $('#services');

        // Entry vectors for the work grid: x, y, scale, rotate.
        const KIND = {
            L: (far) => [-far, 20, 1, -2],
            R: (far) => [far, 20, 1, 2],
            F: () => [0, 80, 0.84, 0],     // from further away
            N: () => [0, 30, 1.12, 0],     // from close to the viewer
            U: () => [0, 130, 0.96, 0]
        };
        const PATTERN = { 3: ['LFR', 'NUR'], 2: ['LF', 'NR'] };
        const SOLO = 'LRFRLN';

        function aim() {
            if (grid) {
                const cols = columns(grid);
                const colW = grid.clientWidth / cols;
                const far = clamp(window.innerWidth * 0.08, 40, 120);
                let row = -1, lastTop = null, n = 0;
                sites.forEach((s) => {
                    if (s.hidden) return;
                    if (s.offsetTop !== lastTop) { row++; lastTop = s.offsetTop; }
                    n++;
                    if (s.classList.contains('is-in')) return;
                    const col = clamp(Math.round((s.offsetLeft - grid.offsetLeft) / colW), 0, cols - 1);
                    let k;
                    if (s.classList.contains('site--wide')) k = 'F';
                    else if (cols === 1) k = SOLO[(n - 1) % SOLO.length];
                    else { const p = PATTERN[cols] || PATTERN[3]; k = p[row % 2][col] || 'F'; }
                    const [x, y, sc, r] = KIND[k](far);
                    s.style.setProperty('--ex', x + 'px');
                    s.style.setProperty('--ey', y + 'px');
                    s.style.setProperty('--es', sc);
                    s.style.setProperty('--er', r + 'deg');
                    s.style.setProperty('--ed', (cols === 1 ? 0 : col * 90) + 'ms');
                });
            }
            if (logos) {
                // A diagonal sweep with a tie-break, so every tile lands on its own beat.
                const cols = columns(logos);
                $$('.logo', logos).forEach((l, i) => {
                    const r = Math.floor(i / cols), c = i % cols;
                    l.style.setProperty('--d', ((r + c) * 2 + r) * 55 + 'ms');
                });
            }
            if (quotesBox) {
                const qs = $$('.quote', quotesBox);
                const w = qs[0] ? qs[0].offsetWidth : 1;
                qs.forEach((q) => {
                    if (q.classList.contains('is-in')) return;
                    const col = Math.round((q.offsetLeft - qs[0].offsetLeft) / w);
                    q.style.setProperty('--qy', (col % 2 ? 5 : -5) + 'deg');
                    q.style.setProperty('--qd', col * 110 + 'ms');
                });
            }
        }

        // Service names scale up as they cross the middle of the screen.
        const docTop = (el) => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
        let centres = [], live = false, ticking = false;
        const measureNames = () => { centres = names.map((d) => docTop(d) + d.offsetHeight / 2); };
        const swell = () => {
            ticking = false;
            const vh = window.innerHeight, mid = window.scrollY + vh / 2, reach = vh * 0.42;
            names.forEach((d, i) => {
                const t = clamp(1 - Math.abs(centres[i] - mid) / reach, 0, 1);
                const v = (1 + 0.075 * t * t * (3 - 2 * t)).toFixed(4);
                if (d._s !== v) { d._s = v; d.style.transform = 'scale(' + v + ')'; }
            });
        };
        const ask = () => { if (live && !ticking) { ticking = true; requestAnimationFrame(swell); } };
        if (services && names.length && 'IntersectionObserver' in window) {
            new IntersectionObserver((es) => { live = es[0].isIntersecting; ask(); }).observe(services);
            window.addEventListener('scroll', ask, { passive: true });
        }

        let queued = false;
        const refresh = () => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => { queued = false; aim(); measureNames(); ask(); });
        };
        aim();
        measureNames();
        if ('ResizeObserver' in window) new ResizeObserver(refresh).observe(document.body);
        window.addEventListener('resize', refresh);
        filterBtns.forEach((b) => b.addEventListener('click', refresh));
    }

    /* ---------- Orbit ---------- */

    const stage = $('.orbit');
    if (stage) initOrbit(stage);

    function initOrbit(stage) {
        const cards = $$('.sat', stage);
        const N = cards.length;
        const STEP = 360 / N;
        const canvas = $('.orbit__globe', stage);
        const ctx = canvas.getContext('2d');
        const backPath = $('.orbit__path--back path', stage);
        const frontPath = $('.orbit__path--front path', stage);
        const capName = $('.facing__name');
        const capMeta = $('.facing__meta');
        const capOpen = $('.facing__open');
        const hero = stage.closest('.hero');
        const rings = $$('.orbit__path', stage);
        const facing = $('.facing');
        const railFill = $('.hero__rail i');
        // Smoothstep over a slice of the zoom, so an element eases in during part of the pull-back.
        const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
        const win = (a, b) => sm((pz - a) / (b - a));

        const P = 1400;                 // viewing distance used for the perspective scale
        const AUTO = reduce ? 0 : 7;    // idle spin, degrees per second

        let W = 0, H = 0, cw = 0, ch = 0, Rx = 0, Rz = 0, Ty = 0, cx = 0, cy = 0, Rg = 0, gy = 0, dpr = 1;
        let rot = 0, vel = AUTO, target = null, hold = 0, hover = false, dragging = false;
        let front = -1, activePin = '', t0 = performance.now(), last = t0, raf = 0, visible = true;

        /* Scroll zoom: 0 = close-up with cards flown out, 1 = settled orbit. */
        const ZOOM = 0.6;
        const SCROLL_ZOOM = false;      // scroll pull-back and pinned hero: off, the orbit stays as it was
        // Fly-out vector per card: x (left/right), y (up/down), depth (+ nearer, - further).
        const DIRS = [[-1, -0.25, 0.9], [1, -0.1, -0.4], [0.15, -1, 0.5], [-0.9, 0.35, 1.2], [0.95, -0.7, 0.3],
            [-0.4, -1, -0.45], [1, 0.3, 1], [-1, -0.6, -0.3], [0.5, -1, 1.1], [-0.75, 0.1, 0.6],
            [0.85, 0.2, -0.35], [-0.15, -1, 0.8], [1, -0.45, 0.65], [-1, 0.15, -0.2]];
        const LAG_MAX = 0.3;
        const lag = (i) => ((i * 5) % 7) / 7 * LAG_MAX;
        let pz = (reduce || !SCROLL_ZOOM) ? 1 : 0, pinLen = 1, orbitTop = 0, near = null, lastGT = '';

        function setPin() {
            if (!hero || reduce || !SCROLL_ZOOM) return;
            hero.classList.remove('is-pinned');
            if (window.innerWidth >= 760 && hero.offsetHeight <= window.innerHeight * 1.3) hero.classList.add('is-pinned');
            pinLen = Math.max(1, hero.offsetHeight - window.innerHeight);
        }
        function zoomTarget() {
            if (reduce || !SCROLL_ZOOM) return 1;
            const vh = window.innerHeight, y = window.scrollY;
            if (hero && hero.classList.contains('is-pinned')) return clamp(y / pinLen, 0, 1);
            // Not pinned (phones): start close-up at the top, settle as the ring nears the middle of the screen.
            const range = Math.max(vh * 0.45, orbitTop + H / 2 - vh * 0.55);
            return clamp(y / range, 0, 1);
        }

        stage.classList.add('is-live');

        function measure() {
            const r = stage.getBoundingClientRect();
            W = r.width; H = r.height;
            orbitTop = r.top + window.scrollY;
            cw = clamp(W * 0.185, 150, 270);
            ch = cw * 0.625 + 24;
            stage.style.setProperty('--cw', cw.toFixed(1) + 'px');
            Rx = Math.min(W * 0.41, 580);
            Rz = Rx * 0.78;
            Ty = H * 0.21;
            cx = W / 2;
            cy = H * 0.5;
            // The globe sits above the ring's centre so the front cards cover only its base.
            Rg = Math.min(H * 0.34, Rx * 0.5);
            gy = H * 0.36;
            rings.forEach((s) => { s.style.transformOrigin = cx.toFixed(1) + 'px ' + gy.toFixed(1) + 'px'; });
            lastGT = '';

            // Drawn a little sharper on larger screens so the close-up globe is not soft.
            dpr = Math.min(window.devicePixelRatio || 1, 2) * (!reduce && W >= 760 ? 1.3 : 1);
            const size = Math.round((Rg + 64) * 2);
            canvas.width = size * dpr;
            canvas.height = size * dpr;
            canvas.style.width = canvas.style.height = size + 'px';
            canvas.style.left = (cx - size / 2) + 'px';
            canvas.style.top = (gy - size / 2) + 'px';

            const seg = (from, to) => {
                let d = '';
                for (let a = from; a <= to; a += 3) {
                    const q = project(a);
                    d += (d ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1);
                }
                return d;
            };
            frontPath.setAttribute('d', seg(-90, 90));
            backPath.setAttribute('d', seg(90, 270));
        }

        // Where a card sits for a given angle round the ring (0 = facing you).
        function project(deg) {
            const a = deg * RAD;
            const d = Math.cos(a);
            const s = P / (P + Rz * (1 - d));
            return { x: cx + Rx * Math.sin(a) * s, y: cy + Ty * d * s, s, d };
        }

        const scrollTurn = () => (reduce ? 0 : -window.scrollY * 0.06);
        const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

        function setFront(i) {
            front = i;
            const el = cards[i];
            capName.textContent = el.dataset.name;
            capMeta.textContent = el.dataset.meta;
            capOpen.href = el.href;
            activePin = el.dataset.pin || '';
        }

        function bring(i) {
            target = rot - wrap180(rot + scrollTurn() + i * STEP);
        }

        function render(now) {
            const total = rot + scrollTurn();
            const intro = reduce ? 1 : clamp((now - t0) / 1700, 0, 1);
            const spinIn = (1 - easeOut(intro)) * -150;
            let best = -2, bestI = 0;

            // Camera: zoomed in on the globe, sitting slightly low, then pulling back.
            const ez = easeInOut(pz), close = 1 - ez;
            const Z = 1 + ZOOM * close, lift = H * 0.06 * close;
            const isNear = pz < 0.999;
            if (isNear !== near) { near = isNear; stage.classList.toggle('is-near', isNear); }
            const gT = `translate3d(0,${lift.toFixed(1)}px,0) scale(${Z.toFixed(4)})`;
            if (gT !== lastGT) {
                lastGT = gT;
                canvas.style.transform = gT;
                rings.forEach((s) => { s.style.transform = gT; s.style.opacity = (0.2 + 0.8 * ez).toFixed(3); });
                if (railFill) railFill.style.transform = `scaleY(${pz.toFixed(4)})`;
                if (facing && !reduce) {
                    // The caption bar settles in once the ring is nearly in place.
                    const o = win(0.55, 0.92);
                    facing.style.opacity = (0.35 + 0.65 * o).toFixed(3);
                    facing.style.transform = o >= 1 ? '' : `translate3d(0,${(16 * (1 - o)).toFixed(1)}px,0)`;
                }
            }

            for (let i = 0; i < N; i++) {
                const e = reduce ? 1 : easeOut(clamp((now - t0 - i * 60) / 900, 0, 1));
                const q = project(total + spinIn + i * STEP);
                const push = 1 + (1 - e) * 0.35;
                const k = easeOut(clamp((pz - lag(i)) / (1 - LAG_MAX), 0, 1)), f = 1 - k;
                const v = DIRS[i % DIRS.length];
                const x = cx + (q.x - cx) * push * Z + v[0] * W * 0.32 * f;
                const y = gy + (cy + (q.y - cy) * push - gy) * Z + lift + v[1] * H * 0.38 * f;
                const depth = (q.d + 1) / 2;
                const el = cards[i];
                el.style.transform = `translate3d(${(x - cw / 2).toFixed(1)}px,${(y - ch / 2).toFixed(1)}px,0) scale(${(q.s * (0.85 + 0.15 * e) * Z * (1 + v[2] * 0.5 * f)).toFixed(4)})`;
                // Cards stay opaque so they hide what is behind them; distance is a fog of the page colour.
                el.style.opacity = e.toFixed(3);
                el.style.setProperty('--fog', (0.72 * (1 - Math.pow(depth, 1.3))).toFixed(3));
                const lift3d = v[2] > 0 ? Math.round(v[2] * f * 150) : 0;
                el.style.zIndex = (q.d >= 0 ? 200 + Math.round(q.d * 100) : 10 + Math.round((q.d + 1) * 80)) + lift3d;
                el.style.pointerEvents = q.d < -0.25 ? 'none' : '';
                if (q.d > best) { best = q.d; bestI = i; }
            }
            if (bestI !== front) setFront(bestI);
            drawGlobe(now);
        }

        function frame(now) {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            const zt = zoomTarget();
            pz += (zt - pz) * Math.min(1, dt * 7);
            if (Math.abs(zt - pz) < 0.0005) pz = zt;
            if (!dragging) {
                if (target !== null) {
                    const diff = target - rot;
                    rot += diff * Math.min(1, dt * 5);
                    if (Math.abs(diff) < 0.08) { rot = target; target = null; hold = 3.5; vel = 0; }
                } else {
                    if (hold > 0) hold -= dt;
                    const want = (hover || hold > 0) ? 0 : AUTO;
                    vel += (want - vel) * Math.min(1, dt * 2.2);
                    rot += vel * dt;
                }
            }
            render(now);
            raf = visible ? requestAnimationFrame(frame) : 0;
        }

        /* Drag to spin. Pointer capture only starts once a drag is certain, so a plain click still opens the site. */
        let pid = null, startX = 0, startRot = 0, lastX = 0, lastT = 0, dragVel = 0, swallowClick = false;

        stage.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            pid = e.pointerId;
            startX = lastX = e.clientX;
            lastT = e.timeStamp;
            startRot = rot;
            dragVel = 0;
        });
        window.addEventListener('pointermove', (e) => {
            if (e.pointerId !== pid) return;
            const dx = e.clientX - startX;
            if (!dragging && Math.abs(dx) > 6) {
                dragging = true;
                target = null;
                stage.classList.add('is-dragging');
                try { stage.setPointerCapture(pid); } catch (err) { /* pointer already gone */ }
            }
            if (!dragging) return;
            const perPx = 180 / (Math.PI * Rx);
            rot = startRot + dx * perPx;
            const dtm = Math.max(1, e.timeStamp - lastT) / 1000;
            dragVel = ((e.clientX - lastX) * perPx) / dtm;
            lastX = e.clientX;
            lastT = e.timeStamp;
        });
        const endDrag = (e) => {
            if (e.pointerId !== pid) return;
            pid = null;
            if (!dragging) return;
            dragging = false;
            stage.classList.remove('is-dragging');
            vel = clamp(dragVel, -240, 240);
            hold = 0;
            swallowClick = true;
            setTimeout(() => { swallowClick = false; }, 80);
        };
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
        stage.addEventListener('click', (e) => {
            if (!swallowClick) return;
            e.preventDefault();
            e.stopPropagation();
            swallowClick = false;
        }, true);
        stage.addEventListener('dragstart', (e) => e.preventDefault());

        stage.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse' && e.target.closest('.sat')) hover = true; });
        stage.addEventListener('pointerout', (e) => { if (e.pointerType === 'mouse' && e.target.closest('.sat')) hover = false; });

        cards.forEach((el, i) => el.addEventListener('focus', () => { if (el.matches(':focus-visible')) bring(i); }));
        $$('.facing__step').forEach((btn) => btn.addEventListener('click', () => {
            bring((front + Number(btn.dataset.step) + N) % N);
        }));

        /* ---------- Globe ---------- */

        const land = window.LAND;
        let bits = null;
        if (land) {
            const bin = atob(land.data);
            bits = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
        }
        const isLand = (lat, lon) => {
            if (!bits) return false;
            const r = clamp(Math.floor((90 - lat) / 180 * land.rows), 0, land.rows - 1);
            const c = clamp(Math.floor((lon + 180) / 360 * land.cols), 0, land.cols - 1);
            const i = r * land.cols + c;
            return (bits[i >> 3] >> (i & 7)) & 1;
        };
        // One dot every 3 degrees, thinned towards the poles so spacing stays even.
        const dots = [];
        for (let lat = -57; lat <= 81; lat += 3) {
            const n = Math.max(1, Math.round(120 * Math.cos(lat * RAD)));
            for (let k = 0; k < n; k++) {
                const lon = -180 + (k + 0.5) * 360 / n;
                if (isLand(lat, lon)) dots.push([Math.sin(lat * RAD), Math.cos(lat * RAD), lon * RAD]);
            }
        }
        const PINS = {
            bahrain: [26.07, 50.56, 'Bahrain'],
            sharjah: [25.35, 55.42, 'Sharjah'],
            mumbai: [19.08, 72.88, 'Mumbai'],
            pune: [18.52, 73.86, 'Pune'],
            shahpura: [25.62, 74.93, 'Shahpura'],
            varanasi: [25.32, 82.99, 'Varanasi']
        };

        function drawGlobe(now) {
            const size = canvas.width / dpr;
            const c = size / 2;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, size, size);

            const body = ctx.createRadialGradient(c - Rg * 0.35, c - Rg * 0.42, Rg * 0.08, c, c, Rg);
            body.addColorStop(0, '#FFFFFF');
            body.addColorStop(0.72, '#E4E8F7');
            body.addColorStop(1, '#C7CEEC');
            ctx.fillStyle = body;
            ctx.beginPath(); ctx.arc(c, c, Rg, 0, 7); ctx.fill();

            const t = now / 1000;
            const lon0 = (64 + (reduce ? 0 : 8 * Math.sin(t * 0.22))) * RAD;
            const lat0 = -7 * RAD;
            const s0 = Math.sin(lat0), c0 = Math.cos(lat0);
            const place = (sinLat, cosLat, lon) => {
                const dl = lon - lon0, cl = Math.cos(dl);
                const z = s0 * sinLat + c0 * cosLat * cl;
                return z > 0.03 ? [c + cosLat * Math.sin(dl) * Rg, c - (c0 * sinLat - s0 * cosLat * cl) * Rg, z] : null;
            };

            ctx.fillStyle = '#2B3CF5';
            const unit = Rg * 0.0125;
            for (const d of dots) {
                const p = place(d[0], d[1], d[2]);
                if (!p) continue;
                ctx.globalAlpha = 0.22 + 0.78 * p[2];
                ctx.beginPath(); ctx.arc(p[0], p[1], unit * (0.55 + 0.6 * p[2]), 0, 7); ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(43,60,245,.3)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(c, c, Math.max(0, Rg - 0.5), 0, 7); ctx.stroke();  // a canvas with no size yet must not throw

            let active = null;
            for (const key in PINS) {
                const [lat, lon, label] = PINS[key];
                const p = place(Math.sin(lat * RAD), Math.cos(lat * RAD), lon * RAD);
                if (!p) continue;
                if (key === activePin) { active = [p, label]; continue; }
                pin(p[0], p[1], 3.2);
            }
            if (active) {
                const [p, label] = active;
                if (!reduce) {
                    const ph = (t * 0.8) % 1;
                    ctx.strokeStyle = `rgba(13,16,51,${(0.55 * (1 - ph)).toFixed(3)})`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.arc(p[0], p[1], 5 + 15 * ph, 0, 7); ctx.stroke();
                }
                pin(p[0], p[1], 5);
                ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
                const w = ctx.measureText(label).width + 16;
                const lx = clamp(p[0] + 10, 4, size - w - 4), ly = p[1] - 30;
                ctx.fillStyle = '#0D1033';
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(lx, ly, w, 21, 6); else ctx.rect(lx, ly, w, 21);
                ctx.fill();
                ctx.fillStyle = '#F2F4FA';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, lx + 8, ly + 11);
            }
        }

        function pin(x, y, r) {
            ctx.fillStyle = '#FFB21A';
            ctx.strokeStyle = '#0D1033';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
        }

        /* ---------- Run ---------- */

        setPin();
        measure();
        pz = zoomTarget();
        if ('ResizeObserver' in window) new ResizeObserver(measure).observe(stage);
        else window.addEventListener('resize', measure);
        let pinQueued = false;
        const repin = () => {
            if (pinQueued) return;
            pinQueued = true;
            requestAnimationFrame(() => { pinQueued = false; setPin(); measure(); });
        };
        window.addEventListener('resize', repin);
        window.addEventListener('load', repin);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(repin);

        if ('IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                visible = entries[0].isIntersecting;
                if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
            }).observe(stage);
        }
        raf = requestAnimationFrame(frame);
    }
})();
