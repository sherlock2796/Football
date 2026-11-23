# Notifiche Palestra alle 16:55 (Supabase)

Usa lo stesso progetto Supabase dell'app Impegni (`siifawqmapfdybhvyeyi`) e le
sue chiavi VAPID, già salvate nei secrets delle Edge Functions. Si fa una volta sola.

1. **Pubblica la funzione**: Supabase → Edge Functions → *Deploy a new function*
   → *Via editor*. Nome **`palestra`**, incolla tutto `supabase/functions/palestra/index.ts`,
   premi *Deploy*. Lascia attiva la verifica JWT.
2. **SQL**: Supabase → SQL Editor → *New query*, incolla `supabase/palestra.sql`,
   premi *Run*. In fondo deve comparire la riga `palestra-promemoria` con `active = true`.
3. **Sull'iPhone**: apri Palestra dall'icona in Home → Guida → *Notifiche alle 16:55*
   → **Attiva notifiche** → Consenti → **Invia una prova**.

Come funziona: `pg_cron` chiama la funzione alle 14:55 e alle 15:55 UTC. La
funzione parte solo quando a Roma sono le 16:55, una volta al giorno
(tabella `palestra_invii`). Lun/Mer/Ven: seduta del giorno secondo la
rotazione a due schede (settimana del 23/11/2026 = A-B-A, la successiva
B-A-B, e così via) con frase motivazionale; gli altri giorni: riposo. Frasi,
giorni e data di partenza della rotazione sono in cima a `index.ts`. Dopo una
modifica, ripubblica la funzione (Edge Functions → palestra → incolla il nuovo
`index.ts` → Deploy).

Problemi:
- "Manca la chiave di servizio": aggiungi il secret `CHIAVE_SERVIZIO` con la chiave
  `service_role` (Project Settings → API), come per Impegni.
- "Tabelle mancanti": esegui `supabase/palestra.sql`.
- Esito degli invii: `select * from palestra_invii order by giorno desc;`
