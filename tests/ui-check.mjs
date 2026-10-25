'use strict';

/*
 * Zero-dependency browser smoke test and screenshot helper.
 * Uses Chrome's DevTools protocol directly, so the app itself stays dependency-free.
 *
 * Run: node tests/ui-check.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ARTIFACTS = path.join(HERE, 'artifacts');
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => existsSync(candidate));

if (!CHROME) {
  throw new Error('未找到 Chrome 或 Edge，无法进行界面冒烟测试。');
}

mkdirSync(ARTIFACTS, { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), 'matrixlab-ui-'));

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForJson(url, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`等待 Chrome 超时：${url}`);
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const listeners = this.events.get(message.method) || [];
      for (const listener of listeners) listener(message.params);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(method, listener) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(listener);
  }

  close() {
    this.socket.close();
  }
}

const delays = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const port = await getFreePort();
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let client;
  const pageErrors = [];
  const consoleErrors = [];

  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const pageTarget = targets.find((target) => target.type === 'page');
    if (!pageTarget) throw new Error('没有找到可用的 Chrome 页面目标。');

    client = await Cdp.connect(pageTarget.webSocketDebuggerUrl);
    client.on('Runtime.exceptionThrown', (params) => {
      pageErrors.push(params.exceptionDetails?.text || '未知页面异常');
    });
    client.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') {
        consoleErrors.push(
          params.args.map((argument) => argument.value || argument.description || '').join(' '),
        );
      }
    });

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const url = pathToFileURL(path.join(ROOT, 'index.html')).href;
    await client.send('Page.navigate', { url });
    await delays(700);

    async function evaluate(expression) {
      const response = await client.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (response.exceptionDetails) {
        throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      }
      return response.result.value;
    }

    async function waitFor(expression, label, timeout = 4000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await evaluate(expression)) return;
        await delays(80);
      }
      throw new Error(`等待条件超时：${label}`);
    }

    async function screenshot(name, fullPage = false) {
      let params = { format: 'png', captureBeyondViewport: true };
      if (fullPage) {
        await evaluate('window.scrollTo(0, 0)');
        await delays(100);
        const metrics = await client.send('Page.getLayoutMetrics');
        const size = metrics.cssContentSize;
        params = {
          ...params,
          clip: {
            x: 0,
            y: 0,
            width: Math.ceil(size.width),
            height: Math.min(Math.ceil(size.height), 4200),
            scale: 1,
          },
        };
      }
      const result = await client.send('Page.captureScreenshot', params);
      writeFileSync(path.join(ARTIFACTS, name), Buffer.from(result.data, 'base64'));
    }

    const checks = [];
    const check = (name, condition, detail = '') => {
      checks.push({ name, ok: Boolean(condition), detail });
      if (!condition) throw new Error(`检查失败：${name}${detail ? `（${detail}）` : ''}`);
    };

    check('初始页面加载 3 张结果卡', (await evaluate("document.querySelectorAll('#resultsList .result-card').length")) === 3);
    check('初始秩为 2', (await evaluate("document.getElementById('rankChip').textContent.trim()")) === '2');
    check(
      '初始行列式为 0 且标记奇异',
      await evaluate("document.querySelector('.summary-chip.is-warning #detChip')?.textContent.includes('0')"),
    );
    check(
      '无横向溢出（桌面）',
      await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
      await evaluate('document.documentElement.scrollWidth + "/" + window.innerWidth'),
    );
    check(
      '每个输入格都有可访问标签',
      await evaluate(
        "[...document.querySelectorAll('#matrixEditor .matrix-input')].every((input) => Boolean(input.getAttribute('aria-label')))",
      ),
    );
    await screenshot('initial-desktop.png', true);

    check(
      '顶部有两种工作模式',
      (await evaluate("document.querySelectorAll('.mode-tab').length")) === 2,
    );
    check(
      '默认处于化简分析模式',
      await evaluate(
        "!document.getElementById('mode-analysis').hidden && document.getElementById('mode-operations').hidden",
      ),
    );

    await evaluate("document.querySelector('.mode-tab[data-mode=\"operations\"]').click()");
    await delays(240);
    check(
      '可切换到矩阵运算模式',
      await evaluate(
        "document.getElementById('mode-analysis').hidden && !document.getElementById('mode-operations').hidden",
      ),
    );
    check(
      '运算模式标签处于选中状态',
      await evaluate(
        "document.querySelector('.mode-tab[data-mode=\"operations\"]').getAttribute('aria-selected') === 'true'",
      ),
    );
    check(
      '运算模式标签为深海蓝',
      (await evaluate(
        "getComputedStyle(document.querySelector('.mode-tab[data-mode=\"operations\"]')).backgroundColor",
      )) === 'rgb(28, 58, 94)',
    );
    check(
      '运算模式默认展示 A + B 结果',
      (await evaluate(
        "document.querySelector('#arithmeticResultList .matrix-table').innerText.replace(/\\s+/g,' ').trim()",
      )) === '3 3 4 4',
    );
    check(
      '切换到运算模式后快捷跳转指向结果',
      (await evaluate("document.querySelector('.skip-link').getAttribute('href')")) ===
        '#arithmeticResults',
    );

    await evaluate("document.querySelector('.mode-tab[data-mode=\"analysis\"]').click()");
    await delays(220);
    check(
      '可切回化简分析模式',
      await evaluate(
        "!document.getElementById('mode-analysis').hidden && document.getElementById('mode-operations').hidden",
      ),
    );

    check(
      '计算按钮默认为深海蓝',
      (await evaluate("getComputedStyle(document.getElementById('calculateButton')).backgroundColor")) ===
        'rgb(28, 58, 94)',
    );
    check(
      '默认色块处于选中状态',
      await evaluate("document.querySelector('.color-swatch[data-color=\"#1c3a5e\"]').getAttribute('aria-pressed') === 'true'"),
    );

    await evaluate("document.querySelector('.color-swatch[data-color=\"#713447\"]').click()");
    await delays(260);
    const switchedButtonColor = await evaluate(
      "getComputedStyle(document.getElementById('calculateButton')).backgroundColor",
    );
    check(
      '预设颜色可以切换',
      switchedButtonColor === 'rgb(113, 52, 71)',
      switchedButtonColor,
    );

    await evaluate(`(() => {
      const picker = document.getElementById('customColor');
      picker.value = '#7b5d8f';
      picker.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await delays(260);
    check(
      '自定义颜色可以应用',
      (await evaluate("getComputedStyle(document.getElementById('calculateButton')).backgroundColor")) ===
        'rgb(123, 93, 143)',
    );
    check(
      '自定义颜色入口显示选中态',
      await evaluate("document.getElementById('customColorLabel').classList.contains('is-active')"),
    );

    await client.send('Page.navigate', { url });
    await delays(700);
    check(
      '自定义颜色刷新后仍保留',
      (await evaluate("getComputedStyle(document.getElementById('calculateButton')).backgroundColor")) ===
        'rgb(123, 93, 143)',
    );

    await evaluate("document.querySelector('.color-swatch[data-color=\"#1c3a5e\"]').click()");
    await delays(260);
    check(
      '可恢复默认按钮颜色',
      (await evaluate("getComputedStyle(document.getElementById('calculateButton')).backgroundColor")) ===
        'rgb(28, 58, 94)',
    );

    const arrowNavigation = await evaluate(`(() => {
      const inputs = [...document.querySelectorAll('#matrixEditor .matrix-input')];
      inputs[0].focus();
      const press = (key) => document.activeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      );
      press('ArrowRight');
      const afterRight = inputs.indexOf(document.activeElement);
      press('ArrowDown');
      const afterDown = inputs.indexOf(document.activeElement);
      press('ArrowLeft');
      const afterLeft = inputs.indexOf(document.activeElement);
      return [afterRight, afterDown, afterLeft];
    })()`);
    check(
      '方向键移动到相邻单元格',
      JSON.stringify(arrowNavigation) === JSON.stringify([1, 4, 3]),
      JSON.stringify(arrowNavigation),
    );

    const firstCellPoint = await evaluate(`(() => {
      const input = document.querySelector('#matrixEditor .matrix-input');
      const rect = input.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: firstCellPoint.x,
      y: firstCellPoint.y,
      button: 'left',
      clickCount: 1,
    });
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: firstCellPoint.x,
      y: firstCellPoint.y,
      button: 'left',
      clickCount: 1,
    });
    await delays(120);
    check(
      '点击输入格后自动全选旧值',
      await evaluate(`(() => {
        const input = document.querySelector('#matrixEditor .matrix-input');
        return (
          document.activeElement === input &&
          input.selectionStart === 0 &&
          input.selectionEnd === input.value.length &&
          input.value.length > 0
        );
      })()`),
    );
    await client.send('Input.insertText', { text: '9' });
    await delays(120);
    check(
      '直接输入新数字覆盖旧值',
      (await evaluate("document.querySelector('#matrixEditor .matrix-input').value")) === '9',
    );
    check(
      '编辑输入时保留上一次结果',
      (await evaluate("document.querySelectorAll('#resultsList .result-card').length")) === 3,
    );
    check('编辑输入时显示待刷新提示', await evaluate("!document.getElementById('staleNotice').hidden"));

    await evaluate(`(() => {
      const input = document.querySelector('#matrixEditor .matrix-input');
      input.value = '1';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);

    await evaluate(`(() => {
      const choose = (id, value) => {
        const select = document.getElementById(id);
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      choose('rowsSelect', '2');
      choose('colsSelect', '2');
      const values = [['1','2'],['3','4']];
      const inputs = [...document.querySelectorAll('#matrixEditor .matrix-input')];
      inputs.forEach((input, index) => {
        input.value = values[Math.floor(index / 2)][index % 2];
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      document.getElementById('calculateButton').click();
    })()`);
    await delays(150);

    check('2×2 行列式更新为 −2', (await evaluate("document.getElementById('detChip').textContent.replace(/\\s/g,'')")) === '−2');
    check(
      '伴随矩阵计算正确',
      await evaluate(
        "document.querySelectorAll('#resultsList .result-card')[1].querySelector('.matrix-table').innerText.replace(/\\s+/g,' ').trim()",
      ) === '4 −2 −3 1',
    );
    check(
      '矩阵尺寸更新为 2 × 2',
      (await evaluate("document.getElementById('sizeChip').textContent.trim()")) === '2 × 2',
    );

    await evaluate(`(() => {
      const values = ['1', '3/2', '0', '0'];
      const inputs = [...document.querySelectorAll('#matrixEditor .matrix-input')];
      inputs.forEach((input, index) => {
        input.value = values[index];
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      document.getElementById('calculateButton').click();
    })()`);
    await delays(200);
    check(
      '分数使用行内斜杠显示',
      await evaluate(
        "document.querySelectorAll('#resultsList .result-card')[0].querySelector('.matrix-table').innerText.includes('3/2')",
      ),
    );
    check(
      '不再使用上下堆叠分数结构',
      (await evaluate("document.querySelectorAll('.frac-num, .frac-den').length")) === 0,
    );
    await screenshot('fraction-display.png', true);

    await evaluate(`(() => {
      const input = document.querySelector('#matrixEditor .matrix-input');
      input.value = '1/0';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('calculateButton').click();
    })()`);
    await delays(100);

    check('无效分数会显示错误', await evaluate("!document.getElementById('inputError').hidden"));
    check(
      '错误提示指出分母',
      await evaluate("document.getElementById('inputError').textContent.includes('分母')"),
    );

    await evaluate(`(() => {
      const choose = (id, value) => {
        const select = document.getElementById(id);
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      choose('rowsSelect', '2');
      choose('colsSelect', '3');
      const values = [['1','2','3'],['4','5','6']];
      const inputs = [...document.querySelectorAll('#matrixEditor .matrix-input')];
      inputs.forEach((input, index) => {
        input.value = values[Math.floor(index / 3)][index % 3];
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      document.getElementById('calculateButton').click();
    })()`);
    await delays(150);

    check(
      '非方阵时伴随矩阵不可用',
      await evaluate(
        "document.querySelectorAll('#resultsList .result-card')[1].textContent.includes('只对方阵有定义')",
      ),
    );
    check(
      '非方阵等价标准型正确',
      await evaluate(
        "document.querySelectorAll('#resultsList .result-card')[2].querySelector('.matrix-table').innerText.replace(/\\s+/g,' ').trim()",
      ) === '1 0 0 0 1 0',
    );

    await evaluate("document.querySelectorAll('#resultsList .steps-summary')[0].click()");
    await delays(120);
    check('步骤面板可展开', await evaluate("document.querySelectorAll('#resultsList .steps-panel')[0].open === true"));
    check(
      '行变换步骤保留',
      (await evaluate("document.querySelectorAll('#resultsList .steps-panel')[0].querySelectorAll('.step-item').length")) >= 3,
    );

    await screenshot('desktop-steps.png');

    await evaluate(`(() => {
      const choose = (id, value) => {
        const select = document.getElementById(id);
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      choose('rowsSelect', '2');
      choose('colsSelect', '2');
      const values = [['a','b'],['c','d']];
      const inputs = [...document.querySelectorAll('#matrixEditor .matrix-input')];
      inputs.forEach((input, index) => {
        input.value = values[Math.floor(index / 2)][index % 2];
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      document.getElementById('calculateButton').click();
    })()`);
    await delays(250);

    check('符号输入不再报错', await evaluate("document.getElementById('inputError').hidden"));
    check('符号模式提示可见', await evaluate("!document.getElementById('symbolicNotice').hidden"));
    check(
      '符号输入格有视觉标记',
      (await evaluate("document.querySelectorAll('#matrixEditor .matrix-input.is-symbolic').length")) === 4,
    );
    check(
      'RREF 停在分类讨论',
      await evaluate(
        "document.querySelectorAll('#resultsList .result-card')[0].textContent.includes('需要分类讨论，计算已暂停')",
      ),
    );
    check(
      '分类讨论给出三种情形',
      (await evaluate("document.querySelectorAll('#resultsList .result-card')[0].querySelectorAll('.branch-case').length")) === 3,
    );
    check(
      '分类条件包含符号主元',
      await evaluate(
        "document.querySelectorAll('#resultsList .result-card')[0].querySelector('.branch-condition-text').textContent.includes('a')",
      ),
    );
    check(
      '符号伴随矩阵完整计算',
      await evaluate(
        "document.querySelectorAll('#resultsList .result-card')[1].querySelector('.matrix-table').innerText.replace(/\\s+/g,' ').trim()",
      ) === 'd −b −c a',
    );
    check(
      '符号行列式显示为表达式',
      await evaluate(
        "document.querySelectorAll('#resultsList .result-card')[1].textContent.includes('a·d − b·c')",
      ),
    );
    check(
      '等价标准型等待分类讨论',
      await evaluate(
        "document.querySelectorAll('#resultsList .result-card')[2].textContent.includes('还不能确定等价标准型')",
      ),
    );
    check(
      '符号模式秩显示待讨论',
      (await evaluate("document.getElementById('rankChip').textContent.trim()")) === '待讨论',
    );

    await screenshot('symbolic-desktop.png', true);

    await evaluate(`(() => {
      const values = [['1','a'],['0','0']];
      const inputs = [...document.querySelectorAll('#matrixEditor .matrix-input')];
      inputs.forEach((input, index) => {
        input.value = values[Math.floor(index / 2)][index % 2];
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      document.getElementById('calculateButton').click();
    })()`);
    await delays(200);
    check(
      '无需分支时符号计算可以完成',
      await evaluate("document.getElementById('statusText').textContent.includes('符号计算完成')"),
    );
    check(
      '无需分支时不再显示分类面板',
      (await evaluate("document.querySelectorAll('#resultsList .branch-panel').length")) === 0,
    );

    await evaluate(`(() => {
      const choose = (id, value) => {
        const select = document.getElementById(id);
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      choose('rowsSelect', '8');
      choose('colsSelect', '8');
      const inputs = [...document.querySelectorAll('#matrixEditor .matrix-input')];
      inputs.forEach((input, index) => {
        const row = Math.floor(index / 8);
        const col = index % 8;
        input.value = String((row * 3 + col * 2) % 7 - 3);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      document.getElementById('calculateButton').click();
    })()`);
    await delays(250);
    check(
      '8×8 矩阵可计算且无横向页面溢出',
      await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
      await evaluate('document.documentElement.scrollWidth + "/" + window.innerWidth'),
    );
    check(
      '8×8 输入网格完整容纳在面板内',
      await evaluate(
        "document.querySelector('.matrix-editor').scrollWidth <= document.querySelector('.matrix-editor').clientWidth + 1",
      ),
    );

    await evaluate("document.querySelector('.mode-tab[data-mode=\"operations\"]').click()");
    await delays(260);

    await evaluate("document.querySelector('.operation-option[data-operation=\"subtract\"]').click()");
    await delays(180);
    check(
      '矩阵减法结果正确',
      (await evaluate(
        "document.querySelector('#arithmeticResultList .matrix-table').innerText.replace(/\\s+/g,' ').trim()",
      )) === '1 −1 4 2',
    );

    await evaluate("document.querySelector('.operation-option[data-operation=\"multiply\"]').click()");
    await delays(180);
    check(
      '矩阵乘法结果正确',
      (await evaluate(
        "document.querySelector('#arithmeticResultList .matrix-table').innerText.replace(/\\s+/g,' ').trim()",
      )) === '2 5 4 11',
    );
    check(
      '乘法保持 B 行数与 A 列数同步且可调整 B 列',
      await evaluate(
        "document.getElementById('operandBRows').value === '2' && document.getElementById('operandBRows').disabled && !document.getElementById('operandBCols').disabled",
      ),
    );
    check(
      '乘法提供逐项展开明细',
      (await evaluate("document.querySelectorAll('#arithmeticResultList .arithmetic-detail-item').length")) === 4,
    );
    await evaluate("document.querySelector('#arithmeticResultList .steps-summary').click()");
    await delays(120);
    check(
      '乘法明细可以展开',
      await evaluate("document.querySelector('#arithmeticResultList .steps-panel').open === true"),
    );
    await screenshot('arithmetic-desktop.png', true);

    await evaluate("document.querySelector('.operation-option[data-operation=\"transpose\"]').click()");
    await delays(180);
    check(
      '转置结果正确',
      (await evaluate(
        "document.querySelector('#arithmeticResultList .matrix-table').innerText.replace(/\\s+/g,' ').trim()",
      )) === '2 4 1 3',
    );
    check(
      '转置时隐藏矩阵 B',
      await evaluate("document.getElementById('operandBPanel').hidden === true"),
    );

    await evaluate("document.querySelector('.operation-option[data-operation=\"multiply\"]').click()");
    await delays(120);
    await evaluate(`(() => {
      const select = document.getElementById('operandACols');
      select.value = '3';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await delays(140);
    check(
      '改变 A 列数会自动同步 B 行数',
      await evaluate(
        "document.getElementById('operandBRows').value === '3' && document.getElementById('operandBRows').disabled",
      ),
    );
    await evaluate(`(() => {
      const select = document.getElementById('operandACols');
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await delays(100);

    await evaluate("document.querySelector('.operation-option[data-operation=\"add\"]').click()");
    await delays(160);
    await evaluate(`(() => {
      const setValues = (selector, values) => {
        const inputs = [...document.querySelectorAll(selector)];
        inputs.forEach((input, index) => {
          input.value = values[index];
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      };
      setValues('#operandAEditor .matrix-input', ['a', 'b', 'c', 'd']);
      setValues('#operandBEditor .matrix-input', ['1', '0', '0', '1']);
      document.getElementById('arithmeticCalculate').click();
    })()`);
    await delays(220);
    check(
      '矩阵运算支持符号常数',
      await evaluate("!document.getElementById('arithmeticSymbolicNotice').hidden"),
    );
    check(
      '符号加法结果精确',
      await evaluate(
        "document.querySelector('#arithmeticResultList .matrix-table').innerText.includes('a + 1')",
      ),
    );

    await evaluate("document.querySelector('.mode-tab[data-mode=\"analysis\"]').click()");
    await delays(220);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 768,
      height: 1024,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delays(150);
    check(
      '平板宽度无横向溢出',
      await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
      await evaluate('document.documentElement.scrollWidth + "/" + window.innerWidth'),
    );

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await evaluate('window.scrollTo(0, 0)');
    await delays(250);

    check(
      '移动端无横向溢出',
      await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
      await evaluate('document.documentElement.scrollWidth + "/" + window.innerWidth'),
    );
    check(
      '移动端 8×8 输入网格完整可见',
      await evaluate(
        "document.querySelector('.matrix-editor').scrollWidth <= document.querySelector('.matrix-editor').clientWidth + 1",
      ),
    );
    check(
      '移动端隐藏顶部状态说明',
      await evaluate("getComputedStyle(document.querySelector('.header-note')).display === 'none'"),
    );
    await screenshot('mobile-8x8.png');

    await client.send('Page.navigate', { url });
    await delays(700);
    await evaluate('window.scrollTo(0, 0)');
    await delays(150);
    check('移动端刷新后仍显示 3 张结果卡', (await evaluate("document.querySelectorAll('#resultsList .result-card').length")) === 3);
    check(
      '初始状态移动端无横向溢出',
      await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
      await evaluate('document.documentElement.scrollWidth + "/" + window.innerWidth'),
    );
    await screenshot('initial-mobile.png', true);

    await evaluate(`(() => {
      const choose = (id, value) => {
        const select = document.getElementById(id);
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      choose('rowsSelect', '2');
      choose('colsSelect', '2');
      const values = [['a','b'],['c','d']];
      const inputs = [...document.querySelectorAll('#matrixEditor .matrix-input')];
      inputs.forEach((input, index) => {
        input.value = values[Math.floor(index / 2)][index % 2];
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      document.getElementById('calculateButton').click();
    })()`);
    await delays(300);
    check(
      '移动端符号分类面板无横向溢出',
      await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
      await evaluate('document.documentElement.scrollWidth + "/" + window.innerWidth'),
    );
    await screenshot('symbolic-mobile.png', true);

    await evaluate("document.querySelector('.mode-tab[data-mode=\"operations\"]').click()");
    await delays(260);
    await evaluate("document.querySelector('.operation-option[data-operation=\"multiply\"]').click()");
    await delays(160);
    await evaluate(`(() => {
      const setValues = (selector, values) => {
        const inputs = [...document.querySelectorAll(selector)];
        inputs.forEach((input, index) => {
          input.value = values[index];
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      };
      setValues('#operandAEditor .matrix-input', ['2', '1', '4', '3']);
      setValues('#operandBEditor .matrix-input', ['1', '2', '0', '1']);
      document.getElementById('arithmeticCalculate').click();
    })()`);
    await delays(250);
    check(
      '移动端矩阵运算模式无横向溢出',
      await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
      await evaluate('document.documentElement.scrollWidth + "/" + window.innerWidth'),
    );
    check(
      '移动端乘法结果正确',
      (await evaluate(
        "document.querySelector('#arithmeticResultList .matrix-table').innerText.replace(/\\s+/g,' ').trim()",
      )) === '2 5 4 11',
    );
    await screenshot('arithmetic-mobile.png', true);

    check('没有页面运行时异常', pageErrors.length === 0, pageErrors.join(' | '));
    check('没有 console.error', consoleErrors.length === 0, consoleErrors.join(' | '));

    console.log('UI smoke checks passed:');
    for (const result of checks) {
      console.log(`  ✓ ${result.name}`);
    }
    console.log(`Screenshots written to ${ARTIFACTS}`);
  } finally {
    client?.close();
    chrome.kill();
    await delays(350);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // A lingering Chrome process may still hold the profile; harmless.
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
