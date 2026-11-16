const status=document.querySelector('#status');
document.querySelector('#start').addEventListener('click',async()=>{
  const token=document.querySelector('#pair').value;document.querySelector('#pair').value='';
  if(!/^[a-f0-9]{48}$/.test(token)){status.textContent='Copy a fresh pairing code from Flow in the notch.';return;}
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const r=await chrome.runtime.sendMessage({target:'worker',type:'start',tabId:tab.id,token});
    status.textContent=r?.ok?'Capture started. Check that you still hear the meeting.':r?.message??'Capture unavailable.';
  }catch{status.textContent='Capture unavailable. Stop and choose your Meet tab again.';}
});
document.querySelector('#stop').addEventListener('click',async()=>{await chrome.runtime.sendMessage({target:'worker',type:'stop'});status.textContent='Stopped. Nothing will restart automatically.';});
