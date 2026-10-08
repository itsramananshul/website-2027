"use client";
import { InputField } from "@/components/ui/InputField";
import { COC_URL } from "@/lib/intake/consents";
import { isVisible, type Field, type Answers } from "@/lib/intake/definitions";
export const CONTROL_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#228CF6]";
export function Fields({
  fields,
  answers,
  onChange,
  errors = {},
}: {
  fields: Field[];
  answers: Answers;
  onChange: (name: string, value: Answers[string]) => void;
  errors?: Record<string, string | undefined>;
}) {
  return fields
    .filter((f) => isVisible(f, answers))
    .map((field) => {
      const error = errors[field.name];
      const described =
        [field.help ? `${field.name}-help` : null, error ? `${field.name}-error` : null]
          .filter(Boolean)
          .join(" ") || undefined;
      const label = (
        <>
          {field.label}
          {field.required ? (
            <span aria-hidden="true" className="text-red-600">
              {" "}
              *
            </span>
          ) : null}
        </>
      );
      const attrs = {
        id: field.name,
        name: field.name,
        "aria-invalid": error ? (true as const) : undefined,
        "aria-describedby": described,
      };
      return (
        <div key={field.name} className="scroll-mt-28">
          {field.type === "multi" ? (
            <fieldset
              id={field.name}
              tabIndex={-1}
              aria-describedby={described}
              aria-invalid={Boolean(error)}
            >
              <legend className="mb-2 font-semibold text-gray-900">{label}</legend>
              <div className="flex flex-col gap-2">
                {field.options?.map((option) => (
                  <label key={option} className="flex min-h-6 items-center gap-3 text-gray-900">
                    <input
                      className="h-4 w-4 accent-[#151477]"
                      type="checkbox"
                      name={field.name}
                      value={option}
                      checked={
                        Array.isArray(answers[field.name]) &&
                        (answers[field.name] as string[]).includes(option)
                      }
                      onChange={(e) => {
                        const value = Array.isArray(answers[field.name])
                          ? (answers[field.name] as string[])
                          : [];
                        onChange(
                          field.name,
                          e.target.checked ? [...value, option] : value.filter((v) => v !== option),
                        );
                      }}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : field.type === "checkbox" ? (
            <label className="flex min-h-6 items-start gap-3 text-gray-900">
              <input
                {...attrs}
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-[#151477]"
                checked={answers[field.name] === true}
                onChange={(e) => onChange(field.name, e.target.checked)}
              />
              <span>
                {label}
                {field.name === "coc" && (
                  <>
                    {" "}
                    <a
                      href={COC_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#228CF6] underline"
                    >
                      Read the Code of Conduct
                    </a>
                    .
                  </>
                )}
              </span>
            </label>
          ) : field.type === "select" ? (
            <>
              <label htmlFor={field.name} className="mb-1 block font-semibold text-gray-900">
                {label}
              </label>
              <select
                {...attrs}
                className={CONTROL_CLASS}
                value={String(answers[field.name] ?? "")}
                onChange={(e) => onChange(field.name, e.target.value)}
              >
                <option value="">Select…</option>
                {field.options?.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </>
          ) : field.type === "textarea" ? (
            <>
              <label htmlFor={field.name} className="mb-1 block font-semibold text-gray-900">
                {label}
              </label>
              <textarea
                {...attrs}
                maxLength={4000}
                rows={3}
                className={CONTROL_CLASS}
                value={String(answers[field.name] ?? "")}
                onChange={(e) => onChange(field.name, e.target.value)}
              />
            </>
          ) : (
            <InputField
              name={field.name}
              label={field.label}
              required={field.required}
              type={field.type ?? "text"}
              value={String(answers[field.name] ?? "")}
              onChange={(e) => onChange(field.name, e.target.value)}
              error={error}
              aria-describedby={described}
              autoComplete={field.autoComplete}
              maxLength={field.type === "email" ? 254 : 200}
            />
          )}
          {field.help && (
            <p id={`${field.name}-help`} className="mt-1 text-sm text-gray-600">
              {field.help}
            </p>
          )}
          {error && ["multi", "checkbox", "select", "textarea"].includes(field.type ?? "") && (
            <p id={`${field.name}-error`} className="mt-1 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      );
    });
}
export function AvailabilityFields({
  answers,
  onChange,
  errors,
}: {
  kind?: string;
  answers: Answers;
  onChange: (key: string, value: Answers[string]) => void;
  errors?: Record<string, string | undefined>;
}) {
  return (
    <Fields
      fields={[
        { name: "availabilityNotes", label: "Availability or scheduling notes", type: "textarea" },
      ]}
      answers={answers}
      onChange={onChange}
      errors={errors}
    />
  );
}
