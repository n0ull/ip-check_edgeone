/**
 * 主页内嵌脚本（UI_SCRIPT）端到端本地测试：vm 沙箱直接执行脚本值，mock fetch 覆盖四条路径：
 * 双栈成功 / 同源回退 / IPv4 连接判定 / 中文错误原因；并断言抓取日志不请求 6. 子域。
 * 用法：node test/ui-dom.mjs
 */
import { UI_SCRIPT } from '../edge-functions/index.js';
import { makeDom, runScript, checker } from './helpers/dom-sandbox.mjs';

const { check, report } = checker();
const BASE = 'ip.example.com';
// 与 renderUi 的占位符替换对齐（脚本尾行 init('__BASE__') → init('ip.example.com')）
const SCRIPT = UI_SCRIPT.split('__BASE__').join(BASE);

// routes: { '<url>': { body } }；未命中即抛错（模拟子域不可达 / 网络失败）
function makeFetch(routes, calls) {
  return async (url) => {
    const u = String(url);
    calls.push(u);
    const r = routes[u];
    if (!r) throw new Error('network fail: ' + u);
    return { ok: true, text: async () => r.body };
  };
}

async function runPage(routes) {
  const calls = [];
  const { document, els } = makeDom();
  const { result } = runScript(SCRIPT, { document, fetch: makeFetch(routes, calls) });
  await result; // 脚本尾行 init(...) 返回的 Promise
  await new Promise((r) => setTimeout(r, 20));
  return { els, calls };
}

const V4 = '203.0.113.7';
const V6 = '240e:390:abcd:1234::1';

// —— 路径 1：双栈成功（子域直达）——
{
  const { els, calls } = await runPage({
    ['https://4.' + BASE + '/']: { body: V4 + '\n' },
    ['https://test.' + BASE + '/']: { body: V6 + '\n' },
  });
  check('双栈：v4 字段填充', els['v4'].textContent === V4, 'got: ' + els['v4'].textContent);
  check('双栈：test 字段填充', els['test'].textContent === V6, 'got: ' + els['test'].textContent);
  check('双栈：徽章判定 IPv6 访问优先', els['verdict'].textContent === 'IPv6 访问优先' && els['verdict'].className === 'badge ipv6');
  check('双栈：IPv6 卡片由 test 派生', els['v6'].textContent === V6 && els['v6-status'].textContent === 'OK');
  check('双栈：未触发同源回退提示', !els['hint'] || els['hint'].style.display !== 'block');
  check('不请求 6. 子域', !calls.some((u) => u.indexOf('://6.') !== -1), 'calls: ' + calls.join(', '));
}

// —— 路径 2：子域失败 → 同源回退 ——
{
  const { els, calls } = await runPage({
    ['/4']: { body: V4 + '\n' },
    ['/test']: { body: V4 + '\n' },
  });
  check('回退：v4 字段由 /4 填充', els['v4'].textContent === V4, 'got: ' + els['v4'].textContent);
  check('回退：状态标注 OK（同源回退）', els['v4-status'].textContent === 'OK（同源回退）' && els['v4-status'].className === 'status warn');
  check('回退：提示条显示', els['hint'].style.display === 'block');
  check('回退：抓取日志含同源路径', calls.indexOf('/4') !== -1 && calls.indexOf('/test') !== -1, 'calls: ' + calls.join(', '));
}

// —— 路径 3：IPv4 连接判定 ——
{
  const { els } = await runPage({
    ['https://4.' + BASE + '/']: { body: V4 + '\n' },
    ['https://test.' + BASE + '/']: { body: V4 + '\n' },
  });
  check('IPv4：徽章为 IPv4 连接（非“优先”）', els['verdict'].textContent === 'IPv4 连接' && els['verdict'].className === 'badge ipv4');
  check('IPv4：test 状态说明无法判定', els['test-status'].textContent === '本次连接为 IPv4，无法判定 IPv6 是否存在');
  check('IPv4：v6 卡片显示未获取到', els['v6-status'].textContent === '当前连接为 IPv4，未获取到 IPv6' && (!els['v6'] || els['v6'].textContent === ''));
}

// —— 路径 4：中文错误原因（如 IPv6 连接访问 4. 的 400 文案）——
{
  const errBody = '当前通过 IPv6 连接，无法获取您的 IPv4 地址。\n请在 4.example.com 的站点设置中关闭 IPv6 访问（强制仅 IPv4 可达），或改用 test 端点。\n';
  const { els } = await runPage({
    ['/4']: { body: errBody },
    ['/test']: { body: V4 + '\n' },
  });
  check('中文错误：v4 状态显示原因分句', els['v4-status'].textContent === '当前通过 IPv6 连接', 'got: ' + els['v4-status'].textContent);
  check('中文错误：状态标 err', els['v4-status'].className === 'status err');
  check('中文错误：v4 字段不填充', !els['v4'] || els['v4'].textContent === '');
}

report();
