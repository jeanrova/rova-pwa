# ROVA Mobile — PWA

App companion offline per iPhone (e qualsiasi dispositivo). Nessun account Apple,
nessuna scadenza, nessun backend: i dati vivono SOLO sul dispositivo (IndexedDB)
e viaggiano esclusivamente dentro file .rova cifrati.

## Deploy (una volta, ~10 minuti)
La PWA richiede HTTPS. La via piu' semplice e' GitHub Pages — la shell dell'app
NON contiene alcun dato personale (i dati stanno sul telefono), quindi puo'
stare in un repo pubblico senza rischi. In alternativa usa un repo privato con
Cloudflare Pages (gratuito, supporta repo privati).

1. Crea un repo GitHub `rova-pwa` e carica il contenuto di questa cartella
   (index.html, css/, js/, icons/, manifest.webmanifest, sw.js).
2. Settings -> Pages -> Deploy from branch -> main -> root. Attendi l'URL
   https://<utente>.github.io/rova-pwa/
3. Su iPhone: apri l'URL in SAFARI -> tasto Condividi -> "Aggiungi alla
   schermata Home". L'icona ROVA appare come una app; da quel momento funziona
   anche OFFLINE (service worker) e a schermo intero.

## Flusso di sync
1. Desktop: ID Center -> "Esporta verso Chamber (.rova)" (l'export include il
   mobile_snapshot con il patrimonio unificato — il telefono non calcola mai).
2. Porta il file al telefono: AirDrop dal PC non esiste, quindi: cartella cloud
   (il file e' AES-256, il provider vede solo bytes), oppure cavo/Files.
3. Telefono: tab Chamber -> Importa .rova -> password -> merge per-record.
4. Ritorno: tab Chamber -> Esporta .rova -> condividi (share sheet) verso
   cloud/Files -> sul desktop: ID Center -> "Importa da Chamber".

## Aggiornare l'app
git push sul repo -> alla prossima apertura online il service worker scarica la
nuova versione (bump di VERSION in sw.js per forzare il refresh della cache).

## Nota storage iOS
iOS puo' teoricamente liberare lo storage web in caso di spazio esaurito.
Non e' un rischio di perdita: il desktop e' la fonte di verita' e un import
.rova ripristina tutto. Esporta dal telefono prima di lunghe assenze.

## Test inclusi (node >= 18)
    npm install          # fake-indexeddb + jsdom (solo per i test)
    node tests/interop.mjs   # interop Python<->JS su .rova reali
    node tests/ui.mjs        # tutte le 5 schermate, CRUD, import reale
