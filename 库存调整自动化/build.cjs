const fs=require('node:fs');const path=require('node:path');
const header=`// ==UserScript==
// @name         抖店库存调整自动化
// @namespace    local.douyin.stock-zero
// @version      0.2.3
// @description  粘贴SPU及简称，预检匹配SKU，支持清零或添加现货库存，保存后回读验证。
// @match        https://fxg.jinritemai.com/ffa/g/list*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==
`;
const content=header+'\n(function(){\n"use strict";\n'+['core.js','adapter.js','runner.js','browser.js','panel.js'].map(file=>fs.readFileSync(path.join(__dirname,'src',file),'utf8')).join('\n')+'\n})();\n';
fs.writeFileSync(path.join(__dirname,'抖店库存调整自动化.user.js'),content);console.log('已生成 抖店库存调整自动化.user.js');




