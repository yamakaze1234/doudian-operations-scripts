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
