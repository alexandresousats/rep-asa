import nodemailer from "nodemailer";

export function appOrigin() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function sendMail(input: { to: string; subject: string; text: string }) {
  const smtp = process.env.SMTP_URL;
  if (!smtp) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[mail] para ${input.to}\n${input.subject}\n${input.text}`);
    }
    return;
  }
  const from = process.env.MAIL_FROM ?? "ASA <noreply@localhost>";
  const transport = nodemailer.createTransport(smtp);
  await transport.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}
