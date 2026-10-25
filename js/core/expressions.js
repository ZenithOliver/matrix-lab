/*
 * Evaluate a chain of matrices joined by + , - and x.
 *
 * The evaluator follows standard precedence (multiplication before addition
 * and subtraction) and keeps intermediate matrices for the UI. Each binary
 * operation reuses the exact numeric/symbolic implementation.
 */
(function (root) {
  'use strict';

  const MatrixLab = (root.MatrixLab = root.MatrixLab || {});
  const M = MatrixLab.matrices;
  const O = MatrixLab.matrixOperations;
  const symbolicTools = MatrixLab.symbolic;

  const OP_SYMBOLS = {
    add: '+',
    subtract: '−',
    multiply: '×',
  };

  function effectiveValues(entry) {
    return entry.transposed ? M.transpose(entry.values) : entry.values;
  }

  function displayLabel(entry) {
    return `${entry.label}${entry.transposed ? 'ᵀ' : ''}`;
  }

  function formatDimensions(values) {
    return `${values.length}×${values[0].length}`;
  }

  function expressionString(matrices, connectors) {
    const labels = matrices.map(displayLabel);
    const groups = [{ start: 0, end: 0, sign: 1 }];

    for (let index = 0; index < connectors.length; index += 1) {
      if (connectors[index].op === 'multiply') {
        groups[groups.length - 1].end = index + 1;
      } else {
        groups.push({
          start: index + 1,
          end: index + 1,
          sign: connectors[index].op === 'subtract' ? -1 : 1,
        });
      }
    }

    const wrapGroup = (group, index) => {
      const parts = [];
      for (let item = group.start; item <= group.end; item += 1) {
        parts.push(labels[item]);
      }
      const body = parts.join(' × ');
      if (index > 0) {
        return group.sign === -1 ? `− ${body}` : `+ ${body}`;
      }
      return group.sign === -1 ? `− ${body}` : body;
    };

    if (groups.length === 1) return groups.map(wrapGroup)[0];
    return groups
      .map((group, index) => {
        const body = [];
        for (let item = group.start; item <= group.end; item += 1) body.push(labels[item]);
        const joined = body.join(' × ');
        const shouldWrap = body.length > 1;
        if (index === 0) {
          return `${group.sign === -1 ? '− ' : ''}${shouldWrap ? `(${joined})` : joined}`;
        }
        return `${group.sign === -1 ? '−' : '+'} ${shouldWrap ? `(${joined})` : joined}`;
      })
      .join(' ');
  }

  function evaluate(matrices, connectors) {
    if (!Array.isArray(matrices) || matrices.length < 2) {
      throw new Error('至少需要两个矩阵才能组成矩阵表达式');
    }
    if (!Array.isArray(connectors) || connectors.length !== matrices.length - 1) {
      throw new Error('矩阵之间的运算数量与矩阵数量不匹配');
    }
    if (connectors.some((connector) => !OP_SYMBOLS[connector.op])) {
      throw new Error('存在未知的矩阵运算');
    }

    const items = matrices.map((entry) => ({
      label: displayLabel(entry),
      values: effectiveValues(entry),
    }));

    for (const item of items) {
      if (!M.isRectangular(item.values)) {
        throw new Error(`矩阵 ${item.label} 的尺寸或元素不完整`);
      }
    }

    const groups = [{ sign: 1, items: [0] }];
    for (let index = 0; index < connectors.length; index += 1) {
      const op = connectors[index].op;
      if (op === 'multiply') {
        groups[groups.length - 1].items.push(index + 1);
      } else {
        groups.push({
          sign: op === 'subtract' ? -1 : 1,
          items: [index + 1],
        });
      }
    }

    const steps = [];
    let symbolic = false;

    const groupResults = groups.map((group) => {
      let current = items[group.items[0]].values;
      let label = items[group.items[0]].label;

      for (let position = 1; position < group.items.length; position += 1) {
        const next = items[group.items[position]];
        try {
          const operation = O.multiply(current, next.values);
          current = operation.result;
          symbolic = symbolic || operation.symbolic;
        } catch (error) {
          throw new Error(`${label} × ${next.label}：${error.message}`);
        }
        label = `${label} × ${next.label}`;
        steps.push({
          label,
          formula: `${formatDimensions(current)}`,
          matrix: current,
        });
      }

      return { value: current, label };
    });

    let current = groupResults[0].value;
    let label = groupResults[0].label;

    for (let index = 1; index < groupResults.length; index += 1) {
      const group = groups[index];
      const right = groupResults[index];
      const operationName = group.sign === 1 ? 'add' : 'subtract';
      const sign = group.sign === 1 ? '+' : '−';
      const rightLabel = right.label.includes(' × ') ? `(${right.label})` : right.label;
      const nextLabel = `${label} ${sign} ${rightLabel}`;

      try {
        const operation = O[operationName](current, right.value);
        current = operation.result;
        symbolic = symbolic || operation.symbolic;
      } catch (error) {
        throw new Error(`${label} ${sign} ${rightLabel}：${error.message}`);
      }

      label = nextLabel;
      steps.push({
        label,
        formula: `${formatDimensions(current)}`,
        matrix: current,
      });
    }

    return {
      result: current,
      symbolic,
      steps,
      expression: expressionString(matrices, connectors),
      size: formatDimensions(current),
    };
  }

  MatrixLab.expressions = {
    evaluate,
    expressionString,
    displayLabel,
    OP_SYMBOLS,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = MatrixLab.expressions;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
