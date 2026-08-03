import { useEffect, useState, type ChangeEvent } from 'react';
import { formatAmountDisplay, sanitizeAmountInput } from './lib/money';

type CurrencyInputProps = {
  /** Monto como string decimal (lo que viaja hacia/desde la API), ej. "11439100.5" o "". */
  value: string;
  onChange: (rawValue: string) => void;
  /** Se dispara al perder el foco — util para confirmar/guardar el valor (ej. PUT al salir del campo). */
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** 'large' = display tipo calculadora, centrado y grande (pantalla de registro rapido). */
  variant?: 'default' | 'large';
  /** Permite un "-" inicial (ej. items de tarjeta que admiten devoluciones/cancelaciones). */
  allowNegative?: boolean;
  /** Nombre accesible del campo cuando no hay un <label> visible asociado (ej. el monto grande
   * de registro rapido, que por diseño no lleva texto de label encima). */
  ariaLabel?: string;
  autoFocus?: boolean;
};

export function CurrencyInput({
  value,
  onChange,
  onBlur,
  disabled,
  placeholder = '0',
  className = '',
  variant = 'default',
  allowNegative = false,
  ariaLabel,
  autoFocus,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(() => formatAmountDisplay(value));
  const isLarge = variant === 'large';

  useEffect(() => {
    setDisplay(formatAmountDisplay(value));
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const sanitized = sanitizeAmountInput(e.target.value, allowNegative);
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
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
      />
    </div>
  );
}
