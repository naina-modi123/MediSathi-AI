import { SetupStep } from "@prisma/client";
import { prisma } from "../db.js";
import { normalizePhone } from "../utils/phone.js";
import { daysBitmaskFromList } from "../utils/timezone.js";
import * as messaging from "../services/twilio.client.js";

interface SetupDraft {
  patientName?: string;
  patientPhone?: string;
  patientLanguage?: string;
  medicineName?: string;
  medicineInstructions?: string;
  scheduleDays?: string[];
  windowStart?: string;
  windowEnd?: string;
  voiceEnabled?: boolean;
}

export async function getOrCreateCaregiver(phone: string) {
  return prisma.caregiver.upsert({
    where: { phone: normalizePhone(phone) },
    create: { phone: normalizePhone(phone) },
    update: {},
  });
}

async function getActiveSession(caregiverId: string) {
  return prisma.setupSession.findFirst({
    where: { caregiverId, step: { not: "done" } },
    orderBy: { updatedAt: "desc" },
  });
}

function draft(session: { draft: string | unknown }): SetupDraft {
  if (typeof session.draft === "string") {
    try {
      return JSON.parse(session.draft) as SetupDraft;
    } catch {
      return {};
    }
  }
  return (session.draft as SetupDraft) ?? {};
}

function serializeDraft(d: SetupDraft): string {
  return JSON.stringify(d);
}

async function updateSession(
  sessionId: string,
  step: SetupStep,
  patch: Partial<SetupDraft>
) {
  const session = await prisma.setupSession.findUnique({ where: { id: sessionId } });
  if (!session) return;
  const current = draft(session);
  await prisma.setupSession.update({
    where: { id: sessionId },
    data: {
      step,
      draft: serializeDraft({ ...current, ...patch }),
    },
  });
}

export async function startSetupFlow(caregiverPhone: string): Promise<void> {
  const caregiver = await getOrCreateCaregiver(caregiverPhone);

  await prisma.setupSession.updateMany({
    where: { caregiverId: caregiver.id, step: { not: "done" } },
    data: { step: "done" },
  });

  const session = await prisma.setupSession.create({
    data: {
      caregiverId: caregiver.id,
      step: "patient_name",
      draft: "{}",
    },
  });

  await messaging.sendText(
    caregiverPhone,
    "🙏 Welcome to MediSathi setup.\n\nLet's add medicine reminders for your loved one.\n\nStep 1/7: What is the patient's name?"
  );
  void session;
}

