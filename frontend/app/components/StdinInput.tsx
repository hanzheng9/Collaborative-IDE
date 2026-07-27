type StdinInputProps = {
  onChange: (value: string) => void;
  value: string;
};

export function StdinInput({ onChange, value }: StdinInputProps) {
  return (
    <textarea
      aria-label="Standard input"
      className="stdinInput"
      placeholder="Optional standard input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
