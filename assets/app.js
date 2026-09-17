/* Liminal Echoes · Anniversary Trivia
   One script, four roles. The <body data-role> decides what renders:
     play    – viewer's phone (join, answer, see results, react)
     host    – control panel (both hosts open this; needs the PIN)
     stage   – 16:9 stream overlay      tall – 9:16 stream overlay
     studio  – everything in one window with a local, fake backend (no Supabase) for rehearsing alone
   Backend: window.TRIVIA_CONFIG.SUPABASE_URL set → Supabase; otherwise the local in-memory backend. */
(function(){
"use strict";
const CFG=Object.assign({GAME:"ECHO",SUPABASE_URL:"",SUPABASE_KEY:"",SHEET_CSV_URL:"",PER_ROUND:5},window.TRIVIA_CONFIG||{});
const ROLE=document.body.dataset.role||"studio";
const PER_ROUND=CFG.PER_ROUND;
const LETTERS=["A","B","C","D"];
const REACTIONS=[["😂","laugh"],["😱","gasp"],["🔥","fire"],["👻","spooky"]];
const LOGO="/assets/logo.webp";
const $$=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const ord=n=>n+(["st","nd","rd"][((n+90)%100-10)%10-1]||"th");
const newId=()=>"p-"+Math.random().toString(36).slice(2,10);
function persistentPid(){try{let id=localStorage.getItem("le-trivia-pid");if(!id){id=newId();localStorage.setItem("le-trivia-pid",id);}return id;}catch(e){return newId();}}

/* ============ STATE (same shape for both backends) ============ */
const S={code:CFG.GAME,phase:"lobby",qIndex:-1,round:0,finalRound:false,peekFrom:null,paused:false,questionEnds:0,pauseLeft:0,
  settings:{duration:20,correct:500,wrong:-250,fastest:100,mult:2},players:{},audience:{},answers:{},crowd:{},result:null,questions:[],qv:0,connected:false};
let serverOffset=0;                                   // server clock − local clock, ms
const now=()=>Date.now()+serverOffset;
const Q=()=>S.questions;
const curQ=()=>Q()[S.qIndex];
const roundOf=i=>Math.floor(i/PER_ROUND);
const roundCount=()=>Math.ceil(Q().length/PER_ROUND);
const roundTitle=r=>(Q()[r*PER_ROUND]||{}).cat||"Round "+(r+1);
const isFinalRound=r=>roundTitle(r)==="Bonus Round";
const lastInRound=i=>i%PER_ROUND===PER_ROUND-1||i===Q().length-1;
const posInRound=i=>i%PER_ROUND+1;
const roundLen=r=>Math.min(PER_ROUND,Q().length-r*PER_ROUND);
const curAnswers=()=>S.answers[S.qIndex]||{};
const remaining=()=>S.paused?Math.max(0,S.pauseLeft/1000):Math.max(0,(S.questionEnds-now())/1000);
function ranking(){return Object.entries(S.players).map(([id,p])=>({id,...p})).sort((a,b)=>b.score-a.score||(a.joinedAt||0)-(b.joinedAt||0));}
function audienceRanking(){return Object.entries(S.audience).map(([id,p])=>({id,...p})).sort((a,b)=>(b.score||0)-(a.score||0));}
function counts(){if(S.result&&S.phase!=="question"&&S.result.counts)return S.result.counts;const c=[0,0,0,0];Object.values(curAnswers()).forEach(a=>c[a.choice]++);return c;}
function result(){ // what the reveal screens need, from either backend
  if(S.result&&S.result.q===S.qIndex)return S.result;
  const q=curQ()||{},ans=curAnswers(),cnt=counts(),cc=[0,0,0,0];Object.values(S.crowd[S.qIndex]||{}).forEach(i=>cc[i]++);
  const fastId=Object.keys(ans).find(id=>ans[id].fastest);
  return {q:S.qIndex,counts:cnt,got:cnt[q.correct]||0,tot:Object.keys(ans).length,aud_got:cc[q.correct]||0,aud_tot:cc.reduce((a,b)=>a+b,0),
    fastest:fastId&&(S.players[fastId]||{}).name,top:ranking().slice(0,10),aud_top:audienceRanking().slice(0,3),
    n_players:Object.keys(S.players).length,n_audience:Object.keys(S.audience).length};
}
function pointsFor(q,ok,fastest){if(!ok)return S.settings.wrong;let p=S.settings.correct*(S.finalRound?S.settings.mult:1);if(q.kind==="host"&&fastest)p+=S.settings.fastest;return p;}

/* ============ LOCAL BACKEND (studio rehearsal, no server) ============ */
function LocalBackend(){
  const BOTNAMES=["Marlowe","Juniper","Otis","Priya","Dash","Wren","Cleo","Bram","Sunny","Kofi","Nia","Remy"];
  let botTimers=[];
  function scheduleBots(){botTimers.forEach(clearTimeout);botTimers=[];const qi=S.qIndex,q=curQ();
    Object.entries(S.players).filter(([,p])=>p.bot).forEach(([id])=>{const delay=800+Math.random()*(S.settings.duration*700);
      botTimers.push(setTimeout(()=>{if(S.qIndex!==qi||S.phase!=="question")return;api.answer(id,Math.random()<0.6?q.correct:Math.floor(Math.random()*4));},delay));});}
  function scoreNow(){const q=curQ(),ans=curAnswers();
    const fastest=Object.entries(ans).filter(([,a])=>a.choice===q.correct).sort((x,y)=>x[1].at-y[1].at)[0];
    Object.entries(ans).forEach(([pid,a])=>{const ok=a.choice===q.correct;a.correct=ok;a.fastest=!!(q.kind==="host"&&ok&&fastest&&fastest[0]===pid);a.points=pointsFor(q,ok,a.fastest);if(S.players[pid])S.players[pid].score+=a.points;});
    Object.entries(S.players).forEach(([pid,p])=>{p.last=(ans[pid]||{}).points||0;});
    Object.entries(S.crowd[S.qIndex]||{}).forEach(([pid,ch])=>{if(S.audience[pid])S.audience[pid].score=(S.audience[pid].score||0)+(ch===q.correct?pointsFor(q,true,false):S.settings.wrong);});
    S.result=null;S.result=Object.assign(result(),{q:S.qIndex});}
  const api={
    ready:()=>{S.connected=true;if(!Q().length&&window.DRAFT_QUESTIONS)S.questions=window.DRAFT_QUESTIONS;render();},
    join(pid,code,name){if(code!==S.code)return "That code doesn't match the game on stream.";if(!name)return "Pick a name so the leaderboard knows you.";
      if(S.phase==="lobby")S.players[pid]={name,score:0,last:0,joinedAt:Date.now()};else S.audience[pid]={name,score:0,joinedAt:Date.now()};render();return "";},
    answer(pid,i){if(S.phase!=="question")return;if(S.audience[pid]){(S.crowd[S.qIndex]||(S.crowd[S.qIndex]={}));if(S.crowd[S.qIndex][pid]===undefined)S.crowd[S.qIndex][pid]=i;render();return;}
      (S.answers[S.qIndex]||(S.answers[S.qIndex]={}));if(!S.answers[S.qIndex][pid])S.answers[S.qIndex][pid]={choice:i,at:Date.now()};render();},
    react(e){showReaction(e);},
    addBots(){let n=0;for(const name of BOTNAMES){if(n>=8)break;const id="bot-"+name.toLowerCase();if(!S.players[id]){S.players[id]={name,score:0,last:0,joinedAt:Date.now()+n,bot:true};n++;}}render();},
    startRound(r){S.round=r;S.phase="round";S.finalRound=isFinalRound(r);S.peekFrom=null;S.qIndex=r*PER_ROUND-1;S.result=null;render();},
    setupQuestion(i){S.qIndex=i;S.round=roundOf(i);S.finalRound=isFinalRound(S.round);S.phase="setup";S.paused=false;S.peekFrom=null;S.answers[i]={};S.crowd[i]={};S.result=null;render();},
    showQuestion(){if(S.phase!=="setup")return;S.phase="question";S.paused=false;S.questionEnds=Date.now()+S.settings.duration*1000;render();scheduleBots();},
    reveal(){if(S.phase!=="question")return;scoreNow();S.paused=false;S.phase="reveal";render();},
    pause(){if(S.phase!=="question"||S.paused)return;S.paused=true;S.pauseLeft=Math.max(0,S.questionEnds-Date.now());render();},
    resume(){if(!S.paused)return;S.paused=false;S.questionEnds=Date.now()+S.pauseLeft;render();},
    addTime(sec){if(S.paused)S.pauseLeft+=sec*1000;else S.questionEnds+=sec*1000;render();},
    showBoard(){S.peekFrom=null;S.phase="leaderboard";render();},
    peek(){S.peekFrom=S.phase;S.phase="leaderboard";render();},
    unpeek(){S.phase=S.peekFrom||"setup";S.peekFrom=null;render();},
    nextRound(){const r=S.round+1;if(r>=roundCount()){S.phase="final";render();}else api.startRound(r);},
    reset(){S.phase="lobby";S.qIndex=-1;S.round=0;S.finalRound=false;S.peekFrom=null;S.paused=false;S.players={};S.audience={};S.answers={};S.crowd={};S.result=null;render();},
    setSettings(k,v){S.settings[k]=v;render();},
    setQuestions(qs){S.questions=qs;S.qv++;render();return Promise.resolve(qs.length);},
    hostAuthed:()=>true, needPin:()=>false, setPin(){return Promise.resolve(true);},
  };
  return api;
}

/* ============ SUPABASE BACKEND ============ */
function SupabaseBackend(){
  const sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_KEY);
  const G=CFG.GAME; let pin=""; try{pin=localStorage.getItem("le-trivia-pin")||"";}catch(e){}
  let reactChan=null;
  function applyState(st){
    S.phase=st.phase||"lobby";S.qIndex=st.q_index??-1;S.round=st.round||0;S.finalRound=!!st.final_round;S.peekFrom=st.peek_from||null;S.paused=!!st.paused;
    S.questionEnds=st.question_ends?Date.parse(st.question_ends):0;S.pauseLeft=st.pause_left_ms||0;
    if(st.settings)S.settings=Object.assign({},S.settings,st.settings);
    S.result=st.result?Object.assign({},st.result,{q:S.qIndex}):null;}
  async function rpc(fn,args){const {data,error}=await sb.rpc(fn,args);if(error){console.warn(fn,error);toast(error.message);throw error;}return data;}
  const host=(fn,extra={})=>rpc(fn,Object.assign({p_game:G,p_pin:pin},extra)).then(st=>{if(st&&st.phase)applyState(st);render();});
  const setState=patch=>host("host_set_state",{p_patch:patch});
  async function loadGame(){const {data}=await sb.from("games").select("state,questions").eq("id",G).single();if(!data)return;
    if(JSON.stringify(data.questions)!==JSON.stringify(S.questions)){S.questions=data.questions||[];}applyState(data.state||{});}
  async function loadPeople(){const {data}=await sb.from("players").select("*").eq("game_id",G);S.players={};S.audience={};
    (data||[]).forEach(p=>{(p.role==="player"?S.players:S.audience)[p.pid]={name:p.name,score:p.score,last:p.last,joinedAt:Date.parse(p.joined_at)};});}
  async function loadAnswers(){if(S.qIndex<0)return;const {data}=await sb.from("answers").select("*").eq("game_id",G).eq("q",S.qIndex);
    S.answers[S.qIndex]={};S.crowd[S.qIndex]={};(data||[]).forEach(a=>{if(a.role==="audience")S.crowd[S.qIndex][a.pid]=a.choice;else S.answers[S.qIndex][a.pid]={choice:a.choice,at:Date.parse(a.at),correct:a.correct,points:a.points,fastest:a.fastest};});}
  async function loadMine(pid){const [{data:p},{data:a}]=await Promise.all([sb.from("players").select("*").eq("game_id",G).eq("pid",pid).maybeSingle(),
      S.qIndex>=0?sb.from("answers").select("*").eq("game_id",G).eq("q",S.qIndex).eq("pid",pid).maybeSingle():Promise.resolve({data:null})]);
    if(p){(p.role==="player"?S.players:S.audience)[pid]={name:p.name,score:p.score,last:p.last,joinedAt:Date.parse(p.joined_at)};if(p.role==="player")delete S.audience[pid];else delete S.players[pid];}
    if(a){if(a.role==="audience"){(S.crowd[S.qIndex]||(S.crowd[S.qIndex]={}))[pid]=a.choice;}else{(S.answers[S.qIndex]||(S.answers[S.qIndex]={}))[pid]={choice:a.choice,at:Date.parse(a.at),correct:a.correct,points:a.points,fastest:a.fastest};}}}
  const api={
    async ready(){
      try{const t=await rpc("server_now",{});serverOffset=Date.parse(t)-Date.now();}catch(e){}
      await loadGame();
      if(ROLE==="host"&&pin){const {error}=await sb.rpc("host_set_state",{p_game:G,p_pin:pin,p_patch:{}});if(error){pin="";try{localStorage.removeItem("le-trivia-pin");}catch(x){}}}
      const wantsPeople=ROLE!=="play";
      if(wantsPeople){await loadPeople();await loadAnswers();}
      else{for(const pid of myPids())await loadMine(pid);}
      S.connected=true;render();
      const ch=sb.channel("game:"+G);
      ch.on("postgres_changes",{event:"UPDATE",schema:"public",table:"games",filter:"id=eq."+G},async payload=>{
        const prevQ=S.qIndex,prevPhase=S.phase;const st=payload.new.state||{};
        if((st.qv||0)!==S.qv||(payload.new.questions&&payload.new.questions.length!==S.questions.length)){await loadGame();}else applyState(st);
        S.qv=st.qv||0;
        if(S.qIndex!==prevQ){S.answers[S.qIndex]=S.answers[S.qIndex]||{};S.crowd[S.qIndex]=S.crowd[S.qIndex]||{};if(wantsPeople)await loadAnswers();}
        if(!wantsPeople&&(S.phase==="reveal"||S.phase==="leaderboard"||S.phase==="final")&&prevPhase!==S.phase){for(const pid of myPids())await loadMine(pid);}
        if(wantsPeople&&S.phase==="reveal"&&prevPhase!==S.phase){await loadAnswers();await loadPeople();}
        if(S.phase==="lobby"&&prevPhase!=="lobby"){S.answers={};S.crowd={};if(wantsPeople)await loadPeople();else{S.players={};S.audience={};}}
        render();});
      if(wantsPeople){
        ch.on("postgres_changes",{event:"*",schema:"public",table:"players",filter:"game_id=eq."+G},payload=>{const p=payload.new;if(!p||!p.pid){return;}
          const tgt=p.role==="player"?S.players:S.audience;tgt[p.pid]={name:p.name,score:p.score,last:p.last,joinedAt:Date.parse(p.joined_at)};render();});
        ch.on("postgres_changes",{event:"INSERT",schema:"public",table:"answers",filter:"game_id=eq."+G},payload=>{const a=payload.new;if(a.q!==S.qIndex)return;
          if(a.role==="audience")(S.crowd[a.q]||(S.crowd[a.q]={}))[a.pid]=a.choice;else (S.answers[a.q]||(S.answers[a.q]={}))[a.pid]={choice:a.choice,at:Date.parse(a.at)};render();});
      }
      ch.subscribe(st=>{S.connected=st==="SUBSCRIBED";render();});
      reactChan=sb.channel("react:"+G,{config:{broadcast:{self:true}}}).on("broadcast",{event:"react"},p=>showReaction(p.payload.e)).subscribe();
    },
    async join(pid,code,name){if(code!==S.code)return "That code doesn't match the game on stream.";if(!name)return "Pick a name so the leaderboard knows you.";
      try{const role=await rpc("join_game",{p_game:G,p_pid:pid,p_name:name});(role==="player"?S.players:S.audience)[pid]={name,score:0,last:0,joinedAt:Date.now()};render();return "";}catch(e){return "Couldn't join: "+(e.message||"try again");}},
    async answer(pid,i){ // optimistic local mark, server has the final say
      if(S.phase!=="question")return;
      if(S.audience[pid]){(S.crowd[S.qIndex]||(S.crowd[S.qIndex]={}));if(S.crowd[S.qIndex][pid]===undefined)S.crowd[S.qIndex][pid]=i;}
      else{(S.answers[S.qIndex]||(S.answers[S.qIndex]={}));if(!S.answers[S.qIndex][pid])S.answers[S.qIndex][pid]={choice:i,at:now()};}
      render();try{await rpc("submit_answer",{p_game:G,p_pid:pid,p_choice:i});}catch(e){}},
    react(e){reactChan&&reactChan.send({type:"broadcast",event:"react",payload:{e}});},
    addBots(){toast("Simulated players only exist in Studio mode.");},
    startRound:r=>setState({phase:"round",round:r,q_index:r*PER_ROUND-1,final_round:isFinalRound(r),peek_from:null,result:null}),
    setupQuestion:i=>setState({phase:"setup",q_index:i,round:roundOf(i),final_round:isFinalRound(roundOf(i)),paused:false,peek_from:null,result:null}),
    showQuestion:()=>host("host_show_question"),
    reveal:()=>host("host_reveal"),
    pause:()=>host("host_pause"), resume:()=>host("host_resume"), addTime:s=>host("host_add_time",{p_secs:s}),
    showBoard:()=>setState({phase:"leaderboard",peek_from:null}),
    peek:()=>setState({phase:"leaderboard",peek_from:S.phase}),
    unpeek:()=>setState({phase:S.peekFrom||"setup",peek_from:null}),
    nextRound(){const r=S.round+1;return r>=roundCount()?setState({phase:"final"}):api.startRound(r);},
    reset:()=>host("host_reset").then(()=>{S.players={};S.audience={};S.answers={};S.crowd={};render();}),
    setSettings:(k,v)=>setState({settings:Object.assign({},S.settings,{[k]:v})}),
    setQuestions:qs=>rpc("host_set_questions",{p_game:G,p_pin:pin,p_questions:qs}).then(n=>{S.questions=qs;render();return n;}),
    hostAuthed:()=>!!pin, needPin:()=>ROLE==="host"&&!pin,
    async setPin(p){const prev=pin;pin=p;try{const {error}=await sb.rpc("host_set_state",{p_game:G,p_pin:p,p_patch:{}});if(error)throw error;try{localStorage.setItem("le-trivia-pin",p);}catch(e){}return true;}
      catch(e){pin="";try{localStorage.removeItem("le-trivia-pin");}catch(x){}toast(/pin/i.test(e.message||"")?"That PIN didn't match. Try again.":"Couldn't reach the game: "+(e.message||"network error"));return false;}},
  };
  return api;
}
function myPids(){return instances.filter(i=>i.role==="play").map(i=>i.pid);}
let B;

/* ============ QUESTION SHEET LOADER (Google Sheet → File → Share → Publish to web → CSV) ============ */
function parseCSV(text){const rows=[];let row=[],f="",q=false;for(let i=0;i<text.length;i++){const c=text[i];
  if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
  else if(c==='"')q=true;else if(c===","){row.push(f);f="";}else if(c==="\n"||c==="\r"){if(c==="\r"&&text[i+1]==="\n")i++;row.push(f);rows.push(row);row=[];f="";}else f+=c;}
  if(f.length||row.length){row.push(f);rows.push(row);}return rows;}
function sheetToQuestions(csv){
  const rows=parseCSV(csv);const hdr=rows[0].map(h=>h.trim().toLowerCase());
  const col=name=>hdr.findIndex(h=>h.startsWith(name));
  const c={order:col("order"),ep:col("ep"),title:col("episode title"),cat:col("category"),type:col("type"),setup:col("setup"),q:col("question"),
    o1:col("option 1"),o2:col("option 2"),o3:col("option 3"),o4:col("option 4"),correct:col("correct"),explain:col("explanation"),pron:col("pronunciation"),status:col("status")};
  const out=[];
  rows.slice(1).forEach(r=>{const order=parseInt(r[c.order],10);const status=(r[c.status]||"").trim().toLowerCase();
    if(isNaN(order))return; if(status&&status!=="approve"&&status!=="approved"&&status!=="edit")return;
    const pron=(r[c.pron]||"").split(";").map(s=>s.trim()).filter(Boolean).map(s=>{const k=s.indexOf(":");return k>0?[s.slice(0,k).trim(),s.slice(k+1).trim()]:[s,""];});
    out.push({order,ep:`Ep ${r[c.ep]} · ${r[c.title]}`,cat:(r[c.cat]||"").trim(),kind:(r[c.type]||"").toLowerCase().startsWith("host")?"host":"fact",
      setup:r[c.setup]||"",q:r[c.q]||"",a:[r[c.o1],r[c.o2],r[c.o3],r[c.o4]].map(x=>(x||"").trim()),correct:(parseInt(r[c.correct],10)||1)-1,explain:r[c.explain]||"",pron});});
  out.sort((a,b)=>a.order-b.order);
  return out;
}
async function loadFromSheet(){if(!CFG.SHEET_CSV_URL){toast("Add SHEET_CSV_URL to config.js first.");return;}
  try{const res=await fetch(CFG.SHEET_CSV_URL,{cache:"no-store"});const qs=sheetToQuestions(await res.text());
    if(!qs.length){toast("No rows with an Order number were found.");return;}
    const n=await B.setQuestions(qs);toast(`Loaded ${n} questions from the sheet.`);}catch(e){toast("Sheet load failed: "+e.message);}}

/* ============ TEMPLATES ============ */
const T={
host:`<div class="host"><aside>
  <div><div class="eyebrow">Host control</div><h1>Anniversary Trivia</h1></div>
  <div><div class="stat"><span>Join code</span><b class="code-pill" id="h-code">—</b></div><div class="stat"><span>Phase</span><span class="phase" id="h-phase">lobby</span></div>
  <div class="stat"><span>Players</span><b class="num" id="h-count">0</b></div><div class="stat"><span>Question</span><b class="num" id="h-qn">—</b></div></div>
  <div class="btnrow" id="h-actions"></div>
  <div class="settings"><label class="field">Seconds<input type="number" id="s-duration" min="5" max="120"></label><label class="field">Correct<input type="number" id="s-correct" step="50"></label>
  <label class="field">Wrong<input type="number" id="s-wrong" step="50"></label><label class="field">Fastest bonus (+)<input type="number" id="s-fastest" step="50"></label><label class="field">Final round ×<input type="number" id="s-mult" min="1" max="5"></label></div>
  <div class="btnrow"><button class="btn" id="h-sheet">Load questions from sheet</button><button class="btn" id="h-draft">Load draft set</button></div>
  <div class="btnrow"><button class="btn" id="h-bots">Add 8 simulated players</button><button class="btn danger" id="h-reset">Reset game</button></div>
</aside><main>
  <div class="cards" id="h-cards"></div>
  <div><div class="eyebrow">Live answers</div><div class="live" id="h-live"></div></div>
  <div><div class="eyebrow">Players</div><div class="players" id="h-players"></div></div>
  <div><div class="eyebrow">Audience</div><div class="players" id="h-aud"></div></div>
  <div><div class="eyebrow">Questions</div><div class="qlist" id="h-qlist"></div></div>
</main></div>`,
stage:`<div class="stage-wrap"><div class="stage" id="stage"><div class="grain"></div>
  <div class="top"><div class="brand"><img src="${LOGO}" alt=""><div><div class="t1">Liminal Echoes</div><div class="t2">One year · Anniversary trivia</div></div></div><div class="joinbox">Play along · code <b id="st-code">—</b></div></div>
  <div class="cam one"><span class="lbl">Cam 1</span><span class="name">Kira</span></div><div class="cam two"><span class="lbl">Cam 2</span><span class="name">Fox</span></div>
  <div class="content" id="st-content"></div>
  <div class="ticker"><span id="st-left">Liminal Echoes · Year one</span><span id="st-right"></span></div>
  <div class="corner" id="st-corner"></div><div class="fx" id="st-fx"></div></div></div>`,
play:`<div class="player"><div class="bar"><span class="me" id="p-me">Not joined</span><span><span class="pts num" id="p-pts"></span></span></div><div class="card" id="p-card"></div></div>`,
};

/* ============ INSTANCES (a page can hold several views: the studio does) ============ */
const instances=[];
function mount(role,container,opts={}){container.innerHTML=T[role==="tall"?"stage":role];
  const inst={role:role==="tall"?"stage":role,root:container,ratio:role==="tall"?"tall":(opts.ratio||"wide"),pid:opts.pid||persistentPid(),key:"",pkey:"",bound:false,revealTimer:null};
  if(inst.role==="stage")inst.root.querySelector("#stage").className="stage "+(inst.ratio==="tall"?"tall":"wide");
  instances.push(inst);fitAll();return inst;}
function fitAll(){instances.filter(i=>i.role==="stage").forEach(i=>{const st=i.root.querySelector("#stage"),box=i.root.querySelector(".stage-wrap");const W=i.ratio==="tall"?1080:1920,H=i.ratio==="tall"?1920:1080;
  const bw=box.clientWidth||innerWidth,bh=box.clientHeight||innerHeight;st.style.transform=`translate(-50%,-50%) scale(${Math.min(bw/W,bh/H)})`;});}
window.addEventListener("resize",fitAll);
function toast(msg){let t=$$("#toast");if(!t){t=document.createElement("div");t.id="toast";t.style.cssText="position:fixed;left:50%;top:18px;transform:translateX(-50%);background:#2A2412;color:#F2EAD3;border:1px solid #C9A84C;padding:10px 16px;border-radius:6px;font-weight:700;z-index:99;max-width:90vw";document.body.appendChild(t);}
  t.textContent=msg;t.style.display="block";clearTimeout(t._h);t._h=setTimeout(()=>t.style.display="none",4000);}
function showReaction(e){instances.filter(i=>i.role==="stage").forEach(inst=>{const fx=inst.root.querySelector("#st-fx");if(!fx)return;const s=document.createElement("span");s.textContent=e;const W=inst.ratio==="tall"?1080:1920;
  s.style.left=(W*0.15+Math.random()*W*0.7)+"px";s.style.setProperty("--dx",(Math.random()*160-80)+"px");s.style.setProperty("--rot",(Math.random()*40-20)+"deg");fx.appendChild(s);setTimeout(()=>s.remove(),3300);});}

/* ============ RENDER ============ */
function render(){instances.forEach(i=>{if(i.role==="host")renderHost(i);else if(i.role==="stage")renderStage(i);else renderPlayer(i);});const c=$$("#conn");if(c){c.textContent=S.connected?"live":"connecting…";c.className="conn"+(S.connected?"":" bad");}}

function renderHost(inst){const $=s=>inst.root.querySelector(s);
  if(B.needPin()){if(!inst.root.querySelector(".pinbox")){inst.root.innerHTML=`<div class="pinbox"><div class="eyebrow">Host control</div><h1>Enter the host PIN</h1><p style="color:var(--ink-dim);font-weight:500;margin:0">Same PIN for both hosts. It's the one set in the Supabase schema.</p><input id="pin" inputmode="numeric" autocomplete="off"><button class="btn primary" id="pin-go">Open the control panel</button></div>`;
      const go=()=>{const p=inst.root.querySelector("#pin").value.trim();if(!p)return;inst.root.innerHTML=`<div class="pinbox"><div class="eyebrow">Host control</div><h1>Checking the PIN…</h1></div>`;B.setPin(p).then(ok=>{if(ok){inst.root.innerHTML=T.host;inst.bound=false;}else{inst.bound=false;inst.root.innerHTML="";}render();});};
      inst.root.querySelector("#pin-go").onclick=go;inst.root.querySelector("#pin").addEventListener("keydown",e=>{if(e.key==="Enter")go();});inst.root.querySelector("#pin").focus();}return;}
  if(!inst.root.querySelector("#h-code")){inst.root.innerHTML=T.host;inst.bound=false;}
  $("#h-code").textContent=S.code;$("#h-phase").textContent=S.phase+(S.peekFrom?" (peek)":"");
  $("#h-count").textContent=Object.keys(S.players).length+(Object.keys(S.audience).length?` + ${Object.keys(S.audience).length} audience`:"");
  $("#h-qn").textContent=!Q().length?"no questions loaded":S.qIndex<0?`Round ${S.round+1} of ${roundCount()}`:`R${S.round+1} · Q${posInRound(S.qIndex)} of ${roundLen(S.round)}`;
  if(!inst.bound){inst.bound=true;
    ["duration","correct","wrong","fastest","mult"].forEach(k=>{const el=$("#s-"+k);el.value=S.settings[k];el.addEventListener("change",e=>{const v=parseInt(e.target.value,10);if(!isNaN(v))B.setSettings(k,v);});});
    $("#h-bots").onclick=()=>B.addBots();$("#h-sheet").onclick=loadFromSheet;
    $("#h-draft").onclick=()=>{if(window.DRAFT_QUESTIONS)B.setQuestions(window.DRAFT_QUESTIONS).then(n=>toast(`Loaded ${n} draft questions.`));};
    $("#h-reset").onclick=()=>{const btn=$("#h-reset");if(btn.classList.contains("armed")){btn.classList.remove("armed");btn.textContent="Reset game";B.reset();}else{btn.classList.add("armed");btn.textContent="Click again to reset";setTimeout(()=>{btn.classList.remove("armed");btn.textContent="Reset game";},4000);}};
  } else {["duration","correct","wrong","fastest","mult"].forEach(k=>{const el=$("#s-"+k);if(document.activeElement!==el)el.value=S.settings[k];});}
  const act=$("#h-actions");let html="";const endOfRound=S.qIndex>=0&&lastInRound(S.qIndex),lastRound=S.round>=roundCount()-1,peek=`<button class="btn" data-a="peek">Peek leaderboard</button>`;
  if(!Q().length)html=`<span class="chip">Load questions first (sheet or draft set)</span>`;
  else if(S.phase==="lobby")html=`<button class="btn primary" data-a="start" ${Object.keys(S.players).length?"":"disabled"}>Start game</button>`;
  else if(S.phase==="round")html=`<button class="btn primary" data-a="begin">Begin round ${S.round+1}: ${esc(roundTitle(S.round))}</button>${peek}`;
  else if(S.phase==="setup")html=`<button class="btn primary" data-a="show">Show question &amp; start timer</button>${peek}`;
  else if(S.phase==="question")html=`<button class="btn primary" data-a="reveal">Reveal answer now</button><button class="btn" data-a="${S.paused?"resume":"pause"}">${S.paused?"Resume timer":"Pause timer"}</button><button class="btn" data-a="plus">+10 s</button>`;
  else if(S.phase==="reveal")html=endOfRound?`<button class="btn primary" data-a="board">Show leaderboard (end of round)</button>`:`<button class="btn primary" data-a="next">Next question</button>${peek}`;
  else if(S.phase==="leaderboard")html=S.peekFrom?`<button class="btn primary" data-a="unpeek">Back to the game</button>`:(lastRound?`<button class="btn primary" data-a="final">Show final podium</button>`:`<button class="btn primary" data-a="nextround">Next round: ${esc(roundTitle(S.round+1))}</button>`);
  else if(S.phase==="final")html=`<span class="chip">Game over — reset to play again</span>`;
  act.innerHTML=html;
  act.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>({start:()=>B.startRound(0),begin:()=>B.setupQuestion(S.round*PER_ROUND),show:()=>B.showQuestion(),reveal:()=>B.reveal(),board:()=>B.showBoard(),peek:()=>B.peek(),unpeek:()=>B.unpeek(),
    next:()=>B.setupQuestion(S.qIndex+1),nextround:()=>B.nextRound(),final:()=>B.nextRound(),pause:()=>B.pause(),resume:()=>B.resume(),plus:()=>B.addTime(10)})[b.dataset.a]());
  const cards=$("#h-cards");
  if(S.phase==="lobby"||S.qIndex<0||!curQ()){cards.innerHTML=S.phase==="round"?`<div class="hcard lit"><div class="lbl">Round ${S.round+1} of ${roundCount()}</div><p class="qq">${esc(roundTitle(S.round))}</p><p>${isFinalRound(S.round)?`Five host questions. Correct answers are worth ${S.settings.correct*S.settings.mult}, wrong still costs ${Math.abs(S.settings.wrong)}, fastest correct adds ${S.settings.fastest}.`:`Introduce the category, then press Begin.`}</p></div>`
    :`<div class="hcard"><div class="lbl">Before you start</div><p>Players join with the code on stage. Start shows the Round 1 title card; each question then goes setup → question → reveal, with a leaderboard after every fifth question. No answer scores 0.</p></div>`;}
  else{const q=curQ(),inSetup=S.phase==="setup",inQ=S.phase==="question",inR=["reveal","leaderboard","final"].includes(S.phase);
    cards.innerHTML=`<div class="hcard ${inSetup?"lit":""}"><div class="lbl">1 · Read this first (stage shows only the title card) · ${esc(q.ep)}</div><p>${esc(q.setup)}</p></div>
      ${q.pron&&q.pron.length?`<div class="hcard ${inSetup||inQ?"lit":""}"><div class="lbl">Say it right</div><div class="pron">${q.pron.map(([w,p])=>`<div><b>${esc(w)}</b><i>${esc(p)}</i></div>`).join("")}</div></div>`:""}
      <div class="hcard ${inQ?"lit":""}"><div class="lbl">2 · The question ${q.kind==="host"?"· about the hosts (fastest correct +"+S.settings.fastest+")":""}</div><p class="qq">${esc(q.q)}</p><div class="opts">${q.a.map((t,i)=>`<span class="${i===q.correct?"ok":""}">${esc(t)}</span>`).join("")}</div></div>
      <div class="hcard ${inR?"lit":""}"><div class="lbl">3 · After the reveal</div><p>${esc(q.explain)}</p></div>`;}
  const live=$("#h-live");
  if(S.qIndex>=0&&curQ()&&!["setup","round"].includes(S.phase)){const q=curQ(),c=counts();live.innerHTML=q.a.map((t,i)=>`<div class="cell ${S.phase!=="question"&&i===q.correct?"correct":""}"><div class="swatch" style="background:var(--${LETTERS[i].toLowerCase()})"></div><b class="num">${c[i]}</b><span>${esc(t)}</span></div>`).join("");}
  else live.innerHTML=`<div class="cell" style="grid-column:1/-1"><span>Answer counts appear here once a question is live. ${Object.keys(S.players).length} player(s) in the room.</span></div>`;
  $("#h-players").innerHTML=ranking().map(p=>`<span class="chip ${p.bot?"bot":""}">${esc(p.name)}<span class="num">${p.score}</span></span>`).join("")||`<span class="chip">Nobody yet.</span>`;
  $("#h-aud").innerHTML=audienceRanking().map(p=>`<span class="chip bot">${esc(p.name)}<span class="num">${p.score||0}</span></span>`).join("")||`<span class="chip">Late joiners appear here with their own score, for the audience prize.</span>`;
  let ql="";Q().forEach((q,i)=>{if(i%PER_ROUND===0)ql+=`<div class="eyebrow" style="margin:10px 0 4px">Round ${roundOf(i)+1} · ${esc(roundTitle(roundOf(i)))}</div>`;
    ql+=`<div class="qitem ${i===S.qIndex?"now":""} ${i<S.qIndex?"done":""}"><span class="n num">${String(i+1).padStart(2,"0")}</span><span>${esc(q.q)}<br><span class="ep">${esc(q.ep)}${q.kind==="host"?" · host question":""} · answer: ${esc(q.a[q.correct])}</span></span><span class="ep"></span></div>`;});
  $("#h-qlist").innerHTML=ql||`<div class="qitem"><span></span><span>No questions loaded. Use "Load questions from sheet" (approved rows with an Order number) or "Load draft set".</span></div>`;
}

