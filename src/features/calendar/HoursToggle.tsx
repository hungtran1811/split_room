import { Button } from "../../shared/ui/Button";

export function HoursToggle({
  showAllHours,
  outsideCount,
  onToggle,
}: {
  showAllHours: boolean;
  outsideCount: number;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="ghost"
      className={`btn--sm cal-hours-toggle ${outsideCount && !showAllHours ? "has-hidden" : ""}`.trim()}
      aria-pressed={showAllHours}
      aria-label={showAllHours ? "Thu gọn khung 6 giờ đến 22 giờ" : "Hiện đủ các khung giờ đang ẩn"}
      onClick={onToggle}
    >
      {showAllHours ? "6–22h" : "Cả ngày"}
      {!showAllHours && outsideCount > 0 ? (
        <span className="cal-hours-toggle__badge">{outsideCount}</span>
      ) : null}
    </Button>
  );
}
