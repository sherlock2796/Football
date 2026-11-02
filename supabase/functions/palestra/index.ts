// Supabase Edge Function "palestra": promemoria delle 16:55 per l'app Palestra A·B·C.
//
// Chiamata:
//   - da pg_cron alle 14:55 e 15:55 UTC con { "cron": true } (vedi supabase/palestra.sql):
//     parte solo il giro che cade alle 16:55 di Roma, una volta al giorno;
//   - dall'app con { "chiavePubblica": true }  -> chiave VAPID per registrarsi;
//   - dall'app con { "iscrivi": <PushSubscription> } / { "disiscrivi": endpoint };
//   - dall'app con { "prova": true, "endpoint": ... } -> notifica di prova a quel telefono.
//
// Secrets (gli stessi della funzione "notifiche" di Impegni, già nel progetto):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY li fornisce l'ambiente
// (in mancanza, il secret CHIAVE_SERVIZIO come per Impegni).
// File unico, da incollare così com'è nel pannello di Supabase.
// deno-lint-ignore-file no-explicit-any

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHIAVE_SERVIZIO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("CHIAVE_SERVIZIO") || "";
const VAPID_PUB = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIV = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:palestra@example.com";

// ---------------------------------------------------------------- programma
const FUSO = "Europe/Rome";
const ORARIO = 16 * 60 + 55;          // 16:55
const FINESTRA_MIN = 25;              // tollera ritardi del giro fino alle 17:20
// 0 = domenica … 6 = sabato
const SEDUTE: Record<number, { hash: string; titolo: string }> = {
  1: { hash: "a", titolo: "Oggi Seduta A · squat e ginocchio" },
  3: { hash: "b", titolo: "Oggi Seduta B · stacco e catena posteriore" },
  5: { hash: "c", titolo: "Oggi Seduta C · gamba sola e stabilità" },
};
const FRASI_ALLENAMENTO = [
  "Oggi si allena. Riscaldamento, poi il primo esercizio: il resto viene da sé.",
  "Giorno di palestra. Le ginocchia forti si costruiscono una serie alla volta.",
  "Oggi tocca a te. Un'ora sola, e il te di domani ringrazia.",
  "Nessuno si è mai pentito di un allenamento fatto. Borsa pronta?",
  "Oggi alleni core e schiena: è quello che ti tiene in campo.",
  "Non serve la seduta perfetta, serve la seduta fatta. Si parte.",
  "Ricordati: RIR 2. Spingi forte, ma con la tecnica giusta.",
  "Ogni serie segnata nella scheda è un passo avanti. Oggi aggiungine qualcuna.",
  "La costanza batte la motivazione. Oggi è giorno di palestra.",
  "Le ginocchia ringraziano chi le allena. Oggi è il loro turno.",
  "Controlla i carichi dell'ultima volta e prova a battere almeno una serie.",
  "Un'ora per te: telefono in borsa, testa sugli esercizi.",
];
const FRASI_RIPOSO = [
  "Oggi niente da fare, magari fai una corsetta.",
  "Giorno di riposo: i muscoli crescono adesso. Al massimo una passeggiata.",
  "Oggi riposo. Se hai voglia di muoverti, 20 minuti di corsa leggera.",
  "Niente palestra oggi. Dormi bene e bevi acqua: anche questo è allenamento.",
  "Riposo attivo: una corsetta tranquilla o un po' di mobilità, senza strafare.",
  "Oggi recuperi, così alla prossima seduta spingi di più.",
  "Giornata libera dai pesi. Se ti va, una corsetta all'aria aperta.",
  "Riposo meritato. Dieci minuti di mobilità per anche e caviglie e sei a posto.",
];

type Notifica = { titolo: string; corpo: string; url: string; tag: string };
type Abbonamento = { endpoint: string; p256dh: string; auth: string };

export function oraRoma(d: Date) {
  const parti = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(d);
  const p = (t: string) => parti.find((x) => x.type === t)?.value ?? "";
  return {
    giorno: `${p("year")}-${p("month")}-${p("day")}`,
    minuti: Number(p("hour")) * 60 + Number(p("minute")),
    settimana: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p("weekday")),
  };
}
const aCaso = (a: string[]) => a[Math.floor(Math.random() * a.length)];
export function notificaDelGiorno(settimana: number): Notifica {
  const s = SEDUTE[settimana];
  if (s) return { titolo: s.titolo, corpo: aCaso(FRASI_ALLENAMENTO), url: "./#" + s.hash, tag: "palestra" };
  return { titolo: "Giorno di riposo", corpo: aCaso(FRASI_RIPOSO), url: "./#guida", tag: "palestra" };
}

