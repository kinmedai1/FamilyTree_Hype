/* Embedded in the notebook's persistent style output, outside replaceable result tables. */
(() => {
    'use strict';
    if (window.__hyperionTabBroker?.version === 1) return;
    const sites = new Map();
    window.__hyperionTabBroker = {
        version: 1,
        getState(key) {
            if (!sites.has(key)) sites.set(key, {
                popup: null,
                busy: false,
                // Keep the opener in this stable output frame as well as the reference.
                open: () => window.open('', 'HyperionFamilyTree'),
                focus: () => sites.get(key).popup?.focus()
            });
            return sites.get(key);
        }
    };
})();
