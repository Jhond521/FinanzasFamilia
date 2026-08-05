import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Rasteriza un PDF a PNG (poppler `pdftoppm`, 300dpi — resolución mínima con la que el spike de
 * ##59 midió lectura casi perfecta) y corre OCR por página (Tesseract, `spa+eng`, `--psm 6` para
 * texto en tabla). No es una función pura: hace I/O real (procesos + archivos temporales) — por
 * eso el parseo del texto resultante vive aparte en `nuPdfParsing.ts`, que sí es puro y testeable.
 *
 * Usa `execFile` (argumentos como array, nunca una cadena de shell) para no armar un comando desde
 * datos del archivo subido — el nombre del PDF nunca participa en la llamada, siempre se escribe a
 * una ruta fija que controlamos nosotros.
 */
export async function ocrPdfPages(pdfBuffer: Buffer): Promise<string[]> {
  const dir = await mkdtemp(path.join(tmpdir(), 'nu-pdf-'));
  try {
    const pdfPath = path.join(dir, 'statement.pdf');
    await writeFile(pdfPath, pdfBuffer);
    await execFileAsync('pdftoppm', ['-png', '-r', '300', pdfPath, path.join(dir, 'page')]);

    const pageFiles = (await readdir(dir))
      .filter((f) => f.startsWith('page') && f.endsWith('.png'))
      .sort();
    if (pageFiles.length === 0) {
      throw new Error('El PDF no produjo ninguna página al rasterizar');
    }

    const texts: string[] = [];
    for (const file of pageFiles) {
      const imagePath = path.join(dir, file);
      const outBase = path.join(dir, `ocr-${file}`);
      await execFileAsync('tesseract', [imagePath, outBase, '-l', 'spa+eng', '--psm', '6']);
      texts.push(await readFile(`${outBase}.txt`, 'utf-8'));
    }
    return texts;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
