import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { CoreModule, Database, digest } from '../../dist/core.js';
import { CodingModule } from '../../dist/coding.js';
import { exercises, starter } from '../../../web/utils/codingLab.mjs';

test('download, run, save, retry and read isolated learner history', async t => {
  process.env.DEV_AUTH_BYPASS = 'false';
  class TestApp {}
  Module({ imports: [CoreModule, CodingModule] })(TestApp);
  const app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, '127.0.0.1');
  const db = app.get(Database);
  const dir = await mkdtemp(join(tmpdir(), 'learnloop-'));
  const users = [];
  t.after(async () => {
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  async function member() {
    const sid = randomUUID();
    const user = await db.user.create({ data: { identity: sid, name: 'test', tokens: {
      create: { digest: digest(sid), expires: new Date(Date.now() + 60000) }
    } } });
    users.push(user.id);
    return { cookie: 'sid=' + sid, 'Content-Type': 'application/json' };
  }
  const owner = await member();
  const other = await member();
  const url = await app.getUrl() + '/coding';
  const exercise = exercises[0];
  const history = headers => fetch(url + '/history/' + exercise.id, { headers }).then(r => r.json());
  const issued = await fetch(url + '/files', { method: 'POST', headers: owner, body: JSON.stringify({ exercise: exercise.id }) });
  assert.equal(issued.status, 201);
  const { attempt, token } = await issued.json();
  const path = join(dir, 'exercise.mjs');
  const script = starter(exercise, attempt, { url: url + '/submit', token });
  const run = (...args) => promisify(execFile)(process.execPath, [path, ...args]);
  await writeFile(path, script);
  await assert.rejects(run(), error => error.code === 1 && error.stdout.includes('0/3'));
  assert.equal((await history(owner))[0].passed, 0);
  await writeFile(path, script.replace('// เขียนคำตอบตรงนี้', 'return [...new Set(input)]'));
  await run();
  await Promise.all([run('--retry'), run('--retry')]);
  const rows = await history(owner);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].passed, 3);
  assert.match(rows[0].answer, /new Set/);
  assert.ok(!rows[0].answer.includes(token));
  assert.deepEqual(await history(other), []);
  assert.equal((await fetch(url + '/history/' + exercise.id)).status, 401);
  const body = await readFile(join(dir, exercise.id + '-result.json'), 'utf8');
  const post = (bearer, body) => fetch(url + '/submit', { method: 'POST', headers: { authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' }, body });
  assert.equal((await post(randomUUID(), body)).status, 401);
  assert.equal((await post(token, JSON.stringify({ ...JSON.parse(body), passed: 4 }))).status, 400);
  const plan = () => fetch(url + '/plan', {headers:owner}).then(r=>r.json());
  const learning = await plan();
  assert.equal(learning.pending.length, 3);
  assert.equal(learning.stats.find(s=>s.skill==='collection').missed, 1);
  assert.ok(learning.catalog.some(ex=>ex.level===3 && ex.skill==='async'));
  let calls = 0;
  const ollama = createServer(async (req,res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    const { format, messages } = JSON.parse(data);
    assert.ok(messages[1].content.includes('failedCaseIndices'));
    const fields = format.properties;
    const output = fields.hint ? {hint:'ลองไล่ข้อมูลซ้ำทีละตัว'} : fields.steps ? {steps:[{line:1,event:'เรียก solve',variables:'input=[]',stack:'solve',flow:'input → solve',condition:'',yes:'',no:''}]} :
      Object.fromEntries(Object.keys(fields).map(k=>[k,{line:1,feedback:'ตรวจกรณีขอบ'}]));
    calls++;
    res.end(JSON.stringify({message:{content:JSON.stringify(output)}}));
  });
  await new Promise(resolve=>ollama.listen(0,'127.0.0.1',resolve));
  process.env.OLLAMA_URL = 'http://127.0.0.1:' + ollama.address().port;
  t.after(()=>new Promise(resolve=>ollama.close(resolve)));
  const ask = (headers,kind) => fetch(url + '/coach/' + rows[1].id,{method:'POST',headers,body:JSON.stringify({kind})});
  assert.equal((await ask(other,'hint1')).status,404);
  for (const kind of ['hint1','hint2','hint3','review','visual','hint1']) assert.equal((await ask(owner,kind)).status,201);
  assert.equal(calls,5);
  assert.equal((await history(owner))[1].tutorNotes.length,5);
  async function runExercise(ex, answer) {
    const issue = await fetch(url + '/files',{method:'POST',headers:owner,body:JSON.stringify({exercise:ex.id})}).then(r=>r.json());
    await writeFile(path,starter(ex,issue.attempt,{url:url+'/submit',token:issue.token}).replace('// เขียนคำตอบตรงนี้',answer));
    await run();
  }
  const drill = learning.catalog.find(ex=>ex.id===learning.pending[0]);
  await runExercise(drill,'return [...new Set(input)]');
  assert.ok(!(await plan()).pending.includes(drill.id));
  await runExercise(learning.catalog.find(ex=>ex.id==='awaitLookup'),'return await lookup(input)');
  assert.equal((await plan()).level,2);
  await runExercise(learning.catalog.find(ex=>ex.id==='safeLookup'),"try { return await lookup(input); } catch { return 'retry'; }");
  await runExercise(learning.catalog.find(ex=>ex.id==='serviceLookup'),"try { const body=await lookup(input); return {status:body?200:404,body}; } catch {return {status:503,body:null};}");
  assert.equal((await plan()).level,3);
});
