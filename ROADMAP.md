# ROADMAP — מיחזור משכנתא, איחוד הלוואות ו-UI פינטק

המקורות הרגולטוריים והנוסחאות מפורטים ב-[docs/MARKET_AND_REGULATION_RESEARCH.md](docs/MARKET_AND_REGULATION_RESEARCH.md).
כל אבן דרך נבנית בענף `feat/<slug>`, ממוזגת ב-`--no-ff` לענף האינטגרציה רק אחרי שעברה את שער האיכות:

```bash
cd frontend && npm test && npm run typecheck && npm run lint && npm run build
```

הכלל הארכיטקטוני: **כל החישוב במנוע הטהור** (`src/engine/*`, ללא DOM), state ב-Zustand, רכיבים מציגים בלבד.
לכן כל נוסחה נבדקת ביחידה בלי דפדפן.

---

## M0 — `feat/lint-tooling`: שער איכות עובד

`npm run lint` קיים ב-package.json אך אין ל-ESLint קונפיגורציה, ולכן השער לא יכול לעבור.

- קבצים: `frontend/eslint.config.js`, `frontend/package.json` (eslint, typescript-eslint, react-hooks).
- קריטריון: `npm run lint` מסתיים ב-0 שגיאות על הקוד הקיים.

## M1 — `feat/refinance-engine`: מנוע וסימולטור מיחזור

**קבצים:** `src/engine/prepayment.ts`, `src/engine/refinance.ts` (+ `.test.ts` לכל אחד),
`src/store/refinanceStore.ts`, `src/pages/RefinancePage.tsx`, `src/components/refinance/*`, `src/App.tsx`.

**מודל נתונים:**

```ts
ExistingTrack { id, type: TrackType, balance, annualRate, remainingMonths,
                monthsElapsed, originationAverageRate?, monthsToReset?, additionalToDirected? }
RefinanceRoute { kind: 'INTERNAL' | 'EXTERNAL', rateDelta, costs: { fileOpening, appraisal, registration, legal } }
```

**נוסחאות:**

- עמלת היוון למסלול: $r_{ref} = \min(r_{loan}, r_{orig})$. אם $r_{avg} < r_{ref}$:
  $\text{Fee}_{cap} = PV(\text{CF}, r_{avg}) - PV(\text{CF}, r_{ref})$, כש-CF הוא התשלומים העתידיים
  (במשתנה — עד מועד שינוי הריבית, ויתרת הקרן אז היא התשלום האחרון). לאחר מכן הנחת ותק לפי טבלת הצו.
- אי-הודעה: $0.1\% \cdot B$ אם לא ניתנה הודעה. מדד ממוצע (צמוד, יום 1–15): $\tfrac12 \cdot \tfrac{\pi}{12}\cdot B$.
  תפעולית 60 ₪ פעם אחת. פער לטובת הלווה מקזז את יתר העמלות עד אפס.
- חיסכון מצטבר: $S_m = \sum_{k\le m}(P^{old}_k - P^{new}_k) - C_0$; נקודת איזון — ה-$m$ הראשון עם $S_m \ge 0$.
- $NPV = \sum_m \frac{P^{old}_m - P^{new}_m}{(1+d)^m} - C_0$.
- פסיקה: **מיידי** — $NPV>0$ ונקודת איזון ≤ 12 חודשים; **לטווח ארוך** — $NPV>0$ ונקודת איזון בתוך התקופה;
  אחרת **לא משתלם**.

**קריטריונים:** אפס עמלת היוון בפריים ובזכאות; עמלה חיובית בקבועה כשהריבית ירדה ואפס כשעלתה;
הנחת הוותק לפי הטבלה בכל מדרגה; נקודת איזון נכונה בתרחיש ידוע; מסלול חיצוני נושא את עלויות המעבר.

## M2 — `feat/debt-consolidation`: איחוד הלוואות וכושר החזר (תיקון 1.10.2026)

**קבצים:** `src/engine/consolidation.ts` (+ test), `src/store/consolidationStore.ts`,
`src/pages/ConsolidationPage.tsx`, `src/components/consolidation/*`.

**מודל נתונים:**

```ts
ConsumerDebt { id, kind: 'CAR'|'CREDIT_CARD'|'NON_BANK'|'OVERDRAFT'|'BALLOON'|'OTHER',
               label, balance, annualRate, monthlyPayment, remainingMonths, include }
PropertyPosition { value, mortgageBalance, mortgagePayment, mortgageRemainingMonths,
                   mortgageVariableBalance, priorAllPurposeBalance }
```

**נוסחאות:** $F=\sum$ החזרי חובות שאינם באיחוד ויתרתם > 18 ח'; $E$ = החזר המשכנתא אם יתרתה > 18 ח';
$\text{PTI}=\frac{P_{new}+E}{N-F}$; $P^{max}_{new}=c(N-F)-E$ (לעומת הישן $c(N-F-E)$);
LTV מצטבר — עד 50%, או עד 70% כשהחלק מעל 50% ≤ 200,000 ₪; $Var^{max}_{new}=\tfrac23(B+L)-Var_{existing}$;
פטור PTI ו-⅔ כשהלוואות לכל מטרה במצטבר ≤ 120,000 ₪.
קיצור חכם: מפנים שיעור $s$ מהחיסכון החודשי להחזר, $n$ נפתר מ-$PMT(L,r,n)=P_{new}+sR$; $s^*$ המינימלי
שבו העלות הכוללת לא עולה על עלות החובות המקוריים — בחיתוך בינארי.

**קריטריונים:** דוגמת המקור משוחזרת (5,650 → 2,650); דוגמת ⅔ (80,000 משתנה מתוך 300,000);
גבולות 50%/70%/200K בשני הכיוונים; סף 120K בשני הכיוונים; חוב < 18 ח' לא נספר ב-F ומסומן.

## M3 — `feat/ui-ux-overhaul`: UI פינטק פרימיום RTL

**קבצים:** `tailwind.config.js` (טוקנים כמשתני CSS + `darkMode: 'class'`), `src/index.css`,
`src/components/ui.tsx`, `src/components/charts/*` (Waterfall, BreakevenCurve, RiskGauge),
`src/engine/risk.ts` (+ test), `src/App.tsx` (ניווט 3 מצבים + מתג כהה/בהיר), כל הרכיבים הקיימים.

**קריטריונים:** כל הרכיבים קריאים בכהה ובבהיר; ניווט מקלדת ו-ARIA לטאבים; אין גלילה אופקית ב-360px;
אפס שגיאות קונסול בבדיקת Playwright על שלושת המצבים בדסקטופ ובמובייל.

## M4 — `feat/smart-report-and-alerts`: תוכנית פעולה וייצוא

**קבצים:** `src/engine/actionPlan.ts` (+ test), `src/components/ActionPlanReport.tsx`, שילוב בשני הדפים.

**לוגיקה:** מרווחי יעד מהאחוזון ה-10 בטבלת הבסיס; אילו הלוואות לסגור/להשאיר; איך לעמוד ב-PTI
(פיצול ≤ 120K, הארכת תקופה, סגירת חובות שנספרים ב-F); תזמון פירעון (16 לחודש, הודעה 10–45 יום,
ספי ותק קרובים). ייצוא: הדפסה/PDF ב-RTL ושיתוף טקסט.

**קריטריונים:** בדיקות אינטגרציה מקצה לקצה: קלט → ניתוח → תוכנית עם הפריטים הצפויים.

## M5 — QA ותיעוד

כל השער על ענף האינטגרציה, עדכון `README.md` ו-`SPECIFICATION.md`, השארת התזמון המחזורי פעיל.
