(function(root){
  'use strict';
  if(document.getElementById('stock-zero-host'))return;
  const host=document.createElement('div');host.id='stock-zero-host';document.body.append(host);const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML=`<style>
    .inventory-options{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin:12px 0}.inventory-options label{margin:0;display:flex;flex-direction:column;gap:6px}.inventory-options select,.inventory-options input{font:inherit;line-height:1.5;height:40px;border:1px solid #c4d2e4;border-radius:6px;padding:8px 12px;transition:border-color .15s,box-shadow .15s}.inventory-options select{min-width:166px;background:#245cb3;color:#fff;border-color:#245cb3;cursor:pointer}.inventory-options select:hover{background:#1d4e99}.inventory-options option{background:#fff;color:#24344a}.inventory-options input{width:176px;max-width:100%;background:#fff;color:#24344a;font-weight:normal}.inventory-options input::placeholder{color:#8c9bb0}.inventory-options input:hover{border-color:#245cb3}.inventory-options select:focus-visible,.inventory-options input:focus-visible{outline:0;box-shadow:0 0 0 3px #245cb326;border-color:#245cb3}.inventory-options select:disabled,.inventory-options input:disabled{opacity:.45;cursor:not-allowed}
    :host{all:initial;font:14px/1.5 "Microsoft YaHei",sans-serif;color:#24344a}
    *{box-sizing:border-box}button,textarea{font:inherit}button{cursor:pointer;border:1px solid #c4d2e4;background:#fff;border-radius:6px;padding:8px 12px;color:#24344a}button:hover{background:#edf4fc}button:disabled{opacity:.45;cursor:not-allowed}
    #launch{position:fixed;left:22px;bottom:26px;z-index:2147483646;background:#245cb3;color:white;border:0;box-shadow:0 3px 14px #0002}
    #panel{position:fixed;left:20px;top:80px;width:min(760px,calc(100vw - 40px));max-height:calc(100vh - 110px);overflow:auto;z-index:2147483646;background:#f5f8fc;border:1px solid #b7cbe4;border-radius:10px;box-shadow:0 12px 48px #183a6638;padding:20px}
    [hidden]{display:none!important}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}h2{margin:0;font-size:20px;color:#183e76}p{margin:8px 0;color:#53627a}label{display:block;font-weight:bold;margin:12px 0 6px}textarea{width:100%;min-height:116px;resize:vertical;padding:10px;border:1px solid #aebed3;border-radius:6px;background:white;font-family:Consolas,"Microsoft YaHei",monospace;font-size:13px}button.primary{background:#245cb3;color:#fff;border-color:#245cb3}button.danger{background:#a63c29;color:#fff;border-color:#a63c29}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.status{border-left:3px solid #245cb3;padding:8px 12px;background:#eaf1fb;white-space:pre-wrap}.summary{font-weight:bold;margin:12px 0}.table{max-height:290px;overflow:auto;border:1px solid #d0dbe9;background:white}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:9px 8px;text-align:left;border-bottom:1px solid #e1e7ef;vertical-align:top}th{position:sticky;top:0;background:#eaf0f8;white-space:nowrap}td:first-child{font-family:Consolas,monospace}small{color:#607289;display:block;word-break:break-all}.ok{color:#176645}.error{color:#a63c29}#consentLabel{font-weight:normal;display:flex;gap:8px;align-items:flex-start}#consent{margin-top:4px}
  </style><button id="launch">库存调整自动化</button><section id="panel" hidden aria-label="库存调整自动化"><header><h2>库存调整自动化</h2><button id="collapse">收起</button></header><p>按商品 ID 和完整 SKU 名称匹配，可选择清零库存或在原现货库存上增加数量。</p><div class="inventory-options"><label for="mode">操作模式<select id="mode"><option value="zero">库存清零</option><option value="add">添加现货库存</option></select></label><label id="quantityLabel" hidden>每个 SKU 增加数量 <input id="quantity" type="number" min="1" step="1" placeholder="例如 5"></label></div><label for="input">粘贴 Excel 两列：SPU · 简称</label><textarea id="input" spellcheck="false" placeholder="SPU&#9;简称&#10;完整商品ID&#9;完整SKU名称"></textarea><p>SPU 使用文本格式。相同 SPU 自动合并，重复记录自动去重。</p><div class="actions"><button id="preview" class="primary">预检匹配</button><button id="stop" disabled>停止</button><button id="export" disabled>导出结果</button><button id="clear" type="button">清空数据</button></div><div id="status" class="status" role="status" aria-live="polite">请在目标店铺的商品管理页面开始。</div><div id="summary" class="summary"></div><div class="table" hidden id="tableWrap"><table><thead><tr><th>SPU / SKU ID</th><th>简称 / 页面名称</th><th>库存变化</th><th>状态</th></tr></thead><tbody id="results"></tbody></table></div><label id="consentLabel"><input type="checkbox" id="consent" disabled><span>已核对店铺和命中 SKU，清零这些 SKU 的现货及预售库存，异常项跳过。</span></label><button id="execute" class="danger" disabled>执行清零并保存</button><p>停止后不再提交后续商品。若已提交保存，需核实结果后再重新预检。</p></section>`;
  const $=id=>shadow.getElementById(id);let runner=null,busy=false;
  function render(message){
    const adding=$('mode').value==='add';$('mode').disabled=busy;$('quantity').disabled=busy;$('quantityLabel').hidden=!adding;
    $('execute').textContent=adding?'执行添加并保存':'执行清零并保存';
    $('consentLabel').querySelector('span').textContent=adding?'已核对店铺、命中 SKU 和增加数量，仅增加现货库存，异常项跳过。':'已核对店铺和命中 SKU，清零这些 SKU 的现货及预售库存，异常项跳过。';
    if(message)$('status').textContent=message;
    const results=runner?.results||[];const matches=results.filter(r=>r.status==='匹配').length;
    $('preview').disabled=busy;$('input').disabled=busy;$('stop').disabled=!busy;$('export').disabled=!results.length;
    $('clear').disabled=busy;
    $('consent').disabled=busy||!runner?.ready||!matches;$('execute').disabled=busy||!runner?.ready||!matches||!$('consent').checked;
    $('tableWrap').hidden=!results.length;$('summary').textContent=runner?`${runner.shopName||'未识别店铺'} · ${results.length} 条记录 · ${matches} 条待执行`:'';
    $('results').replaceChildren();
    for(const item of results){const tr=document.createElement('tr');
      const id=document.createElement('td');id.textContent=item.spu;const sub=document.createElement('small');sub.textContent=item.skuId||'无唯一 SKU';id.append(sub);
      const name=document.createElement('td');name.textContent=item.name;const page=document.createElement('small');page.textContent=item.pageName||'';name.append(page);
      const stock=document.createElement('td');const row=item.after||item.before;stock.textContent=row?`现货 ${row.stock}；${row.presale.map(p=>p.label+' '+p.value).join('；')||'无预售档'}`:'—';
      if(item.quantity){const change=document.createElement('small');change.textContent=`现货 ${item.before.stock} + ${item.quantity} → ${item.targetStock}；预售不变`;stock.append(change);}
      const state=document.createElement('td');state.textContent=item.status;state.className=['匹配','已验证清零','已验证添加','原库存已为零'].includes(item.status)?'ok':'error';if(item.error){const detail=document.createElement('small');detail.textContent=item.error;state.append(detail);}tr.append(id,name,stock,state);$('results').append(tr);
    }
  }
  $('launch').onclick=()=>{$('panel').hidden=!$('panel').hidden;};$('collapse').onclick=()=>{$('panel').hidden=true;};
  $('input').oninput=()=>{if(runner)runner.ready=false;$('consent').checked=false;render('输入已变化，请重新预检');};
  $('mode').onchange=$('quantity').oninput=$('input').oninput;
  $('consent').onchange=()=>render();
  $('clear').onclick=()=>{if(busy)return;if(runner)runner.ready=false;runner=null;$('input').value='';$('consent').checked=false;render('已清空粘贴数据，请粘贴新数据后重新预检。');$('input').focus();};
  $('stop').onclick=()=>{runner?.stop();$('consent').checked=false;render();};
  async function task(fn){if(busy)return;busy=true;render();try{await fn();}catch(error){if(runner)runner.ready=false;$('status').textContent=`已停止：${error.message}\n如窗口中已有填写内容，请自行核对后保存或取消。`;}finally{busy=false;render();}}
  $('preview').onclick=()=>task(async()=>{$('consent').checked=false;runner=new root.StockZeroRunner.Runner(root.StockZeroBrowser,(_r,message)=>render(message));await runner.prepare($('input').value,{mode:$('mode').value,quantity:$('quantity').value});});
  $('execute').onclick=()=>task(async()=>{if(!$('consent').checked)throw Error('请先核对预览');await runner.execute();$('consent').checked=false;});
  $('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:'0.2.3',exportedAt:new Date().toISOString(),shop:runner.shopName,mode:runner.mode,quantity:runner.quantity,results:runner.results,log:runner.log},null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`库存调整结果_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
})(globalThis);





