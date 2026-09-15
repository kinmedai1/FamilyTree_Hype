/* Final-card totals. Source records and status-effects.json are never modified. */
(function (root) {
    'use strict';

    const ELEMENTS = [
        ['fire_resistance', '火'], ['ice_resistance', '氷'], ['wind_resistance', '風'], ['earth_resistance', '土'],
        ['electric_resistance', '雷'], ['water_resistance', '水'], ['light_resistance', '光'], ['dark_resistance', '闇']
    ];
    // 2026-09-14: user-confirmed targets of 状態異常耐性. Jack and downs are separate.
    const AILMENTS = [
        ['poison_resistance', 'どく'], ['burn_resistance', 'やけど'], ['frostbite_resistance', 'しもやけ'],
        ['cold_resistance', 'かぜっぴき'], ['mud_resistance', 'どろだらけ'], ['shock_resistance', 'かんでん'],
        ['wet_resistance', 'みずびたし'], ['blind_resistance', 'ブラインド'], ['curse_resistance', 'のろい'],
        ['instant_death_resistance', 'とつぜんし'], ['paralysis_resistance', 'マヒ'], ['sleep_resistance', 'ねむり'],
        ['charm_resistance', 'みりょう'], ['fear_resistance', 'きょうふ'], ['seal_resistance', 'ふういん'],
        ['immobility_resistance', 'うごけない']
    ];
    const DOWNS = [
        ['stat_down_resistance', 'ステータスダウン'], ['evasion_down_resistance', '回避ダウン'],
        ['speed_down_resistance', '素早さダウン'], ['defense_down_resistance', '防御ダウン'],
        ['attack_down_resistance', '攻撃ダウン']
    ];
    const OTHER_RESISTANCES = [['jack_resistance', 'ジャック']];
    const add = (stat, value, sourceText, unit = 'source_unspecified') => ({ stat, value, sourceText, unit, operation: 'add' });

    // IMPLEMENTED CORRECTIONS: exact names, not guessed substring parsing.
    // Add a definition here to support another correction in both totals and the breakdown.
    const CORRECTIONS = {
        'なし': [],
        '急所5補正': [add('critical_hit', 5, 'きゅうしょづき +5%', 'percent_points')],
        '誘惑3補正': [add('charm', 3, 'ゆうわく +3%', 'percent_points')],
        '恐怖3補正': [add('fear', 3, 'きょうふ +3%', 'percent_points')],
        'HP12突2補正': [add('max_hp', 12, 'HP +12'), add('instant_death_resistance', 2, 'とつぜんし耐性 +2')],
        'HP50補正': [add('max_hp', 50, 'HP +50')],
        'HP30攻25補正': [add('max_hp', 30, 'HP +30'), add('attack', 25, '攻撃力 +25')],
        '防25回避3補正': [add('defense', 25, '防御力 +25'), add('evasion', 3, '回避率 +3%', 'percent_points')],
        'AP1補正': [add('max_ap', 1, 'AP +1')],
        'S20補正': [add('speed', 20, '素早さ +20')],
        'S25補正': [add('speed', 25, '素早さ +25')],
        'S50補正': [add('speed', 50, '素早さ +50')],
        'S90補正': [add('speed', 90, '素早さ +90')],
        '回避5補正': [add('evasion', 5, '回避率 +5%', 'percent_points')],
        '誘惑耐性1補正': [add('charm_resistance', 1, 'みりょう耐性 +1')],
        '恐怖耐性1補正': [add('fear_resistance', 1, 'きょうふ耐性 +1')],
        'ダウン耐性1補正': [add('down_resistance', 1, 'ダウン耐性 +1')],
        '水耐性+1 / みずびたし耐性+2補正': [add('water_resistance', 1, '水耐性 +1'), add('wet_resistance', 2, 'みずびたし耐性 +2')],
        '闇耐性+1 / 火耐性+1 / のろい耐性+1 / やけど耐性+1補正': [
            add('dark_resistance', 1, '闇耐性 +1'), add('fire_resistance', 1, '火耐性 +1'),
            add('curse_resistance', 1, 'のろい耐性 +1'), add('burn_resistance', 1, 'やけど耐性 +1')
        ]
    };
    // Intentionally not inferred. Display the original name and mark totals as known portions.
    const UNDEFINED_CORRECTIONS = ['HP30突恐補正'];

    function resolveCorrection(name) {
        const key = String(name).replace(/\s*\/\s*/g, ' / ');
        return { name, defined: Object.hasOwn(CORRECTIONS, key), effects: CORRECTIONS[key] || [] };
    }

    function calculate(rows, correctionName) {
        const correction = resolveCorrection(correctionName);
        const unknown = [];
        const totals = {};
        const scales = {};
        const extras = new Map();
        const colorBase = {};
        const combination = rows.find(row => row.category === 'bodyColorCombinations');
        const spColor = rows.find(row => row.category === 'spColors');
        const colorRows = spColor ? [spColor] : combination ? [combination] : rows.filter(row => row.category === 'bodyColors');
        const colorKnown = colorRows.length > 0 && colorRows.every(row => row.entry?.sourceStatus === 'available' && Array.isArray(row.entry.effects));
        if (!colorKnown) unknown.push('体色の効果');
        if (combination?.entry?.coverage === 'element_resistances_only') unknown.push('体色の属性耐性以外の効果');
        if (colorKnown) {
            for (const row of colorRows) for (const effect of row.entry.effects) {
                if (effect.operation === 'add' && [...ELEMENTS, ...AILMENTS].some(([stat]) => stat === effect.stat)) {
                    colorBase[effect.stat] = (colorBase[effect.stat] || 0) + effect.value;
                }
            }
        }
        const effects = [];
        for (const row of rows) {
            if (row.excludedFromTotals) continue;
            // Resolved pairs already include the mixed-color sum or the same-color special effect.
            // Unknown IDs and incomplete three-color data must not be counted via reference rows.
            if (combination && row.category === 'bodyColors') continue;
            if (row.category === 'bodies' || row.category === 'antennas') continue;
            if (row.entry?.sourceStatus === 'available' && Array.isArray(row.entry.effects)) effects.push(...row.entry.effects);
            else if (!['bodyColors', 'bodyColorCombinations'].includes(row.category)) unknown.push(row.label + 'の効果');
        }
        if (!correction.defined) unknown.push('補正「' + correctionName + '」');
        effects.push(...correction.effects);
        for (const effect of effects) {
            const { stat, value, operation } = effect;
            if (operation === 'presence') {
                if (value) extras.set(effect.sourceText, effect.sourceText);
                continue;
            }
            if (!Number.isFinite(value)) continue;
            if (operation === 'scale_percent') {
                scales[stat] = (scales[stat] ?? 1) * value / 100;
                continue;
            }
            if (operation !== 'add') continue;
            let targets = [stat];
            if (stat === 'element_resistance') {
                if (effect.condition === 'positive_element_resistances_only') {
                    if (!colorKnown) { unknown.push('星の適用先'); continue; }
                    targets = ELEMENTS.filter(([key]) => (colorBase[key] || 0) > 0).map(([key]) => key);
                } else targets = ELEMENTS.map(([key]) => key);
            } else if (stat === 'status_resistance') {
                if (effect.condition === 'body_color_status_resistances_only') {
                    if (!colorKnown || combination?.entry?.coverage === 'element_resistances_only') {
                        unknown.push('花の適用先');
                        continue;
                    }
                    // Select each color-derived resistance once, including same-color shade pairs.
                    targets = AILMENTS.filter(([key]) => (colorBase[key] || 0) > 0).map(([key]) => key);
                } else targets = AILMENTS.map(([key]) => key);
            }
            else if (stat === 'down_resistance') targets = DOWNS.map(([key]) => key);
            for (const key of targets) totals[key] = (totals[key] || 0) + value;
        }
        const body = rows.find(row => row.category === 'bodies')?.entry;
        const stats = {};
        for (const [key, effectKey] of [['hp', 'max_hp'], ['attack', 'attack'], ['defense', 'defense'], ['speed', 'speed']]) {
            const multiplier = body?.multipliersPercent?.[key];
            stats[key] = { percent: multiplier == null ? null : multiplier * (scales[effectKey] ?? 1), flat: totals[effectKey] || 0 };
        }
        if (!body || body.sourceStatus !== 'available') unknown.push('体格');
        const antenna = rows.find(row => row.category === 'antennas');
        const apRange = antenna?.entry?.apLevelRange;
        const resistances = {};
        for (const [key] of [...ELEMENTS, ...AILMENTS, ...OTHER_RESISTANCES, ...DOWNS]) resistances[key] = totals[key] || 0;
        for (const [key, label, suffix] of [['gold', 'ゴールド', '%'], ['charm', 'ゆうわく', '%'], ['fear', 'きょうふ', '%'], ['critical_hit', 'きゅうしょづき', '%']]) {
            if (totals[key]) extras.set(key, `${label} ${signed(totals[key])}${suffix}`);
        }
        return {
            stats, resistances, correction, unknown: [...new Set(unknown)],
            evasion: totals.evasion || 0,
            ap: totals.max_ap || 0,
            apRange, antennaName: antenna?.name || '情報なし', extras: [...extras.values()]
        };
    }
    function number(value) { return Number(value.toFixed(6)).toString(); }
    function signed(value) { return value > 0 ? `+${number(value)}` : number(value); }
    function statText(stat) { return `${stat.percent == null ? '未確認' : number(stat.percent) + '%'} ${stat.flat < 0 ? '−' : '＋'} ${number(Math.abs(stat.flat))}`; }

    const api = { ELEMENTS, AILMENTS, DOWNS, OTHER_RESISTANCES, CORRECTIONS, UNDEFINED_CORRECTIONS, resolveCorrection, calculate, number, signed, statText };
    root.StatusSummary = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
