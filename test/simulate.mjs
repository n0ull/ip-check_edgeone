/**
 * 本地逻辑验证脚本（无需 EdgeOne 环境，Node 18+ 直接运行：npm test）
 * 模拟 EdgeOne 边缘运行时：构造 Request（可携带 request.eo），调用 onRequest(context) 并断言结果。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// 校验待测文件存在（作为入口文件被 Makers 构建器识别）
for (const f of ['index.js', '[[default]].js']) {
  const p = path.join(root, 'edge-functions', f);
  if (!readFileSync(p, 'utf8').includes('export async function onRequest')) {
    console.error('✘ ' + f + ' 未导出 onRequest');
    process.exit(1);
  }
}

const indexMod = await import(pathToFileURL(path.join(root, 'edge-functions', 'index.js')).href);
const catchAllMod = await import(pathToFileURL(path.join(root, 'edge-functions', '[[default]].js')).href);
const sharedMod = await import(pathToFileURL(path.join(root, 'edge-functions', '_shared.js')).href);

let passed = 0;
let failed = 0;

function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

function makeRequest(host, pathname, opts) {
  const req = new Request('https://' + host + (pathname || '/'), {
    method: (opts && opts.method) || 'GET',
    headers: opts && opts.headers ? opts.headers : {},
  });
  if (opts && opts.eo) {
    Object.defineProperty(req, 'eo', { value: opts.eo, enumerable: true });
  }
  return req;
}

async function call(mod, host, pathname, opts) {
  const request = makeRequest(host, pathname, opts);
  const res = await mod.onRequest({ request, params: {}, env: {}, waitUntil: () => {} });
  const body = await res.text();
  return { res, body };
}

async function section(title, fn) {
  console.log('\n== ' + title + ' ==');
  await fn();
}

// ---------- index.js：Host 子域名分发 ----------
await section('index.js · Host 分发', async () => {
  const eo4 = { clientIp: '1.2.3.4', geo: {} };
  const eo6 = { clientIp: '240e:390:abcd:1234::1', geo: {} };

  // 4.ip.<domain> → IPv4 纯文本
  let r = await call(indexMod, '4.ip.example.com', '/', { eo: eo4 });
  check('4. 返回 IPv4 纯文本', r.res.status === 200 && r.body.trim() === '1.2.3.4', 'body=' + JSON.stringify(r.body));
  check('4. 响应头 x-ip-family=IPv4', r.res.headers.get('x-ip-family') === 'IPv4');
  check('4. 响应头 CORS', r.res.headers.get('access-control-allow-origin') === '*');
  check('4. 响应头 no-store', (r.res.headers.get('cache-control') || '').includes('no-store'));

  // 4.ip.<domain> + IPv6 连接 → 400 提示
  r = await call(indexMod, '4.ip.example.com', '/', { eo: eo6 });
  check('4. IPv6 连接时返回 400 与提示', r.res.status === 400 && r.body.includes('IPv4'), 'body=' + JSON.stringify(r.body.slice(0, 60)));

  // test.ip.<domain> → 连接 IP（IPv6 ⇒ IPv6 优先）
  r = await call(indexMod, 'test.ip.example.com', '/', { eo: eo6 });
  check('test. IPv6 连接返回 IPv6 地址', r.res.status === 200 && r.body.trim() === eo6.clientIp);
  check('test. x-ip-preferred=IPv6', r.res.headers.get('x-ip-preferred') === 'IPv6');
  r = await call(indexMod, 'test.ip.example.com', '/', { eo: eo4 });
  check('test. IPv4 连接返回 IPv4 地址', r.res.status === 200 && r.body.trim() === '1.2.3.4');
  check('test. IPv4 连接不输出 x-ip-preferred（无法判定优先）', r.res.headers.get('x-ip-preferred') === null);

  // test. 支持 ?format=json
  r = await call(indexMod, 'test.ip.example.com', '/?format=json', { eo: eo6 });
  let j = null; try { j = JSON.parse(r.body); } catch (_) {}
  check('test. ?format=json 输出 JSON', !!j && j.ip === eo6.clientIp && j.ipv6Preferred === true, 'body=' + JSON.stringify(r.body.slice(0, 80)));
  r = await call(indexMod, 'test.ip.example.com', '/?format=json', { eo: eo4 });
  j = null; try { j = JSON.parse(r.body); } catch (_) {}
  check('test. IPv4 连接 JSON 不含 ipv6Preferred（无法判定）', !!j && j.family === 'IPv4' && !('ipv6Preferred' in j), 'body=' + JSON.stringify(r.body.slice(0, 120)));

  // ip.<domain> → UI
  r = await call(indexMod, 'ip.example.com', '/', { eo: eo4 });
  check('ip. 返回 HTML UI', r.res.status === 200 && (r.res.headers.get('content-type') || '').includes('text/html') && r.body.includes('IP 查询'), 'ct=' + r.res.headers.get('content-type'));
  check('UI 极简结构（三字段，无本页连接行）', r.body.includes('IPv4 地址') && r.body.includes('IPv6 地址') && r.body.includes('双栈测试') && !r.body.includes('本页连接'));
  check('UI 去除装饰（无 emoji）', !r.body.includes('🌐'));
  check('UI 注入 BASE 域名', r.body.includes('ip.example.com'));
  check('UI 服务端即时判定（IPv4 连接，非“优先”）', r.body.includes('IPv4 连接') && !r.body.includes('IPv4 访问优先'));
  // id="hint" 存在性是承重断言：dom-sandbox 自动补建元素，ui-dom 无法发现模板缺元素，此为唯一守卫
  check('UI 含提示条元素', r.body.includes('id=\"hint\"'));
  check('UI 嵌入脚本值（renderUi 与 uiScriptFor 集成）', r.body.includes(indexMod.uiScriptFor('ip.example.com')));
  // 钉住净化白名单本身：若未来字符集扩入 esc 可转义字符，esc∘sanitize 将不再恒等，此断言当场红
  check('uiScriptFor 净化恶意 base（白名单守卫）', indexMod.uiScriptFor('ip.example.com/&<>"').includes("init('ip.example.com')"));
  check('UI 判定措辞严谨（IPv4 连接/无法判定）', r.body.includes('IPv4 连接') && r.body.includes('无法判定 IPv6 是否存在') && !r.body.includes('IPv4 访问优先'));
  check('主页含 WebRTC 检查入口', r.body.includes('/webrtc'));

  // 无 eo 时回退 X-Forwarded-For
  r = await call(indexMod, '4.ip.example.com', '/', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } });
  check('无 eo 时回退 X-Forwarded-For', r.body.trim() === '203.0.113.7', 'body=' + JSON.stringify(r.body));

  // 无任何 IP 信息
  r = await call(indexMod, '4.ip.example.com', '/', {});
  check('无 IP 信息时返回 400', r.res.status === 400);

  // 生产环境（存在 eo 对象）：即使 clientIp 缺失，也忽略可伪造的 X-Forwarded-For
  r = await call(indexMod, '4.ip.example.com', '/', { eo: { clientIp: '', geo: {} }, headers: { 'x-forwarded-for': '203.0.113.9' } });
  check('生产环境忽略伪造代理头', r.res.status === 400, 'status=' + r.res.status);

  // 方法门禁：非 GET/HEAD 一律 405 并带 Allow 头
  r = await call(indexMod, '4.ip.example.com', '/', { eo: eo4, method: 'POST' });
  check('POST 4. 根路径 → 405 + Allow', r.res.status === 405 && (r.res.headers.get('allow') || '').includes('GET'));
});

// ---------- hostInfo：Host 解析直接表征（形状矩阵 + 分发表全键互逆 round-trip）----------
await section('hostInfo 形状矩阵', async () => {
  const h = (url) => indexMod.hostInfo(new Request(url));
  let r = h('https://4.ip.example.com/');
  check('hostInfo 四标签现役形状：sub/base 提取', r.sub === '4' && r.base === 'ip.example.com');
  r = h('https://test.ip.example.com/');
  check('hostInfo test. 提取', r.sub === 'test' && r.base === 'ip.example.com');
  r = h('https://ip.example.com/');
  check('hostInfo 根域：无 sub', r.sub === '' && r.base === 'ip.example.com');
  r = h('https://4.example.com/');
  check('hostInfo 三标签域（替代部署形状）：sub 提取', r.sub === '4' && r.base === 'example.com');
  r = h('https://foo.4.ip.example.com/');
  check('hostInfo 非子域前缀不剥（base=整串，由同源回退兜底）', r.sub === '' && r.base === 'foo.4.ip.example.com');
  r = h('https://4.ip.example.com:8443/');
  check('hostInfo URL 路径端口剥离', r.sub === '4' && r.base === 'ip.example.com');
  r = h('https://4.IP.Example.com/');
  check('hostInfo URL 路径自动小写', r.sub === '4' && r.base === 'ip.example.com');

  // 互逆 round-trip：grab 以 https://sub.<base>/ 构造子域 URL，hostInfo 必然解析回 (sub, base)；
  // 键从分发表派生——表加行即自动多一条 round-trip 断言
  for (const sub of Object.keys(indexMod.SUBDOMAIN_HANDLERS)) {
    r = h('https://' + sub + '.example.com/');
    check('round-trip：https://' + sub + '.example.com/ → (' + sub + ', example.com)', r.sub === sub && r.base === 'example.com');
  }
});

// ---------- [[default]].js：路径端点 ----------
await section('[[default]].js · 路径端点', async () => {
  const eo4 = { clientIp: '8.8.8.8', geo: {} };
  const eo6 = { clientIp: '2001:db8::1', geo: {} };
  // 页面侧路径从端点路径 fact 派生（钉来源不钉副本）：路由改名只动 fact 一处，断言自动跟随
  const p4 = sharedMod.subdomainPath('4');
  const pTest = sharedMod.subdomainPath('test');

  let r = await call(catchAllMod, 'ip.example.com', p4, { eo: eo4 });
  check('/4 返回 IPv4', r.res.status === 200 && r.body.trim() === '8.8.8.8');
  r = await call(catchAllMod, 'ip.example.com', '/api/v4', { eo: eo4 });
  check('/api/v4 返回 IPv4', r.res.status === 200 && r.body.trim() === '8.8.8.8');
  r = await call(catchAllMod, 'ip.example.com', '/api/v4?format=json', { eo: eo4 });
  let j = null; try { j = JSON.parse(r.body); } catch (_) {}
  check('/api/v4?format=json 输出 JSON', !!j && j.ip === '8.8.8.8' && j.family === 'IPv4');

  r = await call(catchAllMod, 'ip.example.com', '/api/v4', { eo: eo4, headers: { accept: 'application/json' } });
  j = null; try { j = JSON.parse(r.body); } catch (_) {}
  check('/api/v4 Accept: application/json 输出 JSON', !!j && j.ip === '8.8.8.8' && j.family === 'IPv4');

  r = await call(catchAllMod, 'ip.example.com', p4, { eo: eo4, method: 'POST' });
  check('POST /4 → 405 + Allow', r.res.status === 405 && (r.res.headers.get('allow') || '').includes('GET'));

  r = await call(catchAllMod, 'ip.example.com', pTest, { eo: eo6 });
  check('/test 返回连接 IP', r.res.status === 200 && r.body.trim() === '2001:db8::1');

  r = await call(catchAllMod, 'ip.example.com', '/api/self', { eo: eo4 });
  j = null; try { j = JSON.parse(r.body); } catch (_) {}
  check('/api/self 输出 JSON', !!j && j.ip === '8.8.8.8' && j.family === 'IPv4');

  r = await call(catchAllMod, 'ip.example.com', '/favicon.ico', { eo: eo4 });
  check('/favicon.ico → 204', r.res.status === 204);

  r = await call(catchAllMod, 'ip.example.com', '/webrtc', { eo: eo4 });
  check('/webrtc 返回检查页 HTML', r.res.status === 200 && (r.res.headers.get('content-type') || '').includes('text/html') && r.body.includes('WebRTC'));
  check('/webrtc 页面不含服务端 IP 注入（纯浏览器检测）', !r.body.includes('request.eo'));
  check('/webrtc 嵌入脚本值（WEBRTC_SCRIPT）', r.body.includes(catchAllMod.WEBRTC_SCRIPT));

  r = await call(catchAllMod, 'ip.example.com', '/nope', { eo: eo4 });
  check('未知路径 → 404 JSON', r.res.status === 404);
  check('404 hint 列出子域路径与 /api/self（用户可见契约，子域段由 fact 派生）', r.body.includes('可用端点: /4 /test /api/self'));
});

// ---------- familyOf / verdictFor：措辞契约单点的纯函数断言 ----------
await section('familyOf / verdictFor 纯函数', async () => {
  check('familyOf IPv4', sharedMod.familyOf('1.2.3.4') === 'IPv4');
  check('familyOf IPv6', sharedMod.familyOf('240e:390:abcd:1234::1') === 'IPv6');
  check('familyOf 空输入 → null', sharedMod.familyOf('') === null && sharedMod.familyOf(null) === null);
  const v6 = sharedMod.verdictFor('IPv6');
  const v4 = sharedMod.verdictFor('IPv4');
  check('verdictFor IPv6（文案+完整 className）', !!v6 && v6.text === 'IPv6 访问优先' && v6.cls === 'badge ipv6');
  check('verdictFor IPv4（文案+完整 className）', !!v4 && v4.text === 'IPv4 连接' && v4.cls === 'badge ipv4');
  check('verdictFor 未知 → null（第三态留调用点）', sharedMod.verdictFor('未知') === null && sharedMod.verdictFor('unknown') === null);
});

// ---------- subdomainPath：端点路径 fact（页面同源回退与路由 switch 的单一来源）----------
await section('subdomainPath 端点路径 fact', async () => {
  check('subdomainPath 4 → /4', sharedMod.subdomainPath('4') === '/4');
  check('subdomainPath test → /test', sharedMod.subdomainPath('test') === '/test');
  check('subdomainPath 未知子域 → null（服务端 case 永不匹配落 404，方向保守）', sharedMod.subdomainPath('6') === null && sharedMod.subdomainPath('') === null);
  check('UI_SCRIPT 含 subdomainPath（grab 同源回退引用，browserScript 拣选）', indexMod.UI_SCRIPT.includes('function subdomainPath'));
  check('WEBRTC_SCRIPT 含 subdomainPath（run 出口 IP fetch 引用，browserScript 拣选）', catchAllMod.WEBRTC_SCRIPT.includes('function subdomainPath'));
});

// ---------- isIpv4：严格四段 0-255 判定（破坏性变更：256.x.x.x 等越界输入现返回 false）----------
await section('isIpv4 严格判定', async () => {
  check('isIpv4 合法 IPv4', sharedMod.isIpv4('1.2.3.4') === true);
  check('isIpv4 全 255', sharedMod.isIpv4('255.255.255.255') === true);
  check('isIpv4 全 0', sharedMod.isIpv4('0.0.0.0') === true);
  check('isIpv4 首段 256 → false（越界）', sharedMod.isIpv4('256.1.1.1') === false);
  check('isIpv4 全 999 → false（越界）', sharedMod.isIpv4('999.999.999.999') === false);
  check('isIpv4 三段 → false（段数不足）', sharedMod.isIpv4('1.2.3') === false);
  check('isIpv4 五段 → false（段数过多）', sharedMod.isIpv4('1.2.3.4.5') === false);
  check('isIpv4 非 IP 文本 → false', sharedMod.isIpv4('foo.bar') === false);
  check('isIpv4 空串 → false', sharedMod.isIpv4('') === false);
  check('isIpv4 null → false', sharedMod.isIpv4(null) === false);
  check('isIpv4 IPv6 → false', sharedMod.isIpv4('240e:390:abcd:1234::1') === false);
});

// ---------- browserScript：页面脚本作用域序列化器（剥壳不变式 + 共享拣选传递闭包）----------
await section('browserScript 序列化器', async () => {
  // 剥壳不变式：首个 { 至末个 } 为函数体；字符串里的花括号不影响切片
  function demoScope() {
    function helper(x) { return '}\n{' + x; }
    var re = /[*+?]/;
    helper(re);
    // 注释提及未引用名字 notFn：验证误拣方向与非函数守卫
    go();
  }
  const out = sharedMod.browserScript(demoScope, { go: function go() { return 1; } });
  check('剥壳：不含包装函数签名', out.indexOf('demoScope') === -1);
  check('剥壳：嵌套声明与胶水保留', out.includes('function helper') && out.trim().endsWith('go();'));
  check('剥壳：字符串中的花括号转义原样保留（源码文本层面）', out.includes("'}\\n{'"));
  check('剥壳产物语法有效（括号平衡，new Function 编译通过）', (() => { try { new Function(out); return true; } catch (_) { return false; } })());
  check('共享拣选：被引用者入选（go）', out.includes('function go'));
  const out2 = sharedMod.browserScript(demoScope, { go: function go() { return 1; }, notFn: 42 });
  check('非函数导出跳过不序列化（注释提及亦不进页面）', !out2.includes('42'));

  // 真实产物：UI_SCRIPT / WEBRTC_SCRIPT 的闭包完整性与未引用者排除
  check('UI_SCRIPT 含 verdictFor（init 引用）', indexMod.UI_SCRIPT.includes('function verdictFor'));
  check('UI_SCRIPT 含 isIpv6（init→familyOf→isIpv6 传递闭包）', indexMod.UI_SCRIPT.includes('function isIpv6'));
  check('UI_SCRIPT 不含未引用助手（getClientIp/handleV4 不入选）', !indexMod.UI_SCRIPT.includes('function getClientIp') && !indexMod.UI_SCRIPT.includes('function handleV4'));
  check('WEBRTC_SCRIPT 含 isIpv4（isPublicIp/extractIp 引用）', catchAllMod.WEBRTC_SCRIPT.includes('function isIpv4'));
  check('WEBRTC_SCRIPT 不含未引用助手（familyOf 不入选）', !catchAllMod.WEBRTC_SCRIPT.includes('function familyOf'));
  check('脚本以胶水语句收尾（UI）', indexMod.UI_SCRIPT.trim().endsWith("init('__BASE__');"));
  check('脚本以胶水语句收尾（WEBRTC）', catchAllMod.WEBRTC_SCRIPT.trim().endsWith("addEventListener('click', run);"));
});

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);