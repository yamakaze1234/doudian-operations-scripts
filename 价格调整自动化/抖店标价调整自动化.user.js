// ==UserScript==
// @name         抖店标价调整自动化
// @namespace    local.douyin.price-adjust
// @version      0.1.2
// @description  按SPU和真实SKU精确匹配，批量修改标价，保存后完整回读验证。
// @match        https://fxg.jinritemai.com/ffa/g/list*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(function(){
"use strict";
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PriceAdjustCore=factory();})(globalThis,()=>{
  'use strict';
  const normalize=s=>String(s).normalize('NFKC').replace(/[丨｜]/g,'|').replace(/[\s\u200b\ufeff]+/g,'').toLowerCase();
  function money(value){const s=String(value).trim();if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw Error('标价必须为正数，最多两位小数');const [whole,fraction='']=s.split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(cents)||cents<=0||cents>999999999)throw Error('标价超出支持范围（0.01～9999999.99）');return cents;}
  const format=cents=>(cents/100).toFixed(2);
  function tsv(text){const rows=[];let row=[],cell='',quoted=false;const s=String(text).replace(/^\ufeff/,'').replace(/\r\n?/g,'\n');for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else cell+=c;}else if(!quoted&&(c==='\t'||c==='\n')){row.push(cell.trim());cell='';if(c==='\n'){if(row.some(Boolean))rows.push(row);row=[];}}else cell+=c;}if(quoted)throw Error('引号未闭合');row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;}
  function parse(text){
    const table=tsv(text);if(!table.length)throw Error('请粘贴 SPU、SKU、简称、售价');
    const names=table[0].map(normalize);const hasHeader=names.some(n=>['spu','商品id'].includes(n));let mapping;
    if(hasHeader){const find=aliases=>{const ids=names.map((n,i)=>aliases.includes(n)?i:-1).filter(i=>i>=0);if(ids.length>1)throw Error('表头列重复');return ids[0]??-1;};mapping={spu:find(['spu','商品id']),sku:find(['sku','skuid']),name:find(['简称','sku名称']),price:find(['售价','标价','价格'])};if(mapping.spu<0||mapping.name<0||mapping.price<0)throw Error('表头必须含 SPU、简称、售价（或标价）');table.shift();}
    const result=[],seen=new Map();
    table.forEach((cols,i)=>{const line=i+(hasHeader?2:1);if(!hasHeader&&![3,4].includes(cols.length))throw Error(`第 ${line} 行须为三列或四列`);const m=mapping||(cols.length===4?{spu:0,sku:1,name:2,price:3}:{spu:0,sku:-1,name:1,price:2});const spu=(cols[m.spu]||'').replace(/^'/,'');const skuId=(m.sku<0?'':cols[m.sku]||'').replace(/^'/,'');const name=cols[m.name]||'';
      if(!/^[1-9]\d{14,19}$/.test(spu)||skuId&&!/^[1-9]\d{9,19}$/.test(skuId))throw Error(`第 ${line} 行 ID 无效，请使用完整文本数字`);if(!normalize(name))throw Error(`第 ${line} 行简称为空`);let cents;try{cents=money(cols[m.price]||'');}catch(e){throw Error(`第 ${line} 行：${e.message}`);}
      const key=spu+'|'+(skuId||normalize(name));if(seen.has(key)){const old=seen.get(key);if(old.cents!==cents||normalize(old.name)!==normalize(name))throw Error(`第 ${line} 行重复 SKU 的名称或价格冲突`);return;}const r={spu,skuId,name,cents,line};seen.set(key,r);result.push(r);
    });if(!result.length)throw Error('没有有效数据行');return result;
  }
  function match(requested,catalog){
    const ids=new Set();for(const row of catalog){if(!/^[1-9]\d{9,19}$/.test(row.skuId)||ids.has(row.skuId))throw Error('真实 SKU ID 无效或重复');ids.add(row.skuId);}
    const results=requested.map(r=>{const found=catalog.filter(s=>r.skuId?s.skuId===r.skuId:normalize(s.name)===normalize(r.name));const status=found.length===0?'未匹配':found.length>1?'歧义':normalize(found[0].name)!==normalize(r.name)?'名称不一致':'匹配';return {...r,status,...(found.length===1?{skuId:found[0].skuId,pageName:found[0].name,before:found[0]}:{})};});
    const matched=new Map();for(const r of results.filter(r=>r.status==='匹配')){if(!matched.has(r.skuId))matched.set(r.skuId,[]);matched.get(r.skuId).push(r);}for(const group of matched.values())if(new Set(group.map(r=>r.cents)).size>1)group.forEach(r=>r.status='目标价格冲突');else group.slice(1).forEach(r=>r.status='重复目标已合并');return results;
  }
  return {normalize,money,format,parse,match};
});

