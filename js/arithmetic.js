/*
 * Matrix expression builder.
 *
 * Two matrices are shown initially. Operation selectors sit between adjacent
 * matrices, while the three gaps around/between the first pair each expose an
 * "add" action. Adding a matrix opens a type dialog (normal / identity / zero),
 * which lets the expression grow to multiple matrices.
 */
(function (root) {
  'use strict';

  const MatrixLab = root.MatrixLab;
  const { el, clear } = MatrixLab.ui.dom;
  const C = MatrixLab.ui.components;
  const Fraction = MatrixLab.Fraction;
  const SymbolicValue = MatrixLab.SymbolicValue;
  const MAX_SIZE = 8;
  const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

  const KIND_LABELS = {
    normal: '普通矩阵',
    identity: '单位矩阵',
    zero: '零矩阵',
  };

  const OP_OPTIONS = [
    ['add', '+', '加法'],
    ['subtract', '−', '减法'],
    ['multiply', '×', '乘法'],
  ];

  const state = {
    matrices: [
      {
        key: 1,
        label: 'A',
        kind: 'normal',
        rows: 2,
        cols: 2,
        values: [
          ['2', '1'],
          ['4', '3'],
        ],
        transposed: false,
      },
      {
        key: 2,
        label: 'B',
        kind: 'normal',
        rows: 2,
        cols: 2,
        values: [
          ['1', '2'],
          ['0', '1'],
        ],
        transposed: false,
      },
    ],
    connectors: [{ op: 'add' }],
    nextKey: 3,
    pendingGap: null,
  };

  const elements = {};

  function looksLikeSymbol(rawValue) {
    return /\p{L}/u.test(String(rawValue ?? '').trim());
  }

  function matrixLabel(index) {
    if (index < 26) return String.fromCharCode(65 + index);
    return `M${index + 1}`;
  }

  function relabelMatrices() {
    state.matrices.forEach((entry, index) => {
      entry.label = matrixLabel(index);
    });
  }

  function displayLabel(entry) {
    return `${entry.label}${entry.transposed ? 'ᵀ' : ''}`;
  }

  function subscript(number) {
    return String(number)
      .split('')
      .map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit)
      .join('');
  }

  function blankValues(rows, columns) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => ''),
    );
  }

  function resizeValues(values, rows, columns) {
    return Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => values[row]?.[column] ?? ''),
    );
  }

  function typedValues(entry) {
    if (entry.kind === 'normal') return null;
    if (entry.kind === 'identity') {
      return Array.from({ length: entry.rows }, (_, row) =>
        Array.from({ length: entry.cols }, (_, column) =>
          row === column ? Fraction.ONE : Fraction.ZERO,
        ),
      );
    }
    return Array.from({ length: entry.rows }, () =>
      Array.from({ length: entry.cols }, () => Fraction.ZERO),
    );
  }

  function operationExpression(matrices, connectors) {
    return MatrixLab.expressions.expressionString(matrices, connectors);
  }

  function fillDimensionSelect(select) {
    clear(select);
    for (let size = 1; size <= MAX_SIZE; size += 1) {
      select.appendChild(new Option(String(size), String(size)));
    }
  }

  function cacheElements() {
    elements.builder = document.getElementById('expressionBuilder');
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

    elements.dialog = document.getElementById('addMatrixDialog');
    elements.dialogForm = document.getElementById('addMatrixForm');
    elements.dialogClose = document.getElementById('addMatrixClose');
    elements.dialogCancel = document.getElementById('addMatrixCancel');
    elements.dialogRows = document.getElementById('addMatrixRows');
    elements.dialogCols = document.getElementById('addMatrixCols');
    elements.dialogPosition = document.getElementById('addMatrixPosition');
    elements.dialogTypeInputs = [
      ...document.querySelectorAll('input[name="matrixKind"]'),
    ];
  }

  function updateHint() {
    const expression = operationExpression(state.matrices, state.connectors);
    elements.operationHint.textContent = `当前表达式：${expression}。乘法优先于加减，同级运算从左到右；右上角 ᵀ 表示计算前先转置。`;
    elements.calculateLabel.textContent = '计算结果';
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
      const input = document.querySelector(
        `.matrix-input[data-key="${cell.key}"][data-row="${cell.row}"][data-column="${cell.column}"]`,
      );
      if (input) {
        input.classList.add('is-invalid');
        input.title = cell.message;
      }
    }
    if (invalidCells.length > 0) {
      const first = invalidCells[0];
      focusCell(first.key, first.row, first.column);
    }
  }

  function selectInput(input) {
    const select = () => {
      if (document.activeElement === input) input.select();
    };
    select();
    requestAnimationFrame(select);
  }

  function focusCell(key, row, column) {
    const input = document.querySelector(
      `.matrix-input[data-key="${key}"][data-row="${row}"][data-column="${column}"]`,
    );
    if (!input) return;
    input.focus();
    selectInput(input);
  }

  function handleCellKeydown(event, entry, row, column) {
    if (event.isComposing) return;
    const isArrow = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key);

    if (isArrow && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      let nextRow = row;
      let nextColumn = column;
      if (event.key === 'ArrowDown') nextRow = Math.min(entry.rows - 1, row + 1);
      if (event.key === 'ArrowUp') nextRow = Math.max(0, row - 1);
      if (event.key === 'ArrowRight') nextColumn = Math.min(entry.cols - 1, column + 1);
      if (event.key === 'ArrowLeft') nextColumn = Math.max(0, column - 1);
      focusCell(entry.key, nextRow, nextColumn);
      return;
    }

    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const last = row === entry.rows - 1 && column === entry.cols - 1;
      if (last) {
        calculate();
      } else {
        const nextRow = column === entry.cols - 1 ? row + 1 : row;
        const nextColumn = column === entry.cols - 1 ? 0 : column + 1;
        focusCell(entry.key, nextRow, nextColumn);
      }
    }
  }

  function handlePaste(event, entry, row, column) {
    const clipboard = event.clipboardData?.getData('text/plain') ?? '';
    if (!/[\t\n\r]/.test(clipboard.trim())) return;
    event.preventDefault();

    const lines = clipboard.replace(/\r\n?/g, '\n').split('\n');
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length === 0) return;

    lines.forEach((line, rowOffset) => {
      line.split('\t').forEach((value, columnOffset) => {
        const targetRow = row + rowOffset;
        const targetColumn = column + columnOffset;
        if (targetRow >= entry.rows || targetColumn >= entry.cols) return;
        entry.values[targetRow][targetColumn] = value.trim();
      });
    });

    buildMatrixCardBody(entry);
    hideError();
    markStale();
    requestAnimationFrame(() => focusCell(entry.key, row, column));
  }

  function buildMatrixEditor(entry, container) {
    clear(container);
    container.style.setProperty('--cols', String(entry.cols));
    container.classList.toggle('is-dense', entry.cols >= 6);
    container.setAttribute(
      'aria-label',
      `矩阵 ${entry.label} 元素输入，${entry.rows} 行 ${entry.cols} 列`,
    );

    for (let row = 0; row < entry.rows; row += 1) {
      for (let column = 0; column < entry.cols; column += 1) {
        const input = el('input', {
          class: 'matrix-input',
          type: 'text',
          inputmode: 'decimal',
          autocomplete: 'off',
          spellcheck: 'false',
          maxlength: '32',
          value: entry.values[row][column],
          'aria-label': `矩阵 ${entry.label} 第 ${row + 1} 行第 ${column + 1} 列`,
          dataset: {
            key: String(entry.key),
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
          entry.values[row][column] = input.value;
          input.classList.toggle('is-symbolic', looksLikeSymbol(input.value));
          input.classList.remove('is-invalid');
          input.removeAttribute('title');
          hideError();
          markStale();
          updateHint();
        });
        input.addEventListener('paste', (event) => handlePaste(event, entry, row, column));
        input.addEventListener('keydown', (event) =>
          handleCellKeydown(event, entry, row, column),
        );

        if (looksLikeSymbol(input.value)) input.classList.add('is-symbolic');
        container.appendChild(input);
      }
    }
  }

  function buildMatrixCardBody(entry) {
    const card = document.querySelector(`.expression-matrix-card[data-key="${entry.key}"]`);
    if (!card) return;
    const body = card.querySelector('.expression-card-body');
    if (!body) return;
    clear(body);

    if (entry.kind === 'normal') {
      const editor = el('div', {
        class: 'matrix-editor operand-editor',
        role: 'group',
      });
      const frame = el('div', { class: 'operand-editor-frame' }, editor);
      body.appendChild(frame);
      buildMatrixEditor(entry, editor);
      return;
    }

    const matrix = typedValues(entry);
    body.appendChild(
      el(
        'div',
        { class: 'static-matrix-frame' },
        C.matrixBlock(matrix, {
          ariaLabel: `${KIND_LABELS[entry.kind]} ${entry.rows}×${entry.cols}`,
        }),
        el(
          'p',
          { class: 'static-matrix-note' },
          entry.kind === 'identity'
            ? '单位矩阵由尺寸自动生成，不可直接编辑。'
            : '零矩阵由尺寸自动生成，不可直接编辑。',
        ),
      ),
    );
  }

  function updateEntryDimensions(entry, rows, columns) {
    if (entry.kind === 'identity') {
      columns = rows;
    }
    entry.rows = rows;
    entry.cols = columns;
    if (entry.kind === 'normal') {
      entry.values = resizeValues(entry.values, rows, columns);
    }
    renderBuilder();
    hideError();
    markStale();
    updateHint();
  }

  function removeMatrix(entry, index) {
    if (state.matrices.length <= 2) return;

    state.matrices.splice(index, 1);
    if (state.connectors.length > 0) {
      const connectorIndex = Math.min(index, state.connectors.length - 1);
      state.connectors.splice(connectorIndex, 1);
    }
    relabelMatrices();
    renderBuilder();
    hideError();
    calculate();
  }

  function toggleTranspose(entry) {
    entry.transposed = !entry.transposed;
    renderBuilder();
    hideError();
    calculate();
  }

  function createGap(gapIndex) {
    const gap = el('div', {
      class: 'matrix-gap',
      dataset: { gap: String(gapIndex) },
    });
    const internal = gapIndex > 0 && gapIndex < state.matrices.length;

    if (internal) {
      const connector = state.connectors[gapIndex - 1];
      const left = state.matrices[gapIndex - 1];
      const right = state.matrices[gapIndex];
      const wrap = el('div', { class: 'gap-operator-wrap' });
      const select = el('select', {
        class: 'gap-operator-select',
        'aria-label': `矩阵 ${left.label} 与 ${right.label} 之间的运算`,
        title: '选择矩阵运算：加、减或乘',
      });

      for (const [value, symbol, label] of OP_OPTIONS) {
        select.appendChild(new Option(symbol, value, false, connector.op === value));
        select.lastChild.setAttribute('aria-label', label);
      }
      select.value = connector.op;
      select.addEventListener('change', () => {
        connector.op = select.value;
        updateHint();
        calculate();
      });

      wrap.append(
        select,
        el('span', { class: 'gap-operator-caption' }, '运算'),
      );
      gap.appendChild(wrap);
    }

    const leftLabel = gapIndex === 0 ? null : state.matrices[gapIndex - 1].label;
    const rightLabel =
      gapIndex >= state.matrices.length ? null : state.matrices[gapIndex].label;
    const addLabel =
      gapIndex === 0
        ? `在矩阵 ${rightLabel} 前添加矩阵`
        : gapIndex >= state.matrices.length
          ? `在矩阵 ${leftLabel} 后添加矩阵`
          : `在矩阵 ${leftLabel} 与 ${rightLabel} 之间添加矩阵`;

    const addButton = el(
      'button',
      {
        class: 'gap-add-button',
        type: 'button',
        'aria-label': addLabel,
        title: addLabel,
        'aria-haspopup': 'dialog',
      },
      el('span', { class: 'gap-add-plus', 'aria-hidden': 'true' }, '+'),
      el('span', { class: 'gap-add-text' }, '添加'),
    );
    addButton.addEventListener('click', () => openAddDialog(gapIndex, addButton));
    gap.appendChild(addButton);
    return gap;
  }

  function createMatrixCard(entry, index) {
    const card = el('article', {
      class: 'operand-card expression-matrix-card',
      dataset: { key: String(entry.key) },
      'aria-labelledby': `matrix-heading-${entry.key}`,
    });

    const actionButtons = el('div', { class: 'matrix-card-actions' });
    if (entry.kind === 'normal') {
      const transpose = el(
        'button',
        {
          class: `transpose-toggle${entry.transposed ? ' is-active' : ''}`,
          type: 'button',
          'aria-pressed': String(entry.transposed),
          title: entry.transposed ? '取消转置' : '计算前转置该矩阵',
        },
        `${entry.label}ᵀ`,
      );
      transpose.addEventListener('click', () => toggleTranspose(entry));
      actionButtons.appendChild(transpose);
    }

    if (state.matrices.length > 2) {
      const remove = el(
        'button',
        {
          class: 'remove-matrix-button',
          type: 'button',
          title: `移除矩阵 ${entry.label}`,
          'aria-label': `移除矩阵 ${entry.label}`,
        },
        '×',
      );
      remove.addEventListener('click', () => removeMatrix(entry, index));
      actionButtons.appendChild(remove);
    }

    const header = el(
      'header',
      { class: 'operand-heading' },
      el(
        'div',
        { class: 'operand-title-group' },
        el('span', { class: 'operand-letter', 'aria-hidden': 'true' }, displayLabel(entry)),
        el(
          'div',
          {},
          el('h2', { id: `matrix-heading-${entry.key}` }, `矩阵 ${displayLabel(entry)}`),
          el(
            'p',
            { class: 'operand-meta' },
            `${KIND_LABELS[entry.kind]} · ${entry.rows} 行 × ${entry.cols} 列${entry.transposed ? ' · 计算时转置' : ''}`,
          ),
        ),
      ),
      actionButtons,
    );

    const rowsSelect = el('select', {
      'aria-label': `矩阵 ${entry.label} 的行数`,
    });
    fillDimensionSelect(rowsSelect);
    rowsSelect.value = String(entry.rows);
    rowsSelect.addEventListener('change', () => {
      updateEntryDimensions(entry, Number(rowsSelect.value), entry.cols);
    });

    const colsSelect = el('select', {
      'aria-label': `矩阵 ${entry.label} 的列数`,
    });
    fillDimensionSelect(colsSelect);
    colsSelect.value = String(entry.cols);
    colsSelect.disabled = entry.kind === 'identity';
    colsSelect.addEventListener('change', () => {
      updateEntryDimensions(entry, entry.rows, Number(colsSelect.value));
    });

    const dimsRow = el(
      'div',
      { class: 'expression-card-dims' },
      el('span', { class: 'matrix-kind-tag' }, KIND_LABELS[entry.kind]),
      el(
        'div',
        { class: 'operand-dims' },
        el(
          'label',
          { class: 'operand-dim-field' },
          el('span', {}, '行'),
          rowsSelect,
        ),
        el('span', { class: 'dimension-cross', 'aria-hidden': 'true' }, '×'),
        el(
          'label',
          { class: 'operand-dim-field' },
          el('span', {}, '列'),
          colsSelect,
        ),
      ),
    );

    const body = el('div', { class: 'expression-card-body' });
    card.append(header, dimsRow, body);
    buildMatrixCardBodyForCard(entry, body);
    return card;
  }

  function buildMatrixCardBodyForCard(entry, body) {
    clear(body);
    if (entry.kind === 'normal') {
      const editor = el('div', {
        class: 'matrix-editor operand-editor',
        role: 'group',
      });
      const frame = el('div', { class: 'operand-editor-frame' }, editor);
      body.appendChild(frame);
      buildMatrixEditor(entry, editor);
      return;
    }

    body.appendChild(
      el(
        'div',
        { class: 'static-matrix-frame' },
        C.matrixBlock(typedValues(entry), {
          ariaLabel: `${KIND_LABELS[entry.kind]} ${entry.rows}×${entry.cols}`,
        }),
        el(
          'p',
          { class: 'static-matrix-note' },
          entry.kind === 'identity'
            ? '单位矩阵由尺寸自动生成，不可直接编辑。'
            : '零矩阵由尺寸自动生成，不可直接编辑。',
        ),
      ),
    );
  }

  function renderBuilder() {
    relabelMatrices();
    clear(elements.builder);

    for (let index = 0; index < state.matrices.length; index += 1) {
      elements.builder.appendChild(createGap(index));
      elements.builder.appendChild(createMatrixCard(state.matrices[index], index));
    }
    elements.builder.appendChild(createGap(state.matrices.length));
    updateHint();
  }

  function fillDialogSelects() {
    fillDimensionSelect(elements.dialogRows);
    fillDimensionSelect(elements.dialogCols);
  }

  function selectedDialogKind() {
    return elements.dialogTypeInputs.find((input) => input.checked)?.value ?? 'normal';
  }

  function syncDialogDimensions() {
    const identity = selectedDialogKind() === 'identity';
    elements.dialogCols.disabled = identity;
    if (identity) elements.dialogCols.value = elements.dialogRows.value;
  }

  function updateDialogPosition() {
    const gap = state.pendingGap ?? 0;
    if (gap === 0) {
      elements.dialogPosition.textContent = `将插入到矩阵 ${state.matrices[0].label} 之前。`;
    } else if (gap >= state.matrices.length) {
      elements.dialogPosition.textContent = `将插入到矩阵 ${state.matrices[state.matrices.length - 1].label} 之后。`;
    } else {
      elements.dialogPosition.textContent = `将插入到矩阵 ${state.matrices[gap - 1].label} 与 ${state.matrices[gap].label} 之间。`;
    }
  }

  function openAddDialog(gapIndex, opener) {
    state.pendingGap = gapIndex;
    state.dialogOpener = opener;
    elements.dialogTypeInputs.forEach((input) => {
      input.checked = input.value === 'normal';
    });
    elements.dialogRows.value = '2';
    elements.dialogCols.value = '2';
    syncDialogDimensions();
    updateDialogPosition();
    if (typeof elements.dialog.showModal === 'function') {
      elements.dialog.showModal();
    } else {
      elements.dialog.setAttribute('open', '');
    }
    elements.dialogTypeInputs[0]?.focus({ preventScroll: true });
  }

  function closeAddDialog() {
    if (typeof elements.dialog.close === 'function') {
      elements.dialog.close();
    } else {
      elements.dialog.removeAttribute('open');
    }
    state.pendingGap = null;
    state.dialogOpener?.focus({ preventScroll: true });
  }

  function insertMatrix(kind, rows, cols) {
    const gap = state.pendingGap ?? 0;
    const entry = {
      key: state.nextKey,
      label: '',
      kind,
      rows,
      cols,
      values: kind === 'normal' ? blankValues(rows, cols) : [],
      transposed: false,
    };
    state.nextKey += 1;

    const count = state.matrices.length;
    state.matrices.splice(gap, 0, entry);

    if (gap === 0) {
      state.connectors.unshift({ op: 'add' });
    } else if (gap === count) {
      state.connectors.push({ op: 'add' });
    } else {
      const existing = state.connectors[gap - 1];
      state.connectors.splice(
        gap - 1,
        1,
        { op: existing.op },
        { op: existing.op },
      );
    }

    closeAddDialog();
    renderBuilder();
    hideError();
    calculate();
    requestAnimationFrame(() => {
      document
        .querySelector(`.expression-matrix-card[data-key="${entry.key}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  }

  function parseCell(rawValue) {
    try {
      return Fraction.parse(rawValue);
    } catch (error) {
      if (looksLikeSymbol(rawValue)) return SymbolicValue.fromSymbol(rawValue);
      throw error;
    }
  }

  function parseEntry(entry, invalid) {
    if (entry.kind !== 'normal') return typedValues(entry);

    return Array.from({ length: entry.rows }, (_, row) =>
      Array.from({ length: entry.cols }, (_, column) => {
        try {
          return parseCell(entry.values[row][column]);
        } catch (error) {
          invalid.push({
            key: entry.key,
            label: entry.label,
            row,
            column,
            message: error.message,
          });
          return Fraction.ZERO;
        }
      }),
    );
  }

  function updateResultSummary(outcome) {
    elements.operationChip.textContent = outcome.expression;
    elements.sizeChip.textContent = outcome.size;
    elements.typeChip.textContent = outcome.symbolic ? '精确符号式' : '精确有理数';
  }

  function buildResultCard(outcome) {
    const rows = outcome.result.length;
    const columns = outcome.result[0].length;
    const facts = el(
      'div',
      { class: 'result-facts' },
      C.fact('矩阵数量', String(state.matrices.length), { note: '参与表达式' }),
      C.fact('结果尺寸', `${rows} × ${columns}`, { note: '行 × 列' }),
      C.fact('数值类型', outcome.symbolic ? '符号式' : '有理数', {
        note: outcome.symbolic ? '保留独立常数' : '精确分数',
        tone: outcome.symbolic ? 'symbolic' : undefined,
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
          el('span', { class: 'result-index arithmetic-result-index' }, '='),
          el(
            'div',
            {},
            el('p', { class: 'result-eyebrow' }, 'MATRIX EXPRESSION'),
            el('h3', {}, '表达式结果'),
            el('p', { class: 'result-description' }, outcome.expression),
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
          C.matrixCaption('结果矩阵', outcome.expression),
          C.matrixBlock(outcome.result, {
            ariaLabel: '矩阵表达式结果',
          }),
        ),
        facts,
      ),
      C.callout(
        '计算规则：先完成所有乘法，再按从左到右的顺序做加减；矩阵名称右上角的 ᵀ 表示先转置。',
      ),
    );

    if (outcome.steps.length > 1) {
      const stepViews = outcome.steps.map((step) => ({
        kind: 'expression-step',
        phase: '中间结果',
        title: step.label,
        formula: step.formula,
        matrix: step.matrix,
        highlight: {},
      }));
      card.appendChild(
        C.stepsPanel(stepViews, {
          title: '计算步骤',
          meta: `${outcome.steps.length} 步 · 先乘后加减`,
        }),
      );
    }

    return card;
  }

  function renderResult(outcome) {
    elements.symbolicNotice.hidden = !outcome.symbolic;
    elements.staleNotice.hidden = true;
    elements.status.classList.remove('is-stale', 'is-error');
    clear(elements.resultList);
    elements.resultList.appendChild(buildResultCard(outcome));
    updateResultSummary(outcome);
    elements.resultHeading.textContent = '表达式结果';
    elements.resultSubtitle.textContent = `先乘后加减 · ${outcome.expression}`;
    const clock = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    elements.statusText.textContent = outcome.symbolic
      ? `符号运算完成 · ${clock}`
      : `已更新 · ${clock}`;
  }

  function clearInvalidMarks() {
    for (const input of elements.builder.querySelectorAll('.matrix-input')) {
      input.classList.remove('is-invalid');
      input.removeAttribute('title');
    }
  }

  function calculate() {
    const invalid = [];
    const entries = state.matrices.map((entry) => {
      const values = parseEntry(entry, invalid);
      return {
        label: entry.label,
        values,
        transposed: entry.transposed,
      };
    });

    clearInvalidMarks();

    if (invalid.length > 0) {
      const first = invalid[0];
      const suffix =
        invalid.length > 1 ? `（另有 ${invalid.length - 1} 处需要修改）` : '';
      showError(
        `矩阵 ${first.label} 第 ${first.row + 1} 行第 ${first.column + 1} 列：${first.message}${suffix}`,
        invalid,
      );
      return;
    }

    hideError();

    try {
      const outcome = MatrixLab.expressions.evaluate(entries, state.connectors);
      renderResult(outcome);
    } catch (error) {
      console.error(error);
      showError(error.message || '矩阵表达式计算失败。');
      elements.statusText.textContent = '无法计算';
    }
  }

  function showEmptyState() {
    clear(elements.resultList);
    elements.resultList.appendChild(
      el(
        'div',
        { class: 'empty-state arithmetic-empty-state' },
        el('span', { class: 'empty-glyph', 'aria-hidden': 'true' }, '[ ]'),
        el('p', {}, '还没有结果。调整矩阵后点击“计算结果”。'),
      ),
    );
  }

  function clearValues() {
    for (const entry of state.matrices) {
      if (entry.kind === 'normal') {
        entry.values = blankValues(entry.rows, entry.cols);
      }
    }
    renderBuilder();
    hideError();
    elements.staleNotice.hidden = true;
    elements.symbolicNotice.hidden = true;
    elements.status.classList.remove('is-stale', 'is-error');
    elements.statusText.textContent = '等待输入';
    elements.resultHeading.textContent = '计算结果';
    elements.resultSubtitle.textContent = '调整表达式后点击计算结果。';
    elements.operationChip.textContent = operationExpression(state.matrices, state.connectors);
    elements.sizeChip.textContent = '—';
    elements.typeChip.textContent = '—';
    showEmptyState();
  }

  function randomInteger(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function randomValues(rows, columns) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => String(randomInteger(-4, 4))),
    );
  }

  function randomExample() {
    const rows = randomInteger(2, 4);
    const cols = randomInteger(2, 4);
    state.matrices = [
      {
        key: state.nextKey,
        label: '',
        kind: 'normal',
        rows,
        cols,
        values: randomValues(rows, cols),
        transposed: false,
      },
      {
        key: state.nextKey + 1,
        label: '',
        kind: 'normal',
        rows,
        cols,
        values: randomValues(rows, cols),
        transposed: false,
      },
    ];
    state.nextKey += 2;
    state.connectors = [{ op: 'add' }];
    renderBuilder();
    hideError();
    calculate();
  }

  function bindDialog() {
    fillDialogSelects();
    for (const input of elements.dialogTypeInputs) {
      input.addEventListener('change', syncDialogDimensions);
    }
    elements.dialogRows.addEventListener('change', syncDialogDimensions);
    elements.dialogClose.addEventListener('click', closeAddDialog);
    elements.dialogCancel.addEventListener('click', closeAddDialog);

    elements.dialogForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const kind = selectedDialogKind();
      const rows = Number(elements.dialogRows.value);
      const cols = kind === 'identity' ? rows : Number(elements.dialogCols.value);
      insertMatrix(kind, rows, cols);
    });
  }

  function bindEvents() {
    elements.calculateButton.addEventListener('click', calculate);
    elements.randomButton.addEventListener('click', randomExample);
    elements.clearButton.addEventListener('click', clearValues);

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
    bindDialog();
    bindEvents();
    relabelMatrices();
    renderBuilder();
    calculate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
