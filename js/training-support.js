(function (root) {
    'use strict';
    const C = root.TrainingCore;
    const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
    const button = (text, action, cls = '') => {
        const node = el('button', 'menu-button menu-button-small ' + cls, text);
        node.type = 'button'; node.addEventListener('click', action); return node;
    };
    let host, content, adapter, current = null, data = null, worker = null, computing = false, message = '', pageIndex = 0, serial = 0;
    let error = false, retry = false, qrFrame = 0;
    let comparison = null, comparisonWorker = null, comparisonSerial = 0, comparisonTimer = 0;
    let treeVisit = null;
    const qrTargets = new Map();
    const rsidTargets = new Map();
    function install(options) {
        adapter = options;
        host = document.getElementById('training-panel');
        content = document.getElementById('training-content');
        render();
    }
    function stop() { worker?.terminate(); worker = null; computing = false; serial++; }
    function attach(tree, records) {
        stop(); stopComparison(); clearTreeVisit(); closeQR(); pageIndex = 0; message = ''; error = false; retry = false;
        try {
            current = { model: C.model(tree, records) };
            data = { slots: 7, pages: null, trips: 0 };
            comparison = { open: false, running: false, results: new Map(), queue: [], active: null, message: '' };
            const card = document.getElementById(tree.uniqueId);
            if (card && !card.querySelector('.training-shortcut')) {
                const shortcut = button('育成サポート', () => {
                    host.open = true; host.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    content.querySelector('button')?.focus({ preventScroll: true });
                }, 'training-shortcut');
                shortcut.addEventListener('click', event => event.stopPropagation());
                (card.querySelector('.champion-identity') || card).append(shortcut);
            }
        } catch (e) { current = null; data = null; message = e.message; error = true; }
        render();
    }
    function detach() { stop(); stopComparison(); clearTreeVisit(); closeQR(); current = null; data = null; comparison = null; pageIndex = 0; message = ''; render(); }
    function setPlan(actions) {
        const pages = [];
        let offset = 0, trips = 0;
        while (offset < actions.length) {
            const batch = C.nextStep(actions.slice(offset));
            pages.push({ actions: batch, trips, offset });
            trips += batch.filter(action => action.type === 'train').length;
            offset += batch.length;
        }
        data.actions = actions; data.pages = pages; data.trips = trips; pageIndex = 0;
    }
    function goToPage(index, focus = 'heading') {
        if (!data?.pages || !Number.isInteger(index) || index < 0 || index >= data.pages.length) return;
        clearTreeVisit(); closeQR(); pageIndex = index; render();
        const heading = content.querySelector('.training-page-heading');
        const target = content.querySelector(`[data-page-control="${focus}"]`);
        (target && !target.disabled ? target : heading)?.focus({ preventScroll: true });
        heading?.scrollIntoView({ block: 'start' });
    }
    function pageNavigation() {
        const nav = el('nav', 'training-navigation training-pager');
        nav.setAttribute('aria-label', '育成手順のページ');
        const prev = button('前へ', () => goToPage(pageIndex - 1, 'prev'));
        prev.dataset.pageControl = 'prev'; prev.disabled = pageIndex === 0;
        const next = button('次へ', () => goToPage(pageIndex + 1, 'next'), 'menu-button-gold');
        next.dataset.pageControl = 'next'; next.disabled = pageIndex === data.pages.length - 1;
        const counter = el('span', 'training-page-counter', `${pageIndex + 1} / ${data.pages.length} ページ`);
        counter.setAttribute('aria-live', 'polite');
        nav.append(prev, counter, next); return nav;
    }
    function validSlots() {
        const input = content.querySelector('.training-slots input');
        if (!input) return true;
        input.setCustomValidity(Number.isSafeInteger(input.valueAsNumber) && input.valueAsNumber >= 1 ? '' : '1以上の整数を入力してください。');
        return input.reportValidity();
    }
    function calculate(longer = false) {
        if (!current || !validSlots()) return;
        stop(); stopComparison(); clearTreeVisit(); const token = serial;
        computing = true; error = false; retry = false; message = '最短手順を計算しています…'; pageIndex = 0; render();
        try {
            worker = new Worker('./js/training-worker.js?v=20260926-1');
            worker.onmessage = event => {
                if (token !== serial) return;
                const result = event.data;
                if (result.type === 'progress') {
                    message = `最短手順を確認中…（${result.lowerBound}回で実行できるか検証中）`;
                    const label = content.querySelector('.training-message'); if (label) label.textContent = message;
                    return;
                }
                stop();
                if (result.type === 'error') { message = result.message; error = true; }
                else if (result.result.status === 'optimal') {
                    comparison.results.set(data.slots, result.result);
                    setPlan(result.result.actions); message = '';
                } else if (result.result.status === 'limit') {
                    retry = true;
                    message = '時間内に最短手順を確定できませんでした。計算時間を延ばして再計算できます。最短と確認できるまで育成は開始できません。';
                } else {
                    error = true; message = 'この入居順と同一個体の制限では、この家系図を完成できません。同じ個体を両親に指定していないか確認してください。';
                }
                render();
            };
            worker.onerror = () => {
                if (token !== serial) return;
                stop(); error = true; message = '計算用プログラムを読み込めませんでした。サイトを再読み込みしてください。'; render();
            };
            worker.postMessage({ model: current.model, slots: data.slots, start: C.initial(current.model),
                maxMs: longer ? 120000 : 30000, maxStates: longer ? 4000000 : 1000000 });
        } catch (_) { stop(); error = true; message = 'このブラウザでは育成計算を開始できませんでした。'; render(); }
    }
    function chooseSlots(value) {
        if (computing || !Number.isSafeInteger(value) || value < 1 || value === data.slots) return;
        clearTreeVisit(); closeQR(); data.slots = value; data.pages = null; pageIndex = 0;
        message = '育成枠を変更しました。最初からの手順を再計算してください。'; error = false; retry = false;
        render();
    }
    function stopComparison() {
        comparisonWorker?.terminate(); comparisonWorker = null; clearTimeout(comparisonTimer); comparisonSerial++;
        if (comparison) { comparison.running = false; comparison.active = null; comparison.queue = []; }
    }
    function comparisonSlots() { return [...new Set([1, 2, 3, 4, 5, 6, 7, data.slots])].sort((a, b) => a - b); }
    function startComparison() {
        if (!current || computing || comparison.running) return;
        stopComparison(); comparison.open = true; comparison.message = '';
        comparison.queue = comparisonSlots().filter(slots => !['optimal', 'impossible'].includes(comparison.results.get(slots)?.status));
        comparison.running = true; compareNext(comparisonSerial);
    }
    function compareNext(token) {
        if (token !== comparisonSerial || !current) return;
        const slots = comparison.queue.shift();
        if (slots === undefined) {
            comparison.running = false; comparison.active = null; comparison.message = '比較が終わりました。'; updateComparison(); return;
        }
        comparison.active = slots; updateComparison();
        let settled = false;
        const finish = result => {
            if (settled || token !== comparisonSerial) return;
            settled = true;
            clearTimeout(comparisonTimer); comparisonWorker?.terminate(); comparisonWorker = null;
            comparison.results.set(slots, result); compareNext(token);
        };
        try {
            comparisonWorker = new Worker('./js/training-worker.js?v=20260926-1');
            comparisonWorker.onmessage = event => {
                if (event.data.type === 'progress') return;
                finish(event.data.type === 'result' ? event.data.result : { status: 'error' });
            };
            comparisonWorker.onerror = () => finish({ status: 'error' });
            comparisonTimer = setTimeout(() => finish({ status: 'limit' }), 7000);
            comparisonWorker.postMessage({ model: current.model, slots, start: C.initial(current.model), maxMs: 5000, maxStates: 200000 });
        } catch (_) { finish({ status: 'error' }); }
    }
    function updateComparison() {
        const body = content?.querySelector('.training-comparison-body');
        if (!body || !comparison) return;
        body.replaceChildren();
        body.append(el('p', 'training-note', '1〜7枠と現在の指定枠を比較します。最短と確認できた回数のみ表示します。枠を選ぶと最初のページから表示します。'));
        const control = comparison.running ? button('比較を中止', () => {
            stopComparison(); comparison.message = '比較を中止しました。計算済みの結果は利用できます。'; updateComparison();
        }) : button(comparison.results.size ? '未計算・未確定の枠を比較' : '育成枠を比較', startComparison);
        control.disabled = computing; body.append(control);
        const table = el('table', 'training-comparison-table'), head = el('thead'), row = el('tr');
        for (const text of ['育成枠', '最短出撃', '手順']) { const cell = el('th', '', text); cell.scope = 'col'; row.append(cell); }
        head.append(row); table.append(head);
        const rows = el('tbody');
        for (const slots of comparisonSlots()) {
            const result = comparison.results.get(slots), tr = el('tr'); tr.dataset.slots = slots;
            const count = comparison.active === slots ? '計算中…' : result?.status === 'optimal' ? `${result.trips}回` :
                result?.status === 'impossible' ? '実行不可' : result?.status === 'limit' ? '未確定' : result?.status === 'error' ? '計算エラー' : '未計算';
            tr.append(el('td', '', `${slots}枠`), el('td', 'training-comparison-result', count));
            const action = el('td');
            if (result?.status === 'optimal') {
                const selected = slots === data.slots && !!data.pages;
                const use = button(selected ? '表示中' : 'この枠で表示', () => {
                    if (computing) return;
                    stopComparison(); clearTreeVisit(); closeQR(); data.slots = slots;
                    setPlan(result.actions); message = ''; error = false; retry = false; render();
                    content.querySelector('.training-page-heading')?.scrollIntoView({ block: 'start' });
                });
                use.disabled = computing || selected; action.append(use);
            } else action.textContent = '—';
            tr.append(action); rows.append(tr);
        }
        table.append(rows); body.append(table);
        const status = el('p', 'training-note', comparison.running ? `${comparison.active}枠を比較中…` : comparison.message);
        status.setAttribute('role', 'status'); body.append(status);
        if ([...comparison.results.values()].some(r => r.status === 'limit')) body.append(el('p', 'training-note', '未確定の枠は、育成枠で選んで通常の「最短手順を計算」を使うと、より長く計算できます。'));
    }
    function renderComparison() {
        const panel = el('details', 'training-comparison'); panel.open = comparison.open;
        panel.append(el('summary', '', '育成枠ごとの出撃回数'), el('div', 'training-comparison-body'));
        panel.addEventListener('toggle', () => { if (panel.isConnected) comparison.open = panel.open; });
        content.append(panel); updateComparison();
    }
    function clearTreeVisit() {
        if (!treeVisit) return;
        treeVisit.revealed.forEach(node => node.classList.remove('training-tree-reveal'));
        treeVisit.target.classList.remove('training-tree-highlight'); treeVisit.back.remove();
        if (treeVisit.tabIndex === null) treeVisit.target.removeAttribute('tabindex');
        else treeVisit.target.setAttribute('tabindex', treeVisit.tabIndex);
        treeVisit = null; adapter?.refreshTree?.();
    }
    function showInTree(id) {
        const target = document.getElementById(current.model.nodes[id].uniqueId);
        if (!target) return;
        clearTreeVisit(); closeQR();
        const revealed = [];
        for (let nodeId = id; nodeId >= 0; nodeId = current.model.nodes[nodeId].parent) {
            const node = document.getElementById(current.model.nodes[nodeId].uniqueId);
            if (node?.classList.contains('collapsed')) { node.classList.add('training-tree-reveal'); revealed.push(node); }
        }
        const back = button('育成サポートに戻る', () => {
            clearTreeVisit(); host.open = true;
            const heading = content.querySelector('.training-page-heading');
            heading?.focus({ preventScroll: true }); (heading || host).scrollIntoView({ block: 'start' });
        }, 'training-tree-return');
        back.addEventListener('click', event => event.stopPropagation());
        treeVisit = { target, revealed, back, tabIndex: target.getAttribute('tabindex') };
        target.append(back); target.classList.add('training-tree-highlight'); target.tabIndex = -1;
        adapter.refreshTree?.(); target.scrollIntoView({ block: 'center', inline: 'center' }); target.focus({ preventScroll: true });
    }
    function treeLink(id) {
        const link = button('家系図で見る', () => showInTree(id), 'training-tree-link');
        link.setAttribute('aria-label', label(id) + 'を家系図で見る'); return link;
    }
    function role(n) { return n.side === 0 ? '先' : n.side === 1 ? '後' : '最終個体'; }
    function sideClass(id) {
        const side = current.model.nodes[id].side;
        return side === 0 ? ' training-pair-first' : side === 1 ? ' training-pair-second' : '';
    }
    function label(id) { const n = current.model.nodes[id]; return `${n.name}（${role(n)}・#${id + 1}）`; }
    function getQR(id) {
        const n = current.model.nodes[id];
        const value = adapter.qr?.(n) || n.rsid;
        return /^[A-Za-z0-9]{6}_?$/.test(value) ? value : '';
    }
    function drawQR(target, id) {
        const value = getQR(id); target.replaceChildren();
        if (!value || typeof root.QRCode !== 'function') { target.append(el('span', '', 'QRを表示できません')); return; }
        new root.QRCode(target, { text: value.slice(0, 6), width: 128, height: 128 });
        target.title = `${value} — 拡大する`;
    }
    function refreshQR() {
        cancelAnimationFrame(qrFrame);
        qrFrame = requestAnimationFrame(() => {
            for (const [target, id] of qrTargets) if (target.isConnected) drawQR(target, id);
            else qrTargets.delete(target);
            for (const [target, id] of rsidTargets) if (target.isConnected) target.textContent = `RSID：${getQR(id) || 'なし'}`;
            else rsidTargets.delete(target);
            if (dialog?.open) renderQRDialog(document.activeElement?.dataset.qrControl);
        });
    }
    function face(id) {
        const n = current.model.nodes[id];
        const portrait = el('div', 'training-face');
        if (!n.face) { portrait.textContent = '顔情報なし'; return portrait; }
        const canvas = el('canvas'); canvas.width = canvas.height = 96;
        canvas.setAttribute('aria-label', n.name + 'の顔'); portrait.append(canvas);
        root.DenpamenFaceRenderer.renderThumbnail(canvas, n.face, { size: 96 }).catch(() => {
            portrait.textContent = '顔を表示できません';
        });
        return portrait;
    }
    function person(id, withQR = false, waiting = false) {
        const n = current.model.nodes[id], card = el('div', 'training-person' + sideClass(id));
        card.append(face(id), el('strong', '', n.name), el('span', 'training-person-role', `${role(n)}・#${id + 1}`));
        if (waiting) card.append(el('strong', 'training-waiting', '今回は育成せず待機'));
        else if (withQR && data.pages?.[pageIndex]?.actions.some(a => a.type === 'train' && a.ids.includes(id))) card.append(el('span', 'training-current-target', '今回育成'));
        if (n.parent >= 0) card.append(el('small', '', `→ ${current.model.nodes[n.parent].name}（#${n.parent + 1}）の出生に使用`));
        if (withQR) {
            if (getQR(id)) {
                const qr = button('', () => showQR(id), 'training-qr');
                qr.setAttribute('aria-label', n.name + 'のQRコードを拡大');
                card.append(qr); qrTargets.set(qr, id); drawQR(qr, id);
            } else card.append(el('small', 'training-no-qr', 'QR情報なし：この個体を入手してください'));
        }
        card.append(treeLink(id)); return card;
    }
    function compactPerson(id, status = '') {
        const card = el('div', 'training-compact-person' + sideClass(id)); card.dataset.nodeId = id;
        const text = el('div', 'training-compact-info');
        text.append(el('strong', '', current.model.nodes[id].name), el('span', 'training-person-role', `${role(current.model.nodes[id])}・#${id + 1}`));
        if (status) text.append(el('span', 'training-planned-status', status));
        card.append(face(id), text, treeLink(id)); return card;
    }
    function birthFamily(childId) {
        const child = current.model.nodes[childId], family = el('div', 'training-birth-family');
        family.setAttribute('role', 'group'); family.setAttribute('aria-label', child.name + 'の出生');
        const members = [...child.children, childId], roles = ['先の親', '後の親', '生まれる個体'];
        members.forEach((id, i) => {
            if (i) {
                const symbol = el('span', 'training-birth-symbol' + (i === 2 ? ' training-birth-arrow' : ''), i === 1 ? '＋' : '→');
                symbol.setAttribute('aria-hidden', 'true'); family.append(symbol);
            }
            const member = el('div', 'training-birth-member' + (i === 2 ? ' training-birth-child' : '') + sideClass(id));
            const rsid = el('span', 'training-birth-rsid', `RSID：${getQR(id) || 'なし'}`);
            rsidTargets.set(rsid, id);
            member.append(el('strong', 'training-birth-role', roles[i]), face(id),
                el('strong', 'training-birth-name', current.model.nodes[id].name),
                el('span', 'training-person-role', `#${id + 1}`), rsid, treeLink(id));
            family.append(member);
        });
        return family;
    }
    function renderActions(parent, actions, completedTrips, before, offset) {
        const training = actions.find(a => a.type === 'train');
        const final = actions.some(action => action.type !== 'train' && action.ids.includes(0));
        const targets = new Set(training?.ids || []);
        const prep = actions.filter(a => a.type !== 'train');
        if (prep.length) {
            parent.append(el('h4', '', training ? `第${completedTrips + 1}回の出撃前：この順番で準備` : final ? '最終個体を入居させる手順（出撃不要）' : '育成が終わったら、この順番で出生'));
            const list = el('ol', 'training-operations');
            let state = before;
            for (const [index, action] of prep.entries()) {
                const item = el('li', action.type === 'birth' ? 'training-operation-birth' : action.ids.length === 2 ? 'training-operation-pair' : '');
                if (action.type === 'capture') {
                    item.append(el('p', '', action.ids.length === 2 ?
                        `同時キャッチ：① ${label(action.ids[0])} → ② ${label(action.ids[1])}` : `${label(action.ids[0])}をキャッチ`));
                    const waiting = training && action.ids.some(id => !targets.has(id));
                    const cards = el('div', 'training-roster'); action.ids.forEach(id => cards.append(person(id, true, !!training && !targets.has(id)))); item.append(cards);
                    const notes = C.captureOrderNotes(current.model, state, action, data.actions.slice(offset + index + 1));
                    for (const note of notes) {
                        const subject = label(note.ids[0]);
                        const text = note.code === 'shared-qr' ? '同じQRの2体です。①→②の順に続けてキャッチしてください。' :
                            note.code === 'first-parent' ? `${subject}は、先の個体「${current.model.nodes[note.relatedId].name}」の入居待ちです。` :
                            note.code === 'same-person' ? `${subject}は、同じ個体が出生に使われて退出するまで再入手できません。` :
                            note.code === 'same-qr' ? `${subject}は、同じQRの個体が退出するまで再キャッチできません。` :
                            note.code === 'later-trip' ? `${subject}は後の育成回で使うため、今回は先にキャッチしません。` :
                            '入居順と出生タイミングを保つため、ここは家系図の左からの順番と異なります。';
                        const noteEl = el('p', 'training-order-note', text); noteEl.dataset.reason = note.code; item.append(noteEl);
                    }
                    if (waiting) item.append(el('p', 'training-note', '待機と表示された個体も先にキャッチし、今回は育成せず、そのまま待機させてください。'));
                } else {
                    const child = current.model.nodes[action.ids[0]];
                    const timing = completedTrips ? `第${completedTrips}回の育成完了後` : '育成済みの両親の準備が完了したら';
                    item.append(el('strong', 'training-birth-timing', `出生タイミング：${timing}${training ? `・第${completedTrips + 1}回の出撃前` : final ? '（追加の出撃は不要）' : '（次のキャッチ・出撃より先に出生）'}`));
                    item.append(birthFamily(child.id));
                    item.append(el('p', 'training-note', '両親の上限突破・しあわせ度MAXを済ませてから、上の順番どおりに出生してください。'));
                    if (training && !targets.has(child.id)) item.append(el('strong', 'training-waiting', '生まれた個体は今回は育成せず待機'));
                }
                state = C.apply(current.model, state, action, data.slots);
                list.append(item);
            }
            parent.append(list);
        } else parent.append(el('p', 'training-note', '新しいキャッチ・出生の準備はありません。'));
        if (training) {
            parent.append(el('h4', '', `今回育成する個体（${training.ids.length}体）`));
            const roster = el('div', 'training-compact-roster'); training.ids.forEach(id => roster.append(compactPerson(id))); parent.append(roster);
            parent.append(el('p', 'training-note', '全員をLv.20まで育成してください。次の出生までに上限突破としあわせ度MAXの準備も行ってください。'));
        } else if (!final) {
            parent.append(el('p', 'training-note', '生まれた個体は、育成対象として案内されるまで待機させてください。出生の完了後に、次の手順へ進みます。'));
        }
    }
    function renderSummary(page) {
        const summary = el('section', 'training-step-summary'); summary.setAttribute('aria-label', '今回の要約');
        summary.append(el('strong', '', '今回の要約'));
        const steps = [], append = (text, count, preview = false) => {
            if (!count) return;
            if (steps.length) summary.append(el('span', 'training-summary-arrow', '→'));
            summary.append(el('span', preview ? 'training-summary-preview' : '', `${text}${count}体`)); steps.push(text);
        };
        // Preserve operation order even when a capture and birth share a page.
        let type = '', count = 0;
        for (const action of page.actions) {
            if (type && type !== action.type) { append(type === 'capture' ? 'キャッチ' : type === 'train' ? '育成' : '出生', count); count = 0; }
            type = action.type; count += action.ids.length;
        }
        append(type === 'capture' ? 'キャッチ' : type === 'train' ? '育成' : '出生', count);
        const following = data.pages[pageIndex + 1]?.actions;
        if (page.actions.some(a => a.type === 'train') && following?.[0]?.type === 'birth') append('次ページで出生', following.length, true);
        content.append(summary);
    }
    function renderWaiting(after) {
        const ids = current.model.nodes.filter(n => n.id !== 0 && (after[n.id] === 1 || after[n.id] === 2)).map(n => n.id);
        const panel = el('details', 'training-waiting-panel');
        panel.append(el('summary', '', `この手順の後に待機する個体（${ids.length}体）`));
        panel.append(el('p', 'training-note', 'このページの操作を終え、次のページに進む前の計画上の状態です。実際の進捗を記録するものではありません。'));
        if (ids.length) {
            const roster = el('div', 'training-compact-roster');
            ids.forEach(id => roster.append(compactPerson(id, after[id] === 2 ? '育成済み' : '未育成'))); panel.append(roster);
        } else panel.append(el('p', 'training-note', after[0] ? '最終個体以外に待機する個体はいません。' : '待機する個体はいません。'));
        content.append(panel);
    }
    function render() {
        if (!content) return;
        qrTargets.clear(); rsidTargets.clear(); content.replaceChildren();
        if (!current) { content.append(el('p', '', message || '家系図を表示すると、育成手順を計算できます。')); return; }
        const controls = el('div', 'training-controls'), slots = el('fieldset', 'training-slots');
        slots.append(el('legend', '', '育成枠'));
        for (let i = 1; i <= 7; i++) {
            const choice = button(String(i), () => chooseSlots(i)); choice.setAttribute('aria-pressed', String(data.slots === i)); slots.append(choice);
        }
        const customLabel = el('label', '', '指定：'), input = el('input'); input.type = 'number'; input.min = '1'; input.step = '1'; input.value = data.slots;
        input.addEventListener('input', () => input.setCustomValidity(''));
        input.setAttribute('aria-label', '育成枠の数'); input.addEventListener('change', () => {
            if (!Number.isSafeInteger(input.valueAsNumber) || input.valueAsNumber < 1) { input.setCustomValidity('1以上の整数を入力してください。'); input.reportValidity(); return; }
            input.setCustomValidity(''); chooseSlots(input.valueAsNumber);
        });
        customLabel.append(input); slots.append(customLabel);
        slots.disabled = computing; controls.append(slots);
        if (computing) controls.append(button('計算を中止', () => { stop(); message = '計算を中止しました。'; render(); }));
        else if (!data.pages) controls.append(button(retry ? '時間を延ばして再計算' : '最短手順を計算', () => calculate(retry), 'menu-button-gold'));
        content.append(controls);
        const notice = el('p', 'training-message' + (error ? ' training-error' : ''), message); notice.setAttribute('role', 'status'); content.append(notice);
        renderComparison();
        if (!data.pages || computing) {
            content.append(el('p', 'training-note', '必要な個体がまだ入居していない状態から、最終個体の入居までを計算します。計算後は「前へ」「次へ」で手順を確認できます。ページ位置や進捗は保存しません。'));
            return;
        }
        const tally = el('div', 'training-tally');
        tally.append(el('strong', '', `最短出撃 ${data.trips}回`)); content.append(tally);
        const page = data.pages[pageIndex];
        if (!page) return;
        const batch = page.actions;
        const train = batch.find(a => a.type === 'train');
        const birthOnly = !train && !batch.some(a => a.ids.includes(0));
        const heading = el('h3', 'training-page-heading', train ? `第${page.trips + 1}回の出撃` : birthOnly ? `第${page.trips}回の育成後：今すぐ出生` : '最終個体の入居');
        heading.tabIndex = -1; content.append(heading); renderSummary(page); content.append(pageNavigation());
        if (birthOnly) content.append(el('p', 'training-note', '次のキャッチに進む前に、以下の出生を済ませてください。'));
        const before = C.replay(current.model, data.actions.slice(0, page.offset), data.slots);
        renderActions(content, batch, page.trips, before, page.offset);
        if (train) {
            const following = data.pages[pageIndex + 1]?.actions;
            if (following?.[0]?.type === 'birth') {
                const preview = el('section', 'training-birth-preview');
                preview.append(el('h4', '', `この出撃後にすぐ出生（${following.length}体）`));
                const list = el('ol');
                following.forEach(action => {
                    const item = el('li'); item.append(birthFamily(action.ids[0])); list.append(item);
                });
                preview.append(list, el('p', 'training-note', '育成から戻ったら、次のキャッチより先に出生します。「次へ」で出生の手順を表示します。'));
                content.append(preview);
            }
        }
        if (pageIndex === data.pages.length - 1) content.append(el('p', 'training-note', '最後の手順です。この入居で家系図が完成します。'));
        renderWaiting(C.replay(current.model, batch, data.slots, before));
        content.append(pageNavigation());
    }
    let dialog, dialogIds = [], dialogIndex = 0;
    function closeQR() {
        if (dialog?.open) dialog.close();
        dialog?.remove(); dialog = null; dialogIds = []; dialogIndex = 0;
    }
    function renderQRDialog(focus) {
        if (!dialog) return;
        const id = dialogIds[dialogIndex];
        dialog.className = 'training-qr-dialog' + sideClass(id);
        dialog.replaceChildren();
        const title = el('h3', '', label(id)); title.id = 'training-qr-title'; title.tabIndex = -1;
        dialog.append(title, face(id));
        const training = data.pages[pageIndex].actions.find(a => a.type === 'train');
        if (training) dialog.append(el('strong', training.ids.includes(id) ? 'training-current-target' : 'training-waiting',
            training.ids.includes(id) ? '今回育成' : '今回は育成せず待機'));
        const value = getQR(id), code = el('div', 'training-large-qr');
        if (value && root.QRCode) new root.QRCode(code, { text: value.slice(0, 6), width: 280, height: 280 });
        const nav = el('nav', 'training-qr-navigation'); nav.setAttribute('aria-label', 'キャッチ対象のQRコード');
        const move = (offset, control) => {
            const next = dialogIndex + offset;
            if (next < 0 || next >= dialogIds.length) return;
            dialogIndex = next; renderQRDialog(control);
        };
        const prev = button('戻る', () => move(-1, 'prev'));
        prev.dataset.qrControl = 'prev'; prev.disabled = dialogIndex === 0;
        const next = button('次へ', () => move(1, 'next'), 'menu-button-gold');
        next.dataset.qrControl = 'next'; next.disabled = dialogIndex === dialogIds.length - 1;
        const counter = el('span', 'training-qr-counter', `${dialogIndex + 1} / ${dialogIds.length}`);
        counter.setAttribute('aria-live', 'polite');
        nav.append(prev, counter, next);
        const close = button('閉じる', closeQR); close.dataset.qrControl = 'close';
        dialog.append(code, el('p', 'training-qr-rsid', value), nav, close);
        if (focus) {
            const target = dialog.querySelector(`[data-qr-control="${focus}"]`);
            (target && !target.disabled ? target : title).focus({ preventScroll: true });
        }
    }
    function showQR(id) {
        closeQR();
        // Keep the page's catch order, including distinct individuals sharing a QR.
        dialogIds = [...qrTargets].filter(([target]) => target.isConnected).map(([, targetId]) => targetId);
        dialogIndex = dialogIds.indexOf(id);
        if (dialogIndex < 0) { dialogIds = []; return; }
        dialog = el('dialog', 'training-qr-dialog');
        dialog.setAttribute('aria-labelledby', 'training-qr-title');
        let pressedOutside = false;
        const outside = event => {
            const rect = dialog.getBoundingClientRect();
            return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
        };
        dialog.addEventListener('pointerdown', event => { pressedOutside = outside(event); });
        dialog.addEventListener('click', event => { if (pressedOutside && outside(event)) closeQR(); pressedOutside = false; });
        dialog.addEventListener('cancel', event => { event.preventDefault(); closeQR(); });
        renderQRDialog();
        document.body.append(dialog); dialog.showModal();
    }
    root.TrainingSupport = { install, attach, detach, refreshQR };
})(window);
