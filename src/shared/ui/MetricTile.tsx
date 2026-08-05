export type MetricTone = "neutral" | "positive" | "warning" | "danger";

type MetricTileProps = {
  label: string;
  value: ReactValue;
  hint?: string;
  tone?: MetricTone;
};

type ReactValue = string | number;

export function MetricTile({ label, value, hint, tone = "neutral" }: MetricTileProps) {
  return (
    <article className={`metric-tile metric-tile--${tone}`}>
      <div className="metric-tile__label">{label}</div>
      <div className="metric-tile__value">{value}</div>
      {/* Luôn giữ hàng hint để các card trong cùng hàng căn value thẳng hàng. */}
      <div className={`metric-tile__hint${hint ? "" : " metric-tile__hint--empty"}`}>
        {hint || "\u00A0"}
      </div>
    </article>
  );
}

type MetricGridProps = {
  tiles: Array<MetricTileProps & { key?: string }>;
  columns?: number;
};

export function MetricGrid({ tiles, columns = 4 }: MetricGridProps) {
  return (
    <section className={`metric-grid metric-grid--${columns}`}>
      {tiles.map((tile, index) => (
        <MetricTile key={tile.key ?? index} {...tile} />
      ))}
    </section>
  );
}
