"use client";
import { useState } from "react";
import Link from "next/link";
import type { FormKind } from "@/lib/intake/definitions";
import { FormShell } from "./FormShell";
import { IntakeDetails } from "./IntakeDetails";
import { useIntakeForm, FormMessages, SubmitButton, FormPrivacy } from "./useIntakeForm";
export function SimpleIntakePage({
  kind,
  title,
  description,
}: {
  kind: FormKind;
  title: string;
  description: string;
}) {
  const form = useIntakeForm(kind);
  const [submitted, setSubmitted] = useState(false);
  return (
    <FormShell title={title} description={description}>
      {submitted ? (
        <div role="status" className="flex flex-col gap-4 text-gray-900">
          <h2 className="text-2xl font-bold text-[#151477]">Your response is saved</h2>
          <p>
            We have queued an email with a link to verify your email and review your details. If you
            already applied, request a new link below.
          </p>
          <Link href="/registration" className="text-[#228CF6] underline">
            Manage your application
          </Link>
        </div>
      ) : (
        <form
          noValidate
          onChange={form.touch}
          onSubmit={async (event) => {
            event.preventDefault();
            if (await form.submit(form.extras)) setSubmitted(true);
          }}
          className="flex flex-col gap-6"
        >
          <FormMessages errors={form.errors} />
          <IntakeDetails
            kind={kind}
            answers={form.extras}
            onChange={form.changeExtra}
            errors={form.errors}
            settings={form.settings}
          />
          <div hidden aria-hidden="true">
            <label>
              Website
              <input
                name="_trap"
                tabIndex={-1}
                autoComplete="off"
                onChange={(e) => form.changeExtra("_trap", e.target.value)}
              />
            </label>
          </div>
          <FormPrivacy settings={form.settings} />
          <SubmitButton pending={form.isSubmitting} />
        </form>
      )}
      <p className="mt-6 text-sm">
        <Link href="/" className="text-[#228CF6] underline">
          Back to RevUC
        </Link>
      </p>
    </FormShell>
  );
}
