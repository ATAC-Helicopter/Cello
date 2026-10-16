# Distribuire e presentare Cello

Repository: https://github.com/ATAC-Helicopter/Cello. Licenza: GPL-3.0-or-later. Invio a GNOME Extensions ancora da effettuare con un account autenticato.

## Percorso di pubblicazione

1. I sorgenti sono preparati per il repository pubblico `ATAC-Helicopter/Cello`, con issue tracker e URL nei metadati.
2. Licenza GPL-3.0-or-later scelta dal manutentore tramite autorizzazione alla pubblicazione; testo incluso nel pacchetto e provenienza documentata in `NOTICE.md`.
3. Scegliere l’UUID definitivo prima della prima pubblicazione: quello attuale è mantenuto e conserva l’aggiornamento locale; un eventuale `cello@<dominio-controllato>` sarebbe una nuova identità e richiederebbe migrazione. Non registrare un namespace inventato o di altri.
4. Eseguire i controlli e creare lo ZIP con `./tools/package.sh`. Il rapporto in `dist/package-report.json` riporta hash, file e elementi ancora mancanti. Lo ZIP contiene solo codice e risorse di runtime: installer, test e screenshot sono separati.
5. Accedere con il proprio account a [GNOME Extensions](https://extensions.gnome.org/upload/), caricare lo ZIP e completare la scheda. Non occorre distribuire un `.deb` o installare il bridge Keychron per usare Bluetooth standard.
6. Seguire la review e correggere le osservazioni. Non annunciare una data certa di approvazione. Dopo l’approvazione condividere il collegamento diretto alla scheda per installazione e aggiornamenti gestiti da GNOME.

La versione attuale è verificata su GNOME Shell 46: l’elenco di compatibilità resta `["46"]`. Testare altre versioni prima di aggiungerle, in particolare le versioni recenti che raggiungono più utenti. Il widget usa gettext con inglese di base e traduzione italiana.

Fonti: [linee guida ufficiali e licenza](https://gjs.guide/extensions/review-guidelines/review-guidelines.html), [formato dei metadati](https://gjs.guide/extensions/overview/anatomy.html), [portale di caricamento](https://extensions.gnome.org/upload/). La review non sostituisce la verifica funzionale.

## Scheda pubblica proposta

**Nome:** Cello — Desktop Batteries

**Sintesi:** Device batteries. At a glance.

**Descrizione inglese:**

> Cello brings your Bluetooth device batteries to the GNOME desktop. See charge rings, clear percentages and device icons in a compact widget that adapts to your wallpaper. Choose light, dark or automatic appearance and place it in any desktop corner.
>
> Cello listens to battery information already available in BlueZ. It does not scan, pair, connect, or issue battery queries to your devices. Battery availability depends on what each device and BlueZ report. An existing Keychron battery bridge can optionally supply its estimated reading.
>
> Tested on GNOME Shell 46. English and Italian are included. No accounts, telemetry or network service are required by the widget.

**Immagine principale:** `docs/media/cello-preview.png`. È uno screenshot della vera estensione in GNOME Shell, con quattro dispositivi simulati e uno sfondo SVG originale (`assets/preview-wallpaper.svg`). La dicitura “Preview with simulated device data” deve rimanere visibile. Non presentarlo come una misura hardware.

**Immagini secondarie:** disposizione compatta, aspetto chiaro/scuro, menu delle posizioni. Rigenerare su sfondo originale prima della pubblicazione, evitando wallpaper di terzi non autorizzati e nomi personali dei dispositivi.

**Messaggio di lancio proposto:**

> Cello is a small battery widget for the GNOME desktop: device icons, charge rings and wallpaper-aware colors. It uses battery readings already available in BlueZ, without scanning or connecting to your devices. Here is a preview with simulated readings. The first build targets GNOME Shell 46.

Pubblicare prima repository e scheda GNOME, poi presentazione sul sito FGLabs e comunità GNOME/Linux, seguendo le rispettive regole. Aggiungere un video breve delle vere interazioni (destro, cambio angolo e aspetto) quando registrato. Questo documento è una bozza: nessun post è stato inviato.

## Prestazioni e batteria: affermazioni ammesse

- Aggiornamenti tramite segnali BlueZ e monitor del file locale del bridge; nessun timer ricorrente nell’estensione.
- Una richiesta della cache BlueZ all’avvio, al riavvio del demone o su “Aggiorna batterie”. Aggiornamenti successivi applicati alla cache in memoria.
- Nessuna scansione, associazione, connessione, lettura GATT o scrittura HID avviata da Cello.
- Aggiornamenti ravvicinati accorpati; a dati invariati vengono conservati gli attori grafici. Nessuna animazione continua, processo esterno, richiesta di rete o blur.
- Wallpaper decodificato asincronamente in una miniatura di massimo 128×128, conservata in memoria. Ricampionamento solo se cambiano immagine/geometria.
- Bridge assente supportato senza tastiera fittizia. Se presente, lettura asincrona e una scadenza singola per invalidare dati obsoleti.

I risultati misurati sono in `evidence/idle-activity.json`, `evidence/bluez-events.json` e `evidence/smoke-results.json`. Il controllo di 22 secondi conta richieste e ricostruzioni, non misura watt, consumo radio o autonomia. Non promettere “zero consumo”, una percentuale CPU/RAM o ore di autonomia senza un benchmark dedicato.

Il servizio Keychron già installato su questo host è un componente esterno: dal suo sorgente risulta apertura HID in sola lettura e attesa degli eventi, con scansione locale dei nodi ogni 3 secondi e manutenzione dello stato ogni 30. Cello non lo installa, riavvia o modifica. La sua efficienza e il polling interno di BlueZ sono separati dall’efficienza del widget.
