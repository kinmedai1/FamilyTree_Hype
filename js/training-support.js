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
        return { version: C.VERSION, admissionTiming: 2, fingerprint: current.model.fingerprint, slots, completed: [], plan: null, preparing: false };
    }
    function attach(tree, records, historyId, saved) {
        stop(); closeQR(); viewing = null; message = ''; error = false; retry = false; saveError = '';
        try {
            current = { model: C.model(tree, records), historyId };
            const restored = C.restore(current.model, saved);
            data = restored ? structuredClone(saved) : empty();
            if (restored && data.admissionTiming !== 2) {
                if (data.plan) {
                    // A user may already have followed part of the displayed
                    // preparation. Keep that page exactly as saved, then defer.
                    const locked = data.preparing ? C.batches(data.plan)[0] || [] : [];
                    const state = C.replay(current.model, locked, data.slots, restored.state);
                    data.plan = locked.concat(C.scheduleAdmissions(current.model, data.plan.slice(locked.length), data.slots, state));
                    if (locked.length) { data.legacyPreparation = true; data.lockedStepLength = locked.length; }
                }
                data.admissionTiming = 2;
                persist();
            }
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
    function currentStep() {
        const plan = data.plan || [];
        return data.preparing && data.lockedStepLength ? plan.slice(0, data.lockedStepLength) : C.nextStep(plan);
    }
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
            worker = new Worker('./js/training-worker.js?v=20260921-1');
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
                    data.plan = result.result.actions; data.preparing = false; data.admissionTiming = 2;
                    delete data.legacyPreparation; delete data.lockedStepLength; message = ''; persist();
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
    function person(id, withQR = false, waiting = false) {
        const n = current.model.nodes[id], card = el('div', 'training-person');
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
                    const child = current.model.nodes[action.ids[0]], [a, b] = child.children;
                    const timing = completedTrips ? `第${completedTrips}回の育成完了後` : '育成済みの両親の準備が完了したら';
                    item.append(el('strong', 'training-birth-timing', `出生タイミング：${timing}${training ? `・第${completedTrips + 1}回の出撃前` : final ? '（追加の出撃は不要）' : '（次のキャッチ・出撃より先に出生）'}`));
                    item.append(el('p', '', `出生：${label(a)} ＋ ${label(b)} → ${label(child.id)}`));
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
    function complete() {
        const batch = currentStep();
        if (!data.preparing || !batch.length) return;
        data.completed.push({ slots: data.slots, actions: batch });
        data.plan = data.plan.slice(batch.length); data.preparing = false;
        delete data.legacyPreparation; delete data.lockedStepLength; message = ''; persist(); render();
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
        data.completed.forEach((batch, i) => select.append(new Option(`${i + 1}. ${batch.actions.some(a => a.type === 'train') ? '育成' : batch.actions.some(a => a.ids.includes(0)) ? '最終個体の入居' : '出生（出撃なし）'}（完了）`, String(i))));
        select.value = viewing === null ? '' : String(viewing);
        select.addEventListener('change', () => { viewing = select.value === '' ? null : Number(select.value); render(); });
        reviewLabel.append(select); navigation.append(reviewLabel);
        const undoButton = button('最後の完了を取り消す', undo, 'menu-button-muted');
        undoButton.disabled = computing || data.preparing || !data.completed.length; navigation.append(undoButton);
        if (data.completed.length) content.append(navigation);
        if (viewing !== null) {
            content.append(el('p', 'training-note', '完了した手順の閲覧中です。表示している操作をもう一度行う必要はありません。'));
            const previousTrips = data.completed.slice(0, viewing).reduce((sum, batch) => sum + batch.actions.filter(action => action.type === 'train').length, 0);
            renderActions(content, data.completed[viewing].actions, previousTrips);
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
        const batch = currentStep();
        if (!batch.length) return;
        const train = batch.find(a => a.type === 'train');
        const birthOnly = !train && !batch.some(a => a.ids.includes(0));
        content.append(el('h3', '', train ? `次の出撃：${restored.trips + 1}回目` : birthOnly ? `第${restored.trips}回の育成完了後：出生` : '最終個体の入居'));
        if (data.preparing) content.append(el('p', 'training-note', '準備・育成中です。途中から再開した場合、実施済みのキャッチ・出生を繰り返さず、残りの操作を進めてください。'));
        else content.append(el('p', 'training-note', birthOnly ? '出生できる両親がそろいました。次のキャッチに進む前に、以下の出生を済ませてください。' : '枠を変更する場合は、下の準備を始める前に変更してください。'));
        if (data.legacyPreparation) content.append(el('p', 'training-note', '更新前に準備を始めた回は、保存済みの手順を維持しています。完了後から、キャッチは必要な回に、出生はできるだけ早いタイミングで案内します。'));
        renderActions(content, batch, restored.trips);
        if (!data.preparing) content.append(button(birthOnly ? 'この出生を始める' : 'この手順で準備を始める', () => {
            if (!data.plan || !validSlots()) return;
            data.preparing = true; persist(); render();
        }, 'menu-button-gold'));
        else content.append(button(train ? '全員の育成完了' : birthOnly ? '出生を完了' : '最終個体の入居完了', complete, 'menu-button-gold'));
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
