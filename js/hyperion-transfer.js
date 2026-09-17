/* Binary storage, parsing and the Colab handshake. Existing UI stays in index.html. */
(() => {
    'use strict';
    const memory = new Map(), models = new Map(), protectedIds = new Set(), importingIds = new Set();
    let activeBinaryId = null;
    let database;
    function db() {
        if (!database) database = new Promise((resolve, reject) => {
            const request = indexedDB.open('HyperionTreeBinary', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('trees', { keyPath: 'id' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }).catch(error => { database = null; throw error; });
        return database;
    }
    async function transaction(mode, operation) {
        const connection = await db();
        return new Promise((resolve, reject) => {
            const tx = connection.transaction('trees', mode);
            const request = operation(tx.objectStore('trees'));
            tx.oncomplete = () => resolve(request?.result);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('バイナリの保存に失敗しました。'));
        });
    }
    function checkTransfer(buffer, sha256) {
        if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 12 || buffer.byteLength > HyperionCore.LIMITS.bytes ||
            typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('転送データの形式・容量が不正です。');
    }
    async function parse(buffer, sha256) {
        checkTransfer(buffer, sha256);
        return new Promise((resolve, reject) => {
            const worker = new Worker('./js/hyperion-worker.js?v=20260917-3');
            const timer = setTimeout(() => { worker.terminate(); reject(new Error('バイナリ解析がタイムアウトしました。')); }, 20000);
            const finish = () => { clearTimeout(timer); worker.terminate(); };
            worker.onmessage = ({ data }) => { finish(); data.ok ? resolve(data.parsed) : reject(new Error(data.error)); };
            worker.onerror = () => { finish(); reject(new Error('バイナリ解析を開始できませんでした。サイトを再読み込みしてください。')); };
            const copy = buffer.slice(0);
            worker.postMessage({ buffer: copy, sha256 }, [copy]);
        });
    }
    async function put(buffer, sha256, model) {
        const entry = { id: sha256, buffer, sha256 };
        memory.set(sha256, entry);
        if (model) models.set(sha256, model);
        try { await transaction('readwrite', store => store.put(entry)); return ''; }
        catch (_) { return 'ブラウザへ保存できませんでした。このタブを閉じる・再読み込みすると再送信が必要です。'; }
    }
    async function get(id) {
        const entry = memory.get(id) || await transaction('readonly', store => store.get(id)).catch(() => null);
        if (!entry) throw new Error('この履歴のバイナリが見つかりません。Colabから再送信してください。');
        memory.set(id, entry);
        return entry;
    }
    async function model(id) {
        if (!models.has(id)) {
            const entry = await get(id);
            models.set(id, await parse(entry.buffer, entry.sha256));
        }
        return models.get(id);
    }
    async function collect() {
        const liveIds = () => {
            const live = JSON.parse(localStorage.getItem('rsidHistory') || '[]');
            if (!Array.isArray(live)) throw new Error('履歴の形式が不正です。');
            return new Set([...live.map(h => h.hyperion?.binaryId).filter(Boolean), ...protectedIds, ...importingIds, activeBinaryId].filter(Boolean));
        };
        try {
            const keys = await transaction('readonly', store => store.getAllKeys());
            await transaction('readwrite', store => {
                const keep = liveIds();
                for (const key of keys) if (!keep.has(key)) store.delete(key);
            });
        } catch (_) { /* Memory-only storage remains usable for this tab. */ }
        try {
            const keep = liveIds();
            for (const id of memory.keys()) if (!keep.has(id)) { memory.delete(id); models.delete(id); }
        } catch (_) { /* If history cannot be read, do not discard binary data. */ }
    }
    async function exportBinaries(history) {
        const binaries = {};
        for (const id of new Set(history.map(h => h.hyperion?.binaryId).filter(Boolean))) {
            const entry = await get(id);
            binaries[id] = { sha256: entry.sha256, base64: HyperionCore.toBase64(entry.buffer) };
        }
        return binaries;
    }
    async function importBinaries(history, binaries = {}) {
        // Validate all required payloads before committing any history or player IDs.
        const pending = [];
        for (const id of new Set(history.map(h => h.hyperion?.binaryId).filter(Boolean))) {
            const item = binaries[id];
            if (!item || item.sha256 !== id) throw new Error('バックアップに必要なバイナリがありません。');
            const buffer = HyperionCore.fromBase64(item.base64);
            const parsed = await parse(buffer, id);
            for (const h of history.filter(h => h.hyperion?.binaryId === id)) {
                if (!HyperionCore.matchesHistoryText(h.data, parsed)) throw new Error('履歴の文字列とバイナリが一致しません。');
            }
            pending.push({ buffer, id, parsed });
        }
        let warning = '';
        for (const item of pending) { importingIds.add(item.id); warning = await put(item.buffer, item.id, item.parsed) || warning; }
        return warning;
    }
    function finishImport() { importingIds.clear(); void collect(); }
    function setActiveBinary(id) { activeBinaryId = id || null; }
    function status(message, error = false) {
        const element = document.getElementById('hyperion-transfer-status');
        element.textContent = message;
        element.hidden = !message;
        element.style.color = error ? '#ff9393' : '';
    }
    async function importBinary(buffer, sha256, receive) {
        checkTransfer(buffer, sha256);
        protectedIds.add(sha256);
        status('家系図を読み込み中…');
        try {
            const parsed = await parse(buffer, sha256);
            const storageWarning = await put(buffer, sha256, parsed);
            const historyWarning = await receive(parsed, sha256);
            const warning = [storageWarning, historyWarning].filter(Boolean).join(' ');
            status(warning || '家系図を表示しました。', !!warning);
            return { ok: true, warning };
        } catch (error) { status(error.message, true); throw error; }
        finally { protectedIds.delete(sha256); void collect(); }
    }
    function trustedOrigin(origin) {
        if (origin === 'https://colab.research.google.com') return true;
        if (/^https:\/\/[a-z0-9-]+-colab\.googleusercontent\.com$/.test(origin)) return true;
        // Only a local development page accepts local test senders.
        try {
            const local = ['localhost', '127.0.0.1', '[::1]'];
            const source = new URL(origin);
            return local.includes(location.hostname) && local.includes(source.hostname) && ['http:', 'https:'].includes(source.protocol);
        } catch (_) { return false; }
    }
    function install(receive) {
        window.name = 'HyperionFamilyTree';
        let session = null, sessionTimer, processing = false, relayCloseTimer = null;
        const touchSession = () => {
            clearTimeout(sessionTimer);
            sessionTimer = setTimeout(() => { if (!processing) session = null; }, 65000);
        };
        const completed = new Map();
        // A manually opened tab can be in a different browsing-context group.
        // A newly opened same-origin tab relays to the older tab, then closes itself.
        const instance = crypto.randomUUID(), started = performance.timeOrigin;
        const peers = new Map(), relayRequests = new Map(), cacheRequests = new Map();
        const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('hyperion-tree:' + new URL('.', location.href).pathname) : null;
        const announce = () => channel?.postMessage({ type: 'present', instance, started });
        channel?.addEventListener('message', async ({ data: message }) => {
            if (!message || message.instance === instance) return;
            if (message.type === 'discover') { announce(); return; }
            if (message.type === 'present' && typeof message.instance === 'string' && Number.isFinite(message.started)) {
                peers.set(message.instance, { started: message.started, seen: Date.now() }); return;
            }
            if (message.target !== instance) return;
            if (message.type === 'dataset-cache-query') {
                channel.postMessage({ type: 'dataset-cache-result', instance, target: message.instance, requestId: message.requestId,
                    cached: !!message.meta && HyperionFileImport.hasDataset(message.meta) });
                return;
            }
            if (message.type === 'dataset-cache-result') {
                const pending = cacheRequests.get(message.requestId);
                if (pending?.owner === message.instance) { cacheRequests.delete(message.requestId); clearTimeout(pending.timer); pending.resolve(message.cached === true); }
                return;
            }
            if (message.type === 'relay-result') {
                const pending = relayRequests.get(message.transferId);
                if (pending && pending.owner === message.instance) { relayRequests.delete(message.transferId); clearTimeout(pending.timer); pending.resolve(message.result); }
                return;
            }
            if (message.type !== 'relay-data' || typeof message.transferId !== 'string') return;
            const respond = result => channel.postMessage({ type: 'relay-result', instance, target: message.instance, transferId: message.transferId, result });
            const prior = completed.get(message.transferId);
            if (prior?.relay === message.instance) { respond(prior.result); return; }
            if (processing) { respond({ ok: false, error: '別の家系図を読み込み中です。完了後に再試行してください。' }); return; }
            processing = true;
            try {
                const result = await applyBinary(message);
                completed.set(message.transferId, { relay: message.instance, result });
                if (completed.size > 100) completed.delete(completed.keys().next().value);
                window.focus(); respond(result);
            } catch (error) { status(error.message, true); respond({ ok: false, error: error.message }); }
            finally { processing = false; }
        });
        channel?.postMessage({ type: 'discover', instance });
        announce();
        async function olderPeer() {
            if (!channel) return null;
            channel.postMessage({ type: 'discover', instance });
            await new Promise(resolve => setTimeout(resolve, 200));
            return [...peers.entries()].filter(([id, p]) => Date.now() - p.seen < 2000 &&
                (p.started < started || (p.started === started && id < instance))).sort((a, b) => a[1].started - b[1].started)[0]?.[0];
        }
        async function applyBinary(data) {
            if (data.dataset) {
                HyperionDataset.validate(data.dataset, data.selectedIndex);
                return HyperionFileImport.receiveDataset(data.file || HyperionFileImport.getDataset(data.dataset), data.dataset, data.selectedIndex);
            }
            return importBinary(data.buffer, data.sha256, receive);
        }
        window.addEventListener('message', async event => {
            const d = event.data;
            if (!event.source || !d || d.version !== 1 ||
                typeof d.transferId !== 'string' || !/^[a-f0-9-]{36}$/.test(d.transferId)) return;
            const reply = result => event.source.postMessage({ type: 'hyperion-result', transferId: d.transferId, ...result }, event.origin);
            if (!trustedOrigin(event.origin)) {
                // Return only a diagnostic to the exact sender origin; never accept its data.
                if (d.type === 'hyperion-hello' && /^https?:\/\//.test(event.origin)) {
                    reply({ ok: false, error: `この送信元からの接続は許可されていません: ${event.origin}` });
                }
                return;
            }
            if (d.type === 'hyperion-hello') {
                const previous = completed.get(d.transferId);
                if (previous) {
                    if (previous.source === event.source && previous.origin === event.origin) reply(previous.result);
                    return;
                }
                // A quick next click may reuse a relay tab during its close delay.
                clearTimeout(relayCloseTimer);
                relayCloseTimer = null;
                if (processing) { reply({ ok: false, error: '別の家系図を読み込み中です。完了後に再試行してください。' }); return; }
                if (!session || session.transferId !== d.transferId || session.source !== event.source || session.origin !== event.origin) {
                    if (session?.dataset && Date.now() - session.created < 65000) {
                        reply({ ok: false, error: '別の結果ファイルを受信中です。完了後に再試行してください。' }); return;
                    }
                    session = { transferId: d.transferId, source: event.source, origin: event.origin, challenge: crypto.randomUUID(), created: Date.now() };
                }
                touchSession();
                event.source.postMessage({ type: 'hyperion-ready', transferId: d.transferId, challenge: session.challenge, dataset: true }, event.origin);
                return;
            }
            const datasetMessage = ['hyperion-dataset-begin', 'hyperion-dataset-chunk', 'hyperion-dataset-end', 'hyperion-dataset-abort'].includes(d.type);
            if ((!datasetMessage && d.type !== 'hyperion-data') || processing || !session || Date.now() - session.created > 65000 ||
                session.source !== event.source || session.origin !== event.origin || session.transferId !== d.transferId || session.challenge !== d.challenge) return;
            let payload = d;
            if (datasetMessage) {
                if (d.type === 'hyperion-dataset-abort') { session = null; clearTimeout(sessionTimer); return; }
                try {
                    if (d.type === 'hyperion-dataset-begin') {
                        HyperionDataset.validate(d.meta, d.selectedIndex);
                        // Probe the actual destination when a newly opened tab relays to an older tab.
                        processing = true;
                        try {
                            session.owner = await olderPeer();
                            if (session.owner) session.remoteCached = await new Promise(resolve => {
                                const requestId = crypto.randomUUID();
                                const timer = setTimeout(() => { cacheRequests.delete(requestId); resolve(false); }, 2000);
                                cacheRequests.set(requestId, { owner: session.owner, resolve, timer });
                                channel.postMessage({ type: 'dataset-cache-query', instance, target: session.owner, requestId, meta: d.meta });
                            });
                        } finally { processing = false; }
                    }
                    session.created = Date.now(); touchSession();
                    payload = HyperionDataset.accept(d, session, details => event.source.postMessage({ type: 'hyperion-dataset-ack',
                        transferId: d.transferId, challenge: session.challenge, ...details }, event.origin));
                    if (!payload) return;
                } catch (error) { session = null; clearTimeout(sessionTimer); status(error.message, true); reply({ ok: false, error: error.message }); return; }
            }
            processing = true;
            status('家系図を読み込み中…');
            try {
                if (!payload.dataset) checkTransfer(payload.buffer, payload.sha256);
                const owner = payload.dataset ? session.owner : await olderPeer();
                const result = owner ? await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => { relayRequests.delete(d.transferId); reject(new Error('開いているサイトのタブに接続できませんでした。再試行してください。')); }, payload.dataset ? 180000 : 25000);
                    relayRequests.set(d.transferId, { resolve, owner, timer });
                    channel.postMessage({ ...payload, type: 'relay-data', instance, target: owner, transferId: d.transferId });
                }) : await applyBinary(payload);
                if (!result.ok) throw new Error(result.error);
                completed.set(d.transferId, { source: event.source, origin: event.origin, result });
                while (completed.size > 100) completed.delete(completed.keys().next().value);
                status(result.warning || '家系図を表示しました。', !!result.warning);
                reply(result);
                if (owner && window.opener) relayCloseTimer = setTimeout(() => {
                    if (!processing && !session) window.close();
                }, 750);
            } catch (error) {
                status(error.message, true);
                reply({ ok: false, error: error.message });
            } finally { processing = false; session = null; clearTimeout(sessionTimer); }
        });
    }
    window.HyperionTransfer = { parse, put, get, model, collect, exportBinaries, importBinaries, importBinary, finishImport, setActiveBinary, status, install };
})();
