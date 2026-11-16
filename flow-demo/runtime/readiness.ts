export {};
let state:any;
for(let i=0;i<120;i++){
 try{const r=await fetch('http://127.0.0.1:19892/health',{signal:AbortSignal.timeout(300)});state=await r.json();if(state.ownerConnected)break;}catch{}
 await new Promise(r=>setTimeout(r,200));
}
if(!state?.ownerConnected){console.error('Native connection not verified. Check Documents access prompt and data/runtime.log.');process.exit(1);}
console.log('✓ Native owner connected · Flow Control Center available');
