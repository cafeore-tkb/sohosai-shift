// 共同編集（Firebase Firestore によるリアルタイム同期）
// firebase-config.js に設定があり、URL が #room=XXXX のときだけ有効になる。設定がなければ従来どおりオフラインで動く。
// 閲覧・編集：共有リンクを持ち Google ログインした人。CSVの読み込み（勤務可能時間の置き換え）と管理者の変更：管理者のみ。
(()=>{
const FB_VERSION='12.19.0';
const SHARED_MAPS=['assignments','slotTypes','slotCounts','roleRequirements','memberStatuses','memberStores','memberWants','memberDislikes','memberDrips','memberCars'];
const WHOLE_MAP_THRESHOLD=200;// 1つのマップでこれ以上の変更があれば、項目ごとではなくマップごと送る
const config=window.FIREBASE_CONFIG;
const enabled=!!(config&&config.apiKey&&config.projectId);
const roomFromHash=()=>(location.hash.match(/room=([A-Za-z0-9]{20,})/)||[])[1]||'';
let fb=null,ref=null,synced=null,pushTimer=null,pendingRender=false,roomId='',user,meta={owner:'',admins:[]};

const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const getPath=(obj,[k,key])=>key===undefined?obj[k]:obj[k]?.[key];
const myEmail=()=>(user?.email||'').toLowerCase();
const isAdmin=()=>!!user&&meta.admins.includes(myEmail());
function sharedNow(){const o={availability:JSON.stringify(state.availability)};for(const k of SHARED_MAPS)o[k]=clone(state[k]||{});return o;}
function normalize(data){const o={availability:typeof data.availability==='string'?data.availability:'[]'};for(const k of SHARED_MAPS)o[k]=data[k]&&typeof data[k]==='object'?data[k]:{};return o;}
// cur と base の差分を [[パス], 値（undefined は削除）] の配列で返す
function diff(cur,base){const out=[];if(cur.availability!==base.availability)out.push([['availability'],cur.availability]);for(const k of SHARED_MAPS){const a=cur[k],b=base[k]||{};for(const key of Object.keys(a))if(!(key in b)||!same(a[key],b[key]))out.push([[k,key],a[key]]);for(const key of Object.keys(b))if(!(key in a))out.push([[k,key],undefined]);}return out;}

function randomId(n=24){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',buf=crypto.getRandomValues(new Uint8Array(n));return [...buf].map(b=>chars[b%chars.length]).join('');}
const roomUrl=()=>`${location.origin}${location.pathname}#room=${roomId}`;

async function loadFirebase(){
  if(fb)return fb;
  if(window.__FIREBASE_MOCK__)return fb=window.__FIREBASE_MOCK__;// 動作確認用
  const base=`https://www.gstatic.com/firebasejs/${FB_VERSION}`;
  const [app,auth,fs]=await Promise.all([import(`${base}/firebase-app.js`),import(`${base}/firebase-auth.js`),import(`${base}/firebase-firestore.js`)]);
  const fbApp=app.initializeApp(config),au=auth.getAuth(fbApp);
  fb={...fs,db:fs.getFirestore(fbApp),
    onUser:cb=>auth.onAuthStateChanged(au,cb),
    signIn:()=>auth.signInWithPopup(au,new auth.GoogleAuthProvider()),
    signOut:()=>auth.signOut(au)};
  return fb;
}
// Firebase を読み込み、ログイン状態が分かったら onReady を呼ぶ
let authStarted=false;
async function startAuth(onReady){
  if(authStarted)return;authStarted=true;
  try{await loadFirebase();}catch(err){console.error(err);setStatus('error','接続できません');showToast(`Firebase を読み込めませんでした：${err.message}`,true);return;}
  // 共同編集中に別アカウントへ切り替わった／ログアウトした場合は、権限が変わるので読み込み直す
  fb.onUser(u=>{const switched=!!user&&myEmail()!==(u?.email||'').toLowerCase();user=u||null;if(switched&&ref)return location.reload();onReady?.();updateLock();refreshDialog();});
}

// ---- 送信 ----
function schedulePush(){if(!ref||!synced)return;clearTimeout(pushTimer);pushTimer=setTimeout(pushNow,120);}
function pushNow(){
  clearTimeout(pushTimer);pushTimer=null;
  if(!ref||!synced||!user)return;
  const cur=sharedNow(),changes=diff(cur,synced);
  if(!changes.length)return;
  synced=cur;
  const perMap={};changes.forEach(([p])=>perMap[p[0]]=(perMap[p[0]]||0)+1);
  const args=[],whole=new Set();
  for(const [path,v] of changes){
    if(path.length===2&&perMap[path[0]]>WHOLE_MAP_THRESHOLD){if(!whole.has(path[0])){whole.add(path[0]);args.push(new fb.FieldPath(path[0]),cur[path[0]]);}continue;}
    args.push(new fb.FieldPath(...path),v===undefined?fb.deleteField():v);
  }
  args.push('updatedBy',user.email,'updatedAt',fb.serverTimestamp());
  // 権限がなく拒否された場合は、Firestore がサーバーの内容を配信し直すので画面も元に戻る
  fb.updateDoc(ref,...args).catch(err=>{console.error(err);showToast(err.code==='permission-denied'?'この変更をする権限がないため、元に戻しました':`共同編集の保存に失敗しました：${err.message}`,true);});
}

// ---- 受信 ----
function applyMeta(data){
  meta={owner:data.owner||'',admins:Array.isArray(data.admins)?data.admins:[],updatedBy:data.updatedBy||'',updatedAt:data.updatedAt?.toDate?.()||null};
  updateLock();refreshDialog();
}
function applyFull(data){
  const remote=normalize(data);
  state.availability=JSON.parse(remote.availability||'[]');
  for(const k of SHARED_MAPS)state[k]=clone(remote[k]);
  state.slots=[];// 必要人数（slotCounts）から作り直す
  if(state.availability.length&&state.view==='import')state.view='shift';
  $('#importStatus').classList.add('hidden');
  synced=remote;
  render();
}
function applyRemote(data){
  const remote=normalize(data),local=sharedNow(),changes=diff(remote,synced);
  if(!changes.length)return;
  for(const [path,v] of changes){
    // まだ送っていない自分の変更がある項目は、自分の変更を優先（このあと送信される）
    if(!same(getPath(local,path),getPath(synced,path)))continue;
    if(path.length===1){state.availability=JSON.parse(v||'[]');continue;}
    const [k,key]=path;
    if(v===undefined)delete state[k][key];else state[k][key]=clone(v);
    if(k==='slotCounts'){const sl=state.slots.find(s=>s.id===key);if(sl)sl.count=v===undefined?defaultCount(sl.date,sl.store,sl.role):v;}
  }
  synced=remote;
  renderWhenIdle();
  schedulePush();
}
// 入力中・ドロップダウン操作中・ドラッグ中に描き直すと操作が途切れるので、終わるまで待つ
function busy(){
  const el=document.activeElement;
  if(el&&/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)&&!/^(checkbox|radio|file)$/.test(el.type)&&!el.closest('dialog'))return true;
  return !!movingKey||document.body.classList.contains('dragging')||document.body.classList.contains('picking');
}
function renderWhenIdle(){if(busy()){pendingRender=true;return;}pendingRender=false;render();}
const flush=()=>setTimeout(()=>{if(pendingRender&&!busy()){pendingRender=false;render();}},0);
document.addEventListener('focusout',flush);document.addEventListener('dragend',flush);document.addEventListener('click',flush);setInterval(flush,1000);

function subscribe(){
  let first=true;
  fb.onSnapshot(ref,{includeMetadataChanges:true},snap=>{
    if(!snap.exists()){setStatus('error','部屋が見つかりません');if(first)alert('共同編集の部屋が見つかりません。リンクが正しいか確認してください。');first=false;return;}
    const data=snap.data();applyMeta(data);
    if(first){first=false;applyFull(data);}else applyRemote(data);
    setStatus(snap.metadata.hasPendingWrites?'saving':snap.metadata.fromCache?'offline':'live');
  },err=>{console.error(err);setStatus('error',err.code==='permission-denied'?'アクセス権がありません':'接続できません');showToast(`共同編集に接続できません：${err.message}`,true);});
}

function joinRoom(id){
  roomId=id;setStatus('connecting');
  startAuth(()=>{
    if(!user){setStatus('login','ログインが必要です');openDialog();return;}
    if(!ref){ref=fb.doc(fb.db,'rooms',roomId);subscribe();}
  });
}
async function startRoom(){
  const btn=$('#shareStartBtn');btn.disabled=true;btn.textContent='作成中…';
  try{
    roomId=randomId();ref=fb.doc(fb.db,'rooms',roomId);
    const cur=sharedNow();
    await fb.setDoc(ref,{...cur,owner:myEmail(),admins:[myEmail()],updatedBy:user.email,createdAt:fb.serverTimestamp(),updatedAt:fb.serverTimestamp()});
    synced=cur;
    history.replaceState(null,'',`#room=${roomId}`);
    subscribe();
  }catch(err){console.error(err);roomId='';ref=null;alert(`共同編集を開始できませんでした：${err.message}`);}
  refreshDialog();
}
async function setAdmins(list){
  try{await fb.updateDoc(ref,{admins:list,updatedBy:user.email,updatedAt:fb.serverTimestamp()});}
  catch(err){console.error(err);showToast(err.code==='permission-denied'?'管理者を変更する権限がありません':`変更できませんでした：${err.message}`);}
}
function leaveRoom(){
  if(!confirm('このブラウザでの共同編集を終了しますか？\nクラウド上のシフトは残り、リンクを開けばいつでも再参加できます。'))return;
  history.replaceState(null,'',location.pathname+location.search);location.reload();
}

// ---- 画面 ----
window.canImportCSV=()=>!roomId||isAdmin();
function updateLock(){
  const locked=!window.canImportCSV();
  document.body.classList.toggle('import-locked',locked);
  const note=$('#importLock');note.classList.toggle('hidden',!locked);
  if(locked)note.textContent=`共同編集中のため、CSVの読み込みは管理者だけができます。${meta.admins.length?`（管理者：${meta.admins.join('、')}）`:''}`;
}
const statusText={connecting:'接続中…',live:'● 共同編集中',saving:'保存中…',offline:'オフライン（再接続で同期）',error:'エラー',login:'ログインが必要です'};
function setStatus(kind,text){
  const badge=$('#modeBadge');badge.textContent=text||statusText[kind];badge.className=`offline sync-${kind}`;
  $('#footerNote').textContent='共同編集中：データは Firebase に保存され、共有リンクを持つログイン済みの人が閲覧・編集できます。';
}
const dialog=$('#shareDialog');
function openDialog(){refreshDialog(true);if(!dialog.open)dialog.showModal();}
function refreshDialog(force){
  if(!force&&!dialog.open)return;
  const body=$('#shareBody');
  if(!enabled){body.innerHTML='<p>共同編集を使うには Firebase の設定が必要です。<br><code>firebase-config.js</code> に設定を書き込んでください（手順は README を参照）。</p><div class="dialog-actions"><button class="quiet" data-close>閉じる</button></div>';return;}
  if(user===undefined){body.innerHTML='<p>読み込み中…</p>';startAuth();return;}
  const account=user?`<p class="share-account">ログイン中：<b>${esc(user.email)}</b><button class="link-button" id="shareSignOut">ログアウト</button></p>`:'';
  if(!user){body.innerHTML=`<p>${roomId?'この共同編集に参加するには':'共同編集を使うには'}、Google アカウントでログインしてください。</p><div class="dialog-actions"><button class="quiet" data-close>閉じる</button><button id="shareSignIn" class="primary">Google でログイン</button></div>`;$('#shareSignIn').onclick=()=>fb.signIn().catch(err=>{if(err.code!=='auth/popup-closed-by-user')alert(`ログインできませんでした：${err.message}`);});return;}
  if(!roomId){body.innerHTML=`${account}<p>いま開いているシフトをクラウドに保存し、共同編集用のリンクを作ります。リンクを開いてログインした人と、同じシフトをリアルタイムに編集できます。</p><ul class="share-notes"><li>リンクを持っていて Google ログインした人は、誰でも閲覧・編集できます。シフト担当者にだけ共有してください。</li><li>CSVの読み込みは管理者だけができます。始めたあなたが管理者になり、あとから追加できます。</li></ul><div class="dialog-actions"><button class="quiet" data-close>キャンセル</button><button id="shareStartBtn" class="primary">共同編集を始める</button></div>`;$('#shareStartBtn').onclick=startRoom;}
  else{
    const admin=isAdmin(),when=meta.updatedAt?meta.updatedAt.toLocaleString('ja-JP'):'';
    body.innerHTML=`${account}<p>このリンクを共有すると、同じシフトを一緒に編集できます。</p><div class="share-link"><input id="shareUrl" readonly value="${esc(roomUrl())}"><button id="shareCopyBtn" class="primary">コピー</button></div>
<div class="admin-box"><strong>管理者（CSVを読み込める人）</strong><ul class="admin-list">${meta.admins.map(a=>`<li><span>${esc(a)}</span>${a===meta.owner?'<small>作成者</small>':admin?`<button class="link-button" data-remove-admin="${esc(a)}">削除</button>`:''}</li>`).join('')}</ul>${admin?'<form id="adminForm" class="share-link"><input id="adminEmail" type="email" placeholder="追加するGoogleアカウントのメールアドレス" required><button class="quiet">追加</button></form>':'<small class="share-muted">管理者の追加・削除は管理者だけができます。</small>'}</div>
<ul class="share-notes"><li>リンクを持っていて Google ログインした人は、誰でも閲覧・編集できます。</li><li>同じ枠を同時に変更した場合は、あとから変更した内容が残ります。</li>${meta.updatedBy?`<li>最終更新：${esc(meta.updatedBy)}${when?`（${esc(when)}）`:''}</li>`:''}</ul><div class="dialog-actions"><button id="shareLeaveBtn" class="quiet danger">このブラウザで共同編集を終了</button><button class="quiet" data-close>閉じる</button></div>`;
    $('#shareCopyBtn').onclick=async()=>{const input=$('#shareUrl');try{await navigator.clipboard.writeText(input.value);}catch{input.select();document.execCommand('copy');}$('#shareCopyBtn').textContent='コピーしました';};
    $('#shareLeaveBtn').onclick=leaveRoom;
    body.querySelectorAll('[data-remove-admin]').forEach(b=>b.onclick=()=>{const a=b.dataset.removeAdmin;if(confirm(`${a} を管理者から外しますか？`))setAdmins(meta.admins.filter(x=>x!==a));});
    const form=$('#adminForm');if(form)form.onsubmit=e=>{e.preventDefault();const a=$('#adminEmail').value.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))return;if(!meta.admins.includes(a))setAdmins([...meta.admins,a]);};
  }
  const out=$('#shareSignOut');if(out)out.onclick=()=>fb.signOut();
}
$('#shareBtn').onclick=openDialog;
dialog.addEventListener('click',e=>{if(e.target===dialog||e.target.closest('[data-close]'))dialog.close();});

window.onStateChange=schedulePush;
window.addEventListener('hashchange',()=>{if(roomFromHash()!==roomId)location.reload();});
const initial=roomFromHash();
if(initial){if(enabled)joinRoom(initial);else setTimeout(()=>alert('共同編集のリンクですが、Firebase の設定（firebase-config.js）がないため接続できません。'),0);}
})();
