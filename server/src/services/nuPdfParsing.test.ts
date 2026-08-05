import { describe, expect, it } from 'vitest';
import { parseNuPdfAmount, parseNuPdfText } from './nuPdfParsing';

// Texto real de OCR (Tesseract --psm 6, spa+eng, 300dpi) sobre el extracto Nu de ejemplo adjunto en
// ##58/##59 (`NuAgoSinProtec.pdf`) — capturado durante el spike, no inventado. Cada página del PDF
// es una tabla de transacciones; la página 1 es un resumen sin transacciones y la página 6 es
// texto legal/ayuda, ninguna de las dos debe producir filas.

const PAGE_1_SUMMARY = `
Fecha límite de pago Fecha de corte Periodo facturado
05 AGO 2026 16 JUL 2026 15 JUN - 15 JUL 2026
Resumen de tu extracto
Deuda a pagar este mes $5.008.854,35
`;

const PAGE_2 = `
Fecha Descripción Valor Cuotas Valor Interés del mes Total a pagar Restante
del mes Porcentaje y valor este mes por pagar
15 JUL 2026 Viajes Falabella $1.499.603,00 1de1 $1.499.603,00 2.10% $0,00 $1.499.603,00 $0,00
15 JUL2026 Avianca $462.800,00 1de1 $462.800,00 2.10% $0,00 $462.800,00 $0,00
Chapinero
15 JUL 2026 Latam Airlines $509.180,00 1de1 $509.180,00 2.10% $0,00 $509.180,00 $0,00
Colombi
13 JUL 2026 Amazon Prime $24.900,00 1de1 $24.900,00 2.10% $0,00 $24.900,00 $0,00
13 JUL2026 Kindle $20.129,76 1de1 $20.129,76 2.10% $0,00 $20.129,76 $0,00
Svces*Gd0m418q
> Comisión por cambio de moneda $90,58
12 JUL2026 Google *Play $16.900,00 1de1 $16.900,00 2.10% $0,00 $16.900,00 $0,00
Youtube*D
11 JUL 2026 Payu*Cinemark $30.900,00 1de1 $30.900,00 2.10% $0,00 $30.900,00 $0,00
10 JUL 2026 Gracias por tu $2.681.903,05 -$2.444.885,82
pago +A capital $2.671.597,50
+A intereses $6.202,95
+ A cargos y comisiones $4.102,60
09 JUL Uber Rides*DI $11.587,00 1de1 $11.587,00 2.10% $0,00 $11.587,00 $0,00
2026
09 JUL Uber Rides*DI $21.261,00 1de1 $21.261,00 2.10% $0,00 $21.261,00 $0,00
2026
Nu Financiera La tasa de interés de tu extracto está expresada Nuestra tasa de interés siempre será inferior a la de
Bogotá D.C. Colombia en Mes Vencido (M.V). La Efectiva Anual (E.A) la usura. Cuando te mostremos una flecha apuntando hacia
NIT 901.658.107-2 puedes ver en la app. abajo y es porque ajustamos la tasa a tu favor.
2/6
`;

const PAGE_3 = `
Fecha Descripción Valor Cuotas Valor Interés del mes Total a pagar Restante
del mes Porcentaje y valor este mes por pagar
08 JUL Anthropic* $67.013,60 1 de 24 $2.792,23 2.10% $0,00 $2.792,23 $64.221,37
2026 Claude Sub
> Comisión por cambio de moneda $301,56
07 JUL Temu Com $116.591,00 1de1 $116.591,00 2.10% $0,00 $116.591,00 $0,00
2026
07 JUL WI *Steam $92.800,00 1 de 24 $3.866,67 2.10% $0,00 $3.866,67 $88.933,33
2026 Purchase
06 JUL Temu Com $76.176,00 1de1 $76.176,00 2.10% $0,00 $76.176,00 $0,00
2026
05 JUL Kindle $16.755,52 1de 1 $16.755,52 2.10% $0,00 $16.755,52 $0,00
2026 Sves*8g1xy5m23
> Comisión por cambio de moneda $75,40
05 JUL Wizards Of $20.113,34 1de1 $20.113,34 2.10% $0,00 $20.113,34 $0,00
2026 Coast, Inc
~% Comisión por cambio de moneda $90,51
03 JUL Steamgames.Co $7.500,00 1de1 $7.500,00 2.10% $0,00 $7.500,00 $0,00
2026 m
02 JUL Agencia de $123.881,00 1de 1 $123.881,00 2.10% $0,00 $123.881,00 $0,00
2026 Seguros Fal
30 JUN Dollarcity $72.000,00 1de1 $72.000,00 2.10% $0,00 $72.000,00 $0,00
2026 Unicentro P
29 JUN Payu*Cinemark $69.700,00 1de1 $69.700,00 2.10% $0,00 $69.700,00 $0,00
2026
Nu Financiera La tasa de interés de tu extracto está expresada Nuestra tasa de interés siempre será inferior a la de
Bogotá D.C. Colombia en Mes Vencido (M.V). La Efectiva Anual (E.A) la usura. Cuando te mostremos una flecha apuntando hacia
NIT 901.658.107-2 puedes ver en la app. abajo y es porque ajustamos la tasa a tu favor.
3/6
`;

