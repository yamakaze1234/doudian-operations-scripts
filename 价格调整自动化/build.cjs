const fs=require('node:fs');const path=require('node:path');
const header=`// ==UserScript==
// @name         抖店标价调整自动化
// @namespace    local.douyin.price-adjust
// @version      0.1.2
// @description  按SPU和真实SKU精确匹配，批量修改标价，保存后完整回读验证。
// @match        https://fxg.jinritemai.com/ffa/g/list*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==
`;
const content=header+'\n(function(){\n"use strict";\n'+['core.js','adapter.js','runner.js','browser.js','panel.js'].map(file=>fs.readFileSync(path.join(__dirname,'src',file),'utf8')).join('\n')+'\n})();\n';
fs.writeFileSync(path.join(__dirname,'抖店标价调整自动化.user.js'),content);console.log('已生成 抖店标价调整自动化.user.js');

