const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepare, apply, tableSql, definitions } = require('./phase5d-migration');

function fixture(migrated = false) {
    const tables = [{TABLE_NAME:'users',ENGINE:'InnoDB'}];
    const columns = [
        {TABLE_NAME:'users',COLUMN_NAME:'user_id',COLUMN_TYPE:'int',IS_NULLABLE:'NO'},
        {TABLE_NAME:'users',COLUMN_NAME:'password',COLUMN_TYPE:'varchar(255)',IS_NULLABLE:'YES'},
        {TABLE_NAME:'users',COLUMN_NAME:'is_active',COLUMN_TYPE:'tinyint(1)',IS_NULLABLE:'YES'}
    ];
    const indexes = [], fks=[], checks=[], triggers=[], writes=[];
    const addIndex=(table,name,fields,unique)=>fields.forEach((column,i)=>indexes.push({TABLE_NAME:table,INDEX_NAME:name,COLUMN_NAME:column,SEQ_IN_INDEX:i+1,NON_UNIQUE:unique?0:1,SUB_PART:null}));
    addIndex('users','PRIMARY',['user_id'],true); addIndex('users','email',['email'],true);
    if(migrated){
        for(const [name,type,nullable,def] of [['account_state',"enum('INVITED','ACTIVE','DISABLED')",'NO','INVITED'],['auth_version','int unsigned','NO','0'],['password_changed_at','datetime(6)','YES',null]]) columns.push({TABLE_NAME:'users',COLUMN_NAME:name,COLUMN_TYPE:type,IS_NULLABLE:nullable,COLUMN_DEFAULT:def,EXTRA:''});
        for(const[table,fields]of Object.entries(definitions)){
            tables.push({TABLE_NAME:table,ENGINE:'InnoDB'});
            for(const[name,[type,nullable]]of Object.entries(fields))columns.push({TABLE_NAME:table,COLUMN_NAME:name,COLUMN_TYPE:type,IS_NULLABLE:nullable,COLUMN_DEFAULT:null,EXTRA:name==='id'?'auto_increment':''});
            addIndex(table,'PRIMARY',['id'],true);
        }
        addIndex('account_action_tokens','token_hash',['token_hash'],true);addIndex('account_action_tokens','user_purpose',['user_id','purpose'],false);addIndex('account_action_tokens','expires_at',['expires_at'],false);
        addIndex('account_security_events','subject_timeline',['subject_user_id','created_at'],false);addIndex('account_security_events','actor',['actor_user_id'],false);
        for(const[table,column]of [['account_action_tokens','user_id'],['account_security_events','subject_user_id'],['account_security_events','actor_user_id']]) fks.push({TABLE_NAME:table,COLUMN_NAME:column,REFERENCED_TABLE_NAME:'users',REFERENCED_COLUMN_NAME:'user_id',same_schema:1,UPDATE_RULE:'RESTRICT',DELETE_RULE:'RESTRICT'});
    }
    const counts={total:58,active:38,disabled:20,invalid_flags:0,invalid_active_hashes:0};
    const c={async query(sql){
        if(sql.includes('information_schema.TABLES'))return[tables];
        if(sql.includes('information_schema.COLUMNS'))return[columns];
        if(sql.includes('information_schema.STATISTICS'))return[indexes];
        if(sql.includes('information_schema.KEY_COLUMN_USAGE'))return[fks];
        if(sql.includes('information_schema.TABLE_CONSTRAINTS'))return[checks];
        if(sql.includes('information_schema.TRIGGERS'))return[triggers];
        if(sql.includes('AS invalid_states'))return[[{invalid_states:0}]];
        if(sql.includes('AS total')){assert.match(sql,/REGEXP_LIKE/);return[[counts]];}
        if(/^(ALTER|CREATE|UPDATE)/.test(sql)){writes.push(sql);return[{}];}
        throw new Error('Unexpected fixture query');
    }};
    return{c,tables,columns,indexes,fks,checks,triggers,writes,counts};
}
test('migration dry-run plans only credential schema, preserves business tables and existing credentials',async()=>{
    const f=fixture();const plan=await prepare(f.c);
    assert.deepEqual(plan.blocked,[]);assert.equal(f.writes.length,0);assert.equal(plan.steps.length,7);
    assert.match(plan.steps.join('\n'),/WHERE account_state IS NULL/);
    assert.doesNotMatch(plan.steps.join('\n'),/daily_business|SET password\s*=|SET email|DELETE FROM|DROP /);
    assert.equal(plan.steps.filter(s=>s.startsWith('UPDATE')).length,1);
    assert.equal(plan.counts.active,38);assert.match(plan.fingerprint,/^[a-f0-9]{64}$/);
});
test('fully migrated schema yields empty idempotent plan',async()=>{
    const f=fixture(true);const plan=await prepare(f.c);assert.deepEqual(plan.blocked,[]);assert.deepEqual(plan.steps,[]);
});
test('interrupted nullable state migration resumes only unmapped users',async()=>{
    const f=fixture(true);const state=f.columns.find(c=>c.COLUMN_NAME==='account_state');state.IS_NULLABLE='YES';state.COLUMN_DEFAULT=null;
    const plan=await prepare(f.c);assert.deepEqual(plan.blocked,[]);assert.equal(plan.steps.length,2);assert.match(plan.steps[0],/WHERE account_state IS NULL/);
});
for(const issue of ['bad hash','invalid active flag','wrong FK','missing unique digest','unexpected column','wrong version','trigger','check','non-InnoDB']){
    test(`preflight fails safely for ${issue}`,async()=>{
        const f=fixture(true);
        if(issue==='bad hash')f.counts.invalid_active_hashes=1;
        if(issue==='invalid active flag')f.counts.invalid_flags=1;
        if(issue==='wrong FK')f.fks[0].DELETE_RULE='CASCADE';
        if(issue==='missing unique digest')f.indexes.find(i=>i.INDEX_NAME==='token_hash').NON_UNIQUE=1;
        if(issue==='unexpected column')f.columns.push({TABLE_NAME:'account_action_tokens',COLUMN_NAME:'raw_token'});
        if(issue==='wrong version')f.columns.find(c=>c.COLUMN_NAME==='auth_version'&&c.TABLE_NAME==='users').COLUMN_TYPE='int';
        if(issue==='trigger')f.triggers.push({TRIGGER_NAME:'unexpected'});
        if(issue==='check')f.checks.push({CONSTRAINT_NAME:'unexpected'});
        if(issue==='non-InnoDB')f.tables[0].ENGINE='MyISAM';
        const plan=await prepare(f.c);assert.ok(plan.blocked.length);await assert.rejects(apply(f.c,plan,{backup:true,quiesced:true,reviewedPlan:plan.fingerprint}));assert.equal(f.writes.length,0);
    });
}
test('apply requires reviewed exact fingerprint, backup and stopped writers',async()=>{
    const f=fixture();const plan=await prepare(f.c);
    for(const options of [{},{backup:true,quiesced:true,reviewedPlan:'wrong'},{backup:true,reviewedPlan:plan.fingerprint},{quiesced:true,reviewedPlan:plan.fingerprint}])await assert.rejects(apply(f.c,plan,options));
    assert.equal(f.writes.length,0);await apply(f.c,plan,{backup:true,quiesced:true,reviewedPlan:plan.fingerprint});assert.equal(f.writes.length,7);
});
test('DDL contains purpose/version/UTC-capable fields and restrictive actor links without secret-event fields',()=>{
    assert.match(tableSql.account_action_tokens,/token_hash BINARY\(32\) NOT NULL/);assert.match(tableSql.account_action_tokens,/UNIQUE KEY token_hash/);
    assert.match(tableSql.account_action_tokens,/purpose ENUM\('SETUP','RESET'\)/);assert.match(tableSql.account_security_events,/actor_user_id INT NULL/);
    assert.equal((Object.values(tableSql).join('\n').match(/ON DELETE RESTRICT ON UPDATE RESTRICT/g)||[]).length,3);
    assert.doesNotMatch(tableSql.account_security_events,/password|token|request_body|Authorization/i);
});