(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));else root.PriceAdjustAdapter=factory(root.PriceAdjustCore);})(globalThis,C=>{
 'use strict';
 const text=e=>(e?.innerText??e?.textContent??'').trim();const compact=s=>s.replace(/\s/g,'');const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const one=(items,message)=>{if(items.length!==1)throw Error(message);return items[0];};
 function layout(root){
   const table=one([...root.querySelectorAll('.ecom-g-table')].filter(t=>[...t.querySelectorAll('th')].some(h=>compact(text(h))==='SKUID')),'无法唯一定位含 SKUID 的价格表');
   const headers=[...table.querySelectorAll('th')].map(h=>compact(text(h)));const index=label=>one(headers.map((s,i)=>s===label?i:-1).filter(i=>i>=0),`无法唯一定位“${label}”列`);
   const cols={price:index('价格'),sku:index('SKUID'),code:index('商家编码'),state:index('SKU状态')};
   if(headers[0]!=='配置')throw Error('暂不支持多规格价格表，请使用单列配置名称');
   const holder=one([...table.querySelectorAll('.ecom-g-table-tbody-virtual-holder')],'未知价格表滚动布局');
   return {table,holder,cols,headers};
 }
 function rowInfo(row,l){
   const cells=[...row.cells];if(cells.length!==l.headers.length)throw Error('价格行列数不一致');
   const input=one([...cells[l.cols.price].querySelectorAll('input[type="number"]')],'价格列没有唯一金额输入框');
   if(input.disabled||input.readOnly)throw Error('标价不可编辑');
   const skuId=text(cells[l.cols.sku]);if(!/^[1-9]\d{9,19}$/.test(skuId))throw Error('真实 SKU ID 不可读取');
   const name=text(cells[0]);if(!name)throw Error('配置名称缺失');
   const codeInputs=cells[l.cols.code].querySelectorAll('input');if(codeInputs.length>1)throw Error('商家编码结构异常');
   return {input,data:{skuId,name,cents:C.money(input.value),code:codeInputs.length?codeInputs[0].value:text(cells[l.cols.code]),state:text(cells[l.cols.state])}};
 }
 function visibleRows(l){return [...l.table.querySelectorAll('tr.ecom-g-table-row[data-row-key]')].filter(r=>r.querySelector('input'));}
 function coverage(l,rows){
   const h=l.holder,height=h.clientHeight,total=h.scrollHeight;if(height<=0||total<=0)throw Error('价格列表不可见');
   const top=h.getBoundingClientRect().top;const spans=rows.map(r=>{const b=r.getBoundingClientRect();return {start:b.top-top+h.scrollTop,end:b.bottom-top+h.scrollTop};}).sort((a,b)=>a.start-b.start);
   let cursor=h.scrollTop;for(const s of spans){if(s.end<=cursor)continue;if(s.start>cursor+2)return false;cursor=Math.max(cursor,s.end);}return cursor>=Math.min(total,h.scrollTop+height)-2;
 }
 async function walk(root,guard=()=>{},visit){
   const l=layout(root);const h=l.holder;const old=h.scrollTop;const collected=new Map(),skuKeys=new Map(),keySkus=new Map();let pos=0;const visited=new Set();
   try{for(let page=0;page<600;page++){
     guard();if(!root.isConnected)throw Error('价格窗口已关闭');h.scrollTop=pos;h.dispatchEvent(new h.ownerDocument.defaultView.Event('scroll',{bubbles:true}));await pause(80);
     const deadline=Date.now()+2500;let rows;
     while(true){guard();rows=visibleRows(l);if(coverage(l,rows))break;if(Date.now()>deadline)throw Error('虚拟价格列表未完整加载或滚动停滞');await pause(80);}
     for(const original of rows){guard();const key=original.getAttribute('data-row-key');const current=one(visibleRows(l).filter(r=>r.getAttribute('data-row-key')===key),'滚动行发生变化');let info=rowInfo(current,l);
       if(!key||(skuKeys.has(info.data.skuId)&&skuKeys.get(info.data.skuId)!==key)||(keySkus.has(key)&&keySkus.get(key)!==info.data.skuId))throw Error('虚拟行与 SKU ID 映射重复或变化');
       skuKeys.set(info.data.skuId,key);keySkus.set(key,info.data.skuId);
       if(visit&&!visited.has(info.data.skuId)){await visit(info,l,key);visited.add(info.data.skuId);info=rowInfo(one(visibleRows(l).filter(r=>r.getAttribute('data-row-key')===key),'写入后行丢失'),l);}
       const existing=collected.get(info.data.skuId);if(existing&&JSON.stringify(existing)!==JSON.stringify(info.data))throw Error('扫描期间 SKU 名称或标价变化');collected.set(info.data.skuId,info.data);
     }
     const max=Math.max(0,h.scrollHeight-h.clientHeight);if(h.scrollTop>=max-1){if(!collected.size)throw Error('SKU 列表为空');return [...collected.values()].sort((a,b)=>a.skuId.localeCompare(b.skuId));}
     const next=Math.min(max,h.scrollTop+Math.max(1,Math.floor(h.clientHeight/2)));if(next<=pos)throw Error('价格列表滚动无进展');pos=next;
   }throw Error('价格列表过长，停止扫描');}
   finally{if(h.isConnected){h.scrollTop=old;h.dispatchEvent(new h.ownerDocument.defaultView.Event('scroll',{bubbles:true}));}}
 }
 const scan=(root,guard)=>walk(root,guard);
 function assertSame(before,after){if(JSON.stringify(before)!==JSON.stringify(after))throw Error('SKU、标价、编码或状态已变化，请重新预检');}
 function assertPrices(before,after,targets){const expected=before.map(r=>{const t=targets.find(t=>t.skuId===r.skuId);return t?{...r,cents:t.cents}:r;});assertSame(expected,after);}
 function setInput(input,value){const win=input.ownerDocument.defaultView;Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new win.Event('input',{bubbles:true}));input.dispatchEvent(new win.Event('change',{bubbles:true}));input.dispatchEvent(new win.FocusEvent('blur',{bubbles:true}));}
 async function write(root,targets,before,guard=()=>{}){
   if(!targets.length||new Set(targets.map(t=>t.skuId)).size!==targets.length||targets.some(t=>!before.some(r=>r.skuId===t.skuId)||C.money(C.format(t.cents))!==t.cents))throw Error('目标标价或 SKU 无效');
   assertSame(before,await scan(root,guard));const done=new Set();
   await walk(root,guard,async(info)=>{const target=targets.find(t=>t.skuId===info.data.skuId);if(!target)return;guard();const old=before.find(r=>r.skuId===target.skuId);assertSame([old],[info.data]);if(info.data.cents!==target.cents){setInput(info.input,C.format(target.cents));await pause(100);}done.add(target.skuId);});
   if(done.size!==targets.length)throw Error('部分目标 SKU 未写入，停止保存');assertPrices(before,await scan(root,guard),targets);
 }
 return {text,scan,write,assertSame,assertPrices,setInput};
});

