/* Read-only additional effects; original records and existing card content stay intact. */
(function (root) {
    'use strict';
    const Summary = root.StatusSummary || (typeof require === 'function' ? require('./status-summary.js') : null);
    const CATEGORIES = ['antennas', 'heads', 'bodies', 'patterns', 'bodyColors'];
    let tablePromise;
    const pending = new WeakMap();

    function loadTables() {
        if (!tablePromise) {
            tablePromise = (async () => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 10000);
                try {
                    const response = await fetch('./status-effects.json?v=20260914-3', { signal: controller.signal });
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
        const aliases = { あか: '赤', みずいろ: '水色', みどり: '緑', だいだい: '橙', きいろ: '黄色', あお: '青', しろ: '白', むらさき: '紫', ぎん: '銀', きん: '金', もも: '桃', くろ: '黒' };
        name = aliases[name] || name;
        return name.replace(/^([濃薄]?)(黄|水)$/, '$1$2色');
    }

    function resolveColorCombination(tables, colors) {
        if (!Array.isArray(colors) || colors.length !== 2 || colors.some(name => typeof name !== 'string')) return null;
        const names = colors.map(colorName);
        const key = names.join('|');
        const overrides = tables.bodyColorCombinationOverrides;
        const override = overrides?.[key] || overrides?.[[names[1], names[0]].join('|')];
        let entry = tables.bodyColorCombinations?.[key] || null;
        const baseNames = names.map(name => name.replace(/^[濃薄]/, ''));
        // Same-color effects apply across different shades. The workbook's base|base row
        // is an effect reference, not a pair we create or substitute into the original record.
        if (names[0] !== names[1] && baseNames[0] === baseNames[1]
            && names.every(name => tables.bodyColors?.[name]?.sourceStatus === 'available')) {
            const referenceKey = baseNames.join('|');
            const reference = tables.bodyColorCombinations?.[referenceKey];
            if (reference?.sourceStatus === 'available') {
                entry = { ...reference, colors: names, sameColorBase: baseNames[0], effectReference: referenceKey };
            }
        }
        if (override?.coverage === 'element_resistances_only' && entry?.sourceStatus === 'available') {
            const replacedStats = new Set(override.effects.map(effect => effect.stat));
            return { ...entry, coverage: 'complete', overrideSource: override.source,
                effects: [...entry.effects.filter(effect => !replacedStats.has(effect.stat)), ...override.effects] };
        }
        return override || entry;
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
        const colorRows = [];
        for (let i = 0; i < count; i++) {
            colorRows.push(find('bodyColors', count === 1 ? '体色' : `体色${i + 1}`, '色', 11 + i, colors[i] || ''));
        }
        if (count > 1) {
            // IDs have already been resolved above. Never use text as a fallback for an unknown ID,
            // change the original shade names, or treat two stored colors as a complete three-color pattern.
            const entry = count === 2 && rows[3].entry?.colorCount !== 3
                && (!record || rows[3].entry?.colorCount === 2)
                && colorRows.every(row => row.entry?.sourceStatus === 'available')
                ? resolveColorCombination(tables, colorRows.map(row => row.name)) : null;
            rows.push({ category: 'bodyColorCombinations', label: '体色の組み合わせ',
                name: colorRows.map(row => row.name).join(' × '), entry });
            if (!entry) rows.push(...colorRows);
        } else {
            rows.push(...colorRows);
        }
        return rows;
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function correctionSection(name, showEffects = true) {
        const section = element('section', 'additional-effects-section additional-effects-correction');
        section.append(element('h4', 'additional-effects-heading', '補正'), element('p', 'additional-effects-ap', name));
        if (showEffects) {
            const definition = Summary.resolveCorrection(name);
            if (!definition.defined) section.append(element('p', 'additional-effects-note', '未定義・合計に未反映'));
            else if (definition.effects.length) {
                section.append(element('p', 'additional-effects-note', '合計に反映済み'));
                const list = element('ul', 'additional-effects-list');
                for (const effect of definition.effects) list.append(element('li', '', effect.sourceText));
                section.append(list);
            }
        }
        return section;
    }

    function render(panel, rows, correctionName) {
        const fragment = document.createDocumentFragment();
        fragment.append(element('h3', 'additional-effects-title', '内訳'));
        for (const { category, label, name, entry } of rows) {
            const section = element('section', 'additional-effects-section');
            const heading = element('h4', 'additional-effects-heading');
            heading.append(element('span', 'additional-effects-category', label), element('span', '', name));
            section.append(heading);
            if (!entry || entry.sourceStatus !== 'available') {
                const note = category === 'bodyColorCombinations'
                    ? '組み合わせの効果は未確認です。以下の個別効果は参考値です。'
                    : name === '情報なし' ? '情報なし' : '対応表にデータがありません';
                section.append(element('p', 'additional-effects-note', note));
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
            if (entry?.sameColorBase) section.append(element('p', 'additional-effects-note', '同色効果（濃淡共通）を反映しています。'));
            if (entry?.coverage === 'element_resistances_only') section.append(element('p', 'additional-effects-note', '属性耐性を合計に反映しています。その他の体色効果は未確認です。'));
            fragment.append(section);
        }
        fragment.append(correctionSection(correctionName));
        fragment.append(element('p', 'additional-effects-footnote', '体色は組み合わせ表の値です。各部位の効果は中央の合計に反映しています。未確認・参考値は除きます。'));
        panel.replaceChildren(fragment);
        panel.dataset.state = 'ready';
    }

    function resistanceGrid(title, entries, values, group, className) {
        const visible = entries.filter(([key]) => Number.isFinite(values[key]) && values[key] !== 0);
        if (!visible.length) return document.createDocumentFragment();
        const section = element('section', 'summary-resistances');
        section.append(element('h4', 'summary-section-title', title));
        const grid = element('div', 'summary-resistance-grid ' + className);
        for (const [key, label] of visible) {
            const item = element('div', 'summary-resistance');
            item.dataset.stat = key;
            item.dataset.value = String(values[key]);
            if (values[key] < 0) item.classList.add('is-negative');
            // No evasion-down artwork was supplied; keep the label and reserve the same space.
            if (label !== '回避ダウン') {
                const img = element('img', 'summary-resistance-icon');
                img.alt = '';
                img.width = img.height = 20;
                img.src = `assets/耐性画像/${group}/${label}.webp`;
                img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
                item.append(img);
            } else item.append(element('span', 'summary-resistance-icon'));
            item.append(element('span', 'summary-resistance-label', label), element('strong', 'summary-resistance-value', Summary.signed(values[key])));
            grid.append(item);
        }
        section.append(grid);
        return section;
    }

    function renderSummary(panel, rows, correctionName) {
        const total = Summary.calculate(rows, correctionName);
        const heading = element('div', 'summary-heading');
        if (total.unknown.length) heading.append(element('span', 'summary-partial', '既知分'));
        const antenna = element('div', 'summary-antenna');
        antenna.append(element('span', 'summary-stat-label', 'アンテナ'), element('strong', '', total.antennaName));
        const grid = element('dl', 'summary-stats');
        const values = [
            ['hp', 'HP', Summary.statText(total.stats.hp)], ['ap', 'AP', total.ap == null ? '未確認' : Summary.number(total.ap)],
            ['attack', 'こうげきりょく', Summary.statText(total.stats.attack)], ['defense', 'ぼうぎょりょく', Summary.statText(total.stats.defense)],
            ['speed', 'すばやさ', Summary.statText(total.stats.speed)], ['evasion', 'かいひりつ', total.evasion == null ? '未確認' : Summary.number(total.evasion) + '%']
        ];
        for (const [key, label, value] of values) {
            const row = element('div', 'summary-stat');
            row.dataset.stat = key;
            row.append(element('dt', 'summary-stat-label', label), element('dd', 'summary-stat-value', value));
            grid.append(row);
        }
        const fragment = document.createDocumentFragment();
        if (total.unknown.length) fragment.append(heading);
        fragment.append(antenna, grid);
        if (total.apRange) {
            const range = total.apRange.max === null ? '全レベル' : `Lv.${total.apRange.min}〜${total.apRange.max}`;
            fragment.append(element('p', 'summary-caption', `APの対応範囲：${range}`));
        }
        fragment.append(resistanceGrid('属性耐性', Summary.ELEMENTS, total.resistances, '属性耐性', 'summary-elements'));
        fragment.append(resistanceGrid('状態異常耐性', Summary.AILMENTS, total.resistances, '異常耐性', 'summary-ailments'));
        fragment.append(resistanceGrid('ジャック・ダウン耐性', [...Summary.OTHER_RESISTANCES, ...Summary.DOWNS], total.resistances, '異常耐性', 'summary-downs'));
        if (total.extras.length) {
            const extra = element('section', 'summary-resistances summary-other');
            extra.append(element('h4', 'summary-section-title', 'その他の効果'));
            for (const text of total.extras) extra.append(element('p', '', text));
            fragment.append(extra);
        }
        fragment.append(element('p', 'summary-caption', 'HP・攻撃・防御・素早さ：倍率 ＋ 実数補正'));
        if (total.unknown.length) fragment.append(element('p', 'summary-unknown', `未確認：${total.unknown.join('、')}。上の数値は確認できる効果のみの合計です。`));
        panel.replaceChildren(fragment);
        panel.dataset.state = 'ready';
        // Off-screen image.decode() may remain pending even after cached images have loaded.
        // Wait for loading instead, so restoring history never stalls export readiness.
        return Promise.all([...panel.querySelectorAll('img')].map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                const finish = () => {
                    clearTimeout(timer);
                    img.removeEventListener('load', finish);
                    img.removeEventListener('error', finish);
                    resolve();
                };
                const timer = setTimeout(finish, 8000);
                img.addEventListener('load', finish);
                img.addEventListener('error', finish);
            });
        }));
    }

    function attach(card, input, onLayout = () => {}) {
        if (!card.classList.contains('champion-card')) return Promise.resolve();
        const correctionName = correction(input.statusText, input.record).name;
        const original = element('div', 'champion-existing');
        // Move the actual elements, retaining their contents, canvases and listeners.
        original.append(...card.childNodes);
        const appearance = element('aside', 'champion-appearance');
        appearance.setAttribute('aria-label', '顔パーツ情報');
        appearance.append(element('h3', 'champion-appearance-title', '顔パーツ情報'));
        const appearanceStatus = original.querySelector('.status');
        appearance.append(appearanceStatus || element('p', 'additional-effects-note', '情報なし'));
        appearance.addEventListener('click', event => event.stopPropagation());
        const header = element('div', 'champion-portrait-header');
        const identity = element('div', 'champion-identity');
        const colors = element('div', 'champion-color-details');
        identity.append(original.querySelector('.name'), original.querySelector('.face-preview-container'));
        const palette = original.querySelector('.custom-color-palette');
        if (palette.querySelector('.palette-color-box')) {
            palette.prepend(element('span', 'body-color-label', '体色'));
        }
        colors.append(original.querySelector('.color-info-container'), palette);
        header.append(identity, colors);
        const birthCount = original.querySelector('.birth-count-label');
        if (birthCount) birthCount.after(header);
        else original.prepend(header);
        const summary = element('section', 'champion-status-summary');
        summary.setAttribute('aria-label', 'ステータス合計');
        summary.addEventListener('click', event => event.stopPropagation());
        header.after(summary);
        const panel = element('aside', 'additional-effects-panel');
        panel.setAttribute('aria-label', 'ステータスの内訳');
        panel.addEventListener('click', event => event.stopPropagation());
        card.append(appearance, original, panel);
        card.classList.add('has-additional-effects');

        function refresh() {
            panel.dataset.state = 'loading';
            panel.replaceChildren(element('h3', 'additional-effects-title', '内訳'), element('p', 'additional-effects-note', '読み込み中…'), correctionSection(correctionName));
            summary.dataset.state = 'loading';
            summary.replaceChildren(element('p', 'summary-caption', '読み込み中…'));
            const task = loadTables().then(tables => {
                if (!panel.isConnected) return;
                const rows = resolve(tables, input);
                render(panel, rows, correctionName);
                return renderSummary(summary, rows, correctionName);
            }).catch(() => {
                if (!panel.isConnected) return;
                panel.dataset.state = 'error';
                const retry = element('button', 'additional-effects-retry', '再読み込み');
                retry.type = 'button';
                retry.addEventListener('click', refresh);
                panel.replaceChildren(element('h3', 'additional-effects-title', '内訳'), element('p', 'additional-effects-note', '対応表を読み込めませんでした。'), retry, correctionSection(correctionName));
                summary.dataset.state = 'error';
                summary.replaceChildren(element('p', 'summary-caption', '対応表を読み込めませんでした。右の「再読み込み」で再試行できます。'));
            }).finally(() => { if (panel.isConnected) onLayout(); });
            pending.set(panel, task);
            return task;
        }
        return refresh();
    }

    async function ready(container) {
        await Promise.all([...container.querySelectorAll('.additional-effects-panel')].map(panel => pending.get(panel)));
    }
    const api = { resolve, resolveColorCombination, attach, ready, correction };
    root.StatusEffectsPanel = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
