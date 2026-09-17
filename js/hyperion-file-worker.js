'use strict';
importScripts('./hyperion-core.js?v=20260917-3', './hyperion-file.js?v=20260918-1');
self.onmessage = async ({ data }) => {
    try {
        if (data.action === 'inspect') {
            self.postMessage({ ok: true, result: await HyperionFile.inspect(data.file) });
            return;
        }
        const response = await fetch('../hyperion-tables.json');
        if (!response.ok) throw new Error('対応表を読み込めませんでした。');
        const tables = await response.json();
        if (data.action === 'verify') {
            const info = await HyperionFile.inspect(data.file);
            if (data.meta.tableVersion !== tables.version) throw new Error('Notebookとサイトの対応表が一致しません。両方を更新してください。');
            if (info.start !== data.meta.start || info.count !== data.meta.count || data.file.size !== data.meta.size ||
                await HyperionCore.digest(await data.file.arrayBuffer()) !== data.meta.sha256) throw new Error('結果ファイルの内容が送信元と一致しません。再試行してください。');
            self.postMessage({ ok: true, result: info });
        }
        else if (data.action === 'list') self.postMessage({ ok: true, result: await HyperionFile.list(data.file, data.page, tables, data.resultsOnly === true) });
        else if (data.action === 'extract') {
            const buffer = await HyperionFile.extract(data.file, data.index, tables);
            self.postMessage({ ok: true, result: buffer }, [buffer]);
        } else throw new Error('未対応の読込操作です。');
    } catch (error) { self.postMessage({ ok: false, error: error.message || '保存ファイルを読み込めませんでした。' }); }
};
