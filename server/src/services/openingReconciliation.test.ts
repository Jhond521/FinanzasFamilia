import { describe, expect, it } from 'vitest';
import {
  accountBalanceMatches,
  expectedLeaveInAccount,
  expensesToDate,
  leaveInAccountAtOpening,
  moveToSavingsFromBalance,
  savingsShortfallAtOpening,
  type ExpenseEntry,
} from './openingReconciliation';

const personal = (amount: string): ExpenseEntry => ({ amount, type: 'personal' });
const joint = (amount: string): ExpenseEntry => ({ amount, type: 'joint' });
const movement = (amount: string): ExpenseEntry => ({ amount, type: 'movement' });
const unclassified = (amount: string): ExpenseEntry => ({ amount, type: 'unclassified' });

describe('expensesToDate', () => {
  it('suma personal y joint como gasto positivo (montos negativos, como el extracto)', () => {
    expect(expensesToDate([personal('-50000'), joint('-132900')]).toString()).toBe('182900');
  });

  it('incluye unclassified -- no exige pasar por Revisar (ticket #31)', () => {
    expect(expensesToDate([personal('-50000'), unclassified('-30000')]).toString()).toBe('80000');
  });

  it('ignora movement, sea cual sea el resto', () => {
    expect(expensesToDate([personal('-50000'), movement('-999999'), unclassified('-1')]).toString()).toBe('50001');
  });

  it('un abono positivo (ej. intereses) resta del gastado', () => {
    expect(expensesToDate([personal('-100'), personal('30')]).toString()).toBe('70');
  });

  it('arreglo vacio da cero', () => {
    expect(expensesToDate([]).toString()).toBe('0');
  });
});

describe('leaveInAccountAtOpening', () => {
  it('suma Gastos del Mes + Dinero Personal y resta lo ya gastado', () => {
    expect(leaveInAccountAtOpening('5490768', '1534787.92', '200000').toString()).toBe('6825555.92');
  });

  it('sin gasto a la fecha, es igual a leaveInAccount de summary.ts', () => {
    expect(leaveInAccountAtOpening('5490768', '1534787.92', '0').toString()).toBe('7025555.92');
  });
});

describe('moveToSavingsFromBalance', () => {
  it('es el saldo actual menos lo que debe quedar', () => {
    expect(moveToSavingsFromBalance('8105073.25', '3546664.38').toString()).toBe('4558408.87');
  });

  it('nunca da negativo -- si el saldo no alcanza, da cero', () => {
    expect(moveToSavingsFromBalance('1000000', '3546664.38').toString()).toBe('0');
  });

  it('saldo exacto a lo que debe quedar da cero para mover', () => {
    expect(moveToSavingsFromBalance('3546664.38', '3546664.38').toString()).toBe('0');
  });
});

describe('expectedLeaveInAccount / savingsShortfallAtOpening (ticket ##103)', () => {
  it('si dejar en cuenta es positivo, se espera ese valor y no hay faltante', () => {
    expect(expectedLeaveInAccount('3546664.38').toString()).toBe('3546664.38');
    expect(savingsShortfallAtOpening('3546664.38').toString()).toBe('0');
  });

  it('si dejar en cuenta es negativo, se espera 0 y el faltante es lo que se paso', () => {
    expect(expectedLeaveInAccount('-500000.50').toString()).toBe('0');
    expect(savingsShortfallAtOpening('-500000.50').toString()).toBe('500000.5');
  });

  it('cuadre al final del mes: todo el saldo a Nu, cuenta en 0 y el faltante completa lo que deberia moverse', () => {
    const spent = '7500000';
    const leaveInAccount = leaveInAccountAtOpening('5490768', '1534787.92', spent);
    const accountBalance = '1200000';
    const expected = expectedLeaveInAccount(leaveInAccount);
    const shortfall = savingsShortfallAtOpening(leaveInAccount);
    const moveToSavings = moveToSavingsFromBalance(accountBalance, expected);

    expect(leaveInAccount.toString()).toBe('-474444.08');
    expect(expected.toString()).toBe('0');
    expect(moveToSavings.toString()).toBe(accountBalance);
    expect(accountBalanceMatches('0', expected)).toBe(true);
    // lo que deberia moverse a Nu (saldo - dejar en cuenta calculado) - saldo actual
    expect(shortfall.toString()).toBe(moveToSavingsFromBalance(accountBalance, leaveInAccount).minus(accountBalance).toString());
  });
});

describe('accountBalanceMatches', () => {
  it('true cuando el saldo confirmado calza exacto', () => {
    expect(accountBalanceMatches('6825555.92', '6825555.92')).toBe(true);
  });

  it('false cuando hay diferencia, aunque sea de centavos', () => {
    expect(accountBalanceMatches('6825555.91', '6825555.92')).toBe(false);
  });
});

describe('regresion -- caso real de John, Agosto 2026 (ticket #31)', () => {
  // 9 transacciones reales: 2 personales, 4 conjuntas, 3 sin clasificar (incluye un abono de
  // intereses de 11.46). Aporte a Gastos del Mes 5.490.768,00, a Dinero Personal 1.534.787,92.
  const entries: ExpenseEntry[] = [
    joint('-122918'),
    joint('-132900'),
    unclassified('-2714009'),
    unclassified('-68200'),
    unclassified('-13000'),
    personal('11.46'),
    joint('-252876'),
    joint('-80000'),
    personal('-95000'),
  ];

  it('gastos a la fecha da 3.478.891,54 sin exigir clasificacion', () => {
    expect(expensesToDate(entries).toString()).toBe('3478891.54');
  });

  it('el cuadre da exacto al saldo real, sin importar remanentes ni el gap de Dinero Personal', () => {
    const spent = expensesToDate(entries);
    const leaveInAccount = leaveInAccountAtOpening('5490768', '1534787.92', spent);
    const accountBalance = '8105073.25';
    const moveToSavings = moveToSavingsFromBalance(accountBalance, leaveInAccount);

    expect(leaveInAccount.toString()).toBe('3546664.38');
    expect(moveToSavings.toString()).toBe('4558408.87');
    expect(leaveInAccount.plus(moveToSavings).toString()).toBe(accountBalance);
  });
});
