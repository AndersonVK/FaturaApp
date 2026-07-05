import { parseValorBRParaCentavos } from '../money';
import { extrairParcela } from '../normalize';
import { inferirDataLancamento } from '../datas';
import type { LinhaTexto, FaturaExtraida, BlocoFinal, LancamentoExtraido } from './types';

const RE_DATA_ROTULO = /^(Postagem|Vencimento|Emiss[ãa]o)\s*:\s*(\d{2}\/\d{2}\/\d{4})/i;
const RE_FOOTER_FINAL = /^Lançamentos no cartão\s*\(final\s*(\d{3,4})\)\s+(-?\s?[\d.,]+)\s*$/i;
const RE_HEADER_FINAL = /^(.+?)\s*\(final\s*(\d{3,4})\)\s*$/i;
const RE_LINHA_TRANSACAO = /^(\d{2}\/\d{2})\s+(.+?)\s+(-?\s?[\d.,]+)\s*$/;
const RE_COLUNA_CABECALHO = /^DATA\b/;
const RE_TOTAL_PAGAMENTOS = /^Total dos pagamentos\b/i;
const RE_TOTAL_TRANSACOES_INTER = /^Total transações inter\.\s*em R\$/i;
const RE_REPASSE_IOF = /^Repasse de IOF em R\$\s+([\d.,]+)\s*$/i;
const RE_TOTAL_LANC_INTER = /^Total lançamentos inter\.\s*em R\$/i;
const RE_TOTAL_LANC_ATUAIS = /^Total dos lançamentos atuais\s+(-?\s?[\d.,]+)\s*$/i;

const TITULOS_SECAO = new Set([
  'Pagamentos efetuados',
  'Lançamentos: compras e saques',
  'Lançamentos internacionais',
  'Compras parceladas - próximas faturas',
]);

type Secao = 'nenhuma' | 'pagamentos' | 'compras' | 'internacional' | 'parceladas';

function ehLinhaEstrutural(texto: string): boolean {
  return (
    RE_FOOTER_FINAL.test(texto) ||
    RE_HEADER_FINAL.test(texto) ||
    TITULOS_SECAO.has(texto) ||
    RE_COLUNA_CABECALHO.test(texto) ||
    RE_TOTAL_PAGAMENTOS.test(texto) ||
    RE_TOTAL_TRANSACOES_INTER.test(texto) ||
    RE_REPASSE_IOF.test(texto) ||
    RE_TOTAL_LANC_INTER.test(texto) ||
    RE_TOTAL_LANC_ATUAIS.test(texto) ||
    RE_LINHA_TRANSACAO.test(texto)
  );
}

function extrairDatasCabecalho(linhas: LinhaTexto[]): { dataFechamento?: string; dataVencimento?: string } {
  let dataFechamento: string | undefined;
  let dataVencimento: string | undefined;
  for (const { texto } of linhas) {
    const m = texto.match(RE_DATA_ROTULO);
    if (!m) continue;
    const [, rotulo, dataBr] = m;
    const [dia, mes, ano] = dataBr.split('/');
    const iso = `${ano}-${mes}-${dia}`;
    if (/emiss/i.test(rotulo)) dataFechamento = iso;
    if (/vencimento/i.test(rotulo)) dataVencimento = iso;
  }
  return { dataFechamento, dataVencimento };
}

function extrairTotalFatura(linhas: LinhaTexto[]): number | undefined {
  for (const { texto } of linhas) {
    const m = texto.match(/Total desta fatura\s+(-?\s?[\d.,]+)/i);
    if (m) return parseValorBRParaCentavos(m[1]);
  }
  return undefined;
}

