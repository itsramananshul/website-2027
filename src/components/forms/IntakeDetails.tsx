"use client";
import { fieldsByKind } from "@/lib/intake/validation";
import { COUNTRIES } from "@/app/interest/countries";
import {
  hackerOptionalFields,
  logisticsFields,
  sponsorOnboardingFields,
  type FormKind,
  type Answers,
  type EventSettings,
  type Field,
} from "@/lib/intake/definitions";
import { Fields, AvailabilityFields } from "./Fields";
import { SchoolField } from "./SchoolField";
import { MlhAgreements } from "./MlhAgreements";
export function IntakeDetails({
  kind,
  answers,
  onChange,
  errors,
  settings,
  onboarding = false,
}: {
  kind: FormKind;
  answers: Answers;
  onChange: (key: string, value: Answers[string]) => void;
  errors?: Record<string, string | undefined>;
  settings?: EventSettings;
  onboarding?: boolean;
}) {
  let fields = fieldsByKind[kind];
  const optionalNames = new Set([...hackerOptionalFields, ...logisticsFields].map((f) => f.name));
  if (kind === "hacker")
    fields = fields.filter(
      (f) => !optionalNames.has(f.name) && !["mlhCoc", "mlhSharing", "mlhEmails"].includes(f.name),
    );
  return (
    <>
      {fields.map((field) =>
        field.name === "school" ? (
          <SchoolField
            key="school"
            required={field.required}
            value={String(answers.school ?? "")}
            onChange={(v) => onChange("school", v)}
            error={errors?.school}
          />
        ) : (
          <Fields
            key={field.name}
            fields={[
              field.name === "country"
                ? { ...field, type: "select", options: COUNTRIES }
                : field.name === "age"
                  ? {
                      ...field,
                      type: "select",
                      options: Array.from({ length: 83 }, (_, i) => String(i + 18)),
                    }
                  : field,
            ]}
            answers={answers}
            onChange={onChange}
            errors={errors}
          />
        ),
      )}
      {kind === "hacker" && (
        <>
          <MlhAgreements
            partnerConfirmed={settings?.details.mlhPartnerConfirmed === true}
            answers={answers}
            onChange={onChange}
            errors={errors}
          />
          <details className="rounded-md border p-4">
            <summary className="cursor-pointer font-semibold text-gray-900">
              Optional profile and team questions
            </summary>
            <div className="mt-4 flex flex-col gap-5">
              <Fields
                fields={hackerOptionalFields}
                answers={answers}
                onChange={onChange}
                errors={errors}
              />
            </div>
          </details>
          <details className="rounded-md border p-4">
            <summary className="cursor-pointer font-semibold text-gray-900">
              Food shirts and accessibility
            </summary>
            <div className="mt-4 flex flex-col gap-5">
              <Fields
                fields={logisticsFields.map((f) =>
                  f.name === "shirtSize" && settings?.details.shirtSizes?.length
                    ? { ...f, options: [...settings.details.shirtSizes, "No shirt"] }
                    : f,
                )}
                answers={answers}
                onChange={onChange}
                errors={errors}
              />
              <p className="text-sm text-gray-600">
                For a private accommodation request, contact{" "}
                {settings?.details.accessibilityContact ?? "info@revolutionuc.com"}.
              </p>
            </div>
          </details>
        </>
      )}
      {["judge-mentor", "volunteer", "speaker", "sponsor-representative"].includes(kind) && (
        <AvailabilityFields
          kind={kind}
          settings={settings}
          answers={answers}
          onChange={onChange}
          errors={errors}
        />
      )}
      {kind === "speaker" && (
        <p className="text-sm text-gray-600">
          {settings?.details.expensePolicy ??
            "Contact the organizers to confirm expense arrangements before booking travel."}
        </p>
      )}
      {onboarding && kind === "sponsor" && (
        <Fields
          fields={sponsorOnboardingFields}
          answers={answers}
          onChange={onChange}
          errors={errors}
        />
      )}
      {onboarding && !["hacker", "interest"].includes(kind) && (
        <Fields fields={logisticsFields} answers={answers} onChange={onChange} errors={errors} />
      )}
      {settings && (
        <Fields
          fields={[
            ...(settings.details.emergencyContact && kind === "hacker"
              ? [
                  {
                    name: "emergencyContact",
                    label: "Emergency contact name relationship and phone",
                  } as Field,
                ]
              : []),
            ...(settings.details.travelQuestions && kind !== "interest"
              ? [
                  {
                    name: "travelNeeds",
                    label: "Arrival parking or transport needs",
                    type: "textarea",
                  } as Field,
                ]
              : []),
            ...(settings.details.waiverUrl && kind === "hacker"
              ? [
                  {
                    name: "waiverConsent",
                    label: "I have read and agree to the event waiver.",
                    type: "checkbox",
                    required: true,
                  } as Field,
                ]
              : []),
            ...(settings.details.mediaNotice && kind !== "interest"
              ? [
                  {
                    name: "mediaConsent",
                    label: settings.details.mediaNotice,
                    type: "checkbox",
                  } as Field,
                ]
              : []),
          ]}
          answers={answers}
          onChange={onChange}
          errors={errors}
        />
      )}
      {settings?.details.waiverUrl && kind === "hacker" && (
        <a
          href={settings.details.waiverUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#228CF6] underline"
        >
          Read the event waiver
        </a>
      )}
    </>
  );
}
