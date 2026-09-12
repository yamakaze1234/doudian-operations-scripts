(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StockZeroCore=api;})(globalThis,()=>{
  'use strict';
  const normalize=value=>String(value).normalize('NFKC').replace(/[丨｜]/g,'|').replace(/[\s\u200b\ufeff]+/g,'').toLowerCase();
  function parse(text){
    const table=[];let row=[],cell='',quoted=false;
    text=String(text).replace(/^\ufeff/,'').replace(/\r\n?/g,'\n');
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||cell===''){quoted=!quoted;}else cell+=c;}
      else if(!quoted&&(c==='\t'||c==='\n')){row.push(cell);cell='';if(c==='\n'){table.push(row);row=[];}}
      else cell+=c;
    }
    if(quoted)throw Error('引号未闭合，请重新复制两列');
    row.push(cell);table.push(row);
    const out=[],seen=new Set();
    for(let i=0;i<table.length;i++){
      const cols=table[i].map(s=>s.trim());if(cols.every(s=>!s))continue;
      if(i===0&&/^(spu|商品id)$/i.test(cols[0])&&/^(简称|sku名称)$/i.test(cols[1]))continue;
      if(cols.length!==2)throw Error(`第 ${i+1} 行需恰好两列：SPU、简称`);
      const spu=cols[0].replace(/^'/,'');const name=cols[1];
      if(!/^[1-9]\d{14,19}$/.test(spu))throw Error(`第 ${i+1} 行商品 ID 无效，请使用文本格式的完整数字`);
      if(!normalize(name))throw Error(`第 ${i+1} 行简称为空`);
      const key=spu+'\t'+normalize(name);if(seen.has(key))continue;seen.add(key);out.push({spu,name,line:i+1});
    }
    if(!out.length)throw Error('请粘贴 SPU 和简称两列');return out;
  }
  function match(requested,skus){
    const ids=new Set();for(const sku of skus){if(!/^[1-9]\d{9,19}$/.test(sku.skuId)||ids.has(sku.skuId))throw Error('页面 SKU ID 缺失或重复');ids.add(sku.skuId);}
    return requested.map(r=>{const found=skus.filter(s=>normalize(s.name)===normalize(r.name));return {...r,status:found.length===1?'匹配':found.length?'歧义':'未匹配',...(found.length===1?{skuId:found[0].skuId,pageName:found[0].name}:{}),candidates:found.map(s=>s.skuId)};});
  }
  return {normalize,parse,match};
});
