import { formatVND } from "../../config/i18n";
import { renderProgressRing } from "../components/progressRing";

export function renderRentCollectionRing({
  collected = 0,
  expectedCollection = 0,
  size = 96,
  stroke = 9,
} = {}) {
  const percent =
    expectedCollection <= 0
      ? 0
      : Math.min(100, (collected / expectedCollection) * 100);

  return renderProgressRing({
    percent,
    label: "Đã thu",
    sublabel: `${formatVND(collected)} / ${formatVND(expectedCollection)}`,
    size,
    stroke,
  });
}
