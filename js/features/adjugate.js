(function (root) {
  'use strict';

  const MatrixLab = root.MatrixLab;
  const { el } = MatrixLab.ui.dom;
  const C = MatrixLab.ui.components;
  const symbolicTools = MatrixLab.symbolic;

  function buildNote(model) {
    if (model.symbolic) {
      if (model.size === 1) {
        return '按约定，1×1 矩阵 [a] 的伴随矩阵为 [1]；在符号模式下同样适用。';
      }
      if (model.determinant.isZero()) {
        return '这个符号行列式恒为 0，因此对任意参数取值 A 都不可逆；伴随矩阵仍按定义给出。';
      }
      if (model.determinant.isNumeric()) {
        return '行列式是一个非零常数，因此 A 无条件可逆；可直接用 adj(A) / |A| 求逆。';
      }
      return '伴随矩阵的计算不需要除以参数，因此可以完整给出。当 |A| ≠ 0 时 A 可逆，且 A⁻¹ = adj(A) / |A|；若 |A| = 0，则需另行讨论。';
    }

    if (model.size === 1) {
      return '按约定，1×1 矩阵 [a] 的伴随矩阵为 [1]；无论 a 是否为零，这一约定都成立。';
    }
    if (!model.singular) {
      return 'A 可逆，因此 A⁻¹ = adj(A) / |A|。可直接用伴随矩阵除以行列式求逆。';
    }
    if (model.rank <= model.size - 2) {
      return `A 奇异，且秩 ≤ n−2，所有 n−1 阶代数余子式都为 0，因此 adj(A) = O。恒等式 A·adj(A) = |A|·I 仍成立。`;
    }
    return 'A 奇异，但秩为 n−1，至少有一个 n−1 阶子式非零，所以伴随矩阵不一定为零。';
  }

  MatrixLab.featureRegistry.register({
    id: 'adjugate',
    order: 20,
    eyebrow: 'ADJUGATE',
    title: '伴随矩阵',
    shortTitle: '伴随矩阵',
    description: '由代数余子式矩阵转置得到；符号情形通常可完整计算。',
    compute(matrix) {
      const rows = matrix.length;
      const columns = matrix[0].length;
      if (rows !== columns) {
        return { available: false, rows, columns, symbolic: symbolicTools.containsSymbols(matrix) };
      }
      if (symbolicTools.containsSymbols(matrix)) {
        try {
          return {
            available: true,
            ...symbolicTools.adjugate(matrix),
          };
        } catch (error) {
          if (error instanceof MatrixLab.SymbolicLimitError) {
            return {
              available: false,
              limit: true,
              symbolic: true,
              rows,
              columns,
              limitMessage: error.message,
            };
          }
          throw error;
        }
      }
      return {
        available: true,
        symbolic: false,
        ...MatrixLab.algorithms.adjugate(matrix),
      };
    },
    badge(model) {
      if (!model.available) return model.limit ? '未展开' : '不适用';
      if (model.symbolic) {
        if (model.determinant.isZero()) return '恒奇异';
        if (model.determinant.isNumeric()) return '可逆';
        return '条件可逆';
      }
      return model.singular ? '奇异' : '可逆';
    },
    render(model) {
      if (!model.available) {
        if (model.limit) {
          return el(
            'div',
            { class: 'feature-body' },
            C.unavailableState('符号矩阵规模较大，暂未展开', model.limitMessage),
            C.callout('可以把矩阵缩小后再看伴随矩阵；实际计算中 2×2、3×3 的符号矩阵已经足够常见。'),
          );
        }
        return el(
          'div',
          { class: 'feature-body' },
          C.unavailableState(
            '伴随矩阵只对方阵有定义',
            `当前输入为 ${model.rows}×${model.columns} 矩阵。请把行数和列数调成相同，再查看 adj(A)。`,
          ),
          C.callout('定义：adj(A) = Cᵀ，其中 Cᵢⱼ 是去掉第 i 行、第 j 列后的代数余子式。'),
        );
      }

      let determinantValue;
      let determinantNote;
      let determinantTone;
      let invertibility;
      let invertibilityNote;
      let calloutTone = 'neutral';

      if (model.symbolic) {
        determinantValue = C.valueNode(model.determinant, { className: 'is-large' });
        if (model.determinant.isZero()) {
          determinantNote = '恒为 0';
          determinantTone = 'warning';
          invertibility = '恒不可逆';
          invertibilityNote = '任意参数取值下均奇异';
          calloutTone = 'warning';
        } else if (model.determinant.isNumeric()) {
          determinantNote = '非零常数';
          determinantTone = 'positive';
          invertibility = '可逆';
          invertibilityNote = '与参数取值无关';
        } else {
          determinantNote = '含参数表达式';
          invertibility = '需讨论';
          invertibilityNote = '当 |A| ≠ 0 时可逆';
        }
      } else {
        determinantValue = C.fractionNode(model.determinant, { className: 'is-large' });
        determinantNote = model.singular ? '等于 0' : '非零';
        determinantTone = model.singular ? 'warning' : 'positive';
        invertibility = model.singular ? '不可逆' : '可逆';
        invertibilityNote = model.singular ? '奇异矩阵' : 'A⁻¹ 存在';
        calloutTone = model.singular ? 'warning' : 'neutral';
      }

      const factList = el(
        'div',
        { class: 'result-facts' },
        C.fact('行列式 |A|', determinantValue, {
          note: determinantNote,
          tone: determinantTone,
        }),
        C.fact('可逆性', invertibility, {
          note: invertibilityNote,
          tone: model.symbolic && !model.determinant.isNumeric() ? 'symbolic' : undefined,
        }),
        C.fact('矩阵阶数', `${model.size} × ${model.size}`, {
          note: `${model.size * model.size} 个余子式`,
        }),
      );

      const cofactorCount = model.size * model.size;

      return el(
        'div',
        { class: 'feature-body' },
        el(
          'div',
          { class: 'result-lead' },
          el(
            'div',
            { class: 'result-matrix' },
            C.matrixCaption('adj(A)', model.symbolic ? '伴随矩阵 · 符号式' : '伴随矩阵'),
            C.matrixBlock(model.adjugate, {
              ariaLabel: '伴随矩阵',
            }),
          ),
          factList,
        ),
        C.callout(buildNote(model), { tone: calloutTone }),
        C.stepsPanel(model.steps, {
          title: '代数余子式与转置',
          meta: `${cofactorCount} 个代数余子式 · 1 次转置${model.symbolic ? ' · 符号模式' : ''}`,
        }),
        el(
          'p',
          { class: 'formula-footnote' },
          '恒等式：A · adj(A) = adj(A) · A = |A| · I',
        ),
      );
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
