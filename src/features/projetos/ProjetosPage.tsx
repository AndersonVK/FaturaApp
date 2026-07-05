import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, novoId, agora } from '../../db/db';
import { Button, Card, EmptyState, TextInput } from '../../components/ui';

export function ProjetosPage() {
  const projetos = useLiveQuery(() => db.projetos.toArray(), []);
  const [novoNome, setNovoNome] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');

  async function adicionar() {
    const nome = novoNome.trim();
    if (!nome) return;
    await db.projetos.add({ id: novoId(), nome, ativo: true, criadoEm: agora(), atualizadoEm: agora() });
    setNovoNome('');
  }

  async function salvarEdicao(id: string) {
    const nome = nomeEditado.trim();
    if (!nome) return;
    await db.projetos.update(id, { nome, atualizadoEm: agora() });
    setEditandoId(null);
  }

  async function alternarAtivo(id: string, ativo: boolean) {
    await db.projetos.update(id, { ativo: !ativo, atualizadoEm: agora() });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Projetos</h2>

      <Card className="flex gap-2">
        <TextInput
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
          placeholder="Nome do projeto"
          className="flex-1"
        />
        <Button onClick={adicionar}>Adicionar</Button>
      </Card>

      {projetos?.length === 0 && <EmptyState>Nenhum projeto cadastrado ainda.</EmptyState>}

      <div className="flex flex-col gap-2">
        {projetos?.map((projeto) => (
          <Card key={projeto.id} className={`flex items-center justify-between ${!projeto.ativo ? 'opacity-50' : ''}`}>
            {editandoId === projeto.id ? (
              <div className="flex flex-1 gap-2">
                <TextInput
                  value={nomeEditado}
                  onChange={(e) => setNomeEditado(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && salvarEdicao(projeto.id)}
                  className="flex-1"
                  autoFocus
                />
                <Button onClick={() => salvarEdicao(projeto.id)}>Salvar</Button>
              </div>
            ) : (
              <>
                <button
                  className="flex-1 text-left font-medium"
                  onClick={() => {
                    setEditandoId(projeto.id);
                    setNomeEditado(projeto.nome);
                  }}
                >
                  {projeto.nome}
                </button>
                <button
                  className="text-xs text-slate-500 underline dark:text-slate-400"
                  onClick={() => alternarAtivo(projeto.id, projeto.ativo)}
                >
                  {projeto.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
