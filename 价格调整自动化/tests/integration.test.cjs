const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {fixture}=require('./fixture.cjs');
const until=async(fn)=>{const end=Date.now()+20000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('集成流程超时');};
test('安装文件面板完整流程：售卖中价格入口、预检零保存、用户核对、标价保存回读',async()=>{
 const f=fixture({count:10});const w=f.d.window,doc=w.document;try{
  w.HTMLElement.prototype.getClientRects=function(){return this.isConnected&&!this.closest('[hidden]')?[{height:20}]:[];};
  const spu='3795722043610234968';f.root.remove();doc.body.innerHTML=`<div id="stock-zero-host">已有库存工具</div><div class="index_userName__16Isl">测试店</div><button role="tab" aria-selected="true">售卖中</button><button>重置</button><input placeholder="请输入商品名称/商品ID/商家编码，多条可用逗号隔开"><button>查询</button><table><thead><tr><th>商品信息</th><th>价格</th><th>总库存</th></tr></thead><tbody><tr data-row-key="${spu}"><td>ID：${spu}</td><td><a id="open"><span data-kora="修改价格"></span></a></td><td><a id="stock"><span data-kora="修改库存"></span></a></td></tr></tbody></table>`;
  let saved=structuredClone(f.records),saveCount=0,stockClicks=0;doc.getElementById('stock').onclick=()=>stockClicks++;
  doc.getElementById('open').onclick=()=>{f.records.forEach((r,i)=>Object.assign(r,saved[i]));doc.body.append(f.root);f.holder.scrollTop=0;f.holder.dispatchEvent(new w.Event('scroll'));};
  const list=doc.querySelector('tbody'),productRow=list.innerHTML;
  const bindOpen=()=>{doc.getElementById('open').onclick=()=>{f.records.forEach((r,i)=>Object.assign(r,saved[i]));doc.body.append(f.root);f.holder.scrollTop=0;f.holder.dispatchEvent(new w.Event('scroll'));};};
  let resetPending=false;
  [...doc.querySelectorAll('button')].find(b=>b.textContent==='重置').onclick=()=>{resetPending=true;w.setTimeout(()=>{list.innerHTML='<tr data-row-key="3812171617979728156"><td>ID：3812171617979728156</td><td>5799</td></tr>';resetPending=false;},650);};
  [...doc.querySelectorAll('button')].find(b=>b.textContent==='查询').onclick=()=>{list.innerHTML=productRow;bindOpen();};
  const [save,cancel]=f.root.querySelectorAll('button');save.onclick=()=>{saveCount++;saved=structuredClone(f.records);f.root.remove();};cancel.onclick=()=>f.root.remove();
  w.eval(fs.readFileSync(path.join(__dirname,'../抖店标价调整自动化.user.js'),'utf8'));
  const panel=doc.getElementById('price-adjust-host').shadowRoot;assert.ok(doc.getElementById('stock-zero-host'));
  panel.getElementById('launch').click();panel.getElementById('input').value=`${spu}\t${f.records[9].skuId}\t配置10:A\t6123.45`;
  panel.getElementById('preview').click();await until(()=>!panel.getElementById('preview').disabled);assert.match(panel.getElementById('status').textContent,/预检完成/);assert.equal(resetPending,false);assert.equal(saveCount,0);assert.equal(panel.getElementById('execute').disabled,true);
  const consent=panel.getElementById('consent');consent.checked=true;consent.dispatchEvent(new w.Event('change'));panel.getElementById('execute').click();await until(()=>!panel.getElementById('preview').disabled);
  assert.match(panel.getElementById('results').textContent,/已验证改价/);assert.equal(saved[9].cents,612345);assert.equal(saved[0].cents,500000);assert.equal(saved[9].code,'CODE9');assert.equal(stockClicks,0);assert.equal(saveCount,1);
 }finally{f.d.window.close();}
});
