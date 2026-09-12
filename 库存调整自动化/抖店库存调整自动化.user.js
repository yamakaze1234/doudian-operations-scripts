// ==UserScript==
// @name         抖店库存调整自动化
// @namespace    local.douyin.stock-zero
// @version      0.2.3
// @description  粘贴SPU及简称，预检匹配SKU，支持清零或添加现货库存，保存后回读验证。
// @match        https://fxg.jinritemai.com/ffa/g/list*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(function(){
"use strict";
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StockZeroCore=api;})(globalThis,()=>{
  'use strict';
  const normalize=value=>String(value).normalize('NFKC').replace(/[丨｜]/g,'|').replace(/[\s\u200b\ufeff]+/g,'').toLowerCase();
  function parse(text){
    const table=[];let row=[],cell='',quoted=false;
    text=String(text).replace(/^\ufeff/,'').replace(/\r\n?/g,'\n');
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||cell===''){quoted=!quoted;}else cell+=c;}
      else if(!quoted&&(c==='\t'||c==='\n')){row.push(cell);cell='';if(c==='\n'){table.push(row);row=[];}}
      else cell+=c;
    }
    if(quoted)throw Error('引号未闭合，请重新复制两列');
    row.push(cell);table.push(row);
    const out=[],seen=new Set();
    for(let i=0;i<table.length;i++){
      const cols=table[i].map(s=>s.trim());if(cols.every(s=>!s))continue;
      if(i===0&&/^(spu|商品id)$/i.test(cols[0])&&/^(简称|sku名称)$/i.test(cols[1]))continue;
      if(cols.length!==2)throw Error(`第 ${i+1} 行需恰好两列：SPU、简称`);
      const spu=cols[0].replace(/^'/,'');const name=cols[1];
      if(!/^[1-9]\d{14,19}$/.test(spu))throw Error(`第 ${i+1} 行商品 ID 无效，请使用文本格式的完整数字`);
      if(!normalize(name))throw Error(`第 ${i+1} 行简称为空`);
      const key=spu+'\t'+normalize(name);if(seen.has(key))continue;seen.add(key);out.push({spu,name,line:i+1});
    }
    if(!out.length)throw Error('请粘贴 SPU 和简称两列');return out;
  }
  function match(requested,skus){
    const ids=new Set();for(const sku of skus){if(!/^[1-9]\d{9,19}$/.test(sku.skuId)||ids.has(sku.skuId))throw Error('页面 SKU ID 缺失或重复');ids.add(sku.skuId);}
    return requested.map(r=>{const found=skus.filter(s=>normalize(s.name)===normalize(r.name));return {...r,status:found.length===1?'匹配':found.length?'歧义':'未匹配',...(found.length===1?{skuId:found[0].skuId,pageName:found[0].name}:{}),candidates:found.map(s=>s.skuId)};});
  }
  return {normalize,parse,match};
});

