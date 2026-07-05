import { db, novoId, agora } from '../../db/db';
import type { LancamentoFatura } from '../../db/types';
import type { LancamentoClassificado } from './classificar';

export interface LancamentoParaConfirmar extends LancamentoClassificado {
  cartaoId: string;
  /** true quando o usuário definiu/alterou manualmente a Pessoa na tela de conferência */
  corrigidoPeloUsuario?: boolean;
}

export async function upsertDicionario(
  cartaoId: string,
  estabelecimentoChave: string,
  estabelecimentoExemplo: string,
  pessoaId: string,
  projetoId?: string,
  descricaoSugerida?: string,
): Promise<void> {
  const existente = await db.dicionarioEstabelecimentos
    .where('[cartaoId+estabelecimentoChave]')
    .equals([cartaoId, estabelecimentoChave])
    .first();

  if (existente) {
    await db.dicionarioEstabelecimentos.update(existente.id, {
      pessoaId,
      projetoId,
      descricaoSugerida,
      atualizadoEm: agora(),
    });
    return;
  }

  await db.dicionarioEstabelecimentos.add({
    id: novoId(),
    estabelecimentoChave,
    estabelecimentoExemplo,
    cartaoId,
    pessoaId,
    projetoId,
    descricaoSugerida,
    atualizadoEm: agora(),
  });
}

/**
 * Persiste uma fatura já conferida: cria os lançamentos, atualiza o dicionário
 * (para matches automáticos da regra c e para correções manuais do usuário) e
 * marca os lançamentos manuais casados.
 */
export async function confirmarImportacaoFatura(params: {
  contaId: string;
  mesReferencia: string;
  dataFechamento: string;
  dataVencimento: string;
  totalFaturaCentavos: number;
  nomeArquivo: string;
  lancamentosPorCartao: LancamentoParaConfirmar[];
}): Promise<string> {
  const faturaId = novoId();
  const agoraStr = agora();

  await db.transaction(
    'rw',
    db.faturas,
    db.lancamentosFatura,
    db.lancamentosManuais,
    db.dicionarioEstabelecimentos,
    async () => {
      await db.faturas.add({
        id: faturaId,
        contaId: params.contaId,
        mesReferencia: params.mesReferencia,
        dataFechamento: params.dataFechamento,
        dataVencimento: params.dataVencimento,
        totalFaturaCentavos: params.totalFaturaCentavos,
        nomeArquivo: params.nomeArquivo,
        importadoEm: agoraStr,
      });

      for (const lancamento of params.lancamentosPorCartao) {
        const lancamentoFaturaId = novoId();
        const origemClassificacao = lancamento.corrigidoPeloUsuario
          ? 'manual_usuario'
          : lancamento.origemClassificacao;

        const registro: LancamentoFatura = {
          id: lancamentoFaturaId,
          faturaId,
          cartaoId: lancamento.cartaoId,
          data: lancamento.data,
          estabelecimentoOriginal: lancamento.estabelecimentoOriginal,
          estabelecimentoNormalizado: lancamento.estabelecimentoNormalizado,
          estabelecimentoChave: lancamento.estabelecimentoChave,
          parcelaAtual: lancamento.parcelaAtual,
          parcelaTotal: lancamento.parcelaTotal,
          valorCentavos: lancamento.valorCentavos,
          tipo: lancamento.tipo,
          categoria: lancamento.categoria,
          cidade: lancamento.cidade,
          descricao: lancamento.descricao,
          pessoaId: lancamento.pessoaId,
          projetoId: lancamento.projetoId,
          origemClassificacao,
          lancamentoManualId: lancamento.lancamentoManualId,
          atualizadoEm: agoraStr,
        };
        await db.lancamentosFatura.add(registro);

        if (lancamento.lancamentoManualId) {
          await db.lancamentosManuais.update(lancamento.lancamentoManualId, {
            status: 'casado',
            lancamentoFaturaId,
            atualizadoEm: agoraStr,
          });
        }

        // Regra (c) e correções manuais alimentam o dicionário; regra (a) e
        // regra (b) já refletem uma associação existente e não precisam reforçar.
        if (
          lancamento.pessoaId &&
          lancamento.tipo === 'compra' &&
          (lancamento.origemClassificacao === 'manual_match' || lancamento.corrigidoPeloUsuario)
        ) {
          await upsertDicionario(
            lancamento.cartaoId,
            lancamento.estabelecimentoChave,
            lancamento.estabelecimentoNormalizado,
            lancamento.pessoaId,
            lancamento.projetoId,
            lancamento.descricao,
          );
        }
      }
    },
  );

  return faturaId;
}
