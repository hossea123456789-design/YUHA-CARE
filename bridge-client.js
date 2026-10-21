/* YUHA CARE GitHub Pages -> Apps Script bridge client
 * Calls the existing google.script.run API through the published bridge iframe. */
(function () {
  'use strict';

  const APP_ORIGIN = 'https://hossea123456789-design.github.io';
  const METHODS = new Set(['getAppData','saveAppData','getSleepMonth','syncSleepChanges','getMentalMonth','syncMentalEntry']);
  let endpoint = validUrl(window.YUHA_GAS_WEBAPP_URL)
    ? window.YUHA_GAS_WEBAPP_URL : '';
  let frame = null, remote = null, remoteOrigin = '';
  let nonce = '', ready = false, seq = 0, warningTimer = null;
  let waiting = [], reconnectTimer = null, attempts = 0;
  let frameEpoch = 0;
  const pending = new Map();
  function connectionChanged(state, message = '') {
    window.dispatchEvent(new CustomEvent('yuha-db-status', {detail: {state, message}}));
  }

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
    // 연결 안내도 앱의 상단 연결 상태/하단 진행 바로 통일합니다.
    if (message) connectionChanged(bad ? 'error' : 'connecting', message);
  }
  function clearActive(reason) {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      try {item.failure(new Error(reason));} catch (error) {console.error('[YUHA DB] Request failure callback:',error);}
    }
    pending.clear();
  }
  function scheduleReconnect(reason) {
    if (warningTimer) {clearTimeout(warningTimer);warningTimer = null;}
    ready = false;remote = null;remoteOrigin = '';
    const message = reason || 'Google 서버 응답 없음';
    connectionChanged(navigator.onLine ? 'error' : 'offline', message);
    if (attempts >= 2 && waiting.length) {
      const jobs = waiting;waiting = [];
      const error = new Error('Google 서버 연결 실패. 웹앱 접근 권한이나 브라우저의 Google 로그인/iframe 차단을 확인해 주세요.');
      jobs.forEach(job=>{try{job.failure(error);}catch(e){console.error('[YUHA DB] Pending request error:',e);}});
    }
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    if (!navigator.onLine || document.hidden) return;
    const delay = Math.min(30000, 1200 * Math.pow(2,Math.min(attempts,5)));
    reconnectTimer = setTimeout(()=>{reconnectTimer=null;connect();},delay);
  }
  function connect() {
    if (!endpoint || !document.body) return;
    if (reconnectTimer !== null){clearTimeout(reconnectTimer);reconnectTimer=null;}
    if (!navigator.onLine){connectionChanged('offline');return;}
    attempts++;
    const epoch=++frameEpoch;
    connectionChanged('connecting', attempts>1?'Google 서버 재연결 중 ('+attempts+'회차)':'Google 서버 연결 중');
    if (warningTimer){clearTimeout(warningTimer);warningTimer=null;}
    ready=false;remote=null;remoteOrigin='';
    if (pending.size) clearActive('Google 서버 연결이 끊겼습니다. 원본 변경 내용은 기기에 보관됩니다.');
    if (frame)frame.remove();
    nonce=randomNonce();
    frame=document.createElement('iframe');
    frame.title='유하 DB 연결';
    frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed;width:0;height:0;border:0;left:-10000px;top:0;';
    frame.onerror=()=>{if(epoch===frameEpoch&&!ready)scheduleReconnect('Google 서버 iframe 로드 실패');};
    frame.src=endpoint+'?bridge=1&origin='+encodeURIComponent(APP_ORIGIN)+'&nonce='+nonce;
    document.body.appendChild(frame);
    // iframe.onload alone cannot prove Apps Script executed: login/access error pages also load.
    warningTimer=setTimeout(()=>{
      if(epoch===frameEpoch&&!ready)
        scheduleReconnect('서버 연결 응답 없음 · Apps Script 배포 접근 권한/계정 확인 필요');
    },11000);
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
      connectionChanged('error', '서버 응답 시간 초과');
      item.failure(new Error('서버 응답 시간 초과. 기기 기록은 보관됩니다.'));
      if (ready) scheduleReconnect('Google 서버의 요청 응답이 지연되어 연결을 다시 시도합니다.');
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
      attempts = 0;
      if(reconnectTimer!==null){clearTimeout(reconnectTimer);reconnectTimer=null;}
      connectionChanged('connected');
      clearTimeout(warningTimer);
      warningTimer=null;
      status('',false);
      const jobs = waiting; waiting = [];
      jobs.forEach(send);
    } else if (m.type === 'result' && ready && ev.source === remote) {
      const job = pending.get(m.id);
      if (!job) return;
      clearTimeout(job.timer);
      pending.delete(m.id);
      if (m.ok) { connectionChanged('connected'); job.success(m.result); }
      else {
        // A method-level failure (validation, PIN, etc.) is not a broken iframe connection.
        connectionChanged('connected');
        job.failure(new Error(m.error || 'Apps Script 요청 오류'));
      }
    }
  });
  window.addEventListener('online', () => {if(endpoint && !ready) connect();});
  window.addEventListener('offline', () => {
    if(reconnectTimer!==null){clearTimeout(reconnectTimer);reconnectTimer=null;}
    connectionChanged('offline');
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden && endpoint && !ready && navigator.onLine)connect();
  });
  window.addEventListener('DOMContentLoaded', () => {
    if (endpoint) connect();
    else {
      status('공통 DB 연결 주소 설정 오류입니다. GitHub config.js를 확인하세요.', true);
      connectionChanged('error', 'DB 설정 오류');
    }
  });
})();