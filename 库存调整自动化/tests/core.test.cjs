const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const C=fs.existsSync(require('node:path').join(__dirname,'../src/core.js'))?require('../src/core.js'):{};
const spu='3797174109784375687';
test('19位SPU保持原字符串，支持Excel标题和带换行引号',()=>{
  assert.equal(typeof C.parse,'function');
  const rows=C.parse(`SPU\t简称\r\n${spu}\t"配置19：270K+5070Ti+48G+1T\n丨豪华版"`);
  assert.equal(rows[0].spu,spu);assert.match(rows[0].name,/豪华版/);
});
test('拒绝科学计数法、空名称和多余列',()=>{
  assert.equal(typeof C.parse,'function');
  for(const text of ['3.797174109784E+18\t配置19',`${spu}\t`,`${spu}\t配置19\t0`]) assert.throws(()=>C.parse(text));
});
test('同商品重复输入合并，不合并跨SPU同名',()=>{
  assert.equal(typeof C.parse,'function');
  assert.equal(C.parse(`${spu}\t配置19：A\n${spu}\t配置19: A\n3797174109784375688\t配置19:A`).length,2);
});
test('全半角、空白及竖线差异可匹配，型号与容量差异不可匹配',()=>{
  assert.equal(typeof C.normalize,'function');
  assert.equal(C.normalize('配置19：270K+5070Ti+48G+1T 丨豪华版'),C.normalize('配置19: 270k+5070ti+48G+1T | 豪华版'));
  for(const [a,b] of [['5090','5090 D'],['48G','48GB'],['1T','2T'],['配置1:A','配置11:A']]) assert.notEqual(C.normalize(a),C.normalize(b));
});
test('只接受唯一真实SKU，歧义与缺失不写入',()=>{
  assert.equal(typeof C.match,'function');
  const requested=[{spu,name:'配置1:A'},{spu,name:'配置2:B'}];
  const result=C.match(requested,[{skuId:'3704940559033090',name:'配置1：A'},{skuId:'3704940559033346',name:'配置1:A'}]);
  assert.deepEqual(result.map(r=>r.status),['歧义','未匹配']);
  assert.throws(()=>C.match(requested,[{skuId:'0',name:'配置1:A'}]));
});
test('唯一匹配保留真实SKU ID',()=>{
  assert.equal(typeof C.match,'function');
  assert.equal(C.match([{spu,name:'配置1:A'}],[{skuId:'3704940559033090',name:'配置1:A'}])[0].skuId,'3704940559033090');
});
