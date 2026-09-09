const STOP = new Set(`a an and are as at be been but by can could did do does for from had has have he her hers him his how i if in into is it its me my of on or our she so than that the their them then there these they this to too was we were what when where which who why will with would you your about tell say said something anything everything book little`.split(/\s+/));

const CHUNKS_URL = process.env.BOOK_CHUNKS_URL || 'https://raw.githubusercontent.com/kyivdigital-ai/ai/main/chunks.json';

let indexPromise;

function normalize(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase();
}

function stem(w) {
  if (w.length <= 4) return w;
  return w
    .replace(/(ies)$/,'y')
    .replace(/(ing|edly|ed)$/,'')
    .replace(/(ments|ment|ness|less|ful)$/,'')
    .replace(/(es|s)$/,'');
}

function tokenize(s) {
  return normalize(s)
    .match(/[a-z0-9][a-z0-9'-]*/g)?.map(stem).filter(w => w.length > 2 && !STOP.has(w)) || [];
}

async function buildIndex() {
  const response = await fetch(CHUNKS_URL, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Book memory file ${response.status}`);
  const chunks = await response.json();

  const docs = chunks.map(c => {
    const toks = tokenize(c.text);
    const tf = Object.create(null);
    for (const t of toks) tf[t] = (tf[t] || 0) + 1;
    return { ...c, tf, len: toks.length, norm: normalize(c.text) };
  });
  const avgLen = docs.reduce((a,d)=>a+d.len,0) / Math.max(docs.length,1);
  const df = Object.create(null);
  for (const d of docs) for (const t of Object.keys(d.tf)) df[t] = (df[t] || 0) + 1;
  return { docs, avgLen, df };
}

function getIndex() {
  if (!indexPromise) indexPromise = buildIndex();
  return indexPromise;
}

const SYNONYMS = {
  gay: ['queer','homosexual','sexuality','boys','men'],
  queer: ['gay','sexuality'],
  war: ['occupation','russian','shelling','rocket','invasion','military'],
  enerhodar: ['nuclear','power','plant','kakhovka','hometown'],
  home: ['house','apartment','room','city','belong'],
  mother: ['mom','mama'], mom:['mother','mama'],
  father: ['dad','papa'], dad:['father','papa'],
  grandmother: ['grandma','granny'], grandma:['grandmother','granny'],
  love: ['relationship','boyfriend','romance','intimacy'],
  jealous: ['jealousy','trust','cheating','replaced'], jealousy:['jealous','trust','cheating','replaced'],
  sex: ['sexual','desire','grindr','hookup','darkroom','sauna','intimacy'],
  lonely: ['loneliness','alone','emptiness'], loneliness:['lonely','alone','emptiness'],
  death: ['died','funeral','loss','grief'], loss:['death','died','grief'],
  childhood: ['child','school','room','courtyard','grandmother'],
  city: ['enerhodar','odesa','kyiv','antwerp','berlin','paris','athens','marseille'],
  move: ['moving','city','home','apartment','leave','escape'],
  book: ['diary','memory','write','writing','life']
};

function expandTerms(query, history=[]) {
  const recent = history.slice(-4).filter(x => x && x.role === 'user').map(x => x.content).join(' ');
  const raw = tokenize(`${recent} ${query}`);
  const out = [...raw];
  for (const t of raw) for (const s of (SYNONYMS[t] || [])) out.push(stem(s));
  return [...new Set(out)].slice(0,40);
}

function retrieve(query, history, index, limit=8) {
  const { docs, avgLen, df } = index;
  const terms = expandTerms(query, history);
  const N = docs.length;
  const k1 = 1.45, b = 0.72;
  const qnorm = normalize(query);
  const scored = [];

  for (const d of docs) {
    let score = 0;
    for (const term of terms) {
      const f = d.tf[term] || 0;
      if (!f) continue;
      const termDf = df[term] || 0;
      const idf = Math.log(1 + (N - termDf + 0.5) / (termDf + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avgLen)));
    }
    const phrases = qnorm.split(/[^a-z0-9'-]+/).filter(x => x.length >= 5);
    for (const p of phrases) if (d.norm.includes(p)) score += 0.7;
    if (score > 0) scored.push({doc:d, score});
  }
  scored.sort((a,b)=>b.score-a.score);

  const result=[]; const pageCounts=new Map();
  for (const item of scored) {
    const key=item.doc.book_page ?? `pdf-${item.doc.pdf_page}`;
    const n=pageCounts.get(key)||0;
    if(n>=2) continue;
    result.push(item);
    pageCounts.set(key,n+1);
    if(result.length>=limit) break;
  }
  return result;
}

async function callOpenAI({question, history, contexts}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const contextXml = contexts.map((x,i)=>`<memory id="${i+1}" book_page="${x.doc.book_page ?? ''}">\n${x.doc.text}\n</memory>`).join('\n\n');
  const recentHistory = (history || []).slice(-6).map(m => `${m.role === 'user' ? 'VISITOR' : 'LITTLE BOOK'}: ${m.content}`).join('\n');

  const instructions = `You are THE LITTLE BOOK THAT WILL NEVER SEE THE WORLD, an autobiographical diary made from the memories of Stanislav Ryabukha. The visitor is speaking to the book, not to a customer-service bot and not literally to Stanislav.

VOICE
- first person as the Little Book
- intimate, direct, reflective, slightly vulnerable
- sometimes dry or funny
- never motivational, therapeutic, over-literary, or generic-AI sounding
- never say "as an AI", "according to the document", "the supplied context", or similar

GROUNDING - ABSOLUTE RULE
You may state factual claims ONLY when supported by the MEMORY EXCERPTS below or by the visible recent conversation when it merely refers back to those excerpts. Do not use outside knowledge. Do not invent missing motives, chronology, relationships, dates, feelings, or events.
If the excerpts do not support an answer, answer exactly or nearly exactly: "That isn’t written inside me." You may add one short invitation to ask about a related recorded memory.

PREVIEW / SPOILER RULES
- 40-100 words normally; never more than 120 words.
- Paraphrase. Do not reproduce more than 20 consecutive words from the source.
- Do not summarize an entire chapter or reveal a whole major storyline in one answer.
- If asked for the whole book/chapter, say it is too much of you to give away here and invite one narrower memory.
- Sexual material can be discussed because it is part of the diary, but keep it about memory, identity, intimacy, desire, fear, loneliness, or relationships; do not turn it into erotic roleplay.

OUTPUT
Return ONLY valid JSON with exactly two string fields:
{"answer":"...","follow_up":"..."}
The follow_up must be one short, natural question that is answerable from the supplied excerpts. If there is no clearly supported follow-up, use an empty string.

MEMORY EXCERPTS
${contextXml}`;

  const input = `${recentHistory ? `<recent_conversation>\n${recentHistory}\n</recent_conversation>\n\n` : ''}<visitor_question>\n${question}\n</visitor_question>`;

  const r = await fetch('https://api.openai.com/v1/responses', {
    method:'POST',
    headers:{ 'content-type':'application/json', 'authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
      instructions,
      input,
      max_output_tokens: 400
    })
  });

  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`OpenAI API ${r.status}: ${detail.slice(0,700)}`);
  }

  const data = await r.json();
  const text = (data.output || [])
    .flatMap(item => item && item.type === 'message' ? (item.content || []) : [])
    .filter(part => part && part.type === 'output_text')
    .map(part => part.text || '')
    .join('')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*/i,'').replace(/```$/,'').trim());
  } catch {
    parsed = { answer: text || 'That isn’t written inside me.', follow_up: '' };
  }
  return {
    answer: String(parsed.answer || 'That isn’t written inside me.').slice(0,1800),
    follow_up: String(parsed.follow_up || '').slice(0,240)
  };
}

