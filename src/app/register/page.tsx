"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FormShell } from "@/components/forms/FormShell";
import { IntakeDetails } from "@/components/forms/IntakeDetails";
import {
  useIntakeForm,
  FormMessages,
  SubmitButton,
  FormPrivacy,
} from "@/components/forms/useIntakeForm";
export default function RegisterPage() {
  const form = useIntakeForm("hacker");
  const [submitted, setSubmitted] = useState(false);
  const [resume, setResume] = useState<File>();
  const [settingsFailed, setSettingsFailed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettingsFailed(true), 10000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("interest");
    if (token) {
      history.replaceState(null, "", window.location.pathname);
      fetch("/api/intake/manage", { headers: { Authorization: `Bearer ${token}` } })
        .then(async (response) => {
          if (response.ok) {
            const result = await response.json();
            if (result.kind === "interest")
              for (const key of ["firstName", "lastName", "email", "school", "referralSource"])
                if (result.data[key]) form.changeExtra(key, result.data[key]);
          }
        })
        .catch(() => {});
    }
    // Prefill once; later changes belong to the applicant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <FormShell
      title="Hacker Registration"
      description="RevolutionUC 2027 is open to students who will be at least 18 at the event. You can register without a team or previous hackathon experience."
    >
      {!form.settings ? (
        <p role="status" className="text-gray-900">
          {settingsFailed
            ? "We couldn't load registration. Please refresh or contact info@revolutionuc.com."
            : "Loading registration…"}
        </p>
      ) : !form.settings.registrationOpen ? (
        <div className="flex flex-col gap-4 text-gray-900">
          <p>Registration is not open yet.</p>
          <Link href="/interest" className="text-[#228CF6] underline">
            Join the hacker interest list
          </Link>
        </div>
      ) : submitted ? (
        <div role="status" className="flex flex-col gap-4 text-gray-900">
          <h2 className="text-2xl font-bold text-[#151477]">Your registration is saved</h2>
          <p>
            We have queued an email to verify your email and manage your registration. Saving this
            form does not confirm attendance.
          </p>
          <Link href="/registration" className="text-[#228CF6] underline">
            Manage your registration or request a new email link
          </Link>
        </div>
      ) : (
        <form
          noValidate
          onChange={form.touch}
          onSubmit={async (event) => {
            event.preventDefault();
            if (await form.submit(form.extras, resume)) setSubmitted(true);
          }}
          className="flex flex-col gap-6"
        >
          <FormMessages errors={form.errors} />
          <IntakeDetails
            kind="hacker"
            answers={form.extras}
            onChange={form.changeExtra}
            errors={form.errors}
            settings={form.settings}
          />
          <section className="rounded-md border p-4 text-gray-900" aria-labelledby="resume-heading">
            <h2 id="resume-heading" className="font-semibold">
              Optional resume
            </h2>
            <p id="resume-help" className="mt-2 text-sm text-gray-600">
              Upload a PDF up to 4 MB. Your resume stays private. Sponsors can only see it if you
              choose resume sharing and verify your email. You can replace or remove it later.
            </p>
            <label htmlFor="resume" className="mt-4 block font-medium">
              Choose a PDF resume
            </label>
            <input
              id="resume"
              name="resume"
              type="file"
              accept=".pdf,application/pdf"
              aria-describedby={form.errors.resume ? "resume-help resume-error" : "resume-help"}
              aria-invalid={Boolean(form.errors.resume)}
              className="mt-2 block w-full min-h-11 rounded-md border p-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#228CF6]"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                setResume(selected);
                form.setErrors((previous) => ({ ...previous, resume: undefined }));
                form.touch();
              }}
            />
            {form.errors.resume && (
              <p id="resume-error" className="mt-2 text-sm text-red-700">
                {form.errors.resume}
              </p>
            )}
          </section>
          <FormPrivacy settings={form.settings} />
          <SubmitButton pending={form.isSubmitting} label="Register" />
        </form>
      )}
      <p className="mt-6 text-sm">
        <Link href="/registration" className="text-[#228CF6] underline">
          Already registered? Review your details
        </Link>
      </p>
    </FormShell>
  );
}
