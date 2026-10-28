import { describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../src/engine/flow/catalog';
import { fillsFor, glossaryAnswer, noamRequestFor, toNoamAnswer, validateNoamRequest } from '../src/engine/flow/noamRequest';
import { handleNoam } from './noam';
import { HOURLY_LIMIT } from './openrouter';

function fakeCache() {
  const store = new Map<string, Response>();
  return {
    match: async (request: Request) => store.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => void store.set(request.url, response),
  } as unknown as Cache;
}

const env = { OPENROUTER_API_KEY: 'sk-test' };
const mortgage = CATALOG.steps.find((step) => step.id === 'mortgageHow')!;
const REQUEST = noamRequestFor(CATALOG, ['REFINANCE'], mortgage, { refinanceGoal: 'LOWER_PAYMENT' }, 'משלמים בערך 4,800 בחודש ונשארו 17 שנה', []);
const ANSWER = {
  reply: 'מילאתי: החזר 4,800 ₪, 10–20 שנה.',
  fill: [
    { field: 'mortgageHow', value: 'MANUAL' },
    { field: 'mortgagePayment', value: '4800' },
    { field: 'mortgageYears', value: 'TEN_20' },
  ],
};
const post = (body: unknown, origin = 'https://app.test') =>
  new Request('https://app.test/api/noam', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
    body: JSON.stringify(body),
  });
const answering = (content: unknown) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })));

describe('what נועם is sent', () => {
  it('is the question, the answers so far in words, and the message with identifying details masked', () => {
    const request = noamRequestFor(CATALOG, ['BUY'], CATALOG.steps.find((step) => step.id === 'income')!, { propertyValue: 2_000_000, segment: 'FIRST_HOME' }, 'אני ישראל, ת.ז. 000000018, כמה זה נטו?', []);
    expect(request.question).toEqual({ title: 'כמה נכנס לכם בחודש, נטו?', fields: [{ id: 'netIncome', label: 'הכנסה נטו בחודש', kind: 'money', min: 1_000, max: 500_000 }] });
    expect(request.known).toEqual([
      { label: 'מחיר הדירה', value: '2,000,000 ₪' },
      { label: 'איזו דירה זו בשבילכם?', value: 'דירה ראשונה' },
    ]);
    expect(request.message).not.toContain('000000018');
  });

  it('never includes a document question as a field', () => {
    const upload = CATALOG.steps.find((step) => step.id === 'mortgageUpload')!;
    const withChoice = { ...upload, fields: [...upload.fields, mortgage.fields[0]!] };
    expect(noamRequestFor(CATALOG, ['REFINANCE'], withChoice, {}, 'מה זה?', []).question.fields.map((field) => field.id)).toEqual(['mortgageHow']);
  });
});

describe('the request, as the Worker accepts it', () => {
  it('accepts exactly its shape, rebuilt', () => {
    expect(validateNoamRequest({ ...REQUEST, extra: 'x' })).toEqual(REQUEST);
  });

  it('refuses anything else', () => {
    expect(validateNoamRequest(null)).toBe('not an object');
    expect(validateNoamRequest({ ...REQUEST, goals: ['HACK'] })).toBe('bad goals');
    expect(validateNoamRequest({ ...REQUEST, goals: [] })).toBe('bad goals');
    expect(validateNoamRequest({ ...REQUEST, message: 'x' })).toBe('bad message');
    expect(validateNoamRequest({ ...REQUEST, message: 'א'.repeat(401) })).toBe('bad message');
    expect(validateNoamRequest({ ...REQUEST, question: { title: 'ש', fields: [] } })).toBe('bad question');
    expect(validateNoamRequest({ ...REQUEST, question: { title: 'ש', fields: [{ id: '1x', label: 'ל', kind: 'money' }] } })).toBe('bad field');
    expect(validateNoamRequest({ ...REQUEST, question: { title: 'ש', fields: [{ id: 'a', label: 'ל', kind: 'upload' }] } })).toBe('bad field');
    expect(validateNoamRequest({ ...REQUEST, question: { title: 'ש', fields: [{ id: 'a', label: 'ל', kind: 'choice', options: [{ id: 'A', label: 'א' }] }] } })).toBe('bad options');
    expect(validateNoamRequest({ ...REQUEST, history: [{ from: 'system', text: 'x' }] })).toBe('bad history');
    expect(validateNoamRequest({ ...REQUEST, known: Array(41).fill({ label: 'א', value: 'ב' }) })).toBe('bad known');
  });
});

