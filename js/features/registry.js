/*
 * A minimal feature registry. New matrix tools can be added by registering one
 * descriptor in a new script, without editing the editor or the result shell.
 */
(function (root) {
  'use strict';

  const features = [];

  function register(descriptor) {
    if (!descriptor || typeof descriptor !== 'object') {
      throw new Error('功能描述必须是一个对象');
    }
    if (!descriptor.id || typeof descriptor.id !== 'string') {
      throw new Error('功能必须包含唯一的 id');
    }
    if (features.some((feature) => feature.id === descriptor.id)) {
      throw new Error(`功能 id 重复：${descriptor.id}`);
    }
    if (typeof descriptor.compute !== 'function' || typeof descriptor.render !== 'function') {
      throw new Error(`功能 ${descriptor.id} 必须实现 compute 和 render`);
    }

    features.push({
      order: 100,
      eyebrow: '',
      title: descriptor.id,
      description: '',
      ...descriptor,
    });
  }

  function list() {
    return features.slice().sort((left, right) => left.order - right.order);
  }

  const MatrixLab = (root.MatrixLab = root.MatrixLab || {});
  MatrixLab.featureRegistry = { register, list };
})(typeof globalThis !== 'undefined' ? globalThis : this);
