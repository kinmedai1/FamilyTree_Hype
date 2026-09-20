(function (root) {
    'use strict';
    const C = root.TrainingCore;
    const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
    const button = (text, action, cls = '') => {
        const node = el('button', 'menu-button menu-button-small ' + cls, text);
        node.type = 'button'; node.addEventListener('click', action); return node;
    };
    let host, content, adapter, current = null, data = null, worker = null, computing = false, message = '', viewing = null, serial = 0;
    let error = false, retry = false, saveError = '', qrFrame = 0;
    const qrTargets = new Map();
    function install(options) {
        adapter = options;
        host = document.getElementById('training-panel');
        content = document.getElementById('training-content');
        render();
    }
    function stop() { worker?.terminate(); worker = null; computing = false; serial++; }
    function empty(slots = 7) {
        return { version: C.VERSION, fingerprint: current.model.fingerprint, slots, completed: [], plan: null, preparing: false };
    }
    function attach(tree, records, historyId, saved) {
        stop(); closeQR(); viewing = null; message = ''; error = false; retry = false; saveError = '';
        try {
            current = { model: C.model(tree, records), historyId };
            const restored = C.restore(current.model, saved);
            data = restored ? structuredClone(saved) : empty();
            if (saved && !restored) message = '家系図または保存された進捗が変わったため、育成計画を作り直してください。';
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
    function detach() { stop(); closeQR(); current = null; data = null; viewing = null; message = ''; saveError = ''; render(); }
    function persist() {
        saveError = '';
        try {
            if (!current?.historyId || !adapter.save(current.historyId, structuredClone(data))) throw new Error();
        } catch (_) { saveError = '進捗を保存できませんでした。履歴とブラウザの保存容量を確認してください。再読み込みすると今回の進捗を失う可能性があります。'; }
    }
    function progress() { return C.restore(current.model, data); }
    function validSlots() {
        const input = content.querySelector('.training-slots input');
        if (!input) return true;
        input.setCustomValidity(Number.isSafeInteger(input.valueAsNumber) && input.valueAsNumber >= 1 ? '' : '1以上の整数を入力してください。');
        return input.reportValidity();
    }
    function calculate(longer = false) {
        if (!current || data.preparing || !validSlots()) return;
        stop(); const token = serial;
        const restored = progress();
        if (!restored) { message = '保存された進捗を確認できません。'; error = true; render(); return; }
        computing = true; error = false; retry = false; message = '最短手順を計算しています…'; viewing = null; render();
        try {
            worker = new Worker('./js/training-worker.js?v=20260919-1');
            worker.onmessage = event => {
                if (token !== serial) return;
                const result = event.data;
                if (result.type === 'progress') {
                    message = `最短手順を確認中…（残り${result.lowerBound}回で実行できるか検証中）`;
                    const label = content.querySelector('.training-message'); if (label) label.textContent = message;
                    return;
                }
                stop();
                if (result.type === 'error') { message = result.message; error = true; }
                else if (result.result.status === 'optimal') {
                    data.plan = result.result.actions; data.preparing = false; message = ''; persist();
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
            worker.postMessage({ model: current.model, slots: data.slots, start: restored.state,
                maxMs: longer ? 120000 : 30000, maxStates: longer ? 4000000 : 1000000 });
        } catch (_) { stop(); error = true; message = 'このブラウザでは育成計算を開始できませんでした。'; render(); }
    }
    function chooseSlots(value) {
        if (computing || data.preparing || viewing !== null || !Number.isSafeInteger(value) || value < 1 || value === data.slots) return;
        data.slots = value; data.plan = null; message = '育成枠を変更しました。完了済みの入居・育成を引き継いで、残りを再計算します。'; error = false; retry = false;
        persist(); render();
    }
    function role(n) { return n.side === 0 ? '先' : n.side === 1 ? '後' : '最終個体'; }
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
    function person(id, withQR = false) {
        const n = current.model.nodes[id], card = el('div', 'training-person');
        card.append(face(id), el('strong', '', n.name), el('span', 'training-person-role', `${role(n)}・#${id + 1}`));
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
    function renderActions(parent, actions) {
        const prep = actions.filter(a => a.type !== 'train');
        if (prep.length) {
            parent.append(el('h4', '', 'この順番で準備'));
            const list = el('ol', 'training-operations');
            for (const action of prep) {
                const item = el('li', action.type === 'birth' ? 'training-operation-birth' : action.ids.length === 2 ? 'training-operation-pair' : '');
                if (action.type === 'capture') {
                    item.append(el('p', '', action.ids.length === 2 ?
                        `同時キャッチ：① ${label(action.ids[0])} → ② ${label(action.ids[1])}` : `${label(action.ids[0])}をキャッチ`));
                    const cards = el('div', 'training-roster'); action.ids.forEach(id => cards.append(person(id, true))); item.append(cards);
                } else {
                    const child = current.model.nodes[action.ids[0]], [a, b] = child.children;
                    item.append(el('p', '', `出生：${label(a)} ＋ ${label(b)} → ${label(child.id)}`));
                }
                list.append(item);
            }
            parent.append(list);
        } else parent.append(el('p', 'training-note', '新しいキャッチ・出生の準備はありません。'));
        const training = actions.find(a => a.type === 'train');
        if (training) {
            parent.append(el('h4', '', `今回育成する個体（${training.ids.length}体）`));
            const roster = el('div', 'training-roster'); training.ids.forEach(id => roster.append(person(id))); parent.append(roster);
            parent.append(el('p', 'training-note', '全員をLv.20まで育成してください。次の出生までに上限突破としあわせ度MAXの準備も行ってください。'));
        }
    }
    function complete() {
        const batch = C.batches(data.plan || [])[0];
        if (!data.preparing || !batch) return;
        data.completed.push({ slots: data.slots, actions: batch });
        data.plan = data.plan.slice(batch.length); data.preparing = false; message = ''; persist(); render();
    }
    function undo() {
        if (data.preparing || computing || !data.completed.length) return;
        if (!confirm('最後の完了記録を取り消します。ゲーム内の出生・入居・育成は元に戻りません。完了ボタンを誤って押した場合だけ取り消してください。')) return;
        const last = data.completed.pop(); data.slots = last.slots; data.plan = null; viewing = null;
        message = '最後の完了記録を取り消しました。残りの手順を再計算してください。'; error = false; persist(); render();
    }
    function render() {
        if (!content) return;
        qrTargets.clear(); content.replaceChildren();
        if (!current) { content.append(el('p', '', message || '家系図を表示すると、育成手順を計算できます。')); return; }
        const restored = progress();
        if (!restored) { content.append(el('p', 'training-error', '育成進捗が不正です。家系図を開き直してください。')); return; }
        const done = !!restored.state[0];
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
        slots.disabled = computing || data.preparing || viewing !== null || done; controls.append(slots);
        if (!data.preparing && !done && viewing === null) {
            if (computing) controls.append(button('計算を中止', () => { stop(); message = '計算を中止しました。'; render(); }));
            else if (!data.plan) controls.append(button(retry ? '時間を延ばして再計算' : '最短手順を計算', () => calculate(retry), 'menu-button-gold'));
        }
        content.append(controls);
        const notice = el('p', 'training-message' + (error ? ' training-error' : ''), message); notice.setAttribute('role', 'status'); content.append(notice);
        if (saveError) content.append(el('p', 'training-error', saveError));
        if (data.plan && !computing) {
            const remaining = data.plan.filter(a => a.type === 'train').length;
            const tally = el('div', 'training-tally');
            tally.append(el('strong', '', `残り最短 ${remaining}回`), el('span', '', `出撃完了 ${restored.trips}回 ／ 合計 ${restored.trips + remaining}回`));
            content.append(tally);
        }
        const navigation = el('div', 'training-navigation');
        const reviewLabel = el('label', '', '手順を確認：'), select = el('select'); select.setAttribute('aria-label', '完了した手順を確認');
        select.append(new Option('現在の手順', ''));
        data.completed.forEach((batch, i) => select.append(new Option(`${i + 1}. ${batch.actions.some(a => a.type === 'train') ? '育成' : '最終個体の入居'}（完了）`, String(i))));
        select.value = viewing === null ? '' : String(viewing);
        select.addEventListener('change', () => { viewing = select.value === '' ? null : Number(select.value); render(); });
        reviewLabel.append(select); navigation.append(reviewLabel);
        const undoButton = button('最後の完了を取り消す', undo, 'menu-button-muted');
        undoButton.disabled = computing || data.preparing || !data.completed.length; navigation.append(undoButton);
        if (data.completed.length) content.append(navigation);
        if (viewing !== null) {
            content.append(el('p', 'training-note', '完了した手順の閲覧中です。表示している操作をもう一度行う必要はありません。'));
            renderActions(content, data.completed[viewing].actions);
            const nav = el('div', 'training-navigation');
            const prev = button('前へ', () => { viewing--; render(); }); prev.disabled = viewing === 0;
            const next = button('次へ', () => { viewing = viewing + 1 < data.completed.length ? viewing + 1 : null; render(); });
            nav.append(prev, next, button('現在の手順に戻る', () => { viewing = null; render(); })); content.append(nav); return;
        }
        if (done) { content.append(el('p', 'training-finished', '最終個体の入居が完了しました。')); return; }
        if (!data.plan || computing) {
            content.append(el('p', 'training-note', '必要な個体がまだ入居していない状態から、最終個体の出生までを計算します。育成済みの個体は、育成枠を使わず待機できます。'));
            return;
        }
        const batch = C.batches(data.plan)[0];
        if (!batch) return;
        const train = batch.find(a => a.type === 'train');
        content.append(el('h3', '', train ? `次の出撃：${restored.trips + 1}回目` : '最終個体の入居'));
        if (data.preparing) content.append(el('p', 'training-note', '準備・育成中です。途中から再開した場合、実施済みのキャッチ・出生を繰り返さず、残りの操作を進めてください。'));
        else content.append(el('p', 'training-note', '枠を変更する場合は、下の準備を始める前に変更してください。'));
        renderActions(content, batch);
        if (!data.preparing) content.append(button('この手順で準備を始める', () => {
            if (!data.plan || !validSlots()) return;
            data.preparing = true; persist(); render();
        }, 'menu-button-gold'));
        else content.append(button(train ? '全員の育成完了' : '最終個体の入居完了', complete, 'menu-button-gold'));
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
