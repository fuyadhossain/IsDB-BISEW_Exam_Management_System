import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { AdminShell } from "@/components/app-shell";
import { ErrorState } from "@/components/admin-ui";
function AdminRoute({ children, permission }) {
  const { session, hasPermission } = useAuth();
  // session.mode is a localStorage flag that outlives the bearer token
  // (dev DB reseed, expired/revoked token, manual localStorage edits).
  // Trusting it alone let pages render and start polling admin endpoints
  // that would 401 forever. Require the token to actually be present too.
  if (session.mode !== "admin" || !localStorage.getItem("isdb_admin_token")) {
    return <Redirect to="/admin/login" />;
  }
  if (!hasPermission(permission)) return <AdminShell><ErrorState message="Your current administrative role does not include access to this workspace. Laravel must also enforce this permission when its API is connected." /></AdminShell>;
  return <AdminShell>{children}</AdminShell>;
}
function StudentRoute({ children }) {
  const { session } = useAuth();
  if (session.mode !== "student" || !localStorage.getItem("isdb_student_token")) {
    return <Redirect to="/student/login" />;
  }
  return <>{children}</>;
}
export {
  AdminRoute,
  StudentRoute
};