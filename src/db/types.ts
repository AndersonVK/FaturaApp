// Todos os valores monetários são armazenados em centavos (inteiros) para evitar
// problemas de arredondamento de ponto flutuante. Datas são strings ISO "YYYY-MM-DD".

export interface Pessoa {
  id: string;
  nome: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Projeto {
  id: string;
  nome: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Conta {
  id: string;
  apelido: string;
  diaVencimento?: number;
  ativo: boolean;
  atualizadoEm: string;
}

export interface Cartao {
  id: string;
  contaId: string;
  apelido: string;
  final: string; // últimos 4 dígitos, ex: "7898"
  titularNome: string; // nome impresso na fatura, ex: "ANDERSON KUBA"
  ativo: boolean;
  atualizadoEm: string;
}

export type StatusLancamentoManual = 'pendente' | 'casado' | 'ignorado';

export interface LancamentoManual {
  id: string;
  cartaoId: string;
  data: string;
  valorParcelaCentavos: number;
  qtdParcelas: number;
  pessoaId: string;
  projetoId?: string;
  descricao?: string;
  status: StatusLancamentoManual;
  lancamentoFaturaId?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Fatura {
  id: string;
  contaId: string;
  mesReferencia: string; // "YYYY-MM"
  dataFechamento: string;
  dataVencimento: string;
  totalFaturaCentavos: number;
  nomeArquivo: string;
  importadoEm: string;
}

export type TipoLancamentoFatura = 'compra' | 'ajuste';

export type OrigemClassificacao =
  | 'continuacao'
  | 'dicionario'
  | 'manual_match'
  | 'nao_identificado'
  | 'manual_usuario'
  | 'nao_aplicavel'; // para pagamentos/ajustes que não recebem Pessoa

export interface LancamentoFatura {
  id: string;
  faturaId: string;
  cartaoId: string;
  data: string;
  estabelecimentoOriginal: string;
  estabelecimentoNormalizado: string;
  estabelecimentoChave: string;
  parcelaAtual?: number;
  parcelaTotal?: number;
  valorCentavos: number;
  tipo: TipoLancamentoFatura;
  categoria?: string;
  cidade?: string;
  descricao?: string; // produto/serviço, texto livre (herdado de lançamento manual ou digitado na conferência)
  pessoaId?: string;
  projetoId?: string;
  origemClassificacao: OrigemClassificacao;
  lancamentoManualId?: string;
  atualizadoEm: string;
}

export interface DicionarioEstabelecimento {
  id: string;
  estabelecimentoChave: string;
  estabelecimentoExemplo: string; // nome normalizado de exemplo, só para exibição na UI
  cartaoId: string; // string vazia = regra global (fallback); IndexedDB não indexa null de forma confiável
  pessoaId: string;
  projetoId?: string;
  descricaoSugerida?: string;
  atualizadoEm: string;
}

export interface BackupFile {
  version: 1;
  exportedAt: string;
  tables: {
    pessoas: Pessoa[];
    projetos: Projeto[];
    contas: Conta[];
    cartoes: Cartao[];
    lancamentosManuais: LancamentoManual[];
    faturas: Fatura[];
    lancamentosFatura: LancamentoFatura[];
    dicionarioEstabelecimentos: DicionarioEstabelecimento[];
  };
}
