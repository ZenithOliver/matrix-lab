'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.MatrixLab = {};
const Fraction = require('../js/core/fraction.js');
require('../js/core/matrices.js');
require('../js/core/algorithms.js');
require('../js/core/symbolic.js');

const {
  matrices: M,
  symbolic,
  SymbolicValue,
  SymbolicLimitError,
} = global.MatrixLab;

function parse(value) {
  const text = String(value);
  try {
    return Fraction.parse(text);
  } catch {
    return SymbolicValue.fromSymbol(text);
  }
}

function matrix(values) {
  return values.map((row) => row.map(parse));
}

function display(value) {
  return value.toDisplay();
}

function plain(input) {
  return input.map((row) => row.map(display));
}

function assertDiagonalSymbolicStandardForm(result, rank) {
  result.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const expected = rowIndex === columnIndex && rowIndex < rank ? '1' : '0';
      assert.equal(display(value), expected, `位置 (${rowIndex},${columnIndex})`);
    });
  });
}

test('symbolic constants combine exactly like polynomials', () => {
  const a = SymbolicValue.fromSymbol('a');
  const b = SymbolicValue.fromSymbol('b');
  assert.equal(display(a.add(b)), 'a + b');
  assert.equal(display(a.add(a)), '2·a');
  assert.equal(display(a.mul(b)), 'a·b');
  assert.equal(display(a.add(b).mul(a.sub(b))), 'a² − b²');
  assert.equal(display(a.sub(a)), '0');
  assert.equal(a.sub(a).isZero(), true);
  assert.equal(display(a.scale(Fraction.parse('1/2'))), '(1/2)·a');
  assert.equal(display(SymbolicValue.fromFraction(Fraction.parse('-3/4'))), '−3/4');
});

test('symbols with spaces are displayed as one bracketed constant', () => {
  const one = SymbolicValue.fromSymbol('hello world');
  const two = SymbolicValue.fromSymbol('alpha_2');
  assert.equal(display(one), '⟦hello world⟧');
  assert.equal(display(one.mul(two)), 'alpha_2·⟦hello world⟧');
});

