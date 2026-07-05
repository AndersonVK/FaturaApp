import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, novoId, agora } from '../../db/db';
import { Button, Card, EmptyState, TextInput } from '../../components/ui';

export function PessoasPage() {
  const pessoas = useLiveQuery(() => db.pessoas.toArray(), []);
  const [novoNome, setNovoNome] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');

  async function adicionar() {
    const nome = novoNome.trim();
    if (!nome) return;
    await db.pessoas.add({ id: novoId(), nome, ativo: true, criadoEm: agora(), atualizadoEm: agora() });
    setNovoNome('');
  }

  async function salvarEdicao(id: string) {
    const nome = nomeEditado.trim();
    if (!nome) return;
    await db.pessoas.update(id, { nome, atualizadoEm: agora() });
    setEditandoId(null);
  }

  async function alternarAtivo(id: string, ativo: boolean) {
    await db.pessoas.update(id, { ativo: !ativo, atualizadoEm: agora() });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Pessoas</h2>

      <Card className="flex gap-2">
        <TextInput
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
          placeholder="Nome da pessoa/empresa"
          className="flex-1"
        />
        <Button onClick={adicionar}>Adicionar</Button>
      </Card>

      {pessoas?.length === 0 && <EmptyState>Nenhuma pessoa cadastrada ainda.</EmptyState>}

      <div className="flex flex-col gap-2">
        {pessoas?.map((pessoa) => (
          <Card key={pessoa.id} className={`flex items-center justify-between ${!pessoa.ativo ? 'opacity-50' : ''}`}>
            {editandoId === pessoa.id ? (
              <div className="flex flex-1 gap-2">
                <TextInput
                  value={nomeEditado}
                  onChange={(e) => setNomeEditado(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && salvarEdicao(pessoa.id)}
                  className="flex-1"
                  autoFocus
                />
                <Button onClick={() => salvarEdicao(pessoa.id)}>Salvar</Button>
              </div>
            ) : (
              <>
                <button
                  className="flex-1 text-left font-medium"
                  onClick={() => {
                    setEditandoId(pessoa.id);
                    setNomeEditado(pessoa.nome);
                  }}
                >
                  {pessoa.nome}
                </button>
                <button
                  className="text-xs text-slate-500 underline dark:text-slate-400"
                  onClick={() => alternarAtivo(pessoa.id, pessoa.ativo)}
                >
                  {pessoa.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