export async function handleSetupMessage(
  caregiverPhone: string,
  text: string
): Promise<boolean> {
  const upper = text.trim().toUpperCase();
  if (upper === "SETUP" || upper === "मदद" || upper === "HELP") {
    await startSetupFlow(caregiverPhone);
    return true;
  }

  const caregiver = await prisma.caregiver.findUnique({
    where: { phone: normalizePhone(caregiverPhone) },
  });
  if (!caregiver) return false;

  const session = await getActiveSession(caregiver.id);
  if (!session || session.step === "idle" || session.step === "done") {
    return false;
  }

  const d = draft(session);
  const reply = text.trim();

  switch (session.step) {
    case "patient_name":
      await updateSession(session.id, "patient_phone", { patientName: reply });
      await messaging.sendText(
        caregiverPhone,
        `Step 2/7: What is ${reply}'s WhatsApp number?\n(10-digit Indian number, e.g. 9876543210)`
      );
      break;

    // case "patient_phone": {
    //   const phone = normalizePhone(reply);
    //   await updateSession(session.id, "patient_language", { patientPhone: phone });
      // await messaging.sendListMessage(
      //   caregiverPhone,
      //   "Step 3/7: Choose reminder language:",
      //   "Select language",
      //   [
      //     {
      //       title: "Languages",
      //       rows: [
      //         { id: "lang_hi", title: "Hindi", description: "hi-IN" },
      //         { id: "lang_en", title: "English", description: "en-IN" },
      //         { id: "lang_ta", title: "Tamil", description: "ta-IN" },
      //         { id: "lang_te", title: "Telugu", description: "te-IN" },
      //         { id: "lang_bn", title: "Bengali", description: "bn-IN" },
      //       ],
      //     },
      //   ]
      // );
    //   break;
    // }

case "patient_phone": {
  const phone = normalizePhone(reply);

  await updateSession(session.id, "patient_language", {
    patientPhone: phone,
  });

  await messaging.sendText(
    caregiverPhone,
    `Step 3/7: Choose reminder language.

Please type your preferred language.

Examples:
• Hindi
• English
• Tamil
• Telugu
• Bengali
• Marathi
• Gujarati
• Punjabi

Or type:
Other`
  );

  break;
}


    // case "patient_language":
    //   await updateSession(session.id, "medicine_name", {
    //     patientLanguage: reply.startsWith("lang_") ? reply.replace("lang_", "") + "-IN" : reply,
    //   });
    //   await messaging.sendText(caregiverPhone, "Step 4/7: Medicine name? (e.g. Metformin)");
    //   break;
    
// case "patient_language": {
//   const language = reply.trim();

//   // If user types "Other"
//   if (language.toLowerCase() === "other") {
//     await messaging.sendText(
//       caregiverPhone,
//       "Please type your preferred language supported by Sarvam AI."
//     );

//    await updateSession(session.id, "patient_language", {
//   patientLanguage: "OTHER_PENDING",
// });
//     break;
//   }

//   // Save normal language
//   await updateSession(session.id, "medicine_name", {
//     patientLanguage: language,
//   });

//   await messaging.sendText(
//     caregiverPhone,
//     "Step 4/7: Medicine name? (e.g. Metformin)"
//   );

//   break;
// }

case "patient_language": {
  const language = reply.trim();

  // If waiting for custom language input
  const languageMap: Record<string, string> = {
hindi: "hi-IN",
english: "en-IN",
gujarati: "gu-IN",
tamil: "ta-IN",
telugu: "te-IN",
bengali: "bn-IN",
marathi: "mr-IN",
punjabi: "pa-IN",
kannada: "kn-IN",
malayalam: "ml-IN",
odia: "od-IN",
urdu: "ur-IN",
};

const mappedLanguage =
languageMap[language.toLowerCase()] || "hi-IN";

if (d.patientLanguage === "OTHER_PENDING") {
await updateSession(session.id, "medicine_name", {
patientLanguage: mappedLanguage,
});


    await messaging.sendText(
      caregiverPhone,
      `✅ Language saved as: ${language}`
    );

    await messaging.sendText(
      caregiverPhone,
      "Step 4/7: Medicine name? (e.g. Metformin)"
    );

    break;
  }

  // User typed "Other"
  if (language.toLowerCase() === "other") {
    await messaging.sendText(
      caregiverPhone,
      "Please type your preferred language supported by Sarvam AI."
    );

    await updateSession(session.id, "patient_language", {
      patientLanguage: "OTHER_PENDING",
    });

    break;
  }

  // Normal language flow
//   const languageMap: Record<string, string> = {
// hindi: "hi-IN",
// english: "en-IN",
// gujarati: "gu-IN",
// tamil: "ta-IN",
// telugu: "te-IN",
// bengali: "bn-IN",
// marathi: "mr-IN",
// punjabi: "pa-IN",
// kannada: "kn-IN",
// malayalam: "ml-IN",
// odia: "od-IN",
// urdu: "ur-IN",
// };

// const mappedLanguage =
// languageMap[language.toLowerCase()] || "hi-IN";

// Normal language flow
await updateSession(session.id, "medicine_name", {
patientLanguage: mappedLanguage,
});

  await messaging.sendText(
    caregiverPhone,
    "Step 4/7: Medicine name? (e.g. Metformin)"
  );

  break;
}



// case "custom_language": {
//   const customLanguage = reply.trim();

//   await updateSession(session.id, "medicine_name", {
//     patientLanguage: customLanguage,
//   });

//   await messaging.sendText(
//     caregiverPhone,
//     `✅ Language saved as: ${customLanguage}`
//   );

//   await messaging.sendText(
//     caregiverPhone,
//     "Step 4/7: Medicine name? (e.g. Metformin)"
//   );

//   break;
// }



    case "medicine_name":
      await updateSession(session.id, "medicine_instructions", { medicineName: reply });
      await messaging.sendText(
        caregiverPhone,
        "Step 5/7: Instructions? (e.g. 1 tablet after food)\nReply SKIP if none."
      );
      break;

    case "medicine_instructions": {
      const instructions = upper === "SKIP" ? null : reply;
      await updateSession(session.id, "schedule_days", {
        medicineInstructions: instructions ?? undefined,
      });
      await messaging.sendText(
        caregiverPhone,
        "Step 6/7: Which days?\nReply: mon,wed,fri OR everyday"
      );
      break;
    }

    case "schedule_days":
      await updateSession(session.id, "schedule_window_start", {
        scheduleDays: reply.split(/[,\s]+/).filter(Boolean),
      });
      await messaging.sendText(
        caregiverPhone,
        "Step 7a: Reminder window START time (24h, e.g. 08:00)"
      );
      break;

    case "schedule_window_start":
      await updateSession(session.id, "schedule_window_end", { windowStart: reply });
      await messaging.sendText(
        caregiverPhone,
        "Step 7b: Window END time (e.g. 08:20). Alerts only between start and end."
      );
      break;

    case "schedule_window_end":
      await updateSession(session.id, "voice_enabled", { windowEnd: reply });
      await messaging.sendListMessage(
        caregiverPhone,
        "Voice reminders in patient's language?",
        "Choose",
        [
          {
            title: "Voice",
            rows: [
              { id: "voice_yes", title: "Yes — text + voice" },
              { id: "voice_no", title: "Text only" },
            ],
          },
        ]
      );
      break;

    case "voice_enabled": {
      const voiceEnabled = reply.includes("yes") || reply === "voice_yes";
      const finalDraft = { ...d, voiceEnabled };
      await updateSession(session.id, "confirm", { voiceEnabled });
      await messaging.sendText(
        caregiverPhone,
        `Please confirm:\n\nPatient: ${finalDraft.patientName} (${finalDraft.patientPhone})\nMedicine: ${finalDraft.medicineName}\nDays: ${finalDraft.scheduleDays?.join(", ")}\nWindow: ${finalDraft.windowStart} - ${finalDraft.windowEnd}\nVoice: ${voiceEnabled ? "Yes" : "No"}\n\nReply YES to save, NO to cancel.`
      );
      break;
    }

    case "confirm":
      if (upper === "YES") {
        await persistSetup(caregiver.id, session.id);
        await messaging.sendText(
          caregiverPhone,
          "✅ Setup complete! Reminders will be sent during the time window.\n\nCommands: STATUS, PAUSE, RESUME, SETUP"
        );
      } else {
        await prisma.setupSession.update({
          where: { id: session.id },
          data: { step: "done" },
        });
        await messaging.sendText(caregiverPhone, "Setup cancelled. Send SETUP to try again.");
      }
      break;

    default:
      return false;
  }

  return true;
}

