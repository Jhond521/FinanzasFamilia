import { describe, expect, it } from 'vitest';
import { formatCOP, formatThousands, toIntegerDigits } from './money';

describe('formatCOP', () => {
  it('siempre muestra dos decimales', () => {
    expect(formatCOP('11439100')).toContain('11.439.100,00');
    expect(formatCOP('11439100')).toBe(formatCOP('11439100.00'));
  });
});

describe('toIntegerDigits', () => {
  it('descarta la parte decimal en vez de concatenarla', () => {
    expect(toIntegerDigits('11439100.00')).toBe('11439100');
  });

  it('maneja string vacio', () => {
    expect(toIntegerDigits('')).toBe('');
  });
});

describe('formatThousands', () => {
  it('agrupa con separador de miles es-CO', () => {
    expect(formatThousands('11439100')).toBe('11.439.100');
  });

  it('retorna vacio para digitos vacios', () => {
    expect(formatThousands('')).toBe('');
  });
});
