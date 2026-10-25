/*
 * Matrix arithmetic mode: A + B, A - B, A x B and A^T.
 * The editor intentionally mirrors the analysis mode's interaction model:
 * focus selects the old value, arrows move between cells, and computed results
 * stay visible while inputs are being changed.
 */
(function (root) {
  'use strict';

  const MatrixLab = root.MatrixLab;
  const { el, clear } = MatrixLab.ui.dom;
  const C = MatrixLab.ui.components;
  const Fraction = MatrixLab.Fraction;
  const SymbolicValue = MatrixLab.SymbolicValue;
  const MAX_SIZE = 8;
  const DEFINITIONS = MatrixLab.matrixOperations.definitions;
  const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

  const OPERATION_HINTS = {
    add: 'A 与 B 尺寸相同，逐元素相加；B 的尺寸自动匹配 A。',
    subtract: 'A 与 B 尺寸相同，逐元素相减；B 的尺寸自动匹配 A。',
    multiply: 'A 的列数等于 B 的行数；B 的行数已自动同步，可调整 B 的列数。',
    transpose: '转置只使用 A：把第 i 行第 j 列搬到第 j 行第 i 列。',
  };

  const RESULT_INTROS = {
    add: '逐元素相加，分数与符号常数都保持精确。',
    subtract: '逐元素相减，分数与符号常数都保持精确。',
    multiply: '按“行乘列”规则计算每个元素，并保留乘法明细。',
    transpose: '行列互换得到结果；原矩阵的每个元素都保持精确。',
  };

  const state = {
    operation: 'add',
    aRows: 2,
    aCols: 2,
    bRows: 2,
    bCols: 2,
    aValues: [
      ['2', '1'],
      ['4', '3'],
    ],
    bValues: [
      ['1', '2'],
      ['0', '1'],
    ],
  };

  const elements = {};

  function looksLikeSymbol(rawValue) {
    return /\p{L}/u.test(String(rawValue ?? '').trim());
  }

  function subscript(number) {
    return String(number)
      .split('')
      .map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit)
      .join('');
  }

  function resizeValues(values, rows, columns) {
    return Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => values[row]?.[column] ?? ''),
    );
  }

  function cacheElements() {
    elements.operationButtons = [...document.querySelectorAll('.operation-option')];
    elements.operationGlyph = document.getElementById('operationGlyph');
    elements.workbench = document.getElementById('operationWorkbench');
    elements.operandBPanel = document.getElementById('operandBPanel');
    elements.operandBNote = document.getElementById('operandBNote');
    elements.aRows = document.getElementById('operandARows');
    elements.aCols = document.getElementById('operandACols');
    elements.bRows = document.getElementById('operandBRows');
    elements.bCols = document.getElementById('operandBCols');
    elements.aMeta = document.getElementById('operandAMeta');
    elements.bMeta = document.getElementById('operandBMeta');
    elements.aEditor = document.getElementById('operandAEditor');
    elements.bEditor = document.getElementById('operandBEditor');
    elements.operationHint = document.getElementById('operationHint');
    elements.calculateButton = document.getElementById('arithmeticCalculate');
    elements.calculateLabel = document.getElementById('arithmeticCalculateLabel');
    elements.randomButton = document.getElementById('arithmeticRandom');
    elements.clearButton = document.getElementById('arithmeticClear');
    elements.error = document.getElementById('arithmeticError');
    elements.symbolicNotice = document.getElementById('arithmeticSymbolicNotice');
    elements.staleNotice = document.getElementById('arithmeticStaleNotice');
    elements.resultHeading = document.getElementById('arithmeticResultHeading');
    elements.resultSubtitle = document.getElementById('arithmeticResultSubtitle');
    elements.status = document.getElementById('arithmeticStatus');
    elements.statusText = document.getElementById('arithmeticStatusText');
    elements.operationChip = document.getElementById('arithmeticOperationChip');
    elements.sizeChip = document.getElementById('arithmeticSizeChip');
    elements.typeChip = document.getElementById('arithmeticTypeChip');
    elements.resultList = document.getElementById('arithmeticResultList');
    elements.results = document.getElementById('arithmeticResults');
  }

  function fillSelects() {
    for (const select of [elements.aRows, elements.aCols, elements.bRows, elements.bCols]) {
      for (let size = 1; size <= MAX_SIZE; size += 1) {
        select.appendChild(new Option(String(size), String(size)));
      }
    }
  }

  function syncSelects() {
    elements.aRows.value = String(state.aRows);
    elements.aCols.value = String(state.aCols);
    elements.bRows.value = String(state.bRows);
    elements.bCols.value = String(state.bCols);
  }

  function updateOperandMeta() {
    elements.aMeta.textContent = `${state.aRows} 行 × ${state.aCols} 列`;
    elements.bMeta.textContent = `${state.bRows} 行 × ${state.bCols} 列`;
  }

  function syncBDimensions() {
    const operation = state.operation;
    if (operation === 'transpose') return;

    const targetRows = operation === 'multiply' ? state.aCols : state.aRows;
    const targetColumns = operation === 'multiply' ? state.bCols : state.aCols;

    if (state.bRows !== targetRows) {
      state.bRows = targetRows;
      state.bValues = resizeValues(state.bValues, state.bRows, state.bCols);
    }
    if (state.bCols !== targetColumns) {
      state.bCols = targetColumns;
      state.bValues = resizeValues(state.bValues, state.bRows, state.bCols);
    }
  }

  function syncDimensionControls() {
    syncSelects();
    updateOperandMeta();

    const transpose = state.operation === 'transpose';
    const multiply = state.operation === 'multiply';

    elements.operandBPanel.hidden = transpose;
    elements.operationGlyph.hidden = transpose;
    elements.workbench.classList.toggle('is-single', transpose);
    elements.bRows.disabled = true;
    elements.bCols.disabled = !multiply;
    elements.bRows.setAttribute('aria-description', '根据运算自动同步');
    elements.bCols.setAttribute(
      'aria-description',
      multiply ? '可调整 B 的列数' : '根据运算自动同步',
    );
  }

  function updateOperationChrome() {
    const definition = DEFINITIONS[state.operation];
    const transpose = state.operation === 'transpose';

    for (const button of elements.operationButtons) {
      const active = button.dataset.operation === state.operation;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }

    elements.operationGlyph.textContent = definition.symbol;
    elements.operationGlyph.hidden = transpose;
    elements.operationHint.textContent = OPERATION_HINTS[state.operation];
    elements.calculateLabel.textContent = `计算 ${definition.expression}`;
    elements.operandBNote.textContent = transpose
      ? '转置不使用矩阵 B'
      : state.operation === 'multiply'
        ? '行数自动匹配 A 的列数；B 的列数可调'
        : '尺寸自动匹配矩阵 A';
    elements.operationChip.textContent = definition.expression;
  }

  function selectInput(input) {
    const select = () => {
      if (document.activeElement === input) input.select();
    };
    select();
    requestAnimationFrame(select);
  }

  function cellInput(which, row, column) {
    const editor = which === 'a' ? elements.aEditor : elements.bEditor;
    return editor.querySelector(
      `.matrix-input[data-row="${row}"][data-column="${column}"]`,
    );
  }

  function focusCell(which, row, column) {
    const input = cellInput(which, row, column);
    if (!input) return;
    input.focus();
    selectInput(input);
  }

  function hasResult() {
    return Boolean(elements.resultList.querySelector('.result-card'));
  }

  function markStale() {
    if (!hasResult()) return;
    elements.staleNotice.hidden = false;
    elements.status.classList.add('is-stale');
    elements.status.classList.remove('is-error');
    elements.statusText.textContent = '输入已修改';
  }

  function hideError() {
    elements.error.hidden = true;
    elements.status.classList.remove('is-error');
    if (!hasResult() && elements.statusText.textContent === '请检查输入') {
      elements.status.classList.remove('is-stale');
      elements.statusText.textContent = '等待输入';
    }
  }

  function showError(message, invalidCells = []) {
    elements.error.textContent = message;
    elements.error.hidden = false;
    elements.status.classList.add('is-error');
    elements.status.classList.remove('is-stale');
    elements.statusText.textContent = '请检查输入';

    for (const cell of invalidCells) {
      const input = cellInput(cell.matrix, cell.row, cell.column);
      if (input) {
        input.classList.add('is-invalid');
        input.title = cell.message;
      }
    }
    if (invalidCells.length > 0) {
      const first = invalidCells[0];
      focusCell(first.matrix, first.row, first.column);
    }
  }

  function handlePaste(event, which, row, column) {
    const clipboard = event.clipboardData?.getData('text/plain') ?? '';
    if (!/[\t\n\r]/.test(clipboard.trim())) return;

    event.preventDefault();
    const lines = clipboard.replace(/\r\n?/g, '\n').split('\n');
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length === 0) return;

    const values = which === 'a' ? state.aValues : state.bValues;
    const rows = which === 'a' ? state.aRows : state.bRows;
    const columns = which === 'a' ? state.aCols : state.bCols;

    lines.forEach((line, rowOffset) => {
      line.split('\t').forEach((value, columnOffset) => {
        const targetRow = row + rowOffset;
        const targetColumn = column + columnOffset;
        if (targetRow >= rows || targetColumn >= columns) return;
        values[targetRow][targetColumn] = value.trim();
      });
    });

    buildEditor(which);
    hideError();
    markStale();
    requestAnimationFrame(() => focusCell(which, row, column));
  }

  function handleCellKeydown(event, which, row, column) {
    if (event.isComposing) return;

    const rows = which === 'a' ? state.aRows : state.bRows;
    const columns = which === 'a' ? state.aCols : state.bCols;
    const isArrow = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key);

    if (isArrow && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      let nextRow = row;
      let nextColumn = column;
      if (event.key === 'ArrowDown') nextRow = Math.min(rows - 1, row + 1);
      if (event.key === 'ArrowUp') nextRow = Math.max(0, row - 1);
      if (event.key === 'ArrowRight') nextColumn = Math.min(columns - 1, column + 1);
      if (event.key === 'ArrowLeft') nextColumn = Math.max(0, column - 1);
      focusCell(which, nextRow, nextColumn);
      return;
    }

    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const last = row === rows - 1 && column === columns - 1;
      if (last) {
        calculate({ source: 'keyboard' });
      } else {
        const nextRow = column === columns - 1 ? row + 1 : row;
        const nextColumn = column === columns - 1 ? 0 : column + 1;
        focusCell(which, nextRow, nextColumn);
      }
    }
  }

  function buildEditor(which) {
    const editor = which === 'a' ? elements.aEditor : elements.bEditor;
    const rows = which === 'a' ? state.aRows : state.bRows;
    const columns = which === 'a' ? state.aCols : state.bCols;
    const values = which === 'a' ? state.aValues : state.bValues;
    const label = which === 'a' ? 'A' : 'B';

    clear(editor);
    editor.style.setProperty('--cols', String(columns));
    editor.classList.toggle('is-dense', columns >= 6);
    editor.setAttribute('aria-label', `矩阵 ${label} 元素输入，${rows} 行 ${columns} 列`);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const input = el('input', {
          class: 'matrix-input',
          type: 'text',
          inputmode: 'decimal',
          autocomplete: 'off',
          spellcheck: 'false',
          maxlength: '32',
          value: values[row][column],
          'aria-label': `矩阵 ${label} 第 ${row + 1} 行第 ${column + 1} 列`,
          dataset: {
            matrix: which,
            row: String(row),
            column: String(column),
          },
        });

        let selectOnPointerUp = false;
        input.addEventListener('focus', () => {
          selectOnPointerUp = true;
          selectInput(input);
        });
        input.addEventListener('pointerdown', () => {
          if (document.activeElement !== input) selectOnPointerUp = true;
        });
        input.addEventListener('pointerup', () => {
          if (selectOnPointerUp) {
            selectOnPointerUp = false;
            input.select();
          }
        });
        input.addEventListener('blur', () => {
          selectOnPointerUp = false;
        });
        input.addEventListener('input', () => {
          selectOnPointerUp = false;
          values[row][column] = input.value;
          input.classList.toggle('is-symbolic', looksLikeSymbol(input.value));
          input.classList.remove('is-invalid');
          input.removeAttribute('title');
          hideError();
          markStale();
        });
        input.addEventListener('paste', (event) => handlePaste(event, which, row, column));
        input.addEventListener('keydown', (event) =>
          handleCellKeydown(event, which, row, column),
        );

        if (looksLikeSymbol(input.value)) {
          input.classList.add('is-symbolic');
        }
        editor.appendChild(input);
      }
    }
  }

  function buildEditors() {
    buildEditor('a');
    if (state.operation !== 'transpose') {
      buildEditor('b');
    }
  }

  function parseCell(rawValue) {
    try {
      return Fraction.parse(rawValue);
    } catch (error) {
      if (looksLikeSymbol(rawValue)) {
        return SymbolicValue.fromSymbol(rawValue);
      }
      throw error;
    }
  }

  function readMatrix(which) {
    const rows = which === 'a' ? state.aRows : state.bRows;
    const columns = which === 'a' ? state.aCols : state.bCols;
    const values = which === 'a' ? state.aValues : state.bValues;
    const invalid = [];

    const matrix = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => {
        try {
          return parseCell(values[row][column]);
        } catch (error) {
          invalid.push({
            matrix: which,
            row,
            column,
            message: error.message,
          });
          return Fraction.ZERO;
        }
      }),
    );

    return { matrix, invalid };
  }

  function updateSummary(result, definition, symbolic) {
    const expression = definition.expression;
    const dimensions = `${result.length} × ${result[0].length}`;
    elements.operationChip.textContent = expression;
    elements.sizeChip.textContent = dimensions;
    elements.typeChip.textContent = symbolic ? '精确符号式' : '精确有理数';
  }

  function multiplicationDetails(left, right, result) {
    const list = el('div', { class: 'arithmetic-detail-list' });

    result.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        const parts = [];
        for (let index = 0; index < left[0].length; index += 1) {
          const a = C.valueLabel(left[rowIndex][index]);
          const b = C.valueLabel(right[index][columnIndex]);
          parts.push(`(${a})·(${b})`);
        }
        const formula = `C${subscript(rowIndex + 1)}${subscript(columnIndex + 1)} = ${parts.join(' + ')} = ${C.valueLabel(value)}`;
        list.appendChild(
          el(
            'div',
            { class: 'arithmetic-detail-item' },
            el(
              'span',
              { class: 'arithmetic-detail-index' },
              `C${subscript(rowIndex + 1)}${subscript(columnIndex + 1)}`,
            ),
            el('code', { class: 'arithmetic-detail-formula' }, formula),
          ),
        );
      });
    });

    return el(
      'details',
      { class: 'steps-panel arithmetic-steps-panel' },
      el(
        'summary',
        { class: 'steps-summary' },
        el(
          'span',
          { class: 'steps-summary-main' },
          el('span', { class: 'steps-plus', 'aria-hidden': 'true' }),
          el('span', { class: 'steps-title' }, '乘法展开明细'),
        ),
        el(
          'span',
          { class: 'steps-meta' },
          `${result.length * result[0].length} 个元素 · 行乘列`,
          el('span', { class: 'steps-chevron', 'aria-hidden': 'true' }),
        ),
      ),
      el('div', { class: 'steps-body' }, list),
    );
  }

  function buildResultCard(outcome, definition, left, right) {
    const { result, symbolic } = outcome;
    const rows = result.length;
    const columns = result[0].length;
    const factList = el(
      'div',
      { class: 'result-facts' },
      C.fact('运算', definition.label, { note: definition.expression }),
      C.fact('结果尺寸', `${rows} × ${columns}`, { note: '行 × 列' }),
      C.fact('数值类型', symbolic ? '符号式' : '有理数', {
        note: symbolic ? '保留独立常数' : '精确分数',
        tone: symbolic ? 'symbolic' : undefined,
      }),
    );

    const card = el(
      'article',
      { class: 'result-card arithmetic-result-card' },
      el(
        'header',
        { class: 'result-card-heading' },
        el(
          'div',
          { class: 'result-card-title' },
          el(
            'span',
            { class: 'result-index arithmetic-result-index' },
            definition.symbol,
          ),
          el(
            'div',
            {},
            el('p', { class: 'result-eyebrow' }, definition.expression),
            el('h3', {}, `${definition.label}结果`),
            el('p', { class: 'result-description' }, RESULT_INTROS[state.operation]),
          ),
        ),
        el('span', { class: 'result-badge' }, `${rows} × ${columns}`),
      ),
      el(
        'div',
        { class: 'result-lead' },
        el(
          'div',
          { class: 'result-matrix' },
          C.matrixCaption(`C = ${definition.expression}`, '精确结果'),
          C.matrixBlock(result, {
            ariaLabel: `${definition.expression} 的计算结果`,
          }),
        ),
        factList,
      ),
      C.callout(`计算规则：${definition.formula}。`),
      state.operation === 'multiply' ? multiplicationDetails(left, right, result) : null,
    );

    return card;
  }

  function showEmptyState() {
    clear(elements.resultList);
    elements.resultList.appendChild(
      el(
        'div',
        { class: 'empty-state arithmetic-empty-state' },
        el('span', { class: 'empty-glyph', 'aria-hidden': 'true' }, '[ ]'),
        el('p', {}, '还没有结果。输入矩阵后点击“计算”按钮。'),
      ),
    );
  }

  function renderResult(outcome) {
    const definition = DEFINITIONS[state.operation];
    const left = state.lastOperands.left;
    const right = state.lastOperands.right;
    elements.symbolicNotice.hidden = !outcome.symbolic;
    elements.staleNotice.hidden = true;
    elements.status.classList.remove('is-stale', 'is-error');

    clear(elements.resultList);
    elements.resultList.appendChild(buildResultCard(outcome, definition, left, right));

    updateSummary(outcome.result, definition, outcome.symbolic);
    elements.resultHeading.textContent = `${definition.expression} 的结果`;
    elements.resultSubtitle.textContent = RESULT_INTROS[state.operation];
    const clock = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    elements.statusText.textContent = outcome.symbolic
      ? `符号运算完成 · ${clock}`
      : `已更新 · ${clock}`;
  }

  function calculate() {
    const definition = DEFINITIONS[state.operation];
    const aRead = readMatrix('a');
    const bRead = state.operation === 'transpose' ? { matrix: null, invalid: [] } : readMatrix('b');
    const invalid = [...aRead.invalid, ...bRead.invalid];

    for (const input of document.querySelectorAll('#operandAEditor .matrix-input, #operandBEditor .matrix-input')) {
      input.classList.remove('is-invalid');
      input.removeAttribute('title');
    }

    if (invalid.length > 0) {
      const first = invalid[0];
      const matrixLabel = first.matrix === 'a' ? 'A' : 'B';
      const suffix =
        invalid.length > 1 ? `（另有 ${invalid.length - 1} 处需要修改）` : '';
      showError(
        `矩阵 ${matrixLabel} 第 ${first.row + 1} 行第 ${first.column + 1} 列：${first.message}${suffix}`,
        invalid,
      );
      return;
    }

    hideError();

    try {
      const outcome = MatrixLab.matrixOperations.compute(
        state.operation,
        aRead.matrix,
        bRead.matrix,
      );
      state.lastOperands = { left: aRead.matrix, right: bRead.matrix };
      renderResult(outcome);
    } catch (error) {
      console.error(error);
      showError(error.message || '矩阵运算失败，请检查输入。');
      elements.statusText.textContent = '无法计算';
    }
  }

  function setOperation(operation, options = {}) {
    if (!DEFINITIONS[operation]) return;
    state.operation = operation;
    hideError();
    syncBDimensions();
    updateOperationChrome();
    syncDimensionControls();
    buildEditors();
    if (options.calculate !== false) {
      calculate();
    } else {
      markStale();
    }
  }

  function updateADimensions() {
    state.aRows = Number(elements.aRows.value);
    state.aCols = Number(elements.aCols.value);
    state.aValues = resizeValues(state.aValues, state.aRows, state.aCols);
    syncBDimensions();
    syncDimensionControls();
    buildEditors();
    syncSelects();
    hideError();
    markStale();
  }

  function updateBColumns() {
    state.bCols = Number(elements.bCols.value);
    state.bValues = resizeValues(state.bValues, state.bRows, state.bCols);
    syncDimensionControls();
    buildEditor('b');
    syncSelects();
    hideError();
    markStale();
  }

  function randomInteger(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function randomMatrix(rows, columns) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => String(randomInteger(-4, 4))),
    );
  }

  function randomExample() {
    const aRows = randomInteger(2, 4);
    const aCols = randomInteger(2, 4);
    state.aRows = aRows;
    state.aCols = aCols;
    state.aValues = randomMatrix(aRows, aCols);

    if (state.operation === 'multiply') {
      state.bRows = aCols;
      state.bCols = randomInteger(2, 4);
    } else {
      state.bRows = aRows;
      state.bCols = aCols;
    }
    state.bValues = randomMatrix(state.bRows, state.bCols);

    syncDimensionControls();
    syncSelects();
    buildEditors();
    hideError();
    calculate();
  }

  function clearMatrices() {
    state.aValues = resizeValues([], state.aRows, state.aCols);
    state.bValues = resizeValues([], state.bRows, state.bCols);
    buildEditors();
    hideError();
    elements.staleNotice.hidden = true;
    elements.symbolicNotice.hidden = true;
    elements.status.classList.remove('is-stale', 'is-error');
    elements.statusText.textContent = '等待输入';
    elements.resultHeading.textContent = '计算结果';
    elements.resultSubtitle.textContent = '输入矩阵后点击计算。';
    elements.operationChip.textContent = DEFINITIONS[state.operation].expression;
    elements.sizeChip.textContent = '—';
    elements.typeChip.textContent = '—';
    showEmptyState();
  }

  function bindEvents() {
    for (const button of elements.operationButtons) {
      button.addEventListener('click', () => {
        setOperation(button.dataset.operation);
      });
    }

    elements.aRows.addEventListener('change', updateADimensions);
    elements.aCols.addEventListener('change', updateADimensions);
    elements.bCols.addEventListener('change', updateBColumns);

    elements.calculateButton.addEventListener('click', calculate);
    elements.randomButton.addEventListener('click', randomExample);
    elements.clearButton.addEventListener('click', clearMatrices);

    document.addEventListener('keydown', (event) => {
      if (document.documentElement.dataset.mode !== 'operations') return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        calculate();
      }
    });
  }

  function init() {
    cacheElements();
    fillSelects();
    updateOperationChrome();
    syncBDimensions();
    syncDimensionControls();
    buildEditors();
    bindEvents();
    calculate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
