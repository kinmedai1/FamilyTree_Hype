/* Optional, final-card-only SP appearance. No source records or stats are changed. */
(() => {
    'use strict';
    let disposeCurrent = null;
    let texturePromise = null;
    function loadTexture() {
        if (!texturePromise) texturePromise = new Promise((resolve, reject) => {
            const image = new Image();
            const timeout = setTimeout(() => reject(new Error('オーラ画像の読み込みがタイムアウトしました。')), 10000);
            image.onload = () => { clearTimeout(timeout); resolve(image); };
            image.onerror = () => { clearTimeout(timeout); reject(new Error('オーラ画像を読み込めませんでした。')); };
            image.src = './assets/Aura/aura.png';
        }).catch(error => { texturePromise = null; throw error; });
        return texturePromise;
    }
    function canvas(size) {
        const result = document.createElement('canvas');
        result.width = result.height = size;
        return result;
    }
    function reset() {
        disposeCurrent?.();
        disposeCurrent = null;
    }
    function attach(card, statusText, faceReady) {
        reset();
        const target = card.querySelector('.champion-identity .face-preview-canvas');
        const colors = card.querySelector('.champion-color-details');
        if (!target || !colors) return;
        const renderer = window.DenpamenFaceRenderer;
        const eligible = renderer.hasCompleteAppearance(statusText) && renderer.parseStatus(statusText).pattern === 'なし';
        const control = document.createElement('div');
        control.className = 'sp-color-control';
        const label = document.createElement('label');
        label.className = 'sp-color-toggle';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('role', 'switch');
        input.setAttribute('aria-label', 'SPカラー');
        input.disabled = true;
        const track = document.createElement('span');
        track.className = 'sp-color-track';
        track.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.textContent = 'SPカラー';
        label.append(input, track, text);
        const note = document.createElement('span');
        note.className = 'sp-color-note';
        note.setAttribute('role', 'status');
        note.textContent = eligible ? '' : '単色のみ';
        control.append(label, note);
        control.addEventListener('click', event => event.stopPropagation());
        control.addEventListener('dblclick', event => event.stopPropagation());
        colors.append(control);

        let disposed = false, frame = 0, visible = true, lastFrame = -Infinity;
        let layers = null, texture = null, baseline = null, preparing = null;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)');
        const size = 256, glow = canvas(size), mask = canvas(target.width), clipped = canvas(target.width);
        const glowContext = glow.getContext('2d'), context = target.getContext('2d');
        const clippedContext = clipped.getContext('2d');
        const stop = () => { cancelAnimationFrame(frame); frame = 0; };
        function restore() {
            if (!baseline) return;
            context.clearRect(0, 0, target.width, target.height);
            context.drawImage(baseline, 0, 0);
        }
        function draw(time) {
            const factor = size / layers.head.width;
            const r = layers.headRect;
            const cx = (r.x + r.width / 2) * factor, cy = (r.y + r.height / 2) * factor;
            glowContext.clearRect(0, 0, size, size);
            glowContext.globalCompositeOperation = 'source-over';
            // Staggered waves travel from lower left to upper right. Each fades to zero
            // with zero slope at both ends, so wrapping a phase never resets visible light.
            for (let ring = 0; ring < 3; ring++) {
                const phase = (time / 5400 + ring / 3) % 1;
                const scale = 0.8 + phase * 0.28;
                const w = r.width * factor * scale, h = r.height * factor * scale;
                const travel = (phase - 0.5) * 2;
                glowContext.globalAlpha = Math.sin(phase * Math.PI) ** 2 * 0.95;
                glowContext.save();
                glowContext.translate(cx + travel * r.width * factor, cy - travel * r.height * factor);
                glowContext.rotate(-Math.PI / 8);
                for (let pass = 0; pass < 3; pass++) glowContext.drawImage(texture, -w / 2, -h / 2, w, h);
                glowContext.restore();
            }
            glowContext.globalAlpha = 1;
            // Clip at the original face resolution so light cannot bleed onto skin or outside the head.
            clippedContext.clearRect(0, 0, clipped.width, clipped.height);
            clippedContext.globalCompositeOperation = 'source-over';
            clippedContext.drawImage(glow, 0, 0, clipped.width, clipped.height);
            clippedContext.globalCompositeOperation = 'destination-in';
            clippedContext.drawImage(mask, 0, 0);
            context.clearRect(0, 0, target.width, target.height);
            context.drawImage(baseline, 0, 0);
            context.drawImage(clipped, 0, 0);
        }
        function tick(time) {
            frame = 0;
            if (disposed || !card.isConnected) { dispose(); return; }
            if (!input.checked || !layers || !visible || document.hidden) return;
            if (time - lastFrame >= 1000 / 30) { draw(time); lastFrame = time; }
            frame = requestAnimationFrame(tick);
        }
        function resume() {
            stop();
            if (disposed || !input.checked || !layers || !visible || document.hidden) return;
            if (reduced.matches) draw(1600);
            else frame = requestAnimationFrame(tick);
        }
        const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; resume(); });
        observer.observe(target);
        document.addEventListener('visibilitychange', resume);
        reduced.addEventListener('change', resume);
        function dispose() {
            if (disposed) return;
            disposed = true;
            stop(); restore();
            observer.disconnect();
            document.removeEventListener('visibilitychange', resume);
            reduced.removeEventListener('change', resume);
            control.remove();
        }
        disposeCurrent = dispose;
        input.addEventListener('change', async () => {
            if (!input.checked) { stop(); restore(); note.textContent = ''; return; }
            note.textContent = '準備中…';
            try {
                if (!preparing) preparing = (async () => {
                    texture = await loadTexture();
                    if (disposed) return;
                    baseline = canvas(target.width);
                    baseline.getContext('2d').drawImage(target, 0, 0);
                    layers = await renderer.prepareAura(target, statusText);
                    const maskContext = mask.getContext('2d');
                    maskContext.clearRect(0, 0, mask.width, mask.height);
                    maskContext.globalCompositeOperation = 'source-over';
                    maskContext.drawImage(layers.head, 0, 0);
                    maskContext.globalCompositeOperation = 'destination-out';
                    maskContext.drawImage(layers.foreground, 0, 0);
                })().catch(error => { preparing = null; throw error; });
                await preparing;
                if (disposed) return;
                note.textContent = '';
                if (input.checked) { draw(reduced.matches ? 1600 : performance.now()); resume(); }
                else restore();
            } catch (error) {
                if (disposed) return;
                input.checked = false;
                stop(); restore();
                note.textContent = '読み込み失敗。再試行できます';
                note.title = error.message;
            }
        });
        Promise.resolve(faceReady).then(() => {
            if (!disposed) input.disabled = !eligible || target.closest('.face-preview-container').classList.contains('is-error');
        }).catch(() => { if (!disposed) note.textContent = '顔の読み込みに失敗しました'; });
    }
    window.SPAura = Object.freeze({ attach, reset });
})();