export async function handleSetupListReply(
  caregiverPhone: string,
  listId: string
): Promise<boolean> {
  const caregiver = await prisma.caregiver.findUnique({
    where: { phone: normalizePhone(caregiverPhone) },
  });
  if (!caregiver) return false;

  const session = await getActiveSession(caregiver.id);
  if (!session) return false;

  // if (listId.startsWith("lang_")) {
  //   const langMap: Record<string, string> = {
  //     lang_hi: "hi-IN",
  //     lang_en: "en-IN",
  //     lang_ta: "ta-IN",
  //     lang_te: "te-IN",
  //     lang_bn: "bn-IN",
  //   };
  //   await prisma.setupSession.update({
  //     where: { id: session.id },
  //     data: {
  //       step: "medicine_name",
  //       draft: serializeDraft({
  //         ...draft(session),
  //         patientLanguage: langMap[listId] ?? "hi-IN",
  //       }),
  //     },
  //   });
  //   await messaging.sendText(
  //     caregiverPhone,
  //     "Step 4/7: Medicine name? (e.g. Metformin)"
  //   );
  //   return true;
  // }

  if (listId === "voice_yes" || listId === "voice_no") {
    await handleSetupMessage(
      caregiverPhone,
      listId === "voice_yes" ? "voice_yes" : "voice_no"
    );
    return true;
  }

  return false;
}

async function persistSetup(caregiverId: string, sessionId: string): Promise<void> {
  const session = await prisma.setupSession.findUnique({ where: { id: sessionId } });
  if (!session) return;
  const d = draft(session);

  if (!d.patientName || !d.patientPhone || !d.medicineName || !d.windowStart || !d.windowEnd) {
    throw new Error("Incomplete setup draft");
  }

  const patient = await prisma.patient.upsert({
    where: { phone: normalizePhone(d.patientPhone) },
    create: {
      phone: normalizePhone(d.patientPhone),
      name: d.patientName,
      preferredLanguage: d.patientLanguage ?? "hi-IN",
      voiceEnabled: d.voiceEnabled ?? true,
    },
    update: {
      name: d.patientName,
      preferredLanguage: d.patientLanguage ?? "hi-IN",
      voiceEnabled: d.voiceEnabled ?? true,
    },
  });

  await prisma.caregiverPatient.upsert({
    where: { caregiverId_patientId: { caregiverId, patientId: patient.id } },
    create: { caregiverId, patientId: patient.id },
    update: {},
  });

  const medicine = await prisma.medicine.create({
    data: {
      patientId: patient.id,
      name: d.medicineName,
      instructions: d.medicineInstructions ?? null,
    },
  });

  await prisma.doseSchedule.create({
    data: {
      medicineId: medicine.id,
      daysOfWeek: daysBitmaskFromList(d.scheduleDays ?? ["everyday"]),
      windowStart: d.windowStart,
      windowEnd: d.windowEnd,
      voiceEnabled: d.voiceEnabled ?? true,
    },
  });

  await prisma.setupSession.update({
    where: { id: sessionId },
    data: { step: "done", patientId: patient.id },
  });
}

