/**
 * A fatura Itaú só mostra "DD/MM" nos lançamentos (sem ano). Para lançamentos à
 * vista, o ano é inferido pelo ciclo da fatura (mês/ano de fechamento). Para
 * parcelas, a compra original aconteceu (parcelaAtual - 1) meses antes do
 * fechamento, então retrocedemos meses a partir do fechamento e usamos o ano
 * resultante.
 */

function addMeses(data: Date, meses: number): Date {
  const d = new Date(data.getTime());
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
}

function paraISO(ano: number, mes: number, dia: number): string {
  const mm = String(mes).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${ano}-${mm}-${dd}`;
}

/**
 * @param diaMes "DD/MM" como aparece na fatura
 * @param dataFechamentoISO "YYYY-MM-DD" data de fechamento da fatura sendo importada
 * @param parcelaAtual se for parcela, o número da parcela atual (1-based)
 */
export function inferirDataLancamento(
  diaMes: string,
  dataFechamentoISO: string,
  parcelaAtual?: number,
): string {
  const [diaStr, mesStr] = diaMes.split('/');
  const dia = Number(diaStr);
  const mes = Number(mesStr);
  const fechamento = new Date(`${dataFechamentoISO}T00:00:00Z`);

  const mesesRetroceder = parcelaAtual && parcelaAtual > 1 ? parcelaAtual - 1 : 0;
  const referencia = addMeses(fechamento, -mesesRetroceder);

  // Testa o ano da própria referência e o anterior, escolhendo o que fica mais
  // próximo (em meses) da referência - cobre faturas que cruzam virada de ano.
  const candidatos = [referencia.getUTCFullYear(), referencia.getUTCFullYear() - 1];
  let melhor = candidatos[0];
  let menorDistancia = Infinity;
  for (const ano of candidatos) {
    const candidato = new Date(Date.UTC(ano, mes - 1, dia));
    const distanciaMeses = Math.abs(
      (referencia.getUTCFullYear() - candidato.getUTCFullYear()) * 12 +
        (referencia.getUTCMonth() - candidato.getUTCMonth()),
    );
    if (distanciaMeses < menorDistancia) {
      menorDistancia = distanciaMeses;
      melhor = ano;
    }
  }

  return paraISO(melhor, mes, dia);
}

export function mesReferencia(dataFechamentoISO: string): string {
  return dataFechamentoISO.slice(0, 7);
}

/**
 * Mês de referência (competência) padrão da fatura, derivado do VENCIMENTO
 * menos 1 mês. É a convenção mais robusta: o vencimento cai sempre no mês
 * seguinte ao ciclo de gastos, independente de o cartão fechar no fim do mês
 * (ex: Itaú, emissão 30/05) ou no dia 1º do mês seguinte (ex: Azul, emissão
 * 01/06) - nos dois casos o vencimento é em junho e a competência é maio.
 * Continua editável na tela de importação para cobrir configurações atípicas.
 */
export function mesReferenciaPadrao(dataVencimentoISO: string): string {
  const venc = new Date(`${dataVencimentoISO}T00:00:00Z`);
  const anterior = addMeses(venc, -1);
  const ano = anterior.getUTCFullYear();
  const mes = String(anterior.getUTCMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

export function diferencaEmDias(dataISO1: string, dataISO2: string): number {
  const d1 = new Date(`${dataISO1}T00:00:00Z`).getTime();
  const d2 = new Date(`${dataISO2}T00:00:00Z`).getTime();
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}