// ---------------------------------------------------------------- http
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (dati: unknown, status = 200) =>
  new Response(JSON.stringify(dati), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const endpointValido = (e: unknown) => typeof e === "string" && /^https:\/\/[^\s]+$/.test(e) && e.length < 1000;

async function invia(admin: any, abb: Abbonamento, n: Notifica): Promise<true | string> {
  try {
    await webpush.sendNotification(
      { endpoint: abb.endpoint, keys: { p256dh: abb.p256dh, auth: abb.auth } },
      JSON.stringify(n),
      { TTL: 3 * 3600, urgency: "high" },
    );
    return true;
  } catch (e: any) {
    // 404/410: il telefono ha revocato l'iscrizione, la dimentico.
    if (e?.statusCode === 404 || e?.statusCode === 410) {
      await admin.from("palestra_push").delete().eq("endpoint", abb.endpoint);
      return "telefono non più registrato: disattiva e riattiva le notifiche";
    }
    return `stato ${e?.statusCode ?? "?"}: ${String(e?.body ?? e?.message ?? e).slice(0, 200)}`;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ errore: "Solo POST" }, 405);
  let corpo: any = {};
  try { corpo = await req.json(); } catch { corpo = {}; }

  if (corpo?.chiavePubblica) {
    if (!VAPID_PUB) return json({ errore: "Manca VAPID_PUBLIC_KEY nei secrets delle Edge Functions" }, 500);
    return json({ chiave: VAPID_PUB });
  }
  if (!VAPID_PUB || !VAPID_PRIV) return json({ errore: "Mancano VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nei secrets" }, 500);
  if (!CHIAVE_SERVIZIO) return json({ errore: "Manca la chiave di servizio: aggiungi il secret CHIAVE_SERVIZIO (Project Settings → API → service_role)" }, 500);
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUB, VAPID_PRIV);
  const admin = createClient(URL_SUPABASE, CHIAVE_SERVIZIO, { auth: { persistSession: false } });
  const erroreDb = (m: string) => /does not exist|schema cache/i.test(m)
    ? "Tabelle mancanti: esegui supabase/palestra.sql nel SQL Editor" : `Database: ${m}`;

  // ---- iscrizione / disiscrizione di un telefono
  if (corpo?.iscrivi) {
    const s = corpo.iscrivi;
    if (!endpointValido(s?.endpoint) || typeof s?.keys?.p256dh !== "string" || typeof s?.keys?.auth !== "string") {
      return json({ errore: "Iscrizione non valida" }, 400);
    }
    const { error } = await admin.from("palestra_push").upsert({
      endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth,
      dispositivo: String(corpo.dispositivo ?? "").slice(0, 160), aggiornato_il: new Date().toISOString(),
    });
    if (error) return json({ errore: erroreDb(error.message) }, 500);
    return json({ ok: true });
  }
  if (corpo?.disiscrivi) {
    if (!endpointValido(corpo.disiscrivi)) return json({ errore: "Endpoint non valido" }, 400);
    const { error } = await admin.from("palestra_push").delete().eq("endpoint", corpo.disiscrivi);
    if (error) return json({ errore: erroreDb(error.message) }, 500);
    return json({ ok: true });
  }

  // ---- notifica di prova a un solo telefono
  if (corpo?.prova) {
    if (!endpointValido(corpo.endpoint)) return json({ errore: "Endpoint non valido" }, 400);
    const { data, error } = await admin.from("palestra_push").select("*").eq("endpoint", corpo.endpoint).maybeSingle();
    if (error) return json({ errore: erroreDb(error.message) }, 500);
    if (!data) return json({ errore: "Questo telefono non risulta iscritto: tocca di nuovo Attiva notifiche" }, 404);
    const oggi = notificaDelGiorno(oraRoma(new Date()).settimana);
    const esito = await invia(admin, data, { titolo: "Notifiche attive", corpo: `Alle 16:55 arriva il promemoria. Oggi sarebbe: ${oggi.titolo.toLowerCase()}.`, url: "./#guida", tag: "palestra-prova" });
    return esito === true ? json({ ok: true }) : json({ errore: esito }, 502);
  }

  // ---- giro programmato
  if (corpo?.cron) {
    const adesso = oraRoma(new Date());
    const ritardo = adesso.minuti - ORARIO;
    if (ritardo < 0 || ritardo > FINESTRA_MIN) return json({ saltato: "fuori orario", ...adesso });
    // Segno il giorno prima di spedire: un secondo giro nello stesso giorno non manda doppioni.
    const { error: eGiorno } = await admin.from("palestra_invii").insert({ giorno: adesso.giorno });
    if (eGiorno) {
      if (/duplicate|unique/i.test(eGiorno.message)) return json({ saltato: "già inviato oggi", giorno: adesso.giorno });
      return json({ errore: erroreDb(eGiorno.message) }, 500);
    }
    const { data: abbonamenti, error } = await admin.from("palestra_push").select("*");
    if (error) return json({ errore: erroreDb(error.message) }, 500);
    const n = notificaDelGiorno(adesso.settimana);
    const esito = { giorno: adesso.giorno, titolo: n.titolo, telefoni: abbonamenti?.length ?? 0, inviate: 0, errori: [] as string[] };
    for (const a of (abbonamenti ?? []) as Abbonamento[]) {
      const r = await invia(admin, a, n);
      if (r === true) esito.inviate++; else esito.errori.push(r);
    }
    await admin.from("palestra_invii").update({ esito }).eq("giorno", adesso.giorno);
    await admin.from("palestra_invii").delete().lt("giorno", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
    return json({ ok: true, ...esito });
  }

  return json({ errore: "Richiesta non riconosciuta" }, 400);
});
