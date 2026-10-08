"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { validateAnswers, FormError } from "@/lib/intake/validation";
import { saveForm } from "@/lib/intake/submission";
import { supabase } from "@/lib/supabase";
import type { Answers, FormKind } from "@/lib/intake/definitions";
export function useIntakeForm(kind: FormKind) {
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notificationWarning, setNotificationWarning] = useState("");
  const [extras, setExtras] = useState<Answers>({});
  const [dirty, setDirty] = useState(false);
  const busy = useRef(false);
  const focusErrors = useRef(false);
  const upload = useRef<{ file: File; path: string; receipt: string } | undefined>(undefined);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
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
  async function discardUpload() {
    if (!upload.current) return;
    try {
      const response = await fetch("/api/resume-upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt: upload.current.receipt }),
      });
      if (response.ok) upload.current = undefined;
    } catch {
      /* Keep the receipt and reuse this upload on a retry. */
    }
  }
  async function submit(input: Answers, resume?: File) {
    if (busy.current) return false;
    setErrors({});
    let answers: Answers;
    try {
      answers = validateAnswers(kind, input);
    } catch (error) {
      if (error instanceof FormError) {
        focusErrors.current = true;
        setErrors({ ...error.fields, _form: error.message });
      }
      return false;
    }
    busy.current = true;
    setIsSubmitting(true);
    try {
      if (upload.current && upload.current.file !== resume) await discardUpload();
      if (resume && upload.current?.file !== resume) {
        if (resume.size > 4 * 1024 * 1024)
          throw new FormError({ resume: "Please upload a PDF of up to 4 MB." });
        const body = new FormData();
        body.set("resume", resume);
        const response = await fetch("/api/resume-upload", { method: "POST", body });
        const result = await response.json();
        if (!response.ok)
          throw new FormError(
            result.fields ?? { resume: "We couldn't upload your resume. Please try again." },
            response.status,
            result.error,
          );
        upload.current = { file: resume, path: result.path, receipt: result.receipt };
      }
      const result = await saveForm(
        supabase,
        kind,
        answers,
        resume ? upload.current?.path : undefined,
      );
      setNotificationWarning(result.notificationWarning);
      setDirty(false);
      upload.current = undefined;
      return true;
    } catch (error) {
      await discardUpload();
      focusErrors.current = true;
      setErrors(
        error instanceof FormError
          ? { ...error.fields, _form: error.message }
          : { _form: "We couldn't save your form. Your answers are still here. Please try again." },
      );
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
    notificationWarning,
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
export function FormPrivacy() {
  return (
    <p className="text-sm text-gray-600">
      We use your answers to organize RevolutionUC and follow up on your interest. Contact
      info@revolutionuc.com with questions about your information.
    </p>
  );
}
