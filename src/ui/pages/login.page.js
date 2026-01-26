import {
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
} from "../../services/auth.service";

function el(id) {
  return document.getElementById(id);
}

export function renderLoginPage({ onDone }) {
  const app = document.querySelector("#app");
  app.innerHTML = `
    <div class="container py-5" style="max-width: 520px;">
      <h1 class="h4 mb-3">Split Room</h1>
      <p class="text-secondary mb-4">P102</p>

      <div class="card">
        <div class="card-body">
          <div class="mb-3">
            <label class="form-label">Email</label>
            <input id="email" type="email" class="form-control" placeholder="you@example.com" />
          </div>

          <div class="mb-3">
            <label class="form-label">Password</label>
            <input id="password" type="password" class="form-control" placeholder="••••••••" />
          </div>

          <div class="d-grid gap-2">
            <button id="btnLogin" class="btn btn-primary">Login (Email)</button>
            <button id="btnRegister" class="btn btn-outline-primary">Register (Email)</button>
            <button id="btnGoogle" class="btn btn-outline-dark">Continue with Google</button>
          </div>

          <div id="msg" class="small mt-3 text-danger" style="min-height: 18px;"></div>
        </div>
      </div>
    </div>
  `;

  const msg = (t = "") => (el("msg").textContent = t);

  el("btnLogin").onclick = async () => {
    msg("");
    try {
      const email = el("email").value.trim();
      const password = el("password").value;
      if (!email || !password) return msg("Please enter email and password.");
      await loginWithEmail(email, password);
      onDone?.();
    } catch (e) {
      msg(e?.message || "Login failed.");
    }
  };

  el("btnRegister").onclick = async () => {
    msg("");
    try {
      const email = el("email").value.trim();
      const password = el("password").value;
      if (!email || !password) return msg("Please enter email and password.");
      await registerWithEmail(email, password);
      onDone?.();
    } catch (e) {
      msg(e?.message || "Register failed.");
    }
  };

  el("btnGoogle").onclick = async () => {
    msg("");
    try {
      await loginWithGoogle();
      onDone?.();
    } catch (e) {
      msg(e?.message || "Google sign-in failed.");
    }
  };
}
