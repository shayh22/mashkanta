/**
 * Traffic-light risk indicators for the household's position against the property.
 *
 * Thresholds follow Directive 329 where it sets one (LTV 50%/70% for a loan not used to buy,
 * PTI 40%/50%, ⅔ variable) and common lender practice where it does not (CPI exposure).
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskIndicator {
  readonly key: 'LTV' | 'PTI' | 'PRIME' | 'CPI';
  readonly label: string;
  readonly value: number;
  /** The dial runs from 0 to this value. */
  readonly scaleMax: number;
  /** Above `warn` is amber, above `danger` is red. */
  readonly warn: number;
  readonly danger: number;
  readonly level: RiskLevel;
  readonly explanation: string;
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: 'יציב',
  MEDIUM: 'לתשומת לב',
  HIGH: 'סיכון גבוה',
};

export function levelOf(value: number, warn: number, danger: number): RiskLevel {
  if (value > danger + 1e-9) {
    return 'HIGH';
  }
  return value > warn + 1e-9 ? 'MEDIUM' : 'LOW';
}

function indicator(
  key: RiskIndicator['key'],
  label: string,
  value: number,
  warn: number,
  danger: number,
  scaleMax: number,
  explain: (level: RiskLevel) => string,
): RiskIndicator {
  const safe = Number.isFinite(value) ? Math.max(0, value) : scaleMax;
  const level = levelOf(safe, warn, danger);
  return { key, label, value: safe, scaleMax, warn, danger, level, explanation: explain(level) };
}

export function ltvRisk(ltv: number): RiskIndicator {
  return indicator('LTV', 'שיעור מימון', ltv, 0.5, 0.7, 1, (level) =>
    level === 'LOW'
      ? 'עד 50% — הון עצמי גבוה בנכס.'
      : level === 'MEDIUM'
        ? 'בין 50% ל-70% — בתוך ההקלה לאשראי שאינו לרכישה, בכפוף לתקרת 200,000 ₪.'
        : 'מעל 70% — מעבר לתקרה לאשראי נוסף כנגד הנכס.',
  );
}

export function ptiRisk(pti: number): RiskIndicator {
  return indicator('PTI', 'החזר מהכנסה', pti, 0.4, 0.5, 0.7, (level) =>
    level === 'LOW'
      ? 'עד 40% — בתוך מדיניות האשראי המקובלת.'
      : level === 'MEDIUM'
        ? 'בין 40% ל-50% — מותר רגולטורית, אך הבנק מקצה הון נוסף ועשוי לסרב.'
        : 'מעל 50% — אסור לפי הוראה 329.',
  );
}

export function primeRisk(variableShare: number): RiskIndicator {
  return indicator('PRIME', 'חשיפה לפריים ולמשתנה', variableShare, 1 / 3, 2 / 3, 1, (level) =>
    level === 'LOW'
      ? 'עד שליש — עליית ריבית תשפיע מעט על ההחזר.'
      : level === 'MEDIUM'
        ? 'בין שליש לשני שלישים — עליית ריבית של 2% תורגש בהחזר.'
        : 'מעל שני שלישים — חריגה מתקרת ⅔ על האשראי בנכס.',
  );
}

export function cpiRisk(linkedShare: number): RiskIndicator {
  return indicator('CPI', 'חשיפה למדד', linkedShare, 0.33, 0.5, 1, (level) =>
    level === 'LOW'
      ? 'עד שליש צמוד — אינפלציה מפתיעה תשפיע מעט.'
      : level === 'MEDIUM'
        ? 'שליש עד חצי צמוד — הקרן עלולה לגדול בשנים הראשונות.'
        : 'מעל חצי צמוד — אינפלציה גבוהה תגדיל קרן והחזר משמעותית.',
  );
}

/** The household's overall stability is only as good as its weakest indicator. */
export function overallRisk(indicators: readonly RiskIndicator[]): RiskLevel {
  if (indicators.some((item) => item.level === 'HIGH')) {
    return 'HIGH';
  }
  return indicators.some((item) => item.level === 'MEDIUM') ? 'MEDIUM' : 'LOW';
}
