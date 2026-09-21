const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createReportService } = require('../services/business-report.service');
const { publicEvent } = require('../services/business-audit.service');
const { httpHarness } = require('./helpers/report-fixture');
const ho = { user_id: 40, role: 'HEAD_OFFICE', branch_id: 99 };
const manager = { user_id: 9, role: 'MANAGER', branch_id: 5 };
const route = '/entry/:id/audit-history';
function fixture(t, events = [], fail = false) {
    const db = new DatabaseSync(':memory:');
    db.function('DATE_FORMAT', (value, _format) => value);
    db.exec(`CREATE TABLE daily_business_entries (id INTEGER PRIMARY KEY, branch_id INTEGER);
        INSERT INTO daily_business_entries VALUES (1,5),(2,8);
        CREATE TABLE daily_business_audit_logs (id INTEGER PRIMARY KEY, entry_id INTEGER, branch_id INTEGER, action TEXT,
        actor_name TEXT, actor_role TEXT, created_at TEXT, reason TEXT, previous_state TEXT, new_state TEXT,
        ip_address TEXT, user_agent TEXT, actor_id INTEGER);`);
    for (const e of events) db.prepare('INSERT INTO daily_business_audit_logs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        e.id,e.entry_id??1,e.branch_id??5,e.action??'SUBMIT',e.actor_name??'Historical Manager',e.actor_role??'MANAGER',
        e.created_at??'2026-09-20 10:00:00',e.reason??null,e.previous_state??'{"status":"DRAFT"}',e.new_state??'{"status":"SUBMITTED"}',
        'private-ip','private-agent',999);
    const before = db.prepare('SELECT * FROM daily_business_audit_logs ORDER BY id').all();
    t.after(() => { try { assert.deepEqual(db.prepare('SELECT * FROM daily_business_audit_logs ORDER BY id').all(), before); } finally { db.close(); } });
    const calls=[];
    const pool={promise:()=>({query:async(sql,params)=>{
        assert.match(sql.trim(),/^SELECT/); assert.doesNotMatch(sql,/FOR UPDATE|SELECT \*/);
        calls.push({sql,params}); if(fail) throw new Error('private SQL');
        return [db.prepare(sql).all(...params).map(r=>({...r}))];
    }})};
    return {pool,calls,service:createReportService(pool)};
}
for (const role of ['ADMIN','EMPLOYEE',null]) test(`history denies ${role||'unauthenticated'}`,async t=>{
    const f=fixture(t);const actor=role?{...ho,role}:null;
    assert.equal((await httpHarness(f)('get',route,actor)).status,403);
    await assert.rejects(f.service.auditHistory(actor,1),e=>e.status===403);assert.equal(f.calls.length,0);
});
test('Head Office cross-branch history and manager own-branch history return safe events',async t=>{
    const f=fixture(t,[{id:1},{id:2,entry_id:2,branch_id:8,action:'FINAL_LOCK',actor_role:'HEAD_OFFICE'}]);
    for(const [actor,id] of [[ho,1],[ho,2],[manager,1]]){
        const response=await httpHarness(f)('get',route,actor,{params:{id:String(id)}});
        assert.equal(response.status,200);assert.equal(response.data.length,1);
        assert.equal(response.data[0].actor_name,'Historical Manager');
        assert.deepEqual(Object.keys(response.data[0]).sort(),['id','action','actor_name','actor_role','created_at','reason','requested_reason','previous_state','new_state'].sort());
        assert.doesNotMatch(JSON.stringify(response.data),/private-ip|private-agent|actor_id/);
    }
});
test('cross-branch and missing reports both return 404 before audit lookup; spoofing cannot expand scope',async t=>{
    const f=fixture(t,[{id:1,entry_id:2,branch_id:8}]);
    for(const id of ['2','999']){
        const response=await httpHarness(f)('get',route,manager,{params:{id},query:{branch_id:8},body:{branch_id:8,role:'HEAD_OFFICE'}});
        assert.equal(response.status,404);assert.equal(response.data.message,'Report not found');
    }
    assert.ok(f.calls.every(c=>!c.sql.includes('daily_business_audit_logs')));
    assert.ok(f.calls.every(c=>c.params[1]===5));
    assert.equal((await httpHarness(f)('get',route,ho,{params:{id:'999'}})).status,404);
});
test('invalid IDs and missing manager branch fail without querying',async t=>{
    const f=fixture(t);
    for(const id of ['0','abc','1 OR 1=1','-1']) assert.equal((await httpHarness(f)('get',route,ho,{params:{id}})).status,400);
    assert.equal((await httpHarness(f)('get',route,{...manager,branch_id:null})).status,403);assert.equal(f.calls.length,0);
});
test('older report with no events returns normal empty array',async t=>{
    const f=fixture(t);assert.deepEqual(await f.service.auditHistory(ho,1),[]);assert.equal(f.calls.length,2);
});
test('approved correction sequence preserves events and sorts timestamp ties by ID',async t=>{
    const sequence=['SUBMIT','UNLOCK_REQUEST','UNLOCK_APPROVE','SUBMIT','FINAL_LOCK'];
    const events=sequence.map((action,i)=>({id:i+1,action,created_at:i===0?'2026-09-20 09:00:00':'2026-09-20 10:00:00'})).reverse();
    const f=fixture(t,events);
    const result=await f.service.auditHistory(ho,1);
    assert.deepEqual(result.map(e=>e.action),sequence);assert.deepEqual(result.map(e=>e.id),[1,2,3,4,5]);
    assert.match(f.calls[1].sql,/ORDER BY created_at ASC, id ASC/);
});
test('request, approval and rejection reasons retain their actual distinct meanings',async t=>{
    const f=fixture(t,[{id:1},{id:2,action:'UNLOCK_REQUEST',reason:'Wrong amount'},
        {id:3,action:'UNLOCK_REJECT',reason:'Amount was correct',previous_state:JSON.stringify({status:'SUBMITTED',unlock_requested:1,unlock_reason:'Wrong amount'})}]);
    const result=await f.service.auditHistory(manager,1);
    assert.deepEqual(result.map(e=>e.action),['SUBMIT','UNLOCK_REQUEST','UNLOCK_REJECT']);
    assert.equal(result[1].requested_reason,'Wrong amount');assert.equal(result[2].requested_reason,'Wrong amount');
    assert.equal(result[2].reason,'Amount was correct');
    const approved=publicEvent({action:'UNLOCK_APPROVE',reason:'Original reason',previous_state:'{"status":"SUBMITTED"}',new_state:'{"status":"DRAFT"}'});
    assert.equal(approved.requested_reason,'Original reason');assert.equal(approved.new_state.status,'DRAFT');
});
for(const value of ['{bad',null,'null','[]','123','"text"','{"password":"secret","nested":{"jwt":"token"}}']){
    test(`malformed or unusable state ${value} is safely omitted without losing event`,()=>{
        const event=publicEvent({id:1,action:'SUBMIT',previous_state:value,new_state:value,reason:'not relevant'});
        assert.equal(event.previous_state,null);assert.equal(event.new_state,null);assert.equal(event.id,1);assert.equal(event.reason,null);
        assert.doesNotMatch(JSON.stringify(event),/password|secret|jwt|token/);
    });
}
test('state whitelist accepts parsed and serialized JSON while discarding unexpected internals',()=>{
    const result=publicEvent({action:'UNLOCK_APPROVE',previous_state:{status:' submitted ',unlock_requested:'1',unlock_reason:'Fix entry',password:'secret'},
        new_state:'{"status":"DRAFT","unlock_requested":0,"request":{"jwt":"secret"}}'});
    assert.deepEqual(result.previous_state,{status:'SUBMITTED',unlock_requested:1});assert.deepEqual(result.new_state,{status:'DRAFT',unlock_requested:0});
    assert.equal(result.requested_reason,'Fix entry');assert.doesNotMatch(JSON.stringify(result),/password|jwt|secret/);
});
test('unknown future action remains an event with safe fallback and no arbitrary reason payload',()=>{
    const e=publicEvent({id:7,action:'FUTURE_ACTION',reason:'internal payload',previous_state:{status:'alien'},new_state:null});
    assert.equal(e.id,7);assert.equal(e.action,'UNKNOWN');assert.equal(e.reason,null);assert.equal(e.previous_state,null);
});
test('database error is safe and unrelated audit branch rows are excluded',async t=>{
    const f=fixture(t,[{id:1,branch_id:8}]);assert.deepEqual(await f.service.auditHistory(ho,1),[]);
    const response=await httpHarness(fixture(t,[],true))('get',route,ho);assert.equal(response.status,500);assert.equal(response.data.message,'Internal server error');
});
test('frontend helpers map actions, transition fields, reasons and local timestamps without raw JSON',async()=>{
    const h=await import('../../frontend/src/utils/auditHistory.js');
    for(const [action,label] of Object.entries({SUBMIT:'Submitted report',FINAL_LOCK:'Final locked',UNLOCK_REQUEST:'Correction requested',UNLOCK_APPROVE:'Correction approved',UNLOCK_REJECT:'Correction rejected'}))assert.equal(h.actionLabel(action),label);
    assert.equal(h.actionLabel('FUTURE_ACTION'),'Other audit event');
    assert.equal(h.stateLabel({status:'DRAFT',password:'secret'}),'DRAFT');assert.equal(h.stateLabel(null),'');
    assert.equal(h.auditTimestamp('2026-09-20 10:04:00'),'20 Sep 2026, 10:04:00 AM');
    assert.equal(h.auditTimestamp('2026-09-20 00:00:00'),'20 Sep 2026, 12:00:00 AM');
    assert.equal(h.auditTimestamp('2026-09-20 23:59:59'),'20 Sep 2026, 11:59:59 PM');
    assert.equal(h.auditTimestamp('bad'),'Time unavailable');assert.equal(h.auditTimestamp(null),'Time unavailable');
    assert.deepEqual(h.eventReasons({action:'UNLOCK_APPROVE',requested_reason:'Fix',reason:'Fix'}),[{label:'Requested reason',text:'Fix'}]);
    assert.deepEqual(h.eventReasons({action:'UNLOCK_REJECT',requested_reason:'Fix',reason:'No'}),[{label:'Requested reason',text:'Fix'},{label:'Decision note',text:'No'}]);
});
