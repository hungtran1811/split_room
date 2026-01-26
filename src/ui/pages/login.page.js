import {
  loginWithGoogle,
  handleRedirectResult,
} from "../../services/auth.service";

function el(id) {
  return document.getElementById(id);
}

export function renderLoginPage({ onDone }) {
  const app = document.querySelector("#app");

  // Handle Google redirect login (mobile)
  handleRedirectResult()
    .then((user) => {
      if (user) onDone?.();
    })
    .catch(() => {});

  app.innerHTML = `
    <div class="container py-5" style="max-width: 520px;">
      <div class="text-center mb-4">
        <h1 class="h4 mb-2">Split Room</h1>
        <p class="text-secondary mb-0">P102</p>
      </div>

      <div class="card">
        <div class="card-body p-4">
          <div class="d-grid gap-2">
            <button id="btnGoogle" class="btn btn-outline-dark d-flex align-items-center justify-content-center gap-2" style="height: 44px;">
              <span class="d-inline-flex" aria-hidden="true">
                <!-- Google "G" icon (SVG) -->
                <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.23 3.6l6.9-6.9C35.9 2.35 30.38 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.02 6.23C12.43 13.24 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.14-3.08-.4-4.55H24v9.02h12.95c-.56 3.01-2.24 5.56-4.76 7.27l7.28 5.64c4.26-3.94 6.71-9.75 6.71-17.38z"/>
                  <path fill="#FBBC05" d="M10.58 28.45c-.48-1.45-.76-2.99-.76-4.45s.28-3 .76-4.45l-8.02-6.23C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.68l8.02-6.23z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.9-5.8l-7.28-5.64c-2.02 1.36-4.6 2.16-8.62 2.16-6.26 0-11.57-3.74-13.42-8.95l-8.02 6.23C6.51 42.62 14.62 48 24 48z"/>
                </svg>
              </span>
              <span>Đăng nhập với Google</span>
            </button>
          </div>

          <div id="msg" class="small mt-3 text-danger" style="min-height: 18px;"></div>

          <div class="small text-secondary mt-3">
            * Chỉ các email trong nhóm mới đăng nhập được.
          </div>
        </div>
      </div>
    </div>
  `;

  const msg = (t = "") => (el("msg").textContent = t);

  el("btnGoogle").onclick = async () => {
    msg("");
    try {
      await loginWithGoogle();
      // Desktop popup sẽ vào ngay, mobile redirect sẽ xử lý ở handleRedirectResult()
      onDone?.();
    } catch (e) {
      msg(e?.message || "Google sign-in failed.");
    }
  };
}
