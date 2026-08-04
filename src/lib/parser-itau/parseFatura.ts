import { parseValorBRParaCentavos } from '../money';
import { extrairParcela } from '../normalize';
import { inferirDataLancamento } from '../datas';
import type { LinhaTexto, FaturaExtraida, BlocoFinal, LancamentoExtraido } from './types';

const RE_DATA_ROTULO = /^(Postagem|Vencimento|Emiss[ãa]o)\s*:\s*(\d{2}\/\d{2}\/\d{4})/i;
/** O "(final XXXX)" é opcional: layouts mais novos trazem só "Lançamentos no cartão <valor>". */
const RE_FOOTER_CARTAO = /^Lançamentos no cartão\s*(?:\(final\s*(\d{3,4})\))?\s+(-?\s?[\d.,]+)\s*$/i;
const RE_HEADER_FINAL = /^(.+?)\s*\(final\s*(\d{3,4})\)\s*$/i;
const RE_LINHA_TRANSACAO = /^(\d{2}\/\d{2})\s+(.+?)\s+(-?\s?[\d.,]+)\s*$/;
const RE_COLUNA_CABECALHO = /^DATA\b/;
const RE_TOTAL_PAGAMENTOS = /^Total dos pagamentos\b/i;
const RE_TOTAL_TRANSACOES_INTER = /^Total transações inter\.\s*em R\$/i;
const RE_REPASSE_IOF = /^Repasse de IOF em R\$\s+([\d.,]+)\s*$/i;
const RE_TOTAL_LANC_INTER = /^Total lançamentos inter\.\s*em R\$/i;
const RE_TOTAL_LANC_ATUAIS = /^Total dos lançamentos atuais\s+(-?\s?[\d.,]+)\s*$/i;
const RE_TOTAL_PRODUTOS = /^Lançamentos produtos e serviços\b/i;

/**
 * Nome de titular como o Itaú imprime: só maiúsculas, espaços e pontuação de
 * nome. Serve para distinguir a linha do titular (layout novo, sem "(final
 * XXXX)") de títulos de seção, que têm minúsculas e/ou dois-pontos.
 */
const RE_NOME_TITULAR = /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ\s.'-]{2,59}$/;

const TITULOS_SECAO = new Set([
  'Pagamentos efetuados',
  'Lançamentos: compras e saques',
  'Lançamentos internacionais',
  'Lançamentos: produtos e serviços',
  'Compras parceladas - próximas faturas',
]);

type Secao = 'nenhuma' | 'pagamentos' | 'compras' | 'internacional' | 'produtos' | 'parceladas';

const SECAO_POR_TITULO: Record<string, Secao> = {
  'Pagamentos efetuados': 'pagamentos',
  'Lançamentos: compras e saques': 'compras',
  'Lançamentos internacionais': 'internacional',
  'Lançamentos: produtos e serviços': 'produtos',
  'Compras parceladas - próximas faturas': 'parceladas',
};

function ehLinhaEstrutural(texto: string): boolean {
  return (
    RE_FOOTER_CARTAO.test(texto) ||
    RE_HEADER_FINAL.test(texto) ||
    TITULOS_SECAO.has(texto) ||
    RE_COLUNA_CABECALHO.test(texto) ||
    RE_TOTAL_PAGAMENTOS.test(texto) ||
    RE_TOTAL_TRANSACOES_INTER.test(texto) ||
    RE_REPASSE_IOF.test(texto) ||
    RE_TOTAL_LANC_INTER.test(texto) ||
    RE_TOTAL_LANC_ATUAIS.test(texto) ||
    RE_TOTAL_PRODUTOS.test(texto) ||
    RE_LINHA_TRANSACAO.test(texto)
  );
}

/**
 * No layout novo o titular aparece sozinho, sem "(final XXXX)". O que o
 * identifica com segurança é a posição: é a linha imediatamente anterior ao
 * cabeçalho de colunas ("DATA ESTABELECIMENTO ..."), e não é um título de
 * seção nem outra linha estrutural.
 */