(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./adapter.js'));else root.PriceAdjustRunner=factory(root.PriceAdjustCore,root.PriceAdjustAdapter);})(globalThis,(C,A)=>{
  'use strict';
  class Runner{
    constructor(port,onUpdate=()=>{}){this.port=port;this.onUpdate=onUpdate;this.groups=[];this.results=[];this.stopped=false;this.ready=false;this.log=[];}
    emit(message){this.log.push({time:new Date().toISOString(),message});this.onUpdate(this,message);}
    stop(){this.stopped=true;this.ready=false;this.emit('已请求停止；已提交的保存需回读核实');}
    guard(){if(this.stopped)throw Error('任务已停止');if(this.port.shop()!==this.shopName)throw Error('当前店铺已改变，停止操作');}
    async prepare(input){
      this.ready=false;this.stopped=false;this.groups=[];this.results=[];this.shopName=this.port.shop();
      if(!this.shopName)throw Error('未识别当前店铺');
      const requested=C.parse(input);const map=new Map();for(const r of requested){if(!map.has(r.spu))map.set(r.spu,[]);map.get(r.spu).push(r);}
      for(const [spu,rows] of map){
        this.guard();this.emit(`正在预检 ${spu}`);await this.port.open(spu,()=>this.guard());this.guard();
        const baseline=await this.port.read(spu,()=>this.guard());const results=C.match(rows,baseline).map(r=>({...r,shop:this.shopName}));
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
          const fresh=await this.port.read(group.spu,()=>this.guard());A.assertSame(group.baseline,fresh);
          const changed=targets.filter(t=>t.before.cents!==t.cents);
          for(const t of targets)if(!changed.includes(t))t.status='原标价已相同';
          if(!changed.length){await this.port.close();this.emit(`${group.spu} 目标原标价已相同`);continue;}
          const targetsToWrite=changed.map(t=>({skuId:t.skuId,cents:t.cents}));
          await this.port.write(group.spu,targetsToWrite,fresh,()=>this.guard());this.guard();
          for(const t of changed)t.status='等待保存';this.emit(`正在保存 ${group.spu}`);
          saveAttempted=true;await this.port.save(()=>this.guard());
          this.guard();await this.port.open(group.spu,()=>this.guard());this.guard();
          const after=await this.port.read(group.spu,()=>this.guard());A.assertPrices(fresh,after,targetsToWrite);
          for(const t of changed){t.status='已验证改价';t.after=after.find(r=>r.skuId===t.skuId);t.verifiedAt=new Date().toISOString();}
          await this.port.close();this.emit(`${group.spu} 已保存并回读验证`);
        }catch(error){for(const t of targets)if(!['已验证改价','原标价已相同'].includes(t.status)){t.status=saveAttempted?'保存结果待核实':'已停止';t.error=error.message;}this.emit(error.message);throw error;}
      }
      this.emit('执行结束，已保存的目标均已回读验证');
    }
  }
  return {Runner};
});

