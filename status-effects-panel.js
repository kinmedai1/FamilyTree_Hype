/* Read-only additional effects; original records and existing card content stay intact. */
(function (root) {
    'use strict';
    const CATEGORIES = ['antennas', 'heads', 'bodies', 'patterns', 'bodyColors'];
    let tablePromise;
    const pending = new WeakMap();

    function loadTables() {
        if (!tablePromise) {
            tablePromise = (async () => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 10000);
                try {
                    const response = await fetch('./status-effects.json?v=20260912-1', { signal: controller.signal });
                    if (!response.ok) throw new Error('追加効果の対応表を取得できませんでした。');
                    const tables = await response.json();
                    if (tables.schemaVersion !== 1 || CATEGORIES.some(key => !tables[key] || typeof tables[key] !== 'object')) {
                        throw new Error('追加効果の対応表を確認できませんでした。');
                    }
                    return tables;
                } finally { clearTimeout(timer); }
            })().catch(error => { tablePromise = null; throw error; });
        }
        return tablePromise;
    }

    function textFields(statusText) {
        const fields = {};
        // Requiring a field boundary avoids matching 色 inside 髪色 or 肌色.
        const regex = /(?:^|\s)(アンテナ|頭|体格|柄|体色|色):([\s\S]*?)(?=\s+[^\s:]+:|$)/g;
        for (const match of String(statusText || '').matchAll(regex)) fields[match[1]] = match[2].trim();
        return fields;
    }

    function colorName(name) {
        name = name.replace(/^通常/, '');
        return name.replace(/^([濃薄]?)(黄|水)$/, '$1$2色');
    }

    function correction(statusText, record = null) {
        let remaining = String(statusText || '');
        let name = '';
        const labeled = /(?:^|\s)補正[:：]([^\r\n]*?)(?=\s+[^\s:：]+[:：]|$)/;
        const bare = /(?:^|\s)(補正なし|補正無し|アビリティなし|[^\s:：]+(?:\s*\/\s*[^\s:：]+)*補正)(?=\s|$)/;
        const match = remaining.match(labeled) || remaining.match(bare);
        if (match) {
            name = match[1].trim();
            remaining = (remaining.slice(0, match.index) + ' ' + remaining.slice(match.index + match[0].length)).trim();
        }
        if (record) {
            name = record.ability1 === 0 ? 'なし' : record.correctionName || '未確認';
        }
        if (!name || ['無し', '補正なし', '補正無し', 'アビリティなし'].includes(name)) name = 'なし';
        return { name, remaining };
    }

    function resolve(tables, { statusText = '', record = null } = {}) {
        const fields = textFields(statusText);
        function find(category, label, field, dataIndex, overrideName) {
            const requested = overrideName ?? (fields[field] || '').split(/\s+/)[0];
            let name = category === 'bodyColors' ? colorName(requested) : requested;
            let entry = null;
            if (record) {
                const id = record.data[dataIndex];
                // An unknown binary ID must never pick up another record's effect by name.
                const found = Object.entries(tables[category]).find(([, value]) => value.hyperionId !== null && value.hyperionId === id);
                if (found) [name, entry] = found;
            } else if (name && Object.hasOwn(tables[category], name)) {
                entry = tables[category][name];
            }
            return { category, label, name: name || '情報なし', entry };
        }
        const rows = [
            find('antennas', 'アンテナ', 'アンテナ', 24),
            find('heads', '頭', '頭', 1),
            find('bodies', '体格', '体格', 10),
            find('patterns', '柄', '柄', 14),
        ];
        const colors = (fields['体色'] || fields['色'] || '').split(/[\s&＆]+/).filter(Boolean);
        const singleColor = rows[3].entry?.colorCount === 1;
        const count = singleColor ? 1 : record ? 2 : Math.max(1, Math.min(colors.length, 3));
        for (let i = 0; i < count; i++) {
            rows.push(find('bodyColors', count === 1 ? '体色' : `体色${i + 1}`, '色', 11 + i, colors[i] || ''));
        }
        return rows;
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function correctionSection(name) {
        const section = element('section', 'additional-effects-section additional-effects-correction');
        section.append(element('h4', 'additional-effects-heading', '補正'), element('p', 'additional-effects-ap', name));
        return section;
    }

    function render(panel, rows, correctionName) {
        const fragment = document.createDocumentFragment();
        fragment.append(element('h3', 'additional-effects-title', 'ステータス'));
        for (const { category, label, name, entry } of rows) {
            const section = element('section', 'additional-effects-section');
            const heading = element('h4', 'additional-effects-heading');
            heading.append(element('span', 'additional-effects-category', label), element('span', '', name));
            section.append(heading);
            if (!entry || entry.sourceStatus !== 'available') {
                section.append(element('p', 'additional-effects-note', name === '情報なし' ? '情報なし' : '対応表にデータがありません'));
            } else if (category === 'antennas') {
                if (entry.ap == null || !entry.apLevelRange) {
                    section.append(element('p', 'additional-effects-note', 'AP未確認'));
                } else {
                    const { min, max } = entry.apLevelRange;
                    const range = max === null ? '全レベル' : `Lv.${min}〜${max}`;
                    section.append(element('p', 'additional-effects-ap', `AP ${entry.ap} ／ ${range}`));
                    if (entry.coverage !== 'all_levels') section.append(element('p', 'additional-effects-note', 'このレベル範囲で確認できる値'));
                }
            } else if (category === 'bodies') {
                const grid = element('dl', 'additional-effects-body');
                for (const [key, label] of [['hp', 'HP'], ['attack', '攻撃'], ['defense', '防御'], ['speed', '素早さ']]) {
                    const value = entry.multipliersPercent?.[key];
                    grid.append(element('dt', '', label), element('dd', '', value == null ? '未確認' : `${value}%`));
                }
                grid.append(element('dt', '', '回避率'), element('dd', '', entry.evasionPercent == null ? '未確認' : `${entry.evasionPercent}%`));
                section.append(grid);
            } else {
                if (category === 'heads') section.append(element('p', 'additional-effects-janken', `じゃんけん：${entry.janken ?? '未確認'}`));
                if (!Array.isArray(entry.effects)) section.append(element('p', 'additional-effects-note', '効果未確認'));
                else if (!entry.effects.length) section.append(element('p', 'additional-effects-note', '固有効果なし'));
                else {
                    const list = element('ul', 'additional-effects-list');
                    for (const effect of entry.effects) list.append(element('li', '', effect.sourceText));
                    section.append(list);
                }
            }
            fragment.append(section);
        }
        fragment.append(correctionSection(correctionName));
        fragment.append(element('p', 'additional-effects-footnote', '各部位の効果を個別に表示しています。'));
        panel.replaceChildren(fragment);
        panel.dataset.state = 'ready';
    }

    function attach(card, input, onLayout = () => {}) {
        const correctionName = correction(input.statusText, input.record).name;
        const style = getComputedStyle(card);
        const width = card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const original = element('div', 'champion-existing');
        original.style.width = `${width}px`;
        // Move the actual elements, retaining their contents, canvases and listeners.
        original.append(...card.childNodes);
        const panel = element('aside', 'additional-effects-panel');
        panel.setAttribute('aria-label', 'ステータス');
        panel.addEventListener('click', event => event.stopPropagation());
        card.append(original, panel);
        card.classList.add('has-additional-effects');

        function refresh() {
            panel.dataset.state = 'loading';
            panel.replaceChildren(element('h3', 'additional-effects-title', 'ステータス'), element('p', 'additional-effects-note', '読み込み中…'), correctionSection(correctionName));
            const task = loadTables().then(tables => {
                if (panel.isConnected) render(panel, resolve(tables, input), correctionName);
            }).catch(() => {
                if (!panel.isConnected) return;
                panel.dataset.state = 'error';
                const retry = element('button', 'additional-effects-retry', '再読み込み');
                retry.type = 'button';
                retry.addEventListener('click', refresh);
                panel.replaceChildren(element('h3', 'additional-effects-title', 'ステータス'), element('p', 'additional-effects-note', '対応表を読み込めませんでした。'), retry, correctionSection(correctionName));
            }).finally(() => { if (panel.isConnected) onLayout(); });
            pending.set(panel, task);
            return task;
        }
        return refresh();
    }

    async function ready(container) {
        await Promise.all([...container.querySelectorAll('.additional-effects-panel')].map(panel => pending.get(panel)));
    }
    const api = { resolve, attach, ready, correction };
    root.StatusEffectsPanel = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
