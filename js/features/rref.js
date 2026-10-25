(function (root) {
  'use strict';

  const MatrixLab = root.MatrixLab;
  const { el } = MatrixLab.ui.dom;
  const C = MatrixLab.ui.components;
  const symbolicTools = MatrixLab.symbolic;

  function buildNote(model) {
    if (model.symbolic) {
      if (model.stopped) {
        return '已停在需要分类讨论的位置。当前矩阵还不是完整的最简行阶梯形，下面列出了继续计算所需的情形。';
      }
      return '在计算过程中没有出现需要判断零值的符号主元；上述最简形不需要额外的参数条件。';
    }

    if (model.rank === 0) {
      return '原矩阵是零矩阵，因此它的最简行阶梯形仍是同尺寸的零矩阵。';
    }
    if (model.rank === model.rows && model.rows === model.columns) {
      return '这是一个满秩方阵，最简行阶梯形就是同阶单位矩阵。';
    }
    if (model.rank === model.rows) {
      return '矩阵行满秩：每一行都有主元，没有全零行，但列数多于秩。';
    }
    if (model.rank === model.columns) {
      return '矩阵列满秩：每一列都有主元，但行数多于秩。';
    }
    return `最简形中有 ${model.rows - model.rank} 个全零行；秩 ${model.rank} 同时等于非零行数与主元个数。`;
  }

  MatrixLab.featureRegistry.register({
    id: 'rref',
    order: 10,
    eyebrow: 'ROW REDUCTION',
    title: '简化行阶梯形矩阵',
    shortTitle: '行最简形',
    description: '只用初等行变换化为 RREF；符号主元需要分类时自动暂停。',
    compute(matrix) {
      if (symbolicTools.containsSymbols(matrix)) {
        return symbolicTools.rref(matrix);
      }
      return { symbolic: false, ...MatrixLab.algorithms.rref(matrix) };
    },
    badge(model) {
      if (model.symbolic && model.stopped) return '待讨论';
      return `秩 ${model.rank}`;
    },
    render(model) {
      const pivotCells = model.pivotColumns.map((column, index) => [index, column]);
      const factList = el(
        'div',
        { class: 'result-facts' },
        C.fact(
          model.stopped && model.rank > 0 ? '已知秩下界' : '矩阵秩',
          model.stopped
            ? model.rank > 0
              ? `≥ ${model.rank}`
              : '待讨论'
            : String(model.rank),
          {
            note: model.stopped
              ? model.rank > 0
                ? '最终秩可能更大'
                : '需按分类结果确定'
              : 'rank(A)',
            tone: model.symbolic ? 'symbolic' : undefined,
          },
        ),
        C.fact(
          '主元列',
          model.pivotColumns.length
            ? model.pivotColumns.map((column) => column + 1).join('、')
            : '无',
          { note: '从 1 开始编号' },
        ),
        model.symbolic
          ? C.fact('计算状态', model.stopped ? '已暂停' : '已完成', {
              note: model.stopped ? '等待分类条件' : '符号模式',
            })
          : C.fact('全零行', String(model.rows - model.rank), {
              note: model.rows - model.rank === 0 ? '无全零行' : '位于末尾',
            }),
      );

      const count = Math.max(0, model.steps.length - 1);
      const meta = model.stopped
        ? `${count} 次已执行的行变换 · 停在分类讨论`
        : model.symbolic
          ? `${count} 次初等行变换 · 符号模式`
          : count > 0
            ? `共 ${count} 次初等行变换`
            : '原矩阵已是最简形';

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
              model.stopped ? '部分 RREF(A)' : 'RREF(A)',
              model.stopped ? '停在分类讨论处' : '最简行阶梯形',
            ),
            C.matrixBlock(model.rref, {
              unitCells: pivotCells,
              ariaLabel: model.stopped ? '尚未完成的最简行阶梯形' : '最简行阶梯形矩阵',
            }),
          ),
          factList,
        ),
        C.callout(buildNote(model), { tone: model.stopped ? 'warning' : 'neutral' }),
        model.stopped ? C.branchPanel(model.branch) : null,
        C.stepsPanel(model.steps, {
          title: model.stopped ? '暂停前的行变换步骤' : '行变换关键步骤',
          meta,
        }),
      );
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
