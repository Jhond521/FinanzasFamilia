import { describe, expect, it } from 'vitest';
import { bucketPercentUsed, bucketStatus, formatAmountDisplay, formatCOP, sanitizeAmountInput } from './money';

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

  it('no confunde el punto de miles ya formateado con un decimal al seguir escribiendo (regresion)', () => {
    // El input llega con "1.2345": el punto de miles de un render anterior ("1.234") mas el
    // digito nuevo. Debe seguir leyendose como el entero 12345, no como "1,23" + resto perdido.
    expect(sanitizeAmountInput('1.2345')).toBe('12345');
  });

  it('sigue agrupando de miles en el cruce del segundo separador (7 digitos)', () => {
    expect(sanitizeAmountInput('123.4567')).toBe('1234567');
  });

  it('no reinterpreta un numero ya agrupado con dos puntos de miles', () => {
    expect(sanitizeAmountInput('11.000.000')).toBe('11000000');
  });

  it('trunca (no reinterpreta como miles) un tercer decimal escrito tras la coma', () => {
    expect(sanitizeAmountInput('11000000,501')).toBe('11000000.50');
  });

  it('sin allowNegative, descarta el "-" inicial (comportamiento por defecto sin cambios)', () => {
    expect(sanitizeAmountInput('-32000')).toBe('32000');
  });

  it('con allowNegative, conserva el "-" inicial', () => {
    expect(sanitizeAmountInput('-32000', true)).toBe('-32000');
  });

  it('con allowNegative, conserva el "-" solo mientras el usuario sigue escribiendo (sin digitos aun)', () => {
    expect(sanitizeAmountInput('-', true)).toBe('-');
  });

  it('con allowNegative, tambien acepta decimales negativos', () => {
    expect(sanitizeAmountInput('-32000,50', true)).toBe('-32000.50');
  });

  it('con allowNegative, un "-" no inicial (embebido) no cuenta como signo', () => {
    expect(sanitizeAmountInput('32-000', true)).toBe('32000');
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

  it('agrupa la parte entera preservando el signo negativo', () => {
    expect(formatAmountDisplay('-32000')).toBe('-32.000');
  });

  it('muestra un "-" solo mientras el usuario sigue escribiendo el numero', () => {
    expect(formatAmountDisplay('-')).toBe('-');
  });
});

describe('bucketStatus', () => {
  it('verde cuando el gasto esta por debajo del 80% del presupuesto', () => {
    expect(bucketStatus('1000000', '0')).toBe('ok');
    expect(bucketStatus('1000000', '799999')).toBe('ok');
  });

  it('amarillo cuando el gasto llega al 80% del presupuesto', () => {
    expect(bucketStatus('1000000', '800000')).toBe('warning');
  });

  it('amarillo justo hasta el 100% (no rojo aun)', () => {
    expect(bucketStatus('1000000', '1000000')).toBe('warning');
  });

  it('rojo cuando el gasto supera el presupuesto', () => {
    expect(bucketStatus('1000000', '1000000.01')).toBe('danger');
  });

  it('presupuesto en cero o negativo siempre da verde', () => {
    expect(bucketStatus('0', '0')).toBe('ok');
    expect(bucketStatus('-500', '100')).toBe('ok');
  });
});

describe('bucketPercentUsed', () => {
  it('calcula el porcentaje gastado', () => {
    expect(bucketPercentUsed('1000000', '250000')).toBe(25);
  });

  it('acota a 100 cuando el gasto supera el presupuesto', () => {
    expect(bucketPercentUsed('1000000', '1500000')).toBe(100);
  });

  it('da 0 cuando el presupuesto es cero o negativo', () => {
    expect(bucketPercentUsed('0', '500')).toBe(0);
    expect(bucketPercentUsed('-100', '500')).toBe(0);
  });
});
