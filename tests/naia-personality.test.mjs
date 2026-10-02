import test from 'node:test';
import assert from 'node:assert/strict';
import { naiaSessionOpening } from '../app/backend/naia-greeting.mjs';
import { makeTavusClient, loadRuntimePrompt, FACE_ID } from '../app/backend/tavus.mjs';

test('Naia greeting uses WIB boundaries even on a UTC server and varies naturally', () => {
  for (const [hour, period] of [[0,'malam'],[4,'malam'],[5,'pagi'],[10,'pagi'],[11,'siang'],[14,'siang'],[15,'sore'],[17,'sore'],[18,'malam'],[23,'malam']]) {
    const now = new Date(`2026-10-02T${String(hour).padStart(2,'0')}:00:00+07:00`);
    const variants = [0,1,2].map(variant => naiaSessionOpening({ now, variant }));
    assert.equal(new Set(variants.map(x=>x.greeting)).size, 3);
    for (const result of variants) {
      assert.match(result.greeting, new RegExp(`^Selamat ${period}\\.`));
      assert.doesNotMatch(result.greeting, /saya Naia|aku Naia|asisten pribadi/i);
      assert.match(result.context, /WIB/);
    }
  }
});

test('session opening is applied only to Naia; Supabase context and Dr. Paws stay intact', async () => {
  for (const mode of ['naya', 'dr_paws']) {
    let body;
    const client = makeTavusClient({ apiKey:'fake-private-key', mode, envPalId:'p-existing', faceId:FACE_ID,
      openingFactory:()=>naiaSessionOpening({now:new Date('2026-10-02T16:00:00+07:00'),variant:1}),
      fetchImpl:async(url,options)=> {
        if(options.method === 'GET') return Response.json({pal_id:'p-existing',pal_name:mode==='naya'?'Naia':'Dr. Paws',default_face_id:FACE_ID});
        body=JSON.parse(options.body);
        return Response.json({conversation_id:'c12345',conversation_url:'https://tavus.daily.co/c12345',status:'active'});
      },
    });
    await client.createConversation({conversationalContext:'Fakta proyek dari Supabase'});
    if(mode==='naya') {
      assert.match(body.custom_greeting,/^Selamat sore/);
      assert.match(body.conversational_context,/Fakta proyek dari Supabase/);
      assert.match(body.conversational_context,/WIB/);
      assert.equal(body.dynamic_greeting,false);
    } else {
      assert.equal(body.custom_greeting,undefined);
      assert.equal(body.conversational_context,'Fakta proyek dari Supabase');
      assert.equal(body.dynamic_greeting,true);
    }
    assert.equal(body.participant_tags,undefined);
    assert.equal(body.memory_stores,undefined);
    assert.doesNotMatch(JSON.stringify(body),/fake-private-key/);
  }
});

test('runtime persona is compact and contains actionable business thinking plus existing safeguards', async () => {
  const prompt=await loadRuntimePrompt();
  assert.ok(prompt.length < 4000);
  for(const fragment of ['sahabat dekat','CAC/LTV','arus kas','eksperimen kecil','asumsi','curhat','bukan psikolog','jujur bahwa kamu AI','hubungan eksklusif']) assert.ok(prompt.includes(fragment),fragment);
});
