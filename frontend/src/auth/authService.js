

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/$/, "");
export const USE_MOCK_AUTH = import.meta.env.VITE_USE_MOCK_AUTH === "true";

/* ---------- Token storage ---------- */

const TOKEN_KEY = "psz-auth-token";

export const tokenStore = {
  get() {
    try {
      return window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token, remember) {
    try {
      this.clear();
      (remember ? window.localStorage : window.sessionStorage).setItem(TOKEN_KEY, token);
    } catch {
      /* storage blocked: user stays signed in until the page is closed */
    }
  },
  clear() {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

/* ---------- Real backend ---------- */

const DEFAULT_MESSAGES = {
  400: "Please check the details you entered.",
  401: "Incorrect email or password.",
  403: "Your account doesn't have access.",
  404: "Not found.",
  429: "Too many attempts. Please wait a few minutes and try again.",
  500: "Something went wrong on the server. Please try again.",
};

async function request(path, { method = "GET", body, token } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the server. Check that the backend is running.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* empty response body */
  }

  if (!response.ok) {
    const error = new Error(data?.message || DEFAULT_MESSAGES[response.status] || DEFAULT_MESSAGES[500]);
    error.status = response.status;
    throw error;
  }
  return data;
}

const realApi = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  me: (token) => request("/auth/me", { token }),
  logout: (token) => request("/auth/logout", { method: "POST", token }),
  forgotPassword: (email) =>
    request("/auth/forgot-password", {
      method: "POST",
      body: { email, resetUrl: `${window.location.origin}/reset-password` },
    }),
  resetPassword: (token, password) =>
    request("/auth/reset-password", { method: "POST", body: { token, password } }),
};

/* ---------- Demo mode (pretend backend) ---------- */

const DEMO_PASSWORD = "Password123";
const demoUsers = [
  { id: 1, name: "Ariana Arissa Binti Azri", email: "ariana@graduate.utm.my", student_id: "A25CS0045", role: "student" },
  { id: 2, name: "Library Staff", email: "staff@utm.my", student_id: null, role: "staff" },
];
const demoPasswords = new Map(demoUsers.map((user) => [user.email, DEMO_PASSWORD]));
const demoResetTokens = new Map();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mockApi = {
  async login(email, password) {
    await wait(500);
    const user = demoUsers.find((item) => item.email === email.toLowerCase());
    if (!user || demoPasswords.get(user.email) !== password) {
      const error = new Error(DEFAULT_MESSAGES[401]);
      error.status = 401;
      throw error;
    }
    return { token: `demo-${user.id}`, user };
  },
  async me(token) {
    await wait(200);
    const user = demoUsers.find((item) => `demo-${item.id}` === token);
    if (!user) {
      const error = new Error("Session expired.");
      error.status = 401;
      throw error;
    }
    return { user };
  },
  async logout() {
    await wait(150);
    return null;
  },
  async forgotPassword(email) {
    await wait(500);
    const user = demoUsers.find((item) => item.email === email.toLowerCase());
    if (user) {
      const token = `reset-${user.id}-${Date.now()}`;
      demoResetTokens.set(token, user.email);
      // A real backend emails this link. Demo mode returns it so you can click it.
      return { message: "sent", demoResetLink: `/reset-password?token=${token}` };
    }
    return { message: "sent" };
  },
  async resetPassword(token, password) {
    await wait(500);
    const email = demoResetTokens.get(token);
    if (!email) {
      const error = new Error("This reset link is invalid or has expired. Please request a new one.");
      error.status = 400;
      throw error;
    }
    demoPasswords.set(email, password);
    demoResetTokens.delete(token);
    return { message: "Password updated" };
  },
};

export const authApi = USE_MOCK_AUTH ? mockApi : realApi;