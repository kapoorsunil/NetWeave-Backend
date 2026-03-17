import sgMail from '@sendgrid/mail'
import { env } from '../config/env.js'

let configured = false

function ensureSendGridConfigured() {
  if (configured) {
    return
  }

  if (!env.sendGridApiKey || !env.sendGridFromEmail) {
    throw new Error('SendGrid mail configuration is incomplete.')
  }

  sgMail.setApiKey(env.sendGridApiKey)
  configured = true
}

export async function sendOtpEmail({ to, purpose, otpCode }) {
  ensureSendGridConfigured()
  const purposeLabel = purpose === 'withdraw' ? 'withdraw verification' : 'sign up verification'

  await sgMail.send({
    from: env.sendGridFromEmail,
    to,
    subject: `NetWeave ${purposeLabel} OTP`,
    text: `Your NetWeave ${purposeLabel} OTP is ${otpCode}. It will expire in 10 minutes.`,
    html: `<p>Your NetWeave <strong>${purposeLabel}</strong> OTP is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px;">${otpCode}</p><p>It will expire in 10 minutes.</p>`,
  })
}
