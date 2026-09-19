export function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character
  );
}

export function formatShootDateTime(
  value: string | Date | null,
  timeZone: string
) {
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

function clientInvitationHtml(params: {
  hello: string;
  photographerName: string;
  shootTitle: string;
  dateTime: string;
  location: string;
  accessUntil: string | null;
  preparationUrl: string;
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
<body style="margin:0;padding:0;background:#faf9f6;color:#171613;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(params.photographerName)} has created your private MIRA Shoot Room.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#faf9f6;">
    <tr>
      <td class="mira-shell" align="center" style="padding:44px 20px;">
        <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;">
          <tr>
            <td class="mira-panel" style="background:#ffffff;padding:54px 48px;color:#28251f;">
              <p style="margin:0 0 34px;color:#756044;font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:0.28em;">MIRA</p>
              <p style="margin:0 0 14px;color:#756044;font-size:11px;font-weight:700;letter-spacing:0.2em;line-height:1.5;">YOUR SHOOT STARTS HERE</p>
              <h1 class="mira-title" style="margin:0 0 28px;color:#28251f;font-family:Georgia,'Times New Roman',serif;font-size:42px;font-weight:400;line-height:1.1;">You’re invited to a shoot.</h1>
              <p style="margin:0 0 16px;color:#28251f;font-size:16px;line-height:1.75;">${escapeHtml(params.hello)}</p>
              <p style="margin:0 0 16px;color:#4e493f;font-size:16px;line-height:1.75;">${escapeHtml(params.lead)}</p>
              <p style="margin:0 0 30px;color:#4e493f;font-size:16px;line-height:1.75;">${escapeHtml(params.body)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 34px;">
                <tr>
                  <td align="center" style="background:#d5bc89;">
                    <a class="mira-button" href="${escapeHtml(params.preparationUrl)}" style="display:block;padding:18px 24px;color:#171613;font-size:13px;font-weight:700;letter-spacing:0.08em;text-decoration:none;">Confirm your shoot</a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #4b463d;border-bottom:1px solid #4b463d;margin:0 0 30px;">
                <tr><td style="padding:22px 0 8px;color:#756044;font-size:10px;font-weight:700;letter-spacing:0.2em;">YOUR SHOOT</td></tr>
                <tr><td style="padding:0 0 8px;color:#28251f;font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:1.35;">${escapeHtml(params.shootTitle)}</td></tr>
                <tr><td style="padding:0 0 6px;color:#4e493f;font-size:14px;line-height:1.6;">${escapeHtml(params.dateTime)}</td></tr>
                <tr><td style="padding:0 0 22px;color:#4e493f;font-size:14px;line-height:1.6;">${escapeHtml(params.location)}</td></tr>
              </table>
              <p style="margin:0 0 10px;color:#655f55;font-size:12px;line-height:1.7;">${escapeHtml(accessCopy)}</p>
              <p style="margin:0;color:#655f55;font-size:12px;line-height:1.7;">Save this email so you can return before your shoot. This private room is intended only for you.</p>
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
  const accessUntil = params.accessUntil
    ? formatShootDateTime(params.accessUntil, params.timeZone)
    : null;
  const accessText = accessUntil
    ? `\nYour private Shoot Room will remain available until ${accessUntil}.`
    : "";
  const lead = `${params.photographerName} invited you to ${params.shootTitle}.`;
  const body =
    "Do these details work for you? Confirm your shoot, then choose when to prepare with MIRA. Your photographer will review the plan before you shoot.";
  return {
    subject: `${params.photographerName} invited you to a shoot`,
    text: `${hello}\n\n${lead}\nDate: ${dateTime}\nLocation: ${location}\n\n${body}\n\nCONFIRM YOUR SHOOT: ${params.preparationUrl}\n\nSave this email to return to the same private room.${accessText}`,
    html: clientInvitationHtml({
      hello,
      photographerName: params.photographerName,
      shootTitle: params.shootTitle,
      dateTime,
      location,
      accessUntil,
      preparationUrl: params.preparationUrl,
      lead,
      body,
    }),
  };
}

export function preparationGuidanceEmail(params: {
  clientFirstName: string | null;
  preparationUrl: string;
}) {
  const hello = greeting(params.clientFirstName);
  const text = `${hello}\n\nYour private Shoot Room is ready.\n\nBegin by calling MIRA. She will ask about you, what you want from the photographs and the practical details that will help you arrive prepared.\n\nYou can also review the shoot information and add optional visual references.\n\nCALL MIRA: ${params.preparationUrl}\n\nYou do not need to prepare perfect answers. The conversation is there to help shape the direction with you.`;
  return {
    subject: "Let’s prepare for your remote photoshoot",
    text,
    html: `<p>${escapeHtml(hello)}</p><p>Your private Shoot Room is ready.</p><p>Begin by calling MIRA. She will ask about you, what you want from the photographs and the practical details that will help you arrive prepared.</p><p>You can also review the shoot information and add optional visual references.</p>${ctaHtml("CALL MIRA", params.preparationUrl)}<p>You do not need to prepare perfect answers. The conversation is there to help shape the direction with you.</p>`,
  };
}

export function callMiraReminderEmail(params: {
  clientFirstName: string | null;
  photographerName: string;
  preparationUrl: string;
}) {
  const hello = greeting(params.clientFirstName);
  const text = `${hello}\n\nYour remote photoshoot with ${params.photographerName} is approaching.\n\nWhen you are ready, open your private Shoot Room and call MIRA. The conversation will help your photographer understand what matters before the session begins.\n\nCONTINUE YOUR PREPARATION: ${params.preparationUrl}\n\nYour progress is saved, so you can return to the same private room.`;
  return {
    subject: "A reminder to prepare with MIRA",
    text,
    html: `<p>${escapeHtml(hello)}</p><p>Your remote photoshoot with ${escapeHtml(params.photographerName)} is approaching.</p><p>When you are ready, open your private Shoot Room and call MIRA. The conversation will help your photographer understand what matters before the session begins.</p>${ctaHtml("CONTINUE YOUR PREPARATION", params.preparationUrl)}<p>Your progress is saved, so you can return to the same private room.</p>`,
  };
}

export function shootDayReminderEmail(params: {
  clientFirstName: string | null;
  photographerName: string;
  scheduledAt: string | Date;
  timeZone: string;
  location: string | null;
  preparationUrl: string;
  requestedReminder?: boolean;
}) {
  const hello = greeting(params.clientFirstName);
  const dateTime = formatShootDateTime(params.scheduledAt, params.timeZone);
  const location = params.location || "Location to be confirmed";
  const checklist = [
    "Charge your phone",
    "Clean the back-camera lens",
    "Check your internet connection",
    "Prepare the agreed wardrobe and space",
    "Keep your private Shoot Room available for the final plan",
  ];
  const text = `${hello}\n\nYour remote photoshoot with ${params.photographerName} is coming up.\n\nDate: ${dateTime}\nLocation: ${location}\n\nBefore the session:\n${checklist.map(item => `• ${item}`).join("\n")}\n\nOPEN YOUR SHOOT ROOM: ${params.preparationUrl}\n\nYour photographer will guide you during the session.`;
  return {
    subject: params.requestedReminder
      ? "Your shoot reminder"
      : "Your remote photoshoot is coming up",
    text,
    html: `<p>${escapeHtml(hello)}</p><p>Your remote photoshoot with ${escapeHtml(params.photographerName)} is coming up.</p><p><strong>Date:</strong> ${escapeHtml(dateTime)}<br><strong>Location:</strong> ${escapeHtml(location)}</p><p>Before the session:</p><ul>${checklist.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>${ctaHtml("OPEN YOUR SHOOT ROOM", params.preparationUrl)}<p>Your photographer will guide you during the session.</p>`,
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

export function readyToShootEmail(params: {
  clientFirstName: string | null;
  photographerName: string;
  shootTitle: string;
  scheduledAt: string | Date | null;
  timeZone: string;
  preparationUrl: string;
}) {
  const hello = greeting(params.clientFirstName);
  const dateTime = formatShootDateTime(params.scheduledAt, params.timeZone);
  const text = `${hello}\n\n${params.photographerName} has reviewed your preparation and confirmed the creative direction. You're ready to shoot.\n\nShoot: ${params.shootTitle}\nDate: ${dateTime}\n\nREVIEW YOUR SHOOT ROOM: ${params.preparationUrl}\n\nSee you soon.`;
  return {
    subject: "You're ready to shoot",
    text,
    html: `<p>${escapeHtml(hello)}</p><p>${escapeHtml(params.photographerName)} has reviewed your preparation and confirmed the creative direction. You're ready to shoot.</p><p><strong>${escapeHtml(params.shootTitle)}</strong><br>${escapeHtml(dateTime)}</p>${ctaHtml("REVIEW YOUR SHOOT ROOM", params.preparationUrl)}<p>See you soon.</p>`,
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
