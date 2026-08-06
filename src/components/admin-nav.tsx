import Link from "next/link";

const LINKS = [
  { href: "/admin", label: "Editor" },
  { href: "/admin/edition", label: "Edition" },
  { href: "/admin/entities", label: "Entities" },
] as const;

export function AdminNav({ current }: { current: string }) {
  return (
    <nav aria-label="Admin sections" className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active = link.href === current;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors ${
              active
                ? "bg-[#c8ff00] text-black"
                : "border border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
