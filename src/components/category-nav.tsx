import { CANONICAL_CATEGORY_ORDER, categorySectionId } from "@/lib/categories";

export function CategoryNav() {
  return (
    <nav
      aria-label="Story categories"
      className="border-b border-zinc-800 px-6"
    >
      <div className="mx-auto w-full max-w-6xl">
        <ul
          className="-mx-1 flex gap-4 overflow-x-auto px-1 py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {CANONICAL_CATEGORY_ORDER.map((label) => (
            <li key={label} className="shrink-0">
              <a
                href={`#${categorySectionId(label)}`}
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 transition-colors hover:text-white"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