(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StockZeroAdapter=api;})(globalThis,()=>{
  'use strict';
  const text=e=>(e?.innerText??e?.textContent??'').trim();
  const compact=s=>s.replace(/\s/g,'');
  const number=s=>{if(!/^\d+$/.test(s))throw Error('库存不是有效整数');const n=Number(s);if(!Number.isSafeInteger(n)||n>10000000)throw Error('库存超出支持范围');return n;};
  function fields(root,spu){
    const body=text(root);if(body.match(/商品ID\s*[:：]\s*(\d+)/)?.[1]!==spu)throw Error('库存窗口商品 ID 不符');
    if(!/库存类型\s*[:：]\s*普通库存/.test(body))throw Error('仅支持普通库存');
    if(root.querySelector('[class*="virtual"], [class*="pagination"]'))throw Error('分页或虚拟表格需额外适配，已停止');
    const tables=[...root.querySelectorAll('.optimus_fems-table')].filter(e=>text(e).includes('SKU信息'));
    if(tables.length!==1)throw Error('无法唯一定位 SKU 库存表');
    const table=tables[0],heads=[...table.querySelectorAll('th')].map(e=>compact(text(e)));
    const plainSpot=heads.includes('当前库存')&&heads.includes('库存增减')&&!heads.some(h=>h.includes('预售'));
    const stockCols=heads.map((h,i)=>(['改后现货库存','现货库存'].includes(h)||(plainSpot&&h==='改后库存'))?i:-1).filter(i=>i>=0);
    const stockCol=stockCols[0],preCol=heads.indexOf('预售库存'),occupiedCol=heads.indexOf('占用库存');
    if(stockCols.length!==1||occupiedCol<0||heads[0]!=='SKU信息')throw Error('无法唯一识别现货库存列，请使用现货或现货预售分列布局');
    if(heads.filter(h=>h.includes('预售')).some(h=>h!=='预售库存')||heads.filter(h=>h==='预售库存').length>1)throw Error('存在未识别或重复的预售库存列');
    const rows=[];
    for(const tr of table.querySelectorAll('tbody tr')){
      const cells=[...tr.children].filter(e=>e.tagName==='TD');if(!cells.length)continue;
      const first=text(cells[0]);if(!first.includes('SKU ID')){if(tr.querySelector('input'))throw Error('存在无法读取 SKU ID 的库存行');continue;}
      const skuId=first.match(/SKU ID\s*[:：]\s*(\d+)/)?.[1];
      if(!skuId||!/^\d{10,20}$/.test(skuId))throw Error('真实 SKU ID 读取失败');
      const name=text(cells[0].querySelector('[class*="skuName-"]'));
      if(!name)throw Error('SKU 名称读取失败');
      if(cells.length!==heads.length)throw Error('SKU 列数不一致');
      const stock=[...cells[stockCol].querySelectorAll('input')];
      const presale=preCol<0?[]:[...cells[preCol].querySelectorAll('input')];
      const labels=preCol<0?[]:(text(cells[preCol]).match(/\d+\s*天内/g)||[]);
      if(stock.length!==1||labels.length!==presale.length)throw Error('库存输入框与预售档位不一致');
      if(new Set(labels.map(compact)).size!==labels.length)throw Error('预售档位重复');
      const occupied=text(cells[occupiedCol]);if(occupied!=='-'&&occupied!=='0')throw Error('存在占用库存，需在后台人工处理');
      const inputs=[...stock,...presale];if(inputs.some(e=>e.disabled||e.readOnly))throw Error('存在不可编辑的库存字段');
      rows.push({skuId,name,tr,stock:stock[0],current:plainSpot?number(text(cells[heads.indexOf('当前库存')])):null,presale:presale.map((input,i)=>({label:compact(labels[i]),input})),delta:tr.querySelector('input[data-kora="库存增减-输入框"]')});
    }
    if(!rows.length||new Set(rows.map(r=>r.skuId)).size!==rows.length)throw Error('SKU 列表为空或 ID 重复');
    return rows;
  }
  function read(root,spu,{staged=false}={}){
    const totalMatch=text(root).match(/商品总库存\s*[:：]\s*([\d,]+)/);
    if(!totalMatch)throw Error('无法读取商品总库存');const total=number(totalMatch[1].replace(/,/g,''));
    const rows=fields(root,spu).map(r=>{
      if(!staged&&r.current!==null&&r.current!==number(r.stock.value))throw Error('当前库存与改后库存不一致，存在未保存修改');
      if(!staged&&r.delta?.value&&number(r.delta.value)!==0)throw Error('库存窗口存在未保存改动，请先自行保存或取消');
      return {skuId:r.skuId,name:r.name,stock:number(r.stock.value),presale:r.presale.map(p=>({label:p.label,value:number(p.input.value)}))};
    });
    const sum=rows.reduce((n,r)=>n+r.stock+r.presale.reduce((v,p)=>v+p.value,0),0);
    if(!staged&&sum!==total)throw Error(`库存明细合计 ${sum} 与商品总库存 ${total} 不符，停止处理`);
    return {spu,total,rows};
  }
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function assertSame(before,after){if(!same(before.rows,after.rows))throw Error('库存或 SKU 已变化，请重新预检');}
  function assertZero(before,after,ids){
    const targets=new Set(ids);if(before.rows.length!==after.rows.length)throw Error('SKU 数量发生变化');
    for(const row of before.rows){const current=after.rows.find(r=>r.skuId===row.skuId);const expected=targets.has(row.skuId)?{...row,stock:0,presale:row.presale.map(p=>({...p,value:0}))}:row;if(!same(expected,current))throw Error(`SKU ${row.skuId} 写入或回读不符，停止保存/后续处理`);}
  }
  function setInput(input,value){
    const win=input.ownerDocument.defaultView;
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set.call(input,String(value));
    input.dispatchEvent(new win.Event('input',{bubbles:true}));input.dispatchEvent(new win.Event('change',{bubbles:true}));input.dispatchEvent(new win.FocusEvent('blur',{bubbles:true}));
  }
  async function zero(root,spu,ids,before,guard=()=>{}){
    guard();assertSame(before,read(root,spu));
    if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!before.rows.some(r=>r.skuId===id)))throw Error('目标 SKU ID 无效');
    for(const id of ids){
      const original=fields(root,spu).find(r=>r.skuId===id);const count=original.presale.length;
      for(let i=0;i<=count;i++){
        guard();const row=fields(root,spu).find(r=>r.skuId===id);if(!row||row.presale.length!==count||row.name!==original.name)throw Error('写入期间 SKU 结构变化');
        const input=i===0?row.stock:row.presale[i-1].input;
        if(input.value!=='0'){setInput(input,0);await new Promise(resolve=>setTimeout(resolve,50));}
      }
    }
    guard();assertZero(before,read(root,spu,{staged:true}),ids);
  }
  function addition(before,targets){
    if(!targets.length||new Set(targets.map(t=>t.skuId)).size!==targets.length)throw Error('添加库存目标重复或为空');
    const expected=JSON.parse(JSON.stringify(before));
    for(const t of targets){const row=expected.rows.find(r=>r.skuId===t.skuId);if(!row)throw Error('目标 SKU ID 无效');const q=number(String(t.quantity));if(q<=0)throw Error('增加数量必须为正整数');row.stock=number(String(row.stock+q));}
    expected.total=number(String(expected.rows.reduce((n,r)=>n+r.stock+r.presale.reduce((s,p)=>s+p.value,0),0)));return expected;
  }
  function assertAdded(before,after,targets){assertSame(addition(before,targets),after);}
  async function add(root,spu,targets,before,guard=()=>{}){
    guard();assertSame(before,read(root,spu));const expected=addition(before,targets);
    for(const t of targets){guard();const row=fields(root,spu).find(r=>r.skuId===t.skuId);const original=before.rows.find(r=>r.skuId===t.skuId);if(!row||row.name!==original.name)throw Error('写入期间 SKU 结构变化');setInput(row.stock,expected.rows.find(r=>r.skuId===t.skuId).stock);await new Promise(resolve=>setTimeout(resolve,50));}
    guard();assertAdded(before,read(root,spu,{staged:true}),targets);
  }
  return {text,read,zero,add,addition,assertAdded,assertSame,assertZero,setInput};
});

