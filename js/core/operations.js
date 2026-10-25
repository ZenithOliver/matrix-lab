/*
 * Matrix arithmetic: addition, subtraction, multiplication and transpose.
 * The numeric path stays on Fraction objects. If either operand contains a
 * symbolic constant, both operands are lifted into the polynomial scalar type
 * so mixed numeric/symbolic input works seamlessly.
 */
(function (root) {
  'use strict';

  const MatrixLab = (root.MatrixLab = root.MatrixLab || {});
  const M = MatrixLab.matrices;
  const symbolicTools = MatrixLab.symbolic;

  function assertMatrix(matrix, label) {
    if (!M.isRectangular(matrix)) {
      throw new Error(`${label}必须是非空且行列数一致的矩阵`);
    }
  }

  function dimensions(matrix) {
    return `${matrix.length}×${matrix[0].length}`;
  }

  function usesSymbols(left, right) {
    return (
      symbolicTools.containsSymbols(left) ||
      (right ? symbolicTools.containsSymbols(right) : false)
    );
  }

  function lift(matrix) {
    return symbolicTools.convertMatrix(matrix);
  }

  function plusScalar(left, right) {
    return left.add(right);
  }

  function minusScalar(left, right) {
    return left.sub(right);
  }

  function timesScalar(left, right) {
    return left.mul(right);
  }

  function add(left, right) {
    assertMatrix(left, '矩阵 A');
    assertMatrix(right, '矩阵 B');
    if (left.length !== right.length || left[0].length !== right[0].length) {
      throw new Error(
        `加法要求两个矩阵尺寸相同，当前为 ${dimensions(left)} 与 ${dimensions(right)}。`,
      );
    }

    const symbolic = usesSymbols(left, right);
    const a = symbolic ? lift(left) : left;
    const b = symbolic ? lift(right) : right;

    return {
      result: a.map((row, rowIndex) =>
        row.map((value, columnIndex) => plusScalar(value, b[rowIndex][columnIndex])),
      ),
      symbolic,
    };
  }

  function subtract(left, right) {
    assertMatrix(left, '矩阵 A');
    assertMatrix(right, '矩阵 B');
    if (left.length !== right.length || left[0].length !== right[0].length) {
      throw new Error(
        `减法要求两个矩阵尺寸相同，当前为 ${dimensions(left)} 与 ${dimensions(right)}。`,
      );
    }

    const symbolic = usesSymbols(left, right);
    const a = symbolic ? lift(left) : left;
    const b = symbolic ? lift(right) : right;

    return {
      result: a.map((row, rowIndex) =>
        row.map((value, columnIndex) => minusScalar(value, b[rowIndex][columnIndex])),
      ),
      symbolic,
    };
  }

  function multiply(left, right) {
    assertMatrix(left, '矩阵 A');
    assertMatrix(right, '矩阵 B');
    if (left[0].length !== right.length) {
      throw new Error(
        `乘法要求 A 的列数等于 B 的行数，当前为 ${dimensions(left)} × ${dimensions(right)}。`,
      );
    }

    const symbolic = usesSymbols(left, right);
    const a = symbolic ? lift(left) : left;
    const b = symbolic ? lift(right) : right;
    const inner = a[0].length;

    const result = Array.from({ length: a.length }, (_, rowIndex) =>
      Array.from({ length: b[0].length }, (_, columnIndex) => {
        let total = symbolic ? MatrixLab.SymbolicValue.zero() : MatrixLab.Fraction.ZERO;
        for (let index = 0; index < inner; index += 1) {
          total = total.add(a[rowIndex][index].mul(b[index][columnIndex]));
        }
        return total;
      }),
    );

    return { result, symbolic };
  }

  function transpose(matrix) {
    assertMatrix(matrix, '矩阵 A');
    return {
      result: M.transpose(matrix),
      symbolic: symbolicTools.containsSymbols(matrix),
    };
  }

  function compute(operation, left, right) {
    switch (operation) {
      case 'add':
        return add(left, right);
      case 'subtract':
        return subtract(left, right);
      case 'multiply':
        return multiply(left, right);
      case 'transpose':
        return transpose(left);
      default:
        throw new Error(`未知的矩阵运算：${operation}`);
    }
  }

  const definitions = {
    add: {
      id: 'add',
      label: '加法',
      symbol: '+',
      expression: 'A + B',
      formula: 'Cᵢⱼ = Aᵢⱼ + Bᵢⱼ',
      requiresB: true,
      resultLabel: 'A + B',
    },
    subtract: {
      id: 'subtract',
      label: '减法',
      symbol: '−',
      expression: 'A − B',
      formula: 'Cᵢⱼ = Aᵢⱼ − Bᵢⱼ',
      requiresB: true,
      resultLabel: 'A − B',
    },
    multiply: {
      id: 'multiply',
      label: '乘法',
      symbol: '×',
      expression: 'A × B',
      formula: 'Cᵢⱼ = Σₖ Aᵢₖ·Bₖⱼ',
      requiresB: true,
      resultLabel: 'A × B',
    },
    transpose: {
      id: 'transpose',
      label: '转置',
      symbol: 'ᵀ',
      expression: 'Aᵀ',
      formula: 'Cᵢⱼ = Aⱼᵢ',
      requiresB: false,
      resultLabel: 'Aᵀ',
    },
  };

  MatrixLab.matrixOperations = {
    add,
    subtract,
    multiply,
    transpose,
    compute,
    definitions,
    dimensions,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = MatrixLab.matrixOperations;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
