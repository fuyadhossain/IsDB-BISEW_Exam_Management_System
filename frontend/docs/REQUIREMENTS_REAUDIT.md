# Requirements Re-audit

This document records the corrective audit requested after the first broad demonstration release. Each item is checked only after the active routed frontend behavior, persistence boundary, and relevant handoff files agree.

| Requirement area | Re-audit result | Verified implementation |
|---|---|---|
| Account governance | Verified. Self-service password change remains available while username/email, role, status, and course scope are Super Admin-controlled. | Three Super Admin seeds persist; two remain absent from the visible User list but accept direct sign-in. |
| Academic management | Corrected. TSP-only terminology, TSP name/location input suggestions, course-name suggestions, round selection, and persistent academic data are active. | Subjects, Modules, Competency Units, and Elements omit status fields; Competency Units omit search; curriculum selectors cascade by course context. |
| Exam sets and creation | Corrected. | Exam sets support edit, course-scoped all-batch coverage, explicit availability, and delivery mapping. Exam creation derives context from its set, blocks taken numbers, validates the time window, fixes marks at 50, provides cascading distribution selectors, and shows a review before save. |
| Online student delivery | Corrected. | Student sign-in, confirmation, countdown, generated questions, draft, closure detection, and submission now use the granted running online exam ID and attempt identity. |
| Offline monthly paper | Corrected. | The paper uses a persistent Question Bank snapshot, has 23 MCQ plus 2 descriptive questions, is unshuffled, is administrator print-only, and refuses generation when eligible records are insufficient. |
| Results and handoff | Corrected. | The active interface, PDF filename/title, service request, regression test, and Laravel handoff use course, batch, exam number, and outcome only; student/exam search and date filtering are absent. |

> Demonstration persistence uses browser storage only. Laravel and MySQL remain responsible for authentication, role checks, scheduled state changes, atomic imports, question selection, attempts, scoring, and print authorization in production.
