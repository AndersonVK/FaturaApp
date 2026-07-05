import Dexie, { type EntityTable } from 'dexie';
import type {
  Pessoa,
  Conta,
  Cartao,
  LancamentoManual,
  Fatura,
  LancamentoFatura,
  DicionarioEstabelecimento,
} from './types';

export class FaturaAppDB extends Dexie {
  pessoas!: EntityTable<Pessoa, 'id'>;
  contas!: EntityTable<Conta, 'id'>;
  cartoes!: EntityTable<Cartao, 'id'>;
  lancamentosManuais!: EntityTable<LancamentoManual, 'id'>;
  faturas!: EntityTable<Fatura, 'id'>;
  lancamentosFatura!: EntityTable<LancamentoFatura, 'id'>;
  dicionarioEstabelecimentos!: EntityTable<DicionarioEstabelecimento, 'id'>;

  constructor() {
    super('FaturaAppDB');

    this.version(1).stores({
      pessoas: 'id, nome, ativo',
      contas: 'id, ativo',
      cartoes: 'id, contaId, final, ativo',
      lancamentosManuais: 'id, cartaoId, pessoaId, status, data',
      faturas: 'id, contaId, mesReferencia',
      lancamentosFatura:
        'id, faturaId, cartaoId, estabelecimentoChave, pessoaId, tipo, [cartaoId+estabelecimentoChave]',
      dicionarioEstabelecimentos:
        'id, cartaoId, estabelecimentoChave, [cartaoId+estabelecimentoChave]',
    });
  }
}

export const db = new FaturaAppDB();

export function novoId(): string {
  return crypto.randomUUID();
}

export function agora(): string {
  return new Date().toISOString();
}
