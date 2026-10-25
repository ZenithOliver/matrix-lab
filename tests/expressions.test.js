'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.MatrixLab = {};
const Fraction = require('../js/core/fraction.js');
require('../js/core/matrices.js');
require('../js/core/algorithms.js');
require('../js/core/symbolic.js');
require('../js/core/operations.js');
require('../js/core/expressions.js');

const {
  Fraction: FractionClass,
  SymbolicValue,
  expressions: E,
} = global.MatrixLab;

function parse(value) {
  try {
    return FractionClass.parse(String(value));
  } catch {
    return SymbolicValue.fromSymbol(String(value));
  }
}

function entry(label, values, transposed = false) {
  return {
    label,
    values: values.map((row) => row.map(parse)),
    transposed,
  };
}

function plain(values) {
  return values.map((row) => row.map((value) => value.toDisplay()));
}

test('expression string follows multiplication precedence', () => {
  assert.equal(
    E.expressionString(
      [entry('A', [['1']]), entry('B', [['2']]), entry('C', [['3']])],
      [{ op: 'add' }, { op: 'multiply' }],
    ),
    'A + (B × C)',
  );
});

test('two-matrix addition and subtraction are evaluated exactly', () => {
  const left = entry('A', [['1', '2'], ['3', '4']]);
  const right = entry('B', [['4', '3'], ['2', '1']]);

  assert.deepEqual(plain(E.evaluate([left, right], [{ op: 'add' }]).result), [
    ['5', '5'],
    ['5', '5'],
  ]);
  assert.deepEqual(plain(E.evaluate([left, right], [{ op: 'subtract' }]).result), [
    ['-3', '-1'],
    ['1', '3'],
  ]);
});

test('multiplication is performed before addition in a chain', () => {
  const a = entry('A', [['1', '0'], ['0', '1']]);
  const b = entry('B', [['1', '2'], ['3', '4']]);
  const c = entry('C', [['2', '0'], ['0', '2']]);
  const outcome = E.evaluate([a, b, c], [{ op: 'add' }, { op: 'multiply' }]);

  assert.equal(outcome.expression, 'A + (B × C)');
  assert.deepEqual(plain(outcome.result), [
    ['3', '4'],
    ['6', '9'],
  ]);
  assert.equal(outcome.steps.length, 2);
  assert.equal(outcome.steps[0].label, 'B × C');
});

test('same-precedence operations run left to right', () => {
  const a = entry('A', [['10', '0'], ['0', '10']]);
  const b = entry('B', [['2', '0'], ['0', '2']]);
  const c = entry('C', [['3', '0'], ['0', '3']]);
  const outcome = E.evaluate([a, b, c], [{ op: 'subtract' }, { op: 'subtract' }]);

  assert.deepEqual(plain(outcome.result), [
    ['5', '0'],
    ['0', '5'],
  ]);
});

test('transposed matrices are used before evaluating operations', () => {
  const a = entry(
    'A',
    [
      ['1', '2', '3'],
      ['4', '5', '6'],
    ],
    true,
  );
  const b = entry('B', [['10', '10'], ['10', '10'], ['10', '10']]);
  const outcome = E.evaluate([a, b], [{ op: 'add' }]);

  assert.deepEqual(plain(outcome.result), [
    ['11', '14'],
    ['12', '15'],
    ['13', '16'],
  ]);
  assert.equal(outcome.steps[0].label, 'Aᵀ + B');
});

test('symbolic expressions remain exact across a chain', () => {
  const a = entry('A', [['a', '0'], ['0', 'b']]);
  const b = entry('B', [['1', '2'], ['3', '4']]);
  const c = entry('C', [['2', '0'], ['0', '2']]);
  const outcome = E.evaluate([a, b, c], [{ op: 'add' }, { op: 'multiply' }]);

  assert.equal(outcome.symbolic, true);
  assert.deepEqual(plain(outcome.result), [
    ['a + 2', '4'],
    ['6', 'b + 8'],
  ]);
});

test('dimension errors mention the affected operation', () => {
  const a = entry('A', [['1', '2']]);
  const b = entry('B', [['1', '2']]);
  assert.throws(
    () => E.evaluate([a, b], [{ op: 'multiply' }]),
    /A × B.*A 的列数等于 B 的行数/,
  );
});

test('evaluate rejects missing connectors', () => {
  assert.throws(
    () => E.evaluate([entry('A', [['1']]), entry('B', [['2']])], []),
    /运算数量/,
  );
});
