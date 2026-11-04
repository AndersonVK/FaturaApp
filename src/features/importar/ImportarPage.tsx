import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, novoId, agora } from '../../db/db';
import { ordenarPorNome } from '../../lib/ordenar';
import { Button, Card, Field, Select, TextInput } from '../../components/ui';
import { formatCentavos } from '../../lib/money';
import { mesReferenciaPadrao } from '../../lib/datas';
import { parseFaturaItauPDF, type FaturaExtraida, type BlocoFinal } from '../../lib/parser-itau';
import { classificarBloco, type LancamentoClassificado } from '../../lib/classificacao/classificar';
import { confirmarImportacaoFatura, type LancamentoParaConfirmar } from '../../lib/classificacao/persistencia';
import { parseCSVClassificacao, lerArquivoCSV } from '../../lib/importacao-csv/parseCSVClassificacao';
import { extrairProjetosNovos, casarLancamentosComCSV } from '../../lib/importacao-csv/casarComCSV';
import {
  levantarUsoDosCartoes,
  cartoesCandidatos,
  escolherCartaoProvavel,
  type UsoCartao,
} from '../../lib/classificacao/vinculoCartao';
import type { Cartao, LancamentoManual, OrigemClassificacao } from '../../db/types';

interface LinhaConferencia {
  chave: string;
  cartaoId: string;
  final: string;
  lancamento: LancamentoClassificado;
  pessoaIdAtual?: string;
  projetoIdAtual?: string;
  descricaoAtual?: string;
  origemPlanilha?: boolean;
}

const ROTULO_ORIGEM: Record<OrigemClassificacao, string> = {
  continuacao: 'Continuação de parcelamento',
  dicionario: 'Dicionário de estabelecimentos',
  manual_match: 'Casou com lançamento manual',
  nao_identificado: 'Não identificado',
  manual_usuario: 'Classificado manualmente',
  nao_aplicavel: 'Ajuste/encargo',
};

function foiCorrigido(l: LinhaConferencia): boolean {
  return (
    (l.pessoaIdAtual ?? '') !== (l.lancamento.pessoaId ?? '') ||
    (l.projetoIdAtual ?? '') !== (l.lancamento.projetoId ?? '') ||
    (l.descricaoAtual ?? '') !== (l.lancamento.descricao ?? '')
  );
}

function descreverBloco(bloco: BlocoFinal): string {
  return bloco.final ? `${bloco.titularNome} (final ${bloco.final})` : bloco.titularNome;
}

const NOVO_CARTAO = '__novo__';