(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./adapter.js'));else root.StockZeroRunner=factory(root.StockZeroCore,root.StockZeroAdapter);})(globalThis,(C,A)=>{
  'use strict';
  class Runner{
    constructor(port,onUpdate=()=>{}){this.port=port;this.onUpdate=onUpdate;this.groups=[];this.results=[];this.stopped=false;this.ready=false;this.log=[];}
    emit(message){this.log.push({time:new Date().toISOString(),message});this.onUpdate(this,message);}
    stop(){this.stopped=true;this.ready=false;this.emit('已请求停止；已提交的保存需回读核实');}
    guard(){if(this.stopped)throw Error('任务已停止');if(this.port.shop()!==this.shopName)throw Error('当前店铺已改变，停止操作');}
    async prepare(input,{mode='zero',quantity}={}){
      this.ready=false;this.stopped=false;this.groups=[];this.results=[];this.shopName=this.port.shop();
      if(!['zero','add'].includes(mode))throw Error('未知库存操作');this.mode=mode;
      if(mode==='add'&&(!/^[1-9]\d*$/.test(String(quantity))||!Number.isSafeInteger(Number(quantity))||Number(quantity)>10000000))throw Error('增加数量必须为 1～10000000 的整数');this.quantity=Number(quantity);
      if(!this.shopName)throw Error('未识别当前店铺');
      const requested=C.parse(input);const map=new Map();for(const r of requested){if(!map.has(r.spu))map.set(r.spu,[]);map.get(r.spu).push(r);}
      for(const [spu,rows] of map){
        this.guard();this.emit(`正在预检 ${spu}`);await this.port.open(spu,()=>this.guard());this.guard();
        const baseline=this.port.read(spu);const results=C.match(rows,baseline.rows).map(r=>({...r,shop:this.shopName,before:baseline.rows.find(s=>s.skuId===r.skuId)}));
        if(mode==='add'&&results.some(r=>r.status==='匹配')){const expected=A.addition(baseline,results.filter(r=>r.status==='匹配').map(r=>({skuId:r.skuId,quantity:this.quantity})));for(const r of results)if(r.status==='匹配'){r.quantity=this.quantity;r.targetStock=expected.rows.find(s=>s.skuId===r.skuId).stock;}}
        this.groups.push({spu,baseline,results});this.results.push(...results);await this.port.close();this.emit(`已预检 ${spu}`);
      }
      this.guard();this.ready=true;this.emit('预检完成，请审阅命中结果；异常项将跳过');return this.results;
    }
    async execute(){
      this.guard();if(!this.ready)throw Error('请先重新预检');this.ready=false;
      if(!this.results.some(r=>r.status==='匹配'))throw Error('没有可执行的匹配项');
      for(const group of this.groups){
        const targets=group.results.filter(r=>r.status==='匹配');if(!targets.length)continue;
        let saveAttempted=false;
        try{
          this.guard();this.emit(`正在核对 ${group.spu}`);await this.port.open(group.spu,()=>this.guard());this.guard();
          const fresh=this.port.read(group.spu);A.assertSame(group.baseline,fresh);
          const adding=this.mode==='add';const changed=targets.filter(t=>adding||t.before.stock!==0||t.before.presale.some(p=>p.value!==0));
          for(const t of targets)if(!changed.includes(t))t.status='原库存已为零';
          if(!changed.length){await this.port.close();this.emit(`${group.spu} 目标原库存已为零`);continue;}
          const ids=changed.map(t=>t.skuId);
          const additions=changed.map(t=>({skuId:t.skuId,quantity:t.quantity}));
          if(adding)await this.port.add(group.spu,additions,fresh,()=>this.guard());else await this.port.zero(group.spu,ids,fresh,()=>this.guard());this.guard();
          for(const t of changed)t.status='等待保存';this.emit(`正在保存 ${group.spu}`);
          saveAttempted=true;await this.port.save(()=>this.guard());
          const remaining=fresh.rows.filter(r=>!ids.includes(r.skuId)).reduce((n,r)=>n+r.stock+r.presale.reduce((s,p)=>s+p.value,0),0);
          this.guard();await this.port.open(group.spu,()=>this.guard(),{soldOutReadback:!adding&&remaining===0});this.guard();
          const after=this.port.read(group.spu);if(adding)A.assertAdded(fresh,after,additions);else A.assertZero(fresh,after,ids);
          for(const t of changed){t.status=adding?'已验证添加':'已验证清零';t.after=after.rows.find(r=>r.skuId===t.skuId);t.verifiedAt=new Date().toISOString();}
          await this.port.close();this.emit(`${group.spu} 已保存并回读验证`);
        }catch(error){for(const t of targets)if(!['已验证清零','已验证添加','原库存已为零'].includes(t.status)){t.status=saveAttempted?'保存结果待核实':'已停止';t.error=error.message;}this.emit(error.message);throw error;}
      }
      this.emit('执行结束，已保存的目标均已回读验证');
    }
  }
  return {Runner};
});


