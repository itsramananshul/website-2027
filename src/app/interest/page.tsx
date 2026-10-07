"use client";

import { useState } from "react";
import { InputField } from "@/components/ui/InputField";
import { SchoolField } from "@/components/forms/SchoolField";
import { Fields } from "@/components/forms/Fields";
import {
  useIntakeForm,
  FormMessages,
  SubmitButton,
  FormPrivacy,
} from "@/components/forms/useIntakeForm";
import { hackerOptionalFields, logisticsFields } from "@/lib/intake/definitions";
import { COUNTRIES } from "./countries";

const AGE_OPTIONS = Array.from({ length: 88 }, (_, i) => String(i + 13));
const STUDY_LEVELS = [
  "Less than Secondary / High School",
  "Secondary / High School",
  "Undergraduate University (2 year - community college or similar)",
  "Undergraduate University (3+ year)",
  "Graduate University (Masters, Professional, Doctoral, etc)",
  "Code School / Bootcamp",
  "Other Vocational / Trade Program or Apprenticeship",
  "Post Doctorate",
  "Other",
  "I'm not currently a student",
  "Prefer not to answer",
];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export default function InterestPage() {
  const [submitted, setSubmitted] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState("");
  const [school, setSchool] = useState("");
  const [levelOfStudy, setLevelOfStudy] = useState("");
  const [otherLevelOfStudy, setOtherLevelOfStudy] = useState("");
  const [country, setCountry] = useState("");
  const [mlhCoc, setMlhCoc] = useState(false);
  const [mlhSharing, setMlhSharing] = useState(false);
  const [mlhEmails, setMlhEmails] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [resume, setResume] = useState<File>();
  const {
    errors,
    setErrors,
    submit,
    isSubmitting,
    extras,
    changeExtra,
    touch,
    notificationWarning,
  } = useIntakeForm("hacker");

  function handleNameChange(setter: (v: string) => void, field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhone(e.target.value);
    if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEmail(e.target.value);
    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
  }

  function handleEmailBlur() {
    if (email && !isValidEmail(email)) {
      setErrors((prev) => ({
        ...prev,
        email: "Please enter a valid email (e.g. name@domain.com)",
      }));
    }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      await submit(
        {
          ...extras,
          firstName,
          lastName,
          age,
          phone,
          email,
          school,
          levelOfStudy,
          otherLevelOfStudy,
          country,
          mlhCoc,
          mlhSharing,
          mlhEmails,
        },
        resume,
      )
    )
      setSubmitted(true);
  }

  return (
    <div className="relative min-h-screen pt-24 pb-16 flex items-center justify-center px-4">
      {/* Decorative background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-20 -left-20 h-96 w-96 rounded-full bg-[#228CF6]/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#19E363]/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="font-mono text-sm uppercase tracking-widest text-[#228CF6] mb-2"></p>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#151477] leading-tight">
            Hacker Interest{" "}
            <span className="relative inline-block after:absolute after:left-0 after:-bottom-1 after:h-1 after:w-full after:bg-[#19E363]">
              Form
            </span>
          </h1>
          <p className="mt-4 text-[#151477]/70 text-base sm:text-lg">
            We are glad to know that you&apos;re interested — please fill out the interest form
            below and we&apos;ll reach out when registration opens.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[#B7D9FF] bg-white/90 shadow-xl backdrop-blur-sm px-6 py-8 sm:px-10 sm:py-10">
          {submitted ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#19E363]/20">
                <svg
                  className="h-8 w-8 text-[#19E363]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-[#151477]">You&apos;re on the list!</h2>
              <p className="text-[#151477]/70">
                Thanks for your interest. We&apos;ll be in touch soon.
              </p>
              {notificationWarning && (
                <p role="status" className="text-sm text-gray-600">
                  {notificationWarning}
                </p>
              )}
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              onChange={touch}
              className="flex flex-col gap-6"
              noValidate
            >
              <FormMessages errors={errors} />
              <InputField
                name="firstName"
                label="First Name"
                placeholder="e.g. Alex"
                value={firstName}
                onChange={handleNameChange(setFirstName, "firstName")}
                error={errors.firstName}
                required
              />

              <InputField
                name="lastName"
                label="Last Name"
                placeholder="e.g. Smith"
                value={lastName}
                onChange={handleNameChange(setLastName, "lastName")}
                error={errors.lastName}
                required
              />

              <div>
                <label htmlFor="age" className="mb-1 block font-semibold text-gray-900">
                  Age<span className="text-red-600">*</span>
                </label>
                <select
                  id="age"
                  name="age"
                  value={age}
                  onChange={(e) => {
                    setAge(e.target.value);
                    if (errors.age) setErrors((prev) => ({ ...prev, age: undefined }));
                  }}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  <option value="" disabled>
                    Select...
                  </option>
                  {AGE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {errors.age && <p className="mt-1 text-sm text-red-600">{errors.age}</p>}
              </div>

              <InputField
                name="phone"
                label="Phone Number"
                type="tel"
                placeholder="e.g. +1 513 555 0123"
                inputMode="tel"
                value={phone}
                onChange={handlePhoneChange}
                error={errors.phone}
                required
              />

              <InputField
                name="email"
                label="Email"
                type="email"
                placeholder="e.g. alex@example.com"
                value={email}
                onChange={handleEmailChange}
                onBlur={handleEmailBlur}
                error={errors.email}
                required
              />

              <SchoolField
                value={school}
                onChange={(val) => {
                  setSchool(val);
                  if (errors.school) setErrors((prev) => ({ ...prev, school: undefined }));
                }}
                error={errors.school}
              />

              <div>
                <label htmlFor="levelOfStudy" className="mb-1 block font-semibold text-gray-900">
                  Level of Study<span className="text-red-600">*</span>
                </label>
                <select
                  id="levelOfStudy"
                  name="levelOfStudy"
                  value={levelOfStudy}
                  onChange={(e) => {
                    setLevelOfStudy(e.target.value);
                    if (e.target.value !== "Other") setOtherLevelOfStudy("");
                    if (errors.levelOfStudy)
                      setErrors((prev) => ({ ...prev, levelOfStudy: undefined }));
                  }}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  <option value="" disabled>
                    Select...
                  </option>
                  {STUDY_LEVELS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {errors.levelOfStudy && (
                  <p className="mt-1 text-sm text-red-600">{errors.levelOfStudy}</p>
                )}
              </div>

              {levelOfStudy === "Other" && (
                <InputField
                  name="otherLevelOfStudy"
                  label="Please specify"
                  placeholder="Describe your level of study"
                  value={otherLevelOfStudy}
                  onChange={(e) => setOtherLevelOfStudy(e.target.value)}
                  error={errors.otherLevelOfStudy}
                  required
                />
              )}

              <div>
                <label htmlFor="country" className="mb-1 block font-semibold text-gray-900">
                  Country of Residence<span className="text-red-600">*</span>
                </label>
                <select
                  id="country"
                  name="country"
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    if (errors.country) setErrors((prev) => ({ ...prev, country: undefined }));
                  }}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  <option value="" disabled>
                    Select...
                  </option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {errors.country && <p className="mt-1 text-sm text-red-600">{errors.country}</p>}
              </div>

              {/* MLH Partnership Section */}
              <div className="rounded-lg border border-[#B7D9FF] bg-[#EDF6FF]/60 px-4 py-4 flex flex-col gap-4">
                <p className="text-xs text-[#151477]/70 leading-relaxed">
                  We are currently in the process of partnering with MLH. The following 3 checkboxes
                  are for this partnership. If we do not end up partnering with MLH, your
                  information will not be shared.
                </p>

                <div className="flex flex-col gap-3">
                  {/* Checkbox 1 - required */}
                  <div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        id="mlhCoc"
                        name="mlhCoc"
                        checked={mlhCoc}
                        onChange={(e) => {
                          setMlhCoc(e.target.checked);
                          if (errors.mlhCoc) setErrors((prev) => ({ ...prev, mlhCoc: undefined }));
                        }}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#151477]"
                      />
                      <span className="text-sm text-gray-900">
                        I have read and agree to the{" "}
                        <a
                          href="https://github.com/MLH/mlh-policies/blob/main/code-of-conduct.md"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#228CF6] underline hover:text-[#151477]"
                        >
                          MLH Code of Conduct
                        </a>
                        .<span className="text-red-600 ml-0.5">*</span>
                      </span>
                    </label>
                    {errors.mlhCoc && (
                      <p className="mt-1 ml-7 text-sm text-red-600">{errors.mlhCoc}</p>
                    )}
                  </div>

                  {/* Checkbox 2 - required */}
                  <div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        id="mlhSharing"
                        name="mlhSharing"
                        checked={mlhSharing}
                        onChange={(e) => {
                          setMlhSharing(e.target.checked);
                          if (errors.mlhSharing)
                            setErrors((prev) => ({ ...prev, mlhSharing: undefined }));
                        }}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#151477]"
                      />
                      <span className="text-sm text-gray-900">
                        I authorize you to share my application/registration information with Major
                        League Hacking for event administration, ranking, and administration
                        (including the creation of linked accounts on MLH and{" "}
                        <a
                          href="https://dev.to"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#228CF6] underline hover:text-[#151477]"
                        >
                          DEV
                        </a>
                        ) in line with the{" "}
                        <a
                          href="https://github.com/MLH/mlh-policies/blob/main/privacy-policy.md"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#228CF6] underline hover:text-[#151477]"
                        >
                          MLH Privacy Policy
                        </a>
                        . I further agree to the terms of both the{" "}
                        <a
                          href="https://github.com/MLH/mlh-policies/blob/main/contest-terms.md"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#228CF6] underline hover:text-[#151477]"
                        >
                          MLH Contest Terms and Conditions
                        </a>{" "}
                        and the MLH Privacy Policy.
                        <span className="text-red-600 ml-0.5">*</span>
                      </span>
                    </label>
                    {errors.mlhSharing && (
                      <p className="mt-1 ml-7 text-sm text-red-600">{errors.mlhSharing}</p>
                    )}
                  </div>

                  {/* Checkbox 3 - optional */}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      id="mlhEmails"
                      name="mlhEmails"
                      checked={mlhEmails}
                      onChange={(e) => setMlhEmails(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#151477]"
                    />
                    <span className="text-sm text-gray-900">
                      I authorize MLH + DEV to send me occasional emails about relevant events,
                      career opportunities, and community announcements.
                    </span>
                  </label>
                </div>
              </div>

              <details className="rounded-md border border-[#B7D9FF] p-4">
                <summary className="cursor-pointer font-semibold text-gray-900">
                  Optional profile and team questions
                </summary>
                <div className="mt-4 flex flex-col gap-5">
                  <Fields
                    fields={hackerOptionalFields}
                    answers={extras}
                    onChange={changeExtra}
                    errors={errors}
                  />
                </div>
              </details>
              <details className="rounded-md border border-[#B7D9FF] p-4">
                <summary className="cursor-pointer font-semibold text-gray-900">
                  Food, shirts, and accessibility
                </summary>
                <div className="mt-4 flex flex-col gap-5">
                  <Fields
                    fields={logisticsFields}
                    answers={extras}
                    onChange={changeExtra}
                    errors={errors}
                  />
                </div>
              </details>
              <section
                className="rounded-md border border-[#B7D9FF] p-4 text-gray-900"
                aria-labelledby="resume-heading"
              >
                <h2 id="resume-heading" className="font-semibold">
                  Optional resume
                </h2>
                <p id="resume-help" className="mt-2 text-sm text-gray-600">
                  Upload a PDF up to 4 MB. Your resume stays private. The resume-sharing choice
                  above tells organizers whether you want it shared with sponsors.
                </p>
                <label htmlFor="resume" className="mt-4 block font-medium">
                  Choose a PDF resume
                </label>
                <input
                  id="resume"
                  name="resume"
                  type="file"
                  accept=".pdf,application/pdf"
                  aria-describedby={errors.resume ? "resume-help resume-error" : "resume-help"}
                  aria-invalid={Boolean(errors.resume)}
                  className="mt-2 block min-h-11 w-full rounded-md border p-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#228CF6]"
                  onChange={(event) => {
                    setResume(event.target.files?.[0]);
                    setErrors((prev) => ({ ...prev, resume: undefined }));
                    touch();
                  }}
                />
                {errors.resume && (
                  <p id="resume-error" className="mt-2 text-sm text-red-700">
                    {errors.resume}
                  </p>
                )}
              </section>
              <FormPrivacy />
              <SubmitButton pending={isSubmitting} />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
