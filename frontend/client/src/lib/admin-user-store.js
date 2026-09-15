/** Administrative accounts use Laravel in real mode; localStorage is retained only for demo mode. */
import { adminUsers as seedUsers } from "@/lib/mock-data";
import { apiClient, isMockMode } from "@/services/api-client";

const storageKey = "isdb_admin_users";
const updateEvent = "isdb-admin-users-update";
const notify = () => window.dispatchEvent(new Event(updateEvent));
const clone = x => JSON.parse(JSON.stringify(x));
const readMock = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return Array.isArray(saved) ? saved : clone(seedUsers);
  } catch {
    return clone(seedUsers);
  }
};
const titleCaseStatus = value => {
  const s = String(value ?? "ACTIVE");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};
const formatLastActive = value =>
  value ? new Date(value).toLocaleString() : "Not yet signed in";
const normalize = row => ({
  id: String(row.id),
  name: row.name,
  email: row.email,
  role: row.roles?.[0]?.name ?? row.role ?? "Consultant",
  roleId: row.roles?.[0]?.id ? String(row.roles[0].id) : row.roleId,
  status: titleCaseStatus(row.status),
  lastActive: formatLastActive(row.last_active_at),
  courseCodes: row.courses?.map(c => c.code) ?? row.courseCodes ?? [],
});
let cache = null;
let inFlight = null;
// `cache` stays null until the first successful fetch resolves, so its
// presence doubles as a "has real data arrived yet" flag — same approach
// as the sibling stores (exam-demo-store.js, question-demo-store.js,
// academic-demo-store.js). Used by CourseScopedUserListPage so the Users
// list can show a genuine "Loading…" state instead of an empty table on
// first mount.
const isAdminUsersLoaded = () => isMockMode || cache !== null;
/**
 * force: true guarantees a fetch that starts after this call (used right
 * after a create/update) instead of possibly reusing an older, already-
 * running fetch that started before the save and would resolve without the
 * new/changed row — see the same fix in academic-demo-store.js.
 */
const refresh = (options = {}) => {
  if (isMockMode) return Promise.resolve(readMock());
  const { force = false } = options;
  if (inFlight && !force) return inFlight;
  const waitForCurrent =
    force && inFlight ? inFlight.catch(() => undefined) : Promise.resolve();
  const p = waitForCurrent
    .then(() => apiClient.get("/v1/admin/users", { params: { per_page: 500 } }))
    .then(response => {
      const payload = response.data?.data;
      cache = (Array.isArray(payload) ? payload : (payload?.data ?? [])).map(
        normalize
      );
      notify();
      return cache;
    })
    .finally(() => {
      if (inFlight === p) inFlight = null;
    });
  inFlight = p;
  return p;
};
const getAdminUsers = () => {
  if (isMockMode) return readMock();
  if (!cache)
    refresh().catch(e => console.error("Failed to load administrators.", e));
  return clone(cache ?? []);
};
const getAdminUserByEmail = email =>
  getAdminUsers().find(
    u => u.email.toLowerCase() === String(email).toLowerCase()
  );
const resolveCourseIds = async courseCodes => {
  const response = await apiClient.get("/v1/admin/courses", {
    params: { per_page: 500 },
  });
  const payload = response.data?.data;
  const rows = Array.isArray(payload) ? payload : (payload?.data ?? []);
  return rows.filter(c => courseCodes.includes(c.code)).map(c => Number(c.id));
};
const createCourseAdmin = async ({
  name,
  email,
  password,
  courseCodes,
  status = "Active",
}) => {
  if (isMockMode) {
    const users = readMock();
    const user = {
      id: `user-${crypto.randomUUID()}`,
      name,
      email: email.toLowerCase(),
      roleId: "role-exam",
      role: "Consultant",
      courseCodes,
      status,
      lastActive: "Not yet signed in",
    };
    localStorage.setItem(storageKey, JSON.stringify([...users, user]));
    notify();
    return user;
  }
  const created = await apiClient.post("/v1/admin/users", {
    name,
    email,
    password,
    status: String(status).toUpperCase(),
  });
  const user = created.data?.data ?? created.data;
  const ids = await resolveCourseIds(courseCodes);
  await Promise.all(
    ids.map(course_id =>
      apiClient.post("/v1/admin/user-courses", { user_id: user.id, course_id })
    )
  );
  await refresh({ force: true });
  return normalize({ ...user, courseCodes });
};
const updateCourseAdmin = async (id, data) => {
  if (isMockMode) {
    const users = readMock();
    const updated = users.map(u =>
      String(u.id) === String(id) ? { ...u, ...data } : u
    );
    localStorage.setItem(storageKey, JSON.stringify(updated));
    notify();
    return updated.find(u => String(u.id) === String(id));
  }
  const payload = {
    name: data.name,
    email: data.email,
    status: String(data.status ?? "Active").toUpperCase(),
  };
  if (data.courseCodes)
    payload.course_ids = await resolveCourseIds(data.courseCodes);
  // Super Admin resetting another administrator's password: sent only when provided,
  // goes through PUT /users/{id} (super-admin gated on the backend) — no current_password
  // needed here, unlike the self-service /account/password flow.
  if (data.password) payload.password = data.password;
  const response = await apiClient.put(`/v1/admin/users/${id}`, payload);
  await refresh({ force: true });
  return normalize(response.data?.data ?? response.data);
};
const changeAdminPassword = async (id, currentPassword, newPassword) => {
  if (isMockMode)
    throw new Error(
      "Password changes require a connected Laravel API. Plaintext passwords are not stored in the browser."
    );
  const response = await apiClient.patch("/admin/account/password", {
    current_password: currentPassword,
    password: newPassword,
    password_confirmation: newPassword,
  });
  return response.data?.data ?? response.data;
};
export {
  changeAdminPassword,
  createCourseAdmin,
  getAdminUserByEmail,
  getAdminUsers,
  isAdminUsersLoaded,
  refresh,
  updateCourseAdmin,
  updateEvent,
};
