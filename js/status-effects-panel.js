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
        // Different colors always use the sum of the single-color entries, including shades.
        // Keep the workbook rows intact as source data; only same-color pairs use their special effects.
        const individual = names.map(name => tables.bodyColors?.[name]);
        if (baseNames[0] !== baseNames[1]
            && individual.every(color => color?.sourceStatus === 'available' && Array.isArray(color.effects))) {
            const summed = new Map();
            const other = [];
            for (const color of individual) for (const effect of color.effects) {
                if (effect.operation !== 'add' || !Number.isFinite(effect.value)) { other.push({ ...effect }); continue; }
                const effectKey = JSON.stringify([effect.stat, effect.unit, effect.condition]);
                const previous = summed.get(effectKey);
                if (previous) previous.value += effect.value;
                else summed.set(effectKey, { ...effect });
            }
            const effects = [...summed.values()].filter(effect => effect.value !== 0).map(effect => ({
                ...effect, sourceText: effect.sourceText.replace(/[+-]?\d+(?:\.\d+)?(%?)$/, (_, suffix) => Summary.signed(effect.value) + suffix)
            }));
            return { colors: names, sourceStatus: 'available', kind: 'pair', coverage: 'complete',
                derivation: 'single_color_sum', effects: [...effects, ...other] };
        }
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

    function resolve(tables, { statusText = '', record = null, spColor = false } = {}) {
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
        if (spColor && singleColor && colorRows[0]?.entry?.sourceStatus === 'available') {
            const color = colorRows[0];
            const base = colorName(color.name).replace(/^[濃薄]/, '');
            color.excludedFromTotals = true;
            rows.push({ category: 'spColors', label: 'SPカラー効果', name: color.name,
                entry: tables.bodyColorCombinations?.[base + '|SP'] || null });
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
        const heading = element('h4', 'additional-effects-heading');
        heading.append(element('span', 'additional-effects-category', '補正'), element('span', '', name));
        section.append(heading);
        if (showEffects) {
            const definition = Summary.resolveCorrection(name);
            if (!definition.defined) section.append(element('p', 'additional-effects-note', '未定義・合計に未反映'));
            else if (definition.effects.length) {
                section.append(effectList(definition.effects));
            }
        }
        return section;
    }

    // Presentation only: retain the original effects for totals and source data.
    const RESISTANCE_GROUPS = [
        ['element_resistance', '全属性耐性', Summary.ELEMENTS],
        ['status_resistance', '状態異常耐性', Summary.AILMENTS],
        ['down_resistance', 'ダウン耐性', Summary.DOWNS]
    ];
    function cleanEffectText(text) {
        return String(text || '').replaceAll('（同じ耐性には1回のみ）', '').trim();
    }
    function breakdownEffects(effects) {
        const replacements = new Map();
        const hidden = new Set();
        for (const [stat, label, entries] of RESISTANCE_GROUPS) {
            const members = effects.filter(effect => entries.some(([key]) => key === effect.stat));
            const first = members[0];
            if (members.length !== entries.length || new Set(members.map(effect => effect.stat)).size !== entries.length
                || !Number.isFinite(first.value) || first.value === 0
                || !members.every(effect => effect.operation === 'add' && !effect.condition
                    && effect.value === first.value && effect.unit === first.unit)) continue;
            replacements.set(first, { ...first, stat, sourceText: `${label} ${Summary.signed(first.value)}`, children: members });
            members.slice(1).forEach(effect => hidden.add(effect));
        }
        return effects.filter(effect => !hidden.has(effect)).map(effect => {
            if (replacements.has(effect)) return replacements.get(effect);
            const group = RESISTANCE_GROUPS.find(([stat]) => stat === effect.stat);
            if (group && effect.operation === 'add' && !effect.condition && Number.isFinite(effect.value)) {
                return { ...effect, children: group[2].map(([stat, label]) => ({ ...effect, stat,
                    sourceText: `${label}耐性 ${Summary.signed(effect.value)}` })) };
            }
            return effect;
        });
    }
    function breakdownEffectTexts(effects) {
        return breakdownEffects(effects).map(effect => cleanEffectText(effect.sourceText));
    }
    function resistanceIcon(label, group) {
        // Reuse exactly the same assets and missing-artwork handling in both columns.
        if (label === '回避ダウン') return element('span', 'summary-resistance-icon');
        const img = element('img', 'summary-resistance-icon');
        img.alt = '';
        img.width = img.height = 20;
        img.src = `assets/耐性画像/${group}/${label}.webp`;
        img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
        return img;
    }
    function effectContent(effect) {
        const row = element('span', 'additional-effect-row');
        if (effect.stat) row.dataset.stat = effect.stat;
        const elementEntry = Summary.ELEMENTS.find(([key]) => key === effect.stat);
        const ailmentEntry = [...Summary.AILMENTS, ...Summary.DOWNS, ...Summary.OTHER_RESISTANCES].find(([key]) => key === effect.stat);
        if (elementEntry || ailmentEntry) row.append(resistanceIcon((elementEntry || ailmentEntry)[1], elementEntry ? '属性耐性' : '異常耐性'));
        const text = cleanEffectText(effect.sourceText)
            .replaceAll('ぞくせいたいせい', '属性耐性')
            .replaceAll('いじょうたいせい', '状態異常耐性')
            .replaceAll('たいせい', '耐性');
        const value = text.match(/[+＋\-−－]\s*\d+(?:\.\d+)?[%％]?/);
        if (value) {
            row.append(element('span', 'additional-effect-label', effect.stat === 'charm_resistance' ? 'ゆうわく耐性' : text.slice(0, value.index).trim()));
            const negative = /^[\-−－]/.test(value[0]);
            row.append(element('strong', `additional-effect-value ${negative ? 'is-negative' : 'is-positive'}`, value[0]));
            if (value.index + value[0].length < text.length) row.append(element('span', '', text.slice(value.index + value[0].length)));
        } else row.append(element('span', 'additional-effect-label', text));
        return row;
    }
    function effectList(effects, rows = []) {
        const list = element('ul', 'additional-effects-list');
        for (const effect of breakdownEffects(effects)) {
            const targets = Summary.resolveBodyColorEffect(effect, rows);
            if (targets?.length === 0) continue;
            const item = element('li');
            if (targets !== undefined) {
                if (targets === null) item.append(element('span', 'additional-effects-note', '対象の耐性は未確認'));
                else for (const [stat, label] of targets) {
                    item.append(effectContent({ ...effect, stat, sourceText: `${label}耐性 ${Summary.signed(effect.value)}` }));
                }
                const source = effect.stat === 'element_resistance' ? '体色の属性耐性' : '体色の状態異常耐性';
                item.append(element('p', 'additional-effect-source', `（${source}${Summary.signed(effect.value)}）`));
            } else if (effect.children) {
                const details = element('details', 'additional-effect-group');
                const summary = element('summary');
                summary.append(effectContent(effect));
                const children = element('ul', 'additional-effects-list additional-effect-children');
                for (const child of effect.children) {
                    const line = element('li');
                    line.append(effectContent(child));
                    children.append(line);
                }
                details.append(summary, children);
                item.append(details);
            } else item.append(effectContent(effect));
            list.append(item);
        }
        return list;
    }

    function panelHeading(panel) {
        const heading = element('h3', 'additional-effects-title');
        const button = element('button', 'additional-effects-toggle', '内訳');
        button.type = 'button';
        button.setAttribute('aria-expanded', String(panel.dataset.detailsOpen !== 'false'));
        button.addEventListener('click', () => {
            panel.dataset.detailsOpen = String(panel.dataset.detailsOpen === 'false');
            button.setAttribute('aria-expanded', panel.dataset.detailsOpen);
            panel.dispatchEvent(new CustomEvent('breakdown-layout-change'));
        });
        heading.append(button);
        return heading;
    }

    function categoryImage(category, name) {
        const renderer = root.DenpamenFaceRenderer;
        const config = { antennas: ['antennas', 'アンテナ画像'], heads: ['heads', '頭画像'], patterns: ['patterns', '色・柄情報/柄画像'] }[category];
        if (!config || !renderer?.[config[0]]?.includes(name)) return null;
        const img = element('img', 'additional-effects-category-image');
        img.alt = '';
        img.width = img.height = 32;
        img.src = `assets/${config[1]}/${encodeURIComponent(name)}.png`;
        img.addEventListener('error', () => { img.closest('h4')?.classList.remove('has-category-image'); img.remove(); }, { once: true });
        return img;
    }

    function render(panel, rows, correctionName) {
        const fragment = document.createDocumentFragment();
        fragment.append(panelHeading(panel));
        for (const { category, label, name, entry, excludedFromTotals } of rows) {
            if (excludedFromTotals) continue;
            const section = element('section', 'additional-effects-section');
            section.dataset.category = category;
            const heading = element('h4', 'additional-effects-heading');
            heading.append(element('span', 'additional-effects-category', category === 'spColors' ? '体色' : label),
                element('span', '', category === 'spColors' ? `${name}(SPカラー)` : name));
            const icon = categoryImage(category, name);
            if (icon) {
                heading.classList.add('has-category-image');
                heading.children[0].after(icon);
            }
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
                    section.append(effectList(entry.effects, rows));
                }
            }
            if (entry?.derivation === 'single_color_sum') section.append(element('p', 'additional-effects-note', 'それぞれの体色の効果を合算しています。'));
            if (entry?.coverage === 'element_resistances_only') section.append(element('p', 'additional-effects-note', '属性耐性を合計に反映しています。その他の体色効果は未確認です。'));
            fragment.append(section);
        }
        fragment.append(correctionSection(correctionName));
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
            item.append(resistanceIcon(label, group));
            item.append(element('span', 'summary-resistance-label', label), element('strong', 'summary-resistance-value', Summary.signed(values[key])));
            grid.append(item);
        }
        section.append(grid);
        return section;
    }

    function renderSummary(panel, rows, correctionName, traits) {
        const total = Summary.calculate(rows, correctionName);
        const heading = element('div', 'summary-heading');
        if (total.unknown.length) heading.append(element('span', 'summary-partial', '既知分'));
        const antenna = element('div', 'summary-antenna');
        antenna.append(element('span', 'summary-stat-label', 'アンテナ'), element('strong', '', total.antennaName));
        traits.replaceChildren(antenna);
        for (const [category, label] of [['bodies', '体格'], ['heads', '頭'], ['patterns', '柄'], ['correction', '補正']]) {
            const name = category === 'correction' ? correctionName : rows.find(row => row.category === category)?.name;
            const row = element('div', 'summary-trait');
            row.append(element('span', 'summary-stat-label', label), element('strong', '', name || '情報なし'));
            traits.append(row);
        }
        const grid = element('dl', 'summary-stats');
        const values = [
            ['hp', 'HP', total.stats.hp.flat], ['ap', 'AP', total.ap],
            ['attack', 'こうげきりょく', total.stats.attack.flat], ['defense', 'ぼうぎょりょく', total.stats.defense.flat],
            ['speed', 'すばやさ', total.stats.speed.flat], ['evasion', 'かいひりつ', total.evasion, '%']
        ];
        for (const [key, label, value, suffix = ''] of values) {
            const row = element('div', 'summary-stat');
            row.dataset.stat = key;
            const display = element('dd', 'summary-stat-value', value == null ? '未確認' : Summary.signed(value) + suffix);
            if (value > 0) display.classList.add('is-positive');
            if (value < 0) display.classList.add('is-negative');
            row.append(element('dt', 'summary-stat-label', label), display);
            grid.append(row);
        }
        const fragment = document.createDocumentFragment();
        if (total.unknown.length) fragment.append(heading);
        fragment.append(element('h3', 'summary-additional-title', '合計追加ステータス'), grid);
        fragment.append(resistanceGrid('属性耐性', Summary.ELEMENTS, total.resistances, '属性耐性', 'summary-elements'));
        fragment.append(resistanceGrid('状態異常耐性', Summary.AILMENTS, total.resistances, '異常耐性', 'summary-ailments'));
        fragment.append(resistanceGrid('その他の耐性', [...Summary.OTHER_RESISTANCES, ...Summary.DOWNS], total.resistances, '異常耐性', 'summary-downs'));
        if (total.extras.length) {
            const extra = element('section', 'summary-resistances summary-other');
            extra.append(element('h4', 'summary-section-title', 'その他の効果'));
            for (const text of total.extras) {
                const line = element('p');
                line.append(effectContent({ sourceText: text }));
                extra.append(line);
            }
            fragment.append(extra);
        }
        if (total.unknown.length) fragment.append(element('p', 'summary-unknown', `未確認：${total.unknown.join('、')}。上の数値は確認できる効果のみの合計です。`));
        panel.replaceChildren(fragment);
        panel.dataset.state = 'ready';
        // Off-screen image.decode() may remain pending even after cached images have loaded.
        // Wait for loading instead, so restoring history never stalls export readiness.
        return Promise.all([...panel.closest('.champion-card').querySelectorAll('.champion-status-summary img, .additional-effects-panel img')].map(img => {
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
        if (appearanceStatus) {
            const lines = appearanceStatus.textContent.split('\n');
            appearanceStatus.replaceChildren();
            lines.forEach((line, index) => {
                if (index) appearanceStatus.append(document.createTextNode('\n'));
                appearanceStatus.append(element('span', 'appearance-part', line));
            });
        }
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
        const details = element('div', 'champion-details-header');
        const traits = element('section', 'summary-traits');
        traits.setAttribute('aria-label', '個体の基本情報');
        details.append(traits, appearance);
        header.after(details);
        const summary = element('section', 'champion-status-summary');
        summary.setAttribute('aria-label', 'ステータス合計');
        summary.addEventListener('click', event => event.stopPropagation());
        details.after(summary);
        const panel = element('aside', 'additional-effects-panel');
        panel.dataset.detailsOpen = 'true';
        panel.setAttribute('aria-label', 'ステータスの内訳');
        panel.addEventListener('breakdown-layout-change', onLayout);
        panel.addEventListener('click', event => event.stopPropagation());
        panel.addEventListener('toggle', event => {
            if (event.target.classList.contains('additional-effect-group')) onLayout();
        }, true);
        card.append(original, panel);
        card.classList.add('has-additional-effects');

        let spColor = false;
        let renderVersion = 0;
        card.addEventListener('sp-color-change', event => {
            spColor = event.detail.enabled === true;
            refresh();
        });
        function refresh() {
            const version = ++renderVersion;
            panel.dataset.state = 'loading';
            panel.replaceChildren(panelHeading(panel), element('p', 'additional-effects-note', '読み込み中…'), correctionSection(correctionName));
            summary.dataset.state = 'loading';
            traits.replaceChildren(element('p', 'summary-caption', '読み込み中…'));
            summary.replaceChildren(element('p', 'summary-caption', '読み込み中…'));
            const task = loadTables().then(tables => {
                if (!panel.isConnected || version !== renderVersion) return;
                const rows = resolve(tables, { ...input, spColor });
                render(panel, rows, correctionName);
                return renderSummary(summary, rows, correctionName, traits);
            }).catch(() => {
                if (!panel.isConnected || version !== renderVersion) return;
                panel.dataset.state = 'error';
                const retry = element('button', 'additional-effects-retry', '再読み込み');
                retry.type = 'button';
                retry.addEventListener('click', refresh);
                panel.replaceChildren(panelHeading(panel), element('p', 'additional-effects-note', '対応表を読み込めませんでした。'), retry, correctionSection(correctionName));
                summary.dataset.state = 'error';
                traits.replaceChildren(element('p', 'summary-caption', '基本情報を読み込めませんでした。'));
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
    const api = { resolve, resolveColorCombination, attach, ready, correction, breakdownEffectTexts, breakdownEffects };
    root.StatusEffectsPanel = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