const PAGE_4 = `
Fecha Descripción Valor Cuotas Valor Interés del mes Total a pagar Restante
del mes Porcentaje y valor este mes por pagar
29 JUN Mercado $296.983,00 1de1 $296.983,00 2.10% $0,00 $296.983,00 $0,00
2026 Pago*Mercadoli
28 JUN Amazon.Com $323.147,00 1de1 $323.147,00 2.10% $0,00 $323.147,00 $0,00
2026
27 JUN Amazon.Com $511.106,00 1de 1 $511.106,00 2.10% $0,00 $511.106,00 $0,00
2026
27 JUN Amazon.Com $59.892,00 1de1 $59.892,00 2.10% $0,00 $59.892,00 $0,00
2026
26 JUN Cervalle $195.318,00 1de1 $195.318,00 2.10% $0,00 $195.318,00 $0,00
2026
26 JUN Mercado $51.000,00 1de1 $51.000,00 2.10% $0,00 $51.000,00 $0,00
2026 Pago*Mercadoli
26 JUN Mercado $9.990,00 1de1 $9.990,00 2.10% $0,00 $9.990,00 $0,00
2026 Pago*Melimas
25 JUN Carulla Villa $192.588,00 1de1 $192.588,00 2.10% $0,00 $192.588,00 $0,00
2026 Verde
24 JUN Rappi $48.600,00 1de1 $48.600,00 2.10% $0,00 $48.600,00 $0,00
2026 Colombia*DI
21 JUN Kindle $40.303,52 1de1 $40.303,52 2.10% $0,00 $40.303,52 $0,00
2026 Svcs*Nv23270b3
> Comisión por cambio de moneda $181,37
Nu Financiera La tasa de interés de tu extracto está expresada Nuestra tasa de interés siempre será inferior a la de
Bogotá D.C. Colombia en Mes Vencido (M.V). La Efectiva Anual (E.A) la usura. Cuando te mostremos una flecha apuntando hacia
NIT 901.658.107-2 puedes ver en la app. abajo y es porque ajustamos la tasa a tu favor.
4/6
`;

const PAGE_5 = `
Fecha Descripción Valor Cuotas Valor Interés del mes Total a pagar Restante
del mes Porcentaje y valor este mes por pagar
20 JUN Payu*Cinemark $32.500,00 1de1 $32.500,00 2.10% $0,00 $32.500,00 $0,00
2026
19 JUN Uber Rides $10.640,00 1de1 $10.640,00 2.10% $0,00 $10.640,00 $0,00
2026
16 JUN Temu Com $117.914,00 1de 1 $117.914,00 2.10% $0,00 $117.914,00 $0,00
2026
16 JUN WI *Steam $13.199,00 1de1 $13.199,00 2.10% $0,00 $13.199,00 $0,00
2026 Purchase
13 JUN Amazon Prime $24.900,00 1de1 $0,00 2.10% $401,09 $470,84 $0,00
2026
Intereses en 2.10% $69,75
mora
12 JUN Uber Rides $14.138,00 1de1 $0,00 2.10% $247,54 $287,15 $0,00
2026
Intereses en 2.10% $39,61
mora
11 JUN 2026 Uber Rides $11.658,00 1de1 $0,00 2.10% $204,12 $236,78 $0,00
Intereses en 2.10% $32,66
mora
11JUN 2026 Www.Nitrado.Net $22.342,52 1de 1 $0,00 2.10% $406,84 $469,43 $0,00
Intereses en 2.10% $62,59
mora
Pago mínimo
$2.565.967,54
Nu Financiera La tasa de interés de tu extracto está expresada Nuestra tasa de interés siempre será inferior a la de
Bogotá D.C. Colombia en Mes Vencido (M.V). La Efectiva Anual (E.A) la usura. Cuando te mostremos una flecha apuntando hacia
NIT 901.658.107-2 puedes ver en la app. abajo y es porque ajustamos la tasa a tu favor.
5/6
`;

const PAGE_6_LEGAL = `
¿Tienes preguntas sobre tu extracto?
Sobre tus compras internacionales
Mastercard® hace un cargo del 0.45% sobre el valor de tus compras internacionales que se cobra solo
Nu Financiera
Bogota D.C. Colombia
NIT 901.658.107-2
6/6
`;

describe('parseNuPdfAmount', () => {
  it('convierte formato colombiano (miles con punto, decimales con coma)', () => {
    expect(parseNuPdfAmount('$1.499.603,00')).toBe('1499603.00');
    expect(parseNuPdfAmount('$0,00')).toBe('0.00');
    expect(parseNuPdfAmount('$90,58')).toBe('90.58');
  });

  it('conserva el signo negativo', () => {
    expect(parseNuPdfAmount('-$2.444.885,82')).toBe('-2444885.82');
  });

  it('rechaza texto no numerico', () => {
    expect(() => parseNuPdfAmount('$abc')).toThrow();
  });
});