function renderStage(inst){const $=s=>inst.root.querySelector(s);
  $("#st-code").textContent=S.code;
  const n=Object.keys(S.players).length,na=Object.keys(S.audience).length;$("#st-right").textContent=`${n} playing${na?` · ${na} in audience`:""}`;
  const key=[S.phase,S.qIndex,S.round,n,Object.keys(curAnswers()).length,S.qv].join(":"),c=$("#st-content"),corner=$("#st-corner");
  if(S.phase!=="reveal")corner.innerHTML="";
  if(S.phase==="lobby"){if(inst.key===key)return;
    c.innerHTML=`<div class="lobby"><img src="${LOGO}" alt=""><h2>Play along <em>live</em></h2><div class="bigcode">${esc(S.code)}</div><p>Open ${esc(CFG.PLAY_URL||"the player link")} on your phone and enter the code.</p><div class="roster">${ranking().slice(0,24).map(p=>`<span>${esc(p.name)}</span>`).join("")}</div></div>`;
  }else if(S.phase==="round"){if(inst.key===key)return;const fin=isFinalRound(S.round);
    c.innerHTML=`<div class="setupcard"><div class="k">${fin?"Final round":"Round "+(S.round+1)+" of "+roundCount()}</div><h2>${esc(roundTitle(S.round))}</h2><div class="rule"></div><div class="ep">${fin?`Double points · fastest correct +${S.settings.fastest}`:S.round===0?"Four questions, then one about the hosts":""}</div></div>`;
  }else if(S.phase==="setup"){if(inst.key===key)return;const q=curQ()||{};
    c.innerHTML=`<div class="setupcard"><div class="k">${esc(roundTitle(S.round))} · Question ${posInRound(S.qIndex)} of ${roundLen(S.round)}</div><h2>${q.kind==="host"?"About the hosts":"Question "+posInRound(S.qIndex)}</h2><div class="rule"></div><div class="ep">${esc(q.ep)}</div></div>`;
  }else if(S.phase==="question"){
    if(inst.key!==key){const q=curQ()||{a:[]},total=Object.values(S.players).length||1;
      c.innerHTML=`<div class="qnum">${esc(roundTitle(S.round))} · ${posInRound(S.qIndex)} of ${roundLen(S.round)}<span>${esc(q.ep)}</span>${q.kind==="host"?`<span class="bonus-tag">Hosts · fastest correct +${S.settings.fastest}</span>`:""}${S.finalRound?`<span class="bonus-tag">Double points</span>`:""}</div><div class="qtext">${esc(q.q)}</div>
        <div class="answers" id="st-answers">${q.a.map((t,i)=>`<div class="ans ${LETTERS[i]}"><span class="mark"></span><span>${esc(t)}</span></div>`).join("")}</div>
        <div class="meta"><div class="timer" id="st-timer"></div><div class="answered num" id="st-answered"><b>${Object.keys(curAnswers()).length}</b>of ${total} answered</div></div>`;}
    tickStage(inst);
  }else if(S.phase==="reveal"){
    if(inst.key!==key){const q=curQ()||{a:[]},r=result();
      const winner=()=>`<div class="winner"><div class="lbl">${q.kind==="host"?"About the hosts · correct answer":"Correct answer"}</div><div class="txt">${esc(q.a[q.correct])}</div>${q.kind==="host"?`<div class="fast">${r.fastest?`⚡ Fastest: ${esc(r.fastest)} · +${S.settings.fastest}`:"Nobody got it in time"}</div>`:""}<div class="sub"><b>${r.got}</b> of ${r.tot} players got it</div></div>`;
      corner.innerHTML=r.aud_tot?`<span class="k">Audience</span><b>${r.aud_got}</b> of ${r.aud_tot} got it`:"";
      const grid=$("#st-answers");
      if(grid&&inst.key.startsWith("question")){grid.querySelectorAll(".ans").forEach((el,i)=>{if(i!==q.correct)el.classList.add("out");});const t=$("#st-timer");if(t)t.innerHTML=`<div class="t">Answer locked in</div>`;
        clearTimeout(inst.revealTimer);inst.revealTimer=setTimeout(()=>{grid.innerHTML=winner();},480);}
      else c.innerHTML=`<div class="qnum">${esc(roundTitle(S.round))} · ${posInRound(S.qIndex)} of ${roundLen(S.round)}<span>${esc(q.ep)}</span></div><div class="qtext">${esc(q.q)}</div><div class="answers">${winner()}</div><div class="meta"><div class="timer"><div class="t">Answer locked in</div></div></div>`;}
  }else if(S.phase==="leaderboard"){if(inst.key===key)return;const top=(S.result&&S.result.top)||ranking();const rows=top.slice(0,inst.ratio==="tall"?8:6);
    c.innerHTML=`<div class="board"><h2>${S.peekFrom?"Leaderboard":"After "+(isFinalRound(S.round)?"the final round":"round "+(S.round+1))}</h2>${rows.map((p,i)=>`<div class="row" style="animation-delay:${i*60}ms"><span class="rank num">${i+1}</span><span>${esc(p.name)}</span><span class="score num">${p.score}${p.last?`<span class="delta" style="${p.last<0?"color:var(--coral)":""}">${p.last>0?"+":""}${p.last}</span>`:""}</span></div>`).join("")}</div>`;
  }else if(S.phase==="final"){if(inst.key===key)return;const top=(S.result&&S.result.top)||ranking(),p=i=>top[i]||{name:"—",score:0};const aud=((S.result&&S.result.aud_top)||audienceRanking())[0];
    c.innerHTML=`<div class="final-h">One year in. <em>Champions.</em></div><div class="podium">
      <div class="col p2"><div class="name">${esc(p(1).name)}</div><div class="pts num">${p(1).score} pts</div><div class="block">2</div></div>
      <div class="col p1"><div class="name">${esc(p(0).name)}</div><div class="pts num">${p(0).score} pts</div><div class="block">1</div></div>
      <div class="col p3"><div class="name">${esc(p(2).name)}</div><div class="pts num">${p(2).score} pts</div><div class="block">3</div></div></div>
      ${aud?`<div class="podium-aud">Audience champion · <b>${esc(aud.name)}</b> · ${aud.score||0} pts</div>`:""}`;}
  inst.key=key;}
