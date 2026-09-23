export function SettingsBlock({
  id,
  title,
  description,
  aside,
  children,
}: {
  id: string;
  title: string;
  description: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-settings-section={id}
      className="scroll-mt-32 lg:scroll-mt-24 rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-[0_1px_2px_rgba(25,28,29,0.04)] sm:p-7"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-on-surface">{title}</h2>
          <p className="mt-0.5 max-w-xl text-sm text-on-surface-variant">{description}</p>
        </div>
        {aside ? <div className="shrink-0 sm:pt-1">{aside}</div> : null}
      </div>
      <div className="mt-6 flex flex-col gap-4">{children}</div>
    </section>
  );
}
