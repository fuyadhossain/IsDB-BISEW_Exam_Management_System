/** Account security style: administrators may rotate their own password, while identity records remain controlled by Super Admin governance. */
import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { changeAdminPassword } from "@/lib/admin-user-store";
import { PageHeader, RecordCard } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function AccountSettingsPage() {
  const { session } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword)
      return toast.error("The new password and confirmation do not match.");
    setBusy(true);
    try {
      // This was previously called without `await` — changeAdminPassword is
      // async, so the code went straight to clearing the fields and showing
      // a "Password changed" success toast before the request had even
      // finished, let alone succeeded. A wrong current password (or any
      // other server-side rejection) surfaced only as a silent unhandled
      // promise rejection in the console — the admin was told it worked
      // when it hadn't.
      await changeAdminPassword(session.userId, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed", {
        description: "Use the new password at your next sign-in.",
      });
    } catch (error) {
      toast.error(error.message ?? "Password could not be changed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="Account security"
        title="My account"
        description="Change your own password at any time. Name, username, and email are identity-controlled fields that require a Super Admin update."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <RecordCard className="p-6">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[#0e5a4f]" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
                Identity record
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#1c413b]">
                {session.name}
              </h2>
              <p className="mt-2 text-sm text-[#61746e]">{session.email}</p>
            </div>
          </div>
          <div className="mt-6 rounded-lg border border-[#dce8df] bg-[#f7faf7] p-4 text-sm leading-6 text-[#526962]">
            To change your username or email, request a Super Admin update. This
            prevents account identity changes from bypassing administrative
            review.
          </div>
        </RecordCard>
        <RecordCard className="p-6">
          <div className="flex gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 text-[#0e5a4f]" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
                Password
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#1c413b]">
                Change password
              </h2>
            </div>
          </div>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <Label>Current password</Label>
              <Input
                className="mt-1.5"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>
            <div>
              <Label>New password</Label>
              <Input
                className="mt-1.5"
                type="password"
                minLength="8"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </div>
            <div>
              <Label>Confirm new password</Label>
              <Input
                className="mt-1.5"
                type="password"
                minLength="8"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={busy}>
              <KeyRound className="mr-2 h-4 w-4" />
              {busy ? "Saving…" : "Save new password"}
            </Button>
          </form>
        </RecordCard>
      </div>
    </>
  );
}
export { AccountSettingsPage };
