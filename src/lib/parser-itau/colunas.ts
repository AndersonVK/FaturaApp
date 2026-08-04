export interface ItemPosicionado {
  texto: string;
  x: number;
  y: number;
  largura: number;
}

const RE_DATA_TABELA = /^\d{2}\/\d{2}$/;

/**
 * Detecta o x que separa as duas colunas de lançamentos da página.
 *
 * Um corte fixo (ex: 60% da largura) não serve porque o Itaú tem mais de um
 * layout: no antigo a coluna direita começa em x≈367, no novo (cartão Azul)
 * começa em x≈351 - abaixo dos 60% (≈357), o que fazia a data da coluna
 * direita ser agrupada na linha da esquerda e corrompia tanto os lançamentos
 * quanto os rodapés ("Lançamentos no cartão -0,14 01/07").
 *
 * Em vez de adivinhar, ancoramos na estrutura da própria tabela: a coluna
 * direita sempre começa pelo cabeçalho "DATA" ou por uma data "DD/MM". O corte
 * fica no meio da calha entre o fim do conteúdo da esquerda e esse início.
 */
export function detectarCorteColunas(itens: ItemPosicionado[], larguraPagina: number): number {
  const corteFallback = larguraPagina * 0.6;

  const ancorasDireita = itens
    .filter((it) => {
      const t = it.texto.trim();
      return t === 'DATA' || RE_DATA_TABELA.test(t);
    })
    .map((it) => it.x)
    .filter((x) => x > larguraPagina * 0.45);

  // Página sem tabela na coluna direita (ex: capa/boleto): mantém o corte
  // fixo antigo, que já separava corretamente esse conteúdo.
  if (ancorasDireita.length === 0) return corteFallback;

  const inicioDireita = Math.min(...ancorasDireita);

  // Os marcadores de uma letra do resumo ("P", "S", "L", "=") são desenhados
  // dentro da calha, à esquerda do texto da coluna direita. Se entrassem na
  // conta empurrariam o corte para depois deles, e o marcador acabaria colado
  // na linha da esquerda (ex: "20/07 MADEIREIRA SAO JOSEBRAS 27,80 L", que
  // deixa de ser reconhecida como lançamento). Por isso ignoramos glifos
  // estreitos ao medir onde termina a coluna esquerda.
  const LARGURA_MINIMA_CONTEUDO = 6;
  let fimEsquerda = 0;
  for (const it of itens) {
    if (it.largura < LARGURA_MINIMA_CONTEUDO) continue;
    const fim = it.x + it.largura;
    if (fim <= inicioDireita) fimEsquerda = Math.max(fimEsquerda, fim);
  }

  if (fimEsquerda <= 0 || fimEsquerda >= inicioDireita) return inicioDireita - 1;
  return (fimEsquerda + inicioDireita) / 2;
}
