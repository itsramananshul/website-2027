"use client";
import Link from "next/link";
import { SimpleIntakePage } from "@/components/forms/SimpleIntakePage";
export default function InterestPage() {
  return (
    <>
      <SimpleIntakePage
        kind="interest"
        title="Hacker Interest Form"
        description="We are glad to know that you're interested. Join the list and we'll reach out when registration opens. This does not reserve an event spot."
      />
      <div className="relative mx-auto -mt-10 mb-12 flex max-w-lg flex-wrap justify-center gap-4 px-4 text-sm">
        <Link href="/register" className="text-[#151477] underline">
          Hacker registration
        </Link>
        <Link href="/volunteer-interest" className="text-[#151477] underline">
          Volunteer
        </Link>
        <Link href="/speaker-interest" className="text-[#151477] underline">
          Host a talk or workshop
        </Link>
        <Link href="/sponsor-representative" className="text-[#151477] underline">
          Sponsor representatives
        </Link>
        <Link href="/registration" className="text-[#151477] underline">
          Manage your application
        </Link>
      </div>
    </>
  );
}
