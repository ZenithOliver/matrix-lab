/*
 * Matrix algorithms for MatrixLab.
 *
 * Every nontrivial algorithm returns a list of "step" snapshots. The UI can
 * therefore show the final result and every key elementary transformation
 * without duplicating any mathematics in the view layer.
 */
(function (root) {
  'use strict';

  const MatrixLab = (root.MatrixLab = root.MatrixLab || {});
  const Fraction = MatrixLab.Fraction;
  const M = MatrixLab.matrices;

  const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

  function subscript(number) {
    return String(number)
      .split('')
      .map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit)
      .join('');
  }

  function rowLabel(index) {
    return `R${subscript(index + 1)}`;
  }

  function columnLabel(index) {
    return `C${subscript(index + 1)}`;
  }

  function formatFraction(fraction) {
    return fraction.toDisplay().replace(/-/g, '−');
  }

  function coefficient(fraction) {
    if (fraction.isOne()) {
      return '';
    }
    const display = formatFraction(fraction);
    return fraction.denominator === 1n ? display : `(${display})`;
  }

  function isSquare(matrix) {
    return matrix.length === matrix[0].length;
  }

  function assertSquare(matrix) {
    M.assertMatrix(matrix);
    if (!isSquare(matrix)) {
      throw new Error('该运算只对方阵有定义');
    }
  }

  function snapshot(matrix) {
    return M.clone(matrix);
  }

  /**
   * Gauss-Jordan elimination. Produces the reduced row echelon form and every
   * elementary row operation as an immutable snapshot.
   */
  function rref(input) {
    M.assertMatrix(input);

    const matrix = snapshot(input);
    const rows = matrix.length;
    const columns = matrix[0].length;
    const pivotColumns = [];
    const steps = [
      {
        kind: 'initial',
        phase: '起点',
        title: '初始矩阵',
        formula: 'A',
        matrix: snapshot(matrix),
        highlight: {},
      },
    ];

    let pivotRow = 0;
    for (let column = 0; column < columns && pivotRow < rows; column += 1) {
      let sourceRow = -1;
      for (let row = pivotRow; row < rows; row += 1) {
        if (!matrix[row][column].isZero()) {
          sourceRow = row;
          break;
        }
      }

      if (sourceRow === -1) {
        continue;
      }

      if (sourceRow !== pivotRow) {
        [matrix[pivotRow], matrix[sourceRow]] = [matrix[sourceRow], matrix[pivotRow]];
        steps.push({
          kind: 'row-swap',
          phase: '行变换',
          title: `交换第 ${pivotRow + 1} 行与第 ${sourceRow + 1} 行`,
          formula: `${rowLabel(pivotRow)} ↔ ${rowLabel(sourceRow)}`,
          matrix: snapshot(matrix),
          highlight: {
            rows: [pivotRow, sourceRow],
            cells: [[pivotRow, column]],
          },
        });
      }

      const pivot = matrix[pivotRow][column];
      if (!pivot.isOne()) {
        const multiplier = pivot.reciprocal();
        for (let col = 0; col < columns; col += 1) {
          matrix[pivotRow][col] = matrix[pivotRow][col].div(pivot);
        }
        steps.push({
          kind: 'row-scale',
          phase: '行变换',
          title: `将第 ${pivotRow + 1} 行除以 ${formatFraction(pivot)}`,
          formula: `${rowLabel(pivotRow)} ← ${coefficient(multiplier)}${rowLabel(pivotRow)}`,
          matrix: snapshot(matrix),
          highlight: {
            rows: [pivotRow],
            cells: [[pivotRow, column]],
          },
        });
      }

      for (let row = 0; row < rows; row += 1) {
        if (row === pivotRow) {
          continue;
        }
        const factor = matrix[row][column];
        if (factor.isZero()) {
          continue;
        }

        for (let col = 0; col < columns; col += 1) {
          matrix[row][col] = matrix[row][col].sub(factor.mul(matrix[pivotRow][col]));
        }

        const sign = factor.isNegative() ? ' + ' : ' − ';
        steps.push({
          kind: 'row-add',
          phase: '行变换',
          title: `用第 ${pivotRow + 1} 行消去第 ${row + 1} 行第 ${column + 1} 列的元素`,
          formula: `${rowLabel(row)} ← ${rowLabel(row)}${sign}${coefficient(factor.abs())}${rowLabel(pivotRow)}`,
          matrix: snapshot(matrix),
          highlight: {
            rows: [pivotRow, row],
            cells: [
              [pivotRow, column],
              [row, column],
            ],
          },
        });
      }

      pivotColumns.push(column);
      pivotRow += 1;
    }

    return {
      rref: matrix,
      rank: pivotColumns.length,
      pivotColumns,
      steps,
      rows,
      columns,
    };
  }

  /**
   * Determinant through fraction-preserving Gaussian elimination.
   */
  function determinant(input) {
    assertSquare(input);

    const size = input.length;
    if (size === 1) {
      return input[0][0];
    }

    const matrix = snapshot(input);
    let sign = 1;
    let result = Fraction.ONE;

    for (let column = 0; column < size; column += 1) {
      let pivotRow = column;
      while (pivotRow < size && matrix[pivotRow][column].isZero()) {
        pivotRow += 1;
      }
      if (pivotRow === size) {
        return Fraction.ZERO;
      }

      if (pivotRow !== column) {
        [matrix[column], matrix[pivotRow]] = [matrix[pivotRow], matrix[column]];
        sign *= -1;
      }

      const pivot = matrix[column][column];
      result = result.mul(pivot);

      for (let row = column + 1; row < size; row += 1) {
        if (matrix[row][column].isZero()) {
          continue;
        }
        const factor = matrix[row][column].div(pivot);
        matrix[row][column] = Fraction.ZERO;
        for (let col = column + 1; col < size; col += 1) {
          matrix[row][col] = matrix[row][col].sub(factor.mul(matrix[column][col]));
        }
      }
    }

    return sign === 1 ? result : result.neg();
  }

  function cofactorEntry(matrix, row, column) {
    const minor = M.minor(matrix, row, column);
    const value = determinant(minor);
    return (row + column) % 2 === 0 ? value : value.neg();
  }

  /**
   * Adjugate (classical adjoint) matrix, adj(A) = transpose(cofactor(A)).
   * The adjugate exists for every square matrix, including singular ones.
   */
  function adjugate(input) {
    assertSquare(input);

    const size = input.length;
    const det = determinant(input);
    const cofactors =
      size === 1
        ? [[Fraction.ONE]]
        : Array.from({ length: size }, (_, row) =>
            Array.from({ length: size }, (_, column) =>
              cofactorEntry(input, row, column),
            ),
          );

    const adj = M.transpose(cofactors);

    const steps = [
      {
        kind: 'cofactors',
        phase: '代数余子式',
        title: '计算代数余子式矩阵 C',
        formula: 'Cᵢⱼ = (−1)ⁱ⁺ʲ Mᵢⱼ',
        matrix: snapshot(cofactors),
        highlight: {},
      },
      {
        kind: 'adjugate',
        phase: '转置',
        title: '转置，得到伴随矩阵',
        formula: 'adj(A) = Cᵀ',
        matrix: snapshot(adj),
        highlight: {},
      },
    ];

    return {
      adjugate: adj,
      cofactors,
      determinant: det,
      singular: det.isZero(),
      rank: rref(input).rank,
      size,
      steps,
    };
  }

  /**
   * Equivalent standard form diag(I_r, O), using elementary row and column
   * operations. P = row operations, Q = column operations, so PAQ is returned.
   */
  function equivalentStandardForm(input) {
    M.assertMatrix(input);

    const reduction = rref(input);
    const matrix = snapshot(reduction.rref);
    const rows = matrix.length;
    const columns = matrix[0].length;
    const rank = reduction.rank;
    const pivotColumns = reduction.pivotColumns;
    const pivotSet = new Set(pivotColumns);

    const steps = reduction.steps.map((step) => ({
      ...step,
      phase: step.kind === 'initial' ? '起点' : '行变换',
    }));
    const columnSteps = [];

    // 1. Use pivot columns to clear all entries in non-pivot columns.
    for (let column = 0; column < columns; column += 1) {
      if (pivotSet.has(column)) {
        continue;
      }

      for (let pivotIndex = 0; pivotIndex < rank; pivotIndex += 1) {
        const factor = matrix[pivotIndex][column];
        if (factor.isZero()) {
          continue;
        }

        const sourceColumn = pivotColumns[pivotIndex];
        for (let row = 0; row < rows; row += 1) {
          matrix[row][column] = matrix[row][column].sub(
            factor.mul(matrix[row][sourceColumn]),
          );
        }

        const sign = factor.isNegative() ? ' + ' : ' − ';
        const step = {
          kind: 'column-add',
          phase: '列变换',
          title: `用第 ${sourceColumn + 1} 列消去第 ${column + 1} 列中第 ${pivotIndex + 1} 行的元素`,
          formula: `${columnLabel(column)} ← ${columnLabel(column)}${sign}${coefficient(factor.abs())}${columnLabel(sourceColumn)}`,
          matrix: snapshot(matrix),
          highlight: {
            cols: [column, sourceColumn],
            cells: [
              [pivotIndex, sourceColumn],
              [pivotIndex, column],
            ],
          },
        };
        steps.push(step);
        columnSteps.push(step);
      }
    }

    // 2. Move the unit pivot columns to the leading positions.
    const columnOrder = Array.from({ length: columns }, (_, index) => index);
    for (let target = 0; target < rank; target += 1) {
      let source = target;
      while (source < columns && columnOrder[source] !== pivotColumns[target]) {
        source += 1;
      }
      if (source === columns) {
        throw new Error('内部错误：找不到主元列');
      }
      if (source === target) {
        continue;
      }

      for (let row = 0; row < rows; row += 1) {
        [matrix[row][target], matrix[row][source]] = [
          matrix[row][source],
          matrix[row][target],
        ];
      }
      [columnOrder[target], columnOrder[source]] = [
        columnOrder[source],
        columnOrder[target],
      ];

      const step = {
        kind: 'column-swap',
        phase: '列变换',
        title: `交换第 ${target + 1} 列与第 ${source + 1} 列`,
        formula: `${columnLabel(target)} ↔ ${columnLabel(source)}`,
        matrix: snapshot(matrix),
        highlight: {
          cols: [target, source],
          cells: [[target, target]],
        },
      };
      steps.push(step);
      columnSteps.push(step);
    }

    const resultStep = {
      kind: 'final',
      phase: '结果',
      title: '得到等价标准型',
      formula: 'PAQ = diag(Iᵣ, O)',
      matrix: snapshot(matrix),
      highlight: {
        cells: Array.from({ length: rank }, (_, index) => [index, index]),
      },
    };
    steps.push(resultStep);

    return {
      result: matrix,
      rank,
      pivotColumns,
      rows,
      columns,
      steps,
      rowSteps: reduction.steps,
      rowOperationCount: Math.max(0, reduction.steps.length - 1),
      columnSteps,
      columnOperationCount: columnSteps.length,
      rref: reduction.rref,
    };
  }

  MatrixLab.algorithms = {
    rref,
    determinant,
    adjugate,
    equivalentStandardForm,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = MatrixLab.algorithms;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
