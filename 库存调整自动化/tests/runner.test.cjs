const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const R=fs.existsSync(path.join(__dirname,'../src/runner.js'))?require('../src/runner.js'):{};
function setup(){const stats={saves:0,opens:0,shop:'测试店',failSave:false};const saved={spu:'3797174109784375687',total:10,rows:[{skuId:'3704940559033091',name:'配置1:A',stock:7,presale:[]},{skuId:'3704940559033092',name:'配置2:B',stock:3,presale:[]}]};let working;
  return {stats,saved,port:{shop:()=>stats.shop,open:async()=>{stats.opens++;working=structuredClone(saved);},read:()=>structuredClone(working),close:async()=>{},zero:async(_spu,ids)=>{for(const r of working.rows)if(ids.includes(r.skuId)){r.stock=0;r.presale=[];}working.total=working.rows.reduce((v,r)=>v+r.stock,0);},save:async()=>{stats.saves++;if(stats.failSave)throw Error('保存结果未知');Object.assign(saved,structuredClone(working));}}};}
test('预检不保存，执行后重新打开回读，非目标保留',async()=>{assert.equal(typeof R.Runner,'function');const f=setup();const r=new R.Runner(f.port);await r.prepare('3797174109784375687\t配置1:A');assert.equal(f.stats.saves,0);await r.execute();assert.equal(f.stats.saves,1);assert.equal(f.stats.opens,3);assert.equal(f.saved.rows[1].stock,3);assert.equal(r.results[0].status,'已验证清零');});
test('歧义或未匹配目标不提交保存',async()=>{assert.equal(typeof R.Runner,'function');const f=setup();const r=new R.Runner(f.port);await r.prepare('3797174109784375687\t不存在');await assert.rejects(()=>r.execute());assert.equal(f.stats.saves,0);});
test('预检后库存改变拒绝执行',async()=>{assert.equal(typeof R.Runner,'function');const f=setup();const r=new R.Runner(f.port);await r.prepare('3797174109784375687\t配置1:A');f.saved.rows[0].stock=6;await assert.rejects(()=>r.execute());assert.equal(f.stats.saves,0);});
test('店铺切换或停止不会保存',async()=>{assert.equal(typeof R.Runner,'function');for(const action of ['shop','stop']){const f=setup();const r=new R.Runner(f.port);await r.prepare('3797174109784375687\t配置1:A');if(action==='shop')f.stats.shop='其他店';else r.stop();await assert.rejects(()=>r.execute());assert.equal(f.stats.saves,0);}});
test('保存异常只尝试一次并标记待核实',async()=>{assert.equal(typeof R.Runner,'function');const f=setup();const r=new R.Runner(f.port);await r.prepare('3797174109784375687\t配置1:A');f.stats.failSave=true;await assert.rejects(()=>r.execute());assert.equal(f.stats.saves,1);assert.equal(r.results[0].status,'保存结果待核实');});
test('已经清零的SKU不会重复保存',async()=>{assert.equal(typeof R.Runner,'function');const f=setup();f.saved.rows[0].stock=0;f.saved.total=3;const r=new R.Runner(f.port);await r.prepare('3797174109784375687\t配置1:A');await r.execute();assert.equal(f.stats.saves,0);assert.equal(r.results[0].status,'原库存已为零');});
test('增加现货库存按原数累加，预售及非目标不变，回读后不能再次执行',async()=>{
 const f=setup();f.saved.rows[0].presale=[{label:'3天内',value:2}];f.saved.total=12;
 // Supply an independent port with staged state so the test also checks zero preflight writes.
 let state;f.port.open=async()=>{state=structuredClone(f.saved);};f.port.read=()=>structuredClone(state);
 f.port.add=async(_spu,targets)=>{for(const t of targets)state.rows.find(r=>r.skuId===t.skuId).stock+=t.quantity;state.total+=targets.reduce((n,t)=>n+t.quantity,0);};
 f.port.save=async()=>{f.stats.saves++;Object.assign(f.saved,structuredClone(state));};
 const r=new R.Runner(f.port);await r.prepare('3797174109784375687\t配置1:A',{mode:'add',quantity:5});
 assert.equal(f.saved.rows[0].stock,7);assert.equal(r.results[0].targetStock,12);
 await r.execute();assert.equal(f.saved.rows[0].stock,12);assert.equal(f.saved.rows[1].stock,3);assert.equal(f.saved.rows[0].presale[0].value,2);assert.equal(r.results[0].status,'已验证添加');assert.equal(f.stats.saves,1);await assert.rejects(()=>r.execute());
});
test('添加数量必须为正整数，超范围在预检拦截',async()=>{
 for(const quantity of [0,-1,1.5,'1e2',10000001]){const f=setup();const r=new R.Runner(f.port);await assert.rejects(()=>r.prepare('3797174109784375687\t配置1:A',{mode:'add',quantity}));assert.equal(f.stats.saves,0);}
 const f=setup();const r=new R.Runner(f.port);await assert.rejects(()=>r.prepare('3797174109784375687\t配置1:A',{mode:'add',quantity:10000000}));assert.equal(f.stats.saves,0);
});
