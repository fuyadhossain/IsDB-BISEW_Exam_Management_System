import { Route, Switch, Redirect } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { InstitutionWatermark } from "@/components/app-shell";
import { AdminRoute, StudentRoute } from "@/components/route-guards";
import { DashboardPage, ManagementFormPage, ManagementListPage, BatchDetailPage, CurriculumOverviewPage, CurriculumImportPage } from "@/pages/admin/management-pages";
import { QuestionDetailPage, QuestionFormPage, QuestionImportDetailPage, QuestionImportHistoryPage, QuestionImportPage, QuestionListPage } from "@/pages/admin/examination-pages";
import { ExamDetailPage, ExamFormPage, ExamListPage, ExamSetDetailPage, ExamSetFormPage, ExamSetListPage } from "@/pages/admin/exam-workflow-pages";
import { AuditLogPage, PermissionListPage, ReportsPage, ResultDetailPage, ResultListPage, RoleFormPage, RoleListPage, SettingsPage, UserFormPage, UserListPage, ViolationListPage } from "@/pages/admin/governance-pages";
import { AccountSettingsPage } from "@/pages/admin/account-settings-page";
import { AdminLoginPage, StudentCompletionPage, StudentLoginPage } from "@/pages/public-pages";
import { StudentInstructionsPage } from "@/pages/student-instructions-page";
import { StudentExamPage } from "@/pages/student-exam-scroll-page";
import NotFound from "@/pages/NotFound";
const admin = (element, permission) => <AdminRoute permission={permission}>{element}</AdminRoute>;
function Router() {
  return <Switch>
    <Route path="/"><Redirect to="/student/login" /></Route>
    <Route path="/admin"><Redirect to="/admin/login" /></Route>
    <Route path="/admin/login" component={AdminLoginPage} />
    <Route path="/admin/dashboard">{admin(<DashboardPage />)}</Route>

    <Route path="/admin/courses/create">{admin(<ManagementFormPage kind="courses" />, "courses.create")}</Route>
    <Route path="/admin/courses/:id/edit">{admin(<ManagementFormPage kind="courses" />, "courses.update")}</Route>
    <Route path="/admin/courses">{admin(<ManagementListPage kind="courses" />, "courses.view")}</Route>
    <Route path="/admin/tsps/create">{admin(<ManagementFormPage kind="tsps" />, "tsps.create")}</Route>
    <Route path="/admin/tsps/:id/edit">{admin(<ManagementFormPage kind="tsps" />, "tsps.update")}</Route>
    <Route path="/admin/tsps">{admin(<ManagementListPage kind="tsps" />, "tsps.view")}</Route>
    <Route path="/admin/rounds/create">{admin(<ManagementFormPage kind="rounds" />, "rounds.create")}</Route>
    <Route path="/admin/rounds/:id/edit">{admin(<ManagementFormPage kind="rounds" />, "rounds.update")}</Route>
    <Route path="/admin/rounds">{admin(<ManagementListPage kind="rounds" />, "rounds.view")}</Route>
    <Route path="/admin/batches/create">{admin(<ManagementFormPage kind="batches" />, "batches.create")}</Route>
    <Route path="/admin/batches/:id/edit">{admin(<ManagementFormPage kind="batches" />, "batches.update")}</Route>
    <Route path="/admin/batches/:id">{admin(<BatchDetailPage />, "batches.view")}</Route>
    <Route path="/admin/batches">{admin(<ManagementListPage kind="batches" />, "batches.view")}</Route>
    <Route path="/admin/students/create">{admin(<ManagementFormPage kind="students" />, "students.create")}</Route>
    <Route path="/admin/students/:id/edit">{admin(<ManagementFormPage kind="students" />, "students.update")}</Route>
    <Route path="/admin/students">{admin(<ManagementListPage kind="students" />, "students.view")}</Route>


    <Route path="/admin/subjects/create">{admin(<ManagementFormPage kind="subjects" />, "curriculum.create")}</Route>
    <Route path="/admin/subjects/:id/edit">{admin(<ManagementFormPage kind="subjects" />, "curriculum.update")}</Route>
    <Route path="/admin/subjects">{admin(<ManagementListPage kind="subjects" />, "curriculum.view")}</Route>
    <Route path="/admin/modules/create">{admin(<ManagementFormPage kind="modules" />, "curriculum.create")}</Route>
    <Route path="/admin/modules/:id/edit">{admin(<ManagementFormPage kind="modules" />, "curriculum.update")}</Route>
    <Route path="/admin/modules">{admin(<ManagementListPage kind="modules" />, "curriculum.view")}</Route>
    <Route path="/admin/competency-units/create">{admin(<ManagementFormPage kind="competency-units" />, "curriculum.create")}</Route>
    <Route path="/admin/competency-units/:id/edit">{admin(<ManagementFormPage kind="competency-units" />, "curriculum.update")}</Route>
    <Route path="/admin/competency-units">{admin(<ManagementListPage kind="competency-units" />, "curriculum.view")}</Route>
    <Route path="/admin/elements/create">{admin(<ManagementFormPage kind="elements" />, "curriculum.create")}</Route>
    <Route path="/admin/elements/:id/edit">{admin(<ManagementFormPage kind="elements" />, "curriculum.update")}</Route>
    <Route path="/admin/elements">{admin(<ManagementListPage kind="elements" />, "curriculum.view")}</Route>
    <Route path="/admin/curriculum/import">{admin(<CurriculumImportPage />, "curriculum.create")}</Route>
    <Route path="/admin/curriculum">{admin(<CurriculumOverviewPage />, "curriculum.view")}</Route>

    <Route path="/admin/questions/import/history/:id">{admin(<QuestionImportDetailPage />, "questions.create")}</Route>
    <Route path="/admin/questions/import/history">{admin(<QuestionImportHistoryPage />, "questions.create")}</Route>
    <Route path="/admin/questions/import">{admin(<QuestionImportPage />, "questions.create")}</Route>
    <Route path="/admin/questions/create">{admin(<QuestionFormPage />, "questions.create")}</Route>
    <Route path="/admin/questions/:id/edit">{admin(<QuestionFormPage />, "questions.update")}</Route>
    <Route path="/admin/questions/:id">{admin(<QuestionDetailPage />, "questions.view")}</Route>
    <Route path="/admin/questions">{admin(<QuestionListPage />, "questions.view")}</Route>
    <Route path="/admin/exam-sets/create">{admin(<ExamSetFormPage />, "exam_sets.create")}</Route>
    <Route path="/admin/exam-sets/:id/edit">{admin(<ExamSetFormPage />, "exam_sets.update")}</Route>
    <Route path="/admin/exam-sets/:id">{admin(<ExamSetDetailPage />, "exam_sets.view")}</Route>
    <Route path="/admin/exam-sets">{admin(<ExamSetListPage />, "exam_sets.view")}</Route>
    <Route path="/admin/exams/create">{admin(<ExamFormPage />, "exams.create")}</Route>
    <Route path="/admin/exams/:id/edit">{admin(<ExamFormPage />, "exams.update")}</Route>
    <Route path="/admin/exams/:id">{admin(<ExamDetailPage />, "exams.view")}</Route>
    <Route path="/admin/exams">{admin(<ExamListPage />, "exams.view")}</Route>

    <Route path="/admin/results/:id">{admin(<ResultDetailPage />, "results.view")}</Route>
    <Route path="/admin/results">{admin(<ResultListPage />, "results.view")}</Route>
    <Route path="/admin/reports">{admin(<ReportsPage />, "results.view")}</Route>
    <Route path="/admin/users/create">{admin(<UserFormPage />, "users.create")}</Route>
    <Route path="/admin/users/:id/edit">{admin(<UserFormPage />, "users.update")}</Route>
    <Route path="/admin/users">{admin(<UserListPage />, "users.view")}</Route>
    <Route path="/admin/roles/create">{admin(<RoleFormPage />, "roles.create")}</Route>
    <Route path="/admin/roles/:id/edit">{admin(<RoleFormPage />, "roles.update")}</Route>
    <Route path="/admin/roles">{admin(<RoleListPage />, "roles.view")}</Route>
    <Route path="/admin/permissions">{admin(<PermissionListPage />, "permissions.view")}</Route>
    <Route path="/admin/audit-logs">{admin(<AuditLogPage />, "audit_logs.view")}</Route>
    <Route path="/admin/violations">{admin(<ViolationListPage />, "violations.view")}</Route>
    <Route path="/admin/settings">{admin(<SettingsPage />)}</Route>
    <Route path="/admin/account">{admin(<AccountSettingsPage />)}</Route>

    <Route path="/student/login" component={StudentLoginPage} />
    <Route path="/student/instructions"><StudentRoute><StudentInstructionsPage /></StudentRoute></Route>
    <Route path="/student/exam"><StudentRoute><StudentExamPage /></StudentRoute></Route>
    <Route path="/student/completed"><StudentRoute><StudentCompletionPage /></StudentRoute></Route>
    <Route component={NotFound} />
  </Switch>;
}
function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><AuthProvider><TooltipProvider><Toaster position="top-right" richColors /><Router /><InstitutionWatermark /></TooltipProvider></AuthProvider></ThemeProvider></ErrorBoundary>;
}
export {
  App as default
};