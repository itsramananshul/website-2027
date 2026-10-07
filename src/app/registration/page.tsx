"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FormShell } from "@/components/forms/FormShell";
import { IntakeDetails } from "@/components/forms/IntakeDetails";
import { ProjectForm } from "@/components/forms/ProjectForm";
import { Fields } from "@/components/forms/Fields";
import { FormMessages, SubmitButton, FormPrivacy } from "@/components/forms/useIntakeForm";
import {
  FORM_KINDS,
  type FormKind,
  type Answers,
  type EventSettings,
} from "@/lib/intake/definitions";
import { validateAnswers, FormError } from "@/lib/intake/validation";
type Owner = {
  id: string;
  kind: FormKind;
  data: Answers;
  status: string;
  verified: boolean;
  hasResume: boolean;
  offerExpiresAt: string | null;
  qrDataUrl: string | null;
};
type Resume = { id: string; name: string; major: string; graduationYear: string; email?: string };
export default function ManageRegistrationPage() {
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState<Owner>();
  const [answers, setAnswers] = useState<Answers>({});
  const [settings, setSettings] = useState<EventSettings>();
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<FormKind>("hacker");
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const busy = useRef(false);
  const dirty = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const value =
      new URLSearchParams(window.location.hash.slice(1)).get("token") ??
      sessionStorage.getItem("revuc-2027-management-token") ??
      "";
    if (value) {
      setToken(value);
      sessionStorage.setItem("revuc-2027-management-token", value);
      history.replaceState(null, "", window.location.pathname);
    }
    fetch("/api/intake/settings")
      .then(async (response) => {
        if (response.ok) setSettings(await response.json());
      })
      .catch(() => {});
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    if (!token) return;
    fetch("/api/intake/manage", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) {
          setErrors({ _form: result.error });
          setToken("");
          sessionStorage.removeItem("revuc-2027-management-token");
          return;
        }
        setOwner(result);
        setAnswers(result.data);
      })
      .catch(() => setErrors({ _form: "We couldn't load your application. Please try again." }));
  }, [token]);
  function change(name: string, value: Answers[string]) {
    setAnswers((previous) => ({ ...previous, [name]: value }));
    dirty.current = true;
    setErrors((previous) => ({ ...previous, [name]: undefined }));
  }
  async function call(path: string, options: RequestInit) {
    const response = await fetch(path, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok)
      throw new FormError(
        result.fields ?? {},
        response.status,
        result.error ?? "Please try again.",
      );
    return result;
  }
  async function run(operation: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setErrors({});
    setMessage("");
    try {
      await operation();
    } catch (error) {
      if (error instanceof FormError) {
        setErrors({ ...error.fields, _form: error.message });
        const first = Object.keys(error.fields)[0];
        requestAnimationFrame(() => {
          const element = first ? document.getElementById(first) : null;
          element?.closest("details")?.setAttribute("open", "");
          element?.focus();
        });
      } else setErrors({ _form: "We couldn't complete your request. Please try again." });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function action(value: string) {
    if (!owner) return;
    let data = answers;
    if (value === "save")
      data = validateAnswers(
        owner.kind,
        answers,
        settings,
        ["APPROVED", "ASSIGNED"].includes(owner.status),
      );
    const result = await call("/api/intake/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: value, answers: data }),
    });
    setOwner(result);
    if (value === "save" || value === "verify") {
      setAnswers(result.data);
      dirty.current = false;
    }
    setMessage(
      value === "verify"
        ? "Your email is verified."
        : value === "save"
          ? "Your details are saved."
          : `Your status is ${result.status.toLowerCase()}.`,
    );
  }
  const secondary =
    "min-h-11 rounded-md border border-[#151477] px-4 py-2 text-[#151477] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60";
  return (
    <FormShell
      title="Your RevUC Application"
      description="Verify your email, update your details, and manage your attendance."
    >
      <FormMessages errors={errors} />
      {message && (
        <p role="status" className="my-4 text-gray-900">
          {message}
        </p>
      )}
      {!token ? (
        <form
          className="mt-4 flex flex-col gap-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const response = await fetch("/api/intake/request-link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim().toLowerCase(), kind }),
              });
              const result = await response.json();
              if (!response.ok) throw new FormError({}, response.status, result.error);
              setMessage(result.message);
            });
          }}
        >
          <Fields
            fields={[
              { name: "email", label: "Email", type: "email", required: true },
              {
                name: "kind",
                label: "Application type",
                type: "select",
                required: true,
                options: FORM_KINDS,
              },
            ]}
            answers={{ email, kind }}
            onChange={(name, value) =>
              name === "email" ? setEmail(String(value)) : setKind(value as FormKind)
            }
          />
          <SubmitButton pending={pending} label="Send me a link" />
        </form>
      ) : !owner ? (
        <p role="status" className="mt-4 text-gray-900">
          Loading your application…
        </p>
      ) : (
        <>
          <p className="my-4 text-gray-900">
            Status: <strong>{owner.status.toLowerCase()}</strong>
          </p>
          {!owner.verified ? (
            <button
              type="button"
              className={secondary}
              disabled={pending}
              onClick={() => void run(() => action("verify"))}
            >
              Verify my email
            </button>
          ) : (
            <>
              {owner.kind === "interest" && settings?.registrationOpen && (
                <Link
                  href={`/register#interest=${token}`}
                  className="mb-5 block text-[#228CF6] underline"
                >
                  Continue to hacker registration
                </Link>
              )}
              {!["WITHDRAWN", "DECLINED"].includes(owner.status) && (
                <form
                  ref={formRef}
                  className="mt-5 flex flex-col gap-6"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(() => action("save"));
                  }}
                >
                  <IntakeDetails
                    kind={owner.kind}
                    answers={answers}
                    onChange={change}
                    errors={errors}
                    settings={settings}
                    onboarding={["APPROVED", "ASSIGNED"].includes(owner.status)}
                  />
                  <FormPrivacy settings={settings} />
                  <SubmitButton pending={pending} label="Save details" />
                </form>
              )}
              {owner.kind === "hacker" && (
                <div className="mt-6 flex flex-col gap-4 text-gray-900">
                  <h2 className="text-xl font-bold text-[#151477]">Attendance</h2>
                  {owner.qrDataUrl && (
                    <figure>
                      <img
                        src={owner.qrDataUrl}
                        width={240}
                        height={240}
                        alt="Your private RevolutionUC check-in QR code"
                      />
                      <figcaption className="text-sm">
                        Show this code and your student ID at check-in. Keep your code private.
                      </figcaption>
                    </figure>
                  )}
                  {owner.offerExpiresAt && (
                    <p>
                      Your offered place is held until{" "}
                      {new Date(owner.offerExpiresAt).toLocaleString(undefined, {
                        timeZone: settings?.timezone ?? "America/New_York",
                      })}
                      .
                    </p>
                  )}
                  {settings?.confirmationDeadline && (
                    <p>
                      Confirmation deadline:{" "}
                      {new Date(settings.confirmationDeadline).toLocaleString(undefined, {
                        timeZone: settings.timezone,
                      })}
                      .
                    </p>
                  )}
                  <button
                    type="button"
                    className={secondary}
                    disabled={
                      pending || dirty.current || ["WITHDRAWN", "CHECKED_IN"].includes(owner.status)
                    }
                    onClick={() => void run(() => action("confirm"))}
                  >
                    Confirm attendance
                  </button>
                  <p className="text-sm text-gray-600">
                    Save any changes before confirming attendance. If all places are taken, you will
                    join the waitlist.
                  </p>
                  <h2 className="text-xl font-bold text-[#151477]">Optional resume</h2>
                  <p className="text-sm">
                    PDF only, up to 4 MB. Sponsor sharing uses your separate permission above.
                  </p>
                  {!["WITHDRAWN", "DECLINED"].includes(owner.status) && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const body = new FormData(event.currentTarget);
                        void run(async () => {
                          await call("/api/intake/resume", { method: "POST", body });
                          setOwner({ ...owner, hasResume: true });
                          setMessage("Your resume is saved.");
                        });
                      }}
                      className="flex flex-col gap-3"
                    >
                      <label htmlFor="resume">Choose a PDF resume</label>
                      <input id="resume" name="resume" type="file" accept=".pdf,application/pdf" />
                      <SubmitButton
                        pending={pending}
                        label={owner.hasResume ? "Replace resume" : "Upload resume"}
                      />
                    </form>
                  )}
                  {owner.hasResume && (
                    <>
                      <button
                        className={secondary}
                        disabled={pending}
                        type="button"
                        onClick={() =>
                          void run(async () => {
                            const result = await call("/api/intake/resume", { method: "GET" });
                            window.location.assign(result.url);
                          })
                        }
                      >
                        Download my resume
                      </button>
                      <button
                        className={secondary}
                        disabled={pending}
                        type="button"
                        onClick={() => {
                          if (window.confirm("Remove your uploaded resume?"))
                            void run(async () => {
                              await call("/api/intake/resume", { method: "DELETE" });
                              setOwner({
                                ...owner,
                                hasResume: false,
                                data: { ...owner.data, sponsorResumeConsent: false },
                              });
                              setAnswers((previous) => ({
                                ...previous,
                                sponsorResumeConsent: false,
                              }));
                              setMessage(
                                "Your resume has been removed and sponsor resume sharing is off.",
                              );
                            });
                        }}
                      >
                        Remove resume
                      </button>
                    </>
                  )}
                </div>
              )}
              {owner.kind === "hacker" &&
                owner.status === "CHECKED_IN" &&
                settings?.details.projectSubmissionOpen && (
                  <ProjectForm token={token} email={String(owner.data.email)} run={run} />
                )}
              {owner.kind === "sponsor-representative" && owner.status === "APPROVED" && (
                <div className="mt-6 flex flex-col gap-3 text-gray-900">
                  <h2 className="text-xl font-bold text-[#151477]">Opted-in resume book</h2>
                  <button
                    type="button"
                    className={secondary}
                    disabled={pending}
                    onClick={() =>
                      void run(async () => {
                        const result = await call("/api/intake/sponsor-resumes", { method: "GET" });
                        setResumes(result.rows);
                        setNext(result.next);
                      })
                    }
                  >
                    Load resumes
                  </button>
                  {resumes.map((resume) => (
                    <div key={resume.id} className="border-b py-3">
                      <p>
                        {resume.name} {resume.major && `· ${resume.major}`}{" "}
                        {resume.graduationYear && `· ${resume.graduationYear}`}
                      </p>
                      {resume.email && <p>{resume.email}</p>}
                      <button
                        type="button"
                        className="text-[#228CF6] underline"
                        disabled={pending}
                        onClick={() =>
                          void run(async () => {
                            const result = await call(
                              `/api/intake/sponsor-resumes?id=${resume.id}`,
                              { method: "GET" },
                            );
                            window.location.assign(result.url);
                          })
                        }
                      >
                        Download resume
                      </button>
                    </div>
                  ))}
                  {next && (
                    <button
                      type="button"
                      className={secondary}
                      disabled={pending}
                      onClick={() =>
                        void run(async () => {
                          const result = await call(`/api/intake/sponsor-resumes?after=${next}`, {
                            method: "GET",
                          });
                          setResumes((previous) => [...previous, ...result.rows]);
                          setNext(result.next);
                        })
                      }
                    >
                      Load more
                    </button>
                  )}
                </div>
              )}
              {!["WITHDRAWN", "CHECKED_IN"].includes(owner.status) && (
                <button
                  type="button"
                  disabled={pending}
                  className={`${secondary} mt-6 w-full`}
                  onClick={() => {
                    if (window.confirm("Withdraw this application and release any reserved place?"))
                      void run(() => action("withdraw"));
                  }}
                >
                  Withdraw application
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="mt-6 text-[#228CF6] underline"
            onClick={() => {
              if (dirty.current && !window.confirm("Leave without saving your changes?")) return;
              sessionStorage.removeItem("revuc-2027-management-token");
              setToken("");
              setOwner(undefined);
              dirty.current = false;
            }}
          >
            Use a different application link
          </button>
        </>
      )}
    </FormShell>
  );
}
