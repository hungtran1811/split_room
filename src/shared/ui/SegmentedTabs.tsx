export type SegmentedTab = {
  id: string;
  label: string;
  badge?: string | number;
};

type SegmentedTabsProps = {
  tabs: SegmentedTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
};

export function SegmentedTabs({
  tabs,
  value,
  onChange,
  ariaLabel = "Chuyển tab",
}: SegmentedTabsProps) {
  if (!tabs.length) return null;

  return (
    <div className="segmented-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`segmented-tabs__item ${active ? "is-active" : ""}`.trim()}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.badge ? <span className="segmented-tabs__badge">{tab.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
