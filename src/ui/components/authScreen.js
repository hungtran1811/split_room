const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.23 3.6l6.9-6.9C35.9 2.35 30.38 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.02 6.23C12.43 13.24 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.14-3.08-.4-4.55H24v9.02h12.95c-.56 3.01-2.24 5.56-4.76 7.27l7.28 5.64c4.26-3.94 6.71-9.75 6.71-17.38z"/>
  <path fill="#FBBC05" d="M10.58 28.45c-.48-1.45-.76-2.99-.76-4.45s.28-3 .76-4.45l-8.02-6.23C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.68l8.02-6.23z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.9-5.8l-7.28-5.64c-2.02 1.36-4.6 2.16-8.62 2.16-6.26 0-11.57-3.74-13.42-8.95l-8.02 6.23C6.51 42.62 14.62 48 24 48z"/>
</svg>`;

function renderBrand() {
  return `
    <div class="auth-screen__brand">
      <div class="auth-screen__logo" aria-hidden="true">SR</div>
      <h1 class="auth-screen__title">Split Room</h1>
      <p class="auth-screen__subtitle">P102</p>
    </div>
  `;
}

function renderBootContent({
  title = "Đang tải...",
  subtitle = "Vui lòng chờ trong giây lát",
} = {}) {
  return `
    <div class="auth-screen__boot">
      <div class="auth-screen__spinner" role="status" aria-label="Loading"></div>
      <div>
        <div class="auth-screen__boot-title">${title}</div>
        <div class="auth-screen__boot-sub">${subtitle}</div>
      </div>
    </div>
  `;
}

function renderLoginContent() {
  return `
    <button type="button" id="btnGoogle" class="auth-screen__google">
      ${GOOGLE_ICON}
      <span>Đăng nhập với Google</span>
    </button>
    <div id="msg" class="auth-screen__error"></div>
  `;
}

export function renderAuthScreen({
  variant = "login",
  content = "",
  bootTitle = "Đang tải...",
  bootSubtitle = "Vui lòng chờ trong giây lát",
} = {}) {
  const inner =
    content ||
    (variant === "boot"
      ? renderBootContent({ title: bootTitle, subtitle: bootSubtitle })
      : renderLoginContent());

  return `
    <div class="auth-screen">
      <div class="auth-screen__mesh" aria-hidden="true"></div>
      <div class="auth-screen__panel">
        ${renderBrand()}
        <div class="auth-screen__card">
          <div class="auth-screen__stack">${inner}</div>
        </div>
      </div>
    </div>
  `;
}
