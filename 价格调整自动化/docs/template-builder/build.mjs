import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Workbook,SpreadsheetFile,FileBlob} from '@oai/artifact-tool';
const here=path.dirname(fileURLToPath(import.meta.url));
const base=path.resolve(here,'../..');
const out=path.resolve(base,'../outputs/01a08923-1e84-79f0-9d28-529c77201968');
await fs.mkdir(out,{recursive:true});
const source=await fs.readFile(path.join(base,'导入数据/幻翼黑_3795722043610234968_标价导入.txt'),'utf8');
const data=source.trim().split(/\r?\n/).slice(1).map(line=>{const [spu,sku,name,price]=line.split('\t');return [spu,sku,name,Number(price)];});
if(data.length!==20)throw Error('示例行数不符');
const wb=Workbook.create();
const result=wb.worksheets.add('自动整理');
for(const [name,example] of [['原始粘贴',false],['幻翼黑示例',true]]){
 const s=wb.worksheets.add(name);s.showGridLines=false;s.tabColor=example?'#4F78AC':'#166B66';
 s.getRange('A1:H3001').format.font={name:'Arial',size:11};
 s.getRange('A1:D3001').format.rowHeight=25;s.getRange('A1:D3001').format.verticalAlignment='center';
 s.getRange('A1:B3001').setNumberFormat('@');s.getRange('C1:C3001').setNumberFormat('@');s.getRange('D2:D3001').setNumberFormat('0.00');
 s.getRange('A1:B3001').format.columnWidth=25;s.getRange('C1:C3001').format.columnWidth=55;s.getRange('D1:D3001').format.columnWidth=15;s.getRange('E1:E20').format.columnWidth=3;s.getRange('F1:H20').format.columnWidth=15;
 s.getRange('A1:D1').values=[['SPU','SKU','简称','售价']];
 if(example)s.getRange('A2:D21').values=data;
 const table=s.tables.add(`A1:D${example?21:3001}`,true,example?'PriceExample':'PriceImport');table.showFilterButton=true;table.showTotals=false;
 s.getRange('A1:D1').format={fill:'#166B66',font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},horizontalAlignment:'center',rowHeight:30};
 s.getRange(`A2:C${example?21:3001}`).format.fill='#F1F6F8';s.getRange(`D2:D${example?21:3001}`).format.fill='#FFF2CC';
 s.getRange('A2:C3001').format.horizontalAlignment='left';s.getRange('D2:D3001').format.horizontalAlignment='right';s.getRange('C2:C3001').format.wrapText=true;
 s.freezePanes.freezeRows(1);
 s.getRange('A1:C3001').setNumberFormat('@');
 s.getRange('D2:D3001').setNumberFormat('0.00');
 const notes=[example?'幻翼黑 · 20条示例':'标价调整 · 填写说明',
   '从 A2 粘贴四列数据，可包含分组行。整理结果在“自动整理”表。',
   'SPU、SKU 已设文本格式；粘贴时选“仅粘贴值”，保留模板格式。',
   '简称填写完整 SKU 名称。SKU 可留空，此时按完整简称唯一匹配。',
   '黄色售价列填写新标价（元），大于 0，最多两位小数。',
   '最多 3000 行（含分隔行）。换一批前先清空 A2:D3001，再仅粘贴值。',
   '导入方式：复制粘贴；暂不支持上传文件。',
   example?'来源：用户提供的幻翼黑清单，保留原值。':'请参考“幻翼黑示例”表填写。'];
 notes.forEach((text,i)=>{const row=i+1;s.mergeCells(`F${row}:H${row}`);s.getRange(`F${row}`).values=[[text]];s.getRange(`F${row}:H${row}`).format={wrapText:true,verticalAlignment:'center',rowHeight:i===0?30:48,font:{name:'Arial',size:11,color:'#405269',bold:i===0},fill:i===0?'#E2ECEF':'#FFFFFF'};});
}
const raw=wb.worksheets.getItem('原始粘贴');
raw.getRange('I1:J1').values=[['行处理','导出序号']];
raw.getRange('I1:I3001').format.columnWidth=25;
const helpers=[];
for(let r=2;r<=3001;r++)helpers.push([
 `=IF(AND(A${r}="",B${r}="",C${r}="",D${r}=""),"空行",IF(AND(OR(A${r}="SPU",A${r}="商品id"),OR(C${r}="简称",C${r}="SKU名称")),"表头",IF(AND(A${r}<>"",B${r}="",C${r}="",D${r}="",OR(LEFT(A${r},1)<"0",LEFT(A${r},1)>"9")),"分组行",IF(OR(A${r}="",C${r}="",D${r}=""),"缺少必填项，保留","保留"))))`,
 `=IF(OR(I${r}="保留",I${r}="缺少必填项，保留"),K${r},"")`
]);
raw.getRange('I2:J3001').formulas=helpers;
raw.getRange('K1').values=[[0]];
raw.getRange('K2:K3001').formulas=Array.from({length:3000},(_,i)=>[`=K${i+1}+IF(OR(I${i+2}="保留",I${i+2}="缺少必填项，保留"),1,0)`]);
result.showGridLines=false;result.freezePanes.freezeRows(1);
result.getRange('A1:D1').values=[['SPU','SKU','简称','售价']];
result.getRange('A1:J3001').format.font={name:'Arial',size:11};
result.getRange('A1:B3001').format.columnWidth=25;result.getRange('C1:C3001').format.columnWidth=55;result.getRange('D1:D3001').format.columnWidth=15;
result.getRange('A1:D3001').format.rowHeight=28;
result.getRange('A1:D1').format.fill='#166B66';result.getRange('A1:D1').format.font={bold:true,color:'#FFFFFF'};
result.getRange('A2:C3001').setNumberFormat('@');result.getRange('D2:D3001').setNumberFormat('0.00');
result.getRange('F1:H1').values=[['整理后行数','跳过分组行','缺少必填项']];
result.getRange('F2:H2').formulas=[["=COUNT('原始粘贴'!J2:J3001)","=COUNTIFS('原始粘贴'!I2:I3001,\"分组行\")","=COUNTIFS('原始粘贴'!I2:I3001,\"缺少必填项，保留\")"]];
result.getRange('F1:H8').format.columnWidth=18;
for(const [r,t] of [[4,'先到“原始粘贴”A2，仅粘贴四列值。'],[5,'复制本表 A1:D3001 到价格工具预检。'],[6,'空行、分组行和重复表头自动跳过。'],[7,'缺少必填项会保留，请回原始表补齐。'],[8,'最多 3000 行；使用 Excel 自动计算模式。']]){result.mergeCells(`F${r}:H${r}`);result.getRange(`F${r}`).values=[[t]];result.getRange(`F${r}:H${r}`).format.wrapText=true;}
result.getRange('J1').values=[['来源行号']];
const output=[],lookup=[];
for(let r=2;r<=3001;r++){
 lookup.push([`=IF('原始粘贴'!J${r}="","",ROW())`]);
 output.push(['A','B','C','D'].map(c=>`=IF($J${r}="","",IF('原始粘贴'!${c}${r}="","",'原始粘贴'!${c}${r}${c==='D'?'':'&""'}))`));
}
result.getRange('J2:J3001').formulas=lookup;result.getRange('A2:D3001').formulas=output;
// Exercise live formulas with group, blank, repeated header, and incomplete product rows.
raw.getRange('A2:D26').values=[['幻翼黑3795722043610234968','','',''],...data.slice(0,10),['','','',''],['SPU','SKU','简称','售价'],...data.slice(10),[data[0][0],data[0][1],data[0][2],''],['3795722043610234968','','','']];
wb.recalculate();
if(result.getRange('F2:H2').values[0].join(',')!=='22,1,2')throw Error(JSON.stringify({counts:result.getRange('F2:H2').values,helpers:raw.getRange('I2:J26').values}));
// Artifact calculation coerces numeric-looking text to Number (including text cells).
// Verify row selection and prices here; source IDs remain exact strings in XLSX.
const evaluated=result.getRange('A2:D24').values.filter(r=>r[0]!==null&&r[0]!=='');
if(evaluated.some((r,i)=>r[2]!==data[i][2]||r[3]!==data[i][3]||Number(r[0])!==Number(data[i][0])||Number(r[1])!==Number(data[i][1])))throw Error(JSON.stringify({eval:evaluated.slice(0,2),lookup:result.getRange("J2:J3").values,raw:raw.getRange("I2:K4").values}));
raw.getRange('A2:D3001').values=Array.from({length:3000},()=>[null,null,null,null]);
raw.getRange('A3001:D3001').values=[data[19]];
wb.recalculate();
if(result.getRange('F2').values[0][0]!==1||result.getRange('C3001:D3001').values[0].join('|')!==data[19].slice(2).join('|'))throw Error('第3000行整理失败');
raw.getRange('A3001:D3001').values=[[null,null,null,null]];
wb.recalculate();
console.log((await wb.inspect({kind:'region',sheetId:'幻翼黑示例',range:'A1:D3',maxChars:1000,tableMaxRows:3,tableMaxCols:4})).ndjson);
for(const name of ['自动整理','原始粘贴','幻翼黑示例']){const png=await wb.render({sheetName:name,range:'A1:H9',scale:1,format:'png'});await fs.writeFile(path.join(here,name+'.png'),new Uint8Array(await png.arrayBuffer()));}
const target=path.join(out,'标价调整导入模板.xlsx');await (await SpreadsheetFile.exportXlsx(wb)).save(target);
const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(target));
const actual=reopened.worksheets.getItem('幻翼黑示例').getRange('A2:D21').values;
if(JSON.stringify(actual)!==JSON.stringify(data))throw Error('保存回读数据不一致');
const {createRequire}=await import('node:module');
const core=createRequire(import.meta.url)(path.join(base,'src/core.js'));
const parsed=core.parse([['SPU','SKU','简称','售价'],...actual].map(r=>r.join('\t')).join('\n'));
if(parsed.length!==20)throw Error('工具导入解析未通过');
const blank=reopened.worksheets.getItem('原始粘贴').getRange('A2:D3001').values;
if(blank.some(row=>row.some(v=>v!==null&&v!==''&&v!==undefined)))throw Error('空白模板存在预填数据');
console.log(JSON.stringify({file:target,exampleRows:actual.length,longIdsPreserved:actual.every(r=>typeof r[0]==='string'&&typeof r[1]==='string'),blankRows:blank.length}));






