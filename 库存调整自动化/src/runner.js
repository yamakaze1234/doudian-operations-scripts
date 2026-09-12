(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./adapter.js'));else root.StockZeroRunner=factory(root.StockZeroCore,root.StockZeroAdapter);})(globalThis,(C,A)=>{
  'use strict';
  class Runner{
    constructor(port,onUpdate=()=>{}){this.port=port;this.onUpdate=onUpdate;this.groups=[];this.results=[];this.stopped=false;this.ready=false;this.log=[];}
    emit(message){this.log.push({time:new Date().toISOString(),message});this.onUpdate(this,message);}
    stop(){this.stopped=true;this.ready=false;this.emit('已请求停止；已提交的保存需回读核实');}
    guard(){if(this.stopped)throw Error('任务已停止');if(this.port.shop()!==this.shopName)throw Error('当前店铺已改变，停止操作');}
    async prepare(input,{mode='zero',quantity}={}){
      this.ready=false;this.stopped=false;this.groups=[];this.results=[];this.shopName=this.port.shop();
      if(!['zero','add'].includes(mode))throw Error('未知库存操作');this.mode=mode;
      if(mode==='add'&&(!/^[1-9]\d*$/.test(String(quantity))||!Number.isSafeInteger(Number(quantity))||Number(quantity)>10000000))throw Error('增加数量必须为 1～10000000 的整数');this.quantity=Number(quantity);
      if(!this.shopName)throw Error('未识别当前店铺');
      const requested=C.parse(input);const map=new Map();for(const r of requested){if(!map.has(r.spu))map.set(r.spu,[]);map.get(r.spu).push(r);}
      for(const [spu,rows] of map){
        this.guard();this.emit(`正在预检 ${spu}`);await this.port.open(spu,()=>this.guard());this.guard();
        const baseline=this.port.read(spu);const results=C.match(rows,baseline.rows).map(r=>({...r,shop:this.shopName,before:baseline.rows.find(s=>s.skuId===r.skuId)}));
        if(mode==='add'&&results.some(r=>r.status==='匹配')){const expected=A.addition(baseline,results.filter(r=>r.status==='匹配').map(r=>({skuId:r.skuId,quantity:this.quantity})));for(const r of results)if(r.status==='匹配'){r.quantity=this.quantity;r.targetStock=expected.rows.find(s=>s.skuId===r.skuId).stock;}}
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
          const fresh=this.port.read(group.spu);A.assertSame(group.baseline,fresh);
          const adding=this.mode==='add';const changed=targets.filter(t=>adding||t.before.stock!==0||t.before.presale.some(p=>p.value!==0));
          for(const t of targets)if(!changed.includes(t))t.status='原库存已为零';
          if(!changed.length){await this.port.close();this.emit(`${group.spu} 目标原库存已为零`);continue;}
          const ids=changed.map(t=>t.skuId);
          const additions=changed.map(t=>({skuId:t.skuId,quantity:t.quantity}));
          if(adding)await this.port.add(group.spu,additions,fresh,()=>this.guard());else await this.port.zero(group.spu,ids,fresh,()=>this.guard());this.guard();
          for(const t of changed)t.status='等待保存';this.emit(`正在保存 ${group.spu}`);
          saveAttempted=true;await this.port.save(()=>this.guard());
          const remaining=fresh.rows.filter(r=>!ids.includes(r.skuId)).reduce((n,r)=>n+r.stock+r.presale.reduce((s,p)=>s+p.value,0),0);
          this.guard();await this.port.open(group.spu,()=>this.guard(),{soldOutReadback:!adding&&remaining===0});this.guard();
          const after=this.port.read(group.spu);if(adding)A.assertAdded(fresh,after,additions);else A.assertZero(fresh,after,ids);
          for(const t of changed){t.status=adding?'已验证添加':'已验证清零';t.after=after.rows.find(r=>r.skuId===t.skuId);t.verifiedAt=new Date().toISOString();}
          await this.port.close();this.emit(`${group.spu} 已保存并回读验证`);
        }catch(error){for(const t of targets)if(!['已验证清零','已验证添加','原库存已为零'].includes(t.status)){t.status=saveAttempted?'保存结果待核实':'已停止';t.error=error.message;}this.emit(error.message);throw error;}
      }
      this.emit('执行结束，已保存的目标均已回读验证');
    }
  }
  return {Runner};
});

