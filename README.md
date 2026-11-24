# Vallebruna Forniture Tecniche S.r.l. — Il nuovo backoffice di magazzino
**Richiesta di Sviluppo · RDS-2026/014**

Applicazione web interna per la gestione di anagrafiche, movimenti di magazzino e ordini clienti, sviluppata in **Angular 22** con **componenti standalone**, **Signal**, **TypeScript in modalità strict** e **zero librerie UI di terze parti** (tabelle, grafici e componenti scritti interamente da zero).

---

## 🚀 Istruzioni di Avvio e Test

### 1. Requisiti di sistema
- Node.js >= 20.x (testato su v22.23.2)
- npm >= 10.x

### 2. Installazione dipendenze
```bash
npm install
```

### 3. Avvio in locale (Dev Server)
```bash
npm start
```
L'applicazione sarà accessibile all'indirizzo [http://localhost:4200](http://localhost:4200).

### 4. Esecuzione Test Automatici (Vitest)
La suite verifica tutte le regole di business, i confini degli sconti, le transizioni di stato, il rifiuto dei sottozero e i permessi RBAC:
```bash
npm test -- --watch=false
```

### 5. Build di Produzione
```bash
npm run build
```

---

## 👥 Credenziali di Accesso e Profili (Livello 4)

> ⚠️ **Dichiarazione di Trasparenza (Livello 4):**  
> *Senza un backend vero, il login e la persistenza sono una simulazione memorizzata in `localStorage`. Nonostante sia una simulazione client-side, tutti i permessi sono rigidamente controllati sia a livello di routing (Guards) sia a livello di esecuzione del codice (Service-level assert).*

Sono configurati tre utenti predefiniti (uno per profilo):

| Profilo | Email | Password | Permessi Principali |
| :--- | :--- | :--- | :--- |
| **Magazziniere** | `magazzino@vallebruna.it` | `password123` | Vede prodotti e giacenze (**prezzi rigorosamente nascosti**), registra carichi/scarichi, sposta ordini in preparazione/spedito, vista «Da riordinare». |
| **Commerciale** | `commerciale@vallebruna.it` | `password123` | Vede catalogo completo di prezzi e margini, crea ordini clienti, annulla ordini (nuovi o in preparazione). **Non può movimentare il magazzino**. |
| **Amministratore** | `admin@vallebruna.it` | `password123` | **Accesso totale**: crea/modifica/elimina prodotti, categorie, fornitori, audit log e annullamento operazioni. |

*In qualsiasi momento è possibile usare il selettore rapido di profilo nella barra superiore o disconnettersi.*

---

## 📦 Struttura del Progetto e Livelli Implementati

### LIVELLO 0 — Dati Iniziali e Storage Reattivo
- **Archivio Realistico:** 26 prodotti realistici di materiale elettrico e termoidraulico, 4 categorie e 3 fornitori convenzionati.
- **Scorte e Giacenze di Prova:**
  - **2 prodotti esauriti** (giacenza = 0 pz): `ELE-0001` (Interruttore Bipolare 16A), `CAV-0001` (Cavo FG16OR16 100m).
  - **5 prodotti sotto scorta** (giacenza > 0 ma <= scorta minima): `ELE-0002`, `LED-0001`, `IDR-0001`, `CAV-0002`, `ELE-0003`.
  - **19 prodotti regolari** con movimenti sufficienti a rendere il calcolo non banale.
- **Ordini di Prova:** 5 ordini coprono tutti gli stati (`nuovo`, `in preparazione`, `spedito`, `consegnato`, `annullato`).
- **Pulsante "Reset Dati":** Permette in qualsiasi momento di ripristinare il dataset iniziale del Livello 0 con un click.

---

### LIVELLO 1 — Anagrafiche (Prodotti, Categorie, Fornitori)
- **Tabella Prodotti Custom (No Material/PrimeNG):** Sviluppata in puro HTML e CSS responsive.
- **Ricerca a Fine Digitazione:** Debounce a 300ms che interroga `nome` e `sku` solo quando l'operatore ha terminato di digitare.
- **Filtri Combinati:** Categoria, stato articolo (attivo/non attivo) e stato scorta operano congiuntamente con l'ordinamento e la paginazione.
- **Ordinamento Intestazioni:** Cliccabile su SKU, Nome, Categoria, Fornitore, Prezzo, Giacenza con indicatori di direzione `▲ / ▼`.
- **Paginazione:** 10 elementi per pagina con etichetta esatta «*da 11 a 20 di 26*».
- **Validazioni Rigorose Form:**
  - Nome obbligatorio (minimo 3 caratteri).
  - SKU obbligatorio in formato regex `^[A-Z]{3}-\d{4}$` (es. `ELE-0001`) con **controllo di univocità prima del salvataggio**.
  - Prezzo > 0; Scorta minima intera >= 0.
  - Categoria e Fornitore obbligatori.
  - Messaggi di errore puntuali sotto ogni campo e pulsante disabilitato durante il salvataggio.
  - Modale di conferma esplicita prima dell'eliminazione.
- **Integrità Referenziale Categorie & Fornitori:** Una categoria o un fornitore con articoli collegati **non può essere eliminato**, mostrando un avviso chiaro con il conteggio dei prodotti associati.

---

### LIVELLO 2 — Movimenti e Giacenza (La Nostra Regola Numero Uno)
> 🔒 **LA NOSTRA REGOLA NUMERO UNO:**  
> *«La giacenza non è un dato che si scrive: si calcola sempre dai movimenti (somma dei carichi meno somma degli scarichi). Nessuna schermata deve permettere di modificarla a mano.»*

- **Calcolo Dinamico Reattivo (`computed` signal):** La giacenza viene calcolata sommando i carichi e sottraendo gli scarichi in tempo reale.
- **Rifiuto Scarichi Sottozero:** Uno scarico che porterebbe la giacenza sotto zero viene bloccato e rifiutato, indicando a video la giacenza attualmente disponibile.
- **Dettaglio Prodotto:** Scheda completa con storico movimenti e **giacenza progressiva riga per riga**.
- **Vista «Da Riordinare»:**
  - Prodotti esauriti o sotto scorta raggruppati per fornitore con recapiti email e telefono.
  - Calcolo della quantità suggerita da riordinare secondo la formula:  
    $$\text{Quantità da riordinare} = 2 \times \text{scorta minima} - \text{giacenza}$$
  - Azione rapida per registrare l'entrata della merce riordinata.

---

### LIVELLO 3 — Ordini Clienti
- **Calcolo Totali e Sconti:**
  - Somma righe (imponibile lordo).
  - Meno di 500,00 € ➔ **Nessuno sconto**.
  - Da 500,00 € a meno di 1.000,00 € ➔ **Sconto 5%**.
  - 1.000,00 € o più ➔ **Sconto 10%**.
  - IVA 22% calcolata sull'importo netto scontato.
  - *Esempio verificato:* 1.000,00 € ➔ Sconto 100,00 € ➔ Imponibile 900,00 € ➔ IVA 198,00 € ➔ Totale 1.098,00 €.  
  - *Confini testati con successo nei test:* 499,99 € / 500,00 € / 999,99 € / 1.000,00 €.
- **Stati dell'Ordine e Transizioni Consentite:**
  $$\text{nuovo} \longrightarrow \text{in preparazione} \longrightarrow \text{spedito} \longrightarrow \text{consegnato}$$
  - L'ordine si può annullare **solo da `nuovo` o da `in preparazione`**.
  - L'interfaccia e i service espongono e consentono esclusivamente le azioni legali per lo stato corrente.
- **Scarico Automatico alla Spedizione:** Passando allo stato `spedito`, il sistema genera automaticamente i movimenti di scarico (uno per riga) con causale «Ordine N». Se la giacenza è insufficiente per qualsiasi articolo, il passaggio è bloccato e vengono elencate le mancanze.
- **Congelamento Prezzo:** Il prezzo unitario viene fissato alla creazione dell'ordine; future variazioni di listino non alterano gli ordini preesistenti.

---

### LIVELLO 4 — Profili e Permessi (RBAC)
- **Mascheramento Prezzi per Magazziniere:** Il magazziniere non visualizza i prezzi di vendita, i totali degli ordini né il valore del magazzino (sostituiti con l'indicatore `🔒 Riservato`).
- **Protezione a Doppio Livello:**
  1. *Interfaccia e Routing:* Route Guards (`canActivate`) che bloccano gli URL non consentiti reindirizzando alla schermata `Accesso Negato (403)` e menu dinamico.
  2. *Livello di Codice / Service:* Sia `InventoryService` che `OrderService` invocano `AuthService.assertPermission()`. Provando a invocare un metodo vietato da console browser (`window.vallebrunaInventory` o `window.vallebrunaOrders`), l'operazione viene respinta con eccezione.

---

### LIVELLO 5 — Se vi avanza tempo
- **Cruscotto Direzionale (Dashboard):**
  - Valore complessivo magazzino (giacenza × prezzo di vendita).
  - Numero articoli sotto scorta ed esauriti.
  - Contatori ordini suddivisi per stato.
  - **Grafico SVG Custom:** Visualizzazione a barre dei **5 prodotti più scaricati del mese** scritto in puro SVG con gradienti e percentuali.
- **Esportazione CSV:** Download immediato dell'inventario prodotti con giacenza (esclude automaticamente la colonna prezzo se l'utente connesso è il Magazziniere).
- **Registro delle Operazioni (Audit Log):** Tracciamento puntuale di chi ha fatto cosa e quando, con pulsante per **annullare l'ultima operazione** (Rollback).

---

## 🚨 UN PROBLEMA CHE CI È GIÀ COSTATO CARO: Analisi e Soluzione

### 1. Cosa è successo (Lo Scenario)
> *«Un prodotto ha una giacenza di 5 pezzi. Due nostri operatori, ciascuno davanti alla propria schermata, spediscono nello stesso istante due ordini che richiedono 4 pezzi ciascuno. Entrambi controllano la giacenza e la vedono sufficiente; entrambi registrano lo scarico. Risultato: giacenza -3.»*

### 2. Come riprodurre il problema
Per osservare il fenomeno tipico delle applicazioni web con stato disallineato:
1. Aprire l'applicazione in **due schede del browser affiancate**.
2. Con una scheda non aggiornata, inviare una richiesta contemporanea su uno stock limitato. Senza sincronizzazione inter-tab, entrambe le schermate avrebbero letto la giacenza statica di 5 pezzi.

### 3. La Nostra Mitigazione Implementata nel Codice
Abbiamo realizzato una mitigazione su tre livelli:
1. **Ricalcolo Atomico al Commit ("Check-at-Commit"):** Al momento della spedizione o dello scarico, il servizio `OrderService` / `InventoryService` non si basa sulla vista statica a schermo, ma rilegge atomicamente l'archivio movimenti fresco dallo storage.
2. **Mutex Lock su Risorsa di Magazzino:** Prima di verificare e scaricare, viene acquisito un lock temporaneo (`vallebruna_inventory_lock_stock_[id]`) con scadenza automatica.
3. **Cross-Tab BroadcastChannel:** Ogni variazione di magazzino trasmette immediatamente un evento tramite l'API standard `BroadcastChannel('vallebruna_cross_tab_sync')` e listener `window.addEventListener('storage')`, forzando tutte le altre schede aperte ad aggiornare all'istante i propri Signal reattivi.
4. **Verifica Integrata nel Cruscotto:** Nella pagina **Cruscotto** è presente un pulsante interattivo **"Esegui Test Concorrenza"** che automatizza il test esatto (prodotto a 5 pezzi, 2 ordini concorrenti da 4 pezzi con `Promise.allSettled`). Il primo ordine viene evaso (giacenza = 1 pz), il secondo viene intercettato e bloccato restituendo errore. **La giacenza non scende mai sotto zero.**

### 4. Limiti della Soluzione e Come Risolverlo in un Sistema di Produzione Vero

#### Cosa copre la nostra soluzione:
- Previene le race condition nello stesso browser e tra tab aperte sullo stesso client.
- Protegge dalla doppia sottomissione accidentale o ravvicinata.
- Notifica immediatamente gli altri operatori attivi.

#### Cosa NON copre (I Limiti di un'app solo Client-side):
- Se due operatori utilizzano **due computer fisici differenti**, il `localStorage` e il `BroadcastChannel` non sono condivisi: senza un server centrale, non è possibile sincronizzare due memorie separate.
- In caso di latenza di rete o disconnessione, un client potrebbe operare su dati obsoleti.

#### Come si risolve davvero in un sistema aziendale di produzione (Backend):
In un'architettura enterprise reale con database relazionale (es. PostgreSQL, Cloud SQL, Spanner):
1. **Transazioni ACID con Pessimistic Locking:**
   ```sql
   BEGIN TRANSACTION;
   -- Blocca la riga del prodotto in lettura esclusiva per tutta la durata della transazione
   SELECT giacenza FROM prodotti WHERE id = $1 FOR UPDATE;
   
   -- Se giacenza < richiesta, genera ROLLBACK;
   -- Altrimenti inserisce il movimento di scarico:
   INSERT INTO movimenti (prodotto_id, tipo, quantita, causale) VALUES ($1, 'scarico', 4, 'Ordine N');
   COMMIT;
   ```
2. **Database Constraint di Integrità:**
   Un vincolo a livello di schema SQL (`CHECK (giacenza >= 0)` o trigger di consistenza) che impedisce a livello di motore di database qualsiasi scrittura che porti il saldo in negativo, a prescindere da qualsiasi bug nel frontend o nelle API.
3. **WebSockets / Server-Sent Events (SSE):**
   Aggiornamento push dal server verso tutti i browser client appena uno scarico viene confermato, invalidando le viste aperte dagli altri colleghi in magazzino.
