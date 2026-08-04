export function renderSkeletonCard({ lines = 2 } = {}) {
  return `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-card__line skeleton-card__line--title"></div>
      ${Array.from({ length: lines })
        .map(() => `<div class="skeleton-card__line"></div>`)
        .join("")}
    </div>
  `;
}

export function renderSkeletonStatGrid({ count = 4 } = {}) {
  return `
    <section class="money-grid money-grid--4">
      ${Array.from({ length: count })
        .map(() => `<div class="skeleton-card skeleton-card--stat"></div>`)
        .join("")}
    </section>
  `;
}
