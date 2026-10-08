"use client";

import { supabase } from "./supabaseClient";
import { parseRecipients } from '../src/utils/resultRecipients';

// Extra staff to copy on every website enquiry / admissions notification. The
// school office address (bluebell_settings.adminEmail) is folded in server-side by
// /api/notify, so only the additions are listed here — and they come from the
// environment, never from a hard-coded mailbox.
const STAFF_NOTIFY_EMAILS = parseRecipients(process.env.NEXT_PUBLIC_RESULT_EMAIL_RECIPIENTS);

// Fire-and-forget server notification. Never throws — a failed email must not
// block the visitor; the DB row is already the source of truth.
async function notifySchool({ subject, text, replyTo, recipients = [] }) {
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        message: text,
        replyTo,
        recipients: [...recipients, ...STAFF_NOTIFY_EMAILS],
      }),
    });
  } catch (err) {
    console.error("School notification failed:", err?.message || err);
  }
}

// Stores an enquiry in bluebell_enquiries (admin follow-up pipeline, Phase 3b)
// and emails the school + staff via /api/notify. The DB insert is the source
// of truth; an email failure still keeps the enquiry captured.
export async function submitEnquiry({
  name,
  email,
  phone = "",
  enquiryType = "general",
  childAgeClass = "",
  message,
  source = "website",
}) {
  const row = {
    name,
    email,
    phone,
    enquiry_type: enquiryType,
    child_age_class: childAgeClass,
    message,
    status: "new",
    source,
  };

  const { error: dbError } = await supabase.from("bluebell_enquiries").insert(row);
  if (dbError) {
    console.error("Enquiry insert failed:", dbError);
    throw new Error("Could not send your message right now. Please try again or call the school office.");
  }

  // Best-effort email notification — never blocks the visitor.
  const label = source === "website-admissions" ? "Admissions" : "Website enquiry";
  await notifySchool({
    subject: `${label}: ${name}${enquiryType ? ` (${enquiryType})` : ""}`,
    text: `New ${label.toLowerCase()} from ${name} <${email}>.\n\n${message}${phone ? `

Phone: ${phone}` : ""}${childAgeClass ? `
Child's class/age: ${childAgeClass}` : ""}${enquiryType ? `
Enquiry type: ${enquiryType}` : ""}`,
    replyTo: email,
  });
}

// Inserts an application row and links an enquiry with the same contact email.
// Column names match bluebell_admissions_applications (platform_website_enquiries_setup.sql).
export async function submitApplication({
  parentName,
  parentEmail,
  parentPhone,
  parentAddress = "",
  childName,
  childDOB = "",
  childSex = "",
  applyingClass = "",
  currentSchool = "",
  specialNeeds = "",
  preferredVisitDate = "",
  message = "",
}) {
  const { error: appError } = await supabase.from("bluebell_admissions_applications").insert({
    parent_name: parentName,
    parent_email: parentEmail,
    parent_phone: parentPhone,
    parent_address: parentAddress,
    child_name: childName,
    child_dob: childDOB,
    child_sex: childSex,
    applying_class: applyingClass,
    current_school: currentSchool,
    special_needs: specialNeeds,
    preferred_visit_date: preferredVisitDate,
    message,
    status: "submitted",
  });
  if (appError) {
    console.error("Application insert failed:", appError);
    throw new Error("Could not submit the application right now. Please try again or visit the school office.");
  }

  // Compose a detailed notification so the school inbox email is actionable
  // (the full record always lives in bluebell_admissions_applications).
  const detailLines = [
    `Parent/Guardian: ${parentName} (${parentPhone}${parentAddress ? `, ${parentAddress}` : ""})`,
    `Child: ${childName}${childSex ? ` (${childSex})` : ""}${childDOB ? `, DOB ${childDOB}` : ""}`,
    applyingClass ? `Applying for: ${applyingClass}` : "",
    currentSchool ? `Current/previous school: ${currentSchool}` : "",
    specialNeeds ? `Special needs/medical: ${specialNeeds}` : "",
    preferredVisitDate ? `Preferred visit date: ${preferredVisitDate}` : "",
    message ? `Message: ${message}` : "",
  ].filter(Boolean);

  await submitEnquiry({
    name: parentName,
    email: parentEmail,
    phone: parentPhone,
    enquiryType: "admission",
    childAgeClass: `${childName}${applyingClass ? ` — applying for ${applyingClass}` : ""}`,
    message: `Online admissions application submitted.\n\n${detailLines.join("\n")}`,
    source: "website-admissions",
  });
}
