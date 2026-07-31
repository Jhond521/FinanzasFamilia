import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type DecimalInput = InstanceType<typeof Prisma.Decimal> | string | number;

export type RuleAmountSign = 'any' | 'positive' | 'negative';
export type RuleSetType = 'personal' | 'joint' | 'movement';

export type RuleCandidate = {
  id: string;
  pattern: string;
  amountSign: RuleAmountSign;
  setType: RuleSetType;
  setCategoryId: string | null;
  setDetail: string | null;
  mode: 'auto' | 'suggest';
};

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

/**
 * Evalua TODAS las reglas activas contra una descripcion bancaria (RF5) — no se detiene en la
 * primera, para poder detectar cuando mas de una calza a la vez. Si hay una sola coincidencia, se
 * aplica; si hay dos o mas (aunque todas sean `mode='auto'`), no se auto-asigna ninguna: se
 * reporta como `conflict` para que la transaccion quede a revision con las opciones en conflicto
 * como sugerencias (decision confirmada del ticket #2 — RF5 no cubre este caso).
 */
export function evaluateRules(bankDescription: string, amount: DecimalInput, rules: RuleCandidate[]): RuleEvaluation {
  const normalizedDescription = normalizeForMatch(bankDescription);
  const matches = rules.filter(
    (rule) => normalizedDescription.includes(normalizeForMatch(rule.pattern)) && amountSignMatches(rule.amountSign, amount),
  );

  if (matches.length === 0) return { outcome: 'none' };
  if (matches.length === 1) return { outcome: 'matched', rule: matches[0] };
  return { outcome: 'conflict', candidates: matches };
}
