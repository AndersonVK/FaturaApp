export interface LinhaTexto {
  pagina: number;
  coluna: 'esquerda' | 'direita';
  y: number;
  texto: string;
}

export interface LancamentoExtraido {
  data: string; // YYYY-MM-DD (ano já inferido)
  estabelecimentoOriginal: string;
  parcelaAtual?: number;
  parcelaTotal?: number;
  valorCentavos: number;
  categoria?: string;
  cidade?: string;
  tipo: 'compra' | 'ajuste';
}

export interface BlocoFinal {
  /** Identificador do bloco dentro desta fatura: o final quando o PDF o
   * informa, senão derivado do nome do titular (layouts mais novos do Itaú
   * trazem só o nome, sem "(final XXXX)"). */
  chave: string;
  titularNome: string;
  /** Últimos dígitos do cartão; string vazia quando o PDF não os informa. */
  final: string;
  lancamentos: LancamentoExtraido[];
  subtotalDeclaradoCentavos: number | null;
}

export interface PagamentoExtraido {
  descricao: string;
  valorCentavos: number;
}

export interface FaturaExtraida {
  dataFechamento: string; // YYYY-MM-DD
  dataVencimento: string;
  totalFaturaCentavos: number;
  blocos: BlocoFinal[];
  pagamentos: PagamentoExtraido[];
  avisos: string[];
}
