import assert from 'node:assert/strict';
import { derive } from '../src/logic/derive';
import { buildTracks } from '../src/logic/tracker';
import { PRESET_ZONES, useStore, activeObservations } from '../src/store';
import type { FrameObservation } from '../src/types';
import { analyzeFrame } from '../server/analyzeHandler';

const settings = { ...useStore.getState().settings, waitTargetS: 3 };
const frames: FrameObservation[] = [0, 2, 4, 6].map(t => ({sessionId:'drivethrough:test',t,width:768,height:432,provenance:'synthetic',detections:[{id:'a',cls:'vehicle',bbox:[0.1,0.4,0.4,0.75]}]}));
const at = (t:number) => derive(frames,PRESET_ZONES,settings,t,[],{},'drivethrough');
const alert = at(6).alerts[0];
assert.equal(alert.t,4);
assert.equal(at(alert.t).alerts[0].id,alert.id,'Alert survives jump to evidence');
assert.equal(at(2).alerts.length,0,'Backwards seek excludes future alerts');
assert.deepEqual(at(6),at(6),'Derivation does not accumulate events');
assert.equal(at(6).tracks[0].presentAtStart,true);
const missing = [...frames,{...frames[0],t:8,detections:[]}];
const lost = derive(missing,PRESET_ZONES,settings,8,[],{},'drivethrough');
assert.equal(lost.metrics.completedExits,0);
assert(lost.events.some(e=>e.kind==='track_lost'));
const pair = frames.map(f=>({...f,detections:[...f.detections,{id:'b',cls:'vehicle' as const,bbox:[0.6,0.4,0.9,0.75] as [number,number,number,number]}]}));
const tracks = buildTracks(pair,'drivethrough');
assert.equal(tracks.length,2);
assert(tracks.every(t=>new Set(t.samples.map(s=>s.t)).size===t.samples.length));
assert.equal(buildTracks(frames,'aerial').length,frames.length,'Moving camera is frame-local');
assert(at(6).now[0].laneProgress!>=0.3 && at(6).now[0].laneProgress!<=0.55);

// Provider fixtures verify validation only; they are not evidence of hosted detection accuracy.
process.env.OPENAI_API_KEY='test-placeholder';
delete process.env.AZURE_OPENAI_API_KEY;
const originalFetch=globalThis.fetch;
const body={sessionId:'drivethrough:test',t:0,width:768,height:432,imageDataUrl:'data:image/jpeg;base64,AA=='};
for (const bbox of [[-0.1,0.2,0.5,0.6],[0.5,0.2,0.1,0.6],['0.1',0.2,0.5,0.6]]) {
  globalThis.fetch=async()=>new Response(JSON.stringify({output_text:JSON.stringify({detections:[{cls:'vehicle',bbox}]})}));
  assert.equal((await analyzeFrame(body)).status,502,'Malformed box rejected');
}
globalThis.fetch=async()=>new Response(JSON.stringify({output_text:'{"detections":[]}'}));
assert.equal((await analyzeFrame(body)).status,200,'Empty detections valid');
globalThis.fetch=originalFetch;
console.log('PASS: alert evidence, seeking, unknown arrival, lost vs exit, one-to-one tracks, moving camera, mapping, provider validation');

// Identical source timestamps must retain both evidence sets without mixing them.
const modelFrame = {...frames[0], provenance: "model" as const};
useStore.getState().addObservation(modelFrame);
useStore.getState().addObservation(frames[0]);
assert.equal(useStore.getState().observations.drivethrough["0.00"].provenance, "model");
useStore.getState().setDemoMode("drivethrough", true);
assert.equal(activeObservations(useStore.getState())["0.00"].provenance, "synthetic");
useStore.getState().clearObservations("drivethrough", "synthetic");
assert.equal(activeObservations(useStore.getState())["0.00"].provenance, "model");
const modelAlert = derive(frames.map(f=>({...f,provenance:"model" as const})),PRESET_ZONES,settings,6,[],{},"drivethrough").alerts[0];
assert.notEqual(modelAlert.id, alert.id, "Synthetic acknowledgement cannot acknowledge model evidence");
console.log("PASS: separate evidence caches and acknowledgement identities");
