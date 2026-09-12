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