describe('parseNuPdfText', () => {
  it('no produce filas de una pagina de resumen sin tabla de transacciones', () => {
    expect(parseNuPdfText([PAGE_1_SUMMARY])).toEqual([]);
  });

  it('no produce filas de la pagina de texto legal/ayuda', () => {
    expect(parseNuPdfText([PAGE_6_LEGAL])).toEqual([]);
  });

  it('parsea una fila simple de una sola linea', () => {
    const rows = parseNuPdfText([PAGE_2]);
    const falabella = rows.find((r) => r.description.includes('Viajes Falabella'));
    expect(falabella).toEqual({ date: '2026-07-15', description: 'Viajes Falabella', amount: '1499603.00' });
  });

  it('une descripcion envuelta a una segunda linea cuando el año ya venia en la primera', () => {
    const rows = parseNuPdfText([PAGE_2]);
    const avianca = rows.find((r) => r.description.startsWith('Avianca'));
    expect(avianca?.description).toBe('Avianca Chapinero');
    expect(avianca?.date).toBe('2026-07-15');
  });

  it('une año envuelto + resto de la descripcion en una segunda linea combinada', () => {
    const rows = parseNuPdfText([PAGE_4]);
    const mercado = rows.find((r) => r.amount === '296983.00');
    expect(mercado?.description).toBe('Mercado Pago*Mercadoli');
    expect(mercado?.date).toBe('2026-06-29');
  });

  it('une descripcion en dos lineas sin texto extra en la linea del año', () => {
    const rows = parseNuPdfText([PAGE_4]);
    const carulla = rows.find((r) => r.amount === '192588.00');
    expect(carulla?.description).toBe('Carulla Villa Verde');
  });

  it('excluye por completo la fila "Gracias por tu pago" y su desglose', () => {
    const rows = parseNuPdfText([PAGE_2]);
    expect(rows.some((r) => /gracias/i.test(r.description))).toBe(false);
    // las filas antes y despues del pago se siguen leyendo bien (no se comieron por el skip)
    expect(rows.some((r) => r.description === 'Payu*Cinemark' && r.amount === '30900.00')).toBe(true);
    expect(rows.filter((r) => r.description === 'Uber Rides*DI')).toHaveLength(2);
  });

  it('usa "Total a pagar este mes" (no "Valor") para compras en cuotas', () => {
    const rows = parseNuPdfText([PAGE_3]);
    const anthropic = rows.find((r) => r.description.includes('Anthropic'));
    // Valor de la compra es $67.013,60 mensualizado a 24 cuotas; el cobro de este ciclo es $2.792,23
    expect(anthropic?.amount).toBe('2792.23');
    expect(anthropic?.description).toBe('Anthropic* Claude Sub');
  });

  it('marca como interes (no compra duplicada) las filas de mora de una compra ya facturada', () => {
    const rows = parseNuPdfText([PAGE_5]);
    const amazonInteres = rows.find((r) => r.description.startsWith('Amazon Prime'));
    expect(amazonInteres?.description).toBe('Amazon Prime (interés)');
    // 401,09 (interes del mes) + 69,75 (mora) = 470,84 (total a pagar este mes)
    expect(amazonInteres?.amount).toBe('470.84');
    expect(amazonInteres?.date).toBe('2026-06-13');
  });

  it('no genera filas separadas para las anotaciones de comision o mora', () => {
    const rows = parseNuPdfText([PAGE_5]);
    expect(rows.some((r) => /intereses en|mora$/i.test(r.description))).toBe(false);
    expect(rows).toHaveLength(8); // 4 compras + 4 filas de interes/mora de cuotas viejas
  });

  it('no genera filas separadas para las anotaciones de comision por cambio de moneda', () => {
    const rows = parseNuPdfText([PAGE_4]);
    expect(rows.some((r) => /comisi[oó]n/i.test(r.description))).toBe(false);
    const kindle = rows.find((r) => r.description.includes('Kindle'));
    expect(kindle?.description).toBe('Kindle Svcs*Nv23270b3');
    expect(kindle?.amount).toBe('40303.52'); // la comision ($181,37) es informativa, ya incluida
  });

  it('respeta el año inline cuando no hay espacio entre mes y año ("11JUN 2026")', () => {
    const rows = parseNuPdfText([PAGE_5]);
    const nitrado = rows.find((r) => r.description.includes('Nitrado'));
    expect(nitrado?.date).toBe('2026-06-11');
    expect(nitrado?.amount).toBe('469.43');
  });

  it('acepta multiples paginas y las procesa como un solo extracto continuo', () => {
    const rows = parseNuPdfText([PAGE_2, PAGE_3, PAGE_4, PAGE_5]);
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))).toBe(true);
    expect(rows.every((r) => /^-?\d+\.\d{2}$/.test(r.amount))).toBe(true);
  });
});
