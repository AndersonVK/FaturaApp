import { useEffect, useState } from 'react';
import { db, agora } from '../../db/db';
import { upsertDicionario } from '../../lib/classificacao/persistencia';
import { formatCentavos } from '../../lib/money';
import { Button, Card, Select } from '../../components/ui';
import type { LancamentoFatura, Pessoa, Projeto } from '../../db/types';

/**
 * Só a classificação é editável (Pessoa, Projeto, Descrição). Data, valor,
 * estabelecimento e parcela vêm do PDF e ficam somente leitura, para que o
 * total continue batendo com o que o banco cobrou.
 *
 * Cada edição também alimenta o dicionário de estabelecimentos - igual à tela
 * de conferência da importação -, então a correção feita aqui passa a valer
 * automaticamente nas próximas faturas.
 */
async function salvarClassificacao(
  lancamento: LancamentoFatura,
  alteracoes: Partial<Pick<LancamentoFatura, 'pessoaId' | 'projetoId' | 'descricao'>>,
) {
  const atualizado = { ...lancamento, ...alteracoes };
  await db.lancamentosFatura.update(lancamento.id, {
    ...alteracoes,
    origemClassificacao: 'manual_usuario',
    atualizadoEm: agora(),
  });
  if (atualizado.pessoaId && lancamento.tipo === 'compra') {
    await upsertDicionario(
      lancamento.cartaoId,
      lancamento.estabelecimentoChave,
      lancamento.estabelecimentoNormalizado,
      atualizado.pessoaId,
      atualizado.projetoId,
      atualizado.descricao,
    );
  }
}

/** Só grava ao sair do campo, para não escrever no banco a cada tecla. */
function CampoDescricao({
  lancamento,
  className,
}: {
  lancamento: LancamentoFatura;
  className?: string;
}) {
  const [texto, setTexto] = useState(lancamento.descricao ?? '');
  useEffect(() => setTexto(lancamento.descricao ?? ''), [lancamento.descricao]);

  function confirmar() {
    const novo = texto.trim() || undefined;
    if (novo === (lancamento.descricao ?? undefined)) return;
    salvarClassificacao(lancamento, { descricao: novo });
  }

  return (
    <input
      className={className}
      placeholder="Descrição"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function parcelaTexto(l: LancamentoFatura): string {
  return l.parcelaAtual && l.parcelaTotal ? `${l.parcelaAtual}/${l.parcelaTotal}` : '';
}

/** Campo compacto, para caber na planilha do desktop. */
const CELULA =
  'w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
/** Campo com alvo de toque confortável, para os cartões do celular. */
const CAMPO_MOBILE =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export function LancamentosDoMes({
  lancamentos,
  pessoas,
  projetos,
  nomeCartao,
  subtitulo,
}: {
  lancamentos: LancamentoFatura[];
  pessoas: Pessoa[];
  projetos: Projeto[];
  nomeCartao: (id: string) => string;
  /** Ex: "2026-07" ou "Todos os meses" - mostrado no cabeçalho da tela cheia. */
  subtitulo?: string;
}) {
  const [telaCheia, setTelaCheia] = useState(false);

  // Esc fecha a tela cheia, e enquanto ela está aberta o fundo não rola.
  useEffect(() => {
    if (!telaCheia) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTelaCheia(false);
    };
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [telaCheia]);

  const total = lancamentos.reduce((s, l) => s + l.valorCentavos, 0);

  const conteudo = (
    <>
      {/* Desktop: planilha */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr
              className={`bg-slate-100 text-left dark:bg-slate-800 ${
                // Em tela cheia a área de rolagem é o próprio painel, então o
                // cabeçalho pode grudar no topo sem brigar com o header do app.
                telaCheia ? 'sticky top-0 z-10' : ''
              }`}
            >
              <th className="whitespace-nowrap px-2 py-2 font-semibold">Data</th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold">Cartão</th>
              <th className="px-2 py-2 font-semibold">Estabelecimento</th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold">Parc.</th>
              <th className="whitespace-nowrap px-2 py-2 text-right font-semibold">Valor</th>
              <th className="px-2 py-2 font-semibold">Descrição</th>
              <th className="px-2 py-2 font-semibold">Pessoa</th>
              <th className="px-2 py-2 font-semibold">Projeto</th>
            </tr>
          </thead>
          <tbody>
            {lancamentos.map((l) => (
              <tr key={l.id} className="border-t border-slate-100 odd:bg-slate-50/60 dark:border-slate-800 dark:odd:bg-slate-800/30">
                <td className="whitespace-nowrap px-2 py-1 tabular-nums">{l.data}</td>
                <td className="whitespace-nowrap px-2 py-1">{nomeCartao(l.cartaoId)}</td>
                <td className="px-2 py-1">{l.estabelecimentoOriginal}</td>
                <td className="whitespace-nowrap px-2 py-1 tabular-nums">{parcelaTexto(l)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{formatCentavos(l.valorCentavos)}</td>
                <td className="px-2 py-1 min-w-40">
                  <CampoDescricao lancamento={l} className={CELULA} />
                </td>
                <td className="px-2 py-1 min-w-32">
                  <select
                    className={CELULA}
                    value={l.pessoaId ?? ''}
                    onChange={(e) => salvarClassificacao(l, { pessoaId: e.target.value || undefined })}
                  >
                    <option value="">Sem pessoa</option>
                    {pessoas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1 min-w-32">
                  <select
                    className={CELULA}
                    value={l.projetoId ?? ''}
                    onChange={(e) => salvarClassificacao(l, { projetoId: e.target.value || undefined })}
                  >
                    <option value="">Sem projeto</option>
                    {projetos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold dark:border-slate-700 dark:bg-slate-800">
              <td className="px-2 py-2" colSpan={4}>
                Total
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatCentavos(total)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Celular: um cartão por lançamento */}
      <div className="flex flex-col gap-2 md:hidden">
        {lancamentos.map((l) => (
          <Card key={l.id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">
                {l.estabelecimentoOriginal}
                {parcelaTexto(l) ? ` (${parcelaTexto(l)})` : ''}
              </p>
              <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                {formatCentavos(l.valorCentavos)}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {l.data} · {nomeCartao(l.cartaoId)}
            </p>
            <Select
              value={l.pessoaId ?? ''}
              onChange={(e) => salvarClassificacao(l, { pessoaId: e.target.value || undefined })}
            >
              <option value="">Sem pessoa</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
            <Select
              value={l.projetoId ?? ''}
              onChange={(e) => salvarClassificacao(l, { projetoId: e.target.value || undefined })}
            >
              <option value="">Sem projeto</option>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
            <CampoDescricao lancamento={l} className={CAMPO_MOBILE} />
          </Card>
        ))}
        {lancamentos.length > 0 && (
          <Card className="flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatCentavos(total)}</span>
          </Card>
        )}
      </div>
    </>
  );

  if (telaCheia) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 dark:bg-slate-950">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <p className="text-sm font-semibold">Lançamentos ({lancamentos.length})</p>
            {subtitulo && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitulo}</p>}
          </div>
          <Button variant="secondary" onClick={() => setTelaCheia(false)}>
            Fechar
          </Button>
        </header>
        <div className="flex-1 overflow-auto p-4">{conteudo}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Lançamentos ({lancamentos.length})
        </h3>
        <button
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:active:bg-slate-800"
          onClick={() => setTelaCheia(true)}
        >
          ⛶ Tela cheia
        </button>
      </div>
      {conteudo}
    </div>
  );
}
