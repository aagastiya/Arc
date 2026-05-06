import Link from "next/link";

export default function InformedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-6 text-zinc-100">
      <div className="text-center">
        <h1 className="text-5xl font-extrabold tracking-tight [font-family:var(--font-syne)]">
          You're informed.
        </h1>
        <Link href="/today" className="mt-8 inline-block text-sm text-zinc-500 hover:text-zinc-300">
          ← Back
        </Link>
      </div>
    </main>
  );
}