function ehCabecalhoTitular(linhas: LinhaTexto[], i: number): boolean {
  const atual = linhas[i]?.texto?.trim() ?? '';
  const proxima = linhas[i + 1]?.texto?.trim() ?? '';
  return (
    RE_COLUNA_CABECALHO.test(proxima) && !ehLinhaEstrutural(atual) && RE_NOME_TITULAR.test(atual)
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

  const blocosPorChave = new Map<string, BlocoFinal>();
  const pagamentos: FaturaExtraida['pagamentos'] = [];

  let secao: Secao = 'nenhuma';
  let chaveAtual: string | null = null;

  function blocoAtual(): BlocoFinal | null {
    if (!chaveAtual) return null;
    return blocosPorChave.get(chaveAtual) ?? null;
  }

  function abrirBloco(chave: string, titularNome: string, final: string) {
    chaveAtual = chave;
    if (!blocosPorChave.has(chave)) {
      blocosPorChave.set(chave, {
        chave,
        titularNome,
        final,
        lancamentos: [],
        subtotalDeclaradoCentavos: null,
      });
    }
  }

  for (let i = 0; i < linhas.length; i++) {
    const { texto } = linhas[i];

    const mFooter = texto.match(RE_FOOTER_CARTAO);
    if (mFooter) {
      const [, finalDeclarado, valorTexto] = mFooter;
      const chave = finalDeclarado ?? chaveAtual;
      const bloco = chave ? blocosPorChave.get(chave) : null;
      if (bloco) {
        bloco.subtotalDeclaradoCentavos = parseValorBRParaCentavos(valorTexto);
        const somaAtual = bloco.lancamentos.reduce((s, l) => s + l.valorCentavos, 0);
        if (somaAtual !== bloco.subtotalDeclaradoCentavos) {
          const identificacao = bloco.final ? `final ${bloco.final}` : bloco.titularNome;
          avisos.push(
            `Cartão ${identificacao}: soma dos lançamentos (${somaAtual / 100}) difere do subtotal declarado (${bloco.subtotalDeclaradoCentavos / 100}).`,
          );
        }
      }
      chaveAtual = null;
      continue;
    }

    if (TITULOS_SECAO.has(texto)) {
      secao = SECAO_POR_TITULO[texto] ?? 'nenhuma';
      continue;
    }

    if (RE_COLUNA_CABECALHO.test(texto)) continue;
    if (RE_TOTAL_PAGAMENTOS.test(texto)) continue;
    if (RE_TOTAL_TRANSACOES_INTER.test(texto)) continue;
    if (RE_TOTAL_LANC_INTER.test(texto)) continue;
    if (RE_TOTAL_LANC_ATUAIS.test(texto)) continue;
    if (RE_TOTAL_PRODUTOS.test(texto)) continue;

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
      abrirBloco(final, titularNome.trim(), final);
      continue;
    }

    // Layout novo: titular sem "(final XXXX)", identificado pela posição.
    if (ehCabecalhoTitular(linhas, i)) {
      const titularNome = texto.trim();
      abrirBloco(`nome:${titularNome.toUpperCase()}`, titularNome, '');
      continue;
    }

    const mTransacao = texto.match(RE_LINHA_TRANSACAO);
    if (
      mTransacao &&
      (secao === 'compras' || secao === 'internacional' || secao === 'produtos' || secao === 'pagamentos')
    ) {
      const [, dataBr, estabelecimentoBruto, valorTexto] = mTransacao;
      const valorCentavos = parseValorBRParaCentavos(valorTexto);

      if (secao === 'pagamentos') {
        pagamentos.push({ descricao: estabelecimentoBruto.trim(), valorCentavos });
        continue;
      }

      const bloco = blocoAtual();
      if (!bloco) {
        avisos.push(`Lançamento "${texto}" encontrado sem um cartão associado - ignorado.`);
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
        // Anuidade e afins não são atribuíveis a uma Pessoa; entram como ajuste.
        tipo: secao === 'produtos' ? 'ajuste' : 'compra',
      };

      // A categoria/cidade só aparece como sublinha nas compras domésticas.
      if (secao === 'compras' && i + 1 < linhas.length) {
        const proxima = linhas[i + 1].texto.trim();
        const podeSerSublinha =
          !ehLinhaEstrutural(proxima) && !ehCabecalhoTitular(linhas, i + 1) && proxima.length <= 45;
        if (podeSerSublinha) {
          const mCategoria = proxima.match(/^(.+?)\s*\.\s*(.*)$/);
          if (mCategoria) {
            lancamento.categoria = mCategoria[1].trim();
            lancamento.cidade = mCategoria[2].trim();
          } else {
            // Layout novo: "<categoria> <CIDADE>" sem separador definido.
            lancamento.categoria = proxima;
          }
          i += 1;
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
    blocos: [...blocosPorChave.values()],
    pagamentos,
    avisos,
  };
}
