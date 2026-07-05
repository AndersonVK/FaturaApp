import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, novoId, agora } from '../../db/db';
import { Button, Card, EmptyState, Field, Select, TextInput } from '../../components/ui';
import { normalizarEstabelecimento, chaveEstabelecimento } from '../../lib/normalize';

function FormNovaEntrada({ onDone }: { onDone: () => void }) {
  const cartoes = useLiveQuery(() => db.cartoes.filter((c) => c.ativo).toArray(), []);
  const pessoas = useLiveQuery(() => db.pessoas.filter((p) => p.ativo).toArray(), []);
  const projetos = useLiveQuery(() => db.projetos.filter((p) => p.ativo).toArray(), []);
  const [cartaoId, setCartaoId] = useState<string>('global');
  const [estabelecimento, setEstabelecimento] = useState('');
  const [pessoaId, setPessoaId] = useState('');
  const [projetoId, setProjetoId] = useState('');
  const [descricaoSugerida, setDescricaoSugerida] = useState('');

  async function salvar() {
    if (!estabelecimento.trim() || !pessoaId) return;
    const normalizado = normalizarEstabelecimento(estabelecimento);
    await db.dicionarioEstabelecimentos.add({
      id: novoId(),
      estabelecimentoChave: chaveEstabelecimento(normalizado),
      estabelecimentoExemplo: normalizado,
      cartaoId: cartaoId === 'global' ? '' : cartaoId,
      pessoaId,
      projetoId: projetoId || undefined,
      descricaoSugerida: descricaoSugerida.trim() || undefined,
      atualizadoEm: agora(),
    });
    onDone();
  }

  return (
    <Card className="flex flex-col gap-3">
      <Field label="Cartão">
        <Select value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}>
          <option value="global">Global (qualquer cartão)</option>
          {cartoes?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.apelido} (final {c.final})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Nome do estabelecimento (como aparece na fatura)">
        <TextInput value={estabelecimento} onChange={(e) => setEstabelecimento(e.target.value)} />
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
      <Field label="Projeto (opcional)">
        <Select value={projetoId} onChange={(e) => setProjetoId(e.target.value)}>
          <option value="">Nenhum</option>
          {projetos?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Descrição sugerida (opcional)">
        <TextInput
          value={descricaoSugerida}
          onChange={(e) => setDescricaoSugerida(e.target.value)}
          placeholder="Ex: Notion"
        />
      </Field>
      <div className="flex gap-2">
        <Button onClick={salvar}>Salvar</Button>
        <Button variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}

export function DicionarioPage() {
  const entradas = useLiveQuery(() => db.dicionarioEstabelecimentos.toArray(), []);
  const cartoes = useLiveQuery(() => db.cartoes.toArray(), []);
  const pessoas = useLiveQuery(() => db.pessoas.toArray(), []);
  const projetos = useLiveQuery(() => db.projetos.toArray(), []);
  const [novaAberta, setNovaAberta] = useState(false);

  function nomeCartao(id: string) {
    if (!id) return 'Global';
    const cartao = cartoes?.find((c) => c.id === id);
    return cartao ? `${cartao.apelido} (final ${cartao.final})` : 'Cartão removido';
  }

  async function atualizar(id: string, alteracoes: { pessoaId?: string; projetoId?: string; descricaoSugerida?: string }) {
    await db.dicionarioEstabelecimentos.update(id, { ...alteracoes, atualizadoEm: agora() });
  }

  async function remover(id: string) {
    await db.dicionarioEstabelecimentos.delete(id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Dicionário de estabelecimentos</h2>
        <Button onClick={() => setNovaAberta(true)}>+ Nova</Button>
      </div>

      {novaAberta && <FormNovaEntrada onDone={() => setNovaAberta(false)} />}

      {entradas?.length === 0 && !novaAberta && (
        <EmptyState>
          O dicionário é preenchido automaticamente conforme você importa e classifica faturas. Você também pode
          adicionar entradas manualmente aqui.
        </EmptyState>
      )}

      <div className="flex flex-col gap-2">
        {entradas?.map((entrada) => (
          <Card key={entrada.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{entrada.estabelecimentoExemplo}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{nomeCartao(entrada.cartaoId)}</p>
              </div>
              <button className="text-xs text-red-600 underline" onClick={() => remover(entrada.id)}>
                Remover
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              <Select value={entrada.pessoaId} onChange={(e) => atualizar(entrada.id, { pessoaId: e.target.value })}>
                {pessoas?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
              <Select
                value={entrada.projetoId ?? ''}
                onChange={(e) => atualizar(entrada.id, { projetoId: e.target.value || undefined })}
              >
                <option value="">Sem projeto</option>
                {projetos?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
              <TextInput
                placeholder="Descrição sugerida (opcional)"
                value={entrada.descricaoSugerida ?? ''}
                onChange={(e) => atualizar(entrada.id, { descricaoSugerida: e.target.value || undefined })}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
