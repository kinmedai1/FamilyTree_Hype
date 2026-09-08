/* Embedded into Colab result HTML by tools/build_hyperion.py. */
(() => {
    'use strict';
    const config = __HYPERION_CONTEXT__;
    const state = window.__hyperionSender || (window.__hyperionSender = { popup: null, busy: false });
    let snapshot;
    async function prepare(index) {
        if (config.snapshot?.error) throw new Error(config.snapshot.error);
        if (!config.snapshot?.meta || typeof config.snapshot.base64 !== 'string') {
            throw new Error('この結果欄には転送用データがありません。更新済みNotebookで検索・出生結果を表示し直してください。');
        }
        if (!snapshot) {
            const meta = config.snapshot.meta, indices = meta.recordIndices;
            if (meta.recordSize !== 132 || !Array.isArray(indices) || indices.length > 50000 || config.snapshot.base64.length > 8800000) throw new Error('結果欄の転送用データが不正です。');
            const raw = atob(config.snapshot.base64);
            const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
            if (bytes.length !== indices.length * 132) throw new Error('結果欄の転送用データが途中で切れています。');
            const positions = new Map(indices.map((id, position) => [id, position]));
            if (positions.size !== indices.length || indices.some(id => !Number.isInteger(id) || id < 0 || id >= meta.sourceCount)) throw new Error('結果欄のレコード番号が不正です。');
            snapshot = { meta, bytes, positions, view: new DataView(bytes.buffer) };
        }
        const { meta, bytes, positions, view } = snapshot;
        if (!Number.isInteger(index) || !positions.has(index)) throw new Error('選択個体が結果欄のデータにありません。表示し直してください。');
        const selected = new Set(), stack = [index];
        while (stack.length) {
            const id = stack.pop();
            if (selected.has(id)) continue;
            if (!positions.has(id)) throw new Error('祖先の元データが不足しています。');
            if (selected.size >= 10000) throw new Error('抽出する個体数が上限を超えています。');
            selected.add(id);
            const offset = positions.get(id) * 132;
            const left = view.getUint32(offset + 124, true), right = view.getUint32(offset + 128, true);
            if ((left === 0xffffffff) !== (right === 0xffffffff)) throw new Error('片方だけの親参照には対応していません。');
            if (left !== 0xffffffff) stack.push(left, right);
        }
        const recordIndices = [...selected].sort((a, b) => a - b);
        const metadata = new TextEncoder().encode(JSON.stringify({ ...meta, selectedIndex: index, recordIndices }));
        const size = 12 + metadata.length + recordIndices.length * 132;
        if (metadata.length > 256 * 1024 || size > 2 * 1024 * 1024) throw new Error('転送容量の上限を超えています。');
        const payload = new Uint8Array(size);
        payload.set(new TextEncoder().encode('HYTREE01'));
        new DataView(payload.buffer).setUint32(8, metadata.length, true);
        payload.set(metadata, 12);
        recordIndices.forEach((id, i) => { const offset = positions.get(id) * 132; payload.set(bytes.subarray(offset, offset + 132), 12 + metadata.length + i * 132); });
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
        return { buffer: payload.buffer, sha256: [...hash].map(v => v.toString(16).padStart(2, '0')).join('') };
    }
    window.hyperionSend = async (index, button) => {
        if (state.busy) return;
        let origin, site;
        try {
            site = new URL(config.siteUrl);
            if (site.protocol !== 'https:' && !(site.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname))) throw new Error();
            origin = site.origin;
        } catch (_) {
            const message = '送信先が未設定、またはURLが不正です。NotebookのHYPERION_SITE_URLに、このサイトのGitHub Pages URLを設定してください。';
            button.title = message; button.textContent = '家系図';
            let label = button.parentElement.querySelector('.hyperion-send-error');
            if (!label) { label = document.createElement('span'); label.className = 'hyperion-send-error'; label.style.cssText = 'display:block;font-size:11px;max-width:180px;white-space:normal'; button.parentElement.append(label); }
            label.textContent = message; return;
        }
        state.busy = true;
        button.disabled = true;
        button.textContent = '送信中';
        button.parentElement.querySelector('.hyperion-send-error')?.remove();
        const transferId = crypto.randomUUID();
        let timer, pulse, listener, finished = false;
        try {
            let popup = state.popup;
            if (!popup || popup.closed) popup = window.open('', 'HyperionFamilyTree');
            if (!popup) throw new Error('別タブがブロックされました。ポップアップを許可して再試行してください。');
            state.popup = popup;
            try { if (popup.location.href === 'about:blank') popup.location.replace(site.href); } catch (_) { /* Existing cross-origin tab. */ }
            popup.focus();
            const exchange = new Promise((resolve, reject) => {
                let prepared, ready, sent = false;
                const send = () => {
                    if (!prepared || !ready || sent || finished) return;
                    try {
                        const buffer = prepared.buffer;
                        popup.postMessage({ type: 'hyperion-data', version: 1, transferId, challenge: ready.challenge, sha256: prepared.sha256, buffer }, origin, [buffer]);
                        sent = true;
                    } catch (error) { reject(error); }
                };
                listener = event => {
                    if (event.source !== popup || event.origin !== origin || event.data?.transferId !== transferId) return;
                    const data = event.data;
                    if (data.type === 'hyperion-ready' && typeof data.challenge === 'string') { ready = data; send(); }
                    if (data.type === 'hyperion-result') {
                        if (data.ok) resolve(data); else reject(new Error(data.error || '受信に失敗しました。'));
                    }
                };
                window.addEventListener('message', listener);
                const hello = () => {
                    if (popup.closed) { reject(new Error('サイトのタブが閉じられました。再試行してください。')); return; }
                    try { if (!sent) popup.postMessage({ type: 'hyperion-hello', version: 1, transferId }, origin); }
                    catch (error) { reject(error); }
                };
                pulse = setInterval(hello, 500); hello();
                timer = setTimeout(() => {
                    const phase = !ready ? 'サイトからの応答待ち' : !prepared ? '結果欄のデータ準備待ち' : 'サイトでの受信・表示完了待ち';
                    reject(new Error(`サイトとの通信がタイムアウトしました（${phase}）。サイトを再読み込みして再試行してください。送信元: ${location.origin}`));
                }, 60000);
                prepare(index).then(result => {
                    prepared = result;
                    send();
                }).catch(reject);
            });
            const result = await exchange;
            button.title = result.warning || '家系図を表示しました。';
            button.textContent = '家系図';
        } catch (error) {
            button.textContent = '再試行';
            button.title = error.message;
            let message = button.parentElement.querySelector('.hyperion-send-error');
            if (!message) { message = document.createElement('span'); message.className = 'hyperion-send-error'; message.style.cssText = 'display:block;font-size:11px;max-width:180px;color:#ff9393;white-space:normal'; button.parentElement.append(message); }
            message.textContent = error.message;
        } finally {
            finished = true;
            clearTimeout(timer); clearInterval(pulse);
            if (listener) window.removeEventListener('message', listener);
            button.disabled = false; state.busy = false;
        }
    };
})();
