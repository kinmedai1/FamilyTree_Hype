/* Exact, occurrence-based breeding scheduler. Shared by Worker and Node tests. */
(function (root) {
    'use strict';
    const VERSION = 1;
    const isQR = value => typeof value === 'string' && /^[A-Za-z0-9]{6}_?$/.test(value);
    const fail = text => { throw new Error(text); };
    const resident = value => value === 1 || value === 2;

    function model(tree, records = []) {
        const byRecord = new Map(records.map(r => [r.sourceIndex, r]));
        const nodes = [], path = new Set();
        function visit(raw, parent = -1, side = -1, depth = 0) {
            if (!raw || path.has(raw) || depth > 128 || nodes.length >= 4096) fail('育成対象の家系図が不正、または大きすぎます。');
            const children = raw.participants || [];
            if (children.length !== 0 && children.length !== 2) fail('出生には先・後の2個体が必要です。');
            const id = nodes.length, r = byRecord.get(raw.sourceIndex);
            const rsid = isQR(raw.originalId || raw.id) ? raw.originalId || raw.id : '';
            const node = { id, parent, side, children: [], name: String(raw.name || '名称不明'),
                uniqueId: raw.uniqueId || '', rsid, group: rsid ? rsid.slice(0, 6) : '',
                face: raw.faceStatusText || (r?.appearanceComplete ? r.statusText : '') || '', record: r };
            nodes.push(node); path.add(raw);
            node.children = children.map((child, i) => visit(child, id, i, depth + 1));
            path.delete(raw);
            return id;
        }
        visit(tree);
        // Union aliases: QR identity, source record, equal stored individuals and
        // recursively equal ordered parents. Occurrences themselves are NEVER merged.
        const sets = nodes.map((_, i) => i);
        function find(i) { while (sets[i] !== i) { sets[i] = sets[sets[i]]; i = sets[i]; } return i; }
        function join(a, b) { a = find(a); b = find(b); if (a === b) return false; sets[Math.max(a, b)] = Math.min(a, b); return true; }
        const aliases = new Map();
        function alias(key, id) { if (aliases.has(key)) return join(id, aliases.get(key)); aliases.set(key, id); return false; }
        for (const n of nodes) {
            if (n.rsid) alias('qr:' + n.rsid, n.id);
            const r = n.record;
            if (r) {
                alias('record:' + r.sourceIndex, n.id);
                // Birth count and file/ancestry references are not individual identity.
                if (Array.isArray(r.data) && r.data.length === 26) {
                    alias('person:' + JSON.stringify([r.data.slice(0, 25), r.ability1, r.ability2, r.personal_type]), n.id);
                }
            }
        }
        let changed;
        do {
            changed = false;
            const births = new Map();
            for (const n of [...nodes].reverse()) if (n.children.length) {
                const key = n.children.map(find).join(',');
                if (births.has(key)) changed = join(n.id, births.get(key)) || changed;
                else births.set(key, n.id);
            }
        } while (changed);
        const counts = new Map(), groups = new Map();
        for (const n of nodes) {
            n.identity = find(n.id);
            counts.set(n.identity, (counts.get(n.identity) || 0) + 1);
            if (n.group) groups.set(n.group, (groups.get(n.group) || 0) + 1);
            delete n.record;
        }
        for (const n of nodes) n.safe = counts.get(n.identity) === 1 && (!n.group || groups.get(n.group) === 1);
        function tail(id) {
            const n = nodes[id];
            if (n.tail !== undefined) return n.tail;
            if (!id) return n.tail = 0;
            const p = nodes[n.parent], successors = [];
            if (p.id) successors.push(p.id);
            if (p.side === 0) successors.push(nodes[p.parent].children[1]);
            return n.tail = 1 + Math.max(0, ...successors.map(tail));
        }
        nodes.forEach(n => tail(n.id));
        const fingerprint = JSON.stringify(nodes.map(n => [n.parent, n.side, n.identity, n.rsid, n.name]));
        return { version: VERSION, nodes, fingerprint };
    }

    function initial(m) { return m.nodes.map(() => 0); }
    function admissionAllowed(m, state, id) {
        const n = m.nodes[id];
        return !state[id] && (n.side !== 1 || resident(state[m.nodes[n.parent].children[0]])) &&
            !m.nodes.some(other => resident(state[other.id]) && other.identity === n.identity);
    }
    function birthAllowed(m, state, id) {
        const n = m.nodes[id];
        return n.children.length === 2 && admissionAllowed(m, state, id) && n.children.every(p => state[p] === 2);
    }
    function captureAllowed(m, state, id, openGroup = '') {
        const n = m.nodes[id];
        return !n.children.length && admissionAllowed(m, state, id) &&
            (!n.group || n.group === openGroup || !m.nodes.some(other => other.group === n.group && resident(state[other.id])));
    }
    function apply(m, before, action, slots) {
        const state = before.slice();
        if (!action || !Array.isArray(action.ids) || !action.ids.length || new Set(action.ids).size !== action.ids.length ||
            action.ids.some(id => !Number.isInteger(id) || !m.nodes[id])) fail('育成手順に不正な個体が含まれています。');
        const ids = action.ids;
        if (action.type === 'capture') {
            if (ids.length > 2) fail('QRキャッチの人数が不正です。');
            const group = m.nodes[ids[0]].group;
            if (ids.length === 2 && (!group || m.nodes[ids[1]].group !== group)) fail('同時キャッチするQRが一致しません。');
            ids.forEach((id, i) => {
                if (!captureAllowed(m, state, id, i ? group : '')) fail('入居順、同一個体、または同じQRの入居制限に反しています。');
                state[id] = 1;
            });
        } else if (action.type === 'birth') {
            if (ids.length !== 1 || !birthAllowed(m, state, ids[0])) fail('出生条件または入居順を満たしていません。');
            m.nodes[ids[0]].children.forEach(id => { state[id] = 3; });
            state[ids[0]] = 1;
        } else if (action.type === 'train') {
            if (!Number.isSafeInteger(slots) || slots < 1 || ids.length > slots || ids.some(id => id === 0 || state[id] !== 1)) fail('育成対象または育成枠が不正です。');
            ids.forEach(id => { state[id] = 2; });
        } else fail('未対応の育成操作です。');
        return state;
    }
    function replay(m, actions, slots, start = initial(m)) {
        return actions.reduce((state, action) => apply(m, state, action, slots), start);
    }
    function actions(m, state, onlySafe = false) {
        const result = [];
        for (const n of m.nodes) {
            if (state[n.id] || (onlySafe && !n.safe)) continue;
            if (birthAllowed(m, state, n.id)) result.push({ type: 'birth', ids: [n.id] });
            else if (captureAllowed(m, state, n.id)) {
                result.push({ type: 'capture', ids: [n.id] });
                if (!onlySafe && n.group) {
                    const after = state.slice(); after[n.id] = 1;
                    for (const other of m.nodes) if (other.id !== n.id && other.group === n.group && captureAllowed(m, after, other.id, n.group)) {
                        result.push({ type: 'capture', ids: [n.id, other.id] });
                    }
                }
            }
        }
        // Births free identities. A shared QR is captured together where possible.
        return result.sort((a, b) => (b.type === 'birth') - (a.type === 'birth') || b.ids.length - a.ids.length || a.ids[0] - b.ids[0]);
    }
    function closure(m, before) {
        let state = before, steps = [], available;
        while ((available = actions(m, state, true)).length) {
            const action = available[0];
            state = apply(m, state, action); steps.push(action);
        }
        return { state, steps };
    }
    // Admissible bound: all remaining training work / slots, plus the longest
    // dependency chain including first-parent admission -> second-parent admission.
    function lowerBound(m, state, slots) {
        const births = [], finishes = [];
        function born(id) {
            if (state[id]) return 0;
            if (births[id] !== undefined) return births[id];
            const n = m.nodes[id];
            return births[id] = Math.max(0, ...n.children.map(finish), n.side === 1 ? born(m.nodes[n.parent].children[0]) : 0);
        }
        function finish(id) {
            if (state[id] >= 2) return 0;
            return finishes[id] ?? (finishes[id] = born(id) + 1);
        }
        const work = state.filter((value, id) => id !== 0 && value < 2).length;
        let bound = Math.max(Math.ceil(work / slots), born(0));
        // Every task with a tail of k must finish at least k-1 trips before
        // the end. Count these deadlines to prove capacity-based lower bounds.
        const tails = m.nodes.filter(n => n.id && state[n.id] < 2).map(n => n.tail).sort((a, b) => b - a);
        tails.forEach((tail, i) => { bound = Math.max(bound, Math.ceil((i + 1) / slots) + tail - 1); });
        return bound;
    }
    function* combinations(values, size, chosen = [], start = 0) {
        if (!size) { yield chosen.slice(); return; }
        for (let i = start; i <= values.length - size; i++) {
            chosen.push(values[i]); yield* combinations(values, size - 1, chosen, i + 1); chosen.pop();
        }
    }
    function solve(m, slots, options = {}) {
        if (!Number.isSafeInteger(slots) || slots < 1) fail('育成枠は1以上の整数にしてください。');
        const start = options.start || initial(m);
        if (!Array.isArray(start) || start.length !== m.nodes.length || start.some(v => ![0, 1, 2, 3].includes(v))) fail('育成進捗が不正です。');
        const started = Date.now(), maxMs = options.maxMs ?? 30000, maxStates = options.maxStates ?? 1000000;
        if (m.nodes.some(n => !start[n.id] && n.children.length && m.nodes[n.children[0]].identity === m.nodes[n.children[1]].identity)) {
            return { status: 'impossible', explored: 0, elapsed: 0 };
        }
        let explored = 0, limit = false, lastReport = 0, solution = null;
        const remaining = start.filter((v, id) => id !== 0 && v < 2).length;
        const minimum = lowerBound(m, start, slots);
        // No solution ever needs more than one trip for each remaining occurrence.
        for (let bound = minimum; bound <= remaining; bound++) {
            const seen = new Map();
            function search(before, trips, prefix) {
                if (++explored > maxStates || Date.now() - started > maxMs) { limit = true; return false; }
                if (Date.now() - lastReport > 250) {
                    options.onProgress?.({ explored, lowerBound: bound, elapsed: Date.now() - started }); lastReport = Date.now();
                }
                const saturated = closure(m, before), state = saturated.state, path = prefix.concat(saturated.steps);
                if (state[0]) { solution = path; return true; }
                if (trips + lowerBound(m, state, slots) > bound) return false;
                const key = state.join('');
                if ((seen.get(key) ?? Infinity) <= trips) return false;
                seen.set(key, trips);
                for (const action of actions(m, state)) {
                    if (search(apply(m, state, action), trips, path.concat(action))) return true;
                    if (limit) return false;
                }
                if (trips === bound) return false;
                const ready = m.nodes.filter(n => n.id !== 0 && state[n.id] === 1)
                    .sort((a, b) => b.tail - a.tail || a.id - b.id).map(n => n.id);
                // Longest tails first, then the first branch, to meet early deadlines.
                // Enumerate ALL choices: this ordering is a heuristic, not a proof.
                for (const ids of combinations(ready, Math.min(slots, ready.length))) {
                    if (!ids.length) break;
                    const action = { type: 'train', ids };
                    if (search(apply(m, state, action, slots), trips + 1, path.concat(action))) return true;
                    if (limit) return false;
                }
                return false;
            }
            if (search(start, 0, [])) return { status: 'optimal', actions: scheduleAdmissions(m, solution, slots, start), trips: solution.filter(a => a.type === 'train').length, explored, elapsed: Date.now() - started };
            if (limit) return { status: 'limit', lowerBound: bound, explored, elapsed: Date.now() - started };
        }
        return { status: 'impossible', explored, elapsed: Date.now() - started };
    }
    // The search may admit independent individuals early to reduce branching.
    // Move admissions to their latest legal position before showing the plan.
    // Each adjacent swap must remain legal AND reach the same state, so training
    // batches, the minimum number of trips, residency and admission order survive.
    function deferAdmissions(m, actions, slots, start = initial(m)) {
        replay(m, actions, slots, start);
        let plan = actions.map(action => ({ type: action.type, ids: action.ids.slice() }));
        // A pair need not be caught together if one member can leave before the
        // other is needed. Split only when replay proves that recapture is legal.
        for (const pair of plan.filter(action => action.type === 'capture' && action.ids.length === 2)) {
            const pageOf = id => {
                let page = 0;
                for (const action of plan) if (action.type === 'train') {
                    if (action.ids.includes(id)) return page;
                    page++;
                }
                return page;
            };
            if (pageOf(pair.ids[0]) === pageOf(pair.ids[1])) continue;
            const [early, late] = [...pair.ids].sort((a, b) => pageOf(a) - pageOf(b));
            const original = plan.indexOf(pair);
            const split = plan.slice(); split[original] = { type: 'capture', ids: [early] };
            const needed = split.findIndex(action => action.type === 'train' && action.ids.includes(late));
            for (let index = needed; index > original; index--) {
                const candidate = split.slice(); candidate.splice(index, 0, { type: 'capture', ids: [late] });
                try { replay(m, candidate, slots, start); plan = candidate; break; } catch (_) { /* Other member still resident or admission order requires both. */ }
            }
        }
        for (const action of [...plan].reverse()) {
            if (action.type === 'train') continue;
            let index = plan.indexOf(action);
            let before = replay(m, plan.slice(0, index), slots, start);
            let after = apply(m, before, action, slots);
            while (index + 1 < plan.length) {
                const next = plan[index + 1];
                let skipped, swapped, expected;
                try {
                    skipped = apply(m, before, next, slots);
                    swapped = apply(m, skipped, action, slots);
                    expected = apply(m, after, next, slots);
                } catch (_) { break; }
                if (expected.some((value, i) => swapped[i] !== value)) break;
                plan[index] = next; plan[index + 1] = action;
                before = skipped; after = swapped; index++;
            }
        }
        return plan;
    }
    function immediateBirthIndex(m, state, pending, slots) {
        for (let index = 0; index < pending.length; index++) {
            const candidate = pending[index];
            if (candidate.type !== 'birth' || !birthAllowed(m, state, candidate.ids[0])) continue;
            try {
                const afterBirth = apply(m, state, candidate, slots);
                replay(m, pending.filter((_, i) => i !== index), slots, afterBirth);
                return index;
            } catch (_) { /* Ready parents alone do not guarantee future residency. */ }
        }
        return -1;
    }
    // Preorder IDs follow the tree's left-to-right branch order. Only commute
    // adjacent captures: never cross a trip/birth or split a shared-QR capture.
    // Equal end states preserve the entire suffix. Reject swaps that would leave
    // a newly possible birth waiting between the swapped captures.
    function orderCapturesLeftFirst(m, actions, slots, start = initial(m)) {
        replay(m, actions, slots, start);
        const plan = actions.map(action => ({ type: action.type, ids: action.ids.slice() }));
        let changed;
        do {
            changed = false;
            let state = start;
            for (let i = 0; i < plan.length; i++) {
                const current = plan[i], next = plan[i + 1];
                if (current.type === 'capture') {
                    if (current.ids.length === 2 && current.ids[0] > current.ids[1]) {
                        const sorted = { type: 'capture', ids: [...current.ids].reverse() };
                        try {
                            apply(m, state, sorted, slots);
                            plan[i] = sorted; changed = true;
                        } catch (_) { /* Keep the required admission order within a shared QR. */ }
                    }
                    if (next?.type === 'capture' && Math.min(...next.ids) < Math.min(...plan[i].ids)) {
                        try {
                            const first = apply(m, state, next, slots);
                            const swapped = apply(m, first, plan[i], slots);
                            const expected = apply(m, apply(m, state, plan[i], slots), next, slots);
                            const tail = [plan[i], ...plan.slice(i + 2)];
                            if (swapped.every((value, id) => value === expected[id]) &&
                                immediateBirthIndex(m, first, tail, slots) === -1) {
                                [plan[i], plan[i + 1]] = [next, plan[i]]; changed = true;
                            }
                        } catch (_) { /* Residency or QR restrictions take priority over visual order. */ }
                    }
                }
                state = apply(m, state, plan[i], slots);
            }
        } while (changed);
        return plan;
    }
    // Before every next action (especially after a trip), inspect ALL remaining
    // births. Execute each currently possible birth whose removal from the tail
    // leaves a valid full plan. Recheck after each birth because admission of the
    // first individual can unlock the second. Training batches never change.
    function scheduleAdmissions(m, actions, slots, start = initial(m)) {
        const pending = deferAdmissions(m, actions, slots, start), plan = [];
        let state = start;
        while (pending.length) {
            const immediate = immediateBirthIndex(m, state, pending, slots);
            const [action] = pending.splice(immediate === -1 ? 0 : immediate, 1);
            state = apply(m, state, action, slots); plan.push(action);
        }
        return orderCapturesLeftFirst(m, plan, slots, start);
    }
    // Explain only observable constraints on an earlier (left-side) capture.
    // These notes never participate in optimization or change any operation.
    function captureOrderNotes(m, state, action, following) {
        if (action.type !== 'capture') return [];
        const notes = action.ids.length === 2 ? [{ code: 'shared-qr', ids: action.ids.slice() }] : [];
        const left = following.flatMap((a, index) => a.type === 'capture' ?
            a.ids.filter(id => id < Math.min(...action.ids)).map(id => ({ id, index })) : [])
            .sort((a, b) => a.id - b.id)[0];
        if (!left) return notes;
        const n = m.nodes[left.id], first = n.side === 1 ? m.nodes[n.parent].children[0] : -1;
        const same = m.nodes.find(other => resident(state[other.id]) && other.identity === n.identity);
        const qr = n.group && m.nodes.find(other => resident(state[other.id]) && other.group === n.group);
        let code;
        if (first >= 0 && !resident(state[first])) code = 'first-parent';
        else if (same) code = 'same-person';
        else if (qr) code = 'same-qr';
        else if (following.slice(0, left.index).some(a => a.type === 'train')) code = 'later-trip';
        else code = 'birth-order';
        notes.push({ code, ids: [left.id], relatedId: code === 'first-parent' ? first : same?.id ?? qr?.id });
        return notes;
    }
    // Leading births get their own confirmation after a trip, before showing
    // the next catches. No game action is recorded just by pressing training done.
    function nextStep(actions) {
        if (actions[0]?.type !== 'birth') return batches(actions)[0] || [];
        const end = actions.findIndex(action => action.type !== 'birth');
        return actions.slice(0, end === -1 ? actions.length : end);
    }
    // Each screen commits its preparation actions and one trip together. The last
    // screen contains only the final births/capture, and costs no training trip.
    function batches(actions) {
        const result = []; let pending = [];
        for (const action of actions) {
            pending.push(action);
            if (action.type === 'train') { result.push(pending); pending = []; }
        }
        if (pending.length) result.push(pending);
        return result;
    }
    function restore(m, saved) {
        if (!saved || saved.version !== VERSION || saved.fingerprint !== m.fingerprint || !Array.isArray(saved.completed) || saved.completed.length > m.nodes.length * 2) return null;
        let state = initial(m), trips = 0;
        try {
            for (const batch of saved.completed) {
                if (!Array.isArray(batch.actions) || batch.actions.length > m.nodes.length * 2 || !Number.isSafeInteger(batch.slots) || batch.slots < 1) return null;
                state = replay(m, batch.actions, batch.slots, state);
                trips += batch.actions.filter(a => a.type === 'train').length;
            }
            if (!Number.isSafeInteger(saved.slots) || saved.slots < 1) return null;
            if (saved.plan) {
                if (!Array.isArray(saved.plan) || saved.plan.length > m.nodes.length * 2 || !replay(m, saved.plan, saved.slots, state)[0]) return null;
            }
            if (saved.lockedStepLength !== undefined) {
                const count = saved.lockedStepLength;
                if (saved.preparing !== true || !Number.isSafeInteger(count) || count < 1 || !Array.isArray(saved.plan) || count > saved.plan.length) return null;
                if (count !== batches(saved.plan)[0]?.length && !saved.plan.slice(0, count).every(action => action.type === 'birth')) return null;
            }
        } catch (_) { return null; }
        return { state, trips, saved };
    }
    const api = { VERSION, model, initial, apply, replay, lowerBound, solve, deferAdmissions, scheduleAdmissions, orderCapturesLeftFirst, captureOrderNotes, nextStep, batches, restore };
    root.TrainingCore = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
