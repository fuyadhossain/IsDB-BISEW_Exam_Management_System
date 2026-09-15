/** Institutional Ledger style: local role testing is a subdued evidence note, secondary to formal administrative access. */
import { ShieldCheck, UserRound } from "lucide-react";
import { isMockMode } from "@/services/api-client";

const demoAccounts = [
  { label: "Super Admin", email: "admin@isdb-bisew.org", scope: "All courses", icon: ShieldCheck },
  { label: "PWAD Admin", email: "exam.manager@isdb-bisew.org", scope: "PWAD only", icon: UserRound },
  { label: "GD Admin", email: "operations@isdb-bisew.org", scope: "GD only", icon: UserRound },
];

function DemoAdminAccess({ onSelect }) {
  if (!isMockMode) return null;
  return <section className="mt-6 border-t border-[#dfe5df] pt-4"><div className="flex items-baseline justify-between gap-3"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7a8983]">Local role check</p><p className="text-[10px] text-[#7a8983]">Password: <code className="font-semibold text-[#43645a]">Admin@123</code></p></div><p className="mt-1 text-[11px] leading-5 text-[#74837e]">Select an account to fill the form, then sign in to verify its permitted records.</p><div className="mt-2.5 flex flex-wrap gap-2">{demoAccounts.map(({ label, email, scope, icon: Icon }) => <button key={email} type="button" onClick={() => onSelect(email)} className="inline-flex items-center gap-1.5 rounded-md border border-[#dce5de] bg-[#f9fbf8] px-2.5 py-1.5 text-left text-[11px] font-semibold text-[#31564c] transition hover:border-[#93b9a8] hover:bg-[#eff6f1]"><Icon className="h-3.5 w-3.5 text-[#0e5a4f]" /><span>{label}</span><span className="font-normal text-[#789087]">· {scope}</span></button>)}</div></section>;
}

export { DemoAdminAccess };
