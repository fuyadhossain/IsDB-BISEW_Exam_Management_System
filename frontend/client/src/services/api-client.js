import axios from "axios";

/** Institutional Ledger style reminder: API connections are explicit, inspectable, and never store secrets in the client. */
const runtimeConfigKey = "isdb_laravel_api_config";
const environmentConfig = {
  baseUrl: String(import.meta.env.VITE_API_BASE_URL ?? "/api").replace(
    /\/$/,
    ""
  ),
  // Mock mode is permanently disabled for this project — every page must
  // always read/write real data through the Laravel API, never the
  // browser-local demo/mock stores. `useMock` is hardcoded to `false` here
  // (not read from any env var or localStorage) so it can never silently
  // flip back on.
  useMock: false,
};

function readRuntimeConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(runtimeConfigKey) ?? "null");
    if (!saved || typeof saved !== "object") return environmentConfig;
    return {
      baseUrl:
        typeof saved.baseUrl === "string" && saved.baseUrl.trim()
          ? saved.baseUrl.trim().replace(/\/$/, "")
          : environmentConfig.baseUrl,
      // Always real mode — see note on environmentConfig.useMock above.
      useMock: false,
    };
  } catch {
    return environmentConfig;
  }
}

let laravelApiConfig = readRuntimeConfig();
let isMockMode = laravelApiConfig.useMock;

const apiClient = axios.create({
  baseURL: laravelApiConfig.baseUrl,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

apiClient.interceptors.request.use(config => {
  // Previously this always preferred the admin token over the student
  // token whenever both existed in localStorage (e.g. an admin tested the
  // exam-create screen earlier in the same browser, then a student signs
  // in afterwards without a full logout). Every student-portal request —
  // including GET /v1/student/exams right after a successful student
  // login — was then sent with the leftover ADMIN bearer token, which
  // authenticates as a User (not a Student), so StudentMiddleware
  // rejected it with 403. The failing request then bubbled up through
  // studentExamService.login()'s single try/catch as a generic
  // "credentials could not be verified" message, even though the
  // student_id/date_of_birth were actually correct.
  // Fix: pick the token based on which portal the request is for, not
  // whichever token happens to exist first.
  const url = config.url ?? "";
  const isStudentRequest = /\/student\//.test(url) || /^student\//.test(url);
  const isAdminRequest =
    /\/admin\//.test(url) || /^admin\//.test(url) || /\/auth\//.test(url);
  const adminToken = localStorage.getItem("isdb_admin_token");
  const studentToken = localStorage.getItem("isdb_student_token");
  const token = isStudentRequest
    ? studentToken
    : isAdminRequest
      ? adminToken
      : adminToken || studentToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global 401 handler: a bearer token can go bad without the UI knowing
// (server-side token deleted/expired, DB reseeded in dev, etc). Session
// state in localStorage doesn't auto-expire with it, so without this,
// every poller (exam list refresh, /auth/me heartbeat) keeps firing the
// same request every few seconds forever, each one logging a fresh 401.
// Clearing storage + hard-redirecting here means the bad token dies with
// the first request that discovers it, from any call site.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
      const isStudentRequest = /\/student\//.test(error.config?.url ?? "");
      localStorage.removeItem("isdb_session");
      localStorage.removeItem("isdb_admin_token");
      localStorage.removeItem("isdb_student_token");
      sessionStorage.removeItem("isdb_exam_access");
      const loginPath = isStudentRequest ? "/student/login" : "/admin/login";
      if (window.location.pathname !== loginPath) {
        window.location.assign(loginPath);
      }
    }
    return Promise.reject(error);
  }
);

function getLaravelApiConfig() {
  return { ...laravelApiConfig };
}

function setLaravelApiConfig(nextConfig) {
  const baseUrl = String(nextConfig.baseUrl ?? "")
    .trim()
    .replace(/\/$/, "");
  if (!/^https?:\/\//i.test(baseUrl) && !baseUrl.startsWith("/")) {
    throw new Error(
      "Enter a complete Laravel API URL, such as https://api.example.org/api."
    );
  }
  laravelApiConfig = {
    baseUrl: baseUrl || environmentConfig.baseUrl,
    // Mock mode is permanently disabled — always real API mode.
    useMock: false,
  };
  isMockMode = laravelApiConfig.useMock;
  apiClient.defaults.baseURL = laravelApiConfig.baseUrl;
  localStorage.setItem(runtimeConfigKey, JSON.stringify(laravelApiConfig));
  return getLaravelApiConfig();
}

function resetLaravelApiConfig() {
  localStorage.removeItem(runtimeConfigKey);
  laravelApiConfig = { ...environmentConfig };
  isMockMode = laravelApiConfig.useMock;
  apiClient.defaults.baseURL = laravelApiConfig.baseUrl;
  return getLaravelApiConfig();
}

const normalizeApiError = error => {
  if (!axios.isAxiosError(error))
    return {
      type: "unknown",
      message: "We could not complete that request. Please try again.",
    };
  const status = error.response?.status;
  const message = error.response?.data?.message;
  if (!status)
    return {
      type: "network",
      message:
        "The service could not be reached. Check your connection and try again.",
    };
  if (status === 401)
    return {
      type: "unauthorized",
      status,
      message: "Your session has ended. Please sign in again.",
    };
  if (status === 403)
    return {
      type: "forbidden",
      status,
      message: "You do not have permission to perform this action.",
    };
  if (status === 404)
    return {
      type: "not_found",
      status,
      message: "The requested record is no longer available.",
    };
  if (status === 422)
    return {
      type: "validation",
      status,
      message: message ?? "Please review the highlighted information.",
      errors:
        error.response?.data?.errors ??
        error.response?.data?.data?.errors ??
        {},
    };
  if (status === 429)
    return {
      type: "rate_limit",
      status,
      message:
        "Too many requests were received. Please wait a moment and retry.",
    };
  if (status >= 500)
    return {
      type: "server",
      status,
      message:
        "The service is temporarily unavailable. Please try again later.",
    };
  return {
    type: "unknown",
    status,
    message: message ?? "We could not complete that request. Please try again.",
  };
};

const mockRequest = async (value, delay = 280) => {
  await new Promise(resolve => window.setTimeout(resolve, delay));
  return structuredClone(value);
};

export {
  apiClient,
  getLaravelApiConfig,
  isMockMode,
  mockRequest,
  normalizeApiError,
  resetLaravelApiConfig,
  setLaravelApiConfig,
};