function VincularCartao({
  bloco,
  contaId,
  cartoesDaConta,
  uso,
  cartaoId,
  ambiguo,
  duplicado,
  onResolvido,
}: {
  bloco: BlocoFinal;
  contaId: string;
  cartoesDaConta: Cartao[];
  uso: Map<string, UsoCartao>;
  cartaoId: string | undefined;
  ambiguo: boolean;
  duplicado: boolean;
  onResolvido: (chave: string, cartaoId: string) => void;
}) {
  const [criando, setCriando] = useState(cartoesDaConta.length === 0);
  const [apelido, setApelido] = useState(bloco.titularNome);
  const [final, setFinal] = useState(bloco.final);
  // Guardado para devolver a escolha anterior se o usuário desistir de criar.
  const [antesDeCriar, setAntesDeCriar] = useState<string>('');

  function comecarACriar() {
    // Enquanto o cartão novo não existe, o bloco fica sem vínculo: assim não dá
    // para classificar contra o cartão que estava selecionado antes.
    setAntesDeCriar(cartaoId ?? '');
    onResolvido(bloco.chave, '');
    setCriando(true);
  }

  function cancelarCriacao() {
    onResolvido(bloco.chave, antesDeCriar);
    setCriando(false);
  }

  async function criarCartao() {
    const id = novoId();
    await db.cartoes.add({
      id,
      contaId,
      apelido: apelido.trim() || bloco.titularNome,
      final: final.trim(),
      titularNome: bloco.titularNome,
      ativo: true,
      atualizadoEm: agora(),
    });
    setCriando(false);
    onResolvido(bloco.chave, id);
  }

  function descreverCartao(c: Cartao): string {
    const usoCartao = uso.get(c.id);
    return [
      c.apelido,
      c.final ? `(final ${c.final})` : '',
      usoCartao ? `· última fatura ${usoCartao.mesReferencia}` : '· sem histórico',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return (
    <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 first:border-0 first:pt-0 dark:border-slate-800">
      <p className="text-sm font-medium">
        {descreverBloco(bloco)}{' '}
        <span className="font-normal text-slate-500 dark:text-slate-400">
          · {bloco.lancamentos.length} lançamento(s)
        </span>
      </p>

      {criando ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Apelido do novo cartão">
            <TextInput value={apelido} onChange={(e) => setApelido(e.target.value)} />
          </Field>
          <Field label="Final (opcional)">
            <TextInput
              value={final}
              onChange={(e) => setFinal(e.target.value.replace(/\D/g, ''))}
              placeholder="ex: 2177"
              className="w-24"
            />
          </Field>
          <Button onClick={criarCartao}>Criar</Button>
          {cartoesDaConta.length > 0 && (
            <Button variant="secondary" onClick={cancelarCriacao}>
              Cancelar
            </Button>
          )}
        </div>
      ) : (
        <Select
          value={cartaoId ?? ''}
          onChange={(e) => {
            if (e.target.value === NOVO_CARTAO) comecarACriar();
            else onResolvido(bloco.chave, e.target.value);
          }}
        >
          <option value="">Selecione o cartão...</option>
          {cartoesDaConta.map((c) => (
            <option key={c.id} value={c.id}>
              {descreverCartao(c)}
            </option>
          ))}
          <option value={NOVO_CARTAO}>+ Criar novo cartão</option>
        </Select>
      )}

      {duplicado && (
        <p className="text-xs text-red-600">Este cartão já foi escolhido para outro grupo desta fatura.</p>
      )}
      {ambiguo && !duplicado && (
        <p className="text-xs text-amber-600">
          Esta conta tem mais de um cartão com este titular. O palpite acima é o cartão usado na fatura mais recente -
          confira se é mesmo o certo.
        </p>
      )}
    </div>
  );
}

export function ImportarPage() {
  const contas = useLiveQuery(() => db.contas.filter((c) => c.ativo).toArray(), []);
  const pessoas = useLiveQuery(() => db.pessoas.filter((p) => p.ativo).toArray().then(ordenarPorNome), []);
  const projetos = useLiveQuery(() => db.projetos.filter((p) => p.ativo).toArray().then(ordenarPorNome), []);
  const cartoesTodos = useLiveQuery(() => db.cartoes.toArray(), []);

  const [contaId, setContaId] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [extraido, setExtraido] = useState<FaturaExtraida | null>(null);
  const [mapeamentoFinais, setMapeamentoFinais] = useState<Record<string, string>>({});
  const [linhas, setLinhas] = useState<LinhaConferencia[] | null>(null);
  const [manuaisSemMatch, setManuaisSemMatch] = useState<LancamentoManual[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [arquivoCSV, setArquivoCSV] = useState<File | null>(null);
  const [avisosPlanilha, setAvisosPlanilha] = useState<string[]>([]);
  const [mesRef, setMesRef] = useState('');
  const [usoCartoes, setUsoCartoes] = useState<Map<string, UsoCartao>>(new Map());

  function nomePessoa(id?: string) {
    if (!id) return null;
    return pessoas?.find((p) => p.id === id)?.nome;
  }
  function nomeProjeto(id?: string) {
    if (!id) return null;
    return projetos?.find((p) => p.id === id)?.nome;
  }

  async function selecionarArquivo(file: File) {
    setErro('');
    setExtraido(null);
    setLinhas(null);
    setNomeArquivo(file.name);
    setCarregando(true);
    try {
      const resultado = await parseFaturaItauPDF(file);
      setExtraido(resultado);
      setMesRef(mesReferenciaPadrao(resultado.dataVencimento));
      const cartoesDaConta = (cartoesTodos ?? []).filter((c) => c.contaId === contaId);
      // Faturas mais novas não trazem o final dos cartões adicionais, só o nome
      // do titular - e o mesmo titular pode ter vários cartões na conta. O
      // histórico (parcelamentos e dicionário) é guardado POR CARTÃO, então
      // escolher o cartão errado zera a classificação automática; por isso o
      // palpite desempata pelo uso e o vínculo fica sempre visível na tela.
      const uso = await levantarUsoDosCartoes(contaId);
      setUsoCartoes(uso);
      const mapa: Record<string, string> = {};
      for (const bloco of resultado.blocos) {
        const escolhido = escolherCartaoProvavel(bloco, cartoesDaConta, uso);
        if (escolhido) mapa[bloco.chave] = escolhido;
      }
      setMapeamentoFinais(mapa);
    } catch (e) {
      // Inclui o início do stack para diagnosticar falhas que só ocorrem em
      // certos navegadores (a mensagem sozinha não diz onde quebrou).
      const detalhe = e instanceof Error ? `${e.message} @ ${(e.stack ?? '').slice(0, 300)}` : String(e);
      setErro(`Não foi possível ler este PDF. Verifique se é uma fatura do Itaú. (detalhe: ${detalhe})`);
      // eslint-disable-next-line no-console
      console.error('Erro ao processar PDF da fatura', e);
    } finally {
      setCarregando(false);
    }
  }

  const cartoesDaConta = (cartoesTodos ?? []).filter((c) => c.contaId === contaId);
  const idsEscolhidos = (extraido?.blocos ?? []).map((b) => mapeamentoFinais[b.chave]).filter(Boolean);
  const haCartaoDuplicado = new Set(idsEscolhidos).size !== idsEscolhidos.length;
  const prontoParaClassificar =
    !!extraido && idsEscolhidos.length === extraido.blocos.length && !haCartaoDuplicado;

  async function classificar() {
    if (!extraido) return;
    setCarregando(true);
    setAvisosPlanilha([]);
    const todasLinhas: LinhaConferencia[] = [];
    const todosManuaisSemMatch: LancamentoManual[] = [];

    for (const bloco of extraido.blocos) {
      const cartaoId = mapeamentoFinais[bloco.chave];
      const { lancamentos, manuaisSemMatch: semMatch } = await classificarBloco({
        contaId,
        cartaoId,
        dataFechamentoAtual: extraido.dataFechamento,
        lancamentos: bloco.lancamentos,
      });
      lancamentos.forEach((l, idx) => {
        todasLinhas.push({
          chave: `${bloco.chave}-${idx}`,
          cartaoId,
          final: bloco.final,
          lancamento: l,
          pessoaIdAtual: l.pessoaId,
          projetoIdAtual: l.projetoId,
          descricaoAtual: l.descricao,
        });
      });
      todosManuaisSemMatch.push(...semMatch);
    }

    if (arquivoCSV) {
      const linhasCSV = parseCSVClassificacao(await lerArquivoCSV(arquivoCSV));
      const projetosAtuais = await db.projetos.toArray();

      const nomesNovos = extrairProjetosNovos(linhasCSV, projetosAtuais);
      for (const nome of nomesNovos) {
        await db.projetos.add({ id: novoId(), nome, ativo: true, criadoEm: agora(), atualizadoEm: agora() });
      }
      const projetosAtualizados = nomesNovos.length > 0 ? await db.projetos.toArray() : projetosAtuais;
      const pessoasAtuais = await db.pessoas.toArray();

      const { porChave, avisos } = casarLancamentosComCSV({
        linhasCSV,
        lancamentos: todasLinhas.map((l) => ({
          chave: l.chave,
          data: l.lancamento.data,
          valorCentavos: l.lancamento.valorCentavos,
          parcelaAtual: l.lancamento.parcelaAtual,
          parcelaTotal: l.lancamento.parcelaTotal,
        })),
        pessoas: pessoasAtuais,
        projetos: projetosAtualizados,
      });

      for (const l of todasLinhas) {
        const match = porChave.get(l.chave);
        if (!match) continue;
        l.pessoaIdAtual = match.pessoaId;
        l.projetoIdAtual = match.projetoId;
        l.descricaoAtual = match.descricao;
        l.origemPlanilha = true;
      }
      setAvisosPlanilha(avisos);
    }

    setLinhas(todasLinhas);
    setManuaisSemMatch(todosManuaisSemMatch);
    setCarregando(false);
  }

  function atualizarLinha(chave: string, alteracoes: Partial<LinhaConferencia>) {
    setLinhas((atual) => (atual ?? []).map((l) => (l.chave === chave ? { ...l, ...alteracoes } : l)));
  }

  async function confirmar() {
    if (!extraido || !linhas) return;
    setSalvando(true);
    const paraConfirmar: LancamentoParaConfirmar[] = linhas.map((l) => ({
      ...l.lancamento,
      pessoaId: l.pessoaIdAtual,
      projetoId: l.projetoIdAtual,
      descricao: l.descricaoAtual,
      cartaoId: l.cartaoId,
      corrigidoPeloUsuario: foiCorrigido(l),
    }));

    await confirmarImportacaoFatura({
      contaId,
      mesReferencia: mesRef || mesReferenciaPadrao(extraido.dataVencimento),
      dataFechamento: extraido.dataFechamento,
      dataVencimento: extraido.dataVencimento,
      totalFaturaCentavos: extraido.totalFaturaCentavos,
      nomeArquivo,
      lancamentosPorCartao: paraConfirmar,
    });

    setSalvando(false);
    setConcluido(true);
  }

  function reiniciar() {
    setExtraido(null);
    setLinhas(null);
    setManuaisSemMatch([]);
    setConcluido(false);
    setNomeArquivo('');
    setArquivoCSV(null);
    setAvisosPlanilha([]);
    setMesRef('');
    setUsoCartoes(new Map());
  }

  if (concluido) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <p className="font-medium">Fatura importada com sucesso!</p>
        </Card>
        <Button onClick={reiniciar}>Importar outra fatura</Button>
      </div>
    );
  }

  function rotuloDaLinha(l: LinhaConferencia): string {
    if (l.origemPlanilha) return 'Planilha de classificação';
    return ROTULO_ORIGEM[l.lancamento.origemClassificacao];
  }

  const grupos = linhas
    ? {
        automaticos: linhas.filter(
          (l) => l.origemPlanilha || ['continuacao', 'dicionario', 'manual_match'].includes(l.lancamento.origemClassificacao),
        ),
        naoIdentificados: linhas.filter((l) => !l.origemPlanilha && l.lancamento.origemClassificacao === 'nao_identificado'),
        ajustes: linhas.filter((l) => l.lancamento.origemClassificacao === 'nao_aplicavel'),
      }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Importar fatura</h2>

      {!linhas && (
        <Card className="flex flex-col gap-3">
          <Field label="Conta">
            <Select value={contaId} onChange={(e) => setContaId(e.target.value)}>
              <option value="">Selecione...</option>
              {contas?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.apelido}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Arquivo PDF da fatura">
            <input
              type="file"
              accept="application/pdf"
              disabled={!contaId}
              onChange={(e) => e.target.files?.[0] && selecionarArquivo(e.target.files[0])}
              className="text-sm"
            />
          </Field>

          {carregando && <p className="text-sm text-slate-500">Processando...</p>}
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </Card>
      )}

      {extraido && !linhas && (
        <Card className="flex flex-col gap-2 text-sm">
          <p>
            Fechamento: <strong>{extraido.dataFechamento}</strong> · Vencimento: <strong>{extraido.dataVencimento}</strong> ·
            Total: <strong>{formatCentavos(extraido.totalFaturaCentavos)}</strong>
          </p>
          <p className="text-slate-500 dark:text-slate-400">{extraido.blocos.length} cartão(ões) final(is) encontrados.</p>
          <Field label="Mês de referência (competência)">
            <TextInput type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} />
          </Field>
          {extraido.avisos.length > 0 && (
            <ul className="list-disc pl-5 text-amber-600">
              {extraido.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {extraido && !linhas && (
        <Card className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Cartões desta fatura</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Confira a qual cartão cadastrado pertence cada grupo de lançamentos. O histórico de parcelamentos e o
              dicionário ficam guardados por cartão, então um vínculo errado faz a classificação automática não
              encontrar nada.
            </p>
          </div>
          {extraido.blocos.map((bloco) => (
            <VincularCartao
              key={bloco.chave}
              bloco={bloco}
              contaId={contaId}
              cartoesDaConta={cartoesDaConta}
              uso={usoCartoes}
              cartaoId={mapeamentoFinais[bloco.chave]}
              ambiguo={cartoesCandidatos(bloco, cartoesDaConta).length > 1}
              duplicado={
                !!mapeamentoFinais[bloco.chave] &&
                idsEscolhidos.filter((id) => id === mapeamentoFinais[bloco.chave]).length > 1
              }
              onResolvido={(chave, cartaoId) => setMapeamentoFinais((m) => ({ ...m, [chave]: cartaoId }))}
            />
          ))}
        </Card>
      )}

      {extraido && !linhas && prontoParaClassificar && (
        <Card className="flex flex-col gap-2">
          <Field label="Planilha de classificação (CSV, opcional)">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setArquivoCSV(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </Field>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Se você já classificou este mês numa planilha própria (Data;Estabelecimento;Valor;Detalhe;Descrição;Pessoa;Projeto),
            o app casa cada lançamento do PDF com a linha certa (por data e valor) e pré-preenche Pessoa/Projeto/Descrição.
          </p>
        </Card>
      )}

      {prontoParaClassificar && !linhas && <Button onClick={classificar}>Classificar lançamentos</Button>}

      {avisosPlanilha.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700">
          <p className="mb-1 text-sm font-medium">Avisos da planilha</p>
          <ul className="list-disc pl-5 text-sm text-amber-600">
            {avisosPlanilha.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Card>
      )}

      {grupos && (
        <div className="flex flex-col gap-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              Classificados automaticamente ({grupos.automaticos.length})
            </h3>
            {/* Zero reconhecidos numa conta que já tem faturas quase sempre
                significa cartão errado: o histórico fica guardado por cartão. */}
            {grupos.automaticos.length === 0 && usoCartoes.size > 0 && (
              <Card className="mb-2 flex flex-col gap-2 border-amber-300 dark:border-amber-700">
                <p className="text-sm">
                  Nenhum lançamento foi reconhecido, embora esta conta já tenha faturas importadas. Em geral isso quer
                  dizer que o grupo foi vinculado ao cartão errado - parcelamentos e dicionário são guardados por
                  cartão.
                </p>
                <Button variant="secondary" onClick={() => setLinhas(null)}>
                  Revisar os cartões
                </Button>
              </Card>
            )}
            <div className="flex flex-col gap-2">
              {grupos.automaticos.map((l) => (
                <LinhaLancamento
                  key={l.chave}
                  linha={l}
                  pessoas={pessoas ?? []}
                  projetos={projetos ?? []}
                  onAtualizar={atualizarLinha}
                  rotuloOrigem={rotuloDaLinha(l)}
                  nomePessoaAtual={nomePessoa(l.pessoaIdAtual)}
                  nomeProjetoAtual={nomeProjeto(l.projetoIdAtual)}
                />
              ))}
            </div>
          </section>

          {grupos.naoIdentificados.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                Não identificados ({grupos.naoIdentificados.length})
              </h3>
              <div className="flex flex-col gap-2">
                {grupos.naoIdentificados.map((l) => (
                  <LinhaLancamento
                    key={l.chave}
                    linha={l}
                    pessoas={pessoas ?? []}
                    projetos={projetos ?? []}
                    onAtualizar={atualizarLinha}
                    rotuloOrigem={rotuloDaLinha(l)}
                    nomePessoaAtual={nomePessoa(l.pessoaIdAtual)}
                    nomeProjetoAtual={nomeProjeto(l.projetoIdAtual)}
                    destacar
                  />
                ))}
              </div>
            </section>
          )}

          {manuaisSemMatch.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                Lançamentos manuais sem correspondência ({manuaisSemMatch.length})
              </h3>
              <div className="flex flex-col gap-2">
                {manuaisSemMatch.map((m) => (
                  <Card key={m.id} className="text-sm">
                    {formatCentavos(m.valorParcelaCentavos)} em {m.qtdParcelas}x · {m.data}
                    {m.descricao ? ` · ${m.descricao}` : ''}
                  </Card>
                ))}
              </div>
            </section>
          )}

          {grupos.ajustes.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                Ajustes/encargos ({grupos.ajustes.length})
              </h3>
              <div className="flex flex-col gap-2">
                {grupos.ajustes.map((l) => (
                  <Card key={l.chave} className="text-sm">
                    {l.lancamento.estabelecimentoOriginal} · {formatCentavos(l.lancamento.valorCentavos)}
                  </Card>
                ))}
              </div>
            </section>
          )}

          <Button onClick={confirmar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Confirmar importação'}
          </Button>
        </div>
      )}
    </div>
  );
}

function LinhaLancamento({
  linha,
  pessoas,
  projetos,
  onAtualizar,
  rotuloOrigem,
  nomePessoaAtual,
  nomeProjetoAtual,
  destacar,
}: {
  linha: LinhaConferencia;
  pessoas: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
  onAtualizar: (chave: string, alteracoes: Partial<LinhaConferencia>) => void;
  rotuloOrigem: string;
  nomePessoaAtual?: string | null;
  nomeProjetoAtual?: string | null;
  destacar?: boolean;
}) {
  const { lancamento } = linha;
  return (
    <Card className={destacar ? 'border-amber-300 dark:border-amber-700' : ''}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {lancamento.estabelecimentoOriginal}
            {lancamento.parcelaAtual && lancamento.parcelaTotal ? ` (${lancamento.parcelaAtual}/${lancamento.parcelaTotal})` : ''}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {lancamento.data} · {formatCentavos(lancamento.valorCentavos)} · {rotuloOrigem}
            {nomePessoaAtual ? ` · pessoa: ${nomePessoaAtual}` : ''}
            {nomeProjetoAtual ? ` · projeto: ${nomeProjetoAtual}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <Select
          value={linha.pessoaIdAtual ?? ''}
          onChange={(e) => onAtualizar(linha.chave, { pessoaIdAtual: e.target.value || undefined })}
        >
          <option value="">Selecione a Pessoa...</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Select>
        <Select
          value={linha.projetoIdAtual ?? ''}
          onChange={(e) => onAtualizar(linha.chave, { projetoIdAtual: e.target.value || undefined })}
        >
          <option value="">Sem projeto</option>
          {projetos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Select>
        <TextInput
          placeholder="Descrição (produto/serviço, opcional)"
          value={linha.descricaoAtual ?? ''}
          onChange={(e) => onAtualizar(linha.chave, { descricaoAtual: e.target.value || undefined })}
        />
      </div>
    </Card>
  );
}
