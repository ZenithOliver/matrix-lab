/*
 * Symbolic constants and branch-aware algorithms.
 *
 * Every non-numeric cell becomes one independent constant. Expressions are
 * sparse polynomials with exact Fraction coefficients, so additions and
 * multiplications stay exact. During elimination we only divide by numeric
 * pivots that are certainly non-zero; when the only possible pivots are
 * symbolic, computation stops and reports the case distinction instead of
 * silently assuming that a parameter is non-zero.
 */
(function (root) {
  'use strict';

  const MatrixLab = (root.MatrixLab = root.MatrixLab || {});
  const Fraction = MatrixLab.Fraction;
  const M = MatrixLab.matrices;

  const MAX_TERMS = 3000;
  const MAX_ADJUGATE_SIZE = 6;
  const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
  const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

  class SymbolicLimitError extends Error {
    constructor(message) {
      super(message);
      this.name = 'SymbolicLimitError';
    }
  }

  function subscript(number) {
    return String(number)
      .split('')
      .map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit)
      .join('');
  }

  function superscript(number) {
    return String(number)
      .split('')
      .map((digit) => SUPERSCRIPT_DIGITS[Number(digit)] ?? digit)
      .join('');
  }

  function rowLabel(index) {
    return `R${subscript(index + 1)}`;
  }

  function columnLabel(index) {
    return `C${subscript(index + 1)}`;
  }

  function displayFraction(fraction) {
    return fraction.toDisplay().replace(/-/g, '−');
  }

  function compareVariableNames(left, right) {
    if (left === right) return 0;
    return left < right ? -1 : 1;
  }

  function normalizeVariables(variableMap) {
    return [...variableMap.entries()]
      .filter(([, exponent]) => exponent > 0)
      .sort((left, right) => compareVariableNames(left[0], right[0]));
  }

  function variableKey(variables) {
    return JSON.stringify(variables);
  }

  function termDegree(term) {
    return term.variables.reduce((total, [, exponent]) => total + exponent, 0);
  }

  function compareTerms(left, right) {
    const degreeDifference = termDegree(right) - termDegree(left);
    if (degreeDifference !== 0) return degreeDifference;

    const leftNames = left.variables.map(([name]) => name).join('\u0000');
    const rightNames = right.variables.map(([name]) => name).join('\u0000');
    if (leftNames !== rightNames) return leftNames < rightNames ? -1 : 1;

    const leftPowers = left.variables.map(([, exponent]) => exponent).join(',');
    const rightPowers = right.variables.map(([, exponent]) => exponent).join(',');
    if (leftPowers === rightPowers) return 0;
    return leftPowers < rightPowers ? -1 : 1;
  }

  function formatVariable(name, exponent) {
    const safeName = /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name);
    const shownName = safeName ? name : `⟦${name}⟧`;
    if (exponent === 1) return shownName;
    if (exponent >= 2 && exponent <= 9) return `${shownName}${superscript(exponent)}`;
    return `${shownName}^${exponent}`;
  }

  function formatMonomial(variables) {
    return variables
      .map(([name, exponent]) => formatVariable(name, exponent))
      .join('·');
  }

  function termCountGuard(terms) {
    if (terms.size > MAX_TERMS) {
      throw new SymbolicLimitError(
        `符号展开超过 ${MAX_TERMS} 项，已暂停。请减少矩阵规模或符号数量。`,
      );
    }
  }

  class SymbolicValue {
    constructor(terms) {
      this.terms = terms;
      Object.freeze(this);
    }

    static zero() {
      return new SymbolicValue(new Map());
    }

    static one() {
      return SymbolicValue.fromFraction(Fraction.ONE);
    }

    static fromFraction(fraction) {
      if (fraction.isZero()) return SymbolicValue.zero();
      const variables = [];
      return new SymbolicValue(
        new Map([[variableKey(variables), { coefficient: fraction, variables }]]),
      );
    }

    static fromSymbol(name) {
      const symbol = String(name).trim();
      if (!symbol) {
        throw new Error('符号常数不能为空');
      }
      const variables = [[symbol, 1]];
      return new SymbolicValue(
        new Map([[variableKey(variables), { coefficient: Fraction.ONE, variables }]]),
      );
    }

    static fromTerms(terms) {
      const normalized = new Map();
      for (const term of terms) {
        if (term.coefficient.isZero()) continue;
        const key = variableKey(term.variables);
        const existing = normalized.get(key);
        if (existing) {
          const coefficient = existing.coefficient.add(term.coefficient);
          if (coefficient.isZero()) normalized.delete(key);
          else normalized.set(key, { coefficient, variables: existing.variables });
        } else {
          normalized.set(key, {
            coefficient: term.coefficient,
            variables: term.variables,
          });
        }
      }
      termCountGuard(normalized);
      return new SymbolicValue(normalized);
    }

    add(other) {
      const terms = new Map(this.terms);
      for (const [key, term] of other.terms) {
        const existing = terms.get(key);
        if (existing) {
          const coefficient = existing.coefficient.add(term.coefficient);
          if (coefficient.isZero()) terms.delete(key);
          else terms.set(key, { coefficient, variables: existing.variables });
        } else {
          terms.set(key, term);
        }
      }
      termCountGuard(terms);
      return new SymbolicValue(terms);
    }

    sub(other) {
      return this.add(other.neg());
    }

    neg() {
      return SymbolicValue.fromTerms(
        [...this.terms.values()].map((term) => ({
          coefficient: term.coefficient.neg(),
          variables: term.variables,
        })),
      );
    }

    mul(other) {
      const terms = new Map();
      for (const left of this.terms.values()) {
        for (const right of other.terms.values()) {
          const coefficient = left.coefficient.mul(right.coefficient);
          if (coefficient.isZero()) continue;
          const powers = new Map();
          for (const [name, exponent] of left.variables) {
            powers.set(name, (powers.get(name) || 0) + exponent);
          }
          for (const [name, exponent] of right.variables) {
            powers.set(name, (powers.get(name) || 0) + exponent);
          }
          const variables = normalizeVariables(powers);
          const key = variableKey(variables);
          const existing = terms.get(key);
          if (existing) {
            const nextCoefficient = existing.coefficient.add(coefficient);
            if (nextCoefficient.isZero()) terms.delete(key);
            else terms.set(key, { coefficient: nextCoefficient, variables });
          } else {
            terms.set(key, { coefficient, variables });
          }
          termCountGuard(terms);
        }
      }
      return new SymbolicValue(terms);
    }

    scale(fraction) {
      if (fraction.isZero()) return SymbolicValue.zero();
      return SymbolicValue.fromTerms(
        [...this.terms.values()].map((term) => ({
          coefficient: term.coefficient.mul(fraction),
          variables: term.variables,
        })),
      );
    }

    divNumeric(fraction) {
      if (fraction.isZero()) throw new Error('不能除以 0');
      return this.scale(fraction.reciprocal());
    }

    div(other) {
      if (!other.isNumeric()) {
        throw new SymbolicLimitError('除法会产生关于符号的有理式，已暂停。');
      }
      return this.divNumeric(other.asFraction());
    }

    isZero() {
      return this.terms.size === 0;
    }

    isOne() {
      if (this.terms.size !== 1) return false;
      const term = this.terms.values().next().value;
      return term.variables.length === 0 && term.coefficient.isOne();
    }

    isNumeric() {
      if (this.terms.size === 0) return true;
      for (const term of this.terms.values()) {
        if (term.variables.length > 0) return false;
      }
      return true;
    }

    isNegative() {
      return this.isNumeric() && !this.isZero() && this.asFraction().isNegative();
    }

    asFraction() {
      if (this.terms.size === 0) return Fraction.ZERO;
      if (!this.isNumeric()) {
        throw new Error('该符号表达式不是常数');
      }
      return this.terms.values().next().value.coefficient;
    }

    toDisplay() {
      if (this.terms.size === 0) return '0';
      const ordered = [...this.terms.values()].sort(compareTerms);
      let output = '';

      ordered.forEach((term, index) => {
        const negative = term.coefficient.isNegative();
        const coefficient = term.coefficient.abs();
        const monomial = formatMonomial(term.variables);
        let body;

        if (!monomial) {
          body = displayFraction(coefficient);
        } else if (coefficient.isOne()) {
          body = monomial;
        } else {
          const factor =
            coefficient.denominator === 1n
              ? displayFraction(coefficient)
              : `(${displayFraction(coefficient)})`;
          body = `${factor}·${monomial}`;
        }

        if (index === 0) {
          output += negative ? `−${body}` : body;
        } else {
          output += negative ? ` − ${body}` : ` + ${body}`;
        }
      });

      return output;
    }

    toString() {
      return this.toDisplay();
    }
  }

  function toSymbolic(value) {
    return value instanceof SymbolicValue ? value : SymbolicValue.fromFraction(value);
  }

  function convertMatrix(matrix) {
    return matrix.map((row) => row.map(toSymbolic));
  }

  function containsSymbols(matrix) {
    return matrix.some((row) => row.some((value) => value instanceof SymbolicValue));
  }

  function snapshot(matrix) {
    return matrix.map((row) => row.slice());
  }

  function formatValue(value) {
    return value instanceof SymbolicValue
      ? value.toDisplay()
      : displayFraction(value);
  }

  function coefficientText(fraction) {
    if (fraction.isOne()) return '';
    const display = displayFraction(fraction);
    return fraction.denominator === 1n ? display : `(${display})`;
  }

  function isSquare(matrix) {
    return matrix.length === matrix[0].length;
  }

  function assertSymbolicMatrix(matrix) {
    if (!M.isRectangular(matrix)) {
      throw new Error('矩阵必须是非空且各行列数一致的二维数组');
    }
  }

  function assertSquare(matrix) {
    assertSymbolicMatrix(matrix);
    if (!isSquare(matrix)) throw new Error('该运算只对方阵有定义');
  }

  /**
   * RREF that only divides by definitely non-zero numeric pivots. Symbolic
   * pivots are potential zeros, so the process stops and reports cases.
   */
  function rref(input) {
    assertSymbolicMatrix(input);
    const matrix = convertMatrix(input);
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
    let stopped = false;
    let branch = null;

    for (let column = 0; column < columns && pivotRow < rows; column += 1) {
      let numericPivotRow = -1;
      for (let row = pivotRow; row < rows; row += 1) {
        const value = matrix[row][column];
        if (value.isNumeric() && !value.isZero()) {
          numericPivotRow = row;
          break;
        }
      }

      if (numericPivotRow === -1) {
        const candidates = [];
        for (let row = pivotRow; row < rows; row += 1) {
          const value = matrix[row][column];
          if (!value.isZero() && !value.isNumeric()) {
            candidates.push({ row, column, value });
          }
        }

        if (candidates.length > 0) {
          stopped = true;
          branch = {
            column,
            pivotRow,
            candidates,
          };
          break;
        }
        continue;
      }

      if (numericPivotRow !== pivotRow) {
        [matrix[pivotRow], matrix[numericPivotRow]] = [
          matrix[numericPivotRow],
          matrix[pivotRow],
        ];
        steps.push({
          kind: 'row-swap',
          phase: '行变换',
          title: `交换第 ${pivotRow + 1} 行与第 ${numericPivotRow + 1} 行`,
          formula: `${rowLabel(pivotRow)} ↔ ${rowLabel(numericPivotRow)}`,
          matrix: snapshot(matrix),
          highlight: {
            rows: [pivotRow, numericPivotRow],
            cells: [[pivotRow, column]],
          },
        });
      }

      const pivot = matrix[pivotRow][column];
      const pivotFraction = pivot.asFraction();
      if (!pivotFraction.isOne()) {
        const multiplier = pivotFraction.reciprocal();
        for (let col = 0; col < columns; col += 1) {
          matrix[pivotRow][col] = matrix[pivotRow][col].scale(multiplier);
        }
        steps.push({
          kind: 'row-scale',
          phase: '行变换',
          title: `将第 ${pivotRow + 1} 行除以 ${displayFraction(pivotFraction)}`,
          formula: `${rowLabel(pivotRow)} ← ${coefficientText(multiplier)}${rowLabel(pivotRow)}`,
          matrix: snapshot(matrix),
          highlight: {
            rows: [pivotRow],
            cells: [[pivotRow, column]],
          },
        });
      }

      for (let row = 0; row < rows; row += 1) {
        if (row === pivotRow) continue;
        const factor = matrix[row][column];
        if (factor.isZero()) continue;

        for (let col = 0; col < columns; col += 1) {
          matrix[row][col] = matrix[row][col].sub(
            factor.mul(matrix[pivotRow][col]),
          );
        }

        let subtraction;
        if (factor.isNumeric()) {
          const fraction = factor.asFraction();
          subtraction = `${fraction.isNegative() ? ' + ' : ' − '}${coefficientText(fraction.abs())}`;
        } else {
          subtraction = ` − (${factor.toDisplay()})`;
        }

        steps.push({
          kind: 'row-add',
          phase: '行变换',
          title: `用第 ${pivotRow + 1} 行消去第 ${row + 1} 行第 ${column + 1} 列的元素`,
          formula: `${rowLabel(row)} ← ${rowLabel(row)}${subtraction}${rowLabel(pivotRow)}`,
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
      symbolic: true,
      rref: matrix,
      rank: pivotColumns.length,
      pivotColumns,
      steps,
      rows,
      columns,
      stopped,
      branch,
      rankFinal: !stopped,
    };
  }

  function popcount(value) {
    let count = 0;
    let remaining = value;
    while (remaining > 0) {
      count += remaining & 1;
      remaining >>>= 1;
    }
    return count;
  }

  /**
   * Division-free subset DP for the determinant. It uses only addition and
   * multiplication, so it is safe for symbolic entries.
   */
  function determinantFromSymbolic(matrix) {
    const size = matrix.length;
    if (size === 1) return matrix[0][0];
    const totalMasks = 1 << size;
    const counts = Array.from({ length: totalMasks }, (_, mask) => popcount(mask));
    const values = new Array(totalMasks);
    values[0] = SymbolicValue.one();

    for (let mask = 1; mask < totalMasks; mask += 1) {
      const row = counts[mask] - 1;
      let total = SymbolicValue.zero();
      for (let column = 0; column < size; column += 1) {
        if ((mask & (1 << column)) === 0) continue;
        const rest = mask ^ (1 << column);
        let greaterColumns = 0;
        for (let other = column + 1; other < size; other += 1) {
          if (mask & (1 << other)) greaterColumns += 1;
        }
        const term = matrix[row][column].mul(values[rest]);
        total = greaterColumns % 2 === 0 ? total.add(term) : total.sub(term);
      }
      values[mask] = total;
    }

    return values[totalMasks - 1];
  }

  function determinant(input) {
    assertSquare(input);
    return determinantFromSymbolic(convertMatrix(input));
  }

  function cofactorEntry(matrix, row, column) {
    const minor = M.minor(matrix, row, column);
    const value = determinantFromSymbolic(minor);
    return (row + column) % 2 === 0 ? value : value.neg();
  }

  function adjugate(input) {
    assertSquare(input);
    const matrix = convertMatrix(input);
    const size = matrix.length;

    if (size > MAX_ADJUGATE_SIZE) {
      throw new SymbolicLimitError(
        `符号矩阵的伴随矩阵目前支持到 ${MAX_ADJUGATE_SIZE}×${MAX_ADJUGATE_SIZE}；当前为 ${size}×${size}。`,
      );
    }

    const det = determinantFromSymbolic(matrix);
    const cofactors =
      size === 1
        ? [[SymbolicValue.one()]]
        : Array.from({ length: size }, (_, row) =>
            Array.from({ length: size }, (_, column) =>
              cofactorEntry(matrix, row, column),
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
      symbolic: true,
      adjugate: adj,
      cofactors,
      determinant: det,
      singular: det.isZero(),
      determinantNumeric: det.isNumeric(),
      size,
      steps,
    };
  }

  function columnOperationSuffix(factor) {
    if (factor.isNumeric()) {
      const fraction = factor.asFraction();
      return `${fraction.isNegative() ? ' + ' : ' − '}${coefficientText(fraction.abs())}`;
    }
    return ` − (${factor.toDisplay()})`;
  }

  function equivalentStandardForm(input) {
    assertSymbolicMatrix(input);
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

    if (reduction.stopped) {
      return {
        symbolic: true,
        stopped: true,
        result: matrix,
        rank,
        lowerBoundRank: rank,
        rankFinal: false,
        pivotColumns,
        rows,
        columns,
        steps,
        branch: reduction.branch,
        rowOperationCount: Math.max(0, reduction.steps.length - 1),
        columnOperationCount: 0,
        rref: reduction.rref,
      };
    }

    const columnSteps = [];

    for (let column = 0; column < columns; column += 1) {
      if (pivotSet.has(column)) continue;

      for (let pivotIndex = 0; pivotIndex < rank; pivotIndex += 1) {
        const factor = matrix[pivotIndex][column];
        if (factor.isZero()) continue;
        const sourceColumn = pivotColumns[pivotIndex];

        for (let row = 0; row < rows; row += 1) {
          matrix[row][column] = matrix[row][column].sub(
            factor.mul(matrix[row][sourceColumn]),
          );
        }

        const step = {
          kind: 'column-add',
          phase: '列变换',
          title: `用第 ${sourceColumn + 1} 列消去第 ${column + 1} 列中第 ${pivotIndex + 1} 行的元素`,
          formula: `${columnLabel(column)} ← ${columnLabel(column)}${columnOperationSuffix(factor)}${columnLabel(sourceColumn)}`,
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

    const columnOrder = Array.from({ length: columns }, (_, index) => index);
    for (let target = 0; target < rank; target += 1) {
      let source = target;
      while (source < columns && columnOrder[source] !== pivotColumns[target]) {
        source += 1;
      }
      if (source === columns) {
        throw new Error('内部错误：找不到主元列');
      }
      if (source === target) continue;

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

    steps.push({
      kind: 'final',
      phase: '结果',
      title: '得到等价标准型',
      formula: 'PAQ = diag(Iᵣ, O)',
      matrix: snapshot(matrix),
      highlight: {
        cells: Array.from({ length: rank }, (_, index) => [index, index]),
      },
    });

    return {
      symbolic: true,
      stopped: false,
      result: matrix,
      rank,
      rankFinal: true,
      pivotColumns,
      rows,
      columns,
      steps,
      rowOperationCount: Math.max(0, reduction.steps.length - 1),
      columnOperationCount: columnSteps.length,
      rref: reduction.rref,
    };
  }

  MatrixLab.SymbolicValue = SymbolicValue;
  MatrixLab.SymbolicLimitError = SymbolicLimitError;
  MatrixLab.symbolic = {
    containsSymbols,
    convertMatrix,
    toSymbolic,
    rref,
    determinant,
    adjugate,
    equivalentStandardForm,
    formatValue,
    MAX_ADJUGATE_SIZE,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = MatrixLab.symbolic;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
