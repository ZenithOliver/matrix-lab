/*
 * Top-level mode switcher.
 * Each mode is a tabpanel in the same static page; adding a future mode only
 * needs one tab button and one matching [data-mode-view] section.
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'matrixlab.mode';
  const VALID_MODES = ['analysis', 'operations'];

  function initModes() {
    const tablist = document.querySelector('.mode-switch');
    if (!tablist) return;

    const tabs = [...tablist.querySelectorAll('[data-mode]')];
    const views = new Map(
      [...document.querySelectorAll('[data-mode-view]')].map((view) => [
        view.dataset.modeView,
        view,
      ]),
    );
    const skipLink = document.querySelector('.skip-link');

    const storedMode = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();

    const hashMode = window.location.hash.replace('#', '');
    const initialMode = VALID_MODES.includes(hashMode)
      ? hashMode
      : VALID_MODES.includes(storedMode)
        ? storedMode
        : 'analysis';

    function setMode(mode, options = {}) {
      if (!VALID_MODES.includes(mode)) return;

      for (const tab of tabs) {
        const selected = tab.dataset.mode === mode;
        tab.classList.toggle('is-active', selected);
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      }

      for (const [name, view] of views) {
        view.hidden = name !== mode;
      }

      if (skipLink) {
        skipLink.href = mode === 'operations' ? '#arithmeticResults' : '#results';
      }

      document.documentElement.dataset.mode = mode;
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // Storage may be blocked for local file URLs; mode switching still works.
      }

      if (options.updateHash !== false) {
        const nextHash = `#${mode}`;
        if (window.location.hash !== nextHash) {
          history.replaceState(null, '', nextHash);
        }
      }

      if (options.focusTab) {
        const activeTab = tabs.find((tab) => tab.dataset.mode === mode);
        activeTab?.focus({ preventScroll: true });
      }

      if (options.scroll) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
      }

      document.dispatchEvent(
        new CustomEvent('matrixlab:modechange', { detail: { mode } }),
      );
    }

    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        setMode(tab.dataset.mode, { scroll: true });
      });

      tab.addEventListener('keydown', (event) => {
        const index = tabs.indexOf(tab);
        let nextIndex = null;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        setMode(nextTab.dataset.mode, { focusTab: true });
      });
    }

    window.addEventListener('hashchange', () => {
      const mode = window.location.hash.replace('#', '');
      if (VALID_MODES.includes(mode) && document.documentElement.dataset.mode !== mode) {
        setMode(mode, { updateHash: false });
      }
    });

    setMode(initialMode, { updateHash: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModes, { once: true });
  } else {
    initModes();
  }

  const MatrixLab = (root.MatrixLab = root.MatrixLab || {});
  MatrixLab.modes = { VALID_MODES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
