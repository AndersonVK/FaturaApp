/** Converte um valor no formato brasileiro ("1.318,82", "- 236,36", "-0,04") para centavos (inteiro). */
export function parseValorBRParaCentavos(texto: string): number {
  const limpo = texto.trim();
  const negativo = /^-/.test(limpo.replace(/\s/g, ''));
  const somenteNumeros = limpo.replace(/[^\d,]/g, '');
  const [inteiroStr, centavosStr = '00'] = somenteNumeros.split(',');
  const inteiro = Number(inteiroStr || '0');
  const centavos = Number((centavosStr + '00').slice(0, 2));
  const total = inteiro * 100 + centavos;
  return negativo ? -total : total;
}

export function formatCentavos(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const inteiro = Math.floor(abs / 100);
  const centavosParte = (abs % 100).toString().padStart(2, '0');
  const inteiroFormatado = inteiro.toLocaleString('pt-BR');
  return `${negativo ? '-' : ''}R$ ${inteiroFormatado},${centavosParte}`;
}

export function centavosParaReais(centavos: number): number {
  return centavos / 100;
}

export function reaisParaCentavos(reais: number): number {
  return Math.round(reais * 100);
}
