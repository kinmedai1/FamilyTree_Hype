importScripts('./training-core.js?v=20260919-1');
self.onmessage = event => {
    const { model, slots, start, maxMs, maxStates } = event.data;
    try {
        const result = TrainingCore.solve(model, slots, { start, maxMs, maxStates,
            onProgress: progress => self.postMessage({ type: 'progress', ...progress }) });
        self.postMessage({ type: 'result', result });
    } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
