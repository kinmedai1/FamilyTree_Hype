/* Embedded into Colab result HTML by tools/build_hyperion.py. */
(() => {
    'use strict';
    const config = __HYPERION_CONTEXT__;
    const state = window.__hyperionSender || (window.__hyperionSender = { popup: null, busy: false });
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
                    sent = true;
                    const raw = atob(prepared.base64);
                    const buffer = Uint8Array.from(raw, c => c.charCodeAt(0)).buffer;
                    popup.postMessage({ type: 'hyperion-data', version: 1, transferId, challenge: ready.challenge, sha256: prepared.sha256, buffer }, origin, [buffer]);
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
                    if (!sent) popup.postMessage({ type: 'hyperion-hello', version: 1, transferId }, origin);
                };
                pulse = setInterval(hello, 500); hello();
                timer = setTimeout(() => reject(new Error('サイトとの通信がタイムアウトしました。サイトの更新・URL・接続を確認して再試行してください。')), 60000);
                Promise.resolve().then(() => google.colab.kernel.invokeFunction('hyperion.export_tree', [config.contextId, index], {})).then(result => {
                    prepared = result.data?.['application/json'];
                    if (!prepared || prepared.error) throw new Error(prepared?.error || '抽出データを取得できませんでした。');
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