(function(root){
  'use strict';
  const A=root.StockZeroAdapter,visible=e=>!!e&&e.isConnected&&e.getClientRects().length>0;
  const txt=e=>A.text(e).replace(/\s/g,'');
  const buttons=(parent,name)=>[...parent.querySelectorAll('button')].filter(e=>visible(e)&&txt(e)===name.replace(/\s/g,''));
  const one=(items,message)=>{if(items.length!==1)throw Error(message);return items[0];};
  const click=e=>{if(!visible(e)||e.disabled||e.getAttribute('aria-disabled')==='true')throw Error('按钮不可用');e.click();};
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function wait(fn,message,guard=()=>{},timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){guard();const result=fn();if(result)return result;await pause(200);}throw Error(message);}
  const drawers=()=>[...document.querySelectorAll('.auxo-drawer-open .auxo-drawer-body')].filter(visible);
  function stockRoot(){return one(drawers().filter(e=>/商品ID\s*[:：]/.test(A.text(e))&&e.querySelector('.optimus_fems-table')),'未找到唯一的库存编辑窗口');}
  function shop(){const names=[...document.querySelectorAll('[class*="index_userName__"]')].filter(visible).map(A.text);return names.length===1?names[0]:'';}
  async function open(spu,guard,{soldOutReadback=false}={}){
    guard();if(drawers().length)throw Error('请先自行关闭已有编辑窗口，再重新预检');
    const tabName=soldOutReadback?'已售罄':'售卖中';
    const targetTab=one([...document.querySelectorAll('[role="tab"]')].filter(e=>visible(e)&&txt(e)===tabName),`找不到商品“${tabName}”分类`);
    if(targetTab.getAttribute('aria-selected')!=='true'){click(targetTab);await wait(()=>targetTab.getAttribute('aria-selected')==='true',`无法切换${tabName}商品`,guard);await pause(500);}
    click(one(buttons(document,'重置'),'找不到唯一重置按钮'));await pause(400);guard();
    const input=one([...document.querySelectorAll('input')].filter(e=>visible(e)&&e.placeholder==='请输入商品名称/商品ID/商家编码，多条可用逗号隔开'),'找不到商品搜索框');
    A.setInput(input,spu);await pause(100);guard();click(one(buttons(document,'查询'),'找不到唯一查询按钮'));
    const row=await wait(()=>{
      if([...document.querySelectorAll('.ecom-g-spin-spinning')].some(visible))return false;
      const rows=[...document.querySelectorAll('tr[data-row-key]')].filter(e=>visible(e)&&e.getAttribute('data-row-key')===spu&&A.text(e).includes(spu));return rows.length===1?rows[0]:false;
    },`未查询到商品 ${spu}，请检查店铺、商品状态和筛选条件`,guard);
    guard();
    if(targetTab.getAttribute('aria-selected')!=='true')throw Error('商品分类已变化，请重新预检');
    const headers=[...row.closest('table').querySelectorAll('thead th')];
    const stockIndex=headers.findIndex(e=>txt(e)==='总库存');
    const stockCell=stockIndex>=0?row.cells[stockIndex]:null;
    if(!stockCell)throw Error('无法定位该商品的总库存列');
    const icon=one([...stockCell.querySelectorAll('[data-kora="修改库存"]')],'该商品总库存列无唯一编辑入口');click(icon.closest('a')||icon);
    await wait(()=>drawers().find(e=>A.text(e).match(/商品ID\s*[:：]\s*(\d+)/)?.[1]===spu&&e.querySelector('tbody tr [class*="skuName-"]')),'库存窗口加载超时',guard);
    await pause(350);guard();
  }
  async function close(){const drawer=stockRoot();click(one(buttons(drawer,'取消'),'找不到取消按钮'));await wait(()=>!visible(drawer),'库存窗口未关闭');}
  async function save(guard){
    guard();const drawer=stockRoot();const button=one(buttons(drawer,'保存'),'找不到保存按钮');
    click(button);
    await wait(()=>!visible(drawer),'保存结果未知：窗口未关闭，请人工核实，勿重复提交',()=>{},25000);
  }
  root.StockZeroBrowser={shop,open,read:spu=>A.read(stockRoot(),spu),close,zero:(spu,ids,before,guard)=>A.zero(stockRoot(),spu,ids,before,guard),add:(spu,targets,before,guard)=>A.add(stockRoot(),spu,targets,before,guard),save};
})(globalThis);

