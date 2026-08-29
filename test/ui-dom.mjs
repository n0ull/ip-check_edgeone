/**
 * 主页内嵌脚本（UI_SCRIPT）端到端本地测试：vm 沙箱直接执行脚本值，mock fetch 覆盖四条路径：
 * 双栈成功 / 同源回退 / IPv4 连接判定 / 中文错误原因；并断言抓取日志不请求 6. 子域。
 * 用法：node test/ui-dom.mjs
 */
import { uiScriptFor, onRequest } from '../edge-functions/index.js';
import { onRequest as catchAllOnRequest } from '../edge-functions/[[default]].js';
import { subdomainPath } from '../edge-functions/_shared.js';
import { makeDom, runScript, checker } from './helpers/dom-sandbox.mjs';

const { check, report } = checker();
const BASE = 'ip.example.com';
// 脚本经 UI 模块 interface 实例化（与线上一致的管线），测试不复刻占位符替换机制
const SCRIPT = uiScriptFor(BASE);

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

// 回退路由体从真实 [[default]].js onRequest 派生（路径 4 先例：钉来源，不钉副本）；
// 路由键取端点路径 fact（subdomainPath）——若 fact 与路由 switch 漂移，派生出的体是 404 JSON，
// looksLikeIp 判假，本文件回退用例当场红
async function fallbackRoutes() {
  const routes = {};
  for (const sub of ['4', 'test']) {
    const p = subdomainPath(sub);
    const req = new Request('https://ip.example.com' + p);
    Object.defineProperty(req, 'eo', { value: { clientIp: V4, geo: {} }, enumerable: true });
    const res = await catchAllOnRequest({ request: req, params: {}, env: {}, waitUntil: () => {} });
    routes[p] = { body: await res.text() };
  }
  return routes;
}

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

// —— 路径 2：子域失败 → 同源回退（路由键与响应体均派生自服务端真实实现）——
{
  const { els, calls } = await runPage(await fallbackRoutes());
  check('回退：v4 字段由同源路径填充', els['v4'].textContent === V4, 'got: ' + els['v4'].textContent);
  check('回退：状态标注 OK（同源回退）', els['v4-status'].textContent === 'OK（同源回退）' && els['v4-status'].className === 'status warn');
  check('回退：提示条显示', els['hint'].style.display === 'block');
  check('回退：抓取日志含同源路径', calls.indexOf(subdomainPath('4')) !== -1 && calls.indexOf(subdomainPath('test')) !== -1, 'calls: ' + calls.join(', '));
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

// —— 路径 4：中文错误原因（期望文案从 handleV4 真实输出派生：钉来源，不钉副本）——
{
  // 真实服务端输出：IPv6 连接访问 4. 子域 → handleV4 的 400 中文文案
  const errReq = new Request('https://4.' + BASE + '/');
  Object.defineProperty(errReq, 'eo', { value: { clientIp: V6 }, enumerable: true });
  const errRes = await onRequest({ request: errReq, params: {}, env: {}, waitUntil: () => {} });
  const errBody = await errRes.text();
  check('派生前提：4. 对 IPv6 连接返回 400 中文文案', errRes.status === 400 && /[一-龥]/.test(errBody));
  const { els } = await runPage({
    [subdomainPath('4')]: { body: errBody },
    [subdomainPath('test')]: { body: V4 + '\n' },
  });
  check('中文错误：v4 状态显示原因分句', els['v4-status'].textContent === errBody.split('，')[0], 'got: ' + els['v4-status'].textContent);
  check('中文错误：状态标 err', els['v4-status'].className === 'status err');
  check('中文错误：v4 字段不填充', !els['v4'] || els['v4'].textContent === '');
}

report();
