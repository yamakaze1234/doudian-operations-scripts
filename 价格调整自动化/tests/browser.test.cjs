const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {fixture}=require('./fixture.cjs');
test('同商品行重建可继续；商品消失、店铺改变或弹窗替换仍停止',async()=>{
 const f=fixture({count:1}),w=f.d.window,d=w.document,spu='3795722043610234968';
 try{
  f.root.remove();w.HTMLElement.prototype.getClientRects=function(){return this.isConnected?[{}]:[];};
  d.body.innerHTML=`<div class="index_userName__test">测试店</div><button role="tab" aria-selected="true">售卖中</button><button>重置</button><input placeholder="请输入商品名称/商品ID/商家编码，多条可用逗号隔开"><button>查询</button><table><thead><tr><th>商品信息</th><th>价格</th></tr></thead><tbody><tr data-row-key="${spu}"><td>ID：${spu}</td><td><a><span data-kora="修改价格"></span></a></td></tr></tbody></table>`;
  d.querySelector('a').onclick=()=>d.body.append(f.root);
  w.PriceAdjustAdapter={text:e=>(e.textContent||'').trim(),setInput:(e,v)=>{e.value=v;},scan:async(m,guard)=>{guard();return [];}};
  w.eval(fs.readFileSync(path.join(__dirname,'../src/browser.js'),'utf8'));
  const port=w.PriceAdjustBrowser;await port.open(spu);
  let row=d.querySelector('tbody tr');const replacement=row.cloneNode(true);row.replaceWith(replacement);
  await assert.doesNotReject(()=>port.read(spu));
  replacement.remove();await assert.rejects(()=>port.read(spu),/商品列表已刷新/);
  d.querySelector('tbody').append(replacement);
  const shop=d.querySelector('[class*=index_userName]');shop.textContent='另一店';await assert.rejects(()=>port.read(spu),/店铺已变化/);shop.textContent='测试店';
  f.root.replaceWith(f.root.cloneNode(true));await assert.rejects(()=>port.read(spu),/价格窗口已关闭或替换/);
 }finally{w.close();}
});
