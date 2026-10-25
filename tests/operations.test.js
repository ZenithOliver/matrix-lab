'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.MatrixLab = {};
const Fraction = require('../js/core/fraction.js');
require('../js/core/matrices.js');
require('../js/core/algorithms.js');
require('../js/core/symbolic.js');
require('../js/core/operations.js');

const { Fraction: FractionClass, SymbolicValue, matrixOperations: O } = global.MatrixLab;

function parse(value) {
  try {
    return FractionClass.parse(String(value));
  } catch {
    return SymbolicValue.fromSymbol(String(value));
  }
}

function matrix(values) {
  return values.map((row) => row.map(parse));
}

function plain(values) {
  return values.map((row) => row.map((value) => value.toDisplay()));
}

test('matrix addition and subtraction are exact', () => {
  const left = matrix([['1/3', '2'], ['−1', '0.5']]);
  const right = matrix([['1/6', '−2'], ['3', '1/2']]);

  assert.deepEqual(plain(O.add(left, right).result), [
    ['1/2', '0'],
    ['2', '1'],
  ]);
  assert.deepEqual(plain(O.subtract(left, right).result), [
    ['1/6', '4'],
    ['-4', '0'],
  ]);
});

test('matrix multiplication uses row by column products', () => {
  const left = matrix([
    ['1', '2', '3'],
    ['4', '5', '6'],
  ]);
  const right = matrix([
    ['7', '8'],
    ['9', '10'],
    ['11', '12'],
  ]);

  assert.deepEqual(plain(O.multiply(left, right).result), [
    ['58', '64'],
    ['139', '154'],
  ]);
});

test('transpose handles rectangular matrices without mutating input', () => {
  const source = matrix([
    ['1', '2', '3'],
    ['4', '5', '6'],
  ]);
  const before = plain(source);
  const result = O.transpose(source).result;

  assert.deepEqual(plain(result), [
    ['1', '4'],
    ['2', '5'],
    ['3', '6'],
  ]);
  assert.deepEqual(plain(source), before);
});

test('dimension mismatch errors are clear', () => {
  assert.throws(
    () => O.add(matrix([['1', '2']]), matrix([['1'], ['2']])),
    /加法要求两个矩阵尺寸相同/,
  );
  assert.throws(
    () => O.subtract(matrix([['1', '2']]), matrix([['1'], ['2']])),
    /减法要求两个矩阵尺寸相同/,
  );
  assert.throws(
    () => O.multiply(matrix([['1', '2']]), matrix([['1', '2']])),
    /A 的列数等于 B 的行数/,
  );
});

test('symbolic addition and multiplication remain exact', () => {
  const left = matrix([
    ['a', 'b'],
    ['c', 'd'],
  ]);
  const right = matrix([
    ['1', '0'],
    ['0', '1'],
  ]);

  const sum = O.add(left, right);
  assert.equal(sum.symbolic, true);
  assert.deepEqual(plain(sum.result), [
    ['a + 1', 'b'],
    ['c', 'd + 1'],
  ]);

  const product = O.multiply(left, right);
  assert.deepEqual(plain(product.result), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('symbolic matrix products expand to polynomials', () => {
  const left = matrix([
    ['a', 'b'],
    ['c', 'd'],
  ]);
  const right = matrix([
    ['e', 'f'],
    ['g', 'h'],
  ]);
  const result = O.multiply(left, right).result;

  assert.equal(result[0][0].toDisplay(), 'a·e + b·g');
  assert.equal(result[0][1].toDisplay(), 'a·f + b·h');
  assert.equal(result[1][0].toDisplay(), 'c·e + d·g');
  assert.equal(result[1][1].toDisplay(), 'c·f + d·h');
});

test('mixed numeric and symbolic operands are lifted consistently', () => {
  const left = matrix([
    ['1', 'x'],
    ['2', '3'],
  ]);
  const right = matrix([
    ['4', '5'],
    ['6', '7'],
  ]);
  const result = O.multiply(left, right);
  assert.equal(result.symbolic, true);
  assert.deepEqual(plain(result.result), [
    ['6·x + 4', '7·x + 5'],
    ['26', '31'],
  ]);
});

test('transpose supports symbolic values', () => {
  const source = matrix([['a', 'b'], ['0', 'c']]);
  assert.deepEqual(plain(O.transpose(source).result), [
    ['a', '0'],
    ['b', 'c'],
  ]);
});
