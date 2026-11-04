import { db } from '../../db/db';
import type { Cartao } from '../../db/types';

/** Em qual fatura (a mais recente) o cartão aparece, e com quantos lançamentos. */
export interface UsoCartao {
  mesReferencia: string;
  dataFechamento: string;
  qtdLancamentos: number;
}

/**
 * Levanta, para cada cartão da conta, a fatura mais recente em que ele tem
 * lançamentos. É o que diz qual cartão carrega o histórico - e portanto qual
 * deles a classificação automática consegue aproveitar.
 */
export async function levantarUsoDosCartoes(contaId: string): Promise<Map<string, UsoCartao>> {
  const faturas = await db.faturas.where('contaId').equals(contaId).toArray();
  // Mais recente primeiro: a primeira aparição de um cartão é o seu último uso.
  faturas.sort((a, b) => (a.dataFechamento < b.dataFechamento ? 1 : -1));

  const uso = new Map<string, UsoCartao>();
  for (const fatura of faturas) {
    const lancamentos = await db.lancamentosFatura.where('faturaId').equals(fatura.id).toArray();
    for (const lancamento of lancamentos) {
      const atual = uso.get(lancamento.cartaoId);
      if (!atual) {
        uso.set(lancamento.cartaoId, {
          mesReferencia: fatura.mesReferencia,
          dataFechamento: fatura.dataFechamento,
          qtdLancamentos: 1,
        });
      } else if (atual.dataFechamento === fatura.dataFechamento) {
        atual.qtdLancamentos += 1;
      }
    }
  }
  return uso;
}

/**
 * Cartões da conta que combinam com o bloco da fatura: pelo final, quando a
 * fatura informa os últimos dígitos, senão pelo nome do titular (faturas mais
 * novas do Itaú não trazem o final dos cartões adicionais).
 */
export function cartoesCandidatos(
  bloco: { final: string; titularNome: string },
  cartoesDaConta: Cartao[],
): Cartao[] {
  if (bloco.final) return cartoesDaConta.filter((c) => c.final === bloco.final);
  const titular = bloco.titularNome.trim().toUpperCase();
  return cartoesDaConta.filter((c) => c.titularNome.trim().toUpperCase() === titular);
}

/**
 * Melhor palpite de cartão para o bloco. Quando mais de um cartão da conta tem
 * o mesmo titular (ou o mesmo final), desempata pelo histórico: vence o cartão
 * usado na fatura mais recente e, nela, com mais lançamentos. Escolher o outro
 * faz a classificação automática não encontrar nada - nem parcelamentos nem
 * dicionário, que são guardados por cartão.
 */
export function escolherCartaoProvavel(
  bloco: { final: string; titularNome: string },
  cartoesDaConta: Cartao[],
  uso: Map<string, UsoCartao>,
): string | undefined {
  const candidatos = cartoesCandidatos(bloco, cartoesDaConta);
  if (candidatos.length === 0) return undefined;
  if (candidatos.length === 1) return candidatos[0].id;

  const ordenados = [...candidatos].sort((a, b) => {
    const usoA = uso.get(a.id);
    const usoB = uso.get(b.id);
    if (!usoA && !usoB) return 0;
    if (!usoA) return 1;
    if (!usoB) return -1;
    if (usoA.dataFechamento !== usoB.dataFechamento) {
      return usoA.dataFechamento < usoB.dataFechamento ? 1 : -1;
    }
    return usoB.qtdLancamentos - usoA.qtdLancamentos;
  });
  return ordenados[0].id;
}
