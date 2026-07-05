import { useState } from 'react';
import { db } from '../../db/db';
import { Button, Card } from '../../components/ui';
import type { BackupFile } from '../../db/types';

const NOMES_TABELAS = [
  'pessoas',
  'contas',
  'cartoes',
  'lancamentosManuais',
  'faturas',
  'lancamentosFatura',
  'dicionarioEstabelecimentos',
] as const;

async function exportarBackup(): Promise<BackupFile> {
  const [pessoas, contas, cartoes, lancamentosManuais, faturas, lancamentosFatura, dicionarioEstabelecimentos] =
    await Promise.all(NOMES_TABELAS.map((nome) => db.table(nome).toArray()));

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      pessoas,
      contas,
      cartoes,
      lancamentosManuais,
      faturas,
      lancamentosFatura,
      dicionarioEstabelecimentos,
    },
  };
}

/** Mescla por id: registro importado só sobrescreve o local se for mais recente (atualizadoEm). */
async function mesclarBackup(backup: BackupFile): Promise<void> {
  await db.transaction('rw', NOMES_TABELAS.map((n) => db.table(n)), async () => {
    for (const nomeTabela of NOMES_TABELAS) {
      const tabela = db.table(nomeTabela);
      const registrosImportados = backup.tables[nomeTabela] as Array<{ id: string; atualizadoEm?: string }>;
      for (const registro of registrosImportados) {
        const existente = await tabela.get(registro.id);
        if (!existente) {
          await tabela.add(registro);
          continue;
        }
        const dataImportado = registro.atualizadoEm ?? '';
        const dataExistente = existente.atualizadoEm ?? '';
        if (dataImportado > dataExistente) {
          await tabela.put(registro);
        }
      }
    }
  });
}

export function BackupPage() {
  const [status, setStatus] = useState('');
  const [processando, setProcessando] = useState(false);

  async function handleExportar() {
    const backup = await exportarBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `faturaapp-backup-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Backup exportado.');
  }

  async function handleImportar(file: File) {
    setProcessando(true);
    setStatus('');
    try {
      const texto = await file.text();
      const backup = JSON.parse(texto) as BackupFile;
      if (backup.version !== 1 || !backup.tables) {
        throw new Error('Arquivo de backup inválido.');
      }
      await mesclarBackup(backup);
      setStatus('Backup importado e mesclado com sucesso.');
    } catch (e) {
      setStatus(e instanceof Error ? `Erro: ${e.message}` : 'Erro ao importar backup.');
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Backup e Restauração</h2>

      <Card className="flex flex-col gap-2">
        <p className="text-sm font-medium">Exportar</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Gera um arquivo .json com todos os seus dados, para guardar ou transferir para outro dispositivo.
        </p>
        <Button onClick={handleExportar}>Exportar backup</Button>
      </Card>

      <Card className="flex flex-col gap-2">
        <p className="text-sm font-medium">Importar / Mesclar</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Importa um arquivo .json exportado deste app. Os dados são mesclados com o que já existe neste dispositivo
          (o registro mais recente de cada item prevalece); nada é apagado.
        </p>
        <input
          type="file"
          accept="application/json"
          disabled={processando}
          onChange={(e) => e.target.files?.[0] && handleImportar(e.target.files[0])}
          className="text-sm"
        />
      </Card>

      {status && <p className="text-sm">{status}</p>}
    </div>
  );
}
