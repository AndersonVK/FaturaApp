import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { Button, Card, EmptyState, Select } from '../../components/ui';
import { formatCentavos } from '../../lib/money';

function baixarCSV(nomeArquivo: string, linhas: string[][]) {
  const conteudo = linhas
    .map((linha) => linha.map((campo) => `"${campo.replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

export function HistoricoPage() {
  const faturas = useLiveQuery(
    () => db.faturas.toArray().then((lista) => lista.sort((a, b) => (a.dataFechamento < b.dataFechamento ? 1 : -1))),
    [],
  );
  const contas = useLiveQuery(() => db.contas.toArray(), []);
  const pessoas = useLiveQuery(() => db.pessoas.toArray(), []);
  const projetos = useLiveQuery(() => db.projetos.toArray(), []);
  const cartoes = useLiveQuery(() => db.cartoes.toArray(), []);

  const meses = useMemo(() => [...new Set(faturas?.map((f) => f.mesReferencia))], [faturas]);
  const [mesSelecionado, setMesSelecionado] = useState('todos');

  const faturasFiltradas = useMemo(
    () => (mesSelecionado === 'todos' ? faturas ?? [] : (faturas ?? []).filter((f) => f.mesReferencia === mesSelecionado)),
    [faturas, mesSelecionado],
  );

  const idsFaturasFiltradas = useMemo(() => faturasFiltradas.map((f) => f.id), [faturasFiltradas]);

  const lancamentos = useLiveQuery(async () => {
    if (idsFaturasFiltradas.length === 0) return [];
    return db.lancamentosFatura.where('faturaId').anyOf(idsFaturasFiltradas).toArray();
  }, [idsFaturasFiltradas]);

  function nomePessoa(id?: string) {
    if (!id) return 'Sem pessoa';
    return pessoas?.find((p) => p.id === id)?.nome ?? 'Pessoa removida';
  }
  function nomeProjeto(id?: string) {
    if (!id) return 'Sem projeto';
    return projetos?.find((p) => p.id === id)?.nome ?? 'Projeto removido';
  }
  function nomeCartao(id: string) {
    return cartoes?.find((c) => c.id === id)?.apelido ?? '?';
  }
  function nomeConta(id: string) {
    return contas?.find((c) => c.id === id)?.apelido ?? '?';
  }

  const totaisPorPessoa = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const l of lancamentos ?? []) {
      const chave = l.pessoaId ?? '__sem_pessoa__';
      mapa.set(chave, (mapa.get(chave) ?? 0) + l.valorCentavos);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [lancamentos]);

  const totaisPorProjeto = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const l of lancamentos ?? []) {
      const chave = l.projetoId ?? '__sem_projeto__';
      mapa.set(chave, (mapa.get(chave) ?? 0) + l.valorCentavos);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [lancamentos]);

  function exportarCSV() {
    const linhas: string[][] = [
      [
        'Data',
        'Mês referência',
        'Conta',
        'Cartão',
        'Estabelecimento',
        'Parcela',
        'Valor',
        'Descrição',
        'Pessoa',
        'Projeto',
        'Origem',
      ],
    ];
    for (const l of lancamentos ?? []) {
      const fatura = faturasFiltradas.find((f) => f.id === l.faturaId);
      linhas.push([
        l.data,
        fatura?.mesReferencia ?? '',
        fatura ? nomeConta(fatura.contaId) : '',
        nomeCartao(l.cartaoId),
        l.estabelecimentoOriginal,
        l.parcelaAtual && l.parcelaTotal ? `${l.parcelaAtual}/${l.parcelaTotal}` : '',
        (l.valorCentavos / 100).toFixed(2).replace('.', ','),
        l.descricao ?? '',
        nomePessoa(l.pessoaId),
        nomeProjeto(l.projetoId),
        l.origemClassificacao,
      ]);
    }
    baixarCSV(`fatura-app-${mesSelecionado}.csv`, linhas);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Histórico de faturas</h2>

      <Card className="flex items-center gap-3">
        <Select value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} className="flex-1">
          <option value="todos">Todos os meses</option>
          {meses.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Button variant="secondary" onClick={exportarCSV} disabled={(lancamentos?.length ?? 0) === 0}>
          Exportar CSV
        </Button>
      </Card>

      {faturasFiltradas.length === 0 && <EmptyState>Nenhuma fatura importada ainda.</EmptyState>}

      {totaisPorPessoa.length > 0 && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Total por pessoa</h3>
          <div className="flex flex-col gap-1">
            {totaisPorPessoa.map(([pessoaId, total]) => (
              <div key={pessoaId} className="flex justify-between text-sm">
                <span>{pessoaId === '__sem_pessoa__' ? 'Sem pessoa' : nomePessoa(pessoaId)}</span>
                <span className="font-medium">{formatCentavos(total)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {totaisPorProjeto.length > 0 && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Total por projeto</h3>
          <div className="flex flex-col gap-1">
            {totaisPorProjeto.map(([projetoId, total]) => (
              <div key={projetoId} className="flex justify-between text-sm">
                <span>{projetoId === '__sem_projeto__' ? 'Sem projeto' : nomeProjeto(projetoId)}</span>
                <span className="font-medium">{formatCentavos(total)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {faturasFiltradas.map((fatura) => (
          <Card key={fatura.id}>
            <p className="text-sm font-medium">
              {nomeConta(fatura.contaId)} · {fatura.mesReferencia}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Fechamento {fatura.dataFechamento} · Vencimento {fatura.dataVencimento} · Total{' '}
              {formatCentavos(fatura.totalFaturaCentavos)}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
