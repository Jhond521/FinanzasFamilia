import { useEffect, useState, type ChangeEvent } from 'react';
import { formatThousands, toIntegerDigits } from './lib/money';

type CurrencyInputProps = {
  /** Monto en pesos enteros como string decimal (lo que viaja hacia/desde la API), ej. "11439100" o "". */
  value: string;
  onChange: (rawValue: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export function CurrencyInput({ value, onChange, disabled, placeholder = '0', className = '' }: CurrencyInputProps) {
  const [display, setDisplay] = useState(() => formatThousands(toIntegerDigits(value)));

  useEffect(() => {
    setDisplay(formatThousands(toIntegerDigits(value)));
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '');
    setDisplay(formatThousands(digits));
    onChange(digits);
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">$</span>
      <input
        type="text"
        inputMode="numeric"
        className={`rounded-lg border border-slate-300 py-2 pl-6 pr-10 text-right ${className}`}
        value={display}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
      />
      {/* los centavos nunca se editan aqui (ver toIntegerDigits) — se muestran fijos para que
          el monto se lea con el mismo formato de dos decimales que el resto de la app */}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">,00</span>
    </div>
  );
}
