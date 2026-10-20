/* YUHA CARE GitHub Pages -> Apps Script bridge client
 * Calls the existing google.script.run API through the published bridge iframe. */
(function () {
  'use strict';

  const STORAGE = 'yuha_gas_bridge_url_v1';
  const APP_ORIGIN = 'https://hossea123456789-design.github.io';
  const METHODS = new Set(['getAppData','saveAppData','getSleepMonth','syncSleepChanges']);
  let endpoint = '', frame = null, remote = null, remoteOrigin = '';
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
  function showSetup() {
    if (!document.body || document.getElementById('yuhaGASSetup')) return;
    const bg = document.createElement('div');
    bg.id = 'yuhaGASSetup';
    bg.style.cssText = 'position:fixed;inset:0;z-index:5000;background:#152e50b8;display:flex;align-items:center;justify-content:center;padding:18px';
    bg.innerHTML = '<div style="width:100%;max-width:430px;background:white;padding:22px;border-radius:18px;box-shadow:0 12px 35px #0003;font-family:system-ui,sans-serif">' +
      '<h2 style="margin:0 0 10px;font-size:20px">구글 DB 연결 (최초 1회)</h2>' +
      '<p style="font-size:13px;line-height:1.6;color:#556273">기존 Google Apps Script 웹앱의 /exec 주소를 입력해 주세요. 해당 주소는 현재 기기에만 저장되고, 기존 구글 스프레드시트 DB를 그대로 사용합니다.</p>' +
      '<input id="yuhaGASURL" type="url" autocomplete="off" spellcheck="false" placeholder="https://script.google.com/macros/s/.../exec" style="width:100%;box-sizing:border-box;border:1px solid #bac8d8;border-radius:10px;padding:12px;font-size:13px">' +
      '<p id="yuhaGASError" style="min-height:16px;color:#ae2634;font-size:12px"></p>' +
      '<button id="yuhaGASConnect" style="width:100%;background:#2f6fed;color:#fff;border:0;border-radius:10px;padding:13px;font-weight:800">연결하기</button></div>';
    document.body.appendChild(bg);
    const input = bg.querySelector('#yuhaGASURL');
    input.value = endpoint;
    bg.querySelector('#yuhaGASConnect').addEventListener('click', () => {
      const chosen = input.value.trim();
      if (!validUrl(chosen)) {
        bg.querySelector('#yuhaGASError').textContent = '/exec로 끝나는 Google Apps Script 배포 주소가 필요합니다.';
        return;
      }
      endpoint = chosen;
      localStorage.setItem(STORAGE, chosen);
      bg.remove();
      connect();
    });
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
      if (!ready) status('DB 연결 대기 중: Apps Script에 Bridge 파일 추가 및 새 버전 배포를 확인하세요.', true);
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
    send({method,args,success,failure});
    if (!endpoint) queueMicrotask(showSetup);
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
  window.YuhaDBBridge = {configure:showSetup,connected:()=>ready};
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
    const configured = window.YUHA_GAS_WEBAPP_URL;
    const saved = localStorage.getItem(STORAGE);
    endpoint = validUrl(configured) ? configured : (validUrl(saved) ? saved : '');
    if (endpoint) connect();
    else showSetup();
  });
})();