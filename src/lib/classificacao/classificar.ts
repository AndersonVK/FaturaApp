import { db } from '../../db/db';
import type { LancamentoManual, DicionarioEstabelecimento, OrigemClassificacao } from '../../db/types';
import { normalizarEstabelecimento, chaveEstabelecimento, estabelecimentosCorrespondem } from '../normalize';
import { diferencaEmDias } from '../datas';
import type { LancamentoExtraido } from '../parser-itau/types';

const TOLERANCIA_VALOR_CENTAVOS = 1;
const TOLERANCIA_DIAS_MATCH_MANUAL = 10;

export interface LancamentoClassificado extends LancamentoExtraido {
  estabelecimentoNormalizado: string;
  estabelecimentoChave: string;
  pessoaId?: string;
  projetoId?: string;
  descricao?: string;
  origemClassificacao: OrigemClassificacao;
  lancamentoManualId?: string;
}

export interface ResultadoClassificacaoBloco {
  lancamentos: LancamentoClassificado[];
  /** lançamentos manuais pendentes desse cartão que continuaram sem correspondência */
  manuaisSemMatch: LancamentoManual[];
}

async function buscarLancamentosFaturaAnterior(contaId: string, cartaoId: string, dataFechamentoAtual: string) {
  const faturasAnteriores = await db.faturas
    .where('contaId')
    .equals(contaId)
    .filter((f) => f.dataFechamento < dataFechamentoAtual)
    .toArray();

  if (faturasAnteriores.length === 0) return [];

  faturasAnteriores.sort((a, b) => (a.dataFechamento < b.dataFechamento ? 1 : -1));
  const faturaAnterior = faturasAnteriores[0];

  return db.lancamentosFatura
    .where('faturaId')
    .equals(faturaAnterior.id)
    .filter((l) => l.cartaoId === cartaoId && l.tipo === 'compra')
    .toArray();
}

async function buscarDicionario(cartaoId: string): Promise<Map<string, DicionarioEstabelecimento>> {
  const [especificos, globais] = await Promise.all([
    db.dicionarioEstabelecimentos.where('cartaoId').equals(cartaoId).toArray(),
    db.dicionarioEstabelecimentos.where('cartaoId').equals('').toArray(),
  ]);
  const mapa = new Map<string, DicionarioEstabelecimento>();
  for (const entrada of globais) mapa.set(entrada.estabelecimentoChave, entrada);
  for (const entrada of especificos) mapa.set(entrada.estabelecimentoChave, entrada);
  return mapa;
}

async function buscarManuaisPendentes(cartaoId: string): Promise<LancamentoManual[]> {
  return db.lancamentosManuais
    .where('cartaoId')
    .equals(cartaoId)
    .filter((m) => m.status === 'pendente')
    .toArray();
}

export async function classificarBloco(params: {
  contaId: string;
  cartaoId: string;
  dataFechamentoAtual: string;
  lancamentos: LancamentoExtraido[];
}): Promise<ResultadoClassificacaoBloco> {
  const { contaId, cartaoId, dataFechamentoAtual, lancamentos } = params;

  const [lancamentosAnteriores, dicionario, manuaisPendentes] = await Promise.all([
    buscarLancamentosFaturaAnterior(contaId, cartaoId, dataFechamentoAtual),
    buscarDicionario(cartaoId),
    buscarManuaisPendentes(cartaoId),
  ]);

  const manuaisDisponiveis = [...manuaisPendentes];
  const resultado: LancamentoClassificado[] = [];

  for (const lancamento of lancamentos) {
    const estabelecimentoNormalizado = normalizarEstabelecimento(lancamento.estabelecimentoOriginal);
    const estabelecimentoChave = chaveEstabelecimento(estabelecimentoNormalizado);

    const classificado: LancamentoClassificado = {
      ...lancamento,
      estabelecimentoNormalizado,
      estabelecimentoChave,
      origemClassificacao: 'nao_identificado',
    };

    if (lancamento.tipo === 'ajuste') {
      classificado.origemClassificacao = 'nao_aplicavel';
      resultado.push(classificado);
      continue;
    }

    // (a) Continuação de parcelamento: mesmo estabelecimento (tolerante a
    // truncamento), parcela anterior = N-1, mesmo total de parcelas, valor
    // igual (±R$0,01).
    if (lancamento.parcelaAtual && lancamento.parcelaAtual > 1) {
      const anterior = lancamentosAnteriores.find(
        (l) =>
          l.parcelaTotal === lancamento.parcelaTotal &&
          l.parcelaAtual === lancamento.parcelaAtual! - 1 &&
          Math.abs(l.valorCentavos - lancamento.valorCentavos) <= TOLERANCIA_VALOR_CENTAVOS &&
          estabelecimentosCorrespondem(l.estabelecimentoNormalizado, estabelecimentoNormalizado),
      );
      if (anterior?.pessoaId) {
        classificado.pessoaId = anterior.pessoaId;
        classificado.projetoId = anterior.projetoId;
        classificado.descricao = anterior.descricao;
        classificado.origemClassificacao = 'continuacao';
        resultado.push(classificado);
        continue;
      }
    }

    // (b) Recorrência conhecida: dicionário (por cartão, com fallback global).
    const entradaDicionario = dicionario.get(estabelecimentoChave);
    if (entradaDicionario) {
      classificado.pessoaId = entradaDicionario.pessoaId;
      classificado.projetoId = entradaDicionario.projetoId;
      classificado.descricao = entradaDicionario.descricaoSugerida;
      classificado.origemClassificacao = 'dicionario';
      resultado.push(classificado);
      continue;
    }

    // (c) Primeira parcela nova: casa com lançamento manual pendente do mês.
    const parcelaTotalEsperada = lancamento.parcelaTotal ?? 1;
    const ehPrimeiraParcela = !lancamento.parcelaAtual || lancamento.parcelaAtual === 1;
    if (ehPrimeiraParcela) {
      let melhorIndice = -1;
      let menorDistanciaDias = Infinity;
      for (let idx = 0; idx < manuaisDisponiveis.length; idx++) {
        const manual = manuaisDisponiveis[idx];
        if (manual.qtdParcelas !== parcelaTotalEsperada) continue;
        if (Math.abs(manual.valorParcelaCentavos - lancamento.valorCentavos) > TOLERANCIA_VALOR_CENTAVOS) continue;
        const distanciaDias = Math.abs(diferencaEmDias(manual.data, lancamento.data));
        if (distanciaDias > TOLERANCIA_DIAS_MATCH_MANUAL) continue;
        if (distanciaDias < menorDistanciaDias) {
          menorDistanciaDias = distanciaDias;
          melhorIndice = idx;
        }
      }
      if (melhorIndice >= 0) {
        const manual = manuaisDisponiveis[melhorIndice];
        classificado.pessoaId = manual.pessoaId;
        classificado.projetoId = manual.projetoId;
        classificado.descricao = manual.descricao;
        classificado.origemClassificacao = 'manual_match';
        classificado.lancamentoManualId = manual.id;
        manuaisDisponiveis.splice(melhorIndice, 1);
        resultado.push(classificado);
        continue;
      }
    }

    // (d) Sem match: fica para classificação manual do usuário.
    resultado.push(classificado);
  }

  return { lancamentos: resultado, manuaisSemMatch: manuaisDisponiveis };
}
