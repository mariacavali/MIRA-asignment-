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

export function clientShootRoomInvitationEmail(params: {
  clientFirstName: string | null;
  photographerName: string;
  shootTitle: string;
  scheduledAt: string | Date | null;
  timeZone: string;
  location: string | null;
  accessUntil: string | Date | null;
  preparationUrl: string;
  sentAt?: string | Date;
}) {
  const hello = greeting(params.clientFirstName);
  const dateTime = formatShootDateTime(params.scheduledAt, params.timeZone);
  const location = params.location || "Location to be confirmed";
  const hoursUntilShoot = params.scheduledAt
    ? (new Date(params.scheduledAt).getTime() - new Date(params.sentAt ?? Date.now()).getTime()) / 3_600_000
    : Number.POSITIVE_INFINITY;
  const accessUntil = params.accessUntil ? formatShootDateTime(params.accessUntil, params.timeZone) : null;
  const accessText = accessUntil ? `\n\nYour private Shoot Room will remain available until ${accessUntil}.` : "";
  const saveText = "Save this email so you can return to your private Shoot Room at any time before the session and until one day after your shoot.";
  if (hoursUntilShoot >= 0 && hoursUntilShoot < 24) {
    const text = `${hello}\n\nYour shoot with ${params.photographerName} is coming up very soon. Open your private Shoot Room now to review the plan and talk to MIRA—or continue in text if voice is unavailable.\n\nOPEN YOUR PRIVATE SHOOT ROOM: ${params.preparationUrl}\n\nDate: ${dateTime}\nLocation: ${location}\n\nThis link is private and intended only for you.`;
    return {
      subject: "Your shoot is soon — open your private Shoot Room",
      text,
      html: `<p>${escapeHtml(hello)}</p><p>Your shoot with ${escapeHtml(params.photographerName)} is coming up very soon. Open your private Shoot Room now to review the plan and talk to MIRA—or continue in text if voice is unavailable.</p>${ctaHtml("OPEN YOUR PRIVATE SHOOT ROOM", params.preparationUrl)}<p><strong>Date:</strong> ${escapeHtml(dateTime)}<br><strong>Location:</strong> ${escapeHtml(location)}</p><p>This link is private and intended only for you.</p>`,
    };
  }
  if (hoursUntilShoot >= 0 && hoursUntilShoot < 48) {
    const text = `${hello}\n\n${params.photographerName} has invited you to prepare for your upcoming shoot. Because the shoot is close, everything you need is in this one message.\n\nOpen your private Shoot Room to review the details, talk to MIRA or continue in text, add any useful visual references, and check the practical plan.\n\nOPEN YOUR PRIVATE SHOOT ROOM: ${params.preparationUrl}\n\nShoot: ${params.shootTitle}\nDate: ${dateTime}\nLocation: ${location}${accessText}\n\nThis link is private and intended only for you.`;
    return {
      subject: "Your private MIRA Shoot Room is ready",
      text,
      html: `<p>${escapeHtml(hello)}</p><p>${escapeHtml(params.photographerName)} has invited you to prepare for your upcoming shoot. Because the shoot is close, everything you need is in this one message.</p><p>Open your private Shoot Room to review the details, talk to MIRA or continue in text, add any useful visual references, and check the practical plan.</p>${ctaHtml("OPEN YOUR PRIVATE SHOOT ROOM", params.preparationUrl)}<p><strong>Shoot:</strong> ${escapeHtml(params.shootTitle)}<br><strong>Date:</strong> ${escapeHtml(dateTime)}<br><strong>Location:</strong> ${escapeHtml(location)}</p>${accessUntil ? `<p>${escapeHtml(`Your private Shoot Room will remain available until ${accessUntil}.`)}</p>` : ""}<p>This link is private and intended only for you.</p>`,
    };
  }
  const text = `${hello}\n\n${params.photographerName} has invited you into your private MIRA Shoot Room for your upcoming remote photoshoot.\n\nInside, you can review the shoot details, speak with MIRA and prepare the creative and practical direction together.\n\nOPEN YOUR PRIVATE SHOOT ROOM: ${params.preparationUrl}\n\nShoot: ${params.shootTitle}\nDate: ${dateTime}\nLocation: ${location}${accessText}\n\nThis link is private and intended only for you.\n\n${saveText}`;
  return {
    subject: `${params.photographerName} invited you to prepare for your shoot`,
    text,
    html: `<p>${escapeHtml(hello)}</p><p>${escapeHtml(params.photographerName)} has invited you into your private MIRA Shoot Room for your upcoming remote photoshoot.</p><p>Inside, you can review the shoot details, speak with MIRA and prepare the creative and practical direction together.</p>${ctaHtml("OPEN YOUR PRIVATE SHOOT ROOM", params.preparationUrl)}<p><strong>Shoot:</strong> ${escapeHtml(params.shootTitle)}<br><strong>Date:</strong> ${escapeHtml(dateTime)}<br><strong>Location:</strong> ${escapeHtml(location)}</p>${accessUntil ? `<p>${escapeHtml(`Your private Shoot Room will remain available until ${accessUntil}.`)}</p>` : ""}<p>This link is private and intended only for you.</p><p>${saveText}</p>`,
  };
}

