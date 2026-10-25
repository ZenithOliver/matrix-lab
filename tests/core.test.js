'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.MatrixLab = {};
const Fraction = require('../js/core/fraction.js');
require('../js/core/matrices.js');
require('../js/core/algorithms.js');

const { matrices: M, algorithms: A } = global.MatrixLab;

function matrix(values) {
  return values.map((row) => row.map((value) => Fraction.parse(String(value))));
}

function plain(input) {
  return M.toStrings(input);
}

function randomInteger(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomMatrix(rows, columns) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => randomInteger(-4, 4)),
  );
}

function multiply(left, right) {
  return M.multiply(left, right);
}

function assertDiagonalStandardForm(result, rank) {
  const rows = result.length;
  const columns = result[0].length;
  result.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const expected = rowIndex === columnIndex && rowIndex < rank ? '1' : '0';
      assert.equal(value.toDisplay(), expected, `位置 (${rowIndex},${columnIndex})`);
    });
  });
  assert.equal(rows >= rank, true);
  assert.equal(columns >= rank, true);
}

test('Fraction parses integers, decimals and fractions exactly', () => {
  assert.equal(Fraction.parse('0.1').add(Fraction.parse('0.2')).toDisplay(), '3/10');
  assert.equal(Fraction.parse('-2.50').toDisplay(), '-5/2');
  assert.equal(Fraction.parse('  -3 / 4 ').toDisplay(), '-3/4');
  assert.equal(Fraction.parse('1/0.5').toDisplay(), '2');
  assert.equal(Fraction.parse('').toDisplay(), '0');
  assert.equal(Fraction.parse('−7').toDisplay(), '-7');
  assert.equal(Fraction.parse('6/8').toDisplay(), '3/4');
});

test('Fraction rejects invalid input and division by zero', () => {
  assert.throws(() => Fraction.parse('abc'), /整数、小数/);
  assert.throws(() => Fraction.parse('1/0'), /分母不能为 0/);
  assert.throws(() => Fraction.parse('1//2'), /分数格式/);
  assert.throws(() => Fraction.parse('1.2.3'), /整数、小数/);
});

test('RREF of a rank-2 3x3 matrix is exact and canonical', () => {
  const result = A.rref(matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]));
  assert.deepEqual(plain(result.rref), [
    ['1', '0', '-1'],
    ['0', '1', '2'],
    ['0', '0', '0'],
  ]);
  assert.equal(result.rank, 2);
  assert.deepEqual(result.pivotColumns, [0, 1]);
  assert.equal(result.steps.length, 6);
  assert.deepEqual(plain(result.steps[0].matrix), plain(matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]])));
});

test('RREF handles zero, identity, non-square and fractional matrices', () => {
  const zero = A.rref(matrix([[0, 0, 0], [0, 0, 0]]));
  assert.equal(zero.rank, 0);
  assert.deepEqual(zero.pivotColumns, []);
  assert.deepEqual(plain(zero.rref), [['0', '0', '0'], ['0', '0', '0']]);

  const identity = A.rref(matrix([[1, 0], [0, 1]]));
  assert.equal(identity.rank, 2);
  assert.equal(identity.steps.length, 1);

  const rectangular = A.rref(matrix([[0, 2, 1], [1, -1, 0]]));
  assert.deepEqual(plain(rectangular.rref), [
    ['1', '0', '1/2'],
    ['0', '1', '1/2'],
  ]);

  const decimals = A.rref(matrix([[0.5, 1.5], [2.5, 0.5]]));
  assert.deepEqual(plain(decimals.rref), [['1', '0'], ['0', '1']]);
});

test('Every RREF step stays rectangular and the final form satisfies RREF axioms', () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const rows = randomInteger(1, 5);
    const columns = randomInteger(1, 5);
    const source = matrix(randomMatrix(rows, columns));
    const result = A.rref(source);

    for (const step of result.steps) {
      assert.equal(step.matrix.length, rows);
      assert.equal(step.matrix[0].length, columns);
    }

    const pivotColumns = [];
    let sawZeroRow = false;
    for (let row = 0; row < rows; row += 1) {
      const pivotIndex = result.rref[row].findIndex((value) => !value.isZero());
      if (pivotIndex === -1) {
        sawZeroRow = true;
        continue;
      }
      assert.equal(sawZeroRow, false, '零行必须位于非零行之后');
      assert.equal(result.rref[row][pivotIndex].isOne(), true, '主元必须为 1');
      assert.equal(pivotColumns.length === 0 || pivotIndex > pivotColumns.at(-1), true);
      pivotColumns.push(pivotIndex);
    }

    for (const column of pivotColumns) {
      const pivotRow = result.rref.findIndex((row) => !row[column].isZero());
      for (let row = 0; row < rows; row += 1) {
        if (row !== pivotRow) {
          assert.equal(result.rref[row][column].isZero(), true, '主元列其余元素必须为 0');
        }
      }
    }

    assert.deepEqual(result.pivotColumns, pivotColumns);
    assert.equal(result.rank, pivotColumns.length);
  }
});

