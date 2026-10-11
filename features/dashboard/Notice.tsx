type Action = { label: string; onClick: () => void };

type Props = {
  title: string;
  body: string;
  eyebrow?: string;
  actions?: Action[];
};

/** Centered message that takes the place of a page (wet race, loading, errors). */
export function Notice({ title, body, eyebrow, actions = [] }: Props) {
  return (
    <main className="grid min-h-[420px] place-items-center rounded-xl border border-line bg-stage p-10 [grid-area:main]">
      <div className="max-w-[440px] text-center">
        {eyebrow && (
          <div className="text-[11px] font-bold tracking-[.12em] text-caution">{eyebrow}</div>
        )}
        <div className="mt-3.5 font-display text-[20px]">{title}</div>
        <p className="mx-0 mb-0 mt-3 leading-normal text-ink-dim [text-wrap:pretty]">{body}</p>
        {actions.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {actions.map(({ label, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                className="cursor-pointer rounded-lg border border-[#3a3a41] bg-raised px-3.5 py-2 font-semibold text-ink"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
