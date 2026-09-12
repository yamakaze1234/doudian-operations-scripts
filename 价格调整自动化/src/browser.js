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
