import { Prisma, type Rule as PrismaRule } from '@prisma/client';

const { Decimal } = Prisma;
type DecimalInput = InstanceType<typeof Prisma.Decimal> | string | number;

export type RuleAmountSign = 'any' | 'positive' | 'negative';
export type RuleSetType = 'personal' | 'joint' | 'movement';

export type RuleCandidate = {
  id: string;
  pattern: string;
  amountSign: RuleAmountSign;
  /** Condiciones opcionales extra (##97): null = no se exige. */
  referencePattern: string | null;
  amount: DecimalInput | null;
  ownerUserId: string | null;
  setType: RuleSetType;
  setCategoryId: string | null;
  setDetail: string | null;
  mode: 'auto' | 'suggest';
};

/** Lo que el motor necesita de una transaccion para evaluarla. */
export type RuleTarget = {
  bankDescription: string;
  bankReference: string | null;
  amount: DecimalInput;
  ownerUserId: string;
};

export function toRuleCandidate(rule: PrismaRule): RuleCandidate {
  return {
    id: rule.id,
    pattern: rule.pattern,
    amountSign: rule.amountSign,
    referencePattern: rule.referencePattern,
    amount: rule.amount,
    ownerUserId: rule.ownerUserId,
    setType: rule.setType,
    setCategoryId: rule.setCategoryId,
    setDetail: rule.setDetail,
    mode: rule.mode,
  };
}

export type RuleEvaluation =
  | { outcome: 'none' }
  | { outcome: 'matched'; rule: RuleCandidate }
  | { outcome: 'conflict'; candidates: RuleCandidate[] };

/** Quita acentos y pasa a mayusculas, para un match case/acentos-insensitive (RF5). */
function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

function amountSignMatches(sign: RuleAmountSign, amount: DecimalInput): boolean {
  if (sign === 'any') return true;
  const isPositive = new Decimal(amount).greaterThanOrEqualTo(0);
  return sign === 'positive' ? isPositive : !isPositive;
}

function ruleMatches(rule: RuleCandidate, target: RuleTarget): boolean {
  if (!normalizeForMatch(target.bankDescription).includes(normalizeForMatch(rule.pattern))) return false;
  if (!amountSignMatches(rule.amountSign, target.amount)) return false;
  if (rule.referencePattern !== null) {
    if (target.bankReference === null) return false;
    if (!normalizeForMatch(target.bankReference).includes(normalizeForMatch(rule.referencePattern))) return false;
  }
  // Monto exacto en valor absoluto — mismo criterio que el match de registros rapidos (RF5).
  if (rule.amount !== null && !new Decimal(target.amount).abs().equals(new Decimal(rule.amount).abs())) return false;
  if (rule.ownerUserId !== null && rule.ownerUserId !== target.ownerUserId) return false;
  return true;
}

/** Cuantas condiciones exige la regla: la descripcion siempre, +1 por referencia/monto/dueño. */
export function ruleSpecificity(rule: RuleCandidate): number {
  return 1 + [rule.referencePattern, rule.amount, rule.ownerUserId].filter((c) => c !== null).length;
}

/**
 * Evalua TODAS las reglas activas contra una transaccion (RF5) — no se detiene en la primera, para
 * poder detectar cuando mas de una calza a la vez. Entre las que calzan gana la mas especifica (la
 * que exige mas condiciones, ##97 — ej. "NEQUI + ref + monto" le gana a "NEQUI" a secas). Si varias
 * empatan en esa especificidad maxima (aunque todas sean `mode='auto'`), no se auto-asigna ninguna:
 * se reporta como `conflict` para que la transaccion quede a revision con esas opciones como
 * sugerencias (decision confirmada del ticket #2 — RF5 no cubre este caso).
 */
export function evaluateRules(target: RuleTarget, rules: RuleCandidate[]): RuleEvaluation {
  const matches = rules.filter((rule) => ruleMatches(rule, target));
  if (matches.length === 0) return { outcome: 'none' };

  const maxSpecificity = Math.max(...matches.map(ruleSpecificity));
  const top = matches.filter((rule) => ruleSpecificity(rule) === maxSpecificity);
  if (top.length === 1) return { outcome: 'matched', rule: top[0] };
  return { outcome: 'conflict', candidates: top };
}
