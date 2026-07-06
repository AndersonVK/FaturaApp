import type { LinhaCSVClassificacao } from './parseCSVClassificacao';

const TOLERANCIA_VALOR_CENTAVOS = 1;

/**
 * Compara datas por dia+mês ("MM-DD"), ignorando o ano. O CSV pode vir sem ano
 * ("MM-DD") ou com ano ("YYYY-MM-DD"); o PDF sempre traz "YYYY-MM-DD" com o ano
 * inferido (que pode até divergir em parcelas antigas que cruzam a virada de
 * ano). Como o valor já discrimina e a parcela desempata, dia+mês é a chave
 * robusta que funciona nos dois formatos de planilha.
 */
function chaveDiaMes(dataISO: string): string {
  return dataISO.length >= 5 ? dataISO.slice(-5) : dataISO;
}

export interface LancamentoParaCasar {
  chave: string;
  data: string;
  valorCentavos: number;
  parcelaAtual?: number;
  parcelaTotal?: number;
}

export interface MatchCSV {
  pessoaId: string;
  projetoId?: string;
  descricao?: string;
}

/** Nomes de projeto citados na planilha que ainda não existem cadastrados (para criar antes de casar). */
export function extrairProjetosNovos(
  linhasCSV: LinhaCSVClassificacao[],
  projetosExistentes: { nome: string }[],
): string[] {
  const existentesLower = new Set(projetosExistentes.map((p) => p.nome.trim().toLowerCase()));
  const novos = new Map<string, string>(); // lowercase -> nome original (primeira ocorrência)
  for (const linha of linhasCSV) {
    if (!linha.nomeProjeto) continue;
    const lower = linha.nomeProjeto.trim().toLowerCase();
    if (existentesLower.has(lower) || novos.has(lower)) continue;
    novos.set(lower, linha.nomeProjeto.trim());
  }
  return [...novos.values()];
}

export function casarLancamentosComCSV(params: {
  linhasCSV: LinhaCSVClassificacao[];
  lancamentos: LancamentoParaCasar[];
  pessoas: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
}): { porChave: Map<string, MatchCSV>; avisos: string[] } {
  const { lancamentos, pessoas, projetos } = params;
  const linhasDisponiveis = [...params.linhasCSV];
  const avisos: string[] = [];
  const porChave = new Map<string, MatchCSV>();

  const idPorNomePessoa = new Map(pessoas.map((p) => [p.nome.trim().toLowerCase(), p.id]));
  const idPorNomeProjeto = new Map(projetos.map((p) => [p.nome.trim().toLowerCase(), p.id]));

  for (const lancamento of lancamentos) {
    const candidatos = linhasDisponiveis.filter(
      (linha) =>
        chaveDiaMes(linha.data) === chaveDiaMes(lancamento.data) &&
        Math.abs(linha.valorCentavos - lancamento.valorCentavos) <= TOLERANCIA_VALOR_CENTAVOS,
    );

    if (candidatos.length === 0) continue;

    let linha = candidatos[0];
    if (candidatos.length > 1 && lancamento.parcelaAtual && lancamento.parcelaTotal) {
      const comParcelaIgual = candidatos.find(
        (c) => c.parcelaAtual === lancamento.parcelaAtual && c.parcelaTotal === lancamento.parcelaTotal,
      );
      if (comParcelaIgual) linha = comParcelaIgual;
    }

    linhasDisponiveis.splice(linhasDisponiveis.indexOf(linha), 1);

    const pessoaId = idPorNomePessoa.get(linha.nomePessoa.trim().toLowerCase());
    if (!pessoaId) {
      avisos.push(
        `Planilha: pessoa "${linha.nomePessoa}" (linha de ${linha.data}, ${linha.valorCentavos / 100}) não encontrada - cadastre-a antes de importar.`,
      );
      continue;
    }

    const projetoId = linha.nomeProjeto ? idPorNomeProjeto.get(linha.nomeProjeto.trim().toLowerCase()) : undefined;

    porChave.set(lancamento.chave, { pessoaId, projetoId, descricao: linha.descricao });
  }

  return { porChave, avisos };
}
