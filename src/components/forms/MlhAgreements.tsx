"use client";
import { COC_URL, MLH_COC, MLH_SHARING, MLH_EMAILS, MLH_PENDING } from "@/lib/intake/consents";
import type { Answers } from "@/lib/intake/definitions";
export function MlhAgreements({
  answers,
  onChange,
  errors,
  partnerConfirmed = false,
}: {
  answers: Answers;
  onChange: (name: string, value: Answers[string]) => void;
  errors?: Record<string, string | undefined>;
  partnerConfirmed?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[#B7D9FF] bg-[#EDF6FF]/60 px-4 py-4">
      {!partnerConfirmed && <p className="text-sm text-[#151477]/70">{MLH_PENDING}</p>}
      {[
        { name: "mlhCoc", text: MLH_COC, required: true },
        { name: "mlhSharing", text: MLH_SHARING, required: true },
        { name: "mlhEmails", text: MLH_EMAILS, required: false },
      ].map((field) => (
        <div key={field.name}>
          <label className="flex min-h-6 cursor-pointer items-start gap-3 text-sm text-gray-900">
            <input
              id={field.name}
              name={field.name}
              type="checkbox"
              checked={answers[field.name] === true}
              onChange={(e) => onChange(field.name, e.target.checked)}
              aria-invalid={Boolean(errors?.[field.name])}
              aria-describedby={errors?.[field.name] ? `${field.name}-error` : undefined}
              className="mt-1 h-4 w-4 shrink-0 accent-[#151477]"
            />
            <span>
              {field.text}
              {field.required && (
                <span aria-hidden="true" className="text-red-600">
                  {" "}
                  *
                </span>
              )}
            </span>
          </label>
          {field.name === "mlhCoc" && (
            <p className="ml-7 text-sm">
              <a
                href={COC_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#228CF6] underline"
              >
                MLH Code of Conduct
              </a>
            </p>
          )}
          {field.name === "mlhSharing" && (
            <p className="ml-7 text-sm">
              <a
                href="https://dev.to"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#228CF6] underline"
              >
                DEV
              </a>
              {" · "}
              <a
                href="https://github.com/MLH/mlh-policies/blob/main/contest-terms.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#228CF6] underline"
              >
                Contest terms
              </a>
              {" · "}
              <a
                href="https://github.com/MLH/mlh-policies/blob/main/privacy-policy.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#228CF6] underline"
              >
                Privacy policy
              </a>
            </p>
          )}
          {errors?.[field.name] && (
            <p id={`${field.name}-error`} className="mt-1 text-sm text-red-600">
              {errors[field.name]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
