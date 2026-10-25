(function (root) {
  'use strict';

  const MatrixLab = root.MatrixLab;
  const { el } = MatrixLab.ui.dom;
  const C = MatrixLab.ui.components;
  const symbolicTools = MatrixLab.symbolic;
  const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

  function subscript(number) {
    return String(number)
      .split('')
      .map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit)
      .join('');
  }

  MatrixLab.featureRegistry.register({
    id: 'standard-form',
    order: 30,
    eyebrow: 'EQUIVALENCE',
    title: '等价标准型矩阵',
    shortTitle: '等价标准型',
    description: '通过初等行、列变换化为 diag(Iᵣ, O)；符号主元需要分类时暂停。',
    compute(matrix) {
      if (symbolicTools.containsSymbols(matrix)) {
        return symbolicTools.equivalentStandardForm(matrix);
      }
      return {
        symbolic: false,
        ...MatrixLab.algorithms.equivalentStandardForm(matrix),
      };
    },
    badge(model) {
      return model.stopped ? '待讨论' : `秩 ${model.rank}`;
    },
    render(model) {
      if (model.stopped) {
        const pivotCells = model.pivotColumns.map((column, index) => [index, column]);
        const count = model.rowOperationCount;
        return el(
          'div',
          { class: 'feature-body' },
          el(
            'div',
            { class: 'result-lead' },
            el(
              'div',
              { class: 'result-matrix' },
              C.matrixCaption('部分结果', '停在分类讨论处'),
              C.matrixBlock(model.result, {
                unitCells: pivotCells,
                ariaLabel: '尚未完成的等价标准型计算',
              }),
            ),
            el(
              'div',
              { class: 'result-facts' },
              C.fact(
                model.rank > 0 ? '已知秩下界' : '矩阵秩',
                model.rank > 0 ? `≥ ${model.rank}` : '待讨论',
                {
                  note: model.rank > 0 ? '最终秩可能更大' : '需按分类结果确定',
                  tone: 'symbolic',
                },
              ),
              C.fact('行变换', String(count), { note: '已执行的初等行变换' }),
              C.fact('计算状态', '已暂停', { note: '等待分类条件' }),
            ),
          ),
          C.callout(
            '还不能确定等价标准型：行化简阶段出现了可能为零的符号主元。请先按下面的条件完成分类讨论。',
            { tone: 'warning' },
          ),
          C.branchPanel(model.branch),
          C.stepsPanel(model.steps, {
            title: '暂停前的行变换步骤',
            meta: `${count} 次行变换 · 停在分类讨论`,
          }),
        );
      }

      const unitCells = Array.from({ length: model.rank }, (_, index) => [index, index]);
      const description =
        model.rank === 0
          ? '原矩阵是零矩阵，等价标准型仍为零矩阵。'
          : `左上角是 ${model.rank} 阶单位矩阵 I${subscript(model.rank)}，其余位置全为 0。`;

      return el(
        'div',
        { class: 'feature-body' },
        el(
          'div',
          { class: 'result-lead' },
          el(
            'div',
            { class: 'result-matrix' },
            C.matrixCaption(
              'PAQ',
              `等价标准型 · ${model.rows}×${model.columns}${model.symbolic ? ' · 符号模式' : ''}`,
            ),
            C.matrixBlock(model.result, {
              unitCells,
              ariaLabel: '等价标准型矩阵',
            }),
          ),
          el(
            'div',
            { class: 'result-facts' },
            C.fact('矩阵秩', String(model.rank), { note: 'r = 主元数' }),
            C.fact('行变换', String(model.rowOperationCount), { note: '初等行变换' }),
            C.fact('列变换', String(model.columnOperationCount), { note: '初等列变换' }),
          ),
        ),
        C.callout(
          `${description} 这里只允许初等行、列变换；它表示矩阵等价，不是相似标准型。${model.symbolic ? ' 符号项已作为独立常数参与运算。' : ''}`,
        ),
        C.stepsPanel(model.steps, {
          title: '行列变换全过程',
          meta: `${model.rowOperationCount} 次行变换 · ${model.columnOperationCount} 次列变换${model.symbolic ? ' · 符号模式' : ''}`,
        }),
      );
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
