import { parseValorBRParaCentavos } from '../money';

/**
 * Parser da planilha de controle manual do usuário (formato:
 * Data;Estabelecimento;Valor;Detalhe;Descrição;Pessoa;Projeto), usada como
 * fonte de verdade opcional para classificar uma fatura importada. Implementa
 * um tokenizador CSV de verdade (não split ingênuo por linha) porque a
 * planilha tem células entre aspas com quebras de linha e ";" embutidos.
 */

/**
 * CSVs exportados do Excel no Brasil costumam vir em Windows-1252, não UTF-8
 * - File.text() sempre decodifica como UTF-8 e corromperia os acentos. Tenta
 * UTF-8 estrito primeiro; se falhar (bytes de acentuação em Latin-1 não
 * formam UTF-8 válido), refaz em windows-1252.
 */
export async function lerArquivoCSV(arquivo: File): Promise<string> {
  const buffer = await arquivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

const RE_PARCELA_DETALHE = /Parcela\s+(\d+)\s+de\s+(\d+)/i;

export interface LinhaCSVClassificacao {
  data: string; // YYYY-MM-DD
  valorCentavos: number;
  parcelaAtual?: number;
  parcelaTotal?: number;
  descricao?: string;
  nomePessoa: string;
  nomeProjeto?: string;
}

function tokenizarCSV(texto: string, delimitador = ';'): string[][] {
  const linhas: string[][] = [];
  let linhaAtual: string[] = [];
  let campoAtual = '';
  let dentroDeAspas = false;
  let i = 0;

  while (i < texto.length) {
    const c = texto[i];

    if (dentroDeAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campoAtual += '"';
          i += 2;
          continue;
        }
        dentroDeAspas = false;
        i++;
        continue;
      }
      campoAtual += c;
      i++;
      continue;
    }

    if (c === '"') {
      dentroDeAspas = true;
      i++;
      continue;
    }
    if (c === delimitador) {
      linhaAtual.push(campoAtual);
      campoAtual = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      linhaAtual.push(campoAtual);
      linhas.push(linhaAtual);
      linhaAtual = [];
      campoAtual = '';
      i++;
      continue;
    }
    campoAtual += c;
    i++;
  }

  if (campoAtual.length > 0 || linhaAtual.length > 0) {
    linhaAtual.push(campoAtual);
    linhas.push(linhaAtual);
  }

  return linhas.filter((l) => l.some((campo) => campo.trim() !== ''));
}

/**
 * Aceita "DD/MM/YYYY" (planilha com ano) e "DD/MM" (planilha sem ano, comum).
 * Sem ano, retorna só "MM-DD" - o casamento com o PDF é feito por dia+mês+valor
 * (o valor já discrimina), então o ano é dispensável.
 */
function dataBrParaIso(dataBr: string): string {
  const partes = dataBr.trim().split('/');
  const dia = (partes[0] ?? '').padStart(2, '0');
  const mes = (partes[1] ?? '').padStart(2, '0');
  const ano = partes[2];
  return ano ? `${ano}-${mes}-${dia}` : `${mes}-${dia}`;
}

export function parseCSVClassificacao(texto: string): LinhaCSVClassificacao[] {
  const linhas = tokenizarCSV(texto);
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0].map((c) => c.trim().toLowerCase());
  const indice = (nome: string) => cabecalho.findIndex((c) => c.startsWith(nome));

  const idxData = indice('data');
  const idxValor = indice('valor');
  const idxDetalhe = indice('detalhe');
  const idxDescricao = indice('descri');
  const idxPessoa = indice('pessoa');
  const idxProjeto = indice('projeto');

  const resultado: LinhaCSVClassificacao[] = [];

  for (const campos of linhas.slice(1)) {
    const dataBr = campos[idxData]?.trim();
    const nomePessoa = campos[idxPessoa]?.trim();
    if (!dataBr || !nomePessoa) continue;

    const detalhe = campos[idxDetalhe]?.trim() ?? '';
    const mParcela = detalhe.match(RE_PARCELA_DETALHE);

    const projetoTexto = campos[idxProjeto]?.trim() ?? '';
    const nomeProjeto = projetoTexto && projetoTexto !== '0' ? projetoTexto : undefined;

    const descricaoTexto = campos[idxDescricao]?.trim() ?? '';

    resultado.push({
      data: dataBrParaIso(dataBr),
      valorCentavos: parseValorBRParaCentavos(campos[idxValor] ?? '0'),
      parcelaAtual: mParcela ? Number(mParcela[1]) : undefined,
      parcelaTotal: mParcela ? Number(mParcela[2]) : undefined,
      descricao: descricaoTexto || undefined,
      nomePessoa,
      nomeProjeto,
    });
  }

  return resultado;
}
