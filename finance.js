(function(){
'use strict';

const app = document.getElementById('financeApp');
const habitsApp = document.getElementById('app');
const productTabs = Array.from(document.querySelectorAll('[data-product]'));
const pageMeta = {
  entry:['Money entry','Log an expense or income in a few seconds.'],
  home:['Budget','Give every euro a job before you spend it.'],
  wealth:['Wealth','Net worth, investments and valuable possessions.'],
  networth:['Net worth','Cards, accounts, cash and your gross balance.'],
  assets:['Assets','Investments and things intended to grow in value.'],
  passives:['Passives','Costly possessions that lose value over time.'],
  planning:['Next month','Expected costs based on recurring items and recent months.'],
  analytics:['Analytics','Income, spending and cash-flow patterns.'],
  other:['Other','Income sources, currencies and personal inventory.']
};
const navItems = [
  ['entry','Entry'],['home','Budget'],['analytics','Analytics'],['wealth','Wealth']
];
const DEFAULT_BUDGET_CATEGORIES = [];
const BUDGET_COLORS = ['#7359B6','#E47B24','#258E67','#357FBC','#DE5F74','#5F7F72','#596FB0'];
const HISTORICAL_SPENDING_2025 = {
  version:2,
  source:'Private user entry',
  period:{from:'2025-09',to:'2025-11'},
  months:[
    {key:'2025-09',label:'September',total:0,groups:{}},
    {key:'2025-10',label:'October',total:0,groups:{}},
    {key:'2025-11',label:'November',total:0,groups:{}}
  ],
  groups:[]
};
const $ = (selector, root) => (root || document).querySelector(selector);
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const uid = prefix => prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
const todayKey = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const LOCAL_PREVIEW = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
const LOCAL_PREVIEW_KEY = 'ultra.finance.local-preview.v1';

let product = 'habits';
let page = 'entry';
let entryType = 'expense';
let entryModal = '';
let entryDraft = {amount:'',currency:'EUR',accountId:'',categoryId:'',sourceId:'',date:todayKey(),note:''};
let cashChangePrompt = null;
let quickPanel = '';
let wealthTab = 'networth';
let financeUnlocked = {budget:false,wealth:false};
let financePinMode = {budget:'',wealth:''};
let financePinMessage = {budget:'',wealth:''};
let analyticsMonth = todayKey().slice(0,7);
let analyticsDay = todayKey();
let historicalMonth = '2025-11';
let budgetMode = 'month';
let client = null;
let user = null;
let F = null;
let loading = false;
let loadError = false;
let signMessage = '';
let signingIn = false;
let syncTone = '';
let syncLabel = 'Private cloud';
let saveTimer = null;
let toastTimer = null;

function emptyFinance(){
  return {
    version:1,
    baseCurrency:'EUR',
    rateDate:'2026-08-28',
    currencies:[
      {code:'EUR',symbol:'€',eur:1},
      {code:'USD',symbol:'$',eur:0.85897},
      {code:'UAH',symbol:'₴',eur:0.019283},
      {code:'PLN',symbol:'zł',eur:0.230601},
      {code:'TRY',symbol:'₺',eur:0.0178025},
      {code:'CZK',symbol:'Kč',eur:0.0414113},
      {code:'GBP',symbol:'£',eur:1.16659},
      {code:'CAD',symbol:'C$',eur:0.619963}
    ],
    categories:[],
    accounts:[], sources:[], transactions:[], assets:[], passives:[], recurring:[], planned:[], inventory:[],
    budget:{version:4,categories:DEFAULT_BUDGET_CATEGORIES.map(item=>Object.assign({},item)),monthlyAssignments:{},weeklyPlans:{},monthlyBudgets:{},deletedCategoryIds:[]},
    security:{version:1,budgetPin:null,wealthPin:null},
    historicalAnalytics:JSON.parse(JSON.stringify(HISTORICAL_SPENDING_2025)),
    updatedAt:null
  };
}

function normaliseFinance(value){
  const base = emptyFinance();
  if(!value || typeof value !== 'object') return base;
  Object.keys(base).forEach(key => {
    if(Array.isArray(base[key])) value[key] = Array.isArray(value[key]) ? value[key] : base[key];
    else if(value[key] == null) value[key] = base[key];
  });
  // Keep MONO in its native currency without changing the existing EUR value.
  // Already-converted balances and historical transactions are left untouched.
  const hryvnia=value.currencies.find(item=>item.code==='UAH');
  const hryvniaRate=Number(hryvnia&&hryvnia.eur);
  if(Number.isFinite(hryvniaRate) && hryvniaRate>0){
    value.accounts.forEach(account=>{
      if(String(account.name||'').trim().toUpperCase()!=='MONO' || account.currency==='UAH') return;
      const original=value.currencies.find(item=>item.code===(account.currency||'EUR'));
      const originalRate=Number(original&&original.eur), balance=Number(account.balance||0);
      if(!Number.isFinite(originalRate) || originalRate<=0 || !Number.isFinite(balance)) return;
      account.balance=balance*originalRate/hryvniaRate;
      account.currency='UAH';
    });
  }
  if(!value.budget || typeof value.budget!=='object') value.budget=base.budget;
  if(Number(value.budget.version||0)<2){
    value.budget={version:4,categories:base.budget.categories,monthlyAssignments:{},weeklyPlans:{},monthlyBudgets:{},deletedCategoryIds:[]};
  }else{
    value.budget.version=4;
    value.budget.categories=Array.isArray(value.budget.categories)
      ? value.budget.categories : base.budget.categories;
    value.budget.monthlyAssignments=value.budget.monthlyAssignments&&typeof value.budget.monthlyAssignments==='object'
      ? value.budget.monthlyAssignments : {};
    value.budget.weeklyPlans=value.budget.weeklyPlans&&typeof value.budget.weeklyPlans==='object'
      ? value.budget.weeklyPlans : {};
    value.budget.monthlyBudgets=value.budget.monthlyBudgets&&typeof value.budget.monthlyBudgets==='object'
      ? value.budget.monthlyBudgets : {};
    value.budget.deletedCategoryIds=Array.isArray(value.budget.deletedCategoryIds)
      ? value.budget.deletedCategoryIds : [];
  }
  DEFAULT_BUDGET_CATEGORIES.forEach(item=>{
    if(!value.budget.deletedCategoryIds.includes(item.id)&&!value.budget.categories.some(category=>category.id===item.id)) value.budget.categories.push(Object.assign({},item));
    if(!value.categories.some(category=>category.id===item.categoryId)) value.categories.push({id:item.categoryId,name:item.name,type:'expense'});
  });
  if(!value.security||typeof value.security!=='object') value.security=base.security;
  value.security.version=1;
  ['budgetPin','wealthPin'].forEach(key=>{
    const pin=value.security[key];
    value.security[key]=pin&&typeof pin==='object'&&typeof pin.salt==='string'&&typeof pin.hash==='string'
      ? {algorithm:pin.algorithm||'PBKDF2-SHA256',iterations:Math.max(100000,Number(pin.iterations||210000)),salt:pin.salt,hash:pin.hash} : null;
  });
  if(!value.historicalAnalytics||!Array.isArray(value.historicalAnalytics.months)||!Array.isArray(value.historicalAnalytics.groups)){
    value.historicalAnalytics=JSON.parse(JSON.stringify(HISTORICAL_SPENDING_2025));
  }else value.historicalAnalytics.version=2;
  value.version = 1;
  return value;
}

function setProduct(next){
  lockFinanceSections();
  product = next === 'finance' ? 'finance' : 'habits';
  document.body.classList.toggle('finance-mode', product === 'finance');
  habitsApp.hidden = product !== 'habits';
  app.hidden = product !== 'finance';
  productTabs.forEach(button => button.classList.toggle('active', button.dataset.product === product));
  if(product === 'finance'){
    if(location.hash.indexOf('#finance/') === 0){
      const requested = location.hash.split('/')[1];
      selectFinanceRoute(requested);
    } else history.replaceState(null,'','#finance/'+page);
    connect();
    render();
  } else if(location.hash.indexOf('#finance/') === 0){
    history.replaceState(null,'',location.pathname+location.search);
  }
}

productTabs.forEach(button => button.addEventListener('click', () => setProduct(button.dataset.product)));

window.addEventListener('hashchange', function(){
  if(location.hash.indexOf('#finance/') === 0){
    const requested = location.hash.split('/')[1];
    selectFinanceRoute(requested);
    if(product !== 'finance') setProduct('finance'); else render();
  } else if(product === 'finance') setProduct('habits');
});

function lockFinanceSections(){
  financeUnlocked={budget:false,wealth:false};
  financePinMode={budget:'',wealth:''};
  financePinMessage={budget:'',wealth:''};
}

function selectFinanceRoute(requested){
  // Unlocking lasts only for this visit, never across main-page navigation.
  lockFinanceSections();
  if(['networth','assets','passives'].includes(requested)){ wealthTab=requested; page='wealth'; return; }
  if(pageMeta[requested]) page=requested;
}

window.addEventListener('ultra-auth', function(event){
  if(LOCAL_PREVIEW) return;
  client = event.detail && event.detail.client || window.ULTRA_SUPABASE || client;
  user = event.detail && event.detail.user || null;
  if(!user){ F = null; loading = false; lockFinanceSections(); render(); return; }
  if(F) refreshFinance(); else loadFinance();
});

async function connect(){
  if(LOCAL_PREVIEW){
    if(F && user) return;
    loading=true; syncLabel='Opening local preview'; syncTone='busy'; render();
    try{
      let value=null;
      try{ value=JSON.parse(localStorage.getItem(LOCAL_PREVIEW_KEY)||'null'); }catch(error){}
      if(!value){
        const response=await fetch('finance-local-data.json',{cache:'no-store'});
        if(!response.ok) throw new Error('Local preview data is missing');
        value=await response.json();
      }
      F=normaliseFinance(value); user={id:'local-preview'};
      syncLabel='Local preview saved'; syncTone='on'; loadError=false;
    }catch(error){ loadError=true; syncLabel='Preview error'; syncTone='bad'; }
    loading=false; render(); return;
  }
  if(client && user) return;
  client = window.ULTRA_SUPABASE || client;
  if(!client){
    syncLabel = 'Connecting'; syncTone = 'busy';
    setTimeout(function(){ if(product === 'finance') connect(); }, 450);
    return;
  }
  try{
    const result = await client.auth.getSession();
    user = result.data.session && result.data.session.user;
    if(user && !F) loadFinance(); else render();
  }catch(error){ syncLabel = 'Connection error'; syncTone = 'bad'; render(); }
}

async function loadFinance(){
  if(!client || !user || loading) return;
  loading = true; loadError = false; syncLabel = 'Loading securely'; syncTone = 'busy'; render();
  try{
    const result = await client.from('finance_state').select('state,updated_at').eq('user_id',user.id).maybeSingle();
    if(result.error) throw result.error;
    F = normaliseFinance(result.data && result.data.state);
    if(result.data && result.data.updated_at) F.updatedAt = result.data.updated_at;
    syncLabel = 'Private cloud saved'; syncTone = 'on';
    if(!result.data) await saveFinance(true);
  }catch(error){
    loadError = true;
    syncLabel = 'Finance sync error'; syncTone = 'bad';
  }finally{ loading = false; render(); }
}

async function refreshFinance(){
  if(LOCAL_PREVIEW) return;
  if(!client || !user || !F || loading || saveTimer) return;
  try{
    const result = await client.from('finance_state').select('state,updated_at').eq('user_id',user.id).maybeSingle();
    if(result.error || !result.data) return;
    const remoteTime=Date.parse(result.data.updated_at||0)||0;
    const localTime=Date.parse(F.updatedAt||0)||0;
    if(remoteTime>localTime){
      F=normaliseFinance(result.data.state);
      F.updatedAt=result.data.updated_at;
      syncLabel='Updated from private cloud'; syncTone='on';
      render(); toast('Updated from another device');
    }
  }catch(error){}
}

function scheduleSave(){
  clearTimeout(saveTimer);
  syncLabel = 'Saving'; syncTone = 'busy'; renderSync();
  saveTimer = setTimeout(() => saveFinance(false), 350);
}

async function saveFinance(silent){
  clearTimeout(saveTimer); saveTimer=null;
  if(LOCAL_PREVIEW){
    if(!F) return;
    F.updatedAt=new Date().toISOString();
    try{
      localStorage.setItem(LOCAL_PREVIEW_KEY,JSON.stringify(F));
      syncLabel='Local preview saved'; syncTone='on';
      if(!silent) toast('Saved in this local preview');
    }catch(error){ syncLabel='Local save failed'; syncTone='bad'; }
    renderSync(); return;
  }
  if(!client || !user || !F) return;
  F.updatedAt = new Date().toISOString();
  syncLabel = 'Saving'; syncTone = 'busy'; renderSync();
  try{
    const payload = JSON.parse(JSON.stringify(F));
    const result = await client.from('finance_state').upsert({
      user_id:user.id,state:payload,updated_at:F.updatedAt
    },{onConflict:'user_id'});
    if(result.error) throw result.error;
    syncLabel = 'Private cloud saved'; syncTone = 'on';
    if(!silent) toast('Saved securely');
  }catch(error){
    syncLabel = 'Save failed'; syncTone = 'bad';
    if(!silent) toast('Could not save — try again');
  }
  renderSync();
}

function renderSync(){
  const el = $('#financeSync');
  if(!el) return;
  el.textContent = syncLabel;
  el.className = 'finance-sync'+(syncTone ? ' '+syncTone : '');
}

function toast(message){
  const old = $('.finance-toast');
  if(old) old.remove();
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'finance-toast'; el.textContent = message;
  document.body.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), 1900);
}

