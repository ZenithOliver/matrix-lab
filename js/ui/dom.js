/* Tiny DOM helpers. Deliberately framework-free so the app opens as a file. */
(function (root) {
  'use strict';

  function appendChildren(node, children) {
    for (const child of children) {
      if (child === null || child === undefined || child === false) {
        continue;
      }
      if (Array.isArray(child)) {
        appendChildren(node, child);
      } else if (child instanceof Node) {
        node.appendChild(child);
      } else {
        node.appendChild(document.createTextNode(String(child)));
      }
    }
  }

  function el(tagName, properties = {}, ...children) {
    const node = document.createElement(tagName);

    for (const [key, value] of Object.entries(properties || {})) {
      if (value === null || value === undefined || value === false) {
        continue;
      }

      if (key === 'class' || key === 'className') {
        node.className = value;
      } else if (key === 'text') {
        node.textContent = value;
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.assign(node.dataset, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, value);
      }
    }

    appendChildren(node, children);
    return node;
  }

  function clear(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
    return node;
  }

  function text(value) {
    return document.createTextNode(String(value));
  }

  const MatrixLab = (root.MatrixLab = root.MatrixLab || {});
  MatrixLab.ui = MatrixLab.ui || {};
  MatrixLab.ui.dom = { el, clear, text, appendChildren };
})(typeof globalThis !== 'undefined' ? globalThis : this);
