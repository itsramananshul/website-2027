"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { validateAnswers, FormError } from "@/lib/intake/validation";
import type { Answers, EventSettings, FormKind } from "@/lib/intake/definitions";
export function useIntakeForm(kind: FormKind) {
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settings, setSettings] = useState<EventSettings>();
  const [extras, setExtras] = useState<Answers>({});
  const [dirty, setDirty] = useState(false);
  const busy = useRef(false);
  const requestId = useRef<string | undefined>(undefined);
  const previous = useRef("");
  const focusErrors = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/intake/settings", { signal: controller.signal })
      .then(async (response) => {
        if (response.ok) setSettings(await response.json());
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!focusErrors.current) return;
    focusErrors.current = false;
    const key = Object.keys(errors).find((k) => k !== "_form" && errors[k]);
    if (key)
      requestAnimationFrame(() => {
        const element =
          document.getElementById(key) ??
          document.querySelector<HTMLElement>(`[name="${CSS.escape(key)}"]`);
        let parent = element?.parentElement;
        while (parent) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
          parent = parent.parentElement;
        }
        element?.focus();
      });
  }, [errors]);
  function changeExtra(name: string, value: Answers[string]) {
    setExtras((prev) => ({ ...prev, [name]: value }));
    setDirty(true);
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }
  async function submit(input: Answers) {
    if (busy.current) return false;
    setErrors({});
    let answers: Answers;
    try {
      answers = validateAnswers(kind, input, settings);
    } catch (error) {
      if (error instanceof FormError) {
        focusErrors.current = true;
        setErrors({ ...error.fields, _form: error.message });
      }
      return false;
    }
    const serialized = JSON.stringify(answers);
    if (previous.current !== serialized || !requestId.current) {
      requestId.current = crypto.randomUUID();
      previous.current = serialized;
    }
    busy.current = true;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          answers,
          requestId: requestId.current,
          website: input._trap ?? "",
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        focusErrors.current = true;
        setErrors({ ...result.fields, _form: result.error ?? "Please try again." });
        return false;
      }
      setDirty(false);
      return true;
    } catch {
      setErrors({
        _form: "We couldn't save your form. Your answers are still here. Please try again.",
      });
      return false;
    } finally {
      busy.current = false;
      setIsSubmitting(false);
    }
  }
  return {
    errors,
    setErrors,
    isSubmitting,
    submit,
    settings,
    extras,
    changeExtra,
    touch: () => setDirty(true),
  };
}
export function FormMessages({ errors }: { errors: Record<string, string | undefined> }) {
  if (!Object.values(errors).some(Boolean)) return null;
  return (
    <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">
      <p>{errors._form ?? "Please check the highlighted fields."}</p>
      {Object.entries(errors)
        .filter(([name, value]) => name !== "_form" && value)
        .map(([name, value]) => (
          <p id={`summary-${name}`} key={name}>
            {value}
          </p>
        ))}
    </div>
  );
}
export function SubmitButton({ pending, label = "Submit" }: { pending: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border-2 border-[#19E363] bg-[#151477] px-6 py-3 font-semibold text-[#EDF6FF] transition-colors hover:bg-[#19E363] hover:text-[#151477] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#228CF6] disabled:opacity-70"
    >
      {pending && (
        <LoaderCircle
          aria-hidden="true"
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
        />
      )}
      {label}
      {pending && <span className="sr-only">Saving</span>}
    </button>
  );
}
export function FormPrivacy({ settings }: { settings?: EventSettings }) {
  return (
    <p className="text-sm text-gray-600">
      {settings?.details.privacyNotice ??
        "We use your answers to organize RevolutionUC and contact you about your application. Contact info@revolutionuc.com with questions about your information."}
      {settings?.details.retentionNotice && ` ${settings.details.retentionNotice}`}
    </p>
  );
}
