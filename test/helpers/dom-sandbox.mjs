/**
 * DOM/vm 沙箱共享助手：供 ui-dom.mjs 与 webrtc-dom.mjs 复用。
 * 浏览器脚本已是真实函数序列化出的值（UI_SCRIPT / WEBRTC_SCRIPT），测试直接消费值，不再从 HTML 正则切除。
 */
import vm from 'node:vm';

/** 最小 DOM mock：getElementById 自动建元素；元素支持 textContent/className/disabled/style/addEventListener */
export function makeDom() {
  const els = {};
  const makeEl = (id) => ({
    id,
    textContent: '',
    className: '',
    disabled: false,
    style: {},
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
  });
  const document = { getElementById: (id) => els[id] || (els[id] = makeEl(id)) };
  return { document, els };
}

/** 「页面无配置即可引用」白名单：一个空 vm 沙箱的全局对象只含纯 JS 语言内建
    （parseInt/String/Promise/…，随语言升级自动跟随）；vm 另预置少量宿主全局，其中 console
    在真实浏览器必然存在、页面脚本合法引用不属于泄漏，故显式并入白名单。 */
const intrinsics = vm.runInContext('globalThis', vm.createContext({}));
intrinsics.console = console;

/** 在 vm 沙箱中执行脚本；返回 { context, result }，result 为脚本完成值（可直接 await 入口调用）。
    全局经 Proxy 陷阱把守，解析顺序：测试提供的 mock → 白名单 → 其余一律抛错并点名
    （含模块级标识符泄漏与 typeof 探测）——泄漏类缺陷在测试期必现，而不是线上 ReferenceError。 */
export function runScript(script, globals) {
  const context = new Proxy({
    setTimeout,
    clearTimeout,
    ...globals,
  }, {
    has() { return true; },
    get(t, key) {
      if (typeof key === 'symbol') return undefined;
      if (Object.hasOwn(t, key)) return t[key];
      if (key in intrinsics) return intrinsics[key];
      throw new ReferenceError('浏览器脚本引用了未提供的全局: ' + String(key));
    },
  });
  vm.createContext(context);
  const result = vm.runInContext(script, context, { timeout: 5000 });
  return { context, result };
}

/** check/report 计数器（输出格式与各测试文件一致） */
export function checker() {
  const state = { passed: 0, failed: 0 };
  const check = (name, cond, detail) => {
    if (cond) { state.passed++; console.log('  ✔ ' + name); }
    else { state.failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
  };
  const report = () => {
    console.log('\n结果: ' + state.passed + ' 通过, ' + state.failed + ' 失败');
    process.exit(state.failed === 0 ? 0 : 1);
  };
  return { check, report };
}
