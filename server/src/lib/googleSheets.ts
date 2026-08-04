import { google } from 'googleapis';
import { findLabelRowIndex, type SheetTransactionRow } from '../services/sheetExportMapping';

/** Tab plantilla real del Sheet (ticket ##51) -- confirmado por John, no "Template". */
const TEMPLATE_TAB_NAME = 'Plantilla 26';

/** Columna donde viven los labels que ubicamos por texto ("Ingreso Mes John...", "Fecha"). */
const LABEL_COLUMN = 'B';
const LABEL_COLUMN_RANGE = `${LABEL_COLUMN}1:${LABEL_COLUMN}60`;

/** Primera y ultima columna de la tabla de transacciones: Fecha..Quien (ver mapTransactionToSheetRow). */
const TRANSACTION_FIRST_COLUMN = 'B';
const TRANSACTION_LAST_COLUMN = 'I';

export class GoogleSheetsNotConfiguredError extends Error {
  constructor() {
    super('Google Sheets no esta configurado (faltan variables de entorno GOOGLE_SHEETS_*)');
    this.name = 'GoogleSheetsNotConfiguredError';
  }
}

export class SheetLabelNotFoundError extends Error {
  constructor(label: string, tabName: string) {
    super(`No se encontro la celda "${label}" en el tab "${tabName}" del Sheet`);
    this.name = 'SheetLabelNotFoundError';
  }
}

function readConfig() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!spreadsheetId || !clientEmail || !privateKey) {
    throw new GoogleSheetsNotConfiguredError();
  }
  // Railway/`.env` guardan el private key con "\n" literales -- hay que convertirlos a saltos reales.
  return { spreadsheetId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') };
}

function getSheetsClient() {
  const { clientEmail, privateKey } = readConfig();
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/** Nombre del tab a generar: prefijo de ambiente + "Auto-[Mes]-[Año]" (ticket ##51). */
export function buildAutoTabName(monthLabel: string): string {
  const prefix = process.env.GOOGLE_SHEETS_TAB_PREFIX ?? '';
  return `${prefix}Auto-${monthLabel}`;
}

async function listSheetTabs(): Promise<{ sheetId: number; title: string }[]> {
  const { spreadsheetId } = readConfig();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  return (res.data.sheets ?? []).map((s) => ({ sheetId: s.properties!.sheetId!, title: s.properties!.title! }));
}

export async function tabExists(tabName: string): Promise<boolean> {
  const tabs = await listSheetTabs();
  return tabs.some((t) => t.title === tabName);
}

/** Duplica el tab "Plantilla 26" con el nombre del mes (ticket ##51, solo si el tab destino no existe). */
export async function duplicateTemplateTab(newTabName: string): Promise<void> {
  const { spreadsheetId } = readConfig();
  const sheets = getSheetsClient();
  const tabs = await listSheetTabs();
  const template = tabs.find((t) => t.title === TEMPLATE_TAB_NAME);
  if (!template) throw new Error(`No se encontro el tab plantilla "${TEMPLATE_TAB_NAME}" en el Sheet`);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ duplicateSheet: { sourceSheetId: template.sheetId, newSheetName: newTabName } }],
    },
  });
}

async function readLabelColumn(tabName: string): Promise<unknown[]> {
  const { spreadsheetId } = readConfig();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tabName}'!${LABEL_COLUMN_RANGE}` });
  return (res.data.values ?? []).map((row) => row[0]);
}

/** Escribe los montos de inicio (Ingreso Mes John/Lina) y marca el checkbox Confirmado de cada uno.
 * Solo se llama al crear el tab por primera vez (ticket ##51: si el tab ya existe, no se tocan). */
export async function writeStartingIncomes(
  tabName: string,
  incomes: { johnAmount: number; linaAmount: number },
): Promise<void> {
  const { spreadsheetId } = readConfig();
  const sheets = getSheetsClient();
  const column = await readLabelColumn(tabName);

  const johnRow = findLabelRowIndex(column, 'Ingreso Mes John');
  if (johnRow === null) throw new SheetLabelNotFoundError('Ingreso Mes John', tabName);
  const linaRow = findLabelRowIndex(column, 'Ingreso Mes Lina');
  if (linaRow === null) throw new SheetLabelNotFoundError('Ingreso Mes Lina', tabName);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `'${tabName}'!C${johnRow + 1}:D${johnRow + 1}`, values: [[incomes.johnAmount, true]] },
        { range: `'${tabName}'!C${linaRow + 1}:D${linaRow + 1}`, values: [[incomes.linaAmount, true]] },
      ],
    },
  });
}

/** Agrega filas de transacciones al final de la tabla existente del tab (ticket ##51). Ubica el
 * header "Fecha" dinamicamente -- no asume un numero de fila fijo, porque no esta 100% confirmado. */
export async function appendTransactionRows(tabName: string, rows: SheetTransactionRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { spreadsheetId } = readConfig();
  const sheets = getSheetsClient();
  const column = await readLabelColumn(tabName);

  const headerRow = findLabelRowIndex(column, 'Fecha');
  if (headerRow === null) throw new SheetLabelNotFoundError('Fecha', tabName);

  // Rango desde el header en adelante: la API de append detecta la ultima fila con datos DENTRO de
  // este rango y agrega las nuevas justo despues -- por eso hay que arrancar en el header, si no
  // confundiria con datos de otras secciones del tab que estan en las mismas columnas mas arriba.
  const range = `'${tabName}'!${TRANSACTION_FIRST_COLUMN}${headerRow + 1}:${TRANSACTION_LAST_COLUMN}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}
