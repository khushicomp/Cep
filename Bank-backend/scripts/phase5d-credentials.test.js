const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const { credentialFixture } = require('./helpers/credential-fixture');
const { passwordPolicy } = require('../services/credential-policy');
const { credentialConfig } = require('../config/credentials');
const { createMailService } = require('../services/credential-mail.service');
const { createCredentialController } = require('../controllers/credential.controller');
const { parseArgs } = require('./branch-account');
const password = 'a synthetic river valley passphrase';
const body = token => ({ token, password, confirmPassword: password });
function fixture(t) { const f = credentialFixture(); t.after(() => f.close()); return f; }
function user(f) { return f.db.prepare('SELECT * FROM users ORDER BY user_id LIMIT 1').get(); }
const rows = (f, table) => f.db.prepare(`SELECT * FROM ${table}`).all();
async function active(f) { await f.provision(); await f.service.complete('SETUP', body(f.token())); }
function noCredentials(value, f) {
    const text = JSON.stringify(value);
    assert.ok(!text.includes(password));
    for (const message of f.messages) {
        const token = message.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
        if (token) assert.ok(!text.includes(token));
    }
    assert.doesNotMatch(text, /\$2[aby]\$/);
}

test('provisioning dry-run reads only; explicit apply invites with NULL password and branch name; fake mail only', async t => {
    const f = fixture(t);
    const preview = await f.operator.run(f.invite);
    assert.equal(preview.applied, false); assert.equal(preview.branchId, 38);
    assert.equal(rows(f,'users').length,0); assert.equal(f.messages.length,0);
    assert.ok(f.queries.every(sql => /^SELECT/.test(sql)));
    const result = await f.provision();
    assert.equal(result.delivery,'sent'); assert.equal(user(f).password,null); assert.equal(user(f).is_active,0);
    assert.equal(user(f).name,'Wani Branch'); assert.equal(user(f).account_state,'INVITED');
    assert.equal(rows(f,'account_action_tokens')[0].token_hash.length,32);
    assert.equal(rows(f,'account_security_events')[0].actor_source,'OPERATOR_CLI');
    assert.ok(!JSON.stringify(rows(f,'account_action_tokens')).includes(f.token()));
    noCredentials(result,f);
});
test('setup atomically establishes password, activates account, increments version and records event without automatic login', async t => {
    const f = fixture(t); await f.provision();
    const response = await f.service.complete('SETUP', body(f.token()));
    assert.equal(user(f).account_state,'ACTIVE'); assert.equal(user(f).is_active,1); assert.equal(user(f).auth_version,1);
    assert.ok(user(f).password_changed_at); assert.ok(await bcrypt.compare(password,user(f).password));
    assert.ok(rows(f,'account_action_tokens')[0].used_at);
    assert.equal(rows(f,'account_security_events').at(-1).action,'PASSWORD_ESTABLISHED');
    assert.equal(response.token,undefined); noCredentials(response,f);
    assert.ok(f.queries.some(sql => sql.includes('FROM users WHERE user_id = ? FOR UPDATE')));
    assert.ok(f.queries.some(sql => sql.includes('FROM account_action_tokens WHERE token_hash = ? FOR UPDATE')));
});
for (const scenario of ['wrong purpose','expired','used','revoked','version mismatch','disabled','inactive flag','unsupported role']) {
    test(`setup rejects ${scenario} without credential changes`, async t => {
        const f=fixture(t); await f.provision(); const token=f.token();
        if(scenario==='wrong purpose') f.db.exec("UPDATE account_action_tokens SET purpose='RESET'");
        if(scenario==='expired') f.advance(86400);
        if(scenario==='used') f.db.exec("UPDATE account_action_tokens SET used_at='2026-09-23'");
        if(scenario==='revoked') f.db.exec("UPDATE account_action_tokens SET revoked_at='2026-09-23'");
        if(scenario==='version mismatch') f.db.exec('UPDATE users SET auth_version=1');
        if(scenario==='disabled') f.db.exec("UPDATE users SET account_state='DISABLED'");
        if(scenario==='inactive flag') f.db.exec('UPDATE users SET is_active=1');
        if(scenario==='unsupported role') f.db.exec("UPDATE users SET role='EMPLOYEE'");
        await assert.rejects(f.service.complete('SETUP',body(token)),/invalid or expired/);
        assert.equal(user(f).password,null); assert.equal(rows(f,'account_security_events').length,1);
    });
}
test('two concurrent setup consumers produce one success and one security event', async t => {
    const f=fixture(t); await f.provision(); const input=body(f.token());
    const outcomes=await Promise.allSettled([f.service.complete('SETUP',input),f.service.complete('SETUP',input)]);
    assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
    assert.equal(rows(f,'account_security_events').filter(e=>e.action==='PASSWORD_ESTABLISHED').length,1);
});
test('security event failure rolls back password, state and token consumption', async t => {
    const f=fixture(t); await f.provision(); f.failEvent();
    await assert.rejects(f.service.complete('SETUP',body(f.token())));
    assert.equal(user(f).password,null); assert.equal(user(f).account_state,'INVITED'); assert.equal(rows(f,'account_action_tokens')[0].used_at,null);
});
test('setup reissue revokes older link and successful setup invalidates all outstanding tokens', async t => {
    const f=fixture(t); await f.provision(); const old=f.token();
    await f.operator.run({action:'reissue', userId:user(f).user_id,email:f.invite.email,operator:'fixture-operator'},f.apply);
    await assert.rejects(f.service.complete('SETUP',body(old)),/invalid or expired/);
    await f.service.complete('SETUP',body(f.token()));
    assert.ok(rows(f,'account_action_tokens').every(r=>r.used_at||r.revoked_at));
});
test('reset completion preserves branch/role, replaces password and revokes prior version and all outstanding links', async t => {
    const f=fixture(t); await active(f); const before=user(f);
    await f.service.forgot(f.invite.email); const result=await f.service.complete('RESET',body(f.token()));
    assert.equal(user(f).auth_version,before.auth_version+1); assert.equal(user(f).branch_id,38); assert.equal(user(f).role,'MANAGER');
    assert.ok(user(f).password!==before.password); assert.ok(rows(f,'account_action_tokens').every(r=>r.used_at||r.revoked_at));
    assert.equal(rows(f,'account_security_events').at(-1).action,'PASSWORD_RESET'); noCredentials(result,f);
});
for (const scenario of ['wrong purpose','expired','reused','revoked','version mismatch','disabled','invited']) {
    test(`reset rejects ${scenario}`, async t => {
        const f=fixture(t); await active(f); await f.service.forgot(f.invite.email); const token=f.token();
        if(scenario==='wrong purpose') f.db.exec("UPDATE account_action_tokens SET purpose='SETUP' WHERE used_at IS NULL");
        if(scenario==='expired') f.advance(1800);
        if(scenario==='reused') await f.service.complete('RESET',body(token));
        if(scenario==='revoked') f.db.exec("UPDATE account_action_tokens SET revoked_at='2026-09-23' WHERE used_at IS NULL");
        if(scenario==='version mismatch') f.db.exec('UPDATE users SET auth_version=auth_version+1');
        if(scenario==='disabled') f.db.exec("UPDATE users SET account_state='DISABLED',is_active=0");
        if(scenario==='invited') f.db.exec("UPDATE users SET account_state='INVITED',is_active=0");
        const before=user(f).password;
        await assert.rejects(f.service.complete('RESET',body(token)),/invalid or expired/);
        assert.ok(user(f).password===before);
    });
}
test('concurrent resets consume once; issuance has persistent account cooldown and reissue revokes older reset', async t => {
    const f=fixture(t); await active(f);
    await Promise.all([f.service.forgot(f.invite.email), f.service.forgot(f.invite.email)]);
    assert.equal(f.messages.length,2); const old=f.token();
    f.advance(61); await f.service.forgot(f.invite.email);
    await assert.rejects(f.service.complete('RESET',body(old)),/invalid or expired/);
    const results=await Promise.allSettled([f.service.complete('RESET',body(f.token())),f.service.complete('RESET',body(f.token()))]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('unknown, malformed, invited, disabled and legacy employee forgot requests send no messages', async t => {
    const f=fixture(t); await f.provision(); const sent=f.messages.length;
    for(const email of ['unknown@example.invalid',{},'', 'x'.repeat(1000), f.invite.email]) await f.service.forgot(email);
    assert.equal(f.messages.length,sent); await f.service.complete('SETUP',body(f.token()));
    f.db.exec("UPDATE users SET account_state='DISABLED',is_active=0"); await f.service.forgot(f.invite.email);
    f.db.exec("UPDATE users SET account_state='ACTIVE',is_active=1,role='EMPLOYEE'"); await f.service.forgot(f.invite.email);
    assert.equal(f.messages.length,sent);
});
test('mail failure leaves invitation inactive and revokes possibly delivered token; reset failure leaves credentials untouched', async t => {
    const f=fixture(t); f.failMail(); const result=await f.provision();
    assert.equal(result.delivery,'failed'); assert.equal(user(f).password,null); assert.ok(rows(f,'account_action_tokens')[0].revoked_at);
    f.failMail(false); await f.operator.run({action:'reissue',userId:user(f).user_id,email:f.invite.email,operator:'fixture-operator'},f.apply);
    await f.service.complete('SETUP',body(f.token())); const before=user(f).password;
    f.failMail(); await f.service.forgot(f.invite.email); assert.ok(user(f).password===before);
    assert.ok(rows(f,'account_action_tokens').at(-1).revoked_at);
});
test('disable increments version, revokes tokens, preserves reports by never issuing business SQL, and cannot reissue', async t => {
    const f=fixture(t); await active(f); await f.service.forgot(f.invite.email); const before=user(f).auth_version;
    const input={action:'disable',userId:user(f).user_id,email:f.invite.email,operator:'fixture-operator'};
    await f.operator.run(input); assert.equal(user(f).account_state,'ACTIVE');
    await f.operator.run(input,{apply:true}); assert.equal(user(f).account_state,'DISABLED'); assert.equal(user(f).is_active,0);
    assert.equal(user(f).auth_version,before+1); assert.ok(rows(f,'account_action_tokens').every(r=>r.used_at||r.revoked_at));
    await assert.rejects(f.operator.run({...input,action:'reissue'},f.apply));
    await f.operator.run(input,{apply:true}); assert.equal(user(f).auth_version,before+1);
    assert.ok(f.queries.every(sql=>!sql.includes('daily_business')));
});
test('provision rejects email collisions, branch incumbents, wrong mapping/name/role/inactive branch and missing apply acknowledgments', async t => {
    const f=fixture(t);
    await assert.rejects(f.operator.run(f.invite,{apply:true}),/requires/);
    for(const changes of [{email:'someone@external.invalid'}, {email:'other@example.invalid'}, {role:'ADMIN'}, {name:'Human Claim'}, {branchCode:'MISSING'}]) {
        await assert.rejects(f.operator.run({...f.invite,...changes}));
    }
    f.db.exec('UPDATE branches SET is_active=0 WHERE branch_id=38'); await assert.rejects(f.operator.run(f.invite));
    f.db.exec('UPDATE branches SET is_active=1 WHERE branch_id=38'); await f.provision();
    await assert.rejects(f.operator.run(f.invite),/already belongs/);
    f.db.exec("UPDATE users SET email='incumbent@example.invalid'");
    await assert.rejects(f.operator.run(f.invite),/active\/invited/);
    assert.equal(f.messages.length,1);
});
test('Wani dry-run and provisioning leave existing Head Office identity unchanged', async t => {
    const f=fixture(t); f.db.exec("INSERT INTO users (name,email,password,role,branch_id,is_active,account_state,auth_version) VALUES ('Office fixture','existing-office@example.invalid','synthetic-unusable','HEAD_OFFICE',1,1,'ACTIVE',4)");
    const before=JSON.stringify(rows(f,'users')); await f.operator.run(f.invite);
    assert.equal(JSON.stringify(rows(f,'users')),before);
    await f.provision(); assert.equal(JSON.stringify(rows(f,'users').filter(u=>u.role==='HEAD_OFFICE')),before);
    assert.ok(f.messages.every(m=>m.to==='wani@example.invalid'));
});
test('password policy supports passphrases and exact UTF-8 bcrypt boundaries without composition rules', () => {
    assert.doesNotThrow(()=>passwordPolicy(password,password));
    for(const p of ['ab'.repeat(36),'éà'.repeat(18),'😀😃'.repeat(9)]) assert.doesNotThrow(()=>passwordPolicy(p,p));
    for(const p of ['', 'short', ' '.repeat(20), 'x'.repeat(15), 'ab'.repeat(37), 'é'.repeat(37),'😀'.repeat(19), 'valid passphrase\u0000bad']) assert.throws(()=>passwordPolicy(p,p));
    assert.throws(()=>passwordPolicy(password,'different')); assert.throws(()=>passwordPolicy({},{}));
});
test('bounded configuration rejects unsafe TTL and bcrypt values', () => {
    assert.equal(credentialConfig({}).setupSeconds,86400);
    for(const env of [{SETUP_TOKEN_SECONDS:'86401'},{RESET_TOKEN_SECONDS:'0'},{PASSWORD_BCRYPT_COST:'4'},{RESET_TOKEN_SECONDS:'NaN'}]) assert.throws(()=>credentialConfig(env));
});
test('mail is disabled by default; injection is test-only and unsafe origins/providers rejected', async () => {
    const disabled=createMailService({}); assert.equal(disabled.configured,false);
    await assert.rejects(disabled.sendCredential({}));
    assert.throws(()=>createMailService({NODE_ENV:'production'}, {send(){}}));
    for(const origin of ['http://bank.example.invalid','https://bank.example.invalid/path','https://user:pass@bank.example.invalid']) {
        assert.throws(()=>createMailService({NODE_ENV:'test',CREDENTIAL_APP_ORIGIN:origin},{send(){}}));
    }
    assert.throws(()=>createMailService({CREDENTIAL_MAIL_TRANSPORT:'smtp',CREDENTIAL_APP_ORIGIN:'https://bank.example.invalid'}));
});
test('operator CLI rejects accidental apply flags and unknown commands', () => {
    assert.equal(parseArgs(['invite','--operator','fixture']).options.apply,false);
    for(const args of [['invite','--apply','--dry-run'],['invite','--send-email'],['reset'],['disable','--apply','--send-email'],['invite','--email']]) assert.throws(()=>parseArgs(args));
});
test('forgot controller returns identical generic responses before background work; bounded queue and errors do not disclose secrets', async () => {
    const queue=[], seen=[];
    const controller=createCredentialController({forgot:async email=>{seen.push(email);}},fn=>queue.push(fn));
    const responses=[];
    for(const email of ['unknown@example.invalid','disabled@example.invalid',null,...Array(40).fill('active@example.invalid')]) {
        controller.forgot({body:{email}},{status(code){assert.equal(code,202);return this;},json(value){responses.push(JSON.stringify(value));}});
    }
    assert.equal(new Set(responses).size,1); assert.equal(seen.length,0); assert.equal(queue.length,32);
    await Promise.all(queue.map(fn=>fn())); assert.equal(seen.length,32);
});
test('completion rejects malformed token and oversized fields without mutations', async t => {
    const f=fixture(t); await f.provision();
    for(const input of [null,[],{},body('x'),{...body(f.token()),password:'a'.repeat(20000)}, {...body(f.token()),confirmPassword:null}]) await assert.rejects(f.service.complete('SETUP',input));
    assert.equal(user(f).password,null); assert.equal(rows(f,'account_security_events').length,1);
});

async function authenticate(identity, claims) {
    const context={exports:{},process:{env:{JWT_SECRET:'synthetic-credential-signing-key'}},console:{error(){}},require:name=>name==='../config/db'?{
        promise:()=>({query:async()=>[[identity]]})
    }:require(name)};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../middleware/auth.middleware.js'),'utf8'),context);
    let status=200, passed=false;
    await context.exports.verifyToken({headers:{authorization:`Bearer ${jwt.sign(claims,'synthetic-credential-signing-key')}`}},{status(n){status=n;return this;},json(){}},()=>{passed=true;});
    return {status,passed};
}
test('versionless, mismatched, malformed-version, inactive and invited JWT access fails closed', async () => {
    const identity={user_id:1,role:'MANAGER',branch_id:38,is_active:1,account_state:'ACTIVE',auth_version:2};
    assert.equal((await authenticate(identity,{user_id:1,auth_version:2})).passed,true);
    for(const claims of [{user_id:1},{user_id:1,auth_version:1},{user_id:1,auth_version:'2'},{user_id:1,auth_version:-1}]) assert.equal((await authenticate(identity,claims)).status,401);
    for(const change of [{is_active:0},{account_state:'INVITED'},{account_state:'DISABLED'}]) assert.equal((await authenticate({...identity,...change},{user_id:1,auth_version:2})).status,401);
});
test('actual reset invalidates old JWT on next protected request while new-version token succeeds', async t => {
    const f=fixture(t); await active(f); const claims={user_id:user(f).user_id,auth_version:user(f).auth_version};
    assert.equal((await authenticate(user(f),claims)).passed,true);
    await f.service.forgot(f.invite.email); await f.service.complete('RESET',body(f.token()));
    assert.equal((await authenticate(user(f),claims)).status,401);
    assert.equal((await authenticate(user(f),{...claims,auth_version:user(f).auth_version})).passed,true);
});
test('historical detail uses creator snapshot after user rename/reassignment, retaining branch filter', async () => {
    const db=new (require('node:sqlite').DatabaseSync)(':memory:');
    try {
        db.function('DATE_FORMAT',(value, _format)=>value);
        db.exec(`CREATE TABLE branches(branch_id INTEGER,branch_name TEXT); CREATE TABLE users(user_id INTEGER,name TEXT,branch_id INTEGER);
            CREATE TABLE daily_business_entries(id INTEGER,branch_id INTEGER,manager_id INTEGER,manager_name TEXT,entry_date TEXT,total_amount TEXT,status TEXT,unlock_requested INTEGER,unlock_reason TEXT);
            CREATE TABLE daily_business_items(id INTEGER,entry_id INTEGER,sr_no INTEGER,account_type TEXT,status TEXT,amount TEXT,remark TEXT);
            INSERT INTO branches VALUES(38,'Wani Branch'); INSERT INTO users VALUES(7,'Manager A',38);
            INSERT INTO daily_business_entries VALUES(1,38,7,'Manager A','2026-09-23','1.00','SUBMITTED',0,NULL);
            INSERT INTO daily_business_items VALUES(1,1,1,'Savings','Opened','1.00','');
            UPDATE users SET name='Manager B',branch_id=37 WHERE user_id=7;`);
        const context={exports:{},console:{error(){}},require:name=>name==='../config/db'?{query(sql,args,callback){
            assert.match(sql,/WHERE e.branch_id = \? AND e.entry_date = \?/); callback(null,db.prepare(sql).all(...args));
        }}:require('../services/business-report.service')};
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../controllers/business.controller.js'),'utf8'),context);
        const response=await new Promise(resolve=>context.exports.getBranchDetails({params:{id:'38'},query:{date:'2026-09-23'}},{json:resolve}));
        assert.equal(response.manager_name,'Manager A'); assert.equal(response.branch_id,38);
    } finally {db.close();}
});

async function loginFixture(changes = {}, race = null) {
    const initial={user_id:1,role:'MANAGER',branch_id:38,is_active:1,account_state:'ACTIVE',auth_version:3,password:'synthetic-hash',...changes};
    let queries=0; const logs=[];
    const context={exports:{},process:{env:{JWT_SECRET:'synthetic-login-secret'}},console:{error:()=>logs.push('generic')},require:name=>({
        '../config/db':{query(_sql,_values,callback){queries++;callback(null,[queries===1||!race?initial:{...initial,...race}]);}},
        bcryptjs:{compare:async()=>true},jsonwebtoken:jwt
    })[name]};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../controllers/auth.controller.js'),'utf8'),context);
    return new Promise(resolve=>{let status=200;context.exports.login({body:{email:'wani@example.invalid',password:'synthetic-input'}},{status(n){status=n;return this;},json(value){resolve({status,value,queries,logs});}});});
}
test('login requires ACTIVE consistent state and new JWT carries observed auth_version',async()=>{
    const result=await loginFixture();assert.equal(result.status,200);
    const claims=jwt.verify(result.value.token,'synthetic-login-secret');assert.equal(claims.auth_version,3);assert.equal(claims.exp-claims.iat,36000);
    assert.equal(result.queries,2);assert.deepEqual(result.logs,[]);
    for(const change of [{account_state:'INVITED'},{account_state:'DISABLED'},{is_active:0},{auth_version:undefined},{password:null}]) assert.equal((await loginFixture(change)).status,401);
});
test('login cannot mint a new-version JWT after checking an old password during concurrent reset/disable',async()=>{
    for(const race of [{auth_version:4,password:'synthetic-new-hash'},{is_active:0,account_state:'DISABLED'},{password:'synthetic-new-hash'}]){
        const result=await loginFixture({},race);assert.equal(result.status,401);assert.equal(result.value.token,undefined);
    }
});
test('HTTP recovery routes enforce generic responses, IP limits, body bounds and sanitized completion failures',async t=>{
    const express=require('express');
    const queue=[];const controller=createCredentialController({forgot:async()=>{},complete:async()=>{throw new Error('private SQL token password');}},fn=>queue.push(fn));
    const logs=[];
    // Load controller in a VM with a private logger to test failures without emitting fixture secret strings.
    const context={exports:{},setImmediate,console:{error:message=>logs.push(message)},require:name=>{
        if(name==='../config/db')return{};
        return require(path.resolve(__dirname,'../controllers',name));
    }};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../controllers/credential.controller.js'),'utf8'),context);
    const failing=context.exports.createCredentialController({complete:async()=>{throw new Error('private SQL token password');}});
    const {MemoryStore}=require('express-rate-limit');const store=new MemoryStore();t.after(()=>store.shutdown());
    const limiter=require('../middleware/login-limit.middleware').createLoginLimiter({limit:3,store});
    const routerContext={module:{exports:{}},require:name=>{
        if(name==='express')return express;
        if(name.includes('auth.controller'))return{login:(_req,res)=>res.json({})};
        if(name.includes('credential.controller'))return{forgot:controller.forgot,setup:async(req,res)=>await failing.complete('SETUP')(req,res),reset:async(req,res)=>await failing.complete('RESET')(req,res)};
        if(name.includes('login-limit'))return{createLoginLimiter:()=>limiter};
        throw new Error('Unexpected fixture import');
    }};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../routes/auth.routes.js'),'utf8'),routerContext);
    const app=express();app.use('/api/auth',routerContext.module.exports);app.use(require('../middleware/error.middleware').errorHandler);
    const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
    const request=(route,data)=>fetch(`http://127.0.0.1:${server.address().port}/api/auth/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const first=await request('forgot-password',{email:'unknown@example.invalid'});assert.equal(first.status,202);
    assert.deepEqual(await first.json(),{message:'If this account is eligible, password reset instructions will be emailed.'});
    const oversized=await request('setup-password',{token:'x'.repeat(5000)});assert.equal(oversized.status,413);
    const failure=await request('reset-password',{});assert.equal(failure.status,503);assert.doesNotMatch(JSON.stringify(await failure.json()),/private|SQL|password/);
    const limited=await request('forgot-password',{email:'other@example.invalid'});assert.equal(limited.status,429);
    assert.ok(logs.every(message=>message==='Credential completion unavailable'));
});

test('HTTP mail adapter requires explicit recipient allowlist and uses a bounded HTTPS request without logging provider data',async t=>{
    const calls=[];const original=global.fetch;t.after(()=>{global.fetch=original;});
    global.fetch=async(endpoint,options)=>{calls.push({endpoint:String(endpoint),options});return{ok:true,body:{cancel:async()=>{}}};};
    const env={CREDENTIAL_MAIL_TRANSPORT:'http',CREDENTIAL_APP_ORIGIN:'https://reporting.example.invalid',CREDENTIAL_MAIL_ENDPOINT:'https://mail.example.invalid/send',CREDENTIAL_MAIL_FROM:'reporting@example.invalid',CREDENTIAL_MAIL_API_KEY:'synthetic-provider-key',CREDENTIAL_MAIL_ALLOWED_RECIPIENTS:'wani@example.invalid'};
    assert.throws(()=>createMailService({...env,CREDENTIAL_MAIL_ALLOWED_RECIPIENTS:''}));
    const mail=createMailService(env);const message={email:'wani@example.invalid',name:'Wani fixture',purpose:'SETUP',token:'a'.repeat(43),expiresSeconds:86400};
    await mail.sendCredential(message);assert.equal(calls.length,1);assert.equal(calls[0].options.redirect,'error');assert.ok(calls[0].options.signal);
    const payload=JSON.parse(calls[0].options.body);assert.equal(payload.to,'wani@example.invalid');assert.ok(payload.text.includes('/setup-password#token='));
    await assert.rejects(mail.sendCredential({...message,email:'office@example.invalid'}));assert.equal(calls.length,1);
    global.fetch=async()=>({ok:false,body:{cancel:async()=>{}}});await assert.rejects(mail.sendCredential(message),/Mail delivery failed/);
});
