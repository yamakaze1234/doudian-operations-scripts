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
