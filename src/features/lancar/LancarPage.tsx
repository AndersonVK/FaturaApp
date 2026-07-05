import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, novoId, agora } from '../../db/db';
import { Button, Card, EmptyState, Field, Select, TextInput } from '../../components/ui';
import { MoneyInput } from '../../components/MoneyInput';
import { formatCentavos } from '../../lib/money';

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LancarPage() {
  const cartoes = useLiveQuery(() => db.cartoes.filter((c) => c.ativo).toArray(), []);
  const pessoas = useLiveQuery(() => db.pessoas.filter((p) => p.ativo).toArray(), []);
  const pendentes = useLiveQuery(
    () => db.lancamentosManuais.where('status').equals('pendente').reverse().sortBy('data'),
    [],
  );

  const [cartaoId, setCartaoId] = useState('');
  const [data, setData] = useState(hoje());
  const [valorCentavos, setValorCentavos] = useState<number | null>(null);
  const [qtdParcelas, setQtdParcelas] = useState('1');
  const [pessoaId, setPessoaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState('');

  async function lancar() {
    setErro('');
    if (!cartaoId) return setErro('Selecione um cartão.');
    if (!pessoaId) return setErro('Selecione uma Pessoa.');
    if (!valorCentavos || valorCentavos <= 0) return setErro('Informe o valor da parcela.');
    const parcelas = Number(qtdParcelas) || 1;

    await db.lancamentosManuais.add({
      id: novoId(),
      cartaoId,
      data,
      valorParcelaCentavos: valorCentavos,
      qtdParcelas: parcelas,
      pessoaId,
      descricao: descricao.trim() || undefined,
      status: 'pendente',
      criadoEm: agora(),
      atualizadoEm: agora(),
    });

    setValorCentavos(null);
    setQtdParcelas('1');
    setDescricao('');
  }

  async function remover(id: string) {
    await db.lancamentosManuais.delete(id);
  }

  function nomeCartao(id: string) {
    return cartoes?.find((c) => c.id === id)?.apelido ?? '?';
  }
  function nomePessoa(id: string) {
    return pessoas?.find((p) => p.id === id)?.nome ?? '?';
  }

  const semCartoes = cartoes?.length === 0;
  const semPessoas = pessoas?.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Lançar durante o mês</h2>

      {(semCartoes || semPessoas) && (
        <EmptyState>
          Cadastre pelo menos {semCartoes && 'um cartão'} {semCartoes && semPessoas && 'e'} {semPessoas && 'uma pessoa'} em
          Ajustes antes de lançar.
        </EmptyState>
      )}

      {!semCartoes && !semPessoas && (
        <Card className="flex flex-col gap-3">
          <Field label="Cartão">
            <Select value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}>
              <option value="">Selecione...</option>
              {cartoes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.apelido} (final {c.final})
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data">
              <TextInput type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </Field>
            <Field label="Qtd. parcelas">
              <TextInput
                type="number"
                min={1}
                value={qtdParcelas}
                onChange={(e) => setQtdParcelas(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Valor da parcela">
            <MoneyInput valorCentavos={valorCentavos} onChange={setValorCentavos} />
          </Field>

          <Field label="Pessoa">
            <Select value={pessoaId} onChange={(e) => setPessoaId(e.target.value)}>
              <option value="">Selecione...</option>
              {pessoas?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Descrição (opcional)">
            <TextInput value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: presente aniversário" />
          </Field>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <Button onClick={lancar}>Lançar</Button>
        </Card>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Pendentes</h3>
        {pendentes?.length === 0 && <EmptyState>Nenhum lançamento pendente.</EmptyState>}
        <div className="flex flex-col gap-2">
          {pendentes?.map((lm) => (
            <Card key={lm.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {formatCentavos(lm.valorParcelaCentavos)}
                  {lm.qtdParcelas > 1 ? ` em ${lm.qtdParcelas}x` : ''}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lm.data} · {nomeCartao(lm.cartaoId)} · {nomePessoa(lm.pessoaId)}
                  {lm.descricao ? ` · ${lm.descricao}` : ''}
                </p>
              </div>
              <button className="text-xs text-red-600 underline" onClick={() => remover(lm.id)}>
                Remover
              </button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
