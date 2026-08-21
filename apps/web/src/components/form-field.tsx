interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoFocus?: boolean;
  required?: boolean;
}

export function FormField({ label, value, onChange, type = 'text', autoFocus, required = true }: FormFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm text-text">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        required={required}
        className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text outline-none focus:border-accent"
      />
    </label>
  );
}