export function preparationGuidanceEmail(params: { clientFirstName: string | null; preparationUrl: string }) {
  const hello = greeting(params.clientFirstName);
  const text = `${hello}\n\nYour private Shoot Room is ready.\n\nBegin by calling MIRA. She will ask about you, what you want from the photographs and the practical details that will help you arrive prepared.\n\nYou can also review the shoot information and add optional visual references.\n\nCALL MIRA: ${params.preparationUrl}\n\nYou do not need to prepare perfect answers. The conversation is there to help shape the direction with you.`;
  return {
    subject: "Let’s prepare for your remote photoshoot",
    text,
    html: `<p>${escapeHtml(hello)}</p><p>Your private Shoot Room is ready.</p><p>Begin by calling MIRA. She will ask about you, what you want from the photographs and the practical details that will help you arrive prepared.</p><p>You can also review the shoot information and add optional visual references.</p>${ctaHtml("CALL MIRA", params.preparationUrl)}<p>You do not need to prepare perfect answers. The conversation is there to help shape the direction with you.</p>`,
  };
}

export function callMiraReminderEmail(params: { clientFirstName: string | null; photographerName: string; preparationUrl: string }) {
  const hello = greeting(params.clientFirstName);
  const text = `${hello}\n\nYour remote photoshoot with ${params.photographerName} is approaching.\n\nWhen you are ready, open your private Shoot Room and call MIRA. The conversation will help your photographer understand what matters before the session begins.\n\nCONTINUE YOUR PREPARATION: ${params.preparationUrl}\n\nYour progress is saved, so you can return to the same private room.`;
  return {
    subject: "A reminder to prepare with MIRA",
    text,
    html: `<p>${escapeHtml(hello)}</p><p>Your remote photoshoot with ${escapeHtml(params.photographerName)} is approaching.</p><p>When you are ready, open your private Shoot Room and call MIRA. The conversation will help your photographer understand what matters before the session begins.</p>${ctaHtml("CONTINUE YOUR PREPARATION", params.preparationUrl)}<p>Your progress is saved, so you can return to the same private room.</p>`,
  };
}

export function shootDayReminderEmail(params: { clientFirstName: string | null; photographerName: string; scheduledAt: string | Date; timeZone: string; location: string | null; preparationUrl: string }) {
  const hello = greeting(params.clientFirstName);
  const dateTime = formatShootDateTime(params.scheduledAt, params.timeZone);
  const location = params.location || "Location to be confirmed";
  const checklist = ["Charge your phone", "Clean the back-camera lens", "Check your internet connection", "Prepare the agreed wardrobe and space", "Keep your private Shoot Room available for the final plan"];
  const text = `${hello}\n\nYour remote photoshoot with ${params.photographerName} is scheduled for tomorrow.\n\nDate: ${dateTime}\nLocation: ${location}\n\nBefore the session:\n${checklist.map(item => `• ${item}`).join("\n")}\n\nOPEN YOUR SHOOT ROOM: ${params.preparationUrl}\n\nYour photographer will guide you during the session.`;
  return {
    subject: "Your remote photoshoot is tomorrow",
    text,
    html: `<p>${escapeHtml(hello)}</p><p>Your remote photoshoot with ${escapeHtml(params.photographerName)} is scheduled for tomorrow.</p><p><strong>Date:</strong> ${escapeHtml(dateTime)}<br><strong>Location:</strong> ${escapeHtml(location)}</p><p>Before the session:</p><ul>${checklist.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>${ctaHtml("OPEN YOUR SHOOT ROOM", params.preparationUrl)}<p>Your photographer will guide you during the session.</p>`,
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
