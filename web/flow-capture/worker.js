import { meetIdentity } from './scope.js';
let starting=false,epoch=0;
async function stop(){
  epoch++;
  await chrome.storage.session.remove('source');
  try{await chrome.runtime.sendMessage({target:'offscreen',type:'stop'});}catch{}
  await chrome.action.setBadgeText({text:''});
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||m.target!=='worker')return;
  if(m.type==='stopped'){void stop();reply({ok:true});return;}
  if(m.type==='stop'){void stop().then(()=>reply({ok:true}));return true;}
  if(m.type!=='start'||starting){reply({ok:false,message:'Capture is busy.'});return;}
  starting=true;
  void(async()=>{
    try{
      await stop();const attempt=epoch;
      const tab=await chrome.tabs.get(m.tabId),identity=meetIdentity(tab.url);
      if(!identity||!tab.active)throw Error('Select the active Google Meet tab.');
      const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']});
      if(!contexts.length)await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA','AUDIO_PLAYBACK'],justification:'User-approved Meet tab capture with local playback restored.'});
      if(attempt!==epoch)throw Error();
      const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tab.id});
      if(attempt!==epoch)throw Error();
      // No full meeting URL, token, or transcript persists. Identity is only for fail-closed navigation checks.
      await chrome.storage.session.set({source:{tabId:tab.id,identity}});
      if(attempt!==epoch)throw Error();
      const result=await chrome.runtime.sendMessage({target:'offscreen',type:'start',streamId,token:m.token});
      if(attempt!==epoch||!result?.ok)throw Error('Capture failed. Check the native pairing code.');
      await chrome.action.setBadgeBackgroundColor({color:'#145e4a'});await chrome.action.setBadgeText({text:'LIVE'});
      reply({ok:true});
    }catch{await stop();reply({ok:false,message:'Capture failed. Select your Meet tab and use a fresh native pairing code.'});}
    finally{starting=false;}
  })();return true;
});
chrome.tabs.onRemoved.addListener(async(id)=>{const {source}=await chrome.storage.session.get('source');if(source?.tabId===id)await stop();});
chrome.tabs.onUpdated.addListener(async(id,change)=>{
  const {source}=await chrome.storage.session.get('source');
  if(source?.tabId===id&&(change.status==='loading'||(change.url&&meetIdentity(change.url)!==source.identity)))await stop();
});
// Changing active tabs does not change the selected audio source. Capture follows ONLY the named tab.
chrome.runtime.onStartup.addListener(()=>void stop());
chrome.runtime.onInstalled.addListener(()=>void stop());
