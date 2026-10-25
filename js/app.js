(function (root) {
  'use strict';

  const MatrixLab = root.MatrixLab;
  const { el, clear } = MatrixLab.ui.dom;
  const C = MatrixLab.ui.components;
  const Fraction = MatrixLab.Fraction;
  const SymbolicValue = MatrixLab.SymbolicValue;
  const MAX_SIZE = 8;
  const DEFAULT_BUTTON_COLOR = '#1c3a5e';
  const BUTTON_COLOR_KEY = 'matrixlab.button-color';
  const SAMPLE = [
    ['1', '2', '3'],
    ['2', '4', '6'],
    ['1', '1', '1'],
  ];

  const state = {
    rows: 3,
    columns: 3,
    values: SAMPLE.map((row) => row.slice()),
  };

  const elements = {};

  function looksLikeSymbol(rawValue) {
    return /\p{L}/u.test(String(rawValue ?? '').trim());
  }

  function isHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value));
  }

  function hexToRgb(hex) {
    const value = hex.slice(1);
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16),
    };
  }

  function rgbToHex({ r, g, b }) {
    return `#${[r, g, b]
      .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
      .join('')}`;
  }

  function mixRgb(from, to, ratio) {
    return {
      r: from.r + (to.r - from.r) * ratio,
      g: from.g + (to.g - from.g) * ratio,
      b: from.b + (to.b - from.b) * ratio,
    };
  }

  function linearChannel(value) {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }

  function relativeLuminance({ r, g, b }) {
    return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
  }

  function contrastRatio(first, second) {
    const light = Math.max(first, second);
    const dark = Math.min(first, second);
    return (light + 0.05) / (dark + 0.05);
  }

  function buttonTextColor(rgb) {
    const luminance = relativeLuminance(rgb);
    const light = contrastRatio(luminance, relativeLuminance({ r: 248, g: 250, b: 246 }));
    const dark = contrastRatio(luminance, relativeLuminance({ r: 17, g: 27, b: 36 }));
    return light >= dark ? '#f8faf6' : '#111b24';
  }

  /**
   * Deep blue is the relaxed default. The picker updates only the primary
   * action colour, keeping the rest of the interface stable.
   */
  function applyButtonColor(rawColor, options = {}) {
    if (!isHexColor(rawColor)) return;
    const color = rawColor.toLowerCase();
    const rgb = hexToRgb(color);
    const luminance = relativeLuminance(rgb);
    const hover = rgbToHex(
      mixRgb(rgb, luminance < 0.28 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, 0.12),
    );
    const shadow = rgbToHex(mixRgb(rgb, { r: 0, g: 0, b: 0 }, 0.32));
    const shadowRgb = hexToRgb(shadow);
    const style = document.documentElement.style;

    style.setProperty('--action-color', color);
    style.setProperty('--action-hover', hover);
    style.setProperty('--action-text', buttonTextColor(rgb));
    style.setProperty('--action-shadow', `rgba(${shadowRgb.r}, ${shadowRgb.g}, ${shadowRgb.b}, 0.5)`);
    style.setProperty('--action-ring', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.24)`);

    let matchesPreset = false;
    for (const swatch of elements.colorSwatches) {
      const active = swatch.dataset.color.toLowerCase() === color;
      swatch.setAttribute('aria-pressed', String(active));
      matchesPreset = matchesPreset || active;
    }
    elements.customColor.value = color;
    elements.customColorLabel.classList.toggle('is-active', !matchesPreset);

    if (options.persist !== false) {
      try {
        localStorage.setItem(BUTTON_COLOR_KEY, color);
      } catch {
        // Private mode or a local-file policy may disable storage.
      }
    }
  }

  function initButtonColor() {
    let stored = null;
    try {
      stored = localStorage.getItem(BUTTON_COLOR_KEY);
    } catch {
      // Use the default when localStorage is unavailable.
    }
    applyButtonColor(isHexColor(stored) ? stored : DEFAULT_BUTTON_COLOR, { persist: false });
  }

  function cacheElements() {
    elements.rowsSelect = document.getElementById('rowsSelect');
    elements.colsSelect = document.getElementById('colsSelect');
    elements.dimensionBadge = document.getElementById('dimensionBadge');
    elements.matrixEditor = document.getElementById('matrixEditor');
    elements.randomButton = document.getElementById('randomButton');
    elements.clearButton = document.getElementById('clearButton');
    elements.calculateButton = document.getElementById('calculateButton');
    elements.colorSwatches = [...document.querySelectorAll('.color-swatch')];
    elements.customColor = document.getElementById('customColor');
    elements.customColorLabel = document.getElementById('customColorLabel');
    elements.inputError = document.getElementById('inputError');
    elements.results = document.getElementById('results');
    elements.resultsList = document.getElementById('resultsList');
    elements.emptyState = document.getElementById('emptyState');
    elements.summaryBar = document.getElementById('summaryBar');
    elements.sizeChip = document.getElementById('sizeChip');
    elements.rankChip = document.getElementById('rankChip');
    elements.detChip = document.getElementById('detChip');
    elements.staleNotice = document.getElementById('staleNotice');
    elements.symbolicNotice = document.getElementById('symbolicNotice');
    elements.resultStatus = document.getElementById('resultStatus');
    elements.statusText = document.getElementById('statusText');
  }

  function fillDimensionSelects() {
    for (const [select, selected] of [
      [elements.rowsSelect, state.rows],
      [elements.colsSelect, state.columns],
    ]) {
      clear(select);
      for (let size = 1; size <= MAX_SIZE; size += 1) {
        select.appendChild(new Option(String(size), String(size), false, size === selected));
      }
    }
  }

  function resizeValues(rows, columns) {
    const previous = state.values;
    state.values = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => previous[row]?.[column] ?? ''),
    );
  }

  function updateDimensionLabels() {
    elements.dimensionBadge.textContent = `${state.rows} × ${state.columns}`;
    elements.rowsSelect.value = String(state.rows);
    elements.colsSelect.value = String(state.columns);
  }

  function selectInputContents(input) {
    const select = () => {
      if (document.activeElement === input) {
        input.select();
      }
    };
    select();
    requestAnimationFrame(select);
  }

  function buildEditor() {
    clear(elements.matrixEditor);
    elements.matrixEditor.style.setProperty('--cols', String(state.columns));
    elements.matrixEditor.classList.toggle('is-dense', state.columns >= 6);
    elements.matrixEditor.setAttribute(
      'aria-label',
      `矩阵元素输入，${state.rows} 行 ${state.columns} 列`,
    );

    for (let row = 0; row < state.rows; row += 1) {
      for (let column = 0; column < state.columns; column += 1) {
        const input = el('input', {
          class: 'matrix-input',
          type: 'text',
          inputmode: 'decimal',
          autocomplete: 'off',
          spellcheck: 'false',
          maxlength: '32',
          value: state.values[row][column],
          'aria-label': `第 ${row + 1} 行第 ${column + 1} 列`,
          dataset: {
            row: String(row),
            column: String(column),
          },
        });

        // A freshly focused cell is fully selected, so typing a new number
        // replaces the previous entry without manual deletion.
        let selectOnPointerUp = false;
        input.addEventListener('focus', () => {
          selectOnPointerUp = true;
          selectInputContents(input);
        });
        input.addEventListener('pointerup', () => {
          if (selectOnPointerUp) {
            selectOnPointerUp = false;
            input.select();
          }
        });
        input.addEventListener('pointerdown', () => {
          if (document.activeElement !== input) {
            selectOnPointerUp = true;
          }
        });
        input.addEventListener('blur', () => {
          selectOnPointerUp = false;
        });
        input.addEventListener('input', () => {
          selectOnPointerUp = false;
          state.values[row][column] = input.value;
          input.classList.toggle('is-symbolic', looksLikeSymbol(input.value));
          input.classList.remove('is-invalid');
          input.removeAttribute('title');
          hideInputError();
          markResultsStale();
        });
        input.addEventListener('paste', handlePaste);
        input.addEventListener('keydown', handleCellKeydown);
        if (looksLikeSymbol(input.value)) {
          input.classList.add('is-symbolic');
        }
        elements.matrixEditor.appendChild(input);
      }
    }
  }

  function selectEditorCell(row, column, focus = true) {
    const input = elements.matrixEditor.querySelector(
      `.matrix-input[data-row="${row}"][data-column="${column}"]`,
    );
    if (input && focus) {
      input.focus();
      selectInputContents(input);
    }
    return input;
  }

  function handleCellKeydown(event) {
    if (event.isComposing) return;

    // Plain arrow keys move between cells. Shift+Arrow remains available for
    // moving the text caret inside a long value.
    const isArrow = [
      'ArrowDown',
      'ArrowUp',
      'ArrowLeft',
      'ArrowRight',
    ].includes(event.key);
    if (isArrow && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      let row = Number(event.currentTarget.dataset.row);
      let column = Number(event.currentTarget.dataset.column);
      if (event.key === 'ArrowDown') row = Math.min(state.rows - 1, row + 1);
      if (event.key === 'ArrowUp') row = Math.max(0, row - 1);
      if (event.key === 'ArrowRight') column = Math.min(state.columns - 1, column + 1);
      if (event.key === 'ArrowLeft') column = Math.max(0, column - 1);
      selectEditorCell(row, column);
      return;
    }

    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const row = Number(event.currentTarget.dataset.row);
      const column = Number(event.currentTarget.dataset.column);
      const isLast = row === state.rows - 1 && column === state.columns - 1;
      if (isLast) {
        calculate({ source: 'keyboard' });
      } else {
        const nextRow = column === state.columns - 1 ? row + 1 : row;
        const nextColumn = column === state.columns - 1 ? 0 : column + 1;
        selectEditorCell(nextRow, nextColumn);
      }
    }
  }

  /**
   * Paste a tab/newline separated block from a spreadsheet. If the block is
   * larger than the current matrix, the matrix grows up to 8×8.
   */
  function handlePaste(event) {
    const clipboard = event.clipboardData?.getData('text/plain') ?? '';
    if (!/[\t\n\r]/.test(clipboard.trim())) {
      return;
    }

    event.preventDefault();
    const startRow = Number(event.currentTarget.dataset.row);
    const startColumn = Number(event.currentTarget.dataset.column);
    const lines = clipboard.replace(/\r\n?/g, '\n').split('\n');
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    if (lines.length === 0) return;

    const block = lines.map((line) => line.split('\t'));
    const blockHeight = block.length;
    const blockWidth = Math.max(...block.map((row) => row.length));

    const nextRows = Math.min(MAX_SIZE, Math.max(state.rows, startRow + blockHeight));
    const nextColumns = Math.min(MAX_SIZE, Math.max(state.columns, startColumn + blockWidth));

    if (nextRows !== state.rows || nextColumns !== state.columns) {
      state.rows = nextRows;
      state.columns = nextColumns;
      resizeValues(nextRows, nextColumns);
      updateDimensionLabels();
      buildEditor();
    }

    block.forEach((blockRow, rowOffset) => {
      blockRow.forEach((value, columnOffset) => {
        const targetRow = startRow + rowOffset;
        const targetColumn = startColumn + columnOffset;
        if (targetRow >= state.rows || targetColumn >= state.columns) return;
        state.values[targetRow][targetColumn] = value.trim();
      });
    });

    buildEditor();
    hideInputError();
    markResultsStale();
    requestAnimationFrame(() => selectEditorCell(startRow, startColumn));
  }

  function setDimensions(rows, columns) {
    state.rows = rows;
    state.columns = columns;
    resizeValues(rows, columns);
    updateDimensionLabels();
    buildEditor();
    hideInputError();
    markResultsStale();
  }

  function showInputError(invalidCells) {
    clear(elements.inputError);
    const first = invalidCells[0];
    const suffix =
      invalidCells.length > 1 ? `（另有 ${invalidCells.length - 1} 处需要修改）` : '';
    elements.inputError.textContent = `第 ${first.row + 1} 行第 ${first.column + 1} 列：${first.message}${suffix}`;
    elements.inputError.hidden = false;

    for (const cell of invalidCells) {
      const input = selectEditorCell(cell.row, cell.column, false);
      if (input) {
        input.classList.add('is-invalid');
        input.title = cell.message;
      }
    }
    selectEditorCell(first.row, first.column);
    elements.resultStatus.classList.add('is-error');
    elements.statusText.textContent = '请检查输入';
    elements.resultStatus.classList.remove('is-stale');
  }

  function hideInputError() {
    elements.inputError.hidden = true;
    elements.resultStatus.classList.remove('is-error');
    if (!elements.resultsList.hasChildNodes()) {
      elements.resultStatus.classList.remove('is-stale');
      if (elements.statusText.textContent === '请检查输入') {
        elements.statusText.textContent = '等待计算';
      }
    }
  }

  function readMatrixInput() {
    const invalid = [];
    const matrix = state.values.map((row, rowIndex) =>
      row.map((rawValue, columnIndex) => {
        try {
          return Fraction.parse(rawValue);
        } catch (error) {
          if (looksLikeSymbol(rawValue)) {
            return SymbolicValue.fromSymbol(rawValue);
          }
          invalid.push({
            row: rowIndex,
            column: columnIndex,
            message: error.message,
          });
          return Fraction.ZERO;
        }
      }),
    );
    return {
      matrix,
      invalid,
      symbolic: MatrixLab.symbolic.containsSymbols(matrix),
    };
  }

  function setChip(chip, value, options = {}) {
    clear(chip);
    if (value instanceof Node) {
      chip.appendChild(value);
    } else {
      chip.textContent = value;
    }
    chip.parentElement?.classList.toggle('is-muted', Boolean(options.muted));
    chip.parentElement?.classList.toggle('is-warning', Boolean(options.warning));
    chip.parentElement?.classList.toggle('is-symbolic', Boolean(options.symbolic));
    if (options.title) chip.title = options.title;
    else chip.removeAttribute('title');
  }

  function updateSummary(matrix, reduction) {
    const symbolic = Boolean(reduction.symbolic);
    setChip(elements.sizeChip, `${matrix.length} × ${matrix[0].length}`);

    if (symbolic && reduction.stopped) {
      setChip(
        elements.rankChip,
        reduction.rank > 0 ? `≥ ${reduction.rank}` : '待讨论',
        {
          symbolic: true,
          title:
            reduction.rank > 0
              ? '符号计算停在分类讨论处；最终秩可能更大，需按条件继续。'
              : '尚未确定任何主元，最终秩需要在分类讨论后确定。',
        },
      );
    } else {
      setChip(elements.rankChip, String(reduction.rank), {
        symbolic,
        title: reduction.pivotColumns.length
          ? `主元列：${reduction.pivotColumns.map((column) => column + 1).join('、')}`
          : '没有主元',
      });
    }

    if (matrix.length !== matrix[0].length) {
      setChip(elements.detChip, '不适用', { muted: true, title: '行列式只对方阵有定义' });
      return;
    }

    if (symbolic) {
      if (matrix.length > MatrixLab.symbolic.MAX_ADJUGATE_SIZE) {
        setChip(elements.detChip, '未展开', {
          muted: true,
          title: `符号行列式目前展开到 ${MatrixLab.symbolic.MAX_ADJUGATE_SIZE}×${MatrixLab.symbolic.MAX_ADJUGATE_SIZE}；当前矩阵更大。`,
        });
        return;
      }

      try {
        const determinant = MatrixLab.symbolic.determinant(matrix);
        const value = el('span', { class: 'summary-value-pair' });
        value.appendChild(C.valueNode(determinant));
        let suffix = null;
        if (determinant.isZero()) {
          suffix = '恒为 0';
        } else if (!determinant.isNumeric()) {
          suffix = '含参数';
        }
        if (suffix) value.appendChild(el('span', { class: 'chip-suffix' }, suffix));

        setChip(elements.detChip, value, {
          symbolic: !determinant.isNumeric(),
          warning: determinant.isZero(),
          title: determinant.isZero()
            ? '该符号行列式恒为 0；对任意参数取值矩阵都不可逆。'
            : determinant.isNumeric()
              ? '行列式为非零常数，矩阵无条件可逆。'
              : '行列式含参数；当行列式非零时矩阵可逆，特殊取值需另行讨论。',
        });
      } catch (error) {
        setChip(elements.detChip, '计算量过大', {
          muted: true,
          title: error.message,
        });
      }
      return;
    }

    const determinant = MatrixLab.algorithms.determinant(matrix);
    const value = el('span', { class: 'summary-value-pair' });
    value.appendChild(C.fractionNode(determinant));
    if (determinant.isZero()) {
      value.appendChild(el('span', { class: 'chip-suffix' }, '奇异'));
    }
    setChip(elements.detChip, value, {
      warning: determinant.isZero(),
      title: determinant.isZero() ? '行列式为 0，矩阵不可逆' : '行列式非零，矩阵可逆',
    });
  }

  function featureCard(feature, model, index) {
    let badge;
    try {
      badge = feature.badge ? feature.badge(model) : '';
    } catch (error) {
      badge = '';
    }

    const card = el(
      'article',
      {
        class: 'result-card',
        style: `--card-order: ${index}`,
        'aria-labelledby': `feature-title-${feature.id}`,
      },
      el(
        'header',
        { class: 'result-card-heading' },
        el(
          'div',
          { class: 'result-card-title' },
          el('span', { class: 'result-index' }, String(index + 1).padStart(2, '0')),
          el(
            'div',
            {},
            el('p', { class: 'result-eyebrow' }, feature.eyebrow),
            el('h3', { id: `feature-title-${feature.id}` }, feature.title),
            el('p', { class: 'result-description' }, feature.description),
          ),
        ),
        badge ? el('span', { class: 'result-badge' }, badge) : null,
      ),
    );

    try {
      card.appendChild(feature.render(model));
    } catch (error) {
      console.error(error);
      card.appendChild(
        C.unavailableState('该结果暂时无法显示', error.message || '发生了未知错误。'),
      );
    }
    return card;
  }

  function renderResults(matrix) {
    const features = MatrixLab.featureRegistry.list();
    const symbolic = MatrixLab.symbolic.containsSymbols(matrix);
    const reduction = symbolic
      ? MatrixLab.symbolic.rref(matrix)
      : MatrixLab.algorithms.rref(matrix);

    clear(elements.resultsList);
    elements.emptyState.hidden = true;
    elements.symbolicNotice.hidden = !symbolic;

    features.forEach((feature, index) => {
      let model;
      try {
        model = feature.compute(matrix);
      } catch (error) {
        console.error(error);
        const brokenCard = el(
          'article',
          { class: 'result-card' },
          el(
            'header',
            { class: 'result-card-heading' },
            el(
              'div',
              { class: 'result-card-title' },
              el('span', { class: 'result-index' }, String(index + 1).padStart(2, '0')),
              el(
                'div',
                {},
                el('p', { class: 'result-eyebrow' }, feature.eyebrow),
                el('h3', {}, feature.title),
                el('p', { class: 'result-description' }, feature.description),
              ),
            ),
          ),
        );
        brokenCard.appendChild(
          C.unavailableState('该功能计算失败', error.message || '发生了未知错误。'),
        );
        elements.resultsList.appendChild(brokenCard);
        return;
      }
      elements.resultsList.appendChild(featureCard(feature, model, index));
    });

    updateSummary(matrix, reduction);
    elements.staleNotice.hidden = true;
    elements.resultStatus.classList.remove('is-stale', 'is-error');
    const clock = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (symbolic && reduction.stopped) {
      elements.statusText.textContent = '符号模式 · 已停在分类讨论';
    } else if (symbolic) {
      elements.statusText.textContent = `符号计算完成 · ${clock}`;
    } else {
      elements.statusText.textContent = `已更新 · ${clock}`;
    }
  }

  function calculate(options = {}) {
    const { matrix, invalid } = readMatrixInput();
    if (invalid.length > 0) {
      showInputError(invalid);
      return;
    }

    hideInputError();
    renderResults(matrix);

    if (options.source === 'button' || options.source === 'keyboard') {
      if (window.matchMedia('(max-width: 980px)').matches) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        elements.results.scrollIntoView({
          behavior: smooth ? 'smooth' : 'auto',
          block: 'start',
        });
      }
    }
  }

  function markResultsStale() {
    if (!elements.resultsList.hasChildNodes()) {
      return;
    }
    elements.staleNotice.hidden = false;
    elements.resultStatus.classList.add('is-stale');
    elements.resultStatus.classList.remove('is-error');
    elements.statusText.textContent = '输入已修改';
  }

  function resetOutputs() {
    clear(elements.resultsList);
    elements.emptyState.hidden = false;
    elements.staleNotice.hidden = true;
    elements.symbolicNotice.hidden = true;
    elements.resultStatus.classList.remove('is-stale', 'is-error');
    elements.statusText.textContent = '等待输入';
    setChip(elements.sizeChip, `${state.rows} × ${state.columns}`);
    setChip(elements.rankChip, '—', { muted: true });
    setChip(elements.detChip, '—', { muted: true });
  }

  function clearMatrix() {
    state.values = Array.from({ length: state.rows }, () =>
      Array.from({ length: state.columns }, () => ''),
    );
    buildEditor();
    hideInputError();
    resetOutputs();
    selectEditorCell(0, 0);
  }

  function randomExample() {
    const rows = 2 + Math.floor(Math.random() * 3);
    const columns = 2 + Math.floor(Math.random() * 3);
    let values;
    let attempts = 0;

    do {
      values = Array.from({ length: rows }, () =>
        Array.from({ length: columns }, () => String(Math.floor(Math.random() * 9) - 4)),
      );
      attempts += 1;
    } while (
      attempts < 20 &&
      values.every((row) => row.every((value) => value === '0'))
    );

    state.rows = rows;
    state.columns = columns;
    state.values = values;
    updateDimensionLabels();
    buildEditor();
    hideInputError();
    calculate({ source: 'random' });
  }

  function bindEvents() {
    elements.rowsSelect.addEventListener('change', () => {
      setDimensions(Number(elements.rowsSelect.value), state.columns);
    });
    elements.colsSelect.addEventListener('change', () => {
      setDimensions(state.rows, Number(elements.colsSelect.value));
    });
    elements.calculateButton.addEventListener('click', () => calculate({ source: 'button' }));
    elements.randomButton.addEventListener('click', randomExample);
    elements.clearButton.addEventListener('click', clearMatrix);

    for (const swatch of elements.colorSwatches) {
      swatch.addEventListener('click', () => applyButtonColor(swatch.dataset.color));
    }
    elements.customColor.addEventListener('input', () => {
      applyButtonColor(elements.customColor.value);
    });

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        calculate({ source: 'keyboard' });
      }
    });
  }

  function init() {
    cacheElements();
    fillDimensionSelects();
    updateDimensionLabels();
    buildEditor();
    initButtonColor();
    bindEvents();
    calculate({ source: 'initial' });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
