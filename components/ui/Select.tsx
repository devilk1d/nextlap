export type SelectOption = { value: string; label: string; group?: string };

type Props = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  maxWidth?: number;
};

/** Native select with optional option groups, styled to match the dashboard. */
export function Select({ value, options, onChange, maxWidth = 220 }: Props) {
  const groups = [...new Set(options.map((option) => option.group ?? ""))];
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{ maxWidth }}
      className="cursor-pointer rounded-[7px] border border-control bg-raised px-2 py-[5px] font-[inherit] text-[12px] text-ink"
    >
      {groups.map((group) => {
        const items = options.filter((option) => (option.group ?? "") === group);
        const rendered = items.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ));
        return group ? (
          <optgroup key={group} label={group}>
            {rendered}
          </optgroup>
        ) : (
          rendered
        );
      })}
    </select>
  );
}
