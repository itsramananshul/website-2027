"use client";
import { useEffect, useId, useRef, useState } from "react";
import { SCHOOLS } from "@/app/interest/schools";
import { CONTROL_CLASS } from "./Fields";
const schools = [...new Set(SCHOOLS)].sort();
export function SchoolField({
  value,
  onChange,
  error,
  required = true,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [custom, setCustom] = useState(Boolean(value && !schools.includes(value)));
  const ref = useRef<HTMLDivElement>(null);
  const matches = query.trim()
    ? schools.filter((s) => s.toLowerCase().includes(query.toLowerCase())).slice(0, 20)
    : schools.slice(0, 20);
  useEffect(() => {
    if (value) setQuery(value);
  }, [value]);
  useEffect(() => {
    if (active >= 0)
      document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  function select(school: string) {
    onChange(school);
    setQuery(school);
    setOpen(false);
    setActive(-1);
  }
  return (
    <div ref={ref} className="relative scroll-mt-28">
      <label htmlFor="school" className="mb-1 block font-semibold text-gray-900">
        School
        {required && (
          <span aria-hidden="true" className="text-red-600">
            {" "}
            *
          </span>
        )}
      </label>
      <input
        id="school"
        name="school"
        className={CONTROL_CLASS}
        value={query}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : `${id}-help`}
        role={custom ? undefined : "combobox"}
        aria-expanded={custom ? undefined : open}
        aria-autocomplete={custom ? undefined : "list"}
        aria-controls={custom ? undefined : `${id}-list`}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="organization"
        onFocus={() => {
          if (!custom) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(custom ? e.target.value : "");
          setOpen(!custom);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (custom) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((a) =>
              e.key === "ArrowDown" ? Math.min(a + 1, matches.length - 1) : Math.max(a - 1, 0),
            );
          }
          if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
          if (e.key === "Enter" && open && active >= 0 && matches[active]) {
            e.preventDefault();
            select(matches[active]);
          }
        }}
      />
      {open && !custom && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 max-h-60 w-full overflow-y-auto rounded-md border bg-white shadow-lg"
        >
          {matches.map((school, index) => (
            <li
              key={school}
              id={`${id}-${index}`}
              role="option"
              aria-selected={active === index}
              className={`cursor-pointer px-3 py-2 text-gray-900 ${active === index ? "bg-[#EDF6FF]" : ""}`}
              onPointerDown={(e) => {
                e.preventDefault();
                select(school);
              }}
            >
              {school}
            </li>
          ))}
          {!matches.length && (
            <li role="presentation" className="px-3 py-2 text-gray-600">
              No matches. Use School not listed below.
            </li>
          )}
        </ul>
      )}
      <label className="mt-2 flex min-h-6 items-center gap-2 text-sm text-gray-900">
        <input
          type="checkbox"
          checked={custom}
          onChange={(e) => {
            setCustom(e.target.checked);
            setOpen(false);
            setActive(-1);
            if (e.target.checked) onChange(query);
            else {
              setQuery("");
              onChange("");
            }
          }}
        />
        School not listed
      </label>
      <p id={`${id}-help`} className="mt-1 text-sm text-gray-600">
        {custom
          ? "Enter your school name. Contact the organizers if you are unsure about eligibility."
          : "Search and choose your school, or use School not listed."}
      </p>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