function tickStage(inst){const $=s=>inst.root.querySelector(s),t=$("#st-timer");if(!t||S.phase!=="question")return;const left=remaining(),frac=Math.min(1,left/S.settings.duration);
  const a=$("#st-answered");if(a)a.innerHTML=`<b>${Object.keys(curAnswers()).length}</b>of ${Object.values(S.players).length||1} answered`;
  const ring=`<div class="ring"><svg viewBox="0 0 104 104"><circle cx="52" cy="52" r="46" fill="none" stroke="rgba(201,168,76,.18)" stroke-width="8"/><circle cx="52" cy="52" r="46" fill="none" stroke="${frac<.25?'#D9705A':'#C9A84C'}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${2*Math.PI*46}" stroke-dashoffset="${2*Math.PI*46*(1-frac)}"/></svg><b class="num">${Math.ceil(left)}</b></div>`;
  if(S.paused){t.className="timer";t.innerHTML=ring+`<div class="t paused-tag">timer<br>paused</div>`;return;}
  t.className="timer"+(left<5?" hot":"");t.innerHTML=ring+`<div class="t">seconds<br>left</div>`;}

const reactRow=()=>`<div class="reacts">${REACTIONS.map(([e,l])=>`<button data-e="${e}">${e}<small>${l}</small></button>`).join("")}</div>`;
function bindReacts(card){card.querySelectorAll(".reacts button").forEach(b=>b.onclick=()=>B.react(b.dataset.e));}
function renderPlayer(inst){const $=s=>inst.root.querySelector(s),myId=inst.pid,me=S.players[myId],aud=S.audience[myId],card=$("#p-card");
  if(!me&&aud){renderAudience(inst,aud,card);return;}
  $("#p-me").textContent=me?me.name:"Not joined";$("#p-pts").textContent=me?me.score+" pts":"";
  const mine=curAnswers()[myId],key=[S.phase,S.qIndex,S.round,!!me,mine?mine.choice:"-",mine?mine.points:"-",me?me.score:0,S.connected].join(":");
  if(key===inst.pkey&&S.phase!=="question")return;
  if(!me){if(inst.pkey!==key){card.innerHTML=`<img class="logo" src="${LOGO}" alt=""><h1>Anniversary <em>Trivia</em></h1><p style="text-align:center">Enter the code on the stream, then pick a name everyone will see.</p>
      <input class="big-input" id="j-code" placeholder="CODE" maxlength="8" autocomplete="off" value="${ROLE==="play"?esc(S.code):""}"><input class="name-input" id="j-name" placeholder="Your name" maxlength="18" autocomplete="off"><div class="err" id="j-err"></div><button class="go" id="j-go">Let's play</button>`;
      $("#j-go").onclick=async()=>{const err=await B.join(myId,$("#j-code").value.trim().toUpperCase(),$("#j-name").value.trim());if(err)$("#j-err").textContent=err;};}}
  else if(S.phase==="lobby")card.innerHTML=`<div class="waiting"><div class="dot"></div><h2>You're in, ${esc(me.name)}.</h2><p>Keep this page open. The first question lands here the moment the hosts start.</p></div>`;
  else if(S.phase==="round")card.innerHTML=`<div class="waiting"><div class="dot"></div><h2>${esc(roundTitle(S.round))}</h2><p>${isFinalRound(S.round)?"Final round: correct answers are worth double.":`Round ${S.round+1} of ${roundCount()}.`}</p></div>`;
  else if(S.phase==="setup")card.innerHTML=`<div class="waiting"><div class="dot"></div><h2>Question ${posInRound(S.qIndex)}</h2><p>Listen to the hosts. Your buttons appear when the timer starts.</p></div>`;
  else if(S.phase==="question"){const q=curQ()||{a:[]};
    if(inst.pkey!==key){card.innerHTML=`<div class="ptimer" id="p-timer"></div><div class="track"><i id="p-track"></i></div><div class="pgrid">${q.a.map((t,i)=>`<button class="pbtn ${LETTERS[i]} ${mine?(mine.choice===i?"mine":"dim"):""}" data-i="${i}" ${mine?"disabled":""}>${esc(t)}</button>`).join("")}</div>
      ${mine?`<p style="text-align:center">Locked in. Waiting for the reveal…</p>`:`<p style="text-align:center">${q.kind==="host"?`Fastest correct answer gets +${S.settings.fastest}. `:""}Correct +${S.settings.correct*(S.finalRound?S.settings.mult:1)} · wrong ${S.settings.wrong} · no answer 0</p>`}`;
      card.querySelectorAll(".pbtn").forEach(b=>b.onclick=()=>B.answer(myId,+b.dataset.i));}
    tickPlayer(inst);}
  else if(S.phase==="reveal"){const q=curQ()||{a:[]},ok=mine&&mine.correct,scored=mine&&mine.points!=null,top=(S.result&&S.result.top)||ranking();let rank=top.findIndex(p=>(p.pid||p.id)===myId)+1;
    card.innerHTML=`<div class="result ${ok?"ok":"no"}"><div class="mark">${ok?"✓":"✕"}</div><h2>${!mine?"No answer.":!scored?"Scoring…":ok?"Correct!":"Not this time."}</h2>
      <div class="gain num" style="${scored&&mine.points<0?"color:var(--coral)":""}">${scored?(mine.points>0?"+":"")+mine.points:mine?"…":"0"}</div>${mine&&mine.fastest?`<p class="sub" style="color:var(--gold-hi)">⚡ Fastest correct answer in the room</p>`:""}<p class="sub">The answer was <b>${esc(q.a[q.correct])}</b></p><p class="sub">${rank?`You're in <b>${ord(rank)}</b> place with ${me.score} pts`:`You have ${me.score} pts`}</p></div>${reactRow()}`;bindReacts(card);}
  else if(S.phase==="leaderboard"||S.phase==="final"){const top=(S.result&&S.result.top)||ranking(),rank=top.findIndex(p=>(p.pid||p.id)===myId)+1;
    card.innerHTML=`<div class="waiting"><h2>${S.phase==="final"?"Final standings":"Leaderboard"}</h2><p>${rank?`You're <b>${ord(rank)}</b>`:`You have ${me.score} pts`}</p><div class="minirows">${top.slice(0,5).map((p,i)=>`<div class="minirow ${(p.pid||p.id)===myId?"me":""}"><span class="rank num">${i+1}</span><span>${esc(p.name)}</span><span class="num">${p.score}</span></div>`).join("")}</div>${S.phase==="final"?"<p>Thanks for playing along for year one.</p>":"<p>Next up is coming.</p>"}</div>${reactRow()}`;bindReacts(card);}
  inst.pkey=key;}
function renderAudience(inst,aud,card){const $=s=>inst.root.querySelector(s),myId=inst.pid,myVote=(S.crowd[S.qIndex]||{})[myId];
  $("#p-me").textContent=aud.name+" · audience";$("#p-pts").textContent=(aud.score||0)+" pts";
  const key=["aud",S.phase,S.qIndex,S.round,myVote,aud.score].join(":");if(key===inst.pkey)return;inst.pkey=key;
  if(S.phase==="question"){const q=curQ()||{a:[]};card.innerHTML=`<div class="eyebrow">Audience vote</div><p>The game already started, so you're in the audience. Vote along: audience points count for the audience prize.</p><div class="pgrid">${q.a.map((t,i)=>`<button class="pbtn ${LETTERS[i]} ${myVote!==undefined?(myVote===i?"mine":"dim"):""}" data-i="${i}" ${myVote!==undefined?"disabled":""}>${esc(t)}</button>`).join("")}</div>`;
    card.querySelectorAll(".pbtn").forEach(b=>b.onclick=()=>B.answer(myId,+b.dataset.i));}
  else if(S.phase==="reveal"){const q=curQ()||{a:[]},ok=myVote===q.correct;card.innerHTML=`<div class="result ${ok?"ok":"no"}"><div class="mark">${ok?"✓":"✕"}</div><h2>${myVote===undefined?"No vote.":ok?"You'd have had it.":"Not this one."}</h2><p class="sub">The answer was <b>${esc(q.a[q.correct])}</b></p><p class="sub">Audience score: <b>${aud.score||0}</b></p></div><p style="text-align:center" class="eyebrow">Send a reaction to the stream</p>${reactRow()}`;bindReacts(card);}
  else{const top=(S.result&&S.result.top)||ranking();card.innerHTML=`<div class="waiting"><div class="dot"></div><h2>Watching as audience</h2><p>${S.phase==="final"?"That's the game.":S.phase==="round"?esc(roundTitle(S.round))+" is up next.":"The hosts are setting up the next question."}</p><div class="minirows">${top.slice(0,3).map((p,i)=>`<div class="minirow"><span class="rank num">${i+1}</span><span>${esc(p.name)}</span><span class="num">${p.score}</span></div>`).join("")}</div></div>${reactRow()}`;bindReacts(card);}}
function tickPlayer(inst){const $=s=>inst.root.querySelector(s),t=$("#p-timer"),tr=$("#p-track");if(!t)return;const left=remaining();t.className="ptimer"+(left<5?" hot":"");t.innerHTML=`<span>${esc(roundTitle(S.round))} · ${posInRound(S.qIndex)} of ${roundLen(S.round)}</span><b class="num">${Math.ceil(left)}s</b>`;tr.style.width=(100*Math.min(1,left/S.settings.duration))+"%";}

/* ============ CLOCK: the timer runs on every screen; only a HOST page ends the question ============ */
setInterval(()=>{if(S.phase!=="question")return;
  instances.forEach(i=>{if(i.role==="stage")tickStage(i);else if(i.role==="play"&&!S.audience[i.pid])tickPlayer(i);});
  if(instances.some(i=>i.role==="host")&&B.hostAuthed()){const n=Object.keys(S.players).length,a=Object.keys(curAnswers()).length;
    if(!S.paused&&(remaining()<=0||(n>0&&a>=n))){if(!window._revealing){window._revealing=true;Promise.resolve(B.reveal()).finally(()=>{setTimeout(()=>window._revealing=false,1500);});}}}},200);

/* ============ BOOT ============ */
const useSupabase=!!CFG.SUPABASE_URL&&ROLE!=="studio"&&window.supabase;
B=useSupabase?SupabaseBackend():LocalBackend();
if(ROLE==="studio"){mount("host",$$("#studio-host"));mount("stage",$$("#studio-stage"),{ratio:"wide"});mount("play",$$("#studio-phoneA"),{pid:"phoneA"});mount("play",$$("#studio-phoneB"),{pid:"phoneB"});
  document.querySelectorAll(".seg [data-ratio]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".seg [data-ratio]").forEach(x=>x.classList.toggle("on",x===b));$$("#studio-stagebox").classList.toggle("tallbox",b.dataset.ratio==="tall");
    const i=instances.find(x=>x.role==="stage");i.ratio=b.dataset.ratio;i.root.querySelector("#stage").className="stage "+(i.ratio==="tall"?"tall":"wide");i.key="";render();setTimeout(fitAll,50);});}
else{const root=$$("#root");mount(ROLE,root);if(ROLE==="stage"||ROLE==="tall")document.documentElement.classList.add("chroma");}
B.ready();
})();