function currency(code){
  return (F && F.currencies || []).find(item => item.code === code) || {code:code || 'EUR',symbol:code || '€',eur:1};
}
function eurValue(amount, code){ return Number(amount || 0) * Number(currency(code).eur || 0); }
function currencyFlag(code){
  return ({EUR:'🇪🇺',USD:'🇺🇸',UAH:'🇺🇦',PLN:'🇵🇱',TRY:'🇹🇷',CZK:'🇨🇿',GBP:'🇬🇧',CAD:'🇨🇦'})[String(code||'EUR').toUpperCase()] || '🌐';
}
function financeEmoji(emoji){ return '<span class="finance-emoji" aria-hidden="true">'+emoji+'</span>'; }
function accountEmoji(item){
  const section=item?accountSectionKey(item):'cards';
  return section==='coins'?'🪙':section==='cash'?'💵':'💳';
}
function accountIcon(item){
  const name=String(item&&item.name||'').trim().toLowerCase();
  if(item && accountSectionKey(item)==='cards' && ['aib','mono','revolut'].includes(name)){
    return '<img class="account-logo" src="assets/'+name+'-logo.png" alt="" aria-hidden="true" width="32" height="32" decoding="async">';
  }
  return financeEmoji(accountEmoji(item));
}
function currencyLabel(code){ return financeEmoji(currencyFlag(code))+' '+esc(code||'EUR'); }
function euroEstimate(amount,code,className){
  return String(code||'EUR').toUpperCase()==='EUR'?'':'<span class="'+className+'">≈ '+euro(eurValue(amount,code))+'</span>';
}
function money(amount, code){
  const item = currency(code);
  const value = Number(amount || 0);
  return item.symbol + new Intl.NumberFormat('en-IE',{minimumFractionDigits:Math.abs(value)<100?2:0,maximumFractionDigits:2}).format(value);
}
function euro(amount){
  return new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(amount || 0));
}
function compactEuro(amount){
  const value=Number(amount||0);
  if(Math.abs(value)>=1000) return '€'+(value/1000).toFixed(value>=10000?0:1)+'k';
  return '€'+new Intl.NumberFormat('en-IE',{minimumFractionDigits:value<10?2:0,maximumFractionDigits:2}).format(value);
}
function options(items, selected, valueKey, label){
  return items.map(item => '<option value="'+esc(item[valueKey])+'"'+(String(item[valueKey])===String(selected)?' selected':'')+'>'+esc(label(item))+'</option>').join('');
}
function dateLabel(key){
  if(!key) return '';
  const d = new Date(key+'T12:00:00');
  return new Intl.DateTimeFormat('en-IE',{day:'numeric',month:'short',year:'numeric'}).format(d);
}
function accountTotal(){ return F.accounts.reduce((sum,item) => sum + eurValue(item.balance,item.currency),0); }
function assetsTotal(){ return F.assets.reduce((sum,item) => sum + eurValue(item.value,item.currency),0); }
function passiveTotal(){ return F.passives.reduce((sum,item) => sum + eurValue(item.value,item.currency),0); }
function monthKey(key){ return String(key || '').slice(0,7); }
function currentMonth(){ return todayKey().slice(0,7); }
function monthStats(key){
  return F.transactions.filter(item => monthKey(item.date) === key).reduce((sum,item) => {
    const value = item.eurAmount != null ? Number(item.eurAmount) : eurValue(item.amount,item.currency);
    sum[item.type] += value;
    return sum;
  },{income:0,expense:0});
}
function priorMonthKeys(count){
  const now = new Date(todayKey()+'T12:00:00');
  const keys=[];
  for(let i=count;i>=1;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    keys.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
  }
  return keys;
}
function averagePreviousExpenses(){
  const keys=priorMonthKeys(3);
  if(!keys.length) return 0;
  const live=keys.map(key=>monthStats(key).expense);
  if(live.some(value=>value>0)) return live.reduce((sum,value)=>sum+value,0)/live.length;
  const months=F&&F.historicalAnalytics&&F.historicalAnalytics.months||[];
  return months.length?months.reduce((sum,item)=>sum+Number(item.total||0),0)/months.length:0;
}
function historicalSpendingSummary(){
  const history=F.historicalAnalytics||HISTORICAL_SPENDING_2025, months=history.months||[];
  const total=months.reduce((sum,item)=>sum+Number(item.total||0),0);
  const groups=(history.groups||[]).map(group=>{
    const values=months.map(month=>Number(month.groups&&month.groups[group.id]||0));
    const groupTotal=values.reduce((sum,value)=>sum+value,0);
    return Object.assign({},group,{values:values,total:groupTotal,average:months.length?groupTotal/months.length:0,share:total?groupTotal/total*100:0});
  });
  return {history:history,months:months,total:total,average:months.length?total/months.length:0,groups:groups};
}
function historicalBaselineEditor(summary){
  const amountForm=summary.groups.length
    ? '<form data-historical-baseline-form><div class="historical-editor-note"><div><b>Enter category totals</b><span>Monthly totals and averages are calculated automatically.</span></div><button class="f-submit" type="submit">Save baseline</button></div>'
      +'<div class="historical-editor-scroll"><div class="historical-editor-grid"><div class="historical-editor-heading">Category</div>'
      +summary.months.map(month=>'<div class="historical-editor-heading">'+esc(month.label)+' 2025</div>').join('')
      +summary.groups.map(group=>'<div class="historical-editor-category"><span>'+esc(group.emoji)+'</span><b>'+esc(group.name)+'</b><button type="button" data-delete-historical-category="'+esc(group.id)+'" aria-label="Delete '+esc(group.name)+' historical category">×</button></div>'
        +summary.months.map((month,index)=>'<label class="historical-editor-money"><span>€</span><input class="f-input" name="history__'+esc(group.id)+'__'+esc(month.key)+'" type="number" min="0" step="0.01" inputmode="decimal" value="'+esc(Number(group.values[index]||0).toFixed(2))+'" aria-label="'+esc(group.name)+' in '+esc(month.label)+' 2025"></label>').join('')).join('')
      +'</div></div></form>'
    : '<div class="historical-editor-empty">No historical categories yet. Add your first one below.</div>';
  return '<details class="historical-editor"><summary>Edit Sep–Nov baseline</summary>'+amountForm
    +'<form class="historical-category-add" data-historical-category-form><input class="f-input" name="name" required placeholder="New historical category"><input class="f-input" name="emoji" maxlength="4" placeholder="Emoji (auto)"><button class="f-secondary" type="submit">Add category</button></form></details>';
}
function updateHistoricalBaseline(form){
  const data=new FormData(form), history=F.historicalAnalytics;
  if(!history||!Array.isArray(history.months)||!Array.isArray(history.groups)) return;
  history.months.forEach(month=>{
    if(!month.groups||typeof month.groups!=='object') month.groups={};
    month.total=history.groups.reduce((sum,group)=>{
      const value=Math.max(0,Number(data.get('history__'+group.id+'__'+month.key)||0));
      month.groups[group.id]=Number.isFinite(value)?Math.round(value*100)/100:0;
      return sum+month.groups[group.id];
    },0);
    month.total=Math.round(month.total*100)/100;
  });
  history.version=2;
  scheduleSave(); render(); toast('Historical baseline saved');
}
function addHistoricalCategory(form){
  const data=new FormData(form), name=String(data.get('name')||'').trim(), history=F.historicalAnalytics;
  if(!name||!history||!Array.isArray(history.groups)) return;
  if(history.groups.some(group=>String(group.name||'').trim().toLowerCase()===name.toLowerCase())){ toast('That historical category already exists'); return; }
  const id=uid('history_group');
  history.groups.push({id:id,name:name,emoji:String(data.get('emoji')||'').trim()||categoryEmoji(name),color:BUDGET_COLORS[history.groups.length%BUDGET_COLORS.length],transactions:0});
  history.months.forEach(month=>{ if(!month.groups||typeof month.groups!=='object') month.groups={}; month.groups[id]=0; });
  scheduleSave(); render(); toast(name+' historical category added');
}
function removeHistoricalCategory(id){
  const history=F.historicalAnalytics, group=history&&history.groups&&history.groups.find(item=>item.id===id);
  if(!group) return;
  history.groups=history.groups.filter(item=>item.id!==id);
  history.months.forEach(month=>{
    if(month.groups&&typeof month.groups==='object') delete month.groups[id];
    month.total=history.groups.reduce((sum,item)=>sum+Number(month.groups&&month.groups[item.id]||0),0);
    month.total=Math.round(month.total*100)/100;
  });
  scheduleSave(); render(); toast(group.name+' historical category deleted');
}
function recurringTotal(){ return F.recurring.reduce((sum,item)=>sum+eurValue(item.amount,item.currency),0); }
function plannedTotal(){ return F.planned.filter(item=>item.status!=='paid').reduce((sum,item)=>sum+eurValue(item.amount,item.currency),0); }

