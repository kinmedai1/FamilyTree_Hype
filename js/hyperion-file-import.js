/* Local .hype.bin selection UI; all file scanning runs in a Worker. */
(() => {
    'use strict';
    function request(action, file, options = {}) {
        return new Promise((resolve, reject) => {
            const worker = new Worker('./js/hyperion-file-worker.js?v=20260917-3');
            const timer = setTimeout(() => { worker.terminate(); reject(new Error('ファイルの読込がタイムアウトしました。再試行してください。')); }, 60000);
            const finish = () => { clearTimeout(timer); worker.terminate(); };
            worker.onmessage = ({ data }) => { finish(); data.ok ? resolve(data.result) : reject(new Error(data.error)); };
            worker.onerror = () => { finish(); reject(new Error('ファイルの読込を開始できませんでした。')); };
            try { worker.postMessage({ action, file, ...options }); }
            catch (error) { finish(); reject(error); }
        });
    }
    function install(receive, navigationVersion) {
        const byId = id => document.getElementById(id);
        const choose = byId('binary-import-btn'), input = byId('binary-import-file'), selection = byId('binary-import-selection');
        const list = byId('binary-record-grid'), open = byId('binary-open-btn'), previous = byId('binary-page-prev'), next = byId('binary-page-next');
        const pageNumber = byId('binary-page-number'), go = byId('binary-page-go'), message = byId('binary-import-message');
        let file = null, info = null, page = 0, busy = false, selectedIndex = null;
        let faceGeneration = 0, observer = null, faceQueue = [], renderingFace = false;
        const element = (tag, className, text) => {
            const el = document.createElement(tag);
            el.className = className;
            if (text !== undefined) el.textContent = text;
            return el;
        };
        function stopFaces() {
            faceGeneration++;
            observer?.disconnect();
            faceQueue = [];
        }
        async function drawVisibleFaces() {
            if (renderingFace) return;
            renderingFace = true;
            try {
                while (faceQueue.length) {
                    const { canvas, record, label, generation } = faceQueue.shift();
                    if (generation !== faceGeneration || !canvas.isConnected) continue;
                    // Closing the import panel pauses jobs that have not started yet.
                    if (!byId('import-panel').open) { observer?.observe(canvas); continue; }
                    try {
                        await DenpamenFaceRenderer.renderThumbnail(canvas, record.statusText, { size: 96 });
                        if (generation !== faceGeneration || !canvas.isConnected) continue;
                        canvas.hidden = false; label.hidden = true;
                        canvas.dataset.state = 'ready';
                    } catch (_) {
                        if (generation !== faceGeneration || !canvas.isConnected) continue;
                        canvas.hidden = true; label.hidden = false;
                        label.textContent = '顔画像が読み込めませんでした';
                        canvas.dataset.state = 'error';
                    }
                }
            } finally { renderingFace = false; }
        }
        function controls() {
            choose.disabled = busy;
            for (const control of [open, previous, next, pageNumber, go, ...list.querySelectorAll('button')]) control.disabled = busy || !file;
            open.disabled ||= selectedIndex === null;
            previous.disabled ||= page <= 0;
            next.disabled ||= !info || page + 1 >= Math.ceil(info.count / info.pageSize);
        }
        async function run(task) {
            if (busy) return;
            busy = true; controls();
            message.textContent = '読み込み中…'; message.classList.remove('is-error');
            try { await task(); }
            catch (error) { message.textContent = error.message; message.classList.add('is-error'); }
            finally { busy = false; controls(); }
        }
        async function showPage(target) {
            const result = await request('list', file, { page: target });
            stopFaces(); selectedIndex = null;
            byId('binary-selected-name').textContent = '個体を選択してください';
            const fragment = document.createDocumentFragment();
            const jobs = new Map();
            for (const record of result.records) {
                const button = element('button', 'binary-record-card');
                button.type = 'button'; button.dataset.index = String(record.index);
                button.setAttribute('aria-pressed', 'false');
                button.setAttribute('aria-label', `No.${record.index + 1} ${record.name}`);
                const face = element('span', 'binary-record-face');
                const canvas = element('canvas', 'binary-record-canvas');
                canvas.width = canvas.height = 96;
                canvas.setAttribute('aria-hidden', 'true');
                const label = element('span', 'binary-record-face-note', '顔を描画中…');
                face.append(canvas, label);
                button.append(face, element('span', 'binary-record-name', record.name), element('span', 'binary-record-number', `No.${record.index + 1}`));
                if (record.appearanceComplete && DenpamenFaceRenderer.hasCompleteAppearance(record.statusText)) {
                    canvas.dataset.state = 'loading';
                    jobs.set(canvas, { canvas, record, label, generation: faceGeneration });
                } else {
                    canvas.hidden = true; canvas.dataset.state = 'unavailable';
                    label.textContent = '顔情報がありません';
                }
                button.addEventListener('click', () => {
                    selectedIndex = record.index;
                    for (const item of list.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
                    byId('binary-selected-name').textContent = `No.${record.index + 1} ${record.name}`;
                    controls();
                });
                fragment.append(button);
            }
            list.replaceChildren(fragment);
            list.scrollTop = 0;
            page = result.page;
            pageNumber.value = String(page + 1); pageNumber.max = String(result.pages);
            byId('binary-page-count').textContent = `／ ${result.pages} ページ`;
            byId('binary-file-name').textContent = `${info.name}（${info.count.toLocaleString()}体）`;
            selection.hidden = false;
            message.textContent = '';
            if (typeof IntersectionObserver === 'function') {
                observer = new IntersectionObserver(entries => {
                    for (const entry of entries) if (entry.isIntersecting) {
                        observer.unobserve(entry.target);
                        const job = jobs.get(entry.target);
                        if (job) faceQueue.push(job);
                    }
                    void drawVisibleFaces();
                }, { root: list, rootMargin: '80px' });
                for (const canvas of jobs.keys()) observer.observe(canvas);
            } else { faceQueue.push(...jobs.values()); void drawVisibleFaces(); }
        }
        choose.addEventListener('click', () => input.click());
        input.addEventListener('change', () => {
            const candidate = input.files[0]; input.value = '';
            if (!candidate || busy) return;
            void run(async () => {
                stopFaces(); selectedIndex = null;
                file = null; info = null; selection.hidden = true; list.replaceChildren();
                const inspected = await request('inspect', candidate);
                file = candidate; info = inspected;
                const selected = info.start < info.count ? info.start : 0;
                try { await showPage(Math.floor(selected / info.pageSize)); }
                catch (error) { file = null; info = null; throw error; }
            });
        });
        previous.addEventListener('click', () => { void run(() => showPage(page - 1)); });
        next.addEventListener('click', () => { void run(() => showPage(page + 1)); });
        const jump = () => { void run(async () => {
            const target = Number(pageNumber.value);
            if (!Number.isInteger(target) || target < 1 || target > Math.ceil(info.count / info.pageSize)) {
                throw new Error('表示できるページ番号を入力してください。');
            }
            await showPage(target - 1);
        }); };
        go.addEventListener('click', jump);
        pageNumber.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); jump(); } });
        open.addEventListener('click', () => { void run(async () => {
            if (selectedIndex === null) throw new Error('表示する個体を選択してください。');
            const navigation = navigationVersion();
            const buffer = await request('extract', file, { index: selectedIndex });
            const sha256 = await HyperionCore.digest(buffer);
            const result = await HyperionTransfer.importBinary(buffer, sha256, async (parsed, id) => {
                if (navigationVersion() !== navigation) throw new Error('表示する家系図が切り替わったため、読込を中止しました。必要ならもう一度開いてください。');
                return receive(parsed, id);
            });
            message.textContent = result.warning || '家系図を表示し、新しい履歴に追加しました。';
            message.classList.toggle('is-error', !!result.warning);
        }); });
        controls();
    }
    window.HyperionFileImport = { install };
})();