(function(root){
  'use strict';
  if(document.getElementById('stock-zero-host'))return;
  const host=document.createElement('div');host.id='stock-zero-host';document.body.append(host);const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML=`<style>
    .inventory-options{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin:12px 0}.inventory-options label{margin:0;display:flex;flex-direction:column;gap:6px}.inventory-options select,.inventory-options input{font:inherit;line-height:1.5;height:40px;border:1px solid #c4d2e4;border-radius:6px;padding:8px 12px;transition:border-color .15s,box-shadow .15s}.inventory-options select{min-width:166px;background:#245cb3;color:#fff;border-color:#245cb3;cursor:pointer}.inventory-options select:hover{background:#1d4e99}.inventory-options option{background:#fff;color:#24344a}.inventory-options input{width:176px;max-width:100%;background:#fff;color:#24344a;font-weight:normal}.inventory-options input::placeholder{color:#8c9bb0}.inventory-options input:hover{border-color:#245cb3}.inventory-options select:focus-visible,.inventory-options input:focus-visible{outline:0;box-shadow:0 0 0 3px #245cb326;border-color:#245cb3}.inventory-options select:disabled,.inventory-options input:disabled{opacity:.45;cursor:not-allowed}
    :host{all:initial;font:14px/1.5 "Microsoft YaHei",sans-serif;color:#24344a}
    *{box-sizing:border-box}button,textarea{font:inherit}button{cursor:pointer;border:1px solid #c4d2e4;background:#fff;border-radius:6px;padding:8px 12px;color:#24344a}button:hover{background:#edf4fc}button:disabled{opacity:.45;cursor:not-allowed}
    #launch{position:fixed;left:22px;bottom:26px;z-index:2147483646;background:#245cb3;color:white;border:0;box-shadow:0 3px 14px #0002}
    #panel{position:fixed;left:20px;top:80px;width:min(760px,calc(100vw - 40px));max-height:calc(100vh - 110px);overflow:auto;z-index:2147483646;background:#f5f8fc;border:1px solid #b7cbe4;border-radius:10px;box-shadow:0 12px 48px #183a6638;padding:20px}
    [hidden]{display:none!important}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}h2{margin:0;font-size:20px;color:#183e76}p{margin:8px 0;color:#53627a}label{display:block;font-weight:bold;margin:12px 0 6px}textarea{width:100%;min-height:116px;resize:vertical;padding:10px;border:1px solid #aebed3;border-radius:6px;background:white;font-family:Consolas,"Microsoft YaHei",monospace;font-size:13px}button.primary{background:#245cb3;color:#fff;border-color:#245cb3}button.danger{background:#a63c29;color:#fff;border-color:#a63c29}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.status{border-left:3px solid #245cb3;padding:8px 12px;background:#eaf1fb;white-space:pre-wrap}.summary{font-weight:bold;margin:12px 0}.table{max-height:290px;overflow:auto;border:1px solid #d0dbe9;background:white}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:9px 8px;text-align:left;border-bottom:1px solid #e1e7ef;vertical-align:top}th{position:sticky;top:0;background:#eaf0f8;white-space:nowrap}td:first-child{font-family:Consolas,monospace}small{color:#607289;display:block;word-break:break-all}.ok{color:#176645}.error{color:#a63c29}#consentLabel{font-weight:normal;display:flex;gap:8px;align-items:flex-start}#consent{margin-top:4px}
  </style><button id="launch">库存调整自动化</button><section id="panel" hidden aria-label="库存调整自动化"><header><h2>库存调整自动化</h2><button id="collapse">收起</button></header><p>按商品 ID 和完整 SKU 名称匹配，可选择清零库存或在原现货库存上增加数量。</p><div class="inventory-options"><label for="mode">操作模式<select id="mode"><option value="zero">库存清零</option><option value="add">添加现货库存</option></select></label><label id="quantityLabel" hidden>每个 SKU 增加数量 <input id="quantity" type="number" min="1" step="1" placeholder="例如 5"></label></div><label for="input">粘贴 Excel 两列：SPU · 简称</label><textarea id="input" spellcheck="false" placeholder="SPU&#9;简称&#10;完整商品ID&#9;完整SKU名称"></textarea><p>SPU 使用文本格式。相同 SPU 自动合并，重复记录自动去重。</p><div class="actions"><button id="preview" class="primary">预检匹配</button><button id="stop" disabled>停止</button><button id="export" disabled>导出结果</button><button id="clear" type="button">清空数据</button></div><div id="status" class="status" role="status" aria-live="polite">请在目标店铺的商品管理页面开始。</div><div id="summary" class="summary"></div><div class="table" hidden id="tableWrap"><table><thead><tr><th>SPU / SKU ID</th><th>简称 / 页面名称</th><th>库存变化</th><th>状态</th></tr></thead><tbody id="results"></tbody></table></div><label id="consentLabel"><input type="checkbox" id="consent" disabled><span>已核对店铺和命中 SKU，清零这些 SKU 的现货及预售库存，异常项跳过。</span></label><button id="execute" class="danger" disabled>执行清零并保存</button><p>停止后不再提交后续商品。若已提交保存，需核实结果后再重新预检。</p></section>`;
  const $=id=>shadow.getElementById(id);let runner=null,busy=false;
  function render(message){
    const adding=$('mode').value==='add';$('mode').disabled=busy;$('quantity').disabled=busy;$('quantityLabel').hidden=!adding;
    $('execute').textContent=adding?'执行添加并保存':'执行清零并保存';
    $('consentLabel').querySelector('span').textContent=adding?'已核对店铺、命中 SKU 和增加数量，仅增加现货库存，异常项跳过。':'已核对店铺和命中 SKU，清零这些 SKU 的现货及预售库存，异常项跳过。';
    if(message)$('status').textContent=message;
    const results=runner?.results||[];const matches=results.filter(r=>r.status==='匹配').length;
    $('preview').disabled=busy;$('input').disabled=busy;$('stop').disabled=!busy;$('export').disabled=!results.length;
    $('clear').disabled=busy;
    $('consent').disabled=busy||!runner?.ready||!matches;$('execute').disabled=busy||!runner?.ready||!matches||!$('consent').checked;
    $('tableWrap').hidden=!results.length;$('summary').textContent=runner?`${runner.shopName||'未识别店铺'} · ${results.length} 条记录 · ${matches} 条待执行`:'';
    $('results').replaceChildren();
    for(const item of results){const tr=document.createElement('tr');
      const id=document.createElement('td');id.textContent=item.spu;const sub=document.createElement('small');sub.textContent=item.skuId||'无唯一 SKU';id.append(sub);
      const name=document.createElement('td');name.textContent=item.name;const page=document.createElement('small');page.textContent=item.pageName||'';name.append(page);
      const stock=document.createElement('td');const row=item.after||item.before;stock.textContent=row?`现货 ${row.stock}；${row.presale.map(p=>p.label+' '+p.value).join('；')||'无预售档'}`:'—';
      if(item.quantity){const change=document.createElement('small');change.textContent=`现货 ${item.before.stock} + ${item.quantity} → ${item.targetStock}；预售不变`;stock.append(change);}
      const state=document.createElement('td');state.textContent=item.status;state.className=['匹配','已验证清零','已验证添加','原库存已为零'].includes(item.status)?'ok':'error';if(item.error){const detail=document.createElement('small');detail.textContent=item.error;state.append(detail);}tr.append(id,name,stock,state);$('results').append(tr);
    }
  }
  $('launch').onclick=()=>{$('panel').hidden=!$('panel').hidden;};$('collapse').onclick=()=>{$('panel').hidden=true;};
  $('input').oninput=()=>{if(runner)runner.ready=false;$('consent').checked=false;render('输入已变化，请重新预检');};
  $('mode').onchange=$('quantity').oninput=$('input').oninput;
  $('consent').onchange=()=>render();
  $('clear').onclick=()=>{if(busy)return;if(runner)runner.ready=false;runner=null;$('input').value='';$('consent').checked=false;render('已清空粘贴数据，请粘贴新数据后重新预检。');$('input').focus();};
  $('stop').onclick=()=>{runner?.stop();$('consent').checked=false;render();};
  async function task(fn){if(busy)return;busy=true;render();try{await fn();}catch(error){if(runner)runner.ready=false;$('status').textContent=`已停止：${error.message}\n如窗口中已有填写内容，请自行核对后保存或取消。`;}finally{busy=false;render();}}
  $('preview').onclick=()=>task(async()=>{$('consent').checked=false;runner=new root.StockZeroRunner.Runner(root.StockZeroBrowser,(_r,message)=>render(message));await runner.prepare($('input').value,{mode:$('mode').value,quantity:$('quantity').value});});
  $('execute').onclick=()=>task(async()=>{if(!$('consent').checked)throw Error('请先核对预览');await runner.execute();$('consent').checked=false;});
  $('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:'0.2.3',exportedAt:new Date().toISOString(),shop:runner.shopName,mode:runner.mode,quantity:runner.quantity,results:runner.results,log:runner.log},null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`库存调整结果_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
})(globalThis);






})();