function dayKey(date){ return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'); }
function monthBudgetWeeks(key){
  const parts=key.split('-').map(Number), last=new Date(parts[0],parts[1],0), weeks=[];
  let cursor=new Date(parts[0],parts[1]-1,1);
  while(cursor<=last){
    const start=new Date(cursor), mondayOffset=(cursor.getDay()+6)%7;
    const end=new Date(cursor); end.setDate(end.getDate()+Math.min(6-mondayOffset,Math.round((last-end)/86400000)));
    weeks.push({key:dayKey(start),start:dayKey(start),end:dayKey(end)});
    cursor=new Date(end); cursor.setDate(cursor.getDate()+1);
  }
  return weeks;
}
function budgetPeriod(){
  const month=currentMonth(), weeks=monthBudgetWeeks(month), today=todayKey();
  let index=weeks.findIndex(week=>week.start<=today&&week.end>=today);
  if(index<0) index=Math.max(0,weeks.length-1);
  return {month:month,weeks:weeks,index:index,week:weeks[index]};
}
function budgetCategoryRef(item){
  return F.categories.find(category=>category.id===item.categoryId)
    || F.categories.find(category=>String(category.name||'').trim().toLowerCase()===String(item.name||'').trim().toLowerCase());
}
function budgetSpent(item,from,to){
  const category=budgetCategoryRef(item);
  if(!category) return 0;
  return F.transactions.reduce((sum,transaction)=>{
    if(transaction.type!=='expense'||transaction.categoryId!==category.id||transaction.date<from||transaction.date>to) return sum;
    return sum+(transaction.eurAmount!=null?Number(transaction.eurAmount):eurValue(transaction.amount,transaction.currency));
  },0);
}
function previousBudgetSpend(item,period){
  if(budgetMode==='month'){
    const parts=period.month.split('-').map(Number), first=new Date(parts[0],parts[1]-2,1), last=new Date(parts[0],parts[1]-1,0);
    return {label:'Last month spent',amount:budgetSpent(item,dayKey(first),dayKey(last))};
  }
  const today=new Date(todayKey()+'T12:00:00'), offset=(today.getDay()+6)%7;
  today.setDate(today.getDate()-offset);
  const previousEnd=new Date(today); previousEnd.setDate(previousEnd.getDate()-1);
  const previousStart=new Date(previousEnd); previousStart.setDate(previousStart.getDate()-6);
  return {label:'Last week spent',amount:budgetSpent(item,dayKey(previousStart),dayKey(previousEnd))};
}
function ensureBudgetPeriod(){
  const budget=F.budget, period=budgetPeriod();
  const monthStart=period.month+'-01', monthEnd=period.weeks[period.weeks.length-1].end;
  const spent=budget.categories.reduce((sum,item)=>sum+budgetSpent(item,monthStart,monthEnd),0);
  if(budget.monthlyBudgets[period.month]==null) budget.monthlyBudgets[period.month]=Math.max(0,accountTotal()+spent);
  if(!budget.monthlyAssignments[period.month]){
    const assignments={};
    let available=Math.max(0,Number(budget.monthlyBudgets[period.month]||0));
    budget.categories.forEach(item=>{
      const amount=Math.min(Math.max(0,Number(item.target||0)),available);
      assignments[item.id]=amount; available-=amount;
    });
    budget.monthlyAssignments[period.month]=assignments;
  }
  const assignments=budget.monthlyAssignments[period.month];
  let available=Math.max(0,Number(budget.monthlyBudgets[period.month]||0)-budget.categories.reduce((sum,item)=>sum+Math.max(0,Number(assignments[item.id]||0)),0));
  budget.categories.forEach(item=>{
    if(assignments[item.id]!=null) return;
    const amount=Math.min(Math.max(0,Number(item.target||0)),available);
    assignments[item.id]=amount; available-=amount;
  });
  period.weeks.forEach(week=>{
    if(!budget.weeklyPlans[week.key]) budget.weeklyPlans[week.key]={};
    budget.categories.forEach(item=>{
      if(budget.weeklyPlans[week.key][item.id]==null){
        budget.weeklyPlans[week.key][item.id]=Number(assignments[item.id]||0)/period.weeks.length;
      }
    });
  });
  return period;
}
function budgetMonthSpend(item,period){ return budgetSpent(item,period.month+'-01',period.weeks[period.weeks.length-1].end); }
function budgetAssignedTotal(period){
  const assignments=F.budget.monthlyAssignments[period.month]||{};
  return F.budget.categories.reduce((sum,item)=>sum+Math.max(0,Number(assignments[item.id]||0)),0);
}
function budgetMonthlyTotal(period){ return Math.max(0,Number(F.budget.monthlyBudgets[period.month]||0)); }
function budgetFreeMoney(period){
  return budgetMonthlyTotal(period)-budgetAssignedTotal(period);
}
function setBudgetMonthlyTotal(value){
  const period=ensureBudgetPeriod(), assigned=budgetAssignedTotal(period);
  F.budget.monthlyBudgets[period.month]=Math.max(assigned,Number(value||0));
}
function weeklyBudgetDetails(item,period){
  let carry=0;
  for(let i=0;i<period.index;i++){
    const week=period.weeks[i], plan=Number(F.budget.weeklyPlans[week.key][item.id]||0);
    carry+=plan-budgetSpent(item,week.start,week.end);
  }
  const plan=Number(F.budget.weeklyPlans[period.week.key][item.id]||0);
  const spent=budgetSpent(item,period.week.start,period.week.end);
  return {plan:plan,carry:carry,available:plan+carry,spent:spent,remaining:plan+carry-spent};
}
function setBudgetAllocation(categoryId,value,mode){
  const period=ensureBudgetPeriod(), budget=F.budget, assignments=budget.monthlyAssignments[period.month];
  const item=budget.categories.find(category=>category.id===categoryId);
  if(!item) return;
  const free=Math.max(0,budgetFreeMoney(period));
  if(mode==='week'){
    const plans=budget.weeklyPlans[period.week.key], oldPlan=Number(plans[categoryId]||0);
    const oldAssigned=Number(assignments[categoryId]||0), spent=budgetMonthSpend(item,period);
    const requested=Math.min(oldPlan+free,Math.max(0,value));
    const nextAssigned=Math.max(spent,oldAssigned+(requested-oldPlan));
    plans[categoryId]=Math.max(0,oldPlan+(nextAssigned-oldAssigned));
    assignments[categoryId]=nextAssigned;
  }else{
    const oldAssigned=Number(assignments[categoryId]||0), requested=Math.min(oldAssigned+free,Math.max(0,value));
    assignments[categoryId]=Math.max(budgetMonthSpend(item,period),requested);
    const fixed=period.weeks.slice(0,period.index).reduce((sum,week)=>sum+Number(budget.weeklyPlans[week.key][categoryId]||0),0);
    const open=period.weeks.slice(period.index), each=Math.max(0,assignments[categoryId]-fixed)/Math.max(1,open.length);
    open.forEach(week=>{ budget.weeklyPlans[week.key][categoryId]=each; });
  }
}

function shell(content){
  const title=pageMeta[page];
  const privacy=LOCAL_PREVIEW
    ? '<b>Local preview</b><br>Temporary edits stay only in this browser.'
    : '<b>Supabase protected</b><br>Only your signed-in account can read these figures.';
  const sync='<span class="finance-sync '+syncTone+'" id="financeSync" role="status">'+esc(syncLabel)+'</span>';
  const nav='<nav class="finance-nav" aria-label="Finance pages">'+navItems.map(item=>'<button data-fin-page="'+item[0]+'" class="'+(page===item[0]?'active':'')+'">'+item[1]+'</button>').join('')+'</nav>';
  return '<div class="finance-layout"><section class="finance-main">'
    +(['entry','home','analytics','wealth'].includes(page)?'':'<div class="finance-top"><div><h1>'+title[0]+'</h1><p>'+title[1]+'</p></div>'+sync+'</div>')
    +(['home','analytics'].includes(page)?'<div class="home-nav-row">'+nav+sync+'</div>':nav)
    +content+'<div class="finance-private">'+privacy+'</div></section></div>';
}

function pinRecord(section){
  return F&&F.security&&F.security[section+'Pin']||null;
}

function renderFinancePinGate(section){
  const label=section==='budget'?'Budget':'Wealth';
  const configured=!!pinRecord(section), changing=financePinMode[section]==='change';
  const action=!configured?'create':changing?'change':'unlock';
  const title=action==='create'?'Create your '+label+' PIN':action==='change'?'Change your '+label+' PIN':'Unlock '+label;
  const button=action==='create'?'Create PIN':action==='change'?'Save new PIN':'Unlock';
  const confirm=action==='unlock'?'':'<input class="f-input" name="confirmPin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="new-password" placeholder="Repeat PIN" aria-label="Repeat '+label+' PIN" required>';
  return '<section class="finance-section-lock"><div class="finance-pin-mark" aria-hidden="true">⌁</div><div class="f-kicker">'+esc(label)+' privacy</div><h2>'+esc(title)+'</h2>'
    +'<p>Use a separate 4–8 digit screen PIN. It is salted and hashed before it is saved; the PIN itself is never stored.</p>'
    +'<form class="finance-pin-form" data-finance-pin-form="'+section+'" data-pin-action="'+action+'"><input class="f-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="'+(action==='unlock'?'current-password':'new-password')+'" placeholder="'+(action==='unlock'?'PIN':'New PIN')+'" aria-label="'+esc(label)+' PIN" required>'+confirm+'<button class="f-submit">'+button+'</button></form>'
    +(changing?'<button class="finance-pin-cancel" type="button" data-cancel-finance-pin="'+section+'">Cancel</button>':'')
    +'<div class="finance-pin-message" role="status">'+esc(financePinMessage[section])+'</div><small class="finance-pin-note">Your Supabase sign-in remains the main protection for your private data.</small></section>';
}

function renderProtectedFinance(section,renderer){
  const configured=!!pinRecord(section);
  if(!configured||!financeUnlocked[section]||financePinMode[section]==='change') return renderFinancePinGate(section);
  const label=section==='budget'?'Budget':'Wealth';
  return '<div class="finance-security-toolbar"><span>'+label+' unlocked for this visit</span><div><button type="button" data-change-finance-pin="'+section+'">Change PIN</button><button type="button" data-lock-finance-section="'+section+'">Lock</button></div></div>'+renderer();
}

function pinSalt(){
  const bytes=new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function hashPin(pin,salt,iterations){
  if(!window.crypto||!window.crypto.subtle) throw new Error('Secure PIN hashing is not available in this browser.');
  const encoder=new TextEncoder();
  const key=await window.crypto.subtle.importKey('raw',encoder.encode(pin),'PBKDF2',false,['deriveBits']);
  const bits=await window.crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:Math.max(100000,Number(iterations||210000))},key,256);
  return Array.from(new Uint8Array(bits),byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function handleFinancePin(form){
  const section=form.dataset.financePinForm, action=form.dataset.pinAction;
  if(!['budget','wealth'].includes(section)) return;
  const data=new FormData(form), pin=String(data.get('pin')||'');
  if(!/^\d{4,8}$/.test(pin)){ financePinMessage[section]='Use 4–8 numbers only.'; render(); return; }
  try{
    if(action==='unlock'){
      const record=pinRecord(section);
      if(!record||await hashPin(pin,record.salt,record.iterations)!==record.hash){ financePinMessage[section]='That PIN is not correct.'; render(); return; }
      financeUnlocked[section]=true;
      financePinMessage[section]='';
      render();
      return;
    }
    if(pin!==String(data.get('confirmPin')||'')){ financePinMessage[section]='The two PINs do not match.'; render(); return; }
    const salt=pinSalt();
    const iterations=210000;
    F.security[section+'Pin']={algorithm:'PBKDF2-SHA256',iterations:iterations,salt:salt,hash:await hashPin(pin,salt,iterations)};
    financeUnlocked[section]=true;
    financePinMode[section]='';
    financePinMessage[section]='';
    scheduleSave();
    render();
    toast((section==='budget'?'Budget':'Wealth')+' PIN saved');
  }catch(error){ financePinMessage[section]=error&&error.message||'Could not save this PIN.'; render(); }
}

function render(){
  if(product !== 'finance') return;
  if(loading){ app.innerHTML='<div class="finance-loading">Loading your private finance data…</div>'; return; }
  if(!user){
    app.innerHTML='<section class="finance-lock"><div class="lock-mark">●</div><h1>Your finances stay private</h1>'
      +'<p>Sign in with the same Supabase account used for Habits. Financial figures are never stored in the public page or this browser.</p>'
      +'<form class="finance-signin" id="financeSignin"><input class="f-input" id="financeEmail" type="email" autocomplete="email" placeholder="Email" required><input class="f-input" id="financePassword" type="password" autocomplete="current-password" minlength="6" placeholder="Password" required><button class="f-submit" '+(signingIn?'disabled':'')+'>'+(signingIn?'Unlocking…':'Unlock myFinances')+'</button><div class="finance-signin-message">'+esc(signMessage)+'</div></form></section>';
    return;
  }
  if(loadError && !F){
    app.innerHTML='<section class="finance-lock"><div class="lock-mark">!</div><h1>Could not load myFinances</h1><p>Your figures remain safe in Supabase. Check the connection and try again.</p><button class="f-submit" data-retry-finance>Try again</button></section>';
    return;
  }
  if(!F){ app.innerHTML='<div class="finance-loading">Preparing myFinances…</div>'; return; }
  const pages={entry:renderEntry,home:()=>renderProtectedFinance('budget',renderHome),wealth:()=>renderProtectedFinance('wealth',renderWealth),networth:()=>renderProtectedFinance('wealth',renderNetWorth),assets:()=>renderProtectedFinance('wealth',renderAssets),passives:()=>renderProtectedFinance('wealth',renderPassives),planning:renderPlanning,analytics:renderAnalytics,other:renderOther};
  app.innerHTML=shell(pages[page]());
  renderSync();
}

function entryExpenseCategories(){
  const ids=(F.budget&&Array.isArray(F.budget.categories)?F.budget.categories:[]).map(item=>item.categoryId);
  return ids.map(id=>F.categories.find(category=>category.id===id&&category.type==='expense')).filter(Boolean);
}
function renderEntry(){
  const cats=entryExpenseCategories();
  if(!entryDraft.currency) entryDraft.currency=F.baseCurrency||'EUR';
  if(!entryDraft.accountId && F.accounts[0]) entryDraft.accountId=F.accounts[0].id;
  if(!cats.some(item=>item.id===entryDraft.categoryId) && cats[0]) entryDraft.categoryId=cats[0].id;
  if(!entryDraft.sourceId && F.sources[0]) entryDraft.sourceId=F.sources[0].id;
  if(!entryDraft.date) entryDraft.date=todayKey();
  const selectedKind=entryType==='expense'?cats.find(x=>x.id===entryDraft.categoryId):F.sources.find(x=>x.id===entryDraft.sourceId);
  const selectedAccount=F.accounts.find(x=>x.id===entryDraft.accountId), selectedCurrency=currency(entryDraft.currency);
  const recent=F.transactions.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,6);
  const kindLabel=entryType==='expense'?'Category':'Income source';
  const kindIcon=entryType==='expense'?categoryEmoji(selectedKind&&selectedKind.name):'↗';
  return '<section class="entry-composer"><form class="money-entry '+entryType+'" id="entryForm">'
    +'<div class="entry-head"><div class="type-toggle"><button type="button" data-entry-type="expense" class="expense '+(entryType==='expense'?'active':'')+'">Expense</button><button type="button" data-entry-type="income" class="income '+(entryType==='income'?'active':'')+'">Income</button></div></div>'
    +'<label class="amount-line"><span class="amount-symbol">'+esc(selectedCurrency.symbol)+'</span><input class="amount-input" id="entryAmount" type="number" min="0.01" step="0.01" inputmode="decimal" value="'+esc(entryDraft.amount)+'" placeholder="0" aria-label="Amount"><span class="amount-code">'+esc(entryDraft.currency)+'</span></label>'
    +'<div class="entry-options">'
    +entryChoice('kind','category',kindIcon,kindLabel,selectedKind&&selectedKind.name||kindLabel)
    +entryChoice('account','account',accountIcon(selectedAccount),entryType==='expense'?'Pay from':'Send to',selectedAccount&&selectedAccount.name||'Choose storage')
    +entryChoice('currency','currency',financeEmoji(currencyFlag(entryDraft.currency)),'Currency',entryDraft.currency)
    +entryChoice('date','date','◷','Date',entryDraft.date===todayKey()?'Today':dateLabel(entryDraft.date))
    +entryChoice('note','note','＋','Note',entryDraft.note||'Add a note')+'</div>'
    +'<button class="entry-save '+entryType+'" type="submit"><span>Save</span><i>→</i></button></form></section>'
    +'<section class="recent-minimal"><div class="recent-title"><div><span class="entry-kicker">Activity</span><h2>Recent entries</h2></div><span>'+F.transactions.length+' total</span></div>'+(recent.length?'<div class="f-list">'+recent.map(transactionRow).join('')+'</div>':'<div class="f-empty">Your first entries will appear here.</div>')+'</section>'
    +entryModalHTML()+cashChangeModalHTML();
}

function entryChoice(field,tone,icon,label,value){
  return '<button type="button" class="choice-chip '+tone+'" data-entry-field="'+field+'" aria-label="'+esc(label)+': '+esc(value)+'"><span class="chip-icon">'+icon+'</span><span class="chip-copy">'+(field==='note'?'<small>'+esc(label)+'</small>':'')+'<b>'+esc(value)+'</b></span><span class="chip-arrow">›</span></button>';
}

function entryModalHTML(){
  if(!entryModal) return '';
  const close='<button class="modal-close" type="button" data-close-entry-modal aria-label="Close">×</button>';
  let title='',body='';
  if(entryModal==='kind'){
    const isExpense=entryType==='expense', items=isExpense?entryExpenseCategories():F.sources, field=isExpense?'categoryId':'sourceId', current=entryDraft[field];
    title=isExpense?'Choose category':'Choose income source';
    body='<div class="choice-list">'+items.map(item=>'<button type="button" class="choice-option '+(item.id===current?'selected':'')+'" data-entry-choice="'+field+'" data-value="'+esc(item.id)+'"><span class="emoji">'+(isExpense?categoryEmoji(item.name):'↗')+'</span><span>'+esc(item.name)+'</span><small>'+(isExpense?'Expense':(Number(item.monthly)?money(item.monthly,item.currency||'EUR')+'/mo':'Variable'))+'</small></button>').join('')+'</div>'
      +'<div class="modal-divider"></div>'+(isExpense
        ? '<form class="modal-form category-form" data-entry-modal-add="category"><input class="f-input" name="name" required placeholder="New expense category"><input class="f-input" name="emoji" maxlength="4" placeholder="Emoji (auto)"><input class="f-input" name="amount" type="number" min="0" step="0.01" placeholder="Monthly envelope €"><button class="f-submit">Add category</button></form>'
        : '<form class="modal-form three" data-entry-modal-add="source"><input class="f-input" name="name" required placeholder="New income source"><input class="f-input" name="monthly" type="number" min="0" step="0.01" placeholder="Monthly €"><button class="f-submit">Add</button></form>');
  }else if(entryModal==='account'){
    title=entryType==='expense'?'Pay from':'Send to';
    const commonAccounts=F.accounts.filter(item=>!isInfrequentAccount(item));
    const infrequentAccounts=F.accounts.filter(isInfrequentAccount);
    body='<div class="choice-list">'+commonAccounts.map(accountChoice).join('')+'</div>'
      +(infrequentAccounts.length?'<details class="more-choices"><summary><span>＋ More accounts</span><small>'+infrequentAccounts.length+'</small></summary><div class="choice-list">'+infrequentAccounts.map(accountChoice).join('')+'</div></details>':'')
      +'<div class="modal-divider"></div><form class="modal-form three" data-entry-modal-add="account"><input class="f-input" name="name" required placeholder="New storage"><select class="f-select" name="currency">'+options(F.currencies,'EUR','code',item=>item.code)+'</select><button class="f-submit">Add</button></form>';
  }else if(entryModal==='currency'){
    title='Choose currency';
    const frequentCurrencyCodes=new Set([F.baseCurrency||'EUR','UAH']);
    const everydayCurrencies=F.currencies.filter(item=>frequentCurrencyCodes.has(item.code));
    const infrequentCurrencies=F.currencies.filter(item=>!frequentCurrencyCodes.has(item.code));
    body='<div class="choice-list">'+everydayCurrencies.map(currencyChoice).join('')+'</div>'
      +(infrequentCurrencies.length?'<details class="more-choices"><summary><span>＋ More currencies</span><small>'+infrequentCurrencies.length+'</small></summary><div class="choice-list">'+infrequentCurrencies.map(currencyChoice).join('')+'</div></details>':'');
  }else if(entryModal==='date'){
    title='Choose date'; body='<form class="modal-form" data-entry-modal-apply="date"><input class="f-input" name="date" type="date" value="'+esc(entryDraft.date)+'" required><button class="f-submit">Apply</button></form>';
  }else{
    title='Add a note'; body='<form class="modal-form" data-entry-modal-apply="note"><input class="f-input" name="note" maxlength="100" value="'+esc(entryDraft.note)+'" placeholder="Optional detail"><button class="f-submit">Apply</button></form>';
  }
  return '<div class="entry-modal-backdrop" data-entry-modal-backdrop><section class="entry-modal" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="modal-head"><h2>'+esc(title)+'</h2>'+close+'</div>'+body+'</section></div>';
}

function cashChangeModalHTML(){
  if(!cashChangePrompt) return '';
  const close='<button class="modal-close" type="button" data-cash-change-no aria-label="Close">×</button>';
  if(cashChangePrompt.step==='amount'){
    return '<div class="entry-modal-backdrop" data-cash-change-backdrop><section class="entry-modal change-modal" role="dialog" aria-modal="true" aria-label="Add cash change"><div class="modal-head"><h2>Add your change</h2>'+close+'</div><div class="change-coin">🪙</div><p>Enter the coin amount in euros and cents.</p><form data-cash-change-form><label class="cents-input"><span class="change-symbol">€</span><input name="changeAmount" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="Change amount in euros" required autofocus><span class="change-code">EUR</span></label><button class="change-primary" type="submit">Add to Coins · euro cup</button></form></section></div>';
  }
  return '<div class="entry-modal-backdrop" data-cash-change-backdrop><section class="entry-modal change-modal" role="dialog" aria-modal="true" aria-label="Cash change"><div class="modal-head"><h2>Cash payment saved</h2>'+close+'</div><div class="change-coin">🪙</div><h3>Did you receive any coins?</h3><p>If yes, I’ll move the change from Cash · euros into Coins · euro cup.</p><div class="change-actions"><button class="f-secondary" type="button" data-cash-change-no>No coins</button><button class="change-primary" type="button" data-cash-change-yes>Yes, add change</button></div></section></div>';
}

function isInfrequentAccount(item){
  const name=String(item.name||'').trim().toLowerCase();
  return name.startsWith('coins') || (name.startsWith('cash') && String(item.currency||'EUR').toUpperCase()!=='EUR');
}

function accountChoice(item){
  return '<button type="button" class="choice-option '+(item.id===entryDraft.accountId?'selected':'')+'" data-entry-choice="accountId" data-value="'+esc(item.id)+'"><span class="emoji" aria-hidden="true">'+accountIcon(item)+'</span><span>'+esc(item.name)+'</span><small class="choice-balance">'+financeEmoji(currencyFlag(item.currency))+' '+money(item.balance,item.currency)+euroEstimate(item.balance,item.currency,'choice-estimate')+'</small></button>';
}

function currencyChoice(item){
  return '<button type="button" class="choice-option '+(item.code===entryDraft.currency?'selected':'')+'" data-entry-choice="currency" data-value="'+esc(item.code)+'"><span class="emoji" aria-hidden="true">'+currencyFlag(item.code)+'</span><span>'+esc(item.code)+'</span>'+(item.code==='EUR'?'':'<small>≈ '+euro(item.eur)+'</small>')+'</button>';
}

function categoryEmoji(name){
  const value=String(name||'').toLowerCase();
  const rules=[
    [/rent|housing|home|mortgage/,'🏠'],[/food|grocery|restaurant|eating/,'🍽️'],
    [/health|doctor|medical|medicine|pharmacy/,'🩺'],[/transport|driving|car|fuel|taxi|bus|train/,'🚗'],
    [/subscription|software|cloud|spotify|service/,'🔁'],[/invest|stock|crypto/,'📈'],
    [/personal|shopping|clothes|beauty/,'🛍️'],[/education|book|study|course/,'📚'],
    [/travel|flight|hotel/,'✈️'],[/gift/,'🎁'],[/bill|utilities|electric|internet|phone/,'💡'],
    [/entertainment|movie|game/,'🎮']
  ];
  const match=rules.find(rule=>rule[0].test(value));
  return match?match[1]:'🧾';
}

function transactionRow(item){
  const cat=F.categories.find(x=>x.id===item.categoryId), source=F.sources.find(x=>x.id===item.sourceId), account=F.accounts.find(x=>x.id===item.accountId);
  const title=item.type==='expense'?(cat&&cat.name||'Expense'):(source&&source.name||'Income');
  const marker=item.type==='expense'?'<span class="f-row-emoji">'+categoryEmoji(title)+'</span>':'<i class="f-dot income"></i>';
  return '<div class="f-row">'+marker+'<div class="f-row-main"><b>'+esc(title)+'</b><span>'+esc(dateLabel(item.date))+(account?' · '+esc(account.name):'')+(item.note?' · '+esc(item.note):'')+'</span></div>'
    +'<div class="f-row-amount '+(item.type==='income'?'f-positive':'f-negative')+'">'+(item.type==='income'?'+':'−')+money(item.amount,item.currency)+'</div><button data-delete="transaction" data-id="'+esc(item.id)+'" aria-label="Delete">×</button></div>';
}

function budgetRangeLabel(period){
  const format=key=>new Intl.DateTimeFormat('en-IE',{day:'numeric',month:'short'}).format(new Date(key+'T12:00:00'));
  return budgetMode==='week' ? format(period.week.start)+'–'+format(period.week.end) : new Intl.DateTimeFormat('en-IE',{month:'long',year:'numeric'}).format(new Date(period.month+'-01T12:00:00'));
}
function budgetCircleAllocation(input){
  const entered=Math.max(0,Number(input.value||0)), sign=Number(input.dataset.budgetCircleSign||1);
  const baseAmount=Number(input.dataset.budgetBaseAmount||0), baseRemaining=Number(input.dataset.budgetBaseRemaining||0);
  return Math.max(0,baseAmount+(entered*sign-baseRemaining));
}
function budgetCategoryCard(item,period,free){
  const color=/^#[0-9a-f]{6}$/i.test(String(item.color||''))?item.color:'#7359B6';
  const assigned=Number(F.budget.monthlyAssignments[period.month][item.id]||0), monthSpent=budgetMonthSpend(item,period);
  const weekly=weeklyBudgetDetails(item,period), isWeek=budgetMode==='week';
  const amount=isWeek?weekly.plan:assigned, funds=isWeek?weekly.available:assigned, spent=isWeek?weekly.spent:monthSpent;
  const remaining=funds-spent, overspent=remaining<0;
  const previous=previousBudgetSpend(item,period);
  const progress=Math.max(0,Math.min(100,spent/Math.max(funds,spent,1)*100));
  const min=isWeek?0:Math.min(amount,spent), max=Math.max(min,Math.ceil((amount+Math.max(0,free))/5)*5);
  return '<article class="budget-envelope '+(overspent?'overspent':'')+'" style="--budget-color:'+color+';--budget-progress:'+progress.toFixed(1)+'%">'
    +'<div class="budget-envelope-head"><span class="budget-emoji" aria-hidden="true">'+esc(item.emoji)+'</span><div><h3>'+esc(item.name)+'</h3><span>'+(isWeek?'Weekly envelope':'Monthly envelope')+'</span></div><button type="button" class="budget-envelope-delete" data-delete-budget-envelope="'+esc(item.id)+'" aria-label="Delete '+esc(item.name)+' envelope">×</button></div>'
    +'<div class="budget-pie"><div class="budget-pie-center"><small>'+(overspent?'Over by':'Left')+'</small><label class="budget-pie-value"><span aria-hidden="true">€</span><input type="number" min="0" step="0.01" value="'+Math.abs(remaining).toFixed(2)+'" data-budget-circle-input="'+esc(item.id)+'" data-budget-mode="'+budgetMode+'" data-budget-base-amount="'+amount.toFixed(2)+'" data-budget-base-remaining="'+remaining.toFixed(2)+'" data-budget-circle-sign="'+(overspent?'-1':'1')+'" inputmode="decimal" aria-label="Edit '+(overspent?'amount over budget':'money left')+' for '+esc(item.name)+'"></label></div></div>'
    +'<div class="budget-numbers"><span><small>'+(isWeek?'Available':'Assigned')+'</small><b>'+euro(funds)+'</b></span><span><small>Spent</small><b>'+euro(spent)+'</b></span></div>'
    +'<div class="budget-previous"><span>'+previous.label+'</span><b>'+euro(previous.amount)+'</b></div>'
    +'<div class="budget-slider-label"><span>'+(isWeek?'Plan this week':'Assign this month')+'</span><input type="range" min="'+min.toFixed(2)+'" max="'+max.toFixed(2)+'" step="5" value="'+amount.toFixed(2)+'" data-budget-slider="'+esc(item.id)+'" data-budget-mode="'+budgetMode+'" aria-label="Money assigned to '+esc(item.name)+'"></div></article>';
}
function renderBudgetWorkspace(){
  const period=ensureBudgetPeriod(), free=budgetFreeMoney(period), monthlyBudget=budgetMonthlyTotal(period);
  const isWeek=budgetMode==='week';
  const remainingAssigned=F.budget.categories.reduce((sum,item)=>{
    const left=isWeek?weeklyBudgetDetails(item,period).remaining:Number(F.budget.monthlyAssignments[period.month][item.id]||0)-budgetMonthSpend(item,period);
    return sum+Math.max(0,left);
  },0);
  const displayedBudget=isWeek?monthlyBudget/Math.max(1,period.weeks.length):monthlyBudget;
  const leftFromBudget=Math.max(0,displayedBudget-remainingAssigned), minimumBudget=budgetAssignedTotal(period);
  const budgetFigure=isWeek
    ? '<div class="budget-pool-value budget-pool-static"><strong>'+euro(displayedBudget)+'</strong></div>'
    : '<label class="budget-pool-value"><span aria-hidden="true">€</span><input type="number" min="'+minimumBudget.toFixed(2)+'" step="0.01" value="'+monthlyBudget.toFixed(2)+'" data-monthly-budget-input inputmode="decimal" aria-label="Edit monthly budget"></label>';
  return '<section class="f-card f-span-12 budget-workspace"><div class="budget-head"><div><span class="f-kicker">Give every euro a job</span><h2>My category budgets</h2><p>Move available money into the categories that need it most.</p></div>'
    +'<div class="budget-view-toggle" aria-label="Budget period"><button data-budget-view="month" class="'+(budgetMode==='month'?'active':'')+'">This month</button><button data-budget-view="week" class="'+(budgetMode==='week'?'active':'')+'">This week</button></div></div>'
    +'<div class="budget-pool '+(free<0?'negative':'')+'"><div><span>'+(isWeek?'Weekly budget':'Monthly budget')+'</span>'+budgetFigure+'</div><div class="budget-pool-facts"><span><small>Period</small><b>'+esc(budgetRangeLabel(period))+'</b></span><span><small>'+(isWeek?'Left this week':'Left from budget')+'</small><b>'+euro(leftFromBudget)+'</b></span><span><small>'+(isWeek?'Inside weekly envelopes':'Inside envelopes')+'</small><b>'+euro(remainingAssigned)+'</b></span></div></div>'
    +(F.budget.categories.length?'<div class="budget-envelopes">'+F.budget.categories.map(item=>budgetCategoryCard(item,period,free)).join('')+'</div>':'<div class="f-empty budget-empty">No envelopes yet. Add your first category below.</div>')
    +'<details class="add-disclosure budget-add-envelope"><summary>+ Add envelope</summary><form class="f-form" data-budget-envelope-form><div class="f-field"><label>Name</label><input class="f-input" name="name" required placeholder="e.g. Education"></div><div class="f-field"><label>Emoji</label><input class="f-input" name="emoji" maxlength="4" placeholder="Auto"></div><div class="f-field"><label>Initial monthly amount</label><input class="f-input" name="amount" type="number" min="0" step="0.01" value="0"></div><div class="f-form-actions"><button class="f-submit">Add envelope</button></div></form></details>'
    +'<p class="budget-note">Weekly overspending is carried into the next week, reducing what is available there. Money left over stays available and rolls forward.</p></section>';
}

function createBudgetEnvelope(name,emoji,target){
  name=String(name||'').trim();
  if(!name||F.budget.categories.some(item=>String(item.name||'').trim().toLowerCase()===name.toLowerCase())) return null;
  const id=uid('envelope'), categoryId=uid('cat_budget');
  const item={id:id,categoryId:categoryId,name:name,emoji:String(emoji||'').trim()||categoryEmoji(name),target:Math.max(0,Number(target||0)),color:BUDGET_COLORS[F.budget.categories.length%BUDGET_COLORS.length]};
  F.budget.categories.push(item);
  F.categories.push({id:categoryId,name:name,type:'expense'});
  ensureBudgetPeriod();
  return item;
}
function removeBudgetEnvelope(id){
  const item=F.budget.categories.find(category=>category.id===id);
  if(!item) return false;
  F.budget.categories=F.budget.categories.filter(category=>category.id!==id);
  if(!F.budget.deletedCategoryIds.includes(id)) F.budget.deletedCategoryIds.push(id);
  Object.values(F.budget.monthlyAssignments).forEach(assignments=>{ if(assignments&&typeof assignments==='object') delete assignments[id]; });
  Object.values(F.budget.weeklyPlans).forEach(plans=>{ if(plans&&typeof plans==='object') delete plans[id]; });
  return true;
}
function addBudgetEnvelope(form){
  const data=new FormData(form), name=String(data.get('name')||'').trim();
  const item=createBudgetEnvelope(name,data.get('emoji'),data.get('amount'));
  if(!item){ toast(name?'An envelope with that name already exists':'Enter an envelope name'); return; }
  scheduleSave(); render(); toast(item.name+' envelope added');
}

function renderHome(){
  const cards=F.accounts.filter(item=>accountSectionKey(item)==='cards');
  const cardTotal=cards.reduce((sum,item)=>sum+eurValue(item.balance,item.currency),0);
  const estimatedSpend=budgetAssignedTotal(ensureBudgetPeriod());
  const estimatedIncome=F.sources.reduce((sum,item)=>sum+eurValue(item.monthly,item.currency||'EUR'),0);
  return '<div class="finance-grid"><section class="f-card strong f-span-12 home-overview"><div class="home-metrics"><div><span>Card balances</span><b>'+euro(cardTotal)+'</b></div><div class="spend"><span>Estimated spending</span><b>'+euro(estimatedSpend)+'</b></div><div class="income"><span>Estimated income</span><b>'+euro(estimatedIncome)+'</b></div></div></section>'
    +'<section class="f-card f-span-12"><div class="f-card-head"><h2>Card balances</h2><span class="f-quiet">'+cards.length+' '+(cards.length===1?'account':'accounts')+'</span></div>'
    +(cards.length?'<div class="home-card-grid">'+cards.map(homeBalanceCard).join('')+'</div>':'<div class="f-empty">No card accounts yet.</div>')+'</section>'
    +renderBudgetWorkspace()
    +'<section class="f-card f-span-12 home-tools"><details><summary>Planning & expected expenses</summary>'+renderPlanning()+'</details><details><summary>Income sources & settings</summary>'+renderOther()+'</details></section></div>';
}

function homeBalanceCard(item){
  return '<article class="home-balance-card"><div class="home-card-top"><span class="home-card-mark" aria-hidden="true">'+accountIcon(item)+'</span><div><b>'+esc(item.name)+'</b><small>'+currencyLabel(item.currency)+' · '+esc(item.type||'account')+'</small></div></div><strong>'+money(item.balance,item.currency)+'</strong>'+euroEstimate(item.balance,item.currency,'account-eur')+'</article>';
}

function renderWealth(){
  const content=wealthTab==='assets'?renderAssets():wealthTab==='passives'?renderPassives():renderNetWorth();
  return '<div class="wealth-toolbar"><div class="wealth-tabs"><button data-wealth-tab="networth" class="'+(wealthTab==='networth'?'active':'')+'">Net worth</button><button data-wealth-tab="assets" class="'+(wealthTab==='assets'?'active':'')+'">Assets</button><button data-wealth-tab="passives" class="'+(wealthTab==='passives'?'active':'')+'">Passives</button></div></div>'+content;
}

function renderNetWorth(){
  const liquid=accountTotal(), invested=assetsTotal(), passives=passiveTotal(), gross=liquid+invested;
  return '<div class="finance-grid"><section class="f-card strong f-span-12"><div class="f-kicker">Gross balance</div><div class="networth-balance-line"><div class="f-big f-number">'+euro(gross)+'</div><span class="networth-passive-add">+ '+euro(passives)+'</span></div>'
    +'<div class="metric-grid networth-metrics"><div class="metric"><span>Accounts + cash</span><b>'+euro(liquid)+'</b></div><div class="metric"><span>Investments</span><b>'+euro(invested)+'</b></div><div class="metric passive-metric"><span>Passives</span><b>'+euro(passives)+'</b></div></div></section>'
    +'<section class="f-card f-span-12"><div class="f-card-head account-rates"><span class="f-quiet">Rates from '+esc(F.rateDate)+'</span></div>'
    +(F.accounts.length?accountSectionsHTML():'<div class="f-empty">Add your first account from the Entry page.</div>')+'</section></div>';
}

function accountSectionsHTML(){
  const sections=[
    {key:'cards',title:'Cards & banks'},
    {key:'cash',title:'Cash'},
    {key:'coins',title:'Coins'}
  ];
  return '<div class="account-sections">'+sections.map(section=>{
    const items=F.accounts.filter(item=>accountSectionKey(item)===section.key);
    if(!items.length) return '';
    const visible=items.filter(item=>isFeaturedAccount(item,section.key));
    const more=items.filter(item=>!isFeaturedAccount(item,section.key));
    return '<section class="account-section"><div class="account-section-head"><h3>'+section.title+'</h3><span>'+items.length+'</span></div>'
      +(visible.length?'<div class="account-grid">'+visible.map(accountCard).join('')+'</div>':'')
      +(more.length?'<details class="account-more"><summary><span>＋ More '+section.key+'</span><small>'+more.length+' '+(more.length===1?'account':'accounts')+'</small></summary><div class="account-grid">'+more.map(accountCard).join('')+'</div></details>':'')+'</section>';
  }).join('')+'</div>';
}

function accountSectionKey(item){
  const name=String(item.name||'').trim().toLowerCase();
  if(name.startsWith('coins') || String(item.type||'').toLowerCase()==='coins') return 'coins';
  if(name.startsWith('cash') || String(item.type||'').toLowerCase()==='cash') return 'cash';
  return 'cards';
}

function isFeaturedAccount(item,section){
  const name=String(item.name||'').toLowerCase().replace(/[·–—-]/g,' ').replace(/\s+/g,' ').trim();
  if(section==='cards') return ['revolut','aib','mono'].includes(name);
  if(section==='cash') return name==='cash euros' || name==='cash dollars';
  return name==='coins euro bag' || name==='coins euro cup';
}

function accountNameHTML(item){
  const name=String(item.name||'');
  const container=accountSectionKey(item)==='coins' && /\b(bag|cup)\s*$/i.exec(name);
  if(!container) return esc(name);
  const label=container[1].charAt(0).toUpperCase()+container[1].slice(1).toLowerCase();
  return esc(name.slice(0,container.index))+'<strong class="coin-container-name">'+label+'</strong>';
}

function accountCard(item){
  return '<article class="account"><div class="account-top"><b>'+accountIcon(item)+' '+accountNameHTML(item)+'</b><span>'+currencyLabel(item.currency)+'</span></div><div class="account-value">'+money(item.balance,item.currency)+'</div>'+euroEstimate(item.balance,item.currency,'account-eur')
    +'<details class="inline-disclosure"><summary>Edit balance</summary><div class="account-edit"><input class="f-input" type="number" step="0.01" value="'+esc(Number(item.balance||0).toFixed(2))+'" data-account-balance="'+esc(item.id)+'" aria-label="Balance in '+esc(item.currency||'EUR')+'"><button class="f-secondary" data-update-account="'+esc(item.id)+'">Save</button></div></details></article>';
}

function renderAssets(){
  const funded=F.assets.filter(item=>Number(item.value)>0), potential=F.assets.filter(item=>Number(item.value)<=0);
  const total=assetsTotal();
  return '<div class="finance-grid"><section class="f-card strong f-span-12 asset-overview"><div><div class="f-kicker">Portfolio value</div><div class="f-big">'+euro(total)+'</div></div></section>'
    +'<section class="f-card f-span-12 asset-positions-section" aria-label="Investments"><div class="f-card-head"><div class="f-kicker">Investments</div></div>'
    +(funded.length?'<div class="positions-grid">'+funded.map(item=>assetPositionCard(item,total)).join('')+'</div>':'<div class="f-empty">Add a funded asset to begin your portfolio.</div>')+'</section>'
    +(potential.length?'<section class="f-card f-span-12 potential-section"><div class="f-card-head"><h2>Assets — may generate money</h2></div><div class="potential-list">'+potential.map(item=>valueRow(item,'asset')).join('')+'</div></section>':'')
    +'<section class="f-card f-span-12 asset-add-actions"><details class="add-disclosure"><summary>+ Add investment</summary>'+addValueForm('asset','Investment name','Current position value')+'</details>'
    +'<details class="add-disclosure"><summary>+ Asset</summary><form class="f-form" data-value-form="asset" data-potential-asset><div class="f-field full"><label for="potentialAssetName">Name</label><input class="f-input" id="potentialAssetName" name="name" required maxlength="120" placeholder="Asset name"></div><div class="f-field full"><label for="potentialAssetNote">Note</label><input class="f-input" id="potentialAssetNote" name="note" maxlength="120" placeholder="Optional"></div><div class="f-form-actions"><button class="f-submit">Add asset</button></div></form></details></section></div>';
}

function investmentMark(item){
  const name=String(item.name||'').trim().toLowerCase().replace(/[\s_-]+/g,'');
  const brand=name==='binance'?'binance':name==='trading212'?'trading-212':'';
  if(brand) return '<span class="position-mark investment-brand '+brand+'" aria-hidden="true"><img src="assets/'+brand+'-logo.png" alt="" width="38" height="38" decoding="async"></span>';
  const initials=String(item.name||'A').split(/\s+/).map(word=>word.charAt(0)).join('').slice(0,2).toUpperCase();
  return '<span class="position-mark" aria-hidden="true">'+esc(initials)+'</span>';
}

function assetPositionCard(item,total){
  const current=eurValue(item.value,item.currency), allocation=total>0?current/total*100:0;
  return '<article class="position-card"><div class="position-top">'+investmentMark(item)+'<div class="position-name"><b>'+esc(item.name)+'</b></div>'
    +'<details class="row-disclosure"><summary aria-label="Edit '+esc(item.name)+'">•••</summary><div class="row-editor"><div class="f-inline-edit"><input class="f-input" type="number" min="0" step="0.01" value="'+esc(item.value||'')+'" placeholder="0" data-value-amount="asset_'+esc(item.id)+'"><button class="f-secondary" data-update-value="asset" data-id="'+esc(item.id)+'" aria-label="Save value">✓</button></div><button class="row-delete" data-delete="asset" data-id="'+esc(item.id)+'">Delete</button></div></details></div>'
    +'<div class="position-value">'+money(item.value,item.currency)+' <span class="value-approx" aria-label="approximate value" title="Approximate value">≈</span></div>'+euroEstimate(item.value,item.currency,'position-eur')
    +'<div class="allocation-head"><span>Portfolio allocation</span><b>'+allocation.toFixed(1)+'%</b></div><div class="allocation-track"><i style="width:'+Math.min(100,allocation)+'%"></i></div></article>';
}

function renderPassives(){
  const total=passiveTotal();
  return '<div class="finance-grid"><section class="f-card strong f-span-12 asset-overview passive-overview"><div><div class="f-kicker">Declared resale value</div><div class="f-big">'+euro(total)+'</div></div></section>'
    +'<section class="f-card f-span-12 asset-positions-section" aria-label="Possessions">'
    +(F.passives.length?'<div class="positions-grid passive-grid">'+F.passives.map(item=>passivePositionCard(item,total)).join('')+'</div>':'<div class="f-empty">Add a possession to begin tracking passives.</div>')+'</section>'
    +'<section class="f-card f-span-12"><details class="add-disclosure"><summary>+ Add possession</summary>'+addValueForm('passive','Possession name','Estimated resale value')+'</details></section></div>';
}

function passivePositionCard(item,total){
  const current=eurValue(item.value,item.currency), allocation=total>0?current/total*100:0;
  return '<article class="position-card passive-position"><div class="position-top"><div class="position-name"><b>'+esc(item.name)+'</b></div>'
    +'<details class="row-disclosure"><summary aria-label="Edit '+esc(item.name)+'">•••</summary><div class="row-editor"><div class="f-inline-edit"><input class="f-input" type="number" min="0" step="0.01" value="'+esc(item.value||'')+'" placeholder="0" data-value-amount="passive_'+esc(item.id)+'"><button class="f-secondary" data-update-value="passive" data-id="'+esc(item.id)+'" aria-label="Save value">✓</button></div><button class="row-delete" data-delete="passive" data-id="'+esc(item.id)+'">Delete</button></div></details></div>'
    +'<div class="position-value">'+money(item.value,item.currency)+'</div>'+(current>0?euroEstimate(item.value,item.currency,'position-eur'):'<div class="position-eur">Resale value not set</div>')
    +'<div class="allocation-head"><span>Share of declared value</span><b>'+(total>0?allocation.toFixed(1)+'%':'Not valued')+'</b></div><div class="allocation-track"><i style="width:'+Math.min(100,allocation)+'%"></i></div></article>';
}

function valueRow(item,kind){
  return '<div class="f-row"><i class="f-dot"></i><div class="f-row-main"><b>'+esc(item.name)+'</b><span>'+esc(item.kind||kind)+(item.note?' · '+esc(item.note):'')+'</span></div><b class="row-value">'+money(item.value,item.currency)+'</b>'
    +'<details class="row-disclosure"><summary aria-label="Edit '+esc(item.name)+'">•••</summary><div class="row-editor"><div class="f-inline-edit"><input class="f-input" type="number" min="0" step="0.01" value="'+esc(item.value||'')+'" placeholder="0" data-value-amount="'+esc(kind)+'_'+esc(item.id)+'"><button class="f-secondary" data-update-value="'+esc(kind)+'" data-id="'+esc(item.id)+'" aria-label="Save value">✓</button></div><button class="row-delete" data-delete="'+kind+'" data-id="'+esc(item.id)+'">Delete</button></div></details></div>';
}
function addValueForm(kind,namePlaceholder,valuePlaceholder){
  return '<form class="f-form" data-value-form="'+kind+'"><div class="f-field third"><label>Name</label><input class="f-input" name="name" required placeholder="'+namePlaceholder+'"></div><div class="f-field third"><label>'+valuePlaceholder+'</label><input class="f-input" name="value" type="number" min="0" step="0.01" placeholder="0"></div><div class="f-field third"><label>Currency</label><select class="f-select" name="currency">'+options(F.currencies,'EUR','code',item=>item.code)+'</select></div><div class="f-field full"><label>Note</label><input class="f-input" name="note" maxlength="120" placeholder="Optional"></div><div class="f-form-actions"><button class="f-submit">Add '+kind+'</button></div></form>';
}

function renderPlanning(){
  const recurring=recurringTotal(), average=averagePreviousExpenses(), planned=plannedTotal(), expected=recurring+average+planned;
  return '<div class="finance-grid"><section class="f-card strong f-span-12"><div class="f-kicker">Expected next month</div><div class="f-big">'+euro(expected)+'</div><div class="metric-grid planning-metrics"><div class="metric"><span>Known monthly</span><b>'+euro(recurring)+'</b></div><div class="metric"><span>3-month average</span><b>'+euro(average)+'</b></div><div class="metric"><span>Upcoming extras</span><b>'+euro(planned)+'</b></div></div></section>'
    +'<section class="f-card f-span-6"><div class="f-card-head"><div><div class="f-kicker">Every month</div><h2>Recurring expenses</h2></div></div>'+(F.recurring.length?'<div class="f-list">'+F.recurring.map(item=>planRow(item,'recurring')).join('')+'</div>':'<div class="f-empty">No recurring expenses.</div>')+'</section>'
    +'<section class="f-card f-span-6"><div class="f-card-head"><h2>Future expenses</h2></div>'+(F.planned.length?'<div class="f-list">'+F.planned.map(item=>planRow(item,'planned')).join('')+'</div>':'<div class="f-empty">No future expenses.</div>')+'</section>'
    +'<section class="f-card f-span-6"><details class="add-disclosure"><summary>+ Monthly expense</summary>'+planningForm('recurring','Add monthly expense')+'</details></section><section class="f-card f-span-6"><details class="add-disclosure"><summary>+ Future expense</summary>'+planningForm('planned','Add future expense')+'</details></section></div>';
}
function planRow(item,kind){
  return '<div class="f-row"><i class="f-dot expense"></i><div class="f-row-main"><b>'+esc(item.name)+'</b><span>'+(kind==='recurring'?'Monthly':esc(item.due||'Date not set'))+(item.note?' · '+esc(item.note):'')+'</span></div><b class="row-value">'+money(item.amount,item.currency)+'</b>'
    +'<details class="row-disclosure"><summary aria-label="Edit '+esc(item.name)+'">•••</summary><div class="row-editor"><div class="f-inline-edit"><input class="f-input" type="number" min="0" step="0.01" value="'+esc(item.amount||'')+'" placeholder="0" data-plan-amount="'+esc(kind)+'_'+esc(item.id)+'"><button class="f-secondary" data-update-plan="'+esc(kind)+'" data-id="'+esc(item.id)+'" aria-label="Save amount">✓</button></div><button class="row-delete" data-delete="'+kind+'" data-id="'+esc(item.id)+'">Delete</button></div></details></div>';
}
function planningForm(kind,title){
  return '<div class="f-card-head"><div><h2>'+title+'</h2></div></div><form class="f-form" data-plan-form="'+kind+'"><div class="f-field full"><label>Name</label><input class="f-input" name="name" required></div><div class="f-field"><label>Amount</label><input class="f-input" name="amount" type="number" min="0" step="0.01" placeholder="Can be added later"></div><div class="f-field"><label>Currency</label><select class="f-select" name="currency">'+options(F.currencies,'EUR','code',item=>item.code)+'</select></div>'+(kind==='planned'?'<div class="f-field full"><label>Expected date</label><input class="f-input" type="date" name="due"></div>':'')+'<div class="f-form-actions"><button class="f-submit">Add</button></div></form>';
}

function renderHistoricalAnalytics(){
  const summary=historicalSpendingSummary(), highestMonth=summary.months.reduce((best,item)=>!best||item.total>best.total?item:best,null), highest=highestMonth&&highestMonth.total>0?highestMonth:null;
  let selectedIndex=summary.months.findIndex(item=>item.key===historicalMonth);
  if(selectedIndex<0) selectedIndex=Math.max(0,summary.months.length-1);
  const selectedMonth=summary.months[selectedIndex]||{key:'',label:'Selected month',total:0};
  return '<section class="f-card f-span-12 historical-analytics"><div class="historical-head"><div><span class="f-kicker">Sep–Nov 2025 baseline</span><h2>Three months of spending</h2><p>Enter your private historical totals below. They are saved with the rest of your finance data.</p></div><div class="historical-totals"><span><small>3-month total</small><b>'+euro(summary.total)+'</b></span><span><small>Average month</small><b>'+euro(summary.average)+'</b></span></div></div>'
    +historicalBaselineEditor(summary)
    +'<div class="historical-months" role="group" aria-label="Choose historical month">'+summary.months.map(item=>'<button type="button" data-history-month="'+esc(item.key)+'" class="'+(item.key===selectedMonth.key?'selected':'')+'" aria-pressed="'+(item.key===selectedMonth.key)+'"><span>'+esc(item.label)+' 2025</span><b>'+euro(item.total)+'</b>'+(highest&&highest.key===item.key?'<small>Highest month</small>':'<small>Monthly spend</small>')+'</button>').join('')+'</div>'
    +'<div class="historical-section-title"><div><span class="f-kicker">'+esc(selectedMonth.label)+' category spend</span><h3>What the money went to</h3></div><span>Selected month · averages remain underneath for comparison</span></div>'
    +(summary.groups.length?'<div class="historical-pies">'+summary.groups.map(group=>{
      const color=/^#[0-9a-f]{6}$/i.test(String(group.color||''))?group.color:'#7359B6';
      const selectedValue=Number(group.values[selectedIndex]||0), selectedShare=selectedMonth.total?selectedValue/selectedMonth.total*100:0;
      return '<article class="historical-pie-card" style="--history-color:'+color+';--history-share:'+selectedShare.toFixed(1)+'%"><div class="historical-category"><span>'+esc(group.emoji)+'</span><div><h4>'+esc(group.name)+'</h4>'+(group.note?'<small>'+esc(group.note)+'</small>':'')+'</div></div>'
        +'<div class="historical-pie"><div><small>'+esc(selectedMonth.label)+'</small><b>'+euro(selectedValue)+'</b><span>'+Math.round(selectedShare)+'% that month</span></div></div>'
        +'<div class="historical-category-months">'+summary.months.map((month,index)=>'<span class="'+(month.key===selectedMonth.key?'selected':'')+'"><small>'+esc(month.label.slice(0,3))+'</small><b>'+euro(group.values[index])+'</b></span>').join('')+'</div>'
        +'<div class="historical-category-total"><span>Average / month</span><b>'+euro(group.average)+'</b><span>3-month total</span><b>'+euro(group.total)+'</b></div></article>';
    }).join('')+'</div>':'<div class="f-empty">Create historical categories in the editor above.</div>')+'</section>';
}

function renderAnalytics(){
  const now=monthStats(currentMonth());
  const week=weekStats(todayKey());
  const selectedTransactions=F.transactions.filter(item=>item.date===analyticsDay).sort((a,b)=>String(b.id).localeCompare(String(a.id)));
  const selected=selectedTransactions.reduce((sum,item)=>{
    const value=item.eurAmount!=null?Number(item.eurAmount):eurValue(item.amount,item.currency);
    sum[item.type]+=value; return sum;
  },{income:0,expense:0});
  const expenseByCategory={};
  F.transactions.filter(item=>item.type==='expense'&&monthKey(item.date)===analyticsMonth).forEach(item=>{
    const cat=F.categories.find(x=>x.id===item.categoryId), name=cat&&cat.name||'Other';
    expenseByCategory[name]=(expenseByCategory[name]||0)+(item.eurAmount!=null?Number(item.eurAmount):eurValue(item.amount,item.currency));
  });
  const catRows=Object.entries(expenseByCategory).sort((a,b)=>b[1]-a[1]);
  const maxCat=Math.max(1,...catRows.map(x=>x[1]));
  const categoryTotal=catRows.reduce((sum,item)=>sum+item[1],0);
  const monthKeys=priorMonthKeys(5).concat([currentMonth()]);
  const stats=monthKeys.map(key=>({key,...monthStats(key)}));
  const maxMonth=Math.max(1,...stats.flatMap(x=>[x.income,x.expense]));
  return '<div class="finance-grid"><section class="f-card strong f-span-12 analytics-summary"><div class="analytics-metric"><span>This week earned</span><b class="f-positive">'+euro(week.income)+'</b></div><div class="analytics-metric"><span>This week spent</span><b class="f-negative">'+euro(week.expense)+'</b></div><div class="analytics-metric"><span>This month earned</span><b class="f-positive">'+euro(now.income)+'</b></div><div class="analytics-metric"><span>This month spent</span><b class="f-negative">'+euro(now.expense)+'</b></div></section>'
    +'<section class="f-card f-span-8 calendar-panel"><div class="calendar-head"><div><div class="f-kicker">Daily spending</div><h2>'+esc(monthTitle(analyticsMonth))+'</h2></div><div class="calendar-nav"><button data-analytics-month="-1" aria-label="Previous month">‹</button><button data-analytics-today>Today</button><button data-analytics-month="1" aria-label="Next month">›</button></div></div>'+analyticsCalendarHTML()+'</section>'
    +'<section class="f-card f-span-4 day-panel"><div class="f-card-head"><h2>'+esc(dateLabel(analyticsDay))+'</h2></div><div class="day-totals"><div><span>Spent</span><b class="f-negative">'+euro(selected.expense)+'</b></div><div><span>Earned</span><b class="f-positive">'+euro(selected.income)+'</b></div></div>'
    +(selectedTransactions.length?'<div class="f-list day-transactions">'+selectedTransactions.map(transactionRow).join('')+'</div>':'<div class="f-empty">No entries on this day.</div>')+'</section>'
    +'<section class="f-card f-span-12 analytics-category-month"><div class="f-card-head"><div><div class="f-kicker">'+esc(monthTitle(analyticsMonth))+' spending</div><h2>By category</h2></div><span class="f-quiet">'+euro(categoryTotal)+' spent</span></div>'+(catRows.length?'<div class="bar-list">'+catRows.map(item=>'<div><div class="bar-head"><span>'+esc(item[0])+'</span><b>'+euro(item[1])+'</b></div><div class="bar-track"><div class="bar-fill" style="width:'+(item[1]/maxCat*100)+'%"></div></div></div>').join('')+'</div>':'<div class="f-empty">No expenses in '+esc(monthTitle(analyticsMonth))+'.</div>')+'</section>'
    +renderHistoricalAnalytics()
    +'<section class="f-card f-span-12"><div class="f-card-head"><div><div class="f-kicker">Six months</div><h2>Income vs expenses</h2></div></div><div class="months">'+stats.map(item=>'<div class="month"><div class="month-bars"><i class="month-bar" style="height:'+Math.max(2,item.income/maxMonth*100)+'%"></i><i class="month-bar expense" style="height:'+Math.max(2,item.expense/maxMonth*100)+'%"></i></div><label>'+esc(item.key.slice(5))+'</label></div>').join('')+'</div><div class="legend"><span><i></i>Income</span><span><i class="expense"></i>Expense</span></div></section></div>';
}

function weekStats(key){
  const date=new Date(key+'T12:00:00'), mondayOffset=(date.getDay()+6)%7;
  const start=new Date(date); start.setDate(date.getDate()-mondayOffset);
  const end=new Date(start); end.setDate(start.getDate()+6);
  const startKey=dateKey(start), endKey=dateKey(end);
  return F.transactions.filter(item=>item.date>=startKey&&item.date<=endKey).reduce((sum,item)=>{
    const value=item.eurAmount!=null?Number(item.eurAmount):eurValue(item.amount,item.currency);
    sum[item.type]+=value; return sum;
  },{income:0,expense:0});
}

function dateKey(date){
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}

function monthTitle(key){
  const parts=key.split('-');
  return new Intl.DateTimeFormat('en-IE',{month:'long',year:'numeric'}).format(new Date(Number(parts[0]),Number(parts[1])-1,1));
}

function shiftMonth(key,amount){
  const parts=key.split('-'), date=new Date(Number(parts[0]),Number(parts[1])-1+amount,1);
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
}

function analyticsCalendarHTML(){
  const parts=analyticsMonth.split('-'), year=Number(parts[0]), month=Number(parts[1])-1;
  const count=new Date(year,month+1,0).getDate(), offset=(new Date(year,month,1).getDay()+6)%7;
  const daily={};
  F.transactions.filter(item=>monthKey(item.date)===analyticsMonth).forEach(item=>{
    if(!daily[item.date]) daily[item.date]={income:0,expense:0};
    const value=item.eurAmount!=null?Number(item.eurAmount):eurValue(item.amount,item.currency);
    daily[item.date][item.type]+=value;
  });
  let cells='';
  for(let i=0;i<offset;i++) cells+='<span class="calendar-blank"></span>';
  for(let day=1;day<=count;day++){
    const key=analyticsMonth+'-'+String(day).padStart(2,'0'), values=daily[key]||{income:0,expense:0};
    cells+='<button class="calendar-day '+(key===todayKey()?'today ':'')+(key===analyticsDay?'selected ':'')+(values.expense?'has-spend ':'')+'" data-analytics-day="'+key+'" aria-pressed="'+(key===analyticsDay)+'" aria-label="'+esc(dateLabel(key)+', spent '+euro(values.expense)+', earned '+euro(values.income))+'"><span>'+day+'</span>'+(values.expense?'<b>'+compactEuro(values.expense)+'</b>':'')+(values.income?'<i title="Income logged"></i>':'')+'</button>';
  }
  return '<div class="calendar-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="calendar-grid">'+cells+'</div>';
}

function renderOther(){
  return '<div class="finance-grid"><section class="f-card f-span-12"><div class="f-card-head"><div><div class="f-kicker">Income setup</div><h2>Sources</h2></div></div>'+(F.sources.length?'<div class="f-list">'+F.sources.map(item=>'<div class="f-row"><i class="f-dot"></i><div class="f-row-main"><b>'+esc(item.name)+'</b><span>'+esc(item.note||'Income source')+'</span></div><b class="row-value">'+money(item.monthly,item.currency||'EUR')+'/mo</b><details class="row-disclosure"><summary aria-label="Edit '+esc(item.name)+'">•••</summary><div class="row-editor"><div class="f-inline-edit"><input class="f-input" type="number" min="0" step="0.01" value="'+esc(item.monthly||'')+'" placeholder="0" data-source-monthly="'+esc(item.id)+'"><button class="f-secondary" data-update-source="'+esc(item.id)+'" aria-label="Save monthly income">✓</button></div><button class="row-delete" data-delete="source" data-id="'+esc(item.id)+'">Delete</button></div></details></div>').join('')+'</div>':'<div class="f-empty">No income sources.</div>')+'</section>'
    +'<section class="f-card f-span-12"><details class="add-disclosure"><summary>+ Income source</summary><form class="f-form" data-source-form><div class="f-field full"><label>Name</label><input class="f-input" name="name" required></div><div class="f-field"><label>Monthly amount</label><input class="f-input" name="monthly" type="number" min="0" step="0.01"></div><div class="f-field"><label>Destination</label><select class="f-select" name="accountId"><option value="">Not assigned</option>'+options(F.accounts,'','id',item=>item.name)+'</select></div><div class="f-form-actions"><button class="f-submit">Add source</button></div></form></details></section>'
    +'<section class="f-card f-span-12"><div class="f-card-head"><div><div class="f-kicker">Conversion</div><h2>EUR rates</h2><p>Editable reference rates used for gross balance calculations.</p></div><span class="f-quiet">Reference: '+esc(F.rateDate)+'</span></div><div class="account-grid">'+F.currencies.map(rateCard).join('')+'</div></section></div>';
}
function rateCard(item){
  return '<article class="account"><div class="account-top"><b>'+esc(item.code)+'</b><span>'+esc(item.symbol)+'</span></div><div class="account-value">'+euro(item.eur)+'</div><div class="account-eur">for 1 '+esc(item.code)+'</div><details class="inline-disclosure"><summary>Edit rate</summary><div class="account-edit"><input class="f-input" type="number" min="0" step="0.000001" value="'+esc(item.eur)+'" data-rate="'+esc(item.code)+'"><button class="f-secondary" data-update-rate="'+esc(item.code)+'">Save</button></div></details></article>';
}

app.addEventListener('click', function(event){
  const nav=event.target.closest('[data-fin-page]');
  if(nav){ selectFinanceRoute(nav.dataset.finPage); history.replaceState(null,'','#finance/'+page); quickPanel=''; entryModal=''; render(); return; }
  const lockSection=event.target.closest('[data-lock-finance-section]');
  if(lockSection){ const section=lockSection.dataset.lockFinanceSection; financeUnlocked[section]=false; financePinMessage[section]=''; render(); return; }
  const changePin=event.target.closest('[data-change-finance-pin]');
  if(changePin){ const section=changePin.dataset.changeFinancePin; financePinMode[section]='change'; financePinMessage[section]=''; render(); return; }
  const cancelPin=event.target.closest('[data-cancel-finance-pin]');
  if(cancelPin){ const section=cancelPin.dataset.cancelFinancePin; financePinMode[section]=''; financePinMessage[section]=''; render(); return; }
  const budgetView=event.target.closest('[data-budget-view]');
  if(budgetView){ budgetMode=budgetView.dataset.budgetView==='week'?'week':'month'; render(); return; }
  const deleteEnvelope=event.target.closest('[data-delete-budget-envelope]');
  if(deleteEnvelope){
    const id=deleteEnvelope.dataset.deleteBudgetEnvelope, item=F.budget.categories.find(category=>category.id===id);
    if(item&&window.confirm('Delete the '+item.name+' envelope? Existing transactions will be kept.')){
      removeBudgetEnvelope(id); scheduleSave(); render(); toast(item.name+' envelope deleted');
    }
    return;
  }
  const deleteHistoricalCategory=event.target.closest('[data-delete-historical-category]');
  if(deleteHistoricalCategory){
    const id=deleteHistoricalCategory.dataset.deleteHistoricalCategory, group=F.historicalAnalytics&&F.historicalAnalytics.groups.find(item=>item.id===id);
    if(group&&window.confirm('Delete the '+group.name+' historical category?')) removeHistoricalCategory(id);
    return;
  }
  const wealthSection=event.target.closest('[data-wealth-tab]');
  if(wealthSection){ wealthTab=wealthSection.dataset.wealthTab; render(); return; }
  const historyMonth=event.target.closest('[data-history-month]');
  if(historyMonth){ historicalMonth=historyMonth.dataset.historyMonth; render(); return; }
  const analyticsDate=event.target.closest('[data-analytics-day]');
  if(analyticsDate){ analyticsDay=analyticsDate.dataset.analyticsDay; render(); return; }
  const analyticsMove=event.target.closest('[data-analytics-month]');
  if(analyticsMove){ analyticsMonth=shiftMonth(analyticsMonth,Number(analyticsMove.dataset.analyticsMonth)); analyticsDay=analyticsMonth+'-01'; render(); return; }
  if(event.target.closest('[data-analytics-today]')){ analyticsMonth=currentMonth(); analyticsDay=todayKey(); render(); return; }
  if(event.target.closest('[data-go-habits]')){ setProduct('habits'); const cloud=$('#cloudStatus'); if(cloud) cloud.click(); return; }
  if(event.target.closest('[data-retry-finance]')){ loadFinance(); return; }
  if(event.target.closest('[data-cash-change-no]') || event.target.hasAttribute('data-cash-change-backdrop')){ cashChangePrompt=null; render(); return; }
  if(event.target.closest('[data-cash-change-yes]')){ cashChangePrompt.step='amount'; render(); return; }
  if(event.target.closest('[data-close-entry-modal]') || event.target.hasAttribute('data-entry-modal-backdrop')){ entryModal=''; render(); return; }
  const type=event.target.closest('[data-entry-type]');
  if(type){ entryType=type.dataset.entryType; quickPanel=''; entryModal=''; render(); return; }
  const field=event.target.closest('[data-entry-field]');
  if(field){ entryModal=field.dataset.entryField; render(); return; }
  const choice=event.target.closest('[data-entry-choice]');
  if(choice){ entryDraft[choice.dataset.entryChoice]=choice.dataset.value; entryModal=''; render(); return; }
  const quick=event.target.closest('[data-quick]');
  if(quick){ quickPanel=quickPanel===quick.dataset.quick?'':quick.dataset.quick; render(); return; }
  const create=event.target.closest('[data-create]');
  if(create){ createQuick(create.dataset.create); return; }
  const del=event.target.closest('[data-delete]');
  if(del){ deleteItem(del.dataset.delete,del.dataset.id); return; }
  const account=event.target.closest('[data-update-account]');
  if(account){
    const input=$('[data-account-balance="'+CSS.escape(account.dataset.updateAccount)+'"]',app);
    const item=F.accounts.find(x=>x.id===account.dataset.updateAccount);
    if(item&&input){ item.balance=Number(input.value||0); scheduleSave(); render(); }
    return;
  }
  const rate=event.target.closest('[data-update-rate]');
  if(rate){
    const input=$('[data-rate="'+CSS.escape(rate.dataset.updateRate)+'"]',app), item=currency(rate.dataset.updateRate);
    if(input&&item){ item.eur=Math.max(0,Number(input.value||0)); F.rateDate=todayKey(); scheduleSave(); render(); }
    return;
  }
  const planUpdate=event.target.closest('[data-update-plan]');
  if(planUpdate){
    const kind=planUpdate.dataset.updatePlan, id=planUpdate.dataset.id;
    const input=$('[data-plan-amount="'+CSS.escape(kind+'_'+id)+'"]',app);
    const item=F[kind]&&F[kind].find(x=>x.id===id);
    if(input&&item){ item.amount=Math.max(0,Number(input.value||0)); scheduleSave(); render(); }
    return;
  }
  const valueUpdate=event.target.closest('[data-update-value]');
  if(valueUpdate){
    const kind=valueUpdate.dataset.updateValue, id=valueUpdate.dataset.id;
    const input=$('[data-value-amount="'+CSS.escape(kind+'_'+id)+'"]',app);
    const list=kind==='asset'?F.assets:F.passives, item=list.find(x=>x.id===id);
    if(input&&item){ item.value=Math.max(0,Number(input.value||0)); scheduleSave(); render(); }
    return;
  }
  const sourceUpdate=event.target.closest('[data-update-source]');
  if(sourceUpdate){
    const id=sourceUpdate.dataset.updateSource;
    const input=$('[data-source-monthly="'+CSS.escape(id)+'"]',app), item=F.sources.find(x=>x.id===id);
    if(input&&item){ item.monthly=Math.max(0,Number(input.value||0)); scheduleSave(); render(); }
  }
});

app.addEventListener('input',function(event){
  if(event.target.id==='entryAmount') entryDraft.amount=event.target.value;
  if(event.target.matches('[data-budget-slider]')){
    const input=event.target.closest('.budget-slider-label')&&event.target.closest('.budget-slider-label').querySelector('[data-budget-input]');
    if(input) input.value=Number(event.target.value||0).toFixed(2);
  }
  if(event.target.matches('[data-budget-input]')){
    const slider=event.target.closest('.budget-slider-label')&&event.target.closest('.budget-slider-label').querySelector('[data-budget-slider]');
    if(slider&&event.target.value!=='') slider.value=event.target.value;
  }
  if(event.target.matches('[data-budget-circle-input]')){
    const card=event.target.closest('.budget-envelope'), input=card&&card.querySelector('[data-budget-input]'), slider=card&&card.querySelector('[data-budget-slider]');
    if(event.target.value==='') return;
    const allocation=budgetCircleAllocation(event.target);
    if(input) input.value=allocation.toFixed(2);
    if(slider) slider.value=allocation;
  }
});

app.addEventListener('change',function(event){
  if(event.target.matches('[data-monthly-budget-input]')){
    setBudgetMonthlyTotal(event.target.value); scheduleSave(); render(); return;
  }
  if(!event.target.matches('[data-budget-slider],[data-budget-input],[data-budget-circle-input]')) return;
  const category=event.target.dataset.budgetSlider||event.target.dataset.budgetInput||event.target.dataset.budgetCircleInput;
  let value=Number(event.target.value||0);
  if(event.target.matches('[data-budget-circle-input]')) value=budgetCircleAllocation(event.target);
  setBudgetAllocation(category,value,event.target.dataset.budgetMode);
  scheduleSave(); render();
});

document.addEventListener('keydown',function(event){
  if(event.key==='Enter'&&event.target.matches&&event.target.matches('[data-budget-input],[data-budget-circle-input],[data-monthly-budget-input]')){ event.preventDefault(); event.target.blur(); return; }
  if(event.key==='Escape' && (entryModal||cashChangePrompt)){ entryModal=''; cashChangePrompt=null; render(); }
});

app.addEventListener('submit', function(event){
  event.preventDefault();
  if(event.target.id==='financeSignin'){ financeSignIn(); return; }
  if(event.target.matches('[data-finance-pin-form]')){ handleFinancePin(event.target); return; }
  if(event.target.matches('[data-entry-modal-add]')){ addEntryModalItem(event.target,event.target.dataset.entryModalAdd); return; }
  if(event.target.matches('[data-entry-modal-apply]')){ applyEntryModal(event.target,event.target.dataset.entryModalApply); return; }
  if(event.target.matches('[data-cash-change-form]')){ addCashChange(event.target); return; }
  if(event.target.matches('[data-historical-baseline-form]')){ updateHistoricalBaseline(event.target); return; }
  if(event.target.matches('[data-historical-category-form]')){ addHistoricalCategory(event.target); return; }
  if(event.target.matches('[data-budget-envelope-form]')){ addBudgetEnvelope(event.target); return; }
  if(event.target.id==='entryForm'){ addTransaction(); return; }
  if(event.target.matches('[data-value-form]')){ addValue(event.target,event.target.dataset.valueForm); return; }
  if(event.target.matches('[data-plan-form]')){ addPlan(event.target,event.target.dataset.planForm); return; }
  if(event.target.matches('[data-source-form]')){ addSource(event.target); return; }
  if(event.target.matches('[data-inventory-form]')){ addInventory(event.target); }
});

function addEntryModalItem(form,kind){
  const data=new FormData(form), name=String(data.get('name')||'').trim();
  if(!name) return;
  if(kind==='category'){
    const item=createBudgetEnvelope(name,data.get('emoji'),data.get('amount'));
    if(!item){ toast('An expense category with that name already exists'); return; }
    entryDraft.categoryId=item.categoryId;
  }else if(kind==='source'){
    const item={id:uid('source'),name:name,monthly:Number(data.get('monthly')||0),currency:'EUR',accountId:'',note:''}; F.sources.push(item); entryDraft.sourceId=item.id;
  }else{
    const item={id:uid('account'),name:name,type:'account',currency:String(data.get('currency')||'EUR'),balance:0}; F.accounts.push(item); entryDraft.accountId=item.id;
  }
  entryModal=''; scheduleSave(); render();
}

function applyEntryModal(form,kind){
  const data=new FormData(form);
  if(kind==='date') entryDraft.date=String(data.get('date')||todayKey());
  else entryDraft.note=String(data.get('note')||'').trim();
  entryModal=''; render();
}

async function financeSignIn(){
  if(!client){ signMessage='Secure connection is still loading. Try again in a moment.'; render(); return; }
  const email=($('#financeEmail',app)&&$('#financeEmail',app).value||'').trim();
  const password=$('#financePassword',app)&&$('#financePassword',app).value||'';
  if(!email||password.length<6){ signMessage='Enter your email and password.'; render(); return; }
  signingIn=true; signMessage=''; render();
  try{
    const result=await client.auth.signInWithPassword({email:email,password:password});
    if(result.error) throw result.error;
    user=result.data.user; signingIn=false; signMessage='';
    await loadFinance();
  }catch(error){ signingIn=false; signMessage=error&&error.message||'Could not sign in.'; render(); }
}

function createQuick(kind){
  const name=($('#quickName',app)&&$('#quickName',app).value||'').trim();
  if(!name){ toast('Add a name first'); return; }
  if(kind==='category') F.categories.push({id:uid('cat'),name:name,type:'expense'});
  if(kind==='source') F.sources.push({id:uid('source'),name:name,monthly:Number($('#quickMonthly',app).value||0),currency:'EUR',accountId:'',note:''});
  if(kind==='account') F.accounts.push({id:uid('account'),name:name,type:'account',currency:$('#quickCurrency',app).value,balance:0});
  quickPanel=''; scheduleSave(); render();
}

function addTransaction(){
  const amount=Number(entryDraft.amount||0), code=entryDraft.currency, accountId=entryDraft.accountId;
  if(amount<=0||!accountId){ toast('Add an amount and storage'); return; }
  if(entryType==='expense'&&!entryDraft.categoryId){ toast('Create and choose an expense category'); return; }
  if(entryType==='income'&&!entryDraft.sourceId){ toast('Create and choose an income source'); return; }
  const account=F.accounts.find(item=>item.id===accountId);
  const eurAmount=eurValue(amount,code);
  const accountRate=Number(currency(account.currency).eur||1);
  const accountAmount=accountRate ? eurAmount/accountRate : amount;
  const item={id:uid('txn'),type:entryType,amount:amount,currency:code,eurAmount:eurAmount,accountId:accountId,date:entryDraft.date||todayKey(),note:entryDraft.note};
  if(entryType==='expense'){ item.categoryId=entryDraft.categoryId; account.balance=Number(account.balance||0)-accountAmount; }
  else { item.sourceId=entryDraft.sourceId; account.balance=Number(account.balance||0)+accountAmount; }
  F.transactions.unshift(item);
  if(entryType==='expense' && accountSectionKey(account)==='cash' && String(account.currency).toUpperCase()==='EUR') cashChangePrompt={step:'ask',transactionId:item.id,cashAccountId:account.id};
  entryDraft.amount=''; entryDraft.note=''; entryDraft.date=todayKey(); scheduleSave(); render(); toast(entryType==='expense'?'Expense added':'Income added');
}

function addCashChange(form){
  const raw=String(new FormData(form).get('changeAmount')||'').trim().replace(',','.');
  const amount=Math.round(Number(raw)*100)/100;
  if(!Number.isFinite(amount)||amount<=0){ toast('Enter the change as 0.00 EUR'); return; }
  const prompt=cashChangePrompt, transaction=prompt&&F.transactions.find(item=>item.id===prompt.transactionId);
  const cash=prompt&&F.accounts.find(item=>item.id===prompt.cashAccountId);
  if(!transaction||!cash){ cashChangePrompt=null; render(); return; }
  const cupName='coins euro cup';
  let cup=F.accounts.find(item=>String(item.name||'').toLowerCase().replace(/[·–—-]/g,' ').replace(/\s+/g,' ').trim()===cupName);
  if(!cup){ cup={id:uid('account'),name:'Coins · euro cup',type:'coins',currency:'EUR',balance:0}; F.accounts.push(cup); }
  cash.balance=Math.round((Number(cash.balance||0)-amount)*100)/100;
  cup.balance=Math.round((Number(cup.balance||0)+amount)*100)/100;
  transaction.cashChange={amount:amount,cashAccountId:cash.id,coinAccountId:cup.id};
  cashChangePrompt=null; scheduleSave(); render(); toast(money(amount,'EUR')+' added to the euro cup');
}

function addValue(form,kind){
  const potential=kind==='asset' && form.hasAttribute('data-potential-asset');
  const data=new FormData(form), item={id:uid(kind),name:String(data.get('name')||'').trim(),value:potential?0:Number(data.get('value')||0),currency:String(data.get('currency')||'EUR'),kind:potential?'Potential asset':kind==='asset'?'Asset':'Possession',note:String(data.get('note')||'').trim()};
  if(!item.name) return;
  F[kind==='asset'?'assets':'passives'].push(item); scheduleSave(); render();
}
function addPlan(form,kind){
  const data=new FormData(form), item={id:uid(kind),name:String(data.get('name')||'').trim(),amount:Number(data.get('amount')||0),currency:String(data.get('currency')||'EUR'),note:'',status:'planned'};
  if(!item.name) return;
  if(kind==='planned') item.due=String(data.get('due')||'');
  F[kind].push(item); scheduleSave(); render();
}
function addSource(form){
  const data=new FormData(form), name=String(data.get('name')||'').trim(); if(!name) return;
  F.sources.push({id:uid('source'),name:name,monthly:Number(data.get('monthly')||0),currency:'EUR',accountId:String(data.get('accountId')||''),note:''}); scheduleSave(); render();
}
function addInventory(form){
  const data=new FormData(form), name=String(data.get('name')||'').trim(); if(!name) return;
  F.inventory.push({id:uid('inventory'),name:name,note:String(data.get('note')||'').trim()}); scheduleSave(); render();
}

function deleteItem(kind,id){
  const map={asset:'assets',passive:'passives',recurring:'recurring',planned:'planned',source:'sources',inventory:'inventory'};
  if(kind==='transaction'){
    const item=F.transactions.find(x=>x.id===id), account=item&&F.accounts.find(x=>x.id===item.accountId);
    if(item&&account){
      const eurAmount=item.eurAmount!=null?Number(item.eurAmount):eurValue(item.amount,item.currency);
      const accountAmount=eurAmount/Number(currency(account.currency).eur||1);
      account.balance=Number(account.balance||0)+(item.type==='expense'?accountAmount:-accountAmount);
    }
    if(item&&item.cashChange){
      const cash=F.accounts.find(x=>x.id===item.cashChange.cashAccountId), cup=F.accounts.find(x=>x.id===item.cashChange.coinAccountId);
      const amount=Number(item.cashChange.amount||0);
      if(cash) cash.balance=Math.round((Number(cash.balance||0)+amount)*100)/100;
      if(cup) cup.balance=Math.round((Number(cup.balance||0)-amount)*100)/100;
    }
    F.transactions=F.transactions.filter(x=>x.id!==id);
  } else if(map[kind]) F[map[kind]]=F[map[kind]].filter(x=>x.id!==id);
  scheduleSave(); render();
}

setInterval(function(){ if(product==='finance' && !document.hidden) refreshFinance(); },60000);
window.addEventListener('focus',function(){ if(product==='finance') refreshFinance(); });
window.addEventListener('pageshow',function(event){
  if(event.persisted){ lockFinanceSections(); render(); }
});

if(location.hash.indexOf('#finance/')===0) setProduct('finance');
else setProduct('habits');
})();
