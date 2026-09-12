const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {JSDOM}=require('jsdom');
const A=fs.existsSync(path.join(__dirname,'../src/adapter.js'))?require('../src/adapter.js'):{};
const spu='3797174109784375687';
function fixture(){return new JSDOM(`<div class="auxo-drawer-body"><div>商品ID: ${spu}</div><div>库存类型: 普通库存</div><div>商品总库存: 16</div><div class="optimus_fems-table"><table><thead><tr>${['SKU信息','现货库存增减','改后现货库存','预售库存','占用库存','未占用库存'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${[1,2].map((n)=>`<tr data-row-key="sku_${n}"><td><div class="skuName-test">配置${n}：A</div><div>SKU ID: 370494055903309${n}</div></td><td><input data-kora="库存增减-输入框" value=""></td><td><input value="5"></td><td><div>3天内<input value="2"></div><div>5天内<input value="1"></div></td><td>-</td><td>8<button>清零</button></td></tr>`).join('')}</tbody></table></div><button>保 存</button><button>取 消</button></div>`);}
test('读取真实SKU ID、现货及多档预售',()=>{assert.equal(typeof A.read,'function');const d=fixture();const s=A.read(d.window.document.querySelector('.auxo-drawer-body'),spu);assert.equal(s.rows.length,2);assert.equal(s.rows[0].stock,5);assert.deepEqual(s.rows[0].presale,[{label:'3天内',value:2},{label:'5天内',value:1}]);assert.equal(s.total,16);});
test('完整性核验拒绝漏行及错误商品',()=>{assert.equal(typeof A.read,'function');const d=fixture();const r=d.window.document.querySelector('.auxo-drawer-body');assert.throws(()=>A.read(r,'3797174109784375688'));d.window.document.querySelector('tbody tr').remove();assert.throws(()=>A.read(r,spu));});
test('拒绝已有未保存增减、非数字库存和占用库存',()=>{assert.equal(typeof A.read,'function');for(const [selector,value] of [['td:nth-child(2) input','1'],['td:nth-child(3) input',''],['td:nth-child(5)','2']]){const d=fixture();const e=d.window.document.querySelector(selector);if(e.tagName==='INPUT')e.value=value;else e.textContent=value;assert.throws(()=>A.read(d.window.document.querySelector('.auxo-drawer-body'),spu));}});
test('只修改目标SKU，输入事件正常触发，所有预售档均为零',async()=>{assert.equal(typeof A.zero,'function');const d=fixture();const root=d.window.document.querySelector('.auxo-drawer-body');const before=A.read(root,spu);let events=0;root.addEventListener('input',()=>events++);await A.zero(root,spu,['3704940559033091'],before);const after=A.read(root,spu,{staged:true});assert.equal(events,3);assert.equal(after.rows[0].stock,0);assert.ok(after.rows[0].presale.every(p=>p.value===0));assert.deepEqual(after.rows[1],before.rows[1]);});
test('写入前发现SKU名称改变则零写入',async()=>{assert.equal(typeof A.zero,'function');const d=fixture();const root=d.window.document.querySelector('.auxo-drawer-body');const before=A.read(root,spu);root.querySelector('[class^="skuName-"]').textContent='配置1：B';await assert.rejects(()=>A.zero(root,spu,['3704940559033091'],before));assert.equal(root.querySelector('td:nth-child(3) input').value,'5');});
test('执行前目标ID不存在则零写入',async()=>{assert.equal(typeof A.zero,'function');const d=fixture();const root=d.window.document.querySelector('.auxo-drawer-body');const before=A.read(root,spu);await assert.rejects(()=>A.zero(root,spu,['3700000000000000'],before));assert.equal(root.querySelector('td:nth-child(3) input').value,'5');});
module.exports={fixture,spu};
test('添加仅写现货，所有预售档和非目标保留；越界在写入前拦截',async()=>{
 const d=fixture(),root=d.window.document.querySelector('.auxo-drawer-body');try{const before=A.read(root,spu);let events=0;root.addEventListener('input',()=>events++);
 await assert.rejects(()=>A.add(root,spu,[{skuId:before.rows[0].skuId,quantity:10000000}],before));assert.equal(events,0);
 await A.add(root,spu,[{skuId:before.rows[0].skuId,quantity:4}],before);const after=A.read(root,spu,{staged:true});assert.equal(after.rows[0].stock,9);assert.equal(events,1);assert.deepEqual(after.rows[0].presale,before.rows[0].presale);assert.deepEqual(after.rows[1],before.rows[1]);
 }finally{d.window.close();}
});
function spotFixture(title='改后现货库存'){
  const d=fixture();const doc=d.window.document;
  doc.querySelector('thead tr').children[3].remove();
  doc.querySelector('thead tr').children[2].textContent=title;
  for(const tr of doc.querySelectorAll('tbody tr')){tr.children[3].remove();tr.lastElementChild.textContent='5';}
  doc.querySelector('.auxo-drawer-body').children[2].textContent='商品总库存: 10';
  return d;
}
test('无预售列时只清零现货，支持改后现货库存和现货库存标题',async()=>{
  for(const title of ['改后现货库存','现货库存']){
    const d=spotFixture(title);const root=d.window.document.querySelector('.auxo-drawer-body');
    const before=A.read(root,spu);assert.deepEqual(before.rows[0].presale,[]);
    let events=0;root.addEventListener('input',()=>events++);
    await A.zero(root,spu,['3704940559033091'],before);
    const after=A.read(root,spu,{staged:true});assert.equal(events,1);assert.equal(after.rows[0].stock,0);assert.deepEqual(after.rows[0].presale,[]);assert.deepEqual(after.rows[1],before.rows[1]);
    d.window.close();
  }
});
test('保留空预售列且未设置档位时允许只有现货',()=>{
  const d=fixture();for(const tr of d.window.document.querySelectorAll('tbody tr'))tr.children[3].textContent='未设置预售';
  const root=d.window.document.querySelector('.auxo-drawer-body');root.children[2].textContent='商品总库存: 10';
  assert.deepEqual(A.read(root,spu).rows[0].presale,[]);d.window.close();
});
test('不能把未识别的预售列当作纯现货',()=>{
  const d=fixture();d.window.document.querySelector('thead tr').children[3].textContent='改后预售库存';
  assert.throws(()=>A.read(d.window.document.querySelector('.auxo-drawer-body'),spu),/预售/);d.window.close();
});
function actualSpotFixture(){
  const d=spotFixture();const doc=d.window.document;const head=doc.querySelector('thead tr');
  head.children[1].textContent='当前库存';head.children[2].textContent='库存增减';
  const th=doc.createElement('th');th.textContent='改后库存';head.insertBefore(th,head.children[3]);
  for(const row of doc.querySelectorAll('tbody tr')){
    const delta=row.children[1];const final=row.children[2];
    final.querySelector('input').setAttribute('data-kora','修改后库存');
    const current=doc.createElement('td');current.textContent='5';row.insertBefore(current,delta);
  }
  return d;
}
test('实查纯现货布局：读取改后库存并只写目标输入框，保留当前库存展示',async()=>{
  const d=actualSpotFixture();const root=d.window.document.querySelector('.auxo-drawer-body');const before=A.read(root,spu);
  assert.equal(before.rows[0].stock,5);await A.zero(root,spu,['3704940559033091'],before);
  const after=A.read(root,spu,{staged:true});assert.equal(after.rows[0].stock,0);assert.deepEqual(after.rows[1],before.rows[1]);
  assert.equal(root.querySelector('tbody tr').cells[1].textContent,'5');assert.equal(root.querySelector('[data-kora="修改后库存"]').value,'0');d.window.close();
});
test('纯现货当前库存与改后库存不一致时拒绝预检，防止覆盖未保存修改',()=>{
  const d=actualSpotFixture();const root=d.window.document.querySelector('.auxo-drawer-body');
  const inputs=root.querySelectorAll('[data-kora="修改后库存"]');inputs[0].value='4';inputs[1].value='6';
  assert.throws(()=>A.read(root,spu),/未保存/);d.window.close();
});