test('Determinant matches known values and handles row swaps', () => {
  assert.equal(A.determinant(matrix([[1, 2], [3, 4]])).toDisplay(), '-2');
  assert.equal(A.determinant(matrix([[0, 1], [1, 0]])).toDisplay(), '-1');
  assert.equal(A.determinant(matrix([[5]])).toDisplay(), '5');
  assert.equal(A.determinant(matrix([[1, 2, 3], [0, 1, 4], [5, 6, 0]])).toDisplay(), '1');
  assert.equal(A.determinant(matrix([[1, 2], [2, 4]])).toDisplay(), '0');
  assert.equal(A.determinant(matrix([[0.1, 0.2], [0.3, 0.4]])).toDisplay(), '-1/50');
  assert.throws(() => A.determinant(matrix([[1, 2, 3], [4, 5, 6]])), /方阵/);
});

test('Adjugate matches reference matrices, including 1x1 and singular cases', () => {
  assert.deepEqual(plain(A.adjugate(matrix([[1, 2], [3, 4]])).adjugate), [
    ['4', '-2'],
    ['-3', '1'],
  ]);
  assert.deepEqual(plain(A.adjugate(matrix([[1, 2], [2, 4]])).adjugate), [
    ['4', '-2'],
    ['-2', '1'],
  ]);
  assert.deepEqual(plain(A.adjugate(matrix([[1, 2, 3], [0, 1, 4], [5, 6, 0]])).adjugate), [
    ['-24', '18', '5'],
    ['20', '-15', '-4'],
    ['-5', '4', '1'],
  ]);
  assert.deepEqual(plain(A.adjugate(matrix([[5]])).adjugate), [['1']]);
  assert.deepEqual(plain(A.adjugate(matrix([[0]])).adjugate), [['1']]);

  const singular = A.adjugate(matrix([[1, 2], [2, 4]]));
  assert.equal(singular.singular, true);
  assert.equal(singular.determinant.isZero(), true);
  assert.deepEqual(plain(singular.cofactors), [
    ['4', '-2'],
    ['-2', '1'],
  ]);
  assert.throws(() => A.adjugate(matrix([[1, 2, 3], [4, 5, 6]])), /方阵/);
});

test('Adjugate identity A·adj(A) = det(A)·I holds over random matrices', () => {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const size = randomInteger(1, 5);
    const source = matrix(randomMatrix(size, size));
    const result = A.adjugate(source);
    const left = multiply(source, result.adjugate);
    const right = multiply(result.adjugate, source);
    const expected = M.identity(size).map((row) =>
      row.map((value) => value.mul(result.determinant)),
    );

    assert.deepEqual(plain(left), plain(expected));
    assert.deepEqual(plain(right), plain(expected));
  }
});

test('Equivalent standard form is diag(I_r, O) for squares and rectangles', () => {
  const cases = [
    [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
    [[1, 2, 3], [2, 4, 6], [1, 1, 1]],
    [[0, 0], [0, 0]],
    [[1, 0, 2], [0, 1, 3]],
    [[1, 2, 3], [4, 5, 6]],
    [[0, 2, 1, 0], [1, -1, 0, 3], [0, 0, 0, 0]],
    [[2, 1], [1, 3]],
    [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
  ];

  for (const values of cases) {
    const source = matrix(values);
    const result = A.equivalentStandardForm(source);
    assert.equal(result.result.length, source.length);
    assert.equal(result.result[0].length, source[0].length);
    assert.equal(result.rank, A.rref(source).rank);
    assertDiagonalStandardForm(result.result, result.rank);
    assert.deepEqual(plain(result.steps[0].matrix), plain(source));
    assert.deepEqual(plain(result.steps.at(-1).matrix), plain(result.result));
  }
});

test('Equivalent standard form is diag(I_r, O) for random matrices', () => {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const rows = randomInteger(1, 5);
    const columns = randomInteger(1, 5);
    const source = matrix(randomMatrix(rows, columns));
    const result = A.equivalentStandardForm(source);
    assertDiagonalStandardForm(result.result, result.rank);
    assert.equal(result.rank, A.rref(source).rank);
    for (const step of result.steps) {
      assert.equal(step.matrix.length, rows);
      assert.equal(step.matrix[0].length, columns);
    }
  }
});

test('Matrix helpers reject malformed input', () => {
  assert.throws(() => M.fromStrings([[1, 2], [3]]), /列数/);
  assert.throws(() => A.rref([]), /二维数组/);
  assert.throws(() => A.rref([[]]), /二维数组/);
});