describe('what נועם fills in', () => {
  it('takes valid answers to this screen’s fields, by id or by words, and drops the rest', () => {
    expect(
      fillsFor(mortgage, [
        ...ANSWER.fill,
        { field: 'mortgageBalance', value: '820,000 ₪' },
        { field: 'netIncome', value: '20000' },
        { field: 'mortgagePayment', value: 'הרבה' },
      ]),
    ).toEqual({ mortgageHow: 'MANUAL', mortgagePayment: 4_800, mortgageYears: 'TEN_20', mortgageBalance: 820_000 });
    expect(fillsFor(mortgage, [{ field: 'mortgageHow', value: 'אמלא בעצמי, בערך' }])).toEqual({ mortgageHow: 'MANUAL' });
    expect(fillsFor(mortgage, [{ field: 'mortgageBalance', value: '5' }])).toEqual({});
  });

  it('reads a multi as ids separated by commas, all or none', () => {
    const worry = CATALOG.steps.find((step) => step.id === 'worry')!;
    expect(fillsFor(worry, [{ field: 'worries', value: 'OVERDRAFT, LOANS' }])).toEqual({ worries: ['OVERDRAFT', 'LOANS'] });
    expect(fillsFor(worry, [{ field: 'worries', value: 'OVERDRAFT,NOPE' }])).toEqual({});
  });

  it('reads only a well-formed answer from the model', () => {
    expect(toNoamAnswer({ reply: ' שלום ', fill: [{ field: 'a', value: '1' }, { field: '$x', value: '2' }, { field: 'b' }] })).toEqual({
      reply: 'שלום',
      fill: [{ field: 'a', value: '1' }],
    });
    expect(toNoamAnswer({ reply: '' })).toBeNull();
    expect(toNoamAnswer('x')).toBeNull();
  });
});

describe('the glossary first', () => {
  it('answers a short "what is" about one of its terms without the AI, the longest name first', () => {
    expect(glossaryAnswer('מה זה פריים?')).toBe('prime');
    expect(glossaryAnswer('מה זה קל"צ')).toBe('fixedUnlinked');
    expect(glossaryAnswer('מה זו יתרה לסילוק?')).toBe('balance');
    expect(glossaryAnswer('מהו הון עצמי')).toBe('equity');
  });

  it('leaves to the AI what is not a short question about a term', () => {
    expect(glossaryAnswer('משלמים 4,800 בחודש')).toBeUndefined();
    expect(glossaryAnswer('מה כדאי לנו לבחור כשיש לנו פריים גבוה וגם הלוואה מהפנסיה שאנחנו לא בטוחים לגביה')).toBeUndefined();
    expect(glossaryAnswer('מה זה בכלל?')).toBeUndefined();
  });
});

describe('the endpoint', () => {
  it('sends the validated request with a strict schema, and returns the answer', async () => {
    const upstream = answering(ANSWER);
    const response = await handleNoam(post({ ...REQUEST, account: '12-345' }), env, fakeCache(), upstream);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { answer: unknown }).answer).toEqual(ANSWER);
    const sent = JSON.parse((upstream.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.response_format.json_schema).toMatchObject({ name: 'noamReply', strict: true });
    expect(sent.provider).toEqual({ data_collection: 'deny' });
    expect(JSON.parse(sent.messages[1].content)).toEqual(REQUEST);
  });

  it('refuses other sites and bad requests without calling the model, and limits each visitor', async () => {
    const upstream = answering(ANSWER);
    expect((await handleNoam(post(REQUEST, 'https://evil.test'), env, fakeCache(), upstream)).status).toBe(403);
    expect((await handleNoam(post({ ...REQUEST, message: '' }), env, fakeCache(), upstream)).status).toBe(400);
    expect((await handleNoam(post(REQUEST), {}, fakeCache(), upstream)).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
    const cache = fakeCache();
    for (let i = 0; i < HOURLY_LIMIT; i++) {
      await handleNoam(post(REQUEST), env, cache, answering(ANSWER));
    }
    expect((await handleNoam(post(REQUEST), env, cache, upstream)).status).toBe(429);
  });

  it('turns an unreadable answer into a 502', async () => {
    expect((await handleNoam(post(REQUEST), env, fakeCache(), answering({ reply: '' }))).status).toBe(502);
  });
});
