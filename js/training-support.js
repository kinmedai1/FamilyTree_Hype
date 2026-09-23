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
        stop(); closeQR(); pageIndex = 0; message = ''; error = false; retry = false;
        try {
            current = { model: C.model(tree, records) };
            data = { slots: 7, pages: null, trips: 0 };
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
    function detach() { stop(); closeQR(); current = null; data = null; pageIndex = 0; message = ''; render(); }
    function setPlan(actions) {
        const pages = [];
        let offset = 0, trips = 0;
        while (offset < actions.length) {
            const batch = C.nextStep(actions.slice(offset));
            pages.push({ actions: batch, trips });
            trips += batch.filter(action => action.type === 'train').length;
            offset += batch.length;
        }
        data.pages = pages; data.trips = trips; pageIndex = 0;
    }
    function goToPage(index, focus = 'heading') {
        if (!data?.pages || !Number.isInteger(index) || index < 0 || index >= data.pages.length) return;
        closeQR(); pageIndex = index; render();
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
        stop(); const token = serial;
        computing = true; error = false; retry = false; message = '最短手順を計算しています…'; pageIndex = 0; render();
        try {
            worker = new Worker('./js/training-worker.js?v=20260921-2');
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
        data.slots = value; data.pages = null; pageIndex = 0;
        message = '育成枠を変更しました。最初からの手順を再計算してください。'; error = false; retry = false;
        render();
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
        if (n.parent >= 0) card.append(el('small', '', `→ ${current.model.nodes[n.parent].name}（#${n.parent + 1}）の出生に使用`));
        if (withQR) {
            if (getQR(id)) {
                const qr = button('', () => showQR(id), 'training-qr');
                qr.setAttribute('aria-label', n.name + 'のQRコードを拡大');
                card.append(qr); qrTargets.set(qr, id); drawQR(qr, id);
            } else card.append(el('small', 'training-no-qr', 'QR情報なし：この個体を入手してください'));
        }
        return card;
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
                el('span', 'training-person-role', `#${id + 1}`), rsid);
            family.append(member);
        });
        return family;
    }
    function renderActions(parent, actions, completedTrips) {
        const training = actions.find(a => a.type === 'train');
        const final = actions.some(action => action.type !== 'train' && action.ids.includes(0));
        const targets = new Set(training?.ids || []);
        const prep = actions.filter(a => a.type !== 'train');
        if (prep.length) {
            parent.append(el('h4', '', training ? `第${completedTrips + 1}回の出撃前：この順番で準備` : final ? '最終個体を入居させる手順（出撃不要）' : '育成が終わったら、この順番で出生'));
            const list = el('ol', 'training-operations');
            for (const action of prep) {
                const item = el('li', action.type === 'birth' ? 'training-operation-birth' : action.ids.length === 2 ? 'training-operation-pair' : '');
                if (action.type === 'capture') {
                    item.append(el('p', '', action.ids.length === 2 ?
                        `同時キャッチ：① ${label(action.ids[0])} → ② ${label(action.ids[1])}` : `${label(action.ids[0])}をキャッチ`));
                    const waiting = training && action.ids.some(id => !targets.has(id));
                    const cards = el('div', 'training-roster'); action.ids.forEach(id => cards.append(person(id, true, !!training && !targets.has(id)))); item.append(cards);
                    if (waiting) item.append(el('p', 'training-note', '待機と表示された個体も先にキャッチし、今回は育成せず、そのまま待機させてください。'));
                } else {
                    const child = current.model.nodes[action.ids[0]];
                    const timing = completedTrips ? `第${completedTrips}回の育成完了後` : '育成済みの両親の準備が完了したら';
                    item.append(el('strong', 'training-birth-timing', `出生タイミング：${timing}${training ? `・第${completedTrips + 1}回の出撃前` : final ? '（追加の出撃は不要）' : '（次のキャッチ・出撃より先に出生）'}`));
                    item.append(birthFamily(child.id));
                    item.append(el('p', 'training-note', '両親の上限突破・しあわせ度MAXを済ませてから、上の順番どおりに出生してください。'));
                    if (training && !targets.has(child.id)) item.append(el('strong', 'training-waiting', '生まれた個体は今回は育成せず待機'));
                }
                list.append(item);
            }
            parent.append(list);
        } else parent.append(el('p', 'training-note', '新しいキャッチ・出生の準備はありません。'));
        if (training) {
            parent.append(el('h4', '', `今回育成する個体（${training.ids.length}体）`));
            const roster = el('div', 'training-roster'); training.ids.forEach(id => roster.append(person(id))); parent.append(roster);
            parent.append(el('p', 'training-note', '全員をLv.20まで育成してください。次の出生までに上限突破としあわせ度MAXの準備も行ってください。'));
        } else if (!final) {
            parent.append(el('p', 'training-note', '生まれた個体は、育成対象として案内されるまで待機させてください。出生の完了後に、次の手順へ進みます。'));
        }
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
        heading.tabIndex = -1; content.append(heading, pageNavigation());
        if (birthOnly) content.append(el('p', 'training-note', '次のキャッチに進む前に、以下の出生を済ませてください。'));
        renderActions(content, batch, page.trips);
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
        content.append(pageNavigation());
    }
    let dialog;
    function closeQR() { if (dialog?.open) dialog.close(); dialog?.remove(); dialog = null; }
    function showQR(id) {
        closeQR(); dialog = el('dialog', 'training-qr-dialog');
        dialog.append(el('h3', '', label(id)), face(id));
        const value = getQR(id), code = el('div', 'training-large-qr');
        if (value && root.QRCode) new root.QRCode(code, { text: value.slice(0, 6), width: 280, height: 280 });
        dialog.append(code, el('p', '', value), button('閉じる', closeQR));
        document.body.append(dialog); dialog.showModal();
    }
    root.TrainingSupport = { install, attach, detach, refreshQR };
})(window);
