import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { LinhaTexto } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/**
 * A fatura Itaú usa layout de duas colunas por página. O pdf.js entrega os
 * itens de texto na ordem do fluxo de desenho do PDF, que NÃO é a ordem visual
 * (títulos de seção e totais são desenhados depois das linhas da tabela).
 * Por isso reconstruímos a ordem visual usando as coordenadas (x,y) de cada
 * item: agrupamos por linha (mesmo y, com tolerância) e por coluna da página
 * (esquerda/direita, usando um x de corte calibrado no meio da página), e só
 * então ordenamos por y (topo -> base) e x (esquerda -> direita).
 */
const TOLERANCIA_Y = 2;
const GAP_MINIMO_ESPACO = 1.5;

interface ItemPosicionado {
  texto: string;
  x: number;
  y: number;
  largura: number;
}

export async function extrairLinhasDoPDF(dados: ArrayBuffer): Promise<LinhaTexto[]> {
  const pdf = await pdfjsLib.getDocument({ data: dados }).promise;
  const linhas: LinhaTexto[] = [];

  for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
    const pagina = await pdf.getPage(numPagina);
    const viewport = pagina.getViewport({ scale: 1 });
    const conteudo = await pagina.getTextContent();

    const itens: ItemPosicionado[] = [];
    for (const item of conteudo.items) {
      if (!('str' in item) || item.str.trim().length === 0) continue;
      itens.push({
        texto: item.str,
        x: item.transform[4],
        y: item.transform[5],
        largura: item.width ?? 0,
      });
    }

    // Corte calibrado no layout padrão da fatura Itaú (~60% da largura da
    // página); páginas de uma coluna só ficam com o grupo "esquerda".
    const xCorte = viewport.width * 0.6;

    for (const coluna of ['esquerda', 'direita'] as const) {
      const itensCol = itens.filter((it) => (coluna === 'esquerda' ? it.x < xCorte : it.x >= xCorte));
      const grupos: ItemPosicionado[][] = [];
      for (const item of itensCol.sort((a, b) => b.y - a.y || a.x - b.x)) {
        const grupo = grupos.find((g) => Math.abs(g[0].y - item.y) <= TOLERANCIA_Y);
        if (grupo) grupo.push(item);
        else grupos.push([item]);
      }

      for (const grupo of grupos) {
        grupo.sort((a, b) => a.x - b.x);
        let texto = '';
        let xFimAnterior: number | null = null;
        for (const item of grupo) {
          if (xFimAnterior !== null && item.x - xFimAnterior > GAP_MINIMO_ESPACO) texto += ' ';
          texto += item.texto;
          xFimAnterior = item.x + item.largura;
        }
        texto = texto.replace(/\s+/g, ' ').trim();
        if (texto) linhas.push({ pagina: numPagina, coluna, y: grupo[0].y, texto });
      }
    }
  }

  return linhas;
}
