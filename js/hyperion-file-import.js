/* Local .hype.bin selection UI; all file scanning runs in a Worker. */
(() => {
    'use strict';
    function request(action, file, options = {}) {
        return new Promise((resolve, reject) => {
            const worker = new Worker('./js/hyperion-file-worker.js?v=20260918-1');
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
        const pageNumber = byId('binary-page-number'), message = byId('binary-import-message');
        let pageJumpTimer;
        let file = null, info = null, page = 0, busy = false, selectedIndex = null, resultsOnly = false, originIndex = null;
        let dataset = null;
        const visibleCount = () => info ? info.count - (resultsOnly ? info.start : 0) : 0;
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
            for (const control of [open, previous, next, pageNumber, ...list.querySelectorAll('button')]) control.disabled = busy || !file;
            open.disabled ||= selectedIndex === null;
            previous.disabled ||= page <= 0;
            next.disabled ||= !info || page + 1 >= Math.ceil(visibleCount() / info.pageSize);
        }
        async function run(task) {
            clearTimeout(pageJumpTimer);
            if (busy) return;
            busy = true; controls();
            message.textContent = '読み込み中…'; message.classList.remove('is-error');
            try { await task(); }
            catch (error) { message.textContent = error.message; message.classList.add('is-error'); }
            finally { busy = false; controls(); }
        }
        async function showPage(target, prepared) {
            const result = prepared || await request('list', file, { page: target, resultsOnly });
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
                if (record.index === originIndex) {
                    button.dataset.colabSelected = 'true';
                    button.append(element('span', 'binary-record-origin', 'Colabで選択'));
                }
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
            const fileLabel = resultsOnly && dataset?.meta.searchSourceFileName ? `${dataset.meta.searchSourceFileName} の検索結果` : info.name;
            byId('binary-file-name').textContent = resultsOnly ? `${fileLabel}（最終個体${visibleCount().toLocaleString()}体）` : `${info.name}（${info.count.toLocaleString()}体）`;
            if (!result.records.length) list.append(element('p', '', 'このファイルに最終個体はありません。'));
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
                file = null; info = null; dataset = null; resultsOnly = false; originIndex = null;
                byId('binary-colab-selection').hidden = true;
                selection.hidden = true; list.replaceChildren();
                const inspected = await request('inspect', candidate);
                file = candidate; info = inspected;
                const selected = info.start < info.count ? info.start : 0;
                try { await showPage(Math.floor(selected / info.pageSize)); }
                catch (error) { file = null; info = null; throw error; }
            });
        });
        previous.addEventListener('click', () => { void run(() => showPage(page - 1)); });
        next.addEventListener('click', () => { void run(() => showPage(page + 1)); });
        const jump = () => {
            clearTimeout(pageJumpTimer);
            if (busy || !info || !pageNumber.validity.valid) return;
            const target = pageNumber.valueAsNumber;
            if (!Number.isInteger(target) || target < 1 || target > Math.max(1, Math.ceil(visibleCount() / info.pageSize)) || target === page + 1) return;
            void run(() => showPage(target - 1));
        };
        pageNumber.addEventListener('input', () => {
            clearTimeout(pageJumpTimer);
            pageJumpTimer = setTimeout(jump, 300);
        });
        pageNumber.addEventListener('change', jump);
        pageNumber.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); jump(); } });
        open.addEventListener('click', () => { void run(async () => {
            if (selectedIndex === null) throw new Error('表示する個体を選択してください。');
            const navigation = navigationVersion();
            const buffer = await request('extract', file, { index: selectedIndex });
            const sha256 = await HyperionCore.digest(buffer);
            const result = await HyperionTransfer.importBinary(buffer, sha256, async (parsed, id) => {
                if (navigationVersion() !== navigation) throw new Error('表示する家系図が切り替わったため、読込を中止しました。必要ならもう一度開いてください。');
                return receive(parsed, id, false);
            });
            message.textContent = result.warning || '家系図を表示し、新しい履歴に追加しました。';
            message.classList.toggle('is-error', !!result.warning);
        }); });
        const sameDataset = meta => !!dataset && ['sha256', 'size', 'fileName', 'tableVersion', 'start', 'count'].every(key => dataset.meta[key] === meta[key]);
        window.HyperionFileImport.hasDataset = sameDataset;
        window.HyperionFileImport.getDataset = meta => sameDataset(meta) ? dataset.file : null;
        window.HyperionFileImport.receiveDataset = async (candidate, meta, index) => {
            HyperionDataset.validate(meta, index);
            if (busy) throw new Error('個体一覧を操作中です。完了後にColabから再試行してください。');
            if (!(candidate instanceof Blob) || candidate.size !== meta.size) throw new Error('結果ファイルを再送信してください。');
            clearTimeout(pageJumpTimer);
            busy = true; controls();
            const navigation = navigationVersion();
            message.textContent = '結果ファイルを確認中…'; message.classList.remove('is-error');
            try {
                const cached = sameDataset(meta) && candidate === dataset.file;
                const inspected = cached ? dataset.info : await request('verify', candidate, { meta });
                const target = Math.max(0, Math.floor((index - inspected.start) / inspected.pageSize));
                const prepared = await request('list', candidate, { page: target, resultsOnly: true });
                const buffer = await request('extract', candidate, { index });
                const sha256 = await HyperionCore.digest(buffer);
                let selectedName;
                const result = await HyperionTransfer.importBinary(buffer, sha256, async (parsed, id) => {
                    if (navigationVersion() !== navigation) throw new Error('表示する家系図が切り替わったため、読込を中止しました。Colabから再試行してください。');
                    selectedName = parsed.tree.name;
                    return receive(parsed, id, true);
                });
                // Commit the temporary picker only after validation and successful tree import.
                file = candidate; info = inspected; resultsOnly = true; originIndex = index;
                dataset = { file, info, meta: { ...meta } };
                byId('import-panel').open = true;
                const origin = byId('binary-colab-selection');
                origin.textContent = `Colabで選択：No.${index + 1} ${selectedName}`;
                origin.hidden = false;
                await showPage(target, prepared);
                const selected = list.querySelector(`[data-index="${index}"]`);
                if (selected) {
                    selectedIndex = index; selected.setAttribute('aria-pressed', 'true');
                    byId('binary-selected-name').textContent = `No.${index + 1} ${selectedName}`;
                    // Scroll the list itself, keeping the page and family-tree position stable.
                    list.scrollTop = selected.offsetTop - list.offsetTop;
                }
                message.textContent = result.warning || '結果の一覧を受け取り、選択個体の家系図を表示しました。';
                message.classList.toggle('is-error', !!result.warning);
                return result;
            } catch (error) {
                message.textContent = error.message; message.classList.add('is-error'); throw error;
            } finally { busy = false; controls(); }
        };
        controls();
    }
    window.HyperionFileImport = { install };
})();
