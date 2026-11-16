let stream=null,context=null,socket=null,node=null,epoch=null,sequence=0,generation=0,lease=null;
async function stop(){
  generation++;epoch=null;clearTimeout(lease);lease=null;
  if(node){node.port.onmessage=null;node.disconnect();node=null;}
  stream?.getTracks().forEach(t=>t.stop());stream=null;
  const ctx=context;context=null;await ctx?.close().catch(()=>{});
  const ws=socket;socket=null;if(ws){ws.onclose=null;ws.close();}
}
async function start(m){
  await stop();const gen=generation;
  try{
    const media=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:m.streamId}},video:false});
    if(gen!==generation){media.getTracks().forEach(t=>t.stop());return false;}
    stream=media;
    context=new AudioContext({sampleRate:16000,latencyHint:'interactive'});
    if(context.sampleRate!==16000)throw Error();
    const source=context.createMediaStreamSource(stream);
    // Required by tabCapture: restore the user's local playback, separate from PCM transport.
    source.connect(context.destination);
    await context.resume();if(gen!==generation||context?.state!=='running')throw Error();
    await context.audioWorklet.addModule(chrome.runtime.getURL('pcm-worklet.js'));
    if(gen!==generation||!context)throw Error();
    node=new AudioWorkletNode(context,'tacit-pcm');source.connect(node);node.connect(context.destination);
    socket=new WebSocket('ws://127.0.0.1:18892/flow');
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error()),4000);
      socket.onopen=()=>socket.send(JSON.stringify({type:'pair',token:m.token,source:'Selected Google Meet tab',sampleRate:16000,channels:1,format:'pcm16le'}));
      socket.onmessage=e=>{try{const msg=JSON.parse(e.data);if(msg.type==='ready'){epoch=msg.epoch;sequence=0;clearTimeout(timeout);resolve();}else if(msg.type==='stop'){void end();}}catch{void end();}};
      socket.onerror=()=>{clearTimeout(timeout);reject(Error());};
    });
    if(gen!==generation)throw Error();
    node.port.onmessage=e=>{
      if(epoch===null||gen!==generation||socket?.readyState!==WebSocket.OPEN)return;
      if(socket.bufferedAmount>32000){void end();return;} // no backlog or replay after reconnect
      const pcm=new Int16Array(e.data),frame=new ArrayBuffer(3208),view=new DataView(frame);
      view.setUint32(0,epoch,true);view.setUint32(4,sequence++,true);
      for(let i=0;i<pcm.length;i++)view.setInt16(8+i*2,pcm[i],true);
      socket.send(frame);pcm.fill(0);
    };
    socket.onclose=()=>void end();stream.getTracks().forEach(t=>{t.onended=()=>void end();t.onmute=()=>void end();});
    context.onstatechange=()=>{if(context&&context.state!=='running')void end();};
    return true;
  }catch{if(gen===generation)await end();return false;}
}
async function end(){await stop();try{await chrome.runtime.sendMessage({target:'worker',type:'stopped'});}catch{}}
navigator.mediaDevices.addEventListener('devicechange',()=>void end());
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||m.target!=='offscreen')return;
  if(m.type==='stop'){void stop().then(()=>reply({ok:true}));return true;}
  if(m.type==='start'){void start(m).then(ok=>reply({ok}));return true;}
});
