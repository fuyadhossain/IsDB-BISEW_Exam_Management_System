/** Super Admin workspace style: course scope is prominent, explicit, and assigned at account creation so administrative authority is never ambiguous. */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Link, Redirect, useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { academicUpdateEvent } from "@/lib/academic-demo-store";
import {
  createCourseAdmin,
  getAdminUsers,
  isAdminUsersLoaded,
  updateCourseAdmin,
  updateEvent,
} from "@/lib/admin-user-store";
import { apiClient } from "@/services/api-client";
import { useAuth } from "@/contexts/AuthContext";
import {
  DataTable,
  FilterBand,
  FilterField,
  LoadingState,
  PageHeader,
  PrimaryLink,
  RecordCard,
  StatusBadge,
} from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Field = ({ label, children, required }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-bold uppercase tracking-[0.12em] text-[#62746e]">
      {label}
      {required && <span className="ml-1 text-rose-700">*</span>}
    </Label>
    {children}
  </div>
);
const useStoredAdmins = () => {
  const [users, setUsers] = useState(() => getAdminUsers());
  useEffect(() => {
    const refresh = () => setUsers(getAdminUsers());
    window.addEventListener(updateEvent, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(updateEvent, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return users;
};
// apiCache-backed getAdminUsers() (see isAdminUsersLoaded() in
// admin-user-store.js) stays empty until the first fetch resolves, so
// without this the Users list can't tell "still loading" apart from
// "genuinely no administrators" and briefly shows the empty-table state
// on every mount.
const useStoredAdminsLoading = () => {
  const [loading, setLoading] = useState(() => !isAdminUsersLoaded());
  useEffect(() => {
    if (!loading) return undefined;
    const check = () => setLoading(!isAdminUsersLoaded());
    window.addEventListener(updateEvent, check);
    return () => window.removeEventListener(updateEvent, check);
  }, [loading]);
  return loading;
};
const useAssignableCourses = () => {
  const [courses, setCourses] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      apiClient
        .get("/v1/admin/courses", { params: { per_page: 100 } })
        .then((response) => {
          if (cancelled) return;
          const payload = response.data?.data;
          const rows = Array.isArray(payload) ? payload : (payload?.data ?? []);
          setCourses(
            rows.map((row) => ({
              id: String(row.id),
              code: row.code,
              name: row.name,
              status: row.status,
            })),
          );
        })
        .catch((error) => console.error("Failed to load courses.", error));
    };
    load();
    // Without this, a course created/edited elsewhere (e.g. Academic
    // Management) never showed up here until the admin fully reloaded the
    // page — this form's course list was fetched once on mount and never
    // again. academic-demo-store already broadcasts this event after every
    // successful course save, so just listen for it.
    window.addEventListener(academicUpdateEvent, load);
    return () => {
      cancelled = true;
      window.removeEventListener(academicUpdateEvent, load);
    };
  }, []);
  return courses;
};
const PasswordField = (props) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        minLength={8}
        placeholder={props.placeholder?.replace("12", "8")}
        type={visible ? "text" : "password"}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-[#71827c] hover:text-[#0e5a4f]"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};

function SuperAdminOnly() {
  return (
    <RecordCard className="mx-auto max-w-xl border-amber-200 bg-amber-50 p-7 text-center">
      <LockKeyhole className="mx-auto h-7 w-7 text-amber-800" />
      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">
        Restricted workspace
      </p>
      <h2 className="mt-2 font-serif text-2xl font-semibold text-amber-950">
        Super Admin access is required
      </h2>
      <p className="mt-3 text-sm leading-6 text-amber-900">
        Only a Super Admin may create administrators or assign the courses that
        they can manage.
      </p>
    </RecordCard>
  );
}

function CourseScopedUserListPage() {
  const { session, hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const users = useStoredAdmins();
  const usersLoading = useStoredAdminsLoading();
  const filtered = useMemo(
    () =>
      users.filter(
        (user) =>
          !user.hiddenFromList &&
          `${user.name} ${user.email} ${user.courseCodes?.join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [users, search],
  );
  if (!hasPermission("users.view"))
    return (
      <>
        <PageHeader
          eyebrow="Administration"
          title="Administrative users"
          description="Administrator accounts and course assignments are controlled by the Super Admin."
        />
        <SuperAdminOnly />
      </>
    );
  return (
    <>
      <PageHeader
        eyebrow={
          session.isSuperAdmin ? "Super Admin workspace" : "Administration"
        }
        title="Administrative users"
        description="Create course-scoped administrators. They can access only the student, question, examination, and result records attached to their assigned courses."
        action={
          hasPermission("users.create") ? (
            <PrimaryLink href="/admin/users/create">
              Create course admin
            </PrimaryLink>
          ) : null
        }
      />
      <FilterBand onClear={() => setSearch("")}>
        <FilterField label="Search administrator">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, or course"
          />
        </FilterField>
      </FilterBand>
      {usersLoading ? (
        <LoadingState title="Loading administrative users…" />
      ) : (
      <DataTable
        records={filtered}
        rowLabel="administrative users"
        columns={[
          {
            key: "name",
            label: "User",
            render: (record) => (
              <div>
                <p className="font-semibold text-[#264840]">{record.name}</p>
                <p className="mt-0.5 text-xs text-[#74837e]">{record.email}</p>
              </div>
            ),
          },
          { key: "role", label: "Role" },
          {
            key: "courseCodes",
            label: "Course scope",
            render: (record) =>
              record.roleId === "role-super" ? (
                <span className="rounded-full bg-[#e8f3ed] px-2.5 py-1 text-xs font-bold text-[#0e5a4f]">
                  All courses
                </span>
              ) : (
                <span className="font-semibold text-[#315249]">
                  {record.courseCodes?.join(", ") || "None"}
                </span>
              ),
          },
          {
            key: "status",
            label: "Status",
            render: (record) => <StatusBadge value={record.status} />,
          },
          { key: "lastActive", label: "Last active" },
          {
            key: "actions",
            label: "Actions",
            render: (record) =>
              record.roleId === "role-super" ? (
                <span className="text-xs font-semibold text-[#7b8985]">
                  Protected
                </span>
              ) : (
                <Link
                  href={`/admin/users/${record.id}/edit`}
                  className="inline-flex items-center rounded-md bg-[#e8f3ed] px-2.5 py-1.5 text-xs font-bold text-[#0e5a4f] transition hover:bg-[#d9ece2]"
                >
                  Edit scope
                </Link>
              ),
          },
        ]}
      />
      )}
    </>
  );
}

function CourseScopedUserFormPage() {
  const { session, hasPermission } = useAuth();
  const [, params] = useRoute("/admin/users/:id/edit");
  const isEditing = Boolean(params?.id);
  const [, navigate] = useLocation();
  const users = useStoredAdmins();
  const existing = users.find((user) => user.id === params?.id);
  const courses = useAssignableCourses();
  const [selectedCourses, setSelectedCourses] = useState(
    () => existing?.courseCodes ?? [],
  );
  useEffect(() => {
    if (existing) setSelectedCourses(existing.courseCodes ?? []);
  }, [existing]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Editing another administrator's account is a hard Super-Admin-only rule on
  // the backend (RbacController@updateUser aborts for anyone else), so that
  // check stays tied to isSuperAdmin. Creating a new administrator is only
  // gated by the users.create permission there, so it follows that instead.
  const restricted = isEditing
    ? !session.isSuperAdmin
    : !hasPermission("users.create");
  if (restricted)
    return (
      <>
        <PageHeader
          eyebrow="Administration"
          title="Administrative users"
          description="Administrator accounts are created only by the Super Admin."
        />
        <SuperAdminOnly />
      </>
    );
  if (isEditing && (!existing || existing.roleId === "role-super"))
    return <Redirect to="/admin/users" />;
  const toggleCourse = (code) =>
    setSelectedCourses((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const values = {
        name: form.get("name"),
        email: form.get("email"),
        status: form.get("status"),
        password: form.get("password"),
        courseCodes: selectedCourses,
      };
      if (!isEditing && String(values.password ?? "").length < 8)
        throw new Error("Use an initial password of at least 8 characters.");
      if (isEditing && values.password && String(values.password).length < 12)
        throw new Error("New password must be at least 12 characters.");
      if (isEditing && !values.password) delete values.password;
      const saved = isEditing
        ? await updateCourseAdmin(existing.id, values)
        : await createCourseAdmin(values);
      toast.success(
        isEditing
          ? "Administrator scope updated"
          : "Course administrator created",
        {
          description: `${saved.name} can access ${saved.courseCodes.join(", ")} only.`,
        },
      );
      navigate("/admin/users");
    } catch (submissionError) {
      setError(
        submissionError.message ?? "The administrator could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="Super Admin workspace"
        title={
          isEditing
            ? "Edit course administrator"
            : "Create course administrator"
        }
        description="Only the Super Admin can assign administrator accounts. Every non-super account must receive at least one permitted course."
        action={
          <Button variant="outline" onClick={() => navigate("/admin/users")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to users
          </Button>
        }
      />
      <RecordCard className="max-w-4xl">
        <form onSubmit={submit} className="p-6">
          <div className="flex items-start gap-3 rounded-lg border border-[#d8e7dd] bg-[#f5faf7] p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0e5a4f]" />
            <p className="text-sm leading-6 text-[#375850]">
              <strong>Course-scoped administrator.</strong> This account can
              manage only its assigned course records. It cannot create users,
              change roles, or access another course’s students, questions,
              exams, or results.
            </p>
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <Field label="Full name" required>
              <Input
                name="name"
                defaultValue={existing?.name ?? ""}
                placeholder="Full name"
                required
              />
            </Field>
            <Field label="Email" required>
              <Input
                name="email"
                type="email"
                defaultValue={existing?.email ?? ""}
                placeholder="name@isdb-bisew.org"
                required
              />
            </Field>
            {!isEditing && (
              <Field label="Initial password" required>
                <PasswordField
                  name="password"
                  minLength={12}
                  placeholder="At least 12 characters"
                  required
                />
              </Field>
            )}
            {isEditing && (
              <Field label="Reset password (optional)">
                <PasswordField
                  name="password"
                  minLength={12}
                  placeholder="Leave blank to keep current password"
                />
              </Field>
            )}
            <Field label="Role">
              <div className="flex h-10 items-center rounded-md border border-[#d6ded7] bg-[#f5f8f5] px-3 text-sm font-semibold text-[#37574f]">
                Consultant
              </div>
            </Field>
            <Field label="Status">
              <select
                name="status"
                defaultValue={existing?.status ?? "Active"}
                className="h-10 w-full rounded-md border border-[#d6ded7] bg-white px-3 text-sm text-[#2f4d47]"
              >
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </Field>
          </div>
          <section className="mt-7 border-t border-[#e4ebe5] pt-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#71827c]">
              Allowed course scope
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-[#1c413b]">
              Assign the courses this administrator may manage
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#677a74]">
              The account will see records for selected courses only. Choose
              every course that the administrator is authorized to manage.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {courses
                .filter(
                  (course) => String(course.status).toUpperCase() === "ACTIVE",
                )
                .map((course) => (
                  <label
                    key={course.id}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition ${selectedCourses.includes(course.code) ? "border-[#78aa99] bg-[#eff7f2]" : "border-[#dde6df] bg-white hover:border-[#b5d1c3]"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCourses.includes(course.code)}
                      onChange={() => toggleCourse(course.code)}
                      className="mt-0.5 h-4 w-4 accent-[#0e5a4f]"
                    />
                    <span>
                      <span className="block font-semibold text-[#24463e]">
                        {course.code}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[#6c7e78]">
                        {course.name}
                      </span>
                    </span>
                  </label>
                ))}
            </div>
          </section>
          {error && (
            <p
              role="alert"
              className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
            >
              {error}
            </p>
          )}
          <div className="mt-7 flex justify-end gap-3 border-t border-[#e6ebe6] pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/admin/users")}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!selectedCourses.length || busy}
              className="bg-[#0e5a4f] hover:bg-[#0a4a40]"
            >
              <Save className="mr-2 h-4 w-4" />
              {busy
                ? "Saving…"
                : isEditing
                  ? "Save course scope"
                  : "Create administrator"}
            </Button>
          </div>
        </form>
      </RecordCard>
    </>
  );
}

export { CourseScopedUserFormPage, CourseScopedUserListPage };