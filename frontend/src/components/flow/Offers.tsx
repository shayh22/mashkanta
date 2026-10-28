import { useState } from 'react';
import type { Answers } from '../../engine/flow/flow';
import type { MortgageOffer, OfferTrack, PricedOffer } from '../../engine/flow/offers';
import { BANK_SHEETS } from '../../engine/banks';
import { fetchDocumentJob, uploadApproval } from '../../lib/api';
import { formatCurrency, formatPercent } from '../../lib/format';
import { TRACK_NAMES } from '../../lib/trackColors';
import type { TrackType } from '../../lib/types';
import { useQuestionnaire } from '../../store/questionnaireStore';
import { useRankedOffers } from './offerHooks';
import { Panel } from './parts';

/**
 * The offers the household got, side by side: each bank's tracks, read from an approval in
 * principle or typed in, priced the same way as the calculator's own mix — which stands beside
 * them as the market's yardstick. Cheapest first, by what each shekel borrowed costs.
 */

const TRACK_TYPES = Object.keys(TRACK_NAMES).filter((type) => type !== 'ELIGIBILITY') as TrackType[];
/** Each offer's cost, shown per this many shekels borrowed: offers for different amounts compare fairly. */
const PER = 100_000;

export function MortgageOffers({ goal, answers }: { goal: MortgageOffer['for']; answers: Answers }) {
  const removeOffer = useQuestionnaire((state) => state.removeOffer);
  const { priced, marketMix, ranked } = useRankedOffers(goal, answers);
  const best = ranked.find((offer) => offer.id !== 'market');
  const perShekel = (offer: PricedOffer) => (offer.cost / offer.amount) * PER;
  const top = Math.max(1, ...ranked.map(perShekel));
  return (
    <Panel title="ההצעות שקיבלתם מהבנקים">
      {priced.length === 0 ? (
        <p className="text-[15px] text-flow-muted">קיבלתם אישור עקרוני או הצעה? העלו אותם או הקלידו, ותראו אותם זו לצד זו, מול התמהיל של המחשבון.</p>
      ) : (
        <ul aria-label="ההצעות, מהזולה ליקרה" className="flex flex-col">
          {ranked.map((offer) => {
            const isMarket = offer.id === 'market';
            const versus = marketMix && !isMarket ? perShekel(offer) / perShekel(marketMix) - 1 : undefined;
            return (
              <li key={offer.id} className="flex flex-col gap-1.5 border-b border-flow-line py-3 last:border-b-0">
                <span className="flex items-center justify-between gap-2 text-[15px]">
                  <span className="font-extrabold">
                    {offer.label}
                    {offer === best && <span className="ms-2 rounded-full bg-flow-pick px-2 py-0.5 text-xs font-bold text-flow-strong">ההצעה הזולה</span>}
                    {isMarket && <span className="ms-2 rounded-full border border-flow-line px-2 py-0.5 text-xs font-bold">לפי השוק</span>}
                  </span>
                  {!isMarket && (
                    <button type="button" onClick={() => removeOffer(offer.id)} aria-label={`הסרת ההצעה של ${offer.label}`} className="min-h-9 px-2 text-sm font-bold text-flow-muted underline">
                      הסרה
                    </button>
                  )}
                </span>
                <span aria-hidden className="h-2 rounded-full bg-flow-pick">
                  <span className={`block h-full rounded-full ${isMarket ? 'bg-flow-muted/60' : 'bg-flow-strong'}`} style={{ width: `${(perShekel(offer) / top) * 100}%` }} />
                </span>
                <span className="text-sm tabular-nums">
                  {formatCurrency(offer.amount)} · {formatPercent(offer.rate)} · החזר {formatCurrency(offer.initialPayment)}
                  {offer.maxPayment > offer.initialPayment + 1 ? ` עד ${formatCurrency(offer.maxPayment)}` : ''}
                </span>
                <span className="text-sm text-flow-muted tabular-nums">
                  ריבית והצמדה {formatCurrency(offer.cost)} · {formatCurrency(perShekel(offer))} לכל 100,000 ₪
                  {versus !== undefined ? ` · ${versus > 0.005 ? `יקרה מהמחשבון ב-${Math.round(versus * 100)}%` : versus < -0.005 ? `זולה מהמחשבון ב-${Math.round(-versus * 100)}%` : 'כמו המחשבון'}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <AddOffer goal={goal} />
      <p className="text-xs leading-relaxed text-flow-muted">כל ההצעות מחושבות באותו אופן, במדד ובריבית של היום. המסמך נקרא במכשיר; נשמרים רק המסלולים והריביות.</p>
    </Panel>
  );
}

/** Reading an approval in principle, or typing an offer in: its bank and its tracks. */
function AddOffer({ goal }: { goal: MortgageOffer['for'] }) {
  const addOffer = useQuestionnaire((state) => state.addOffer);
  const [typing, setTyping] = useState(false);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState<string>();

  const read = async (file: File) => {
    setReading(true);
    setMessage(undefined);
    try {
      const id = await uploadApproval(file);
      let job = await fetchDocumentJob(id);
      for (let tries = 0; job.status !== 'COMPLETED' && job.status !== 'FAILED' && tries < 100; tries++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        job = await fetchDocumentJob(id);
      }
      const tracks = job.result?.tracks ?? [];
      if (job.status !== 'COMPLETED' || tracks.length === 0) {
        setMessage(job.error ?? 'לא מצאנו מסלולים במסמך. אפשר להקליד את ההצעה.');
        return;
      }
      const bank = BANK_SHEETS.find((sheet) => sheet.code === job.result?.bankCode)?.hebrewName ?? 'הצעה מהמסמך';
      addOffer({
        id: crypto.randomUUID(),
        for: goal,
        bank,
        tracks: tracks.map((track) => ({ type: track.track, amount: track.amount, annualRate: track.annualRate, termMonths: track.termMonths > 0 ? track.termMonths : 300 })),
      });
      setMessage(`נקראו ${tracks.length} מסלולים מ${bank}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'לא הצלחנו לקרוא את המסמך.');
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-full bg-flow-strong px-3 text-center text-[15px] font-extrabold text-flow-on-strong">
          {reading ? 'קורא…' : 'העלאת אישור עקרוני'}
          <input
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            className="sr-only"
            aria-label="בחירת אישור עקרוני"
            disabled={reading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) {
                void read(file);
              }
            }}
          />
        </label>
        <button type="button" onClick={() => setTyping((open) => !open)} aria-expanded={typing} className="min-h-12 rounded-full border-2 border-flow-ink px-3 text-[15px] font-extrabold">
          הקלדת הצעה
        </button>
      </div>
      {message && (
        <p role="status" className="text-sm font-bold">
          {message}
        </p>
      )}
      {typing && <OfferForm goal={goal} onDone={() => setTyping(false)} />}
    </div>
  );
}

function OfferForm({ goal, onDone }: { goal: MortgageOffer['for']; onDone: () => void }) {
  const addOffer = useQuestionnaire((state) => state.addOffer);
  const [bank, setBank] = useState(BANK_SHEETS[0]!.hebrewName);
  const [rows, setRows] = useState<{ type: TrackType; amount: string; rate: string; years: string }[]>([{ type: 'FIXED_UNLINKED', amount: '', rate: '', years: '25' }]);
  const number = (value: string) => Number(value.replace(/[^\d.]/g, ''));
  const tracks: OfferTrack[] = rows
    .map((row) => ({ type: row.type, amount: number(row.amount), annualRate: number(row.rate) / 100, termMonths: Math.round(number(row.years) * 12) }))
    .filter((track) => track.amount > 0 && track.annualRate > 0 && track.termMonths > 0);
  const set = (index: number, patch: Partial<(typeof rows)[number]>) => setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-flow-ground p-3">
      <label className="flex flex-col gap-1 text-sm font-bold">
        הבנק
        <select value={bank} onChange={(event) => setBank(event.target.value)} className="min-h-11 rounded-xl border border-flow-line bg-flow-card px-2 text-base">
          {[...BANK_SHEETS.map((sheet) => sheet.hebrewName), 'בנק אחר'].map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      {rows.map((row, index) => (
        <fieldset key={index} className="grid grid-cols-2 gap-2 border-t border-flow-line pt-2 first-of-type:border-t-0 first-of-type:pt-0">
          <legend className="sr-only">מסלול {index + 1}</legend>
          <label className="col-span-2 flex flex-col gap-1 text-xs font-bold">
            מסלול
            <select value={row.type} onChange={(event) => set(index, { type: event.target.value as TrackType })} className="min-h-11 rounded-xl border border-flow-line bg-flow-card px-2 text-base">
              {TRACK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TRACK_NAMES[type]}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ['amount', 'סכום ₪'],
              ['rate', 'ריבית %'],
              ['years', 'שנים'],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="flex flex-col gap-1 text-xs font-bold">
              {label}
              <input
                inputMode="decimal"
                value={row[field]}
                aria-label={`מסלול ${index + 1}: ${label}`}
                onChange={(event) => set(index, { [field]: event.target.value })}
                className="min-h-11 rounded-xl border border-flow-line bg-flow-card px-2 text-base tabular-nums"
              />
            </label>
          ))}
        </fieldset>
      ))}
      <button type="button" onClick={() => setRows((current) => [...current, { type: 'PRIME', amount: '', rate: '', years: '25' }])} className="min-h-10 self-start text-sm font-bold underline underline-offset-4">
        + עוד מסלול
      </button>
      <button
        type="button"
        disabled={tracks.length === 0}
        onClick={() => {
          addOffer({ id: crypto.randomUUID(), for: goal, bank, tracks });
          onDone();
        }}
        className="min-h-12 rounded-full bg-flow-ink px-4 text-base font-extrabold text-flow-ground disabled:opacity-40"
      >
        הוספת ההצעה
      </button>
    </div>
  );
}
