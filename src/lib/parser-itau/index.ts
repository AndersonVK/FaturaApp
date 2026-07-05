import { extrairLinhasDoPDF } from './extrairLinhas';
import { parseLinhasFatura } from './parseFatura';
import type { FaturaExtraida } from './types';

export type { FaturaExtraida, BlocoFinal, LancamentoExtraido, PagamentoExtraido } from './types';

export async function parseFaturaItauPDF(arquivo: File | ArrayBuffer): Promise<FaturaExtraida> {
  const dados = arquivo instanceof File ? await arquivo.arrayBuffer() : arquivo;
  const linhas = await extrairLinhasDoPDF(dados);
  return parseLinhasFatura(linhas);
}
