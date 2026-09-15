/** Academic curriculum style: a shared subject is assigned transparently to every course that uses it. */
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, RecordCard } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function SubjectAssignmentForm({ definition, existing, isEditing, onBack, onSave, allowedCourses = [] }) {
  const [selectedCourses, setSelectedCourses] = useState(() => {
    const initialCourses = isEditing ? (existing?.courses ?? []).filter((code) => allowedCourses.some((course) => course.code === code)) : [];
    return initialCourses.length ? initialCourses : [allowedCourses[0]?.code].filter(Boolean);
  });
  const [status, setStatus] = useState(existing?.status ?? "Active");
  const submit = async (event) => {
    event.preventDefault();
    if (selectedCourses.length === 0) {
      toast.error("Assign this subject to at least one course.");
      return;
    }
    const courseIds = selectedCourses.map((code) => allowedCourses.find((course) => course.code === code)?.id).filter(Boolean);
    try {
      // Create mode accepts multiple subject names at once (one per line), all
      // assigned to the same selected courses, instead of a single add-then-repeat cycle.
      if (!isEditing) {
        const names = [...new Set(String(event.currentTarget.subjectName.value ?? "").split("\n").map((line) => line.trim()).filter(Boolean))];
        if (!names.length) return toast.error("Enter at least one subject name.");
        for (const name of names) {
          await onSave?.({ id: undefined, name, courses: selectedCourses, courseIds, status: "Active" });
        }
        toast.success(names.length === 1 ? "Subject created" : `${names.length} subjects created`, { description: `Assigned to ${selectedCourses.join(", ")}.` });
        onBack();
        return;
      }
      await onSave?.({ id: existing?.id, name: event.currentTarget.subjectName.value.trim(), courses: selectedCourses, courseIds, status });
      toast.success("Subject updated", { description: `Assigned to ${selectedCourses.join(", ")}.` });
      onBack();
    } catch (error) {
      toast.error(error.message);
    }
  };
  return <><PageHeader eyebrow="Curriculum editor" title={isEditing ? "Edit subject" : "Add subject"} description="A subject can be shared by multiple courses. Modules and questions remain course-specific beneath the shared subject." action={<Button variant="outline" className="border-[#d5ddd6]" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Back to subjects</Button>} /><RecordCard><form onSubmit={submit} className="p-5 md:p-7"><div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-[0.12em] text-[#62746e]">{isEditing ? "Subject name" : "Subject name(s)"}<span className="ml-1 text-rose-700">*</span></Label>{isEditing ? <Input name="subjectName" defaultValue={String(existing?.name ?? "")} placeholder="e.g. HTML" required /> : <><Textarea name="subjectName" rows={5} placeholder={"Enter one subject name per line to add multiple at once, e.g.\nHTML\nCSS\nJavaScript"} required /><p className="mt-1.5 text-xs text-[#77877f]">One name per line — each line becomes a separate subject, assigned to the courses selected below.</p></>}</div>{isEditing && <div className="mt-5 space-y-1.5"><Label className="text-xs font-bold uppercase tracking-[0.12em] text-[#62746e]">Status</Label><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 w-full rounded-md border border-[#d6ded7] bg-white px-3 text-sm text-[#2f4d47] outline-none focus:ring-2 focus:ring-[#0e5a4f]/30 md:w-64"><option>Active</option><option>Inactive</option></select></div>}<div className="mt-6 rounded-xl border border-[#dce6df] bg-[#fbfdfb] p-5"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6d7f79]">Course assignment</p><h2 className="mt-1 font-serif text-2xl font-semibold text-[#1e413b]">Available in authorized courses</h2><p className="mt-2 text-sm leading-6 text-[#62766f]">Select every course that teaches this subject. A course-scoped administrator can assign only their own courses; the Super Admin can assign any course.</p></div><div className="mt-5 grid gap-3 md:grid-cols-2">{allowedCourses.map((course) => <label key={course.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${selectedCourses.includes(course.code) ? "border-[#80b8a4] bg-[#edf7f2]" : "border-[#e0e7e1] bg-white hover:border-[#b5d1c3]"}`}><input type="checkbox" checked={selectedCourses.includes(course.code)} onChange={(event) => setSelectedCourses((current) => event.target.checked ? [...current, course.code] : current.filter((code) => code !== course.code))} className="mt-1 h-4 w-4 accent-[#0e5a4f]" /><span><span className="block font-bold text-[#21433c]">{course.code}</span><span className="mt-1 block text-sm leading-5 text-[#6a7d76]">{course.name}</span></span></label>)}</div></div><div className="mt-7 flex justify-end gap-3 border-t border-[#e6ebe6] pt-5"><Button type="button" variant="outline" onClick={onBack}>Cancel</Button><Button type="submit" disabled={selectedCourses.length === 0} className="bg-[#0e5a4f] hover:bg-[#0a4a40]"><Save className="mr-2 h-4 w-4" />{isEditing ? "Save subject" : "Create subject"}</Button></div></form></RecordCard></>;
}

export { SubjectAssignmentForm };