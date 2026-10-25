/*
 * Exact rational arithmetic for MatrixLab.
 * All values are normalised and immutable. BigInt avoids floating point drift.
 */
(function (root) {
  'use strict';

  function bigAbs(value) {
    return value < 0n ? -value : value;
  }

  function bigGcd(a, b) {
    let x = bigAbs(a);
    let y = bigAbs(b);
    while (y !== 0n) {
      const remainder = x % y;
      x = y;
      y = remainder;
    }
    return x;
  }

  class Fraction {
    constructor(numerator = 0n, denominator = 1n) {
      let n = BigInt(numerator);
      let d = BigInt(denominator);

      if (d === 0n) {
        throw new Error('分母不能为 0');
      }
      if (d < 0n) {
        n = -n;
        d = -d;
      }

      const divisor = bigGcd(n, d) || 1n;
      this.numerator = n / divisor;
      this.denominator = d / divisor;
      Object.freeze(this);
    }

    static get ZERO() {
      return new Fraction(0n, 1n);
    }

    static get ONE() {
      return new Fraction(1n, 1n);
    }

    /**
     * Parse integers, decimals and simple fractions such as "-3", "1.25", "2/3".
     * A finite decimal is converted exactly, never through a float.
     */
    static parse(rawValue) {
      let source = String(rawValue ?? '').trim();
      if (source === '') {
        return Fraction.ZERO;
      }

      source = source
        .replace(/[\u2212\u2013\u2014]/g, '-')
        .replace(/\s+/g, '');

      if (source.includes('/')) {
        const parts = source.split('/');
        if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
          throw new Error('分数格式应为 a/b');
        }
        const numerator = Fraction.#parseDecimal(parts[0]);
        const denominator = Fraction.#parseDecimal(parts[1]);
        if (denominator.isZero()) {
          throw new Error('分母不能为 0');
        }
        return numerator.div(denominator);
      }

      return Fraction.#parseDecimal(source);
    }

    static #parseDecimal(source) {
      const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(source);
      if (!match || (match[2] === '' && (match[3] === undefined || match[3] === ''))) {
        throw new Error('请输入整数、小数或 a/b 形式的分数');
      }

      const sign = match[1] === '-' ? -1n : 1n;
      const whole = match[2] || '0';
      const decimals = match[3] || '';
      const scale = 10n ** BigInt(decimals.length);
      const digits = BigInt((whole + decimals) || '0');

      return new Fraction(sign * digits, scale);
    }

    add(other) {
      return new Fraction(
        this.numerator * other.denominator + other.numerator * this.denominator,
        this.denominator * other.denominator,
      );
    }

    sub(other) {
      return new Fraction(
        this.numerator * other.denominator - other.numerator * this.denominator,
        this.denominator * other.denominator,
      );
    }

    mul(other) {
      return new Fraction(
        this.numerator * other.numerator,
        this.denominator * other.denominator,
      );
    }

    div(other) {
      if (other.isZero()) {
        throw new Error('不能除以 0');
      }
      return new Fraction(
        this.numerator * other.denominator,
        this.denominator * other.numerator,
      );
    }

    neg() {
      return new Fraction(-this.numerator, this.denominator);
    }

    abs() {
      return new Fraction(bigAbs(this.numerator), this.denominator);
    }

    reciprocal() {
      if (this.isZero()) {
        throw new Error('0 没有倒数');
      }
      return new Fraction(this.denominator, this.numerator);
    }

    isZero() {
      return this.numerator === 0n;
    }

    isOne() {
      return this.numerator === 1n && this.denominator === 1n;
    }

    isNegative() {
      return this.numerator < 0n;
    }

    equals(other) {
      return this.numerator === other.numerator && this.denominator === other.denominator;
    }

    toDisplay() {
      if (this.denominator === 1n) {
        return this.numerator.toString();
      }
      return `${this.numerator.toString()}/${this.denominator.toString()}`;
    }

    toNumber() {
      return Number(this.numerator) / Number(this.denominator);
    }

    toString() {
      return this.toDisplay();
    }
  }

  const MatrixLab = (root.MatrixLab = root.MatrixLab || {});
  MatrixLab.Fraction = Fraction;

  if (typeof module === 'object' && module.exports) {
    module.exports = Fraction;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
