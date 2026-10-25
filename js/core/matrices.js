/*
 * Small matrix helpers shared by the display layer and solvers.
 * A matrix is represented as a rectangular array of Fraction instances.
 */
(function (root) {
  'use strict';

  const Fraction = root.MatrixLab.Fraction;

  function clone(matrix) {
    return matrix.map((row) => row.slice());
  }

  function create(rows, columns, fill = Fraction.ZERO) {
    return Array.from({ length: rows }, () => Array.from({ length: columns }, () => fill));
  }

  function identity(size) {
    return Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) => (row === column ? Fraction.ONE : Fraction.ZERO)),
    );
  }

  function transpose(matrix) {
    const rows = matrix.length;
    const columns = matrix[0].length;
    return Array.from({ length: columns }, (_, column) =>
      Array.from({ length: rows }, (_, row) => matrix[row][column]),
    );
  }

  function multiply(left, right) {
    if (left[0].length !== right.length) {
      throw new Error('矩阵相乘时维度不匹配');
    }
    return Array.from({ length: left.length }, (_, row) =>
      Array.from({ length: right[0].length }, (_, column) => {
        let value = Fraction.ZERO;
        for (let index = 0; index < right.length; index += 1) {
          value = value.add(left[row][index].mul(right[index][column]));
        }
        return value;
      }),
    );
  }

  function minor(matrix, skipRow, skipColumn) {
    return matrix
      .filter((_, row) => row !== skipRow)
      .map((sourceRow) => sourceRow.filter((_, column) => column !== skipColumn));
  }

  function isRectangular(matrix) {
    return (
      Array.isArray(matrix) &&
      matrix.length > 0 &&
      Array.isArray(matrix[0]) &&
      matrix[0].length > 0 &&
      matrix.every((row) => Array.isArray(row) && row.length === matrix[0].length)
    );
  }

  function assertMatrix(matrix) {
    if (!isRectangular(matrix)) {
      throw new Error('矩阵必须是非空且各行列数一致的二维数组');
    }
    if (!matrix.every((row) => row.every((cell) => cell instanceof Fraction))) {
      throw new Error('矩阵元素必须是分数');
    }
  }

  function toStrings(matrix) {
    return matrix.map((row) => row.map((cell) => cell.toDisplay()));
  }

  function fromStrings(values) {
    if (!Array.isArray(values) || values.length === 0 || !Array.isArray(values[0])) {
      throw new Error('矩阵数据格式不正确');
    }
    const width = values[0].length;
    if (width === 0 || values.some((row) => !Array.isArray(row) || row.length !== width)) {
      throw new Error('矩阵每一行的列数必须一致');
    }
    return values.map((row) => row.map((cell) => Fraction.parse(cell)));
  }

  const MatrixLab = (root.MatrixLab = root.MatrixLab || {});
  MatrixLab.matrices = {
    clone,
    create,
    identity,
    transpose,
    multiply,
    minor,
    isRectangular,
    assertMatrix,
    toStrings,
    fromStrings,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = MatrixLab.matrices;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
