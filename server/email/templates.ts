export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}

export function formatShootDateTime(value: string | Date | null, timeZone: string) {
  if (!value) return "Date and time to be confirmed";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone,
    }).format(new Date(value));
  } catch {
    return "Date and time to be confirmed";
  }
}

function greeting(clientFirstName: string | null) {
  return `Hi ${clientFirstName?.trim() || "there"},`;
}

function ctaHtml(label: string, preparationUrl: string) {
  return `<p><a href="${escapeHtml(preparationUrl)}">${escapeHtml(label)}</a></p>`;
}

// Talking to MIRA happens inside the private Shoot Room, so this secondary
// CTA intentionally points at the same link as the primary one - it exists
// so every client email carries an explicit, unambiguous "Talk to MIRA"
// call to action, not just a room link the client has to interpret.
function talkToMiraCtaText(preparationUrl: string) {
  return `\nTALK TO MIRA: ${preparationUrl}`;
}

function talkToMiraCtaHtml(preparationUrl: string) {
  return `<p><a href="${escapeHtml(preparationUrl)}">Talk to MIRA</a></p>`;
}

function clientInvitationHtml(params: {
  hello: string;
  photographerName: string;
  shootTitle: string;
  dateTime: string;
  location: string;
  accessUntil: string | null;
  preparationUrl: string;
  talkToMiraUrl: string;
  lead: string;
  body: string;
}) {
  const accessCopy = params.accessUntil
    ? `This private room remains available until ${params.accessUntil}.`
    : "Your photographer will let you know how long the private room remains available.";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MIRA · Your private Shoot Room</title>
  <style>
    @media only screen and (max-width: 640px) {
      .mira-shell { padding: 20px 12px !important; }
      .mira-panel { padding: 38px 24px !important; }
      .mira-title { font-size: 30px !important; line-height: 1.12 !important; }
      .mira-button { display: block !important; padding: 16px 18px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#efe6d4;color:#171613;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(params.photographerName)} has created your private MIRA Shoot Room.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#efe6d4;">
    <tr>
      <td class="mira-shell" align="center" style="padding:44px 20px;">
        <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;">
          <tr>
            <td class="mira-panel" style="background:#191816;padding:54px 48px;color:#f4ecde;">
              <p style="margin:0 0 34px;color:#d5bc89;font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:0.28em;">MIRA</p>
              <p style="margin:0 0 14px;color:#d5bc89;font-size:11px;font-weight:700;letter-spacing:0.2em;line-height:1.5;">YOU’RE INVITED TO PREPARE FOR YOUR SHOOT</p>
              <h1 class="mira-title" style="margin:0 0 28px;color:#f4ecde;font-family:Georgia,'Times New Roman',serif;font-size:42px;font-weight:400;line-height:1.1;">Your private Shoot Room is ready.</h1>
              <p style="margin:0 0 16px;color:#f4ecde;font-size:16px;line-height:1.75;">${escapeHtml(params.hello)}</p>
              <p style="margin:0 0 16px;color:#d8d0c4;font-size:16px;line-height:1.75;">${escapeHtml(params.lead)}</p>
              <p style="margin:0 0 30px;color:#d8d0c4;font-size:16px;line-height:1.75;">${escapeHtml(params.body)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 34px;">
                <tr>
                  <td align="center" style="background:#d5bc89;">
                    <a class="mira-button" href="${escapeHtml(params.preparationUrl)}" style="display:block;padding:18px 24px;color:#171613;font-size:13px;font-weight:700;letter-spacing:0.08em;text-decoration:none;">OPEN YOUR PRIVATE SHOOT ROOM</a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #4b463d;border-bottom:1px solid #4b463d;margin:0 0 30px;">
                <tr><td style="padding:22px 0 8px;color:#d5bc89;font-size:10px;font-weight:700;letter-spacing:0.2em;">YOUR SHOOT</td></tr>
                <tr><td style="padding:0 0 8px;color:#f4ecde;font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:1.35;">${escapeHtml(params.shootTitle)}</td></tr>
                <tr><td style="padding:0 0 6px;color:#bfb5a6;font-size:14px;line-height:1.6;">${escapeHtml(params.dateTime)}</td></tr>
                <tr><td style="padding:0 0 22px;color:#bfb5a6;font-size:14px;line-height:1.6;">${escapeHtml(params.location)}</td></tr>
              </table>
              <p style="margin:0 0 8px;color:#d8d0c4;font-size:14px;line-height:1.6;">Need help preparing?</p>
              <p style="margin:0 0 30px;"><a href="${escapeHtml(params.talkToMiraUrl)}" style="color:#d5bc89;font-size:16px;text-decoration:underline;text-underline-offset:4px;">Talk to MIRA</a></p>
              <p style="margin:0 0 10px;color:#9f978a;font-size:12px;line-height:1.7;">${escapeHtml(accessCopy)}</p>
              <p style="margin:0;color:#9f978a;font-size:12px;line-height:1.7;">Save this email so you can return before your shoot. This private room is intended only for you.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function clientShootRoomInvitationEmail(params: {
  clientFirstName: string | null;
  photographerName: string;
  shootTitle: string;
  scheduledAt: string | Date | null;
  timeZone: string;
  location: string | null;
  accessUntil: string | Date | null;
  preparationUrl: string;
  talkToMiraUrl?: string;
  sentAt?: string | Date;
}) {
  const hello = greeting(params.clientFirstName);
  const dateTime = formatShootDateTime(params.scheduledAt, params.timeZone);
  const location = params.location || "Location to be confirmed";
  const hoursUntilShoot = params.scheduledAt
    ? (new Date(params.scheduledAt).getTime() - new Date(params.sentAt ?? Date.now()).getTime()) / 3_600_000
    : Number.POSITIVE_INFINITY;
  const accessUntil = params.accessUntil ? formatShootDateTime(params.accessUntil, params.timeZone) : null;
  const talkToMiraUrl = params.talkToMiraUrl ?? `${params.preparationUrl}#mira-preparation`;
  const accessText = accessUntil ? `\n\nYour private Shoot Room will remain available until ${accessUntil}.` : "";
  const saveText = "Save this email so you can return to your private Shoot Room at any time before the session and until one day after your shoot.";
  if (hoursUntilShoot >= 0 && hoursUntilShoot < 24) {
    const text = `${hello}\n\nYour shoot with ${params.photographerName} is coming up very soon. Open your private Shoot Room now to review the plan and talk to MIRA—or continue in text if voice is unavailable.\n\nOPEN YOUR PRIVATE SHOOT ROOM: ${params.preparationUrl}\n\nShoot: ${params.shootTitle}\nDate: ${dateTime}\nLocation: ${location}${talkToMiraCtaText(talkToMiraUrl)}\n\nThis link is private and intended only for you.`;
    return {
      subject: "Your shoot is soon — open your private Shoot Room",
      text,
      html: clientInvitationHtml({ hello, photographerName: params.photographerName, shootTitle: params.shootTitle, dateTime, location, accessUntil, preparationUrl: params.preparationUrl, talkToMiraUrl, lead: `Your shoot with ${params.photographerName} is coming up very soon.`, body: "Open your private Shoot Room now to review the plan, talk to MIRA or continue in text, and check your practical readiness." }),
    };
  }
  if (hoursUntilShoot >= 0 && hoursUntilShoot < 48) {
    const text = `${hello}\n\n${params.photographerName} has invited you to prepare for your upcoming shoot. Because the shoot is close, everything you need is in this one message.\n\nOpen your private Shoot Room to review the details, talk to MIRA or continue in text, add any useful visual references, and check the practical plan.\n\nOPEN YOUR PRIVATE SHOOT ROOM: ${params.preparationUrl}\n\nShoot: ${params.shootTitle}\nDate: ${dateTime}\nLocation: ${location}${accessText}${talkToMiraCtaText(talkToMiraUrl)}\n\nThis link is private and intended only for you.`;
    return {
      subject: "Your private MIRA Shoot Room is ready",
      text,
      html: clientInvitationHtml({ hello, photographerName: params.photographerName, shootTitle: params.shootTitle, dateTime, location, accessUntil, preparationUrl: params.preparationUrl, talkToMiraUrl, lead: `${params.photographerName} has created your private MIRA Shoot Room.`, body: "Because the shoot is close, everything you need is here: review the details, share useful visual references, check the practical plan and prepare the creative direction with MIRA." }),
    };
  }
  const text = `${hello}\n\n${params.photographerName} has created your private MIRA Shoot Room.\n\nInside, you can review the session details, check your practical readiness, share visual references and prepare the creative direction with MIRA.\n\nOPEN YOUR PRIVATE SHOOT ROOM: ${params.preparationUrl}\n\nShoot: ${params.shootTitle}\nDate: ${dateTime}\nLocation: ${location}${accessText}${talkToMiraCtaText(talkToMiraUrl)}\n\nThis link is private and intended only for you.\n\n${saveText}`;
  return {
    subject: `${params.photographerName} invited you to prepare for your shoot`,
    text,
    html: clientInvitationHtml({ hello, photographerName: params.photographerName, shootTitle: params.shootTitle, dateTime, location, accessUntil, preparationUrl: params.preparationUrl, talkToMiraUrl, lead: `${params.photographerName} has created your private MIRA Shoot Room.`, body: "Inside, you can review the session details, check your practical readiness, share visual references and prepare the creative direction with MIRA." }),
  };
}

export function preparationGuidanceEmail(params: { clientFirstName: string | null; preparationUrl: string }) {
  const hello = greeting(params.clientFirstName);
  const text = `${hello}\n\nYour private Shoot Room is ready.\n\nBegin by calling MIRA. She will ask about you, what you want from the photographs and the practical details that will help you arrive prepared.\n\nYou can also review the shoot information and add optional visual references.\n\nCALL MIRA: ${params.preparationUrl}${talkToMiraCtaText(params.preparationUrl)}\n\nYou do not need to prepare perfect answers. The conversation is there to help shape the direction with you.`;
  return {
    subject: "Let’s prepare for your remote photoshoot",
    text,
    html: `<p>${escapeHtml(hello)}</p><p>Your private Shoot Room is ready.</p><p>Begin by calling MIRA. She will ask about you, what you want from the photographs and the practical details that will help you arrive prepared.</p><p>You can also review the shoot information and add optional visual references.</p>${ctaHtml("CALL MIRA", params.preparationUrl)}${talkToMiraCtaHtml(params.preparationUrl)}<p>You do not need to prepare perfect answers. The conversation is there to help shape the direction with you.</p>`,
  };
}

export function callMiraReminderEmail(params: { clientFirstName: string | null; photographerName: string; preparationUrl: string }) {
  const hello = greeting(params.clientFirstName);
  const text = `${hello}\n\nYour remote photoshoot with ${params.photographerName} is approaching.\n\nWhen you are ready, open your private Shoot Room and call MIRA. The conversation will help your photographer understand what matters before the session begins.\n\nCONTINUE YOUR PREPARATION: ${params.preparationUrl}${talkToMiraCtaText(params.preparationUrl)}\n\nYour progress is saved, so you can return to the same private room.`;
  return {
    subject: "A reminder to prepare with MIRA",
    text,
    html: `<p>${escapeHtml(hello)}</p><p>Your remote photoshoot with ${escapeHtml(params.photographerName)} is approaching.</p><p>When you are ready, open your private Shoot Room and call MIRA. The conversation will help your photographer understand what matters before the session begins.</p>${ctaHtml("CONTINUE YOUR PREPARATION", params.preparationUrl)}${talkToMiraCtaHtml(params.preparationUrl)}<p>Your progress is saved, so you can return to the same private room.</p>`,
  };
}

export function shootDayReminderEmail(params: { clientFirstName: string | null; photographerName: string; scheduledAt: string | Date; timeZone: string; location: string | null; preparationUrl: string }) {
  const hello = greeting(params.clientFirstName);
  const dateTime = formatShootDateTime(params.scheduledAt, params.timeZone);
  const location = params.location || "Location to be confirmed";
  const checklist = ["Charge your phone", "Clean the back-camera lens", "Check your internet connection", "Prepare the agreed wardrobe and space", "Keep your private Shoot Room available for the final plan"];
  const text = `${hello}\n\nYour remote photoshoot with ${params.photographerName} is scheduled for tomorrow.\n\nDate: ${dateTime}\nLocation: ${location}\n\nBefore the session:\n${checklist.map(item => `• ${item}`).join("\n")}\n\nOPEN YOUR SHOOT ROOM: ${params.preparationUrl}${talkToMiraCtaText(params.preparationUrl)}\n\nYour photographer will guide you during the session.`;
  return {
    subject: "Your remote photoshoot is tomorrow",
    text,
    html: `<p>${escapeHtml(hello)}</p><p>Your remote photoshoot with ${escapeHtml(params.photographerName)} is scheduled for tomorrow.</p><p><strong>Date:</strong> ${escapeHtml(dateTime)}<br><strong>Location:</strong> ${escapeHtml(location)}</p><p>Before the session:</p><ul>${checklist.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>${ctaHtml("OPEN YOUR SHOOT ROOM", params.preparationUrl)}${talkToMiraCtaHtml(params.preparationUrl)}<p>Your photographer will guide you during the session.</p>`,
  };
}

export function invitationEmail(params: {
  photographerName: string;
  shootTitle: string;
  clientName: string | null;
  message: string | null;
  preparationUrl: string;
}) {
  const greeting = params.clientName ? `Hello ${params.clientName},` : "Hello,";
  const lead = `${params.photographerName} has invited you to prepare for your upcoming shoot.`;
  const optionalMessage = params.message ? `\n\n${params.message}` : "";
  const text = `${greeting}\n\n${lead}${optionalMessage}\n\nShoot: ${params.shootTitle}\n\nStart your private preparation: ${params.preparationUrl}`;
  return {
    subject: `Prepare for your shoot with ${params.photographerName}`,
    text,
    html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(lead)}</p>${params.message ? `<p>${escapeHtml(params.message)}</p>` : ""}<p><strong>${escapeHtml(params.shootTitle)}</strong></p><p><a href="${escapeHtml(params.preparationUrl)}">Start your private shoot preparation</a></p>`,
  };
}

export function preparationCompletedEmail(params: {
  clientName: string | null;
  shootTitle: string;
  shootUrl: string;
}) {
  const client = params.clientName || "Your client";
  const text = `${client} completed MIRA preparation for ${params.shootTitle}.\n\nReview the Shoot: ${params.shootUrl}`;
  return {
    subject: `${client} completed shoot preparation`,
    text,
    html: `<p>${escapeHtml(client)} completed MIRA preparation for <strong>${escapeHtml(params.shootTitle)}</strong>.</p><p><a href="${escapeHtml(params.shootUrl)}">Review the Shoot in MIRA</a></p>`,
  };
}
