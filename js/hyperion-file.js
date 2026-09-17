/* Colab save files: 8-byte header and unchanged 132-byte BirthParams records. */
(function (root) {
    'use strict';
    const Core = root.HyperionCore || (typeof require === 'function' ? require('./hyperion-core.js') : null);
    const RECORD_SIZE = 132, NONE = 0xffffffff, PAGE_SIZE = 24;
    async function inspect(file) {
        if (!file || !Number.isSafeInteger(file.size) || file.size < 8) throw new Error('保存ファイルのヘッダーが不正です。');
        const header = await file.slice(0, 8).arrayBuffer();
        if (new TextDecoder().decode(header) === 'HYTREE01') throw new Error('転送用データではなく、Colabで保存した .hype.bin を選択してください。');
        const view = new DataView(header), start = view.getUint32(0, true), count = view.getUint32(4, true);
        if (start > count || file.size !== 8 + count * RECORD_SIZE) throw new Error('保存ファイルの形式またはサイズが不正です。');
        if (!count) throw new Error('保存ファイルに個体がありません。');
        return { start, count, name: file.name || 'import.hype.bin', pageSize: PAGE_SIZE };
    }
    async function list(file, page, tables, resultsOnly = false) {
        const info = await inspect(file), firstIndex = resultsOnly ? info.start : 0;
        const visibleCount = info.count - firstIndex, pages = Math.max(1, Math.ceil(visibleCount / PAGE_SIZE));
        if (!Number.isInteger(page) || page < 0 || page >= pages) throw new Error('一覧のページ番号が不正です。');
        const first = firstIndex + page * PAGE_SIZE, last = Math.min(first + PAGE_SIZE, info.count);
        const buffer = await file.slice(8 + first * RECORD_SIZE, 8 + last * RECORD_SIZE).arrayBuffer();
        const records = [];
        for (let slot = 0; slot < last - first; slot++) {
            const offset = slot * RECORD_SIZE;
            const record = Core.decodeRecord(buffer, offset, first + slot, tables);
            records.push({ index: record.sourceIndex, name: record.name, statusText: record.statusText, appearanceComplete: record.appearanceComplete });
        }
        return { ...info, page, pages, records, visibleCount };
    }
    async function extract(file, selectedIndex, tables) {
        const info = await inspect(file);
        if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= info.count) throw new Error('選択個体の番号が不正です。');
        const records = new Map(), blocks = new Map(), stack = [selectedIndex];
        while (stack.length) {
            const index = stack.pop();
            if (records.has(index)) continue;
            if (index >= info.count) throw new Error('親のレコード番号が範囲外です。');
            if (records.size >= Core.LIMITS.records) throw new Error('選択個体と祖先の件数が上限を超えています。');
            const block = Math.floor(index / 256);
            if (!blocks.has(block)) {
                const first = block * 256, last = Math.min(first + 256, info.count);
                blocks.set(block, new Uint8Array(await file.slice(8 + first * RECORD_SIZE, 8 + last * RECORD_SIZE).arrayBuffer()));
                if (blocks.size > 8) blocks.delete(blocks.keys().next().value);
            }
            const offset = (index % 256) * RECORD_SIZE;
            const record = blocks.get(block).slice(offset, offset + RECORD_SIZE);
            if (record.length !== RECORD_SIZE) throw new Error('保存ファイルが途中で切れています。');
            records.set(index, record);
            const view = new DataView(record.buffer), left = view.getUint32(124, true), right = view.getUint32(128, true);
            if ((left === NONE) !== (right === NONE)) throw new Error('片方だけの親参照には対応していません。');
            if (left !== NONE) stack.push(left, right);
        }
        const indices = [...records.keys()].sort((a, b) => a - b);
        const meta = { schemaVersion: 1, recordSize: RECORD_SIZE, byteOrder: 'little-endian', sourceStart: info.start,
            sourceCount: info.count, selectedIndex, recordIndices: indices, fileName: info.name, tableVersion: tables.version };
        const encoded = new TextEncoder().encode(JSON.stringify(meta));
        const size = 12 + encoded.length + indices.length * RECORD_SIZE;
        if (encoded.length > Core.LIMITS.metadata || size > Core.LIMITS.bytes) throw new Error('選択個体と祖先の容量が上限を超えています。');
        const output = new Uint8Array(size);
        output.set(new TextEncoder().encode('HYTREE01'));
        new DataView(output.buffer).setUint32(8, encoded.length, true);
        output.set(encoded, 12);
        indices.forEach((index, slot) => output.set(records.get(index), 12 + encoded.length + slot * RECORD_SIZE));
        // The existing transfer parser validates cycles, depth, IDs and tree size before display/storage.
        return output.buffer;
    }
    const api = { inspect, list, extract };
    root.HyperionFile = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
