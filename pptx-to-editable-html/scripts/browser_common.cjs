'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
function playwright(){
 const candidates=['playwright'];
 for(const base of [process.env.PPTX_HTML_NODE_MODULES,...(process.env.NODE_PATH||'').split(path.delimiter),path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')].filter(Boolean)) candidates.push(path.join(base,'playwright'));
 for(const c of candidates){try{return require(c)}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e}}
 throw new Error('Playwright not found. Set PPTX_HTML_NODE_MODULES to the node_modules path returned by load_workspace_dependencies.');
}
async function launch(){const {chromium}=playwright();let executablePath=process.env.PPTX_HTML_CHROME;
 if(!executablePath&&process.platform==='darwin'&&fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'))executablePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 return chromium.launch({headless:true,...(executablePath?{executablePath}:{})});}
module.exports={launch};
