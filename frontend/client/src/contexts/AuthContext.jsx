import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/services/api-client";
const initialSession = () => {
  try {
    const raw = localStorage.getItem("isdb_session");
    return raw ? JSON.parse(raw) : { mode: null, userId: "", name: "", permissions: [], courseCodes: [], isSuperAdmin: false };
  } catch {
    return { mode: null, userId: "", name: "", permissions: [], courseCodes: [], isSuperAdmin: false };
  }
};
const AuthContext = createContext(void 0);
function AuthProvider({ children }) {
  const [session, setSession] = useState(initialSession);
  useEffect(() => {
    if (session.mode !== "admin" || !localStorage.getItem("isdb_admin_token")) return undefined;
    let active = true;
    const refreshAdminSession = () => apiClient.get("/v1/auth/me").then((response) => {
      if (!active) return;
      const me = response.data?.data ?? response.data;
      const next = { permissions: me.permissions ?? [], courseCodes: (me.courses ?? []).map((course) => course.code) };
      setSession((current) => ({ ...current, ...next }));
      localStorage.setItem("isdb_session", JSON.stringify({ ...JSON.parse(localStorage.getItem("isdb_session") ?? "{}"), ...next }));
    }).catch((error) => {
      // api-client's response interceptor already clears storage and
      // redirects on 401; stop this interval too so it doesn't keep firing
      // against a token that's already been thrown away.
      if (error?.response?.status === 401) window.clearInterval(interval);
    });
    refreshAdminSession();
    const interval = window.setInterval(refreshAdminSession, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [session.mode]);
  const save = (next) => {
    setSession(next);
    localStorage.setItem("isdb_session", JSON.stringify(next));
  };
  const loginAdmin = async (email, password) => {
    try {
      const loginResponse = await apiClient.post("/v1/auth/login", { email, password });
      const { token, user } = loginResponse.data.data;
      localStorage.setItem("isdb_admin_token", token);
      const meResponse = await apiClient.get("/v1/auth/me");
      const me = meResponse.data.data;
      const isDeveloperSuperAdmin = !me.roles;
      const courseCodes = (me.courses ?? []).map((course) => course.code);
      save({ mode: "admin", userId: user.id, name: user.name, email: user.email, permissions: me.permissions ?? [], courseCodes, isSuperAdmin: isDeveloperSuperAdmin || (me.roles ?? []).includes("SUPER_ADMIN") });
      return { ok: true };
    } catch (error) {
      localStorage.removeItem("isdb_admin_token");
      return { ok: false, message: error.response?.data?.message ?? "Unable to sign in." };
    }
  };
  const loginStudent = (studentId, dateOfBirth, profile = {}) => {
    // Store the verified name/status from the backend (when available) so
    // the instructions page can show the student's real details instead of
    // just re-displaying the ID they typed in as if it were their name.
    save({ mode: "student", userId: studentId, name: profile.name || studentId, studentDetails: { studentId: profile.studentId || studentId, name: profile.name || null, dateOfBirth: profile.dateOfBirth || dateOfBirth, status: profile.status || null }, dateOfBirth, permissions: [], courseCodes: [], isSuperAdmin: false });
  };
  const logout = () => {
    setSession({ mode: null, userId: "", name: "", permissions: [], courseCodes: [], isSuperAdmin: false });
    localStorage.removeItem("isdb_session");
    localStorage.removeItem("isdb_admin_token");
    localStorage.removeItem("isdb_student_token");
    // Also drop any cached exam-access grant from a previous session. If we
    // don't, a stale grant pointing at the wrong (or no longer running)
    // exam survives sign-out and gets reused on the next login without
    // ever re-checking availability with the backend.
    sessionStorage.removeItem("isdb_exam_access");
  };
  const value = useMemo(() => ({ session, isAuthenticated: session.mode !== null, loginAdmin, loginStudent, logout, hasPermission: (permission) => !permission || session.isSuperAdmin || session.permissions.includes(permission), hasCourseAccess: (courseCode) => Boolean(session.isSuperAdmin || session.courseCodes?.includes(courseCode)) }), [session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
export {
  AuthProvider,
  useAuth
};