test('symbolic RREF stops at the first possible zero pivot', () => {
  const result = symbolic.rref(matrix([['a', 'b'], ['c', 'd']]));
  assert.equal(result.stopped, true);
  assert.equal(result.rank, 0);
  assert.equal(result.rankFinal, false);
  assert.deepEqual(result.pivotColumns, []);
  assert.equal(result.branch.column, 0);
  assert.deepEqual(
    result.branch.candidates.map((candidate) => [candidate.row, display(candidate.value)]),
    [
      [0, 'a'],
      [1, 'c'],
    ],
  );
  assert.deepEqual(plain(result.rref), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('symbolic RREF uses numeric pivots before asking for cases', () => {
  const rescued = symbolic.rref(matrix([['a', '0'], ['1', '0']]));
  assert.equal(rescued.stopped, false);
  assert.equal(rescued.rank, 1);
  assert.deepEqual(plain(rescued.rref), [
    ['1', '0'],
    ['0', '0'],
  ]);
});

test('symbolic RREF completes when no symbolic pivot is needed', () => {
  const result = symbolic.rref(matrix([['1', 'a'], ['0', '0']]));
  assert.equal(result.stopped, false);
  assert.equal(result.rank, 1);
  assert.deepEqual(plain(result.rref), [
    ['1', 'a'],
    ['0', '0'],
  ]);
  assert.ok(result.steps.every((step) => step.matrix.length === 2));
});

test('symbolic RREF stops after eliminating a numeric pivot', () => {
  const result = symbolic.rref(matrix([['1', 'a'], ['b', '0']]));
  assert.equal(result.stopped, true);
  assert.equal(result.rank, 1);
  assert.deepEqual(plain(result.rref), [
    ['1', 'a'],
    ['0', '−a·b'],
  ]);
  assert.equal(result.branch.column, 1);
  assert.equal(display(result.branch.candidates[0].value), '−a·b');
});

test('symbolic determinants are exact and division-free', () => {
  assert.equal(
    display(symbolic.determinant(matrix([['a', 'b'], ['c', 'd']]))),
    'a·d − b·c',
  );
  assert.equal(
    display(symbolic.determinant(matrix([['a', 'b'], ['b', 'a']]))),
    'a² − b²',
  );
  assert.equal(
    display(symbolic.determinant(matrix([['a', '0', '0'], ['0', 'b', '0'], ['0', '0', 'c']]))),
    'a·b·c',
  );
  assert.equal(
    display(symbolic.determinant(matrix([['1', '2'], ['3', '4']]))),
    '−2',
  );
});

test('division-free determinant matches the numeric engine', () => {
  const cases = [
    [[1, 2], [3, 4]],
    [[2, 0, 1], [3, 0, 0], [5, 1, 1]],
    [[1, 2, 3], [0, 1, 4], [5, 6, 0]],
    [[1, 2, 3, 4], [0, 2, 1, 0], [5, 1, 0, 2], [1, 1, 1, 1]],
  ];
  for (const values of cases) {
    const input = matrix(values);
    const expected = global.MatrixLab.algorithms
      .determinant(input)
      .toDisplay()
      .replace(/-/g, '−');
    assert.equal(display(symbolic.determinant(input)), expected);
  }
});

test('symbolic 2x2 adjugate and determinant are complete', () => {
  const result = symbolic.adjugate(matrix([['a', 'b'], ['c', 'd']]));
  assert.deepEqual(plain(result.adjugate), [
    ['d', '−b'],
    ['−c', 'a'],
  ]);
  assert.equal(display(result.determinant), 'a·d − b·c');
  assert.equal(result.determinantNumeric, false);
  assert.equal(result.singular, false);
});

test('symbolic 1x1 adjugate follows the standard convention', () => {
  const result = symbolic.adjugate(matrix([['a']]));
  assert.deepEqual(plain(result.adjugate), [['1']]);
  assert.equal(display(result.determinant), 'a');
});

test('symbolic adjugate enforces its size guard', () => {
  const symbols = Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: 7 }, (_, column) => `s${row}${column}`),
  );
  assert.throws(() => symbolic.adjugate(matrix(symbols)), SymbolicLimitError);
});

test('symbolic equivalent standard form completes when no branch is needed', () => {
  const result = symbolic.equivalentStandardForm(matrix([['1', 'a'], ['0', '0']]));
  assert.equal(result.stopped, false);
  assert.equal(result.rank, 1);
  assertDiagonalSymbolicStandardForm(result.result, 1);
  assert.deepEqual(plain(result.steps.at(-1).matrix), plain(result.result));
});

test('symbolic equivalent standard form stops with the branch information', () => {
  const result = symbolic.equivalentStandardForm(matrix([['1', 'a'], ['b', '0']]));
  assert.equal(result.stopped, true);
  assert.equal(result.rankFinal, false);
  assert.equal(result.columnOperationCount, 0);
  assert.equal(result.branch.column, 1);
  assert.equal(display(result.branch.candidates[0].value), '−a·b');
});

test('mixed numeric and symbolic matrices behave consistently', () => {
  const result = symbolic.rref(matrix([['2', 'a'], ['0', '1']]));
  assert.equal(result.stopped, false);
  assert.equal(result.rank, 2);
  assert.deepEqual(plain(result.rref), [
    ['1', '0'],
    ['0', '1'],
  ]);
});

test('symbolic matrix helpers reject malformed matrices', () => {
  assert.throws(() => symbolic.rref([]), /二维数组/);
  assert.throws(() => symbolic.adjugate(matrix([['a', 'b', 'c'], ['d', 'e', 'f']])), /方阵/);
  assert.equal(M.isRectangular(matrix([['a']])), true);
});
