import { renderSkeletonStatGrid } from "../components/skeletonCard";
import { renderSkeletonList } from "../components/skeletonList";

export function renderDashboardLoading() {
  return `
    <div class="skeleton-card skeleton-card--stat"></div>
    ${renderSkeletonStatGrid()}
    ${renderSkeletonList({ count: 2 })}
  `;
}
