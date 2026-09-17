'use strict';
importScripts('./hyperion-core.js?v=20260917-3', './hyperion-file.js?v=20260917-3');
self.onmessage = async ({ data }) => {
    try {
        if (data.action === 'inspect') {
            self.postMessage({ ok: true, result: await HyperionFile.inspect(data.file) });
            return;
        }
        const response = await fetch('../hyperion-tables.json');
        if (!response.ok) throw new Error('対応表を読み込めませんでした。');
        const tables = await response.json();
        if (data.action === 'list') self.postMessage({ ok: true, result: await HyperionFile.list(data.file, data.page, tables) });
        else if (data.action === 'extract') {
            const buffer = await HyperionFile.extract(data.file, data.index, tables);
            self.postMessage({ ok: true, result: buffer }, [buffer]);
        } else throw new Error('未対応の読込操作です。');
    } catch (error) { self.postMessage({ ok: false, error: error.message || '保存ファイルを読み込めませんでした。' }); }
};
