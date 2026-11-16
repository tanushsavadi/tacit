export function meetIdentity(raw){
  try{const u=new URL(raw);return u.protocol==='https:'&&u.hostname==='meet.google.com'&&/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(u.pathname)?u.pathname:null;}catch{return null;}
}
