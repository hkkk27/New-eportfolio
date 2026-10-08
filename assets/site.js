(() => {
    'use strict';
    const motion = document.documentElement.classList.contains('js'); // off when the visitor asks for reduced motion

    /* Sections draw themselves in as they arrive */
    const blocks = document.querySelectorAll('.sec, .career, .foot');
    if (motion && 'IntersectionObserver' in window) {
        const seen = new IntersectionObserver((entries) => {
            for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); seen.unobserve(e.target); }
        }, { threshold: 0.06, rootMargin: '0px 0px -6% 0px' });
        blocks.forEach((b) => seen.observe(b));
    } else {
        blocks.forEach((b) => b.classList.add('is-in'));
    }

    /* Numbers count up once, when first seen */
    if (motion && 'IntersectionObserver' in window) {
        const counter = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                counter.unobserve(e.target);
                const end = Number(e.target.dataset.count), t0 = performance.now(), dur = 1500;
                const step = (now) => {
                    const k = Math.min(1, (now - t0) / dur);
                    e.target.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US');
                    if (k < 1) requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            }
        }, { threshold: 0.6 });
        document.querySelectorAll('[data-count]').forEach((n) => counter.observe(n));
    }

    /* Reading progress along the top edge */
    const bar = document.querySelector('.progress');
    if (bar) {
        const onProgress = () => {
            const room = document.documentElement.scrollHeight - window.innerHeight;
            bar.style.transform = `scaleX(${room > 0 ? Math.min(1, window.scrollY / room) : 0})`;
        };
        window.addEventListener('scroll', onProgress, { passive: true });
        onProgress();
    }

    /* The framed portrait leans towards the pointer, like a picture catching the light */
    const mat = document.querySelector('.portrait__mat');
    const heroRow = document.querySelector('.hero__row');
    if (motion && mat && heroRow && window.matchMedia('(hover: hover)').matches) {
        heroRow.addEventListener('pointermove', (e) => {
            const r = mat.getBoundingClientRect();
            const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 420));
            const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 320));
            mat.style.setProperty('--ry', `${(dx * 9).toFixed(2)}deg`);
            mat.style.setProperty('--rx', `${(-dy * 7).toFixed(2)}deg`);
            mat.style.setProperty('--sheen', `${(50 - dx * 70).toFixed(1)}%`);
        });
        heroRow.addEventListener('pointerleave', () => {
            mat.style.setProperty('--ry', '0deg');
            mat.style.setProperty('--rx', '0deg');
            mat.style.setProperty('--sheen', '120%');
        });
    }

    initGlobe();

    /* A 3D globe of the career: land as dots, a pin on each city, arcs flying to the home university. Drag to spin. */
    function initGlobe() {
        const src = document.getElementById('globe-data');
        const canvas = document.querySelector('.globe');
        const land = window.LAND;
        if (!src || !canvas || !land) return;
        const G = JSON.parse(src.textContent);
        const ctx = canvas.getContext('2d');
        const RAD = Math.PI / 180;
        const INK = '#1E1A17', ACCENT = '#7A2B25';

        const bin = atob(land.data);
        const isLand = (lat, lon) => {
            const r = Math.min(land.rows - 1, Math.max(0, Math.floor((90 - lat) / 180 * land.rows)));
            const c = Math.min(land.cols - 1, Math.max(0, Math.floor((lon + 180) / 360 * land.cols)));
            const i = r * land.cols + c;
            return (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
        };
        const vec = (lat, lon) => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];
        const dots = [];
        for (let lat = -57; lat <= 81; lat += 2.5) {
            const n = Math.max(1, Math.round(144 * Math.cos(lat * RAD)));
            for (let k = 0; k < n; k++) {
                const lon = -180 + (k + 0.5) * 360 / n;
                if (isLand(lat, lon)) dots.push(vec(lat, lon));
            }
        }
        const home = { ...G.home, v: vec(G.home.lat, G.home.lon), label: G.home.name };
        const others = G.others.map((o) => ({ ...o, v: vec(o.lat, o.lon), label: o.name }));
        // Each arc is a great-circle path, lifted off the surface in the middle.
        const arcs = others.map((o) => {
            const a = o.v, b = home.v;
            const w = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
            const pts = [];
            for (let i = 0; i <= 48; i++) {
                const t = i / 48;
                const s = Math.sin(w) || 1e-6, ka = Math.sin((1 - t) * w) / s, kb = Math.sin(t * w) / s;
                const lift = 1 + Math.sin(Math.PI * t) * (0.1 + 0.26 * w / Math.PI);
                pts.push([(a[0] * ka + b[0] * kb) * lift, (a[1] * ka + b[1] * kb) * lift, (a[2] * ka + b[2] * kb) * lift]);
            }
            return pts;
        });

        let size = 0, R = 0, dpr = 1;
        let lon0 = G.home.lon - 28, lat0 = 14, vel = motion ? 7 : 0, dragging = false, visible = true, raf = 0, last = performance.now();
        const AUTO = motion ? 7 : 0;

        function fit() {
            size = canvas.clientWidth;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = canvas.height = Math.round(size * dpr);
            R = size * 0.39;
            if (!raf) draw(performance.now());
        }

        // Turn a point on the unit sphere into screen space for the current view.
        function view(v) {
            const cl = Math.cos(lon0 * RAD), sl = Math.sin(lon0 * RAD), ct = Math.cos(lat0 * RAD), st = Math.sin(lat0 * RAD);
            const x = v[0] * cl - v[2] * sl, z1 = v[0] * sl + v[2] * cl;
            const y = v[1] * ct - z1 * st, z = v[1] * st + z1 * ct;
            return [size / 2 + x * R, size / 2 - y * R, z, x * x + y * y];
        }

        function pill(text, x, y, strong) {
            ctx.font = `${strong ? 600 : 500} ${strong ? 12 : 11}px "Public Sans", system-ui, sans-serif`;
            const w = ctx.measureText(text).width + 14, h = strong ? 22 : 19;
            const px = Math.max(2, Math.min(size - w - 2, x + 9)), py = y - h - 5;
            ctx.fillStyle = strong ? ACCENT : 'rgba(251,249,245,.94)';
            ctx.strokeStyle = strong ? ACCENT : '#D9D1C4';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(px, py, w, h, 4); else ctx.rect(px, py, w, h);
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = strong ? '#fff' : INK;
            ctx.textBaseline = 'middle';
            ctx.fillText(text, px + 7, py + h / 2 + 0.5);
        }

        function draw(now) {
            const c = size / 2, t = now / 1000;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, size, size);

            const body = ctx.createRadialGradient(c - R * 0.35, c - R * 0.4, R * 0.1, c, c, R);
            body.addColorStop(0, '#FFFDF9'); body.addColorStop(0.75, '#F1EBE0'); body.addColorStop(1, '#E2D8C8');
            ctx.fillStyle = body;
            ctx.beginPath(); ctx.arc(c, c, R, 0, 7); ctx.fill();

            ctx.fillStyle = ACCENT;
            const unit = R * 0.0115;
            for (const d of dots) {
                const p = view(d);
                if (p[2] <= 0.02) continue;
                ctx.globalAlpha = 0.14 + 0.6 * p[2];
                ctx.beginPath(); ctx.arc(p[0], p[1], unit * (0.55 + 0.6 * p[2]), 0, 7); ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(30,26,23,.22)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(c, c, R - 0.5, 0, 7); ctx.stroke();

            // Arcs and the small light travelling along each one towards home
            arcs.forEach((pts, i) => {
                ctx.strokeStyle = 'rgba(122,43,37,.6)'; ctx.lineWidth = 1.4;
                let open = false;
                ctx.beginPath();
                for (const q of pts) {
                    const p = view(q);
                    if (p[2] > 0 || p[3] > 1) { if (open) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); open = true; } }
                    else open = false;
                }
                ctx.stroke();
                if (motion) {
                    const k = (t * 0.16 + i * 0.31) % 1, q = pts[Math.round(k * 48)], p = view(q);
                    if (p[2] > 0 || p[3] > 1) {
                        ctx.fillStyle = ACCENT;
                        ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 7); ctx.fill();
                    }
                }
            });

            // Pins: the other cities first, home on top with a pulse
            const labels = [];
            for (const o of others) {
                const p = view(o.v);
                if (p[2] <= 0.05) continue;
                ctx.fillStyle = INK; ctx.strokeStyle = '#FBF9F5'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(p[0], p[1], 3.6, 0, 7); ctx.fill(); ctx.stroke();
                if (p[2] > 0.22) labels.push([o.label, p[0], p[1], false]);
            }
            const h = view(home.v);
            if (h[2] > 0.05) {
                if (motion) {
                    const ph = (t * 0.7) % 1;
                    ctx.strokeStyle = `rgba(122,43,37,${(0.6 * (1 - ph)).toFixed(3)})`; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.arc(h[0], h[1], 6 + 18 * ph, 0, 7); ctx.stroke();
                }
                ctx.fillStyle = ACCENT; ctx.strokeStyle = '#FBF9F5'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(h[0], h[1], 5.5, 0, 7); ctx.fill(); ctx.stroke();
                if (h[2] > 0.18) labels.push([home.label, h[0], h[1], true]);
            }
            for (const [text, x, y, strong] of labels) pill(text, x, y, strong);
        }

        function frame(now) {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            if (!dragging) { vel += (AUTO - vel) * Math.min(1, dt * 1.6); lon0 += vel * dt; }
            draw(now);
            raf = visible && motion ? requestAnimationFrame(frame) : 0;
        }

        let pid = null, sx = 0, sLon = 0, lx = 0, lt = 0, dv = 0;
        canvas.addEventListener('pointerdown', (e) => {
            pid = e.pointerId; sx = lx = e.clientX; lt = e.timeStamp; sLon = lon0; dv = 0; dragging = true;
            canvas.classList.add('is-dragging');
            try { canvas.setPointerCapture(pid); } catch (err) { /* pointer already gone */ }
        });
        canvas.addEventListener('pointermove', (e) => {
            if (e.pointerId !== pid) return;
            const perPx = 180 / (Math.PI * R);
            lon0 = sLon - (e.clientX - sx) * perPx;
            dv = -((e.clientX - lx) * perPx) / (Math.max(1, e.timeStamp - lt) / 1000);
            lx = e.clientX; lt = e.timeStamp;
            if (!raf) draw(performance.now());
        });
        const up = (e) => {
            if (e.pointerId !== pid) return;
            pid = null; dragging = false; canvas.classList.remove('is-dragging');
            vel = Math.max(-200, Math.min(200, dv));
        };
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);

        fit();
        if ('ResizeObserver' in window) new ResizeObserver(fit).observe(canvas);
        if ('IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                visible = entries[0].isIntersecting;
                if (visible && motion && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
            }).observe(canvas);
        }
        if (motion) raf = requestAnimationFrame(frame); else draw(performance.now());
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!raf) draw(performance.now()); });
    }

    const dataEl = document.getElementById('career-data');
    if (!dataEl) return;

    const D = JSON.parse(dataEl.textContent);
    const root = document.getElementById('career');
    const host = root.querySelector('[data-chart]');
    const stopsEl = root.querySelector('.stops');
    const card = {};
    root.querySelectorAll('[data-c]').forEach((el) => { card[el.dataset.c] = el; });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, text) => {
        const n = document.createElementNS(NS, tag);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        if (text != null) n.textContent = text;
        return n;
    };

    /* Geometry: years across, roles up. Each step is the most senior role held at that time. */
    const W = 760, H = 320, L = 168, R = 18, T = 28, B = 34;
    const n = D.levels.length;
    const x = (yr) => L + (yr - D.start) / (D.end - D.start) * (W - L - R);
    const y = (lv) => H - B - 16 - (n === 1 ? 0 : lv / (n - 1) * (H - B - T - 32));
    const base = H - B;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Career timeline as a step chart' });
    D.levels.forEach((label, i) => {
        svg.append(el('line', { class: 'chart__grid', x1: L, x2: W - R, y1: y(i), y2: y(i) }));
        svg.append(el('text', { class: 'chart__label', x: L - 14, y: y(i) + 4, 'text-anchor': 'end', 'data-level': i }, label));
    });
    for (let yr = Math.ceil(D.start / 5) * 5; yr <= D.end; yr += 5) {
        svg.append(el('text', { class: 'chart__tick', x: x(yr), y: base + 20, 'text-anchor': 'middle' }, yr));
    }
    // One unit wide at the origin; a transform places and stretches it over the selected years.
    const band = el('rect', { class: 'chart__band', x: 0, y: T - 12, width: 1, height: base - T + 12 });
    svg.append(band);

    let line = '', area = `M${x(D.stops[0].from)} ${base}`;
    D.stops.forEach((s, i) => {
        const x0 = x(s.from), x1 = x(Math.min(s.to, D.now)), yy = y(s.level);
        line += `${i ? 'L' : 'M'}${x0.toFixed(1)} ${yy.toFixed(1)}L${x1.toFixed(1)} ${yy.toFixed(1)}`;
        area += `L${x0.toFixed(1)} ${yy.toFixed(1)}L${x1.toFixed(1)} ${yy.toFixed(1)}`;
    });
    const endX = x(Math.min(D.stops[D.stops.length - 1].to, D.now));
    svg.append(el('path', { class: 'chart__area', d: `${area}L${endX.toFixed(1)} ${base}Z` }));
    svg.append(el('path', { class: 'chart__line', d: line }));
    // A paper-coloured cover shrinks towards the right edge to reveal the line up to the selected role.
    const cover = el('rect', { class: 'chart__cover', x: L, y: 0, width: W - L, height: base - 1 });
    svg.append(cover);
    svg.append(el('line', { class: 'chart__axis', x1: L, x2: W - R, y1: base, y2: base }));
    const dots = D.stops.map((s) => {
        const d = el('circle', { class: 'chart__dot', cx: x(s.from), cy: y(s.level), r: 4 });
        svg.append(d);
        return d;
    });
    const yearTag = el('text', { class: 'chart__tick', y: T - 18, 'text-anchor': 'middle', style: 'fill:#7A2B25;font-weight:600' });
    svg.append(yearTag);
    host.append(svg);

    const buttons = D.stops.map((s, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'stop';
        const yr = document.createElement('b'); yr.textContent = s.year;
        const lb = document.createElement('span'); lb.textContent = s.label;
        b.append(yr, lb);
        b.addEventListener('click', () => { select(i); if (scrolly) jumpTo(i); });
        stopsEl.append(b);
        return b;
    });

    let active = -1;
    function select(i) {
        i = Math.max(0, Math.min(D.stops.length - 1, i));
        if (i === active) return;
        active = i;
        const s = D.stops[i];
        const x0 = x(s.from), x1 = x(Math.min(s.to, D.now));
        band.style.transform = `translate(${x0.toFixed(1)}px, 0) scaleX(${Math.max(2, x1 - x0).toFixed(1)})`;
        cover.style.transform = `scaleX(${Math.max(0, (W - x1 - 1) / (W - L)).toFixed(4)})`;
        yearTag.setAttribute('x', (x0 + x1) / 2);
        yearTag.textContent = s.dates;
        dots.forEach((d, k) => {
            d.classList.toggle('is-on', k === i);
            d.setAttribute('r', k === i ? 5.5 : 4);
            d.style.opacity = k <= i ? 1 : 0;
        });
        svg.querySelectorAll('.chart__label').forEach((t) => t.classList.toggle('is-on', Number(t.dataset.level) === s.level));
        buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
        card.dates.textContent = s.dates;
        card.n.textContent = `${i + 1} of ${D.stops.length}`;
        card.title.textContent = s.title;
        card.org.textContent = s.org;
        card.text.textContent = s.text;
        card.also.replaceChildren();
        if (s.also.length) {
            const head = document.createElement('span');
            head.className = 'label label--muted';
            head.textContent = 'Also in these years';
            card.also.append(head);
            for (const a of s.also) {
                const p = document.createElement('p');
                const t = document.createElement('span'); t.textContent = a.t;
                const d = document.createElement('span'); d.textContent = a.d;
                p.append(t, d);
                card.also.append(p);
            }
        }
    }

    /* On a large screen the section pins and scrolling walks through the roles. */
    const scrollBox = root.querySelector('.career__scroll');
    const pin = root.querySelector('.career__pin');
    let scrolly = false;
    function layout() {
        scrolly = !reduce && window.innerWidth >= 980 && pin.offsetHeight <= window.innerHeight;
        root.classList.toggle('is-scrolly', scrolly);
        scrollBox.style.height = scrolly ? `${pin.offsetHeight + D.stops.length * window.innerHeight * 0.42}px` : '';
    }
    function onScroll() {
        if (!scrolly) return;
        const r = scrollBox.getBoundingClientRect();
        const room = r.height - pin.offsetHeight;
        const prog = Math.max(0, Math.min(0.999, -r.top / room));
        select(Math.floor(prog * D.stops.length));
    }
    function jumpTo(i) {
        const top = scrollBox.getBoundingClientRect().top + window.scrollY;
        const room = scrollBox.offsetHeight - pin.offsetHeight;
        window.scrollTo({ top: top + room * (i + 0.5) / D.stops.length, behavior: 'smooth' });
    }
    stopsEl.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const next = active + (e.key === 'ArrowRight' ? 1 : -1);
        select(next);
        buttons[active].focus();
        if (scrolly) jumpTo(active);
    });

    layout();
    // Without scroll-pinning, show the whole career at once and let the buttons explore it.
    select(scrolly ? 0 : D.stops.length - 1);
    window.addEventListener('resize', () => { layout(); onScroll(); });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
})();