export async function handleFlowResponse(
  caregiverPhone: string,
  responseJson: Record<string, unknown>
): Promise<void> {
  const caregiver = await getOrCreateCaregiver(caregiverPhone);

  const patientName = String(responseJson.patient_name ?? "");
  const patientPhone = normalizePhone(String(responseJson.patient_phone ?? ""));
  const language = String(responseJson.language ?? "hi-IN");
  const medicineName = String(responseJson.medicine_name ?? "");
  const instructions = String(responseJson.instructions ?? "") || null;
  const daysRaw = String(responseJson.days ?? "everyday");
  const windowStart = String(responseJson.window_start ?? "08:00");
  const windowEnd = String(responseJson.window_end ?? "08:20");
  const voiceEnabled = responseJson.voice_enabled !== false;

  const patient = await prisma.patient.upsert({
    where: { phone: patientPhone },
    create: {
      phone: patientPhone,
      name: patientName,
      preferredLanguage: language,
      voiceEnabled,
    },
    update: { name: patientName, preferredLanguage: language, voiceEnabled },
  });

  await prisma.caregiverPatient.upsert({
    where: { caregiverId_patientId: { caregiverId: caregiver.id, patientId: patient.id } },
    create: { caregiverId: caregiver.id, patientId: patient.id },
    update: {},
  });

  const medicine = await prisma.medicine.create({
    data: {
      patientId: patient.id,
      name: medicineName,
      instructions,
    },
  });

  await prisma.doseSchedule.create({
    data: {
      medicineId: medicine.id,
      daysOfWeek: daysBitmaskFromList(daysRaw.split(/[,\s]+/)),
      windowStart,
      windowEnd,
      voiceEnabled,
      startDate: responseJson.start_date
        ? new Date(String(responseJson.start_date))
        : undefined,
      endDate: responseJson.end_date
        ? new Date(String(responseJson.end_date))
        : undefined,
    },
  });

  await messaging.sendText(
    caregiverPhone,
    `✅ Flow setup saved for ${patientName}.\nMedicine: ${medicineName}\nWindow: ${windowStart}-${windowEnd}`
  );
}

export async function handleCaregiverCommand(
  caregiverPhone: string,
  command: string
): Promise<boolean> {
  const upper = command.trim().toUpperCase();
  const caregiver = await prisma.caregiver.findUnique({
    where: { phone: normalizePhone(caregiverPhone) },
    include: {
      patients: {
        include: {
          patient: {
            include: {
              medicines: { include: { schedules: true } },
            },
          },
        },
      },
    },
  });

  if (!caregiver) {
    if (upper === "SETUP" || upper === "मदद") {
      await startSetupFlow(caregiverPhone);
      return true;
    }
    return false;
  }

  if (upper === "SETUP" || upper === "मदद" || upper === "HELP") {
    await startSetupFlow(caregiverPhone);
    return true;
  }

  if (upper === "PAUSE") {
    for (const link of caregiver.patients) {
      await prisma.patient.update({
        where: { id: link.patientId },
        data: { paused: true },
      });
    }
    await messaging.sendText(caregiverPhone, "⏸ Reminders paused for all your patients.");
    return true;
  }

  if (upper === "RESUME") {
    for (const link of caregiver.patients) {
      await prisma.patient.update({
        where: { id: link.patientId },
        data: { paused: false },
      });
    }
    await messaging.sendText(caregiverPhone, "▶️ Reminders resumed.");
    return true;
  }

  if (upper === "STATUS") {
    const lines: string[] = ["📊 Today's status:\n"];
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    for (const link of caregiver.patients) {
      const p = link.patient;
      const events = await prisma.doseEvent.findMany({
        where: {
          scheduledAt: { gte: start },
          schedule: { medicine: { patientId: p.id } },
        },
        include: { schedule: { include: { medicine: true } } },
      });
      if (events.length === 0) {
        lines.push(`${p.name}: no doses scheduled today`);
        continue;
      }
      for (const e of events) {
        lines.push(`${p.name} — ${e.schedule.medicine.name}: ${e.status}`);
      }
    }

    await messaging.sendText(caregiverPhone, lines.join("\n"));
    return true;
  }

  return false;
}