(function(root){
 'use strict';
 const A=root.PriceAdjustAdapter,text=A.text,visible=e=>!!e&&e.isConnected&&e.getClientRects().length>0;let context=null;
 const compact=s=>s.replace(/\s/g,'');const one=(a,m)=>{if(a.length!==1)throw Error(m);return a[0];};const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const button=(root,label)=>one([...root.querySelectorAll('button')].filter(e=>visible(e)&&compact(text(e))===label),'无法唯一定位'+label+'按钮');
 const click=e=>{if(!visible(e)||e.disabled)throw Error('控件不可用');e.click();};
 async function wait(fn,message,guard=()=>{},ms=20000){const end=Date.now()+ms;while(Date.now()<end){guard();const result=fn();if(result)return result;await pause(150);}throw Error(message);}
 const modals=()=>[...document.querySelectorAll('.ecom-g-modal-content')].filter(visible);
 const priceModals=()=>modals().filter(e=>text(e).startsWith('编辑价格'));
 const shop=()=>{const nodes=[...document.querySelectorAll('[class*="index_userName__"]')].filter(visible);return nodes.length===1?text(nodes[0]):'';};
 const productRows=()=>[...document.querySelectorAll('tr[data-row-key]')].filter(r=>visible(r)&&!r.closest('.ecom-g-modal-content'));
 const findProduct=spu=>productRows().filter(r=>r.getAttribute('data-row-key')===spu&&text(r).includes(spu));
 async function settleList(guard,spu){
   let signature='',since=Date.now();
   return wait(()=>{
     const rows=productRows(),next=rows.map(r=>r.getAttribute('data-row-key')+'|'+text(r)).join('\n');
     if([...document.querySelectorAll('.ecom-g-spin-spinning')].some(visible)||next!==signature){signature=next;since=Date.now();return false;}
     if(Date.now()-since<900)return false;
     if(!spu)return true;
     const found=findProduct(spu);return found.length===1?found[0]:false;
   },spu?`查询结果未稳定显示商品 ${spu}`:'重置后的商品列表未稳定',guard);
 }
 function check(spu){
   if(!context||context.spu!==spu)throw Error('商品上下文不一致，请重新预检');
   if(shop()!==context.shop)throw Error('店铺已变化，请重新预检');
   if(!visible(context.modal)||priceModals().length!==1||priceModals()[0]!==context.modal)throw Error('价格窗口已关闭或替换，请重新预检');
   const rows=findProduct(spu);
   if(rows.length!==1)throw Error(`商品列表已刷新，无法唯一定位 ${spu}，请重新预检`);
   context.row=rows[0];
   return context.modal;
 }
 async function open(spu,guard=()=>{}){
   guard();if(modals().length||[...document.querySelectorAll('.auxo-drawer-open')].some(visible))throw Error('请先完成或取消已有编辑窗口');context=null;
   const tab=one([...document.querySelectorAll('[role="tab"]')].filter(e=>visible(e)&&compact(text(e))==='售卖中'),'找不到售卖中分类');
   if(tab.getAttribute('aria-selected')!=='true'){click(tab);await wait(()=>tab.getAttribute('aria-selected')==='true','切换售卖中失败',guard);await pause(350);}
   click(button(document,'重置'));await settleList(guard);guard();
   const input=one([...document.querySelectorAll('input')].filter(e=>visible(e)&&e.placeholder==='请输入商品名称/商品ID/商家编码，多条可用逗号隔开'),'找不到商品搜索框');A.setInput(input,spu);await pause(100);guard();click(button(document,'查询'));
   const row=await settleList(guard,spu);
   guard();if(tab.getAttribute('aria-selected')!=='true')throw Error('商品分类改变');
   const cols=[...row.closest('table').querySelectorAll('thead th')].map(e=>compact(text(e)));const priceIndex=cols.indexOf('价格');if(priceIndex<0)throw Error('商品列表没有价格列');
   const icon=one([...row.cells[priceIndex].querySelectorAll('[data-kora="修改价格"]')],'该商品价格列没有唯一编辑图标');const openingShop=shop();click(icon.closest('a')||icon);
   const modal=await wait(()=>{const m=priceModals();return m.length===1&&m[0].querySelector('tr.ecom-g-table-row input')?m[0]:false;},'价格窗口加载超时',guard);
   context={spu,shop:openingShop,row,modal};check(spu);guard();
 }
 async function read(spu,guard=()=>{}){const modal=check(spu);return A.scan(modal,()=>{guard();check(spu);});}
 async function write(spu,targets,before,guard=()=>{}){const modal=check(spu);return A.write(modal,targets,before,()=>{guard();check(spu);});}
 async function close(){if(!context)throw Error('缺少商品上下文');const modal=check(context.spu);click(button(modal,'取消'));await wait(()=>!visible(modal),'价格窗口未关闭');context=null;}
 async function save(guard=()=>{}){guard();if(!context)throw Error('缺少商品上下文');const modal=check(context.spu);click(button(modal,'保存'));await wait(()=>!visible(modal),'保存结果未知，窗口未关闭，请核实后再继续',()=>{},25000);context=null;}
 root.PriceAdjustBrowser={shop,open,read,write,close,save};
})(globalThis);

