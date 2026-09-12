const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const spu='3797174109784375687';
function setup(){
  const dom=new JSDOM(`<div class="index_userName__16Isl">测试店</div><button role="tab" aria-selected="true">全部</button><button role="tab" aria-selected="false">售卖中</button><button role="tab" aria-selected="false">已售罄</button><button id="reset">重置</button><input placeholder="请输入商品名称/商品ID/商家编码，多条可用逗号隔开"><button id="query">查询</button><table><thead><tr><th>商品信息</th><th>总库存</th></tr></thead><tbody><tr data-row-key="${spu}"><td>ID：${spu}</td><td><a id="open"><span data-kora="修改库存"></span></a></td></tr></tbody></table>`,{url:'https://fxg.jinritemai.com/ffa/g/list',runScripts:'outside-only',pretendToBeVisual:true});
  const {window:w}=dom;w.HTMLElement.prototype.getClientRects=function(){return this.isConnected&&!this.closest('[hidden]')?[{width:100,height:20}]:[];};
  let records=[{name:'配置1:A',skuId:'3704940559033091',stock:5,pre:2},{name:'配置2:B',skuId:'3704940559033092',stock:3,pre:1}];const stats={saved:0,openedTabs:[]};
  for(const tab of w.document.querySelectorAll('[role="tab"]'))tab.onclick=()=>{for(const t of w.document.querySelectorAll('[role="tab"]'))t.setAttribute("aria-selected",String(t===tab));};
  w.document.getElementById('open').onclick=()=>{
    stats.openedTabs.push(w.document.querySelector('[aria-selected="true"]').textContent);
    const drawer=w.document.createElement('div');drawer.className='auxo-drawer-open';drawer.innerHTML=`<div class="auxo-drawer-body"><div>商品ID: ${spu}</div><div>库存类型: 普通库存</div><div>商品总库存: ${records.reduce((v,r)=>v+r.stock+r.pre,0)}</div><div class="optimus_fems-table"><table><thead><tr>${['SKU信息','现货库存增减','改后现货库存','预售库存','占用库存','未占用库存'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${records.map(r=>`<tr><td><div class="skuName-test">${r.name}</div><div>SKU ID: ${r.skuId}</div></td><td><input data-kora="库存增减-输入框"></td><td><input value="${r.stock}"></td><td><div>5天内<input value="${r.pre}"></div></td><td>-</td><td>${r.stock+r.pre}</td></tr>`).join('')}</tbody></table></div><button id="cancel">取 消</button><button id="save">保 存</button></div>`;
    w.document.body.append(drawer);drawer.querySelector('#cancel').onclick=()=>drawer.remove();drawer.querySelector('#save').onclick=()=>{records=[...drawer.querySelectorAll('tbody tr')].map((r,i)=>({...records[i],stock:Number(r.children[2].querySelector('input').value),pre:Number(r.children[3].querySelector('input').value)}));stats.saved++;drawer.remove();};
  };
  for(const file of ['core.js','adapter.js','runner.js','browser.js','panel.js'])w.eval(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'));
  return {dom,w,stats,records:()=>records};
}
const until=async(fn)=>{const end=Date.now()+10000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('面板流程超时');};
test('添加模式面板：显示增量预览，改数量使预检失效，重新预检后仅现货增加',async()=>{
 const f=setup();try{const p=f.w.document.getElementById('stock-zero-host').shadowRoot;
 p.getElementById('mode').value='add';p.getElementById('mode').dispatchEvent(new f.w.Event('change'));p.getElementById('quantity').value='4';p.getElementById('input').value=`${spu}\t配置1:A`;
 p.getElementById('preview').click();await until(()=>!p.getElementById('preview').disabled);assert.match(p.getElementById('results').textContent,/5 \+ 4 → 9/);assert.equal(f.stats.saved,0);
 p.getElementById('quantity').value='6';p.getElementById('quantity').dispatchEvent(new f.w.Event('input'));assert.equal(p.getElementById('execute').disabled,true);assert.equal(p.getElementById('consent').disabled,true);
 p.getElementById('preview').click();await until(()=>!p.getElementById('preview').disabled);p.getElementById('consent').checked=true;p.getElementById('consent').dispatchEvent(new f.w.Event('change'));p.getElementById('execute').click();await until(()=>!p.getElementById('preview').disabled);
 assert.equal(f.records()[0].stock,11);assert.equal(f.records()[0].pre,2);assert.equal(f.records()[1].stock,3);assert.equal(f.stats.saved,1);assert.match(p.getElementById('results').textContent,/已验证添加/);
 }finally{f.dom.window.close();}
});
test('面板完整流程：预检无保存、核对后执行、回读成功且其他SKU不变',async()=>{
  const f=setup();try{const panel=f.w.document.getElementById('stock-zero-host').shadowRoot;
    panel.getElementById('launch').click();assert.equal(panel.getElementById('panel').hidden,false);
    panel.getElementById('input').value=`${spu}\t配置1:A`;
    panel.getElementById('preview').click();await until(()=>!panel.getElementById('preview').disabled);
    assert.equal(f.stats.saved,0);assert.match(panel.getElementById('status').textContent,/预检完成/);assert.equal(panel.getElementById('execute').disabled,true);
    const check=panel.getElementById('consent');check.checked=true;check.dispatchEvent(new f.w.Event('change'));assert.equal(panel.getElementById('execute').disabled,false);
    panel.getElementById('execute').click();await until(()=>!panel.getElementById('preview').disabled);
    assert.deepEqual(f.stats.openedTabs,['售卖中','售卖中','售卖中']);assert.equal(f.stats.saved,1);assert.equal(f.records()[0].stock,0);assert.equal(f.records()[0].pre,0);assert.equal(f.records()[1].stock,3);assert.equal(f.records()[1].pre,1);assert.match(panel.getElementById('results').textContent,/已验证清零/);
  }finally{f.dom.window.close();}
});
test('输入编辑使预检作废，页面已有编辑窗口时拒绝开始',async()=>{
  const f=setup();try{const panel=f.w.document.getElementById('stock-zero-host').shadowRoot;f.w.document.getElementById('open').click();panel.getElementById('input').value=`${spu}\t配置1:A`;panel.getElementById('preview').click();await until(()=>!panel.getElementById('preview').disabled);assert.match(panel.getElementById('status').textContent,/已有编辑窗口/);assert.equal(f.stats.saved,0);assert.equal(panel.getElementById('execute').disabled,true);}finally{f.dom.window.close();}
});

test('整商品清零后只读回查已售罄，写入仍从售卖中进入',async()=>{
 const f=setup();try{const runner=new f.w.StockZeroRunner.Runner(f.w.StockZeroBrowser);await runner.prepare(`${spu}\t配置1:A\n${spu}\t配置2:B`);await runner.execute();assert.deepEqual(f.stats.openedTabs,['售卖中','售卖中','已售罄']);assert.equal(f.stats.saved,1);assert.ok(runner.results.every(r=>r.status==='已验证清零'));}finally{f.dom.window.close();}
});
