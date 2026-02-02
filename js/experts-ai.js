/* experts-ai.js
   Client-only Expert Assistant
   - Requires: ./data/experts_data.json (your existing data file)
   - Optional: add CSS tweaks in global.css if you want
   - Integration: safe to include after experts.js in experts.html
*/

/* ======= Helper DOM inject ======= */
(function(){
  // avoid duplicate injection
  if(window.EXPERT_AI_LOADED) return;
  window.EXPERT_AI_LOADED = true;

  // create floating button
  const fab = document.createElement('button');
  fab.id = 'expert-fab';
  fab.setAttribute('aria-label','اسأل مساعد الخبراء');
  fab.className = 'fixed bottom-6 left-6 z-50 bg-b-hl-light text-black rounded-full p-3 shadow-2xl flex items-center gap-3';
  fab.innerHTML = '<span style="font-size:20px">🧠</span><span class="font-semibold">اسأل مساعد الخبراء</span>';
  document.body.appendChild(fab);

  // create modal container
  const modal = document.createElement('div');
  modal.id = 'expert-modal';
  modal.className = 'fixed inset-0 z-50 hidden items-center justify-center p-4 bg-black/60';
  modal.innerHTML = `
    <div class="bg-b-surface w-full max-w-2xl rounded-2xl p-4 border border-b-border">
      <div class="flex justify-between items-start gap-4">
        <h2 class="text-xl font-bold text-b-hl-medium">مساعد نصائح الخبراء</h2>
        <button id="expert-close" class="text-2xl">&times;</button>
      </div>
      <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="col-span-1">
          <h3 class="font-semibold mb-2">History</h3>
          <div id="expert-history" class="space-y-2 max-h-64 overflow-y-auto p-2 bg-[#0f0f0f] rounded-lg"></div>
        </div>
        <div class="col-span-1 md:col-span-2">
          <h3 class="font-semibold mb-2">اسأل (AR/EN)</h3>
          <textarea id="expert-query" rows="4" class="w-full p-3 rounded-lg bg-[#0b0b0b] border border-b-border" placeholder="اكتب سؤالك هنا..."></textarea>
          <div class="flex gap-2 mt-3">
            <button id="expert-send" class="px-4 py-2 rounded-lg bg-b-primary text-white font-semibold">Ask</button>
            <button class="expert-suggest px-3 py-2 rounded-lg border" data-q="اعمل لي ملخص لنصايح GP">ملخص نصايح GP</button>
            <button class="expert-suggest px-3 py-2 rounded-lg border" data-q="إيه أشهر أخطاء الطلاب في MATLAB؟">أخطاء MATLAB</button>
          </div>
          <div id="expert-answer" class="mt-4 bg-[#0f0f0f] p-3 rounded-lg max-h-60 overflow-y-auto hidden"></div>
        </div>
      </div>
      <div class="mt-4">
        <h4 class="font-semibold">Suggested prompts</h4>
        <div class="flex flex-wrap gap-2 mt-2">
          <button class="expert-suggest px-3 py-2 rounded-lg border" data-q="اعمل لي ملخص لنصايح GP">اعمل لي ملخص لنصايح GP</button>
          <button class="expert-suggest px-3 py-2 rounded-lg border" data-q="إيه أشهر أخطاء الطلاب في MATLAB؟">إيه أشهر أخطاء الطلاب في MATLAB؟</button>
          <button class="expert-suggest px-3 py-2 rounded-lg border" data-q="قولّي أحسن 5 نصائح في الـ Presentation">أحسن 5 نصائح Presentation</button>
          <button class="expert-suggest px-3 py-2 rounded-lg border" data-q="لو أنا هشتغل Verification، أذاكر إيه؟">لو هشتغل Verification</button>
        </div>
      </div>
      <div class="mt-4 text-sm text-gray-300">ملاحظة: الإجابات تأتي فقط من قاعدة نصائح الخبراء المحلية.</div>
    </div>
  `;
  document.body.appendChild(modal);

  // basic UI handlers
  const openModal = ()=> { modal.classList.remove('hidden'); modal.classList.add('flex'); };
  const closeModal = ()=> { modal.classList.add('hidden'); modal.classList.remove('flex'); };
  fab.addEventListener('click', openModal);
  modal.querySelector('#expert-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e)=> { if(e.target === modal) closeModal(); });

  // history
  const HIST_KEY = 'expert_ai_history_v1';
  let history = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
  const historyEl = modal.querySelector('#expert-history');
  function renderHistory(){ historyEl.innerHTML = history.slice().reverse().map(h => 
    `<div class="p-2 rounded border border-b-border text-sm"><div class="font-semibold">Q: ${escapeHtml(h.q)}</div><div class="text-gray-300 mt-1">A: ${escapeHtml(h.a).slice(0,200)}${h.a.length>200? '...':''}</div></div>`
  ).join(''); }
  function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  renderHistory();

  // load your experts data (file used by site: experts_data.json)
  let DOCS = [];
  async function loadData(){
    try {
      const resp = await fetch('../data/experts_data.json');
      if(!resp.ok) throw new Error('failed load experts_data.json');
      const json = await resp.json();
      // your file may use keys like Advice or an array; normalize:
      const arr = json.Advice || json || [];
      // normalize each doc to have id, title, summary/fullText (depends on format)
      DOCS = arr.map(d => ({
        id: d.id || d.ID || (d.title ? d.title.slice(0,12) : 'unknown'),
        title: d.title || d.name || '',
        short: d.summary || d.short || '',
        advice: d.fullText || d.advice || d.fullText || d.text || '',
        source: d.source || d.author || 'مصدر',
        tags: d.tags || d.tag || []
      }));
    } catch(e){
      console.warn('Expert AI: failed to load data', e);
      DOCS = [];
    }
  }
  loadData();

  // tokenization helpers (Arabic + Latin basic)
  function tok(s){
    return (s||'').toLowerCase().replace(/[^\w\u0600-\u06FF\s]/g,' ').split(/\s+/).filter(Boolean);
  }
  function uniq(a){ return [...new Set(a)]; }

  // scoring: overlap + title/keywords/tag boost
  function scoreDocs(query){
    const qtokens = uniq(tok(query));
    return DOCS.map(d => {
      const text = [d.title, d.short, d.advice, (d.tags||[]).join(' ')].join(' ').toLowerCase();
      let score = 0;
      qtokens.forEach(w => { if(text.includes(w)) score += 1; });
      // title boost
      qtokens.forEach(w => { if((d.title||'').toLowerCase().includes(w)) score += 1.4; });
      // tag boost
      (d.tags||[]).forEach(tag => { const t = tag.replace('#','').toLowerCase(); if(qtokens.includes(t)) score += 2; });
      // normalize
      const len = Math.max(10, (text.split(' ').length));
      score = score / Math.log(len+8);
      return {...d, score};
    }).sort((a,b)=>b.score - a.score);
  }

  // extract best sentence/excerpt from doc
  function bestExcerpt(doc, qtokens){
    // strip HTML if present
    const txt = (doc.advice || doc.short || doc.title || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    if(!txt) return '';
    const sents = txt.split(/(?<=[\\.\\?\\!\\؛\\،\\n])/g).map(s=>s.trim()).filter(Boolean);
    let best = sents[0] || txt;
    let bestScore = 0;
    sents.forEach(s => {
      let sscore = 0;
      const st = tok(s);
      qtokens.forEach(w => { if(st.includes(w)) sscore += 1; });
      if(sscore > bestScore){ best = s; bestScore = sscore; }
    });
    if(bestScore === 0) return doc.short || best;
    return best;
  }

  // compose answer from top docs (with citations)
  function composeAnswer(query, topDocs, limit=6){
    if(!topDocs || topDocs.length===0) return 'لم أجد نصائح متطابقة في قاعدة الخبراء.';
    const qtokens = uniq(tok(query));
    const excerpts = [];
    for(const d of topDocs.slice(0,limit)){
      const ex = bestExcerpt(d, qtokens) || d.short || d.title;
      excerpts.push({txt: ex, src: d});
    }
    const lead = `مستندًا على نصائح الخبراء، هذه نقاط مرتبطة بسؤالك: "${query}"\n\n`;
    const lines = excerpts.map(e => `- ${e.txt} (${e.src.source || 'مصدر'}${e.src.id? ' | ' + e.src.id: ''})`);
    return lead + lines.join('\n');
  }

  // UI wiring
  const queryBox = modal.querySelector('#expert-query');
  const sendBtn = modal.querySelector('#expert-send');
  const answerBox = modal.querySelector('#expert-answer');

  modal.querySelectorAll('.expert-suggest').forEach(btn => btn.addEventListener('click', e => {
    queryBox.value = btn.dataset.q || btn.textContent || '';
    queryBox.focus();
  }));

  async function handleAsk(){
    const q = queryBox.value.trim();
    if(!q) return;
    answerBox.classList.remove('hidden');
    answerBox.innerHTML = '<div class="flex items-center gap-3"><div class="spinner" style="border-top:3px solid #22C45D;width:26px;height:26px;border-radius:50%;animation:spin 1s linear infinite"></div><div>جاري تجهيز الإجابة...</div></div>';
    if(DOCS.length===0) await loadData();
    const scored = scoreDocs(q);
    const top = scored.filter(d=>d.score>0).slice(0,8);
    const used = top.length ? top : DOCS.slice(0,4);
    const answer = composeAnswer(q, used, 6);
    answerBox.innerHTML = '<pre style="white-space:pre-wrap;direction:rtl;text-align:right">'+ escapeHtml(answer) +'</pre>';

    // update history
    history.push({q, a: answer, t: Date.now()});
    if(history.length>80) history.shift();
    localStorage.setItem(HIST_KEY, JSON.stringify(history));
    renderHistory();
  }

  sendBtn.addEventListener('click', handleAsk);
  queryBox.addEventListener('keydown', (e)=> { if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAsk(); });

  // small spinner css
  const style = document.createElement('style');
  style.textContent = `
    .spinner{ border:3px solid rgba(255,255,255,0.06); border-top:3px solid #22C45D; border-radius:50%; width:20px; height:20px; animation:spin 1s linear infinite}
    @keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);

})();
