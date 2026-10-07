"use client";
import { useEffect, useState } from "react";
import { Fields } from "./Fields";
import { SubmitButton } from "./useIntakeForm";
import type { Answers } from "@/lib/intake/definitions";
import { FormError } from "@/lib/intake/validation";
const list = (value: unknown) =>
  String(value ?? "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
export function ProjectForm({
  token,
  email,
  run,
}: {
  token: string;
  email: string;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Answers>({
    memberEmails: email,
    categories: [],
    rulesAccepted: false,
  });
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [rules, setRules] = useState("");
  const [maximum, setMaximum] = useState(0);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/intake/project", {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        setCategories(data.categories);
        setRules(data.rules ?? "");
        setMaximum(data.maximum ?? 0);
        if (data.project) {
          setStatus(data.project.status);
          setAnswers({
            ...data.project.data,
            memberEmails: data.project.data.memberEmails.join("\n"),
            githubMembers: data.project.data.githubMembers.join("\n"),
          });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [token]);
  return (
    <section className="mt-6 space-y-4 text-gray-900">
      <h2 className="text-xl font-bold text-[#151477]">Project and team submission</h2>
      <p>
        Each teammate must register individually. This records your actual team for organizer review
        alongside your Devpost project.
      </p>
      <p className="whitespace-pre-wrap">{rules}</p>
      <p>Maximum team size: {maximum || "The organizers will confirm this."}</p>
      {message && <p role="status">{message}</p>}
      {status === "REVIEWED" ? (
        <p>This project was reviewed. Contact an organizer to change the roster.</p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              setPending(true);
              try {
                const response = await fetch("/api/intake/project", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({
                    ...answers,
                    memberEmails: list(answers.memberEmails),
                    githubMembers: list(answers.githubMembers),
                  }),
                });
                const data = await response.json();
                if (!response.ok) throw new FormError({}, response.status, data.error);
                setMessage("Project and roster saved for organizer review.");
              } finally {
                setPending(false);
              }
            });
          }}
        >
          <Fields
            fields={[
              { name: "name", label: "Project name", required: true },
              {
                name: "description",
                label: "Project description",
                type: "textarea",
                required: true,
              },
              { name: "devpostUrl", label: "Devpost project link", type: "url", required: true },
              { name: "githubUrl", label: "GitHub repository", type: "url" },
              { name: "demoUrl", label: "Demo or video link", type: "url" },
              {
                name: "memberEmails",
                label: "Actual team members' registration emails",
                type: "textarea",
                required: true,
                help: "One email per line, including yours.",
              },
              {
                name: "githubMembers",
                label: "Actual team members' GitHub usernames",
                type: "textarea",
                help: "One username per line.",
              },
              {
                name: "disclosures",
                label: "Disclosures required by the event rules",
                type: "textarea",
              },
              {
                name: "rulesAccepted",
                label: "I have read and agree to the project rules above.",
                type: "checkbox",
                required: true,
              },
            ]}
            answers={answers}
            onChange={(key, value) => setAnswers((p) => ({ ...p, [key]: value }))}
          />
          <fieldset>
            <legend className="mb-2 font-semibold">Prize categories</legend>
            {categories.map((c) => (
              <label key={c.id} className="my-2 flex gap-3">
                <input
                  type="checkbox"
                  checked={Array.isArray(answers.categories) && answers.categories.includes(c.id)}
                  onChange={(e) =>
                    setAnswers((p) => ({
                      ...p,
                      categories: e.target.checked
                        ? [...(Array.isArray(p.categories) ? p.categories : []), c.id]
                        : (Array.isArray(p.categories) ? p.categories : []).filter(
                            (id) => id !== c.id,
                          ),
                    }))
                  }
                />
                {c.name}
              </label>
            ))}
          </fieldset>
          <SubmitButton pending={pending} label="Save project and team" />
        </form>
      )}
    </section>
  );
}
