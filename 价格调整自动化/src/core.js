(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PriceAdjustCore=factory();})(globalThis,()=>{
  'use strict';
  const normalize=s=>String(s).normalize('NFKC').replace(/[丨｜]/g,'|').replace(/[\s\u200b\ufeff]+/g,'').toLowerCase();
  function money(value){const s=String(value).trim();if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw Error('标价必须为正数，最多两位小数');const [whole,fraction='']=s.split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(cents)||cents<=0||cents>999999999)throw Error('标价超出支持范围（0.01～9999999.99）');return cents;}
  const format=cents=>(cents/100).toFixed(2);
  function tsv(text){const rows=[];let row=[],cell='',quoted=false;const s=String(text).replace(/^\ufeff/,'').replace(/\r\n?/g,'\n');for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else cell+=c;}else if(!quoted&&(c==='\t'||c==='\n')){row.push(cell.trim());cell='';if(c==='\n'){if(row.some(Boolean))rows.push(row);row=[];}}else cell+=c;}if(quoted)throw Error('引号未闭合');row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;}
  function parse(text){
    const table=tsv(text);if(!table.length)throw Error('请粘贴 SPU、SKU、简称、售价');
    const names=table[0].map(normalize);const hasHeader=names.some(n=>['spu','商品id'].includes(n));let mapping;
    if(hasHeader){const find=aliases=>{const ids=names.map((n,i)=>aliases.includes(n)?i:-1).filter(i=>i>=0);if(ids.length>1)throw Error('表头列重复');return ids[0]??-1;};mapping={spu:find(['spu','商品id']),sku:find(['sku','skuid']),name:find(['简称','sku名称']),price:find(['售价','标价','价格'])};if(mapping.spu<0||mapping.name<0||mapping.price<0)throw Error('表头必须含 SPU、简称、售价（或标价）');table.shift();}
    const result=[],seen=new Map();
    table.forEach((cols,i)=>{const line=i+(hasHeader?2:1);if(!hasHeader&&![3,4].includes(cols.length))throw Error(`第 ${line} 行须为三列或四列`);const m=mapping||(cols.length===4?{spu:0,sku:1,name:2,price:3}:{spu:0,sku:-1,name:1,price:2});const spu=(cols[m.spu]||'').replace(/^'/,'');const skuId=(m.sku<0?'':cols[m.sku]||'').replace(/^'/,'');const name=cols[m.name]||'';
      if(!/^[1-9]\d{14,19}$/.test(spu)||skuId&&!/^[1-9]\d{9,19}$/.test(skuId))throw Error(`第 ${line} 行 ID 无效，请使用完整文本数字`);if(!normalize(name))throw Error(`第 ${line} 行简称为空`);let cents;try{cents=money(cols[m.price]||'');}catch(e){throw Error(`第 ${line} 行：${e.message}`);}
      const key=spu+'|'+(skuId||normalize(name));if(seen.has(key)){const old=seen.get(key);if(old.cents!==cents||normalize(old.name)!==normalize(name))throw Error(`第 ${line} 行重复 SKU 的名称或价格冲突`);return;}const r={spu,skuId,name,cents,line};seen.set(key,r);result.push(r);
    });if(!result.length)throw Error('没有有效数据行');return result;
  }
  function match(requested,catalog){
    const ids=new Set();for(const row of catalog){if(!/^[1-9]\d{9,19}$/.test(row.skuId)||ids.has(row.skuId))throw Error('真实 SKU ID 无效或重复');ids.add(row.skuId);}
    const results=requested.map(r=>{const found=catalog.filter(s=>r.skuId?s.skuId===r.skuId:normalize(s.name)===normalize(r.name));const status=found.length===0?'未匹配':found.length>1?'歧义':normalize(found[0].name)!==normalize(r.name)?'名称不一致':'匹配';return {...r,status,...(found.length===1?{skuId:found[0].skuId,pageName:found[0].name,before:found[0]}:{})};});
    const matched=new Map();for(const r of results.filter(r=>r.status==='匹配')){if(!matched.has(r.skuId))matched.set(r.skuId,[]);matched.get(r.skuId).push(r);}for(const group of matched.values())if(new Set(group.map(r=>r.cents)).size>1)group.forEach(r=>r.status='目标价格冲突');else group.slice(1).forEach(r=>r.status='重复目标已合并');return results;
  }
  return {normalize,money,format,parse,match};
});
