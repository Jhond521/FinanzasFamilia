import { useEffect, useState, type ChangeEvent } from 'react';
import { formatAmountDisplay, sanitizeAmountInput } from './lib/money';

type CurrencyInputProps = {
  /** Monto como string decimal (lo que viaja hacia/desde la API), ej. "11439100.5" o "". */
  value: string;
  onChange: (rawValue: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** 'large' = display tipo calculadora, centrado y grande (pantalla de registro rapido). */
  variant?: 'default' | 'large';
};

export function CurrencyInput({
  value,
  onChange,
  disabled,
  placeholder = '0',
  className = '',
  variant = 'default',
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(() => formatAmountDisplay(value));
  const isLarge = variant === 'large';

  useEffect(() => {
    setDisplay(formatAmountDisplay(value));
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const sanitized = sanitizeAmountInput(e.target.value);
    setDisplay(formatAmountDisplay(sanitized));
    onChange(sanitized);
  }

  return (
    <div className={`relative ${isLarge ? 'border-b-2 border-brand' : ''}`}>
      <span
        className={`pointer-events-none absolute inset-y-0 flex items-center text-ink-muted ${
          isLarge ? 'left-4 text-2xl font-bold' : 'left-3'
        }`}
      >
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        className={
          isLarge
            ? `w-full rounded-lg border-0 bg-transparent py-2 pl-10 pr-4 text-center text-5xl font-extrabold tracking-tight text-ink focus:outline-none ${className}`
            : `rounded-lg border border-line py-2 pl-6 pr-3 text-right text-ink focus:border-brand focus:outline-none ${className}`
        }
        value={display}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
}