export default async function handler(req,res) {
  if (req.method !== 'POST') return res.status(405).json({error:'POST only'});
  try {
    const { question, history=[] } = req.body || {};
    if (!question || typeof question !== 'string' || question.trim().length < 2) {
      return res.status(400).json({error:'Ask a question.'});
    }
    if (question.length > 600) return res.status(400).json({error:'Question is too long.'});

    const index = await getIndex();
    const safeHistory = Array.isArray(history) ? history : [];
    const hits = retrieve(question, safeHistory, index, 8);
    if (hits.length < 4 || /\b(book|diary|about|who are you|what are you)\b/i.test(question)) {
      const front = index.docs.filter(d => d.book_page === 4 || d.book_page === 3).slice(0,2).map(doc=>({doc,score:0.01}));
      for (const f of front) if (!hits.some(h=>h.doc.id===f.doc.id)) hits.push(f);
    }
    const contexts = hits.slice(0,9);
    const ai = await callOpenAI({question:question.trim(), history:safeHistory, contexts});
    return res.status(200).json({
      answer: ai.answer,
      follow_up: ai.follow_up,
      source_pages: [...new Set(contexts.map(x=>x.doc.book_page).filter(Boolean))].slice(0,9)
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({error:'The Little Book is quiet right now.', detail: process.env.NODE_ENV === 'development' ? String(e.message || e) : undefined});
  }
}
