import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, novoId, agora } from '../../db/db';
import { Button, Card, EmptyState, Field, TextInput } from '../../components/ui';

function FormNovaConta({ onDone }: { onDone: () => void }) {
  const [apelido, setApelido] = useState('');
  const [diaVencimento, setDiaVencimento] = useState('');

  async function salvar() {
    if (!apelido.trim()) return;
    await db.contas.add({
      id: novoId(),
      apelido: apelido.trim(),
      diaVencimento: diaVencimento ? Number(diaVencimento) : undefined,
      ativo: true,
      atualizadoEm: agora(),
    });
    onDone();
  }

  return (
    <Card className="flex flex-col gap-3">
      <Field label="Apelido da conta">
        <TextInput value={apelido} onChange={(e) => setApelido(e.target.value)} placeholder="Ex: Itaú Personnalité" autoFocus />
      </Field>
      <Field label="Dia de vencimento (opcional)">
        <TextInput
          type="number"
          min={1}
          max={31}
          value={diaVencimento}
          onChange={(e) => setDiaVencimento(e.target.value)}
          placeholder="Ex: 6"
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

function FormNovoCartao({ contaId, onDone }: { contaId: string; onDone: () => void }) {
  const [apelido, setApelido] = useState('');
  const [final, setFinal] = useState('');
  const [titularNome, setTitularNome] = useState('');

  async function salvar() {
    if (!apelido.trim() || !/^\d{3,4}$/.test(final.trim())) return;
    await db.cartoes.add({
      id: novoId(),
      contaId,
      apelido: apelido.trim(),
      final: final.trim(),
      titularNome: titularNome.trim().toUpperCase(),
      ativo: true,
      atualizadoEm: agora(),
    });
    onDone();
  }

  return (
    <Card className="flex flex-col gap-3">
      <Field label="Apelido do cartão">
        <TextInput value={apelido} onChange={(e) => setApelido(e.target.value)} placeholder="Ex: Cartão Anderson" autoFocus />
      </Field>
      <Field label="Final (últimos 3-4 dígitos, como aparece na fatura)">
        <TextInput value={final} onChange={(e) => setFinal(e.target.value.replace(/\D/g, ''))} placeholder="Ex: 7898" />
      </Field>
      <Field label="Nome do titular impresso na fatura">
        <TextInput value={titularNome} onChange={(e) => setTitularNome(e.target.value)} placeholder="Ex: ANDERSON KUBA" />
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

export function CartoesPage() {
  const contas = useLiveQuery(() => db.contas.toArray(), []);
  const cartoes = useLiveQuery(() => db.cartoes.toArray(), []);
  const [novaContaAberta, setNovaContaAberta] = useState(false);
  const [novoCartaoContaId, setNovoCartaoContaId] = useState<string | null>(null);

  async function alternarAtivoConta(id: string, ativo: boolean) {
    await db.contas.update(id, { ativo: !ativo, atualizadoEm: agora() });
  }

  async function alternarAtivoCartao(id: string, ativo: boolean) {
    await db.cartoes.update(id, { ativo: !ativo, atualizadoEm: agora() });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Contas e Cartões</h2>
        <Button onClick={() => setNovaContaAberta(true)}>+ Conta</Button>
      </div>

      {novaContaAberta && <FormNovaConta onDone={() => setNovaContaAberta(false)} />}

      {contas?.length === 0 && !novaContaAberta && (
        <EmptyState>Nenhuma conta cadastrada. Adicione sua primeira conta Itaú.</EmptyState>
      )}

      {contas?.map((conta) => {
        const cartoesDaConta = cartoes?.filter((c) => c.contaId === conta.id) ?? [];
        return (
          <Card key={conta.id} className={!conta.ativo ? 'opacity-50' : ''}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{conta.apelido}</p>
                {conta.diaVencimento && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Vencimento: dia {conta.diaVencimento}</p>
                )}
              </div>
              <button
                className="text-xs text-slate-500 underline dark:text-slate-400"
                onClick={() => alternarAtivoConta(conta.id, conta.ativo)}
              >
                {conta.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              {cartoesDaConta.map((cartao) => (
                <div
                  key={cartao.id}
                  className={`flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800 ${!cartao.ativo ? 'opacity-50' : ''}`}
                >
                  <div>
                    <p className="text-sm font-medium">{cartao.apelido}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      final {cartao.final} · {cartao.titularNome}
                    </p>
                  </div>
                  <button
                    className="text-xs text-slate-500 underline dark:text-slate-400"
                    onClick={() => alternarAtivoCartao(cartao.id, cartao.ativo)}
                  >
                    {cartao.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              ))}

              {novoCartaoContaId === conta.id ? (
                <FormNovoCartao contaId={conta.id} onDone={() => setNovoCartaoContaId(null)} />
              ) : (
                <button
                  className="text-left text-sm font-medium text-brand-600 dark:text-brand-500"
                  onClick={() => setNovoCartaoContaId(conta.id)}
                >
                  + Novo cartão final
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
