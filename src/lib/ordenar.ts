/**
 * Ordena listas de seleção (Pessoas, Projetos) por nome, em português: o
 * localeCompare com sensitivity 'base' trata acentos e maiúsculas/minúsculas
 * como equivalentes, então "Água" e "agua" ficam juntos onde o usuário espera.
 */
export function ordenarPorNome<T extends { nome: string }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}
