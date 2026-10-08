import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

// Website-side email notification (admissions applications + contact enquiries).
// Mirrors the admin project's /api/send-email route: Gmail/SMTP via nodemailer,
// with an explicit recipient list supplied by the caller. Kept server-only so
// the SMTP credentials never reach the browser bundle.

// GET method to check if the API is working
export async function GET() {
  return NextResponse.json({ message: 'Notify API is running' });
}

function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// School inbox comes from jmis_settings.adminEmail (shared Supabase project).
async function getAdminEmail() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase
      .from('jmis_settings')
      .select('adminEmail')
      .limit(1);
    if (error) {
      console.error('Error fetching admin email from settings:', error);
      return null;
    }
    return data && data.length > 0 ? data[0].adminEmail : null;
  } catch (error) {
    console.error('Error getting admin email:', error);
    return null;
  }
}

export async function POST(request) {
  try {
    const { subject, message, recipients, replyTo } = await request.json();

    if (!subject || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: subject, message' },
        { status: 400 }
      );
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.error('❌ [notify] Gmail credentials not configured');
      return NextResponse.json(
        {
          error:
            'Email service not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.',
        },
        { status: 500 }
      );
    }

    // Build a de-duplicated recipient list. The caller may pass extra
    // recipients (e.g. onyevid/rhemaexpertsolutions); we always fold in the
    // school's adminEmail so the office is never left out.
    const provided = Array.isArray(recipients)
      ? recipients
      : typeof recipients === 'string'
        ? [recipients]
        : [];
    const adminEmail = await getAdminEmail();
    const all = [...provided, ...(adminEmail ? [adminEmail] : [])]
      .map((e) => String(e || '').trim())
      .filter(Boolean);
    // Dedupe by lowercase while preserving the first-seen original casing.
    const seen = new Set();
    const toList = all.filter((e) => {
      const k = e.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (toList.length === 0) {
      console.error('❌ [notify] No recipients resolved');
      return NextResponse.json({ error: 'No email recipients configured' }, { status: 500 });
    }

    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: toList.join(', '),
      replyTo: replyTo || undefined,
      subject,
      text: message,
    });

    console.log('✅ [notify] Email sent:', info.messageId, '→', toList.join(', '));
    return NextResponse.json({ message: 'Email sent successfully', messageId: info.messageId });
  } catch (error) {
    console.error('❌ [notify] Error sending email:', error);
    return NextResponse.json(
      { error: 'Failed to send email', details: error?.message },
      { status: 500 }
    );
  }
}
