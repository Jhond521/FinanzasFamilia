import { describe, expect, it } from 'vitest';
import { formatAmountDisplay, formatCOP, sanitizeAmountInput } from './money';

describe('formatCOP', () => {
  it('siempre muestra dos decimales', () => {
    expect(formatCOP('11439100')).toContain('11.439.100,00');
    expect(formatCOP('11439100')).toBe(formatCOP('11439100.00'));
  });
});

describe('sanitizeAmountInput', () => {
  it('deja pasar digitos enteros tal cual', () => {
    expect(sanitizeAmountInput('11439100')).toBe('11439100');
  });

  it('maneja string vacio', () => {
    expect(sanitizeAmountInput('')).toBe('');
  });

  it('acepta coma como separador decimal', () => {
    expect(sanitizeAmountInput('11439100,5')).toBe('11439100.5');
  });

  it('acepta punto como separador decimal', () => {
    expect(sanitizeAmountInput('11439100.5')).toBe('11439100.5');
  });

  it('trunca a maximo 2 decimales', () => {
    expect(sanitizeAmountInput('100,999')).toBe('100.99');
  });

  it('filtra letras y otros caracteres no numericos', () => {
    expect(sanitizeAmountInput('$1a2b,5c')).toBe('12.5');
  });

  it('interpreta el ultimo separador pegado como decimal y descarta los de miles', () => {
    expect(sanitizeAmountInput('1.234.567,89')).toBe('1234567.89');
  });

  it('conserva el separador decimal recien escrito aunque no haya digitos despues', () => {
    expect(sanitizeAmountInput('1234,')).toBe('1234.');
  });
});

describe('formatAmountDisplay', () => {
  it('agrupa la parte entera con separador de miles es-CO', () => {
    expect(formatAmountDisplay('11439100')).toBe('11.439.100');
  });

  it('retorna vacio para string vacio', () => {
    expect(formatAmountDisplay('')).toBe('');
  });

  it('muestra los decimales tal cual se escribieron, sin forzar a 2 digitos', () => {
    expect(formatAmountDisplay('11439100.5')).toBe('11.439.100,5');
  });

  it('conserva la coma decimal final mientras el usuario sigue escribiendo', () => {
    expect(formatAmountDisplay('1234.')).toBe('1.234,');
  });
});
