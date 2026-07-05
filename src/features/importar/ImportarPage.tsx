import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, novoId, agora } from '../../db/db';
import { Button, Card, Field, Select, TextInput } from '../../components/ui';
import { formatCentavos } from '../../lib/money';
import { mesReferencia as calcularMesReferencia } from '../../lib/datas';
import { parseFaturaItauPDF, type FaturaExtraida, type BlocoFinal } from '../../lib/parser-itau';
import { classificarBloco, type LancamentoClassificado } from '../../lib/classificacao/classificar';
import { confirmarImportacaoFatura, type LancamentoParaConfirmar } from '../../lib/classificacao/persistencia';
import { parseCSVClassificacao, lerArquivoCSV } from '../../lib/importacao-csv/parseCSVClassificacao';
import { extrairProjetosNovos, casarLancamentosComCSV } from '../../lib/importacao-csv/casarComCSV';
import type { LancamentoManual, OrigemClassificacao } from '../../db/types';

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

function MapearFinal({
  bloco,
  contaId,
  cartoesLivres,
  onResolvido,
}: {
  bloco: BlocoFinal;
  contaId: string;
  cartoesLivres: { id: string; apelido: string; final: string }[];
  onResolvido: (final: string, cartaoId: string) => void;
}) {
  const [modo, setModo] = useState<'existente' | 'novo'>(cartoesLivres.length > 0 ? 'existente' : 'novo');
  const [cartaoExistenteId, setCartaoExistenteId] = useState('');
  const [apelido, setApelido] = useState(bloco.titularNome);

  async function confirmarNovo() {
    const id = novoId();
    await db.cartoes.add({
      id,
      contaId,
      apelido: apelido.trim() || bloco.titularNome,
      final: bloco.final,
      titularNome: bloco.titularNome,
      ativo: true,
      atualizadoEm: agora(),
    });
    onResolvido(bloco.final, id);
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm">
        A fatura tem lançamentos do cartão <strong>{bloco.titularNome} (final {bloco.final})</strong>, que ainda não está
        cadastrado nesta conta. Vincule a um cartão existente ou crie um novo.
      </p>

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" checked={modo === 'existente'} onChange={() => setModo('existente')} disabled={cartoesLivres.length === 0} />
          Cartão existente
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={modo === 'novo'} onChange={() => setModo('novo')} />
          Novo cartão
        </label>
      </div>

      {modo === 'existente' ? (
        <div className="flex gap-2">
          <Select value={cartaoExistenteId} onChange={(e) => setCartaoExistenteId(e.target.value)} className="flex-1">
            <option value="">Selecione...</option>
            {cartoesLivres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido} (final {c.final})
              </option>
            ))}
          </Select>
          <Button disabled={!cartaoExistenteId} onClick={() => onResolvido(bloco.final, cartaoExistenteId)}>
            Vincular
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Field label="Apelido do novo cartão">
            <TextInput value={apelido} onChange={(e) => setApelido(e.target.value)} />
          </Field>
          <Button onClick={confirmarNovo} className="self-end">
            Criar
          </Button>
        </div>
      )}
    </Card>
  );
}

export function ImportarPage() {
  const contas = useLiveQuery(() => db.contas.filter((c) => c.ativo).toArray(), []);
  const pessoas = useLiveQuery(() => db.pessoas.filter((p) => p.ativo).toArray(), []);
  const projetos = useLiveQuery(() => db.projetos.filter((p) => p.ativo).toArray(), []);
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
      const cartoesDaConta = (cartoesTodos ?? []).filter((c) => c.contaId === contaId);
      const mapa: Record<string, string> = {};
      for (const bloco of resultado.blocos) {
        const existente = cartoesDaConta.find((c) => c.final === bloco.final);
        if (existente) mapa[bloco.final] = existente.id;
      }
      setMapeamentoFinais(mapa);
    } catch (e) {
      const detalhe = e instanceof Error ? e.message : String(e);
      setErro(`Não foi possível ler este PDF. Verifique se é uma fatura do Itaú. (detalhe: ${detalhe})`);
      // eslint-disable-next-line no-console
      console.error('Erro ao processar PDF da fatura', e);
    } finally {
      setCarregando(false);
    }
  }

  const finaisFaltando = extraido?.blocos.filter((b) => !mapeamentoFinais[b.final]) ?? [];
  const prontoParaClassificar = !!extraido && finaisFaltando.length === 0;

  async function classificar() {
    if (!extraido) return;
    setCarregando(true);
    setAvisosPlanilha([]);
    const todasLinhas: LinhaConferencia[] = [];
    const todosManuaisSemMatch: LancamentoManual[] = [];

    for (const bloco of extraido.blocos) {
      const cartaoId = mapeamentoFinais[bloco.final];
      const { lancamentos, manuaisSemMatch: semMatch } = await classificarBloco({
        contaId,
        cartaoId,
        dataFechamentoAtual: extraido.dataFechamento,
        lancamentos: bloco.lancamentos,
      });
      lancamentos.forEach((l, idx) => {
        todasLinhas.push({
          chave: `${bloco.final}-${idx}`,
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
      mesReferencia: calcularMesReferencia(extraido.dataFechamento),
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
          {extraido.avisos.length > 0 && (
            <ul className="list-disc pl-5 text-amber-600">
              {extraido.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
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

      {finaisFaltando.map((bloco) => (
        <MapearFinal
          key={bloco.final}
          bloco={bloco}
          contaId={contaId}
          cartoesLivres={(cartoesTodos ?? []).filter(
            (c) => c.contaId === contaId && !Object.values(mapeamentoFinais).includes(c.id),
          )}
          onResolvido={(final, cartaoId) => setMapeamentoFinais((m) => ({ ...m, [final]: cartaoId }))}
        />
      ))}

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
