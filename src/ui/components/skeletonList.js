export function renderSkeletonList({ count = 3 } = {}) {
  return `
    <div class="skeleton-list" aria-hidden="true">
      ${Array.from({ length: count })
        .map(
          () => `
            <div class="skeleton-list__item">
              <div class="skeleton-card__line skeleton-card__line--title"></div>
              <div class="skeleton-card__line"></div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}
