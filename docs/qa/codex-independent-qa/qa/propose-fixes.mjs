#!/usr/bin/env node
// Proposed patch only. Mutates a fresh copy inside QA evidence; never writes source/native runtime checkouts.
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const base=resolve(process.argv[2]??'');
if(!process.argv[2]||!existsSync(join(base,'report.json'))||!existsSync(join(base,'native/Tests/TacitCompanionTests/ConversationAuditTests.swift')))
  throw new Error('Pass an existing QA acceptance evidence directory.');
const output=join(base,'proposed-fix-validation');
if(existsSync(output)) throw new Error('Existing validation is preserved; use a fresh baseline run.');
mkdirSync(output,{mode:0o700});
const native=join(output,'native'); mkdirSync(native);
for(const p of ['Package.swift','Sources','Tests']) cpSync(join(base,'native',p),join(native,p),{recursive:true});
cpSync(join(root,'docs/qa/AuthoredPendingAuditTests.swift'),join(native,'Tests/TacitCompanionTests/AuthoredPendingAuditTests.swift'));
const relative='Sources/TacitCompanion/Client.swift',file=join(native,relative);
let source=readFileSync(file,'utf8');
function replace(before,after) {
  if(source.split(before).length!==2) throw new Error('Source changed: patch context does not match uniquely');
  source=source.replace(before,after);
}
replace('    private var pendingReviewedRequest: String?',`    private var pendingReviewedRequest: String?
    private struct AuthoredApproval: Equatable {
        let authorizationId: String
        let generation: Int
        let textHash: String
        let voiceRevision: Int?
    }
    /// Same authored approval stays single-use while pending; distinct messages may still queue after Hold.
    private var pendingAuthored: [String: AuthoredApproval] = [:]`);
replace('        pendingLiveGeneration = nil; pendingOutputGeneration = nil',
        '        pendingLiveGeneration = nil; pendingOutputGeneration = nil\n        pendingAuthored.removeAll()');
replace('                    lastDelivery = nil; reviewDraft = ReviewDraft()',
        '                    lastDelivery = nil; reviewDraft = ReviewDraft(); pendingAuthored.removeAll()');
replace('            lastDelivery = Delivery(requestId:',`            // The guard above already rejects revoked authorization/generation and untrusted sources.
            if dl["source"] as? String == "typed", let id = dl["requestId"] as? String,
               ["rendered", "failed", "refused", "interrupted"].contains(dl["state"] as? String ?? "") {
                pendingAuthored.removeValue(forKey: id)
            }
            lastDelivery = Delivery(requestId:`);
replace('        notice = nil\n        // outputGeneration:',`        let approval = AuthoredApproval(authorizationId: auth, generation: output?.generation ?? -1,
            textHash: Self.textHash(t), voiceRevision: myVoice?.revision)
        guard !pendingAuthored.values.contains(approval) else {
            notice = "That message is already pending. Check its delivery before repeating it."
            return false
        }
        let requestID = UUID().uuidString
        pendingAuthored[requestID] = approval // set before send, including synchronous fixture acknowledgments
        notice = nil
        // outputGeneration:`);
replace('["type": "speak_typed", "requestId": UUID().uuidString,',
        '["type": "speak_typed", "requestId": requestID,');
replace('        pendingReviewedRequest = requestID; reviewSubmittedID = h.id; reviewDraft = ReviewDraft()',
        '        if reviewDraft.editing { preservedCorrection = text } // RAM-only reference, never a new speech authorization\n        pendingReviewedRequest = requestID; reviewSubmittedID = h.id; reviewDraft = ReviewDraft()');
writeFileSync(file,source);
const patch=spawnSync('/usr/bin/diff',['-u','-L','a/macos/TacitCompanion/'+relative,'-L','b/macos/TacitCompanion/'+relative,
  join(base,'native',relative),file],{encoding:'utf8'});
if(patch.status!==1) throw new Error('Expected one proposed source diff');
const patchFile=join(root,'docs/qa/proposed-native-reliability.patch');
writeFileSync(patchFile,patch.stdout);
const wire=join(output,'native-wire.json'),results=[];
function run(name,bin,args,cwd=root) {
 const r=spawnSync(bin,args,{cwd,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,
   env:{...process.env,TACIT_QA_WIRE_PATH:wire,DEVELOPER_DIR:process.env.DEVELOPER_DIR??'/Applications/Xcode.app/Contents/Developer'}});
 writeFileSync(join(output,name+'.log'),(r.stdout??'')+(r.stderr??''),{mode:0o600});
 results.push({name,exit:r.status}); console.log(`${r.status===0?'PASS':'FAIL'} ${name}`);
}
run('native-proposed','swift',['test','--package-path',native]);
run('native-offline-selftest',join(native,'.build/debug/TacitCompanion'),['--offline-selftest']);
run('backend-wire-replay',join(root,'server/node_modules/.bin/vitest'),['run','--config','docs/qa/vitest.config.mjs']);
writeFileSync(join(output,'report.json'),JSON.stringify({at:new Date().toISOString(),base,patchFile,
  scope:'PROPOSED source-copy patch only; NOT integrated, no runtime/device changes',results},null,2));
process.exitCode=results.some(r=>r.exit!==0)?1:0;
