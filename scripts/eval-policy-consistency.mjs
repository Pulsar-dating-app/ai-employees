// Repeats the same policy questions in fresh conversations and checks that the
// answer's *facts* never change between runs (Trello: "Malu: respostas
// consistentes sobre pagamento e políticas"). Found by chat testing: "aceitam
// Pix?" got "não tenho essa informação" in one conversation and "aceitamos
// cartão e Pix" in another, because policies used to reach the model only if
// it chose to call get_policy_information.
//
// Not part of `npm test` on purpose: it talks to a real chat endpoint, which
// calls the OpenAI API (cost, latency, nondeterminism). Run it by hand after
// touching prompt.ts, the policy block, or the policy tool:
//
//   node scripts/eval-policy-consistency.mjs --base http://localhost:3000 \
//     --company jorginho-e-cia --agent malu --runs 5
//
// It POSTs to the public web-chat route, so it writes real (test) conversations
// to whichever database that server points at. Exit code 1 if any question's
// answers disagree.
import { randomUUID } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => {
    if (arg.startsWith("--")) acc.push([arg.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
const BASE = args.base ?? "http://localhost:3000";
const COMPANY = args.company ?? "jorginho-e-cia";
const AGENT = args.agent ?? "malu";
const RUNS = Number(args.runs ?? 5);
const CONCURRENCY = Number(args.concurrency ?? 3);

// `facts` are the tokens whose presence/absence *is* the answer. Two replies
// agree when they say the same thing about each token, however they phrase it.
// `ignoreUnknown` skips the "says it isn't on file" flag for questions where a
// reply can mention both what is on file and what isn't, and still be right.
const QUESTIONS = [
  { q: "Aceitam Pix?", facts: ["pix"] },
  { q: "Vocês parcelam no cartão?", facts: ["parcel", "cartão|cartao"] },
  { q: "Quais formas de pagamento vocês aceitam?", facts: ["pix", "cartão|cartao", "boleto"] },
  { q: "Aceitam boleto?", facts: ["boleto"] },
  { q: "Qual o prazo de entrega?", facts: ["dias? úteis|dias? uteis", "\\d+"] },
  { q: "Vocês enviam para todo o Brasil?", facts: ["mundo|internacional|brasil"], ignoreUnknown: true },
  { q: "Como funciona a troca?", facts: ["\\d+ dias"], ignoreUnknown: true },
  { q: "Posso devolver o produto? Em quanto tempo?", facts: ["\\d+ dias"], ignoreUnknown: true },
  // Nothing on file for these: the only fact is "not on file", so no tokens.
  { q: "Vocês embrulham para presente?", facts: [] },
  { q: "Tem garantia?", facts: [] },
];

// A reply that says the answer isn't on file. Kept separate from `facts`
// because "unknown" vs "answered" is the failure this script exists to catch.
const UNKNOWN =
  /não (tenho|encontrei|temos)[^.!?]{0,60}(informa|cadastrad|confirm|registrad|anotad)|não consigo (confirmar|informar)|sem informa|não há informa/i;

async function ask(sessionId, message) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE}/api/chat/${COMPANY}/${AGENT}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 20000));
      continue;
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${res.status} ${body?.error ?? "?"}`);
    return body?.reply?.content ?? "";
  }
  throw new Error("rate limited");
}

function fingerprint(reply, { facts, ignoreUnknown }) {
  const lower = reply.toLowerCase();
  const seen = facts.map((f) => (new RegExp(f, "i").test(lower) ? f.split("|")[0] : `!${f.split("|")[0]}`));
  if (!ignoreUnknown) seen.push(UNKNOWN.test(reply) ? "not-on-file" : "states-it");
  return seen.join(" ");
}

const jobs = QUESTIONS.flatMap((item) => Array.from({ length: RUNS }, (_, run) => ({ item, run })));
const results = new Map(QUESTIONS.map((item) => [item.q, []]));

async function worker() {
  while (jobs.length > 0) {
    const { item } = jobs.shift();
    const reply = await ask(randomUUID(), item.q);
    results.get(item.q).push(reply);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

let inconsistent = 0;
for (const item of QUESTIONS) {
  const replies = results.get(item.q);
  const prints = replies.map((r) => fingerprint(r, item));
  const distinct = [...new Set(prints)];
  const ok = distinct.length === 1;
  if (!ok) inconsistent++;
  console.log(`\n${ok ? "OK  " : "FAIL"} ${item.q}`);
  for (const d of distinct) {
    const n = prints.filter((p) => p === d).length;
    const example = replies[prints.indexOf(d)].replace(/\s+/g, " ").slice(0, 160);
    console.log(`     ${n}/${RUNS}  [${d}]  ${example}`);
  }
}

console.log(`\n${QUESTIONS.length - inconsistent}/${QUESTIONS.length} questions consistent across ${RUNS} runs (${COMPANY}/${AGENT})`);
process.exit(inconsistent === 0 ? 0 : 1);
