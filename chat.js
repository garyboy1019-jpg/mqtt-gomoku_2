// Room chat uses the same MQTT connection; messages are never retained.
(() => {
  const panel = document.createElement('section');
  panel.className = 'card chat-card';
  panel.innerHTML = `<div class="eyebrow">ROOM CHAT</div><h2>棋友對話</h2><div id="chatLog" class="chat-log" role="log" aria-label="房間聊天紀錄" aria-live="polite" aria-relevant="additions text"></div><p id="chatHint" class="muted">加入雙人房間後，就能和棋友聊天。</p><form id="chatForm"><label for="chatInput">傳送訊息</label><div class="chat-compose"><input id="chatInput" maxlength="300" placeholder="和棋友說聲嗨…" autocomplete="off" disabled><button id="chatSend" class="primary" type="submit" disabled>傳送</button></div><small class="muted">每則最多 300 字；公開 MQTT 服務上的對話並非私密。</small></form>`;
  document.querySelector('aside').insertBefore(panel, document.querySelector('aside details'));
  const log = $('chatLog'), input = $('chatInput');
  const seen = new Set(), outgoing = new Map();
  let lastSent = 0;
  const ready = () => (mode === 'host' || mode === 'guest') && live && client?.connected && host && guest && Date.now() - peerSeen < 15000;
  function update() {
    input.disabled = $('chatSend').disabled = !ready();
    $('chatHint').textContent = ready() ? 'Enter 傳送 · 離開房間後清除紀錄' : mode === 'local' ? '本機練習不提供線上聊天。' : host && guest ? '等待連線恢復，暫時無法傳送。' : '加入雙人房間後，就能和棋友聊天。';
  }
  function add(text, mine, id) {
    const row = document.createElement('div');
    row.className = 'chat-item' + (mine ? ' mine' : '');
    const meta = document.createElement('small'), body = document.createElement('p');
    const name = mine ? '你' : mode === 'host' ? state.white : state.black;
    meta.textContent = `${name} · ${new Date().toLocaleTimeString('zh-TW', {hour:'2-digit',minute:'2-digit'})}${mine ? ' · 傳送中' : ''}`;
    body.textContent = text;
    row.append(meta, body); log.append(row);
    if (mine) outgoing.set(id, {meta, label:meta.textContent.replace(' · 傳送中','')});
    while (log.children.length > 100) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  function status(id, label) {
    const item = outgoing.get(id);
    if (!item) return;
    item.meta.textContent = item.label + ' · ' + label;
    if (label === '已送達') outgoing.delete(id);
  }
  const originalReceive = receive;
  receive = function(m) {
    if (m && (m.type === 'chat' || m.type === 'chatAck')) {
      const peer = mode === 'host' ? guest : mode === 'guest' ? host : '';
      if (!peer || !state || m.from !== peer || m.to !== me || typeof m.id !== 'string' || m.id.length > 80) return;
      if (m.type === 'chatAck') { status(m.id, '已送達'); return; }
      if (typeof m.text !== 'string' || !m.text.trim() || m.text.length > 300) return;
      send({type:'chatAck',id:m.id,to:peer});
      if (seen.has(m.id)) return;
      seen.add(m.id);
      if (seen.size > 500) seen.delete(seen.values().next().value);
      add(m.text, false, m.id);
      return;
    }
    originalReceive(m);
  };
  const originalRender = render;
  render = function() { originalRender(); update(); };
  const originalLeave = leave;
  leave = function() {
    originalLeave(); seen.clear(); outgoing.clear(); log.replaceChildren(); input.value = ''; lastSent = 0; update();
  };
  $('chatForm').addEventListener('submit', event => {
    event.preventDefault();
    if (event.isComposing || !ready()) return;
    const text = input.value.trim();
    if (!text || text.length > 300) return;
    if (Date.now() - lastSent < 700) { $('chatHint').textContent = '請稍候一下再傳送下一則。'; return; }
    lastSent = Date.now();
    const id = uid(), activeClient = client;
    add(text, true, id); input.value = '';
    while (outgoing.size > 100) outgoing.delete(outgoing.keys().next().value);
    activeClient.publish(topic, JSON.stringify({type:'chat',id,text,from:me,to:mode === 'host' ? guest : host}), {qos:1,retain:false}, err => {
      if (err) status(id, '傳送失敗');
    });
    setTimeout(() => { if (outgoing.has(id)) status(id, '未確認送達'); }, 10000);
    input.focus();
  });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && event.isComposing) event.preventDefault(); });
  update();
})();
