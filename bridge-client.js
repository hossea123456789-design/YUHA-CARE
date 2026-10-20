/* YUHA CARE GitHub Pages -> Apps Script bridge client
 * Calls the existing google.script.run API through the published bridge iframe. */
(function () {
  'use strict';

  const APP_ORIGIN = 'https://hossea123456789-design.github.io';
  const METHODS = new Set(['getAppData','saveAppData','getSleepMonth','syncSleepChanges']);
  let endpoint = validUrl(window.YUHA_GAS_WEBAPP_URL)
    ? window.YUHA_GAS_WEBAPP_URL : '';
  let frame = null, remote = null, remoteOrigin = '';
  let nonce = '', ready = false, seq = 0, warningTimer = null;
  let waiting = [];
  const pending = new Map();

  function validUrl(s) {
    try {
      const u = new URL(s);
      return u.protocol === 'https:' &&
        u.hostname === 'script.google.com' &&
        /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname);
    } catch (_) { return false; }
  }
  function googleOrigin(s) {
    try {
      const u = new URL(s);
      return u.protocol === 'https:' && (
        u.hostname === 'script.google.com' ||
        u.hostname === 'script.googleusercontent.com' ||
        u.hostname.endsWith('.googleusercontent.com'));
    } catch (_) { return false; }
  }
  function randomNonce() {
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    return Array.from(a, x => x.toString(16).padStart(2, '0')).join('');
  }
  function status(message, bad) {
    let el = document.getElementById('yuhaBridgeStatus');
    if (!el) {
      el = document.createElement('div');
      el.id = 'yuhaBridgeStatus';
      el.style.cssText = 'position:fixed;bottom:96px;right:10px;z-index:4000;max-width:calc(100vw - 20px);padding:10px 12px;border-radius:10px;background:#243a5e;color:#fff;font:12px system-ui,sans-serif;box-shadow:0 6px 20px #0003';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.background = bad ? '#a72c37' : '#243a5e';
    el.style.display = message ? 'block' : 'none';
  }
  function connect() {
    if (!endpoint || !document.body) return;
    ready = false;
    remote = null;
    remoteOrigin = '';
    if (warningTimer) clearTimeout(warningTimer);
    if (frame) frame.remove();
    nonce = randomNonce();
    frame = document.createElement('iframe');
    frame.title = '유하 DB 연결';
    frame.setAttribute('aria-hidden','true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-10000px;top:0;';
    frame.src = endpoint + '?bridge=1&origin=' + encodeURIComponent(APP_ORIGIN) + '&nonce=' + nonce;
    document.body.appendChild(frame);
    warningTimer = setTimeout(() => {
      if (!ready) status('DB 연결 대기 중: Apps Script Code.gs 교체와 새 버전 배포를 확인하세요.', true);
    }, 18000);
  }
  function send(job) {
    if (!ready || !remote) {
      waiting.push(job);
      return;
    }
    const id = String(++seq);
    const timer = setTimeout(() => {
      const item = pending.get(id);
      if (!item) return;
      pending.delete(id);
      item.failure(new Error('서버 응답 시간 초과. 오프라인 기록은 기기에 보관됩니다.'));
    }, 65000);
    pending.set(id, {success:job.success, failure:job.failure, timer});
    remote.postMessage({
      source:'yuha-db-client', type:'call', nonce,
      id, method:job.method, args:job.args
    }, remoteOrigin);
  }
  function call(method,args,success,failure) {
    if (!METHODS.has(method)) return failure(new Error('지원하지 않는 메서드: ' + method));
    if (!endpoint) {
      failure(new Error('공통 DB 연결 주소가 설정되지 않았습니다. GitHub config.js를 확인하세요.'));
      return;
    }
    send({method,args,success,failure});
  }
  function runner(success,failure) {
    return new Proxy({}, {get(_target, prop) {
      if (prop === 'withSuccessHandler') return fn => runner(fn,failure);
      if (prop === 'withFailureHandler') return fn => runner(success,fn);
      if (METHODS.has(prop)) return (...args) => call(
        prop,args,
        typeof success === 'function' ? success : () => {},
        typeof failure === 'function' ? failure : err => status(err.message,true)
      );
      return undefined;
    }});
  }
  window.google = {script:{get run() {return runner(null,null);}}};
  window.YuhaDBBridge = {reconnect:connect,connected:()=>ready};
  window.addEventListener('message', ev => {
    const m = ev.data;
    if (!m || m.source !== 'yuha-db-bridge' || m.nonce !== nonce || !googleOrigin(ev.origin)) return;
    if (m.type === 'ready') {
      remote = ev.source;
      remoteOrigin = ev.origin;
      ready = true;
      clearTimeout(warningTimer);
      status('',false);
      const jobs = waiting; waiting = [];
      jobs.forEach(send);
    } else if (m.type === 'result' && ready && ev.source === remote) {
      const job = pending.get(m.id);
      if (!job) return;
      clearTimeout(job.timer);
      pending.delete(m.id);
      if (m.ok) job.success(m.result);
      else job.failure(new Error(m.error || 'Apps Script 오류'));
    }
  });
  window.addEventListener('online', () => {if(endpoint && !ready) connect();});
  window.addEventListener('DOMContentLoaded', () => {
    if (endpoint) connect();
    else status('공통 DB 연결 주소 설정 오류입니다. GitHub config.js를 확인하세요.', true);
  });
})();