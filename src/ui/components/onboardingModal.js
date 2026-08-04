const ONBOARDING_KEY = "splitroom:onboarded";

const STEPS = [
  {
    title: "Xem tổng quan",
    text: "Dashboard cho bạn biết còn nợ bao nhiêu và việc cần làm trong tháng.",
  },
  {
    title: "Ghi chi tiêu",
    text: "Thêm khoản chi chung để cả nhóm cùng theo dõi và chia đều.",
  },
  {
    title: "Ghi cấn trừ",
    text: "Khi ai đó chuyển tiền, ghi nhận trong tab Cấn trừ để số dư luôn đúng.",
  },
];

export function hasCompletedOnboarding() {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === "1";
  } catch {
    return true;
  }
}

export function markOnboardingComplete() {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, "1");
  } catch {
    // Ignore storage failures.
  }
}

export function openOnboardingModal() {
  if (hasCompletedOnboarding()) return;

  let stepIndex = 0;
  const overlay = document.createElement("div");
  overlay.className = "onboarding-modal";
  overlay.innerHTML = `
    <div class="onboarding-modal__backdrop" data-onboarding-close="true"></div>
    <div class="onboarding-modal__panel" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle">
      <div class="onboarding-modal__eyebrow">Chào mừng đến Split Room · P102</div>
      <h2 class="onboarding-modal__title" id="onboardingTitle"></h2>
      <p class="onboarding-modal__text" id="onboardingText"></p>
      <div class="onboarding-modal__dots" id="onboardingDots"></div>
      <div class="onboarding-modal__actions">
        <button type="button" class="btn btn-outline-secondary" id="onboardingSkip">Bỏ qua</button>
        <button type="button" class="btn btn-primary" id="onboardingNext">Tiếp</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add("app-sheet-open");

  const titleEl = overlay.querySelector("#onboardingTitle");
  const textEl = overlay.querySelector("#onboardingText");
  const dotsEl = overlay.querySelector("#onboardingDots");
  const nextButton = overlay.querySelector("#onboardingNext");

  const close = () => {
    markOnboardingComplete();
    overlay.remove();
    document.body.classList.remove("app-sheet-open");
  };

  const renderStep = () => {
    const step = STEPS[stepIndex];
    titleEl.textContent = step.title;
    textEl.textContent = step.text;
    dotsEl.innerHTML = STEPS.map(
      (_, index) =>
        `<span class="onboarding-modal__dot ${index === stepIndex ? "is-active" : ""}"></span>`,
    ).join("");
    nextButton.textContent =
      stepIndex === STEPS.length - 1 ? "Bắt đầu sử dụng" : "Tiếp";
  };

  overlay.querySelector("#onboardingSkip")?.addEventListener("click", close);
  overlay.querySelectorAll("[data-onboarding-close='true']").forEach((node) => {
    node.addEventListener("click", close);
  });
  nextButton?.addEventListener("click", () => {
    if (stepIndex >= STEPS.length - 1) {
      close();
      return;
    }
    stepIndex += 1;
    renderStep();
  });

  renderStep();
}
