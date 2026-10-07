"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FormShell } from "@/components/forms/FormShell";
export default function ConfirmAttendancePage() {
  const [token, setToken] = useState("");
  const [response, setResponse] = useState("yes");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const guard = useRef(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    setToken(fragment.get("token") ?? query.get("token") ?? "");
    setResponse(fragment.get("response") ?? query.get("response") ?? "yes");
    history.replaceState(null, "", window.location.pathname);
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (guard.current) return;
    guard.current = true;
    setPending(true);
    setError("");
    try {
      const result = await fetch("/api/intake/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, response }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error);
      setStatus(body.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your response. Please try again.");
    } finally {
      guard.current = false;
      setPending(false);
    }
  }
  return (
    <FormShell
      title="Confirm attendance"
      description="Save your attendance response for RevolutionUC 2027."
    >
      {error && (
        <p role="alert" className="my-4 text-red-700">
          {error}
        </p>
      )}
      {status ? (
        <p role="status" className="my-4 text-gray-900">
          Your attendance status is {status.toLowerCase()}.{" "}
          {status === "WAITLISTED" && "We will contact you if a place becomes available."}
        </p>
      ) : token ? (
        <form onSubmit={submit} className="flex flex-col gap-4 text-gray-900">
          <label htmlFor="response">Your response</label>
          <select
            id="response"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            className="rounded border p-3 text-base"
          >
            <option value="yes">Yes, I plan to attend</option>
            <option value="no">No, I cannot attend</option>
          </select>
          <p>Confirming is subject to available places. Selecting No releases your place.</p>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[#151477] px-4 py-3 text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save attendance response"}
          </button>
        </form>
      ) : (
        <p className="text-gray-900">
          Open the confirmation link from your email, or request an application link below.
        </p>
      )}
      <Link href="/registration" className="mt-6 block text-[#228CF6] underline">
        Manage your application
      </Link>
    </FormShell>
  );
}
