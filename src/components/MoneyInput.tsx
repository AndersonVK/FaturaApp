import { useState, useEffect } from 'react';
import { TextInput } from './ui';

function centavosParaTexto(centavos: number | null): string {
  if (centavos === null || Number.isNaN(centavos)) return '';
  return (centavos / 100).toFixed(2).replace('.', ',');
}

function textoParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(',', '.');
  if (limpo === '' || limpo === '-') return null;
  const valor = Number(limpo);
  if (Number.isNaN(valor)) return null;
  return Math.round(valor * 100);
}

export function MoneyInput({
  valorCentavos,
  onChange,
  placeholder = '0,00',
}: {
  valorCentavos: number | null;
  onChange: (centavos: number | null) => void;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState(centavosParaTexto(valorCentavos));

  useEffect(() => {
    setTexto(centavosParaTexto(valorCentavos));
  }, [valorCentavos]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span>
      <TextInput
        inputMode="decimal"
        placeholder={placeholder}
        className="pl-9"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => onChange(textoParaCentavos(texto))}
      />
    </div>
  );
}
