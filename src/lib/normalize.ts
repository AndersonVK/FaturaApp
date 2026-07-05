/**
 * O Itaú embute o número da parcela ("0X/0Y") no fim do texto do estabelecimento,
 * às vezes colado sem espaço (ex: "CAMPESTRINI COMPAN09/10"). Quando há parcela,
 * o nome do estabelecimento também costuma vir truncado para caber na coluna
 * (ex: "CAMPEAO DA CONSTRU02/03" vs. a mesma loja sem parcela: "CAMPEAO DA CONSTRUCAO").
 * Por isso a normalização/chave de correspondência usa prefixo, não igualdade exata.
 */

const PARCELA_SUFIXO = /(\d{2})\s*\/\s*(\d{2})\s*$/;

export interface EstabelecimentoParcela {
  nomeBruto: string;
  parcelaAtual?: number;
  parcelaTotal?: number;
}

export function extrairParcela(textoEstabelecimento: string): EstabelecimentoParcela {
  const texto = textoEstabelecimento.trim();
  const match = texto.match(PARCELA_SUFIXO);
  if (!match) {
    return { nomeBruto: texto };
  }
  const nomeBruto = texto.slice(0, match.index).trim();
  // Evita falso positivo em nomes que só coincidentemente terminam em "NN/NN"
  // sem nenhum texto antes (linha só teria o número) - nesse caso não é parcela.
  if (nomeBruto.length === 0) {
    return { nomeBruto: texto };
  }
  return {
    nomeBruto,
    parcelaAtual: Number(match[1]),
    parcelaTotal: Number(match[2]),
  };
}

/** Maiúsculas, sem acento, pontuação solta e espaços colapsados. */
export function normalizarEstabelecimento(nomeBruto: string): string {
  return nomeBruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9* ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TAMANHO_CHAVE = 12;

/** Chave curta usada para indexação/matching, tolerante a truncamento de nomes. */
export function chaveEstabelecimento(nomeNormalizado: string): string {
  return nomeNormalizado.slice(0, TAMANHO_CHAVE);
}

/** Compara dois nomes normalizados considerando que um pode ser prefixo truncado do outro. */
export function estabelecimentosCorrespondem(a: string, b: string, tamanhoMinimo = 6): boolean {
  if (a === b) return true;
  if (a.length < tamanhoMinimo || b.length < tamanhoMinimo) return false;
  const [curto, longo] = a.length <= b.length ? [a, b] : [b, a];
  return longo.startsWith(curto);
}