(function(root){
  'use strict';
  if(document.getElementById('price-adjust-host'))return;
  const host=document.createElement('div');host.id='price-adjust-host';document.body.append(host);const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML=`<style>
    :host{all:initial;font:14px/1.5 "Microsoft YaHei",sans-serif;color:#24344a}
    *{box-sizing:border-box}button,textarea{font:inherit}button{cursor:pointer;border:1px solid #c4d2e4;background:#fff;border-radius:6px;padding:8px 12px;color:#24344a}button:hover{background:#edf4fc}button:disabled{opacity:.45;cursor:not-allowed}
    #launch{position:fixed;left:22px;bottom:76px;z-index:2147483646;background:#166b66;color:white;border:0;box-shadow:0 3px 14px #0002}
    #panel{position:fixed;left:20px;top:80px;width:min(760px,calc(100vw - 40px));max-height:calc(100vh - 110px);overflow:auto;z-index:2147483646;background:#f5f8fc;border:1px solid #b7cbe4;border-radius:10px;box-shadow:0 12px 48px #183a6638;padding:20px}
    [hidden]{display:none!important}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}h2{margin:0;font-size:20px;color:#183e76}p{margin:8px 0;color:#53627a}label{display:block;font-weight:bold;margin:12px 0 6px}textarea{width:100%;min-height:116px;resize:vertical;padding:10px;border:1px solid #aebed3;border-radius:6px;background:white;font-family:Consolas,"Microsoft YaHei",monospace;font-size:13px}button.primary{background:#166b66;color:#fff;border-color:#166b66}button.danger{background:#a63c29;color:#fff;border-color:#a63c29}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.status{border-left:3px solid #166b66;padding:8px 12px;background:#eaf1fb;white-space:pre-wrap}.summary{font-weight:bold;margin:12px 0}.table{max-height:290px;overflow:auto;border:1px solid #d0dbe9;background:white}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:9px 8px;text-align:left;border-bottom:1px solid #e1e7ef;vertical-align:top}th{position:sticky;top:0;background:#eaf0f8;white-space:nowrap}td:first-child{font-family:Consolas,monospace}small{color:#607289;display:block;word-break:break-all}.ok{color:#176645}.error{color:#a63c29}#consentLabel{font-weight:normal;display:flex;gap:8px;align-items:flex-start}#consent{margin-top:4px}
  </style><button id="launch">标价调整自动化</button><section id="panel" hidden aria-label="标价调整自动化"><header><h2>标价调整自动化</h2><button id="collapse">收起</button></header><p>按 SPU 搜索，用 SKU ID 和简称核对，将售价写入弹窗“价格”栏作为新标价。</p><label for="input">粘贴 Excel 数据：SPU · SKU · 简称 · 售价</label><textarea id="input" spellcheck="false" placeholder="SPU&#9;SKU&#9;简称&#9;售价&#10;完整商品ID&#9;真实SKU ID&#9;完整SKU名称&#9;新标价"></textarea><p>SPU 使用文本格式。相同 SPU 自动合并，重复记录自动去重。</p><div class="actions"><button id="preview" class="primary">预检匹配</button><button id="stop" disabled>停止</button><button id="export" disabled>导出结果</button><button id="clear" type="button">清空数据</button></div><div id="status" class="status" role="status" aria-live="polite">请在目标店铺的商品管理页面开始。</div><div id="summary" class="summary"></div><div class="table" hidden id="tableWrap"><table><thead><tr><th>SPU / SKU ID</th><th>简称 / 页面名称</th><th>标价变化</th><th>状态</th></tr></thead><tbody id="results"></tbody></table></div><label id="consentLabel"><input type="checkbox" id="consent" disabled><span>已核对店铺和命中 SKU，按预览新标价修改这些 SKU，异常项跳过。</span></label><button id="execute" class="danger" disabled>执行改价并保存</button><p>停止后不再提交后续商品。若已提交保存，需核实结果后再重新预检。</p></section>`;
  const $=id=>shadow.getElementById(id);let runner=null,busy=false;
  function render(message){
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
      const stock=document.createElement('td');stock.textContent=item.before?`${root.PriceAdjustCore.format(item.before.cents)} → ${root.PriceAdjustCore.format(item.cents)}`:'—';if(item.before){const diff=document.createElement('small');const change=item.cents-item.before.cents;diff.textContent=`变动 ${change>=0?'+':'-'}${root.PriceAdjustCore.format(Math.abs(change))} 元`;stock.append(diff);}
      const state=document.createElement('td');state.textContent=item.status;state.className=['匹配','已验证改价','原标价已相同'].includes(item.status)?'ok':'error';if(item.error){const detail=document.createElement('small');detail.textContent=item.error;state.append(detail);}tr.append(id,name,stock,state);$('results').append(tr);
    }
  }
  $('launch').onclick=()=>{$('panel').hidden=!$('panel').hidden;};$('collapse').onclick=()=>{$('panel').hidden=true;};
  $('input').oninput=()=>{if(runner)runner.ready=false;$('consent').checked=false;render('输入已变化，请重新预检');};
  $('consent').onchange=()=>render();
  $('clear').onclick=()=>{if(busy)return;if(runner)runner.ready=false;runner=null;$('input').value='';$('consent').checked=false;render('已清空粘贴数据，请粘贴新数据后重新预检。');$('input').focus();};
  $('stop').onclick=()=>{runner?.stop();$('consent').checked=false;render();};
  async function task(fn){if(busy)return;busy=true;render();try{await fn();}catch(error){if(runner)runner.ready=false;$('status').textContent=`已停止：${error.message}\n如窗口中已有填写内容，请自行核对后保存或取消。`;}finally{busy=false;render();}}
  $('preview').onclick=()=>task(async()=>{$('consent').checked=false;runner=new root.PriceAdjustRunner.Runner(root.PriceAdjustBrowser,(_r,message)=>render(message));await runner.prepare($('input').value);});
  $('execute').onclick=()=>task(async()=>{if(!$('consent').checked)throw Error('请先核对预览');await runner.execute();$('consent').checked=false;});
  $('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:'0.1.2',exportedAt:new Date().toISOString(),shop:runner.shopName,results:runner.results,log:runner.log},null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`标价调整结果_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
})(globalThis);


})();
