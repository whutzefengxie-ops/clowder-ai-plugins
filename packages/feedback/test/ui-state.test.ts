import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';

test('a prior poll cannot save its report into a newly prepared analysis draft', async () => {
  const node=()=>({dataset:{},append(){},replaceChildren(){},querySelector(){return undefined;},scrollTop:0});
  const saves: Array<{title:string;body:string}>=[];
  let release!: (value:unknown)=>void;
  const context=createContext({
    document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],createTextNode:(text:string)=>text},
    el:node,reportPreview:node,bridge:async()=>true,copyImage:async()=>{},normalizePicture:async()=>{},setTimeout:()=>0,clearTimeout:()=>{},console,
    call:async(input: {op:string;report:{title:string;body:string}})=>{
      if(input.op==='bootstrap') return new Promise(()=>{});
      if(input.op==='analysis-status') return new Promise(resolve=>{release=resolve;});
      if(input.op==='save') {saves.push(input.report);return{journal:{state:'draft',digest:'digest-B',target:{},report:input.report},revision:2};}
      if(input.op==='prepare-analysis') return{analysis:{id:'run-B',state:'prepared'},hash:'hash-B'};
      if(input.op==='analyze') return{analysis:{id:'run-B',state:'running'}};
      return{attachments:false};
    },
  });
  const source=await readFile(new URL('../ui/main.js',import.meta.url),'utf8');
  runInContext(source.replace(/^import[^\n]+\n/gm,''),context);
  const actions=runInContext('({state,refreshAnalysis,prepareAnalysis,analyze})',context);
  Object.assign(actions.state,{busy:false,stage:'analyzing',analysis:{id:'run-A'},journal:{digest:'digest-A',state:'draft'},report:{title:'new problem B',body:'new body B',attachments:[]}});
  const pending=actions.refreshAnalysis();
  await actions.prepareAnalysis(); await actions.analyze();
  release({analysis:{id:'run-A',state:'ready',title:'old report A',body:'old body A'}});
  await pending;
  assert.equal(actions.state.analysis.id,'run-B');
  assert.equal(actions.state.report.title,'new problem B');
  assert.ok(!saves.some(report=>report.title==='old report A'));
});
