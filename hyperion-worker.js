'use strict';
importScripts('./hyperion-core.js');
const tables = fetch('./hyperion-tables.json').then(r => {
    if (!r.ok) throw new Error('対応表を読み込めませんでした。');
    return r.json();
});
self.onmessage = async ({ data }) => {
    try {
        const parsed = await HyperionCore.parse(data.buffer, data.sha256, await tables);
        self.postMessage({ ok: true, parsed });
    } catch (error) {
        self.postMessage({ ok: false, error: error.message || 'バイナリの解析に失敗しました。' });
    }
};
