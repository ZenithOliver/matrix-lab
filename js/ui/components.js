/* Shared visual components used by every feature module. */
(function (root) {
  'use strict';

  const MatrixLab = (root.MatrixLab = root.MatrixLab || {});
  const { el } = MatrixLab.ui.dom;
  const Fraction = MatrixLab.Fraction;
  const SymbolicValue = MatrixLab.SymbolicValue;

  function displayMinus(value) {
    return String(value).replace(/-/g, '−');
  }

  function fractionNode(fraction, options = {}) {
    const plain = fraction.toDisplay();
    return el(
      'span',
      {
        class: ['fraction-value', options.className].filter(Boolean).join(' '),
        title: plain,
        'aria-label': plain,
      },
      displayMinus(plain),
    );
  }

  function valueLabel(value) {
    return value.toDisplay();
  }

  function valueNode(value, options = {}) {
    if (value instanceof SymbolicValue) {
      if (value.isNumeric()) {
        return fractionNode(value.asFraction(), options);
      }
      const plain = value.toDisplay();
      return el(
        'span',
        {
          class: ['symbol-value', options.className].filter(Boolean).join(' '),
          title: plain,
          'aria-label': plain,
        },
        plain,
      );
    }
    return fractionNode(value, options);
  }

  function makeClassList(base, ...classes) {
    return [base, ...classes.filter(Boolean)].join(' ');
  }

  function matrixBlock(matrix, options = {}) {
    const highlight = options.highlight || {};
    const activeRows = new Set(highlight.rows || []);
    const activeColumns = new Set(highlight.cols || []);
    const activeCells = new Set(
      (highlight.cells || []).map(([row, column]) => `${row}:${column}`),
    );
    const unitCells = new Set(
      (options.unitCells || []).map(([row, column]) => `${row}:${column}`),
    );

    const table = el('table', {
      class: 'matrix-table',
      'aria-label': options.ariaLabel || `矩阵，${matrix.length} 行 ${matrix[0].length} 列`,
    });
    const body = el('tbody');

    matrix.forEach((row, rowIndex) => {
      const tableRow = el('tr');
      row.forEach((cell, columnIndex) => {
        const key = `${rowIndex}:${columnIndex}`;
        const classes = [];
        if (activeRows.has(rowIndex)) classes.push('is-active-row');
        if (activeColumns.has(columnIndex)) classes.push('is-active-col');
        if (activeCells.has(key)) classes.push('is-active-cell');
        if (unitCells.has(key)) classes.push('is-unit');

        const hasSymbols = cell instanceof SymbolicValue && !cell.isNumeric();
        if (hasSymbols) classes.push('has-symbols');

        const tableCell = el('td', {
          class: classes.join(' '),
          'aria-label': `第 ${rowIndex + 1} 行第 ${columnIndex + 1} 列，${valueLabel(cell)}`,
        });
        tableCell.appendChild(valueNode(cell));
        tableRow.appendChild(tableCell);
      });
      body.appendChild(tableRow);
    });

    table.appendChild(body);
    const frame = el('div', { class: 'matrix-frame' }, table);
    return el(
      'div',
      {
        class: makeClassList('matrix-block', options.compact && 'is-compact'),
      },
      el('div', { class: 'matrix-scroll' }, frame),
    );
  }

  function fact(label, value, options = {}) {
    const valueNode = value instanceof Node ? value : String(value);
    return el(
      'div',
      { class: makeClassList('fact', options.tone && `is-${options.tone}`) },
      el('span', { class: 'fact-label' }, label),
      el('strong', { class: 'fact-value' }, valueNode),
      options.note ? el('span', { class: 'fact-note' }, options.note) : null,
    );
  }

  function callout(content, options = {}) {
    const tone = options.tone || 'neutral';
    return el(
      'div',
      { class: `callout is-${tone}` },
      el('span', { class: 'callout-mark', 'aria-hidden': 'true' }),
      el('div', { class: 'callout-copy' }, content),
    );
  }

  function stepsPanel(steps, options = {}) {
    const summary = el(
      'summary',
      { class: 'steps-summary' },
      el(
        'span',
        { class: 'steps-summary-main' },
        el('span', { class: 'steps-plus', 'aria-hidden': 'true' }),
        el('span', { class: 'steps-title' }, options.title || '关键步骤'),
      ),
      el(
        'span',
        { class: 'steps-meta' },
        options.meta || `${steps.length} 个画面`,
        el('span', { class: 'steps-chevron', 'aria-hidden': 'true' }),
      ),
    );

    const list = el('ol', { class: 'step-list' });
    steps.forEach((step, index) => {
      const heading = el(
        'div',
        { class: 'step-heading' },
        el('span', { class: 'step-phase' }, step.phase || '过程'),
        el('span', { class: 'step-title' }, step.title),
        step.formula ? el('code', { class: 'step-formula' }, step.formula) : null,
      );

      list.appendChild(
        el(
          'li',
          { class: 'step-item' },
          el('span', { class: 'step-index' }, String(index + 1).padStart(2, '0')),
          el(
            'div',
            { class: 'step-content' },
            heading,
            matrixBlock(step.matrix, {
              compact: true,
              highlight: step.highlight,
              ariaLabel: `第 ${index + 1} 步结果`,
            }),
          ),
        ),
      );
    });

    const details = el(
      'details',
      { class: 'steps-panel', open: Boolean(options.open) },
      summary,
      el('div', { class: 'steps-body' }, list),
    );
    return details;
  }

  function unavailableState(title, message) {
    return el(
      'div',
      { class: 'unavailable-state' },
      el('span', { class: 'unavailable-icon', 'aria-hidden': 'true' }, '∅'),
      el(
        'div',
        {},
        el('h4', { class: 'unavailable-title' }, title),
        el('p', { class: 'unavailable-copy' }, message),
      ),
    );
  }

  function matrixCaption(main, detail) {
    return el(
      'div',
      { class: 'matrix-caption' },
      el('span', { class: 'matrix-caption-main' }, main),
      el('span', { class: 'matrix-caption-detail' }, detail),
    );
  }

  function branchPanel(branch) {
    const cases = el('ol', { class: 'branch-cases' });

    branch.candidates.forEach((candidate, index) => {
      const conditions = el('div', { class: 'branch-condition' });
      conditions.appendChild(el('span', { class: 'branch-case-tag' }, `情形 ${index + 1}`));
      const conditionText = el('span', { class: 'branch-condition-text' });

      for (let earlier = 0; earlier < index; earlier += 1) {
        conditionText.appendChild(valueNode(branch.candidates[earlier].value));
        conditionText.appendChild(document.createTextNode(' = 0，'));
      }
      conditionText.appendChild(valueNode(candidate.value));
      conditionText.appendChild(document.createTextNode(' ≠ 0'));
      conditions.appendChild(conditionText);

      const action = el(
        'p',
        { class: 'branch-action' },
        `以第 ${candidate.row + 1} 行第 ${candidate.column + 1} 列的这个元素为主元，继续消元。`,
      );

      cases.appendChild(el('li', { class: 'branch-case' }, conditions, action));
    });

    const allZeroCondition = el('span', { class: 'branch-condition-text' });
    branch.candidates.forEach((candidate, index) => {
      if (index > 0) allZeroCondition.appendChild(document.createTextNode('，'));
      allZeroCondition.appendChild(valueNode(candidate.value));
      allZeroCondition.appendChild(document.createTextNode(' = 0'));
    });

    cases.appendChild(
      el(
        'li',
        { class: 'branch-case' },
        el(
          'div',
          { class: 'branch-condition' },
          el('span', { class: 'branch-case-tag is-zero' }, '情形 ' + (branch.candidates.length + 1)),
          allZeroCondition,
        ),
        el(
          'p',
          { class: 'branch-action' },
          `当前列没有可确定的主元，跳过第 ${branch.column + 1} 列，继续检查下一列。`,
        ),
      ),
    );

    return el(
      'section',
      { class: 'branch-panel', 'aria-label': '分类讨论条件' },
      el(
        'div',
        { class: 'branch-heading' },
        el('span', { class: 'branch-mark', 'aria-hidden': 'true' }, '!'),
        el(
          'div',
          {},
          el('h4', { class: 'branch-title' }, '需要分类讨论，计算已暂停'),
          el(
            'p',
            { class: 'branch-description' },
            `第 ${branch.column + 1} 列从第 ${branch.pivotRow + 1} 行起的候选主元都含未定常数，无法判断是否为零。`,
          ),
        ),
      ),
      cases,
      el(
        'p',
        { class: 'branch-footer' },
        '这里不会默认符号不为零。选定分支继续计算后，过程中仍可能出现新的分类条件。',
      ),
    );
  }

  MatrixLab.ui.components = {
    fractionNode,
    valueNode,
    valueLabel,
    matrixBlock,
    fact,
    callout,
    stepsPanel,
    unavailableState,
    branchPanel,
    matrixCaption,
    displayMinus,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
