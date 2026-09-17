/* Temporary result-file transport. Only selected ancestry is persisted by the app. */
(() => {
    'use strict';
    const MAX_BYTES = 100 * 1024 * 1024, CHUNK_BYTES = 1024 * 1024;
    function validate(meta, index) {
        if (!meta || meta.version !== 1 || !Number.isSafeInteger(meta.size) || meta.size < 140 || meta.size > MAX_BYTES ||
            !Number.isInteger(meta.count) || !Number.isInteger(meta.start) || meta.start < 0 || meta.start > meta.count ||
            meta.size !== 8 + meta.count * 132 || !Number.isInteger(index) || index < 0 || index >= meta.count ||
            typeof meta.fileName !== 'string' || !meta.fileName || meta.fileName.length > 255 ||
            !/^[a-f0-9]{64}$/.test(meta.sha256) || typeof meta.tableVersion !== 'string') {
            throw new Error('結果ファイルの形式・容量・選択番号が不正です（転送上限100 MiB）。');
        }
    }
    // Called only after the existing origin/source/challenge handshake has succeeded.
    function accept(data, session, acknowledge) {
        if (data.type === 'hyperion-dataset-begin') {
            if (session.dataset) throw new Error('結果ファイルの送信が重複しています。再試行してください。');
            validate(data.meta, data.selectedIndex);
            const cached = session.remoteCached || HyperionFileImport.hasDataset(data.meta);
            session.dataset = { meta: data.meta, selectedIndex: data.selectedIndex, cached, chunks: [], size: 0 };
            acknowledge({ next: 0, cached });
            return null;
        }
        const item = session.dataset;
        if (!item) throw new Error('結果ファイルの送信を最初からやり直してください。');
        if (data.type === 'hyperion-dataset-chunk') {
            const remaining = item.meta.size - item.size;
            if (item.cached || remaining <= 0 || data.index !== item.chunks.length || !(data.buffer instanceof ArrayBuffer) ||
                data.buffer.byteLength !== Math.min(CHUNK_BYTES, remaining)) throw new Error('結果ファイルの分割データが不正です。');
            item.chunks.push(new Blob([data.buffer])); item.size += data.buffer.byteLength;
            HyperionTransfer.status(`結果ファイルを受信中… ${Math.floor(item.size / item.meta.size * 100)}%`);
            acknowledge({ next: item.chunks.length, cached: false });
            return null;
        }
        if (data.type !== 'hyperion-dataset-end' || (!item.cached && item.size !== item.meta.size)) throw new Error('結果ファイルの受信が完了していません。');
        const file = item.cached ? HyperionFileImport.getDataset(item.meta) : new File(item.chunks, item.meta.fileName);
        session.dataset = null;
        return { dataset: item.meta, selectedIndex: item.selectedIndex, file };
    }
    window.HyperionDataset = { validate, accept, MAX_BYTES, CHUNK_BYTES };
})();
