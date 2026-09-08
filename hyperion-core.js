/* Shared by the binary Worker and Node tests. No DOM or network access here. */
(function (root) {
    'use strict';
    const MAGIC = 'HYTREE01';
    const LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, records: 10000, cards: 4096, depth: 128, metadata: 256 * 1024 });
    const NONE = 0xffffffff;
    const fail = message => { throw new Error(message); };
    const integer = (n, max = NONE) => Number.isSafeInteger(n) && n >= 0 && n <= max;
    const normalRsid = value => typeof value === 'string' && /^[A-Za-z0-9]{6}$/.test(value);
    function fromBase64(text) {
        if (typeof text !== 'string' || text.length > Math.ceil(LIMITS.bytes / 3) * 4 || text.length % 4 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) fail('転送データのBase64形式が不正です。');
        return Uint8Array.from(atob(text), c => c.charCodeAt(0)).buffer;
    }
    function toBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let text = '';
        for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(text);
    }
    async function digest(buffer) {
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), n => n.toString(16).padStart(2, '0')).join('');
    }
    async function parse(buffer, sha256, tables) {
        if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 12 || buffer.byteLength > LIMITS.bytes) fail('転送容量が不正、または上限を超えています。');
        if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256) || await digest(buffer) !== sha256) fail('転送データのハッシュが一致しません。');
        const bytes = new Uint8Array(buffer), view = new DataView(buffer);
        if (String.fromCharCode(...bytes.subarray(0, 8)) !== MAGIC) fail('未対応の転送形式です。');
        const length = view.getUint32(8, true);
        if (!length || length > LIMITS.metadata || 12 + length > bytes.length) fail('メタデータの長さが不正です。');
        const meta = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(12, 12 + length)));
        if (!meta || meta.schemaVersion !== 1 || meta.recordSize !== 132 || meta.byteOrder !== 'little-endian' || meta.tableVersion !== tables.version) fail('データ形式または対応表のバージョンが一致しません。Notebookとサイトを同じ版に更新してください。');
        const indices = meta.recordIndices;
        if (!Array.isArray(indices) || !indices.length || indices.length > LIMITS.records ||
            !integer(meta.sourceCount) || !integer(meta.sourceStart, meta.sourceCount) || !integer(meta.selectedIndex) ||
            typeof meta.fileName !== 'string' || meta.fileName.length > 255 ||
            indices.some(n => !integer(n) || n >= meta.sourceCount) || new Set(indices).size !== indices.length ||
            !indices.includes(meta.selectedIndex) || 12 + length + indices.length * 132 !== bytes.length) fail('レコード番号・件数・ファイル長が不正です。');
        const records = new Map();
        const lookup = (key, id) => {
            const values = tables[key];
            if (!values || !Object.hasOwn(values, String(id))) return null;
            return values[String(id)];
        };
        indices.forEach((sourceIndex, slot) => {
            const offset = 12 + length + slot * 132;
            const data = Array.from({ length: 26 }, (_, i) => view.getUint32(offset + i * 4, true));
            const rsidBytes = Array.from(bytes.subarray(offset + 116, offset + 124));
            const rawRsid = rsidBytes[0] === 95 ? '_' + rsidBytes.slice(1, 7).map(v => v.toString(16).padStart(2, '0')).join(':') :
                String.fromCharCode(...rsidBytes.slice(0, rsidBytes.includes(0) ? rsidBytes.indexOf(0) : 8));
            const record = {
                sourceIndex, data, ability1: view.getUint32(offset + 104, true), ability2: view.getUint32(offset + 108, true),
                personal_type: bytes[offset + 112], pair_param: bytes[offset + 113], category1: bytes[offset + 114], category2: bytes[offset + 115],
                rsidBytes, rawRsid, rsid: normalRsid(rawRsid) ? rawRsid : '',
                left_index: view.getUint32(offset + 124, true), right_index: view.getUint32(offset + 128, true)
            };
            record.name = lookup('Name', data[23]) || '名称不明';
            const display = [
                ['アンテナ', lookup('SkillGroup', data[24])], ['頭', lookup('Head', data[1])], ['体格', lookup('Body', data[10])],
                ['色', [lookup('BodyColor', data[11]), lookup('BodyColor', data[12])].filter(v => v !== null).join(' ') || null],
                ['柄', lookup('BodyPattern', data[14])], ['髪', data[2]], ['髪色', lookup('HairColor', data[4])],
                ['肌色', lookup('FaceColor', data[3])], ['目', data[5]], ['口', data[6]], ['鼻', data[7]], ['眉', data[8]], ['頬', data[9]]
            ];
            // Unknown IDs remain in raw records; never substitute a known appearance.
            record.statusText = display.filter(([, v]) => v !== null).map(([k, v]) => `${k}:${v}`).join(' ');
            record.appearanceComplete = display.filter(([k]) => k !== '体格').every(([, v]) => v !== null && v !== '指定なし');
            record.appearanceComplete &&= [[2, 94], [5, 67], [6, 70], [7, 41], [8, 38], [9, 13]].every(([i, max]) => data[i] <= max);
            const ability = lookup('Ability', record.ability1);
            if (ability) record.statusText += ' ' + ability;
            records.set(sourceIndex, record);
        });
        for (const r of records.values()) {
            if ((r.left_index === NONE) !== (r.right_index === NONE)) fail('片方だけの親参照には対応していません。');
            for (const p of [r.left_index, r.right_index]) if (p !== NONE && !records.has(p)) fail('祖先レコードが不足しています。');
        }
        // DAG validation and depth checking do not rely on the file's record order.
        const colors = new Map(), heights = new Map();
        function visit(index, depth) {
            if (depth > LIMITS.depth) fail('家系図の世代数が上限を超えています。');
            if (colors.get(index) === 1) fail('親参照が循環しています。');
            if (colors.get(index) === 2) {
                if (depth + heights.get(index) > LIMITS.depth) fail('家系図の世代数が上限を超えています。');
                return heights.get(index);
            }
            colors.set(index, 1);
            const r = records.get(index);
            const h = r.left_index === NONE ? 0 : 1 + Math.max(visit(r.left_index, depth + 1), visit(r.right_index, depth + 1));
            colors.set(index, 2); heights.set(index, h); return h;
        }
        visit(meta.selectedIndex, 0);
        if (colors.size !== records.size) fail('選択個体と無関係のレコードが含まれています。');
        let cards = 0;
        function build(index) {
            if (++cards > LIMITS.cards) fail('表示する家系図のカード数が上限を超えています。');
            const r = records.get(index);
            const participants = r.left_index === NONE ? [] : [build(r.left_index), build(r.right_index)];
            return { name: r.name, id: r.rsid, sourceIndex: index, participants };
        }
        const tree = build(meta.selectedIndex);
        function text(node) {
            return node.participants.length ? `( ${text(node.participants[0])} + ${text(node.participants[1])} ) ${node.name}` :
                `${node.id ? node.id + ' ' : ''}${node.name}`;
        }
        const statusText = records.get(meta.selectedIndex).statusText;
        return { meta, tree, records: Array.from(records.values()), statusText, appearanceComplete: records.get(meta.selectedIndex).appearanceComplete, treeText: text(tree) + ' ' + statusText, sha256 };
    }
    const api = { LIMITS, normalRsid, fromBase64, toBase64, digest, parse };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.HyperionCore = api;
})(globalThis);