export function parseLinhasFatura(linhas: LinhaTexto[]): FaturaExtraida {
  const avisos: string[] = [];
  const { dataFechamento, dataVencimento } = extrairDatasCabecalho(linhas);
  const totalFaturaCentavos = extrairTotalFatura(linhas);

  if (!dataFechamento) avisos.push('Não foi possível encontrar a data de emissão/fechamento da fatura.');
  if (!dataVencimento) avisos.push('Não foi possível encontrar a data de vencimento da fatura.');
  if (totalFaturaCentavos === undefined) avisos.push('Não foi possível encontrar o total da fatura.');

  const dataFechamentoFinal = dataFechamento ?? new Date().toISOString().slice(0, 10);

  const blocosPorFinal = new Map<string, BlocoFinal>();
  const pagamentos: FaturaExtraida['pagamentos'] = [];

  let secao: Secao = 'nenhuma';
  let finalAtual: string | null = null;

  function blocoAtual(): BlocoFinal | null {
    if (!finalAtual) return null;
    return blocosPorFinal.get(finalAtual) ?? null;
  }

  for (let i = 0; i < linhas.length; i++) {
    const { texto } = linhas[i];

    const mFooter = texto.match(RE_FOOTER_FINAL);
    if (mFooter) {
      const [, final, valorTexto] = mFooter;
      const bloco = blocosPorFinal.get(final);
      if (bloco) {
        bloco.subtotalDeclaradoCentavos = parseValorBRParaCentavos(valorTexto);
        const somaAtual = bloco.lancamentos.reduce((s, l) => s + l.valorCentavos, 0);
        if (somaAtual !== bloco.subtotalDeclaradoCentavos) {
          avisos.push(
            `Cartão final ${final}: soma dos lançamentos (${somaAtual / 100}) difere do subtotal declarado (${bloco.subtotalDeclaradoCentavos / 100}).`,
          );
        }
      }
      finalAtual = null;
      continue;
    }

    if (TITULOS_SECAO.has(texto)) {
      if (texto === 'Pagamentos efetuados') secao = 'pagamentos';
      else if (texto === 'Lançamentos: compras e saques') secao = 'compras';
      else if (texto === 'Lançamentos internacionais') secao = 'internacional';
      else if (texto === 'Compras parceladas - próximas faturas') secao = 'parceladas';
      continue;
    }

    if (RE_COLUNA_CABECALHO.test(texto)) continue;
    if (RE_TOTAL_PAGAMENTOS.test(texto)) continue;
    if (RE_TOTAL_TRANSACOES_INTER.test(texto)) continue;
    if (RE_TOTAL_LANC_INTER.test(texto)) continue;
    if (RE_TOTAL_LANC_ATUAIS.test(texto)) continue;

    const mRepasse = texto.match(RE_REPASSE_IOF);
    if (mRepasse) {
      const bloco = blocoAtual();
      if (bloco && secao === 'internacional') {
        bloco.lancamentos.push({
          data: dataFechamentoFinal,
          estabelecimentoOriginal: 'IOF sobre lançamentos internacionais',
          valorCentavos: parseValorBRParaCentavos(mRepasse[1]),
          tipo: 'ajuste',
        });
      }
      continue;
    }

    const mHeader = texto.match(RE_HEADER_FINAL);
    if (mHeader) {
      const [, titularNome, final] = mHeader;
      finalAtual = final;
      if (!blocosPorFinal.has(final)) {
        blocosPorFinal.set(final, {
          titularNome: titularNome.trim(),
          final,
          lancamentos: [],
          subtotalDeclaradoCentavos: null,
        });
      }
      continue;
    }

    const mTransacao = texto.match(RE_LINHA_TRANSACAO);
    if (mTransacao && (secao === 'compras' || secao === 'internacional' || secao === 'pagamentos')) {
      const [, dataBr, estabelecimentoBruto, valorTexto] = mTransacao;
      const valorCentavos = parseValorBRParaCentavos(valorTexto);

      if (secao === 'pagamentos') {
        pagamentos.push({ descricao: estabelecimentoBruto.trim(), valorCentavos });
        continue;
      }

      const bloco = blocoAtual();
      if (!bloco) {
        avisos.push(`Lançamento "${texto}" encontrado sem um cartão (final) associado - ignorado.`);
        continue;
      }

      const { nomeBruto, parcelaAtual, parcelaTotal } = extrairParcela(estabelecimentoBruto);
      const data = inferirDataLancamento(dataBr, dataFechamentoFinal, parcelaAtual);

      const lancamento: LancamentoExtraido = {
        data,
        estabelecimentoOriginal: nomeBruto,
        parcelaAtual,
        parcelaTotal,
        valorCentavos,
        tipo: 'compra',
      };

      // A categoria/cidade só aparece como sublinha nas compras domésticas.
      if (secao === 'compras' && i + 1 < linhas.length) {
        const proxima = linhas[i + 1].texto;
        if (!ehLinhaEstrutural(proxima)) {
          const mCategoria = proxima.match(/^(.+?)\s*\.\s*(.*)$/);
          if (mCategoria) {
            lancamento.categoria = mCategoria[1].trim();
            lancamento.cidade = mCategoria[2].trim();
            i += 1;
          }
        }
      }

      bloco.lancamentos.push(lancamento);
      continue;
    }
  }

  return {
    dataFechamento: dataFechamentoFinal,
    dataVencimento: dataVencimento ?? dataFechamentoFinal,
    totalFaturaCentavos: totalFaturaCentavos ?? 0,
    blocos: [...blocosPorFinal.values()],
    pagamentos,
    avisos,
  };
}
