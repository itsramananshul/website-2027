import type { ReactNode } from "react";
export function FormShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen pt-28 pb-16 flex items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-20 -left-20 h-96 w-96 rounded-full bg-[#228CF6]/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#19E363]/10 blur-3xl" />
      </div>
      <div className="relative w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#151477] leading-tight">{title}</h1>
          <p className="mt-4 text-[#151477]/70 text-base sm:text-lg">{description}</p>
        </div>
        <div className="rounded-2xl border border-[#B7D9FF] bg-white/90 shadow-xl backdrop-blur-sm px-6 py-8 sm:px-10 sm:py-10">
          {children}
        </div>
      </div>
    </div>
  );
}
