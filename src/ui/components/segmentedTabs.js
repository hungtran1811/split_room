export function renderSegmentedTabs({
  tabs = [],
  activeId = "",
  ariaLabel = "Chuyển tab",
} = {}) {
  if (!tabs.length) return "";

  return `
    <div class="segmented-tabs" role="tablist" aria-label="${ariaLabel}">
      ${tabs
        .map((tab) => {
          const active = tab.id === activeId;
          return `
            <button
              type="button"
              class="segmented-tabs__item ${active ? "is-active" : ""}"
              role="tab"
              aria-selected="${active ? "true" : "false"}"
              data-segmented-tab="${tab.id}"
            >
              ${tab.label}
              ${tab.badge ? `<span class="segmented-tabs__badge">${tab.badge}</span>` : ""}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

export function bindSegmentedTabs(container, { onChange } = {}) {
  if (!container) return;

  container.querySelectorAll("[data-segmented-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.getAttribute("data-segmented-tab");
      if (typeof onChange === "function") {
        onChange(tabId);
      }
    });
  });
}
