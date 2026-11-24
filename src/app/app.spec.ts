import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { StorageService } from './services/storage.service';
import { InventoryService } from './services/inventory.service';
import { OrderService } from './services/order.service';
import { AuthService } from './services/auth.service';

describe('Vallebruna Backoffice Magazzino - Unit & Business Logic Tests', () => {
  let storage: StorageService;
  let inventory: InventoryService;
  let orders: OrderService;
  let auth: AuthService;

  beforeEach(() => {
    // Pulisce e resetta storage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }

    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    });

    storage = TestBed.inject(StorageService);
    inventory = TestBed.inject(InventoryService);
    orders = TestBed.inject(OrderService);
    auth = TestBed.inject(AuthService);

    // Reset ai dati seed di prova
    storage.resetToSeed();
    // Default autenticato come admin per le prove
    auth.switchUser('amministratore');
  });

  it('dovrebbe istanziare l\'applicazione', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  describe('LIVELLO 2 - Regola Numero Uno e Calcolo Giacenze', () => {
    it('la giacenza deve essere esattamente la somma dei carichi meno la somma degli scarichi', () => {
      // Creiamo un prodotto di test
      const p = inventory.creaProdotto({
        sku: 'TES-0001',
        nome: 'Prodotto Test Giacenza',
        descrizione: 'Test calcolo',
        categoriaId: 'cat-1',
        fornitoreId: 'forn-1',
        prezzoVendita: 10.0,
        scortaMinima: 10,
        attivo: true,
      });

      // Senza movimenti, giacenza = 0
      expect(storage.getFreshGiacenza(p.id)).toBe(0);

      // Carico 25 pezzi
      inventory.registraMovimento({
        prodottoId: p.id,
        tipo: 'carico',
        quantita: 25,
        causale: 'Carico iniziale test',
      });
      expect(storage.getFreshGiacenza(p.id)).toBe(25);

      // Scarico 10 pezzi
      inventory.registraMovimento({
        prodottoId: p.id,
        tipo: 'scarico',
        quantita: 10,
        causale: 'Scarico parziale test',
      });
      expect(storage.getFreshGiacenza(p.id)).toBe(15);
    });

    it('deve RIFIUTARE uno scarico che porterebbe la giacenza sotto zero', () => {
      const p = inventory.creaProdotto({
        sku: 'TES-0002',
        nome: 'Prodotto Test Sottozero',
        descrizione: 'Test rifiuto scarico',
        categoriaId: 'cat-1',
        fornitoreId: 'forn-1',
        prezzoVendita: 20.0,
        scortaMinima: 5,
        attivo: true,
      });

      inventory.registraMovimento({
        prodottoId: p.id,
        tipo: 'carico',
        quantita: 4,
        causale: 'Carico 4 pezzi',
      });

      // Tentativo di scaricare 5 pezzi (supera la giacenza di 4)
      expect(() => {
        inventory.registraMovimento({
          prodottoId: p.id,
          tipo: 'scarico',
          quantita: 5,
          causale: 'Scarico eccessivo non consentito',
        });
      }).toThrowError(/supera la giacenza disponibile/);

      // La giacenza deve essere rimasta intatta a 4 pezzi
      expect(storage.getFreshGiacenza(p.id)).toBe(4);
    });

    it('deve calcolare correttamente i casi limite dello stato scorta e quantità da riordinare', () => {
      // Caso 1: Giacenza uguale alla scorta minima (es. 10 pz) -> deve essere "Sotto scorta"
      const p1 = inventory.creaProdotto({
        sku: 'TES-0003',
        nome: 'Prodotto Soglia Uguale',
        descrizione: 'Test scorta',
        categoriaId: 'cat-1',
        fornitoreId: 'forn-1',
        prezzoVendita: 15.0,
        scortaMinima: 10,
        attivo: true,
      });
      inventory.registraMovimento({
        prodottoId: p1.id,
        tipo: 'carico',
        quantita: 10,
        causale: 'Carico esattamente uguale a scorta minima',
      });

      const p1ConGiacenza = storage.prodottiConGiacenza().find((p) => p.id === p1.id)!;
      expect(p1ConGiacenza.giacenza).toBe(10);
      expect(p1ConGiacenza.statoScorta).toBe('Sotto scorta');
      // Formula: 2 * scortaMinima - giacenza = 2 * 10 - 10 = 10 pz
      expect(p1ConGiacenza.quantitaDaRiordinare).toBe(10);

      // Caso 2: Prodotto esaurito (giacenza 0, scorta minima 8)
      const p2 = inventory.creaProdotto({
        sku: 'TES-0004',
        nome: 'Prodotto Esaurito',
        descrizione: 'Test esaurito',
        categoriaId: 'cat-1',
        fornitoreId: 'forn-1',
        prezzoVendita: 12.0,
        scortaMinima: 8,
        attivo: true,
      });
      const p2ConGiacenza = storage.prodottiConGiacenza().find((p) => p.id === p2.id)!;
      expect(p2ConGiacenza.giacenza).toBe(0);
      expect(p2ConGiacenza.statoScorta).toBe('Esaurito');
      // Formula: 2 * 8 - 0 = 16 pz
      expect(p2ConGiacenza.quantitaDaRiordinare).toBe(16);
    });
  });

  describe('LIVELLO 3 - Calcolo Totali Ordini, Sconti e Transizioni', () => {
    it('deve calcolare correttamente i totali e gli sconti ai confini esatti', () => {
      // Confine 1: Meno di 500 € -> nessuno sconto
      const t499 = orders.calcolaTotali([{ quantita: 1, prezzoUnitario: 499.99 }]);
      expect(t499.lordo).toBe(499.99);
      expect(t499.percentualeSconto).toBe(0);
      expect(t499.importoSconto).toBe(0);
      expect(t499.imponibile).toBe(499.99);
      expect(t499.iva).toBe(110.0); // 499.99 * 0.22 = 109.9978 -> 110.00
      expect(t499.totale).toBe(609.99);

      // Confine 2: Esattamente 500 € -> sconto 5%
      const t500 = orders.calcolaTotali([{ quantita: 1, prezzoUnitario: 500.0 }]);
      expect(t500.percentualeSconto).toBe(5);
      expect(t500.importoSconto).toBe(25.0);
      expect(t500.imponibile).toBe(475.0);
      expect(t500.iva).toBe(104.5);
      expect(t500.totale).toBe(579.5);

      // Confine 3: 999.99 € -> sconto 5%
      const t999 = orders.calcolaTotali([{ quantita: 1, prezzoUnitario: 999.99 }]);
      expect(t999.percentualeSconto).toBe(5);

      // Confine 4: 1.000 € o più -> sconto 10% (Esempio capitolato)
      // Esempio: 1.000 € -> sconto 10% (100 €) -> imponibile 900 € -> IVA 198 € -> totale 1.098 €
      const t1000 = orders.calcolaTotali([{ quantita: 1, prezzoUnitario: 1000.0 }]);
      expect(t1000.lordo).toBe(1000.0);
      expect(t1000.percentualeSconto).toBe(10);
      expect(t1000.importoSconto).toBe(100.0);
      expect(t1000.imponibile).toBe(900.0);
      expect(t1000.iva).toBe(198.0);
      expect(t1000.totale).toBe(1098.0);
    });

    it('deve consentire solo le transizioni di stato legali e rifiutare quelle vietate', () => {
      const prod = storage.prodotti()[7]; // prod-08 ha giacenza abbondante
      const ord = orders.creaOrdine({
        cliente: 'Cliente Test Transizioni',
        righe: [{ prodottoId: prod.id, quantita: 1 }],
      });

      expect(ord.stato).toBe('nuovo');

      // Vietato saltare da 'nuovo' a 'spedito' direttamente
      expect(() => {
        orders.cambiaStato(ord.id, 'spedito');
      }).toThrowError(/Transizione vietata/);

      // Lecito: nuovo -> in preparazione
      const ordPrep = orders.cambiaStato(ord.id, 'in preparazione');
      expect(ordPrep.stato).toBe('in preparazione');

      // Vietato saltare da 'in preparazione' a 'consegnato'
      expect(() => {
        orders.cambiaStato(ord.id, 'consegnato');
      }).toThrowError(/Transizione vietata/);

      // Lecito: in preparazione -> spedito
      const ordSped = orders.cambiaStato(ord.id, 'spedito');
      expect(ordSped.stato).toBe('spedito');

      // Vietato annullare un ordine spedito
      expect(() => {
        orders.cambiaStato(ord.id, 'annullato');
      }).toThrowError(/si può annullare solo dallo stato 'nuovo' o 'in preparazione'/);

      // Lecito: spedito -> consegnato
      const ordCons = orders.cambiaStato(ord.id, 'consegnato');
      expect(ordCons.stato).toBe('consegnato');
    });

    it('passando a "spedito" deve generare automaticamente i movimenti di scarico e aggiornare la giacenza', () => {
      const prod = inventory.creaProdotto({
        sku: 'TES-0005',
        nome: 'Prodotto Test Scarico Auto',
        descrizione: 'Test spedizione',
        categoriaId: 'cat-1',
        fornitoreId: 'forn-1',
        prezzoVendita: 50.0,
        scortaMinima: 2,
        attivo: true,
      });

      // Carichiamo 10 pezzi
      inventory.registraMovimento({
        prodottoId: prod.id,
        tipo: 'carico',
        quantita: 10,
        causale: 'Carico per ordine',
      });
      expect(storage.getFreshGiacenza(prod.id)).toBe(10);

      // Creiamo ordine da 6 pezzi
      const ord = orders.creaOrdine({
        cliente: 'Cliente Spedizione Rapida',
        righe: [{ prodottoId: prod.id, quantita: 6 }],
      });

      orders.cambiaStato(ord.id, 'in preparazione');
      orders.cambiaStato(ord.id, 'spedito');

      // La giacenza deve essersi aggiornata automaticamente: 10 - 6 = 4 pezzi
      expect(storage.getFreshGiacenza(prod.id)).toBe(4);

      // Verifichiamo che esista il movimento di scarico collegato
      const movSped = storage.movimenti().find((m) => m.ordineId === ord.id);
      expect(movSped).toBeTruthy();
      expect(movSped?.tipo).toBe('scarico');
      expect(movSped?.quantita).toBe(6);
      expect(movSped?.causale).toContain(`Ordine ${ord.numero}`);
    });

    it('deve bloccare la spedizione se manca giacenza sufficiente per una o più righe', () => {
      const prod = inventory.creaProdotto({
        sku: 'TES-0006',
        nome: 'Prodotto Pochi Pezzi',
        descrizione: 'Test stockout',
        categoriaId: 'cat-1',
        fornitoreId: 'forn-1',
        prezzoVendita: 30.0,
        scortaMinima: 1,
        attivo: true,
      });

      // Carichiamo solo 2 pezzi
      inventory.registraMovimento({
        prodottoId: prod.id,
        tipo: 'carico',
        quantita: 2,
        causale: 'Carico piccolo',
      });

      // Ordine richiede 5 pezzi
      const ord = orders.creaOrdine({
        cliente: 'Cliente Esigente',
        righe: [{ prodottoId: prod.id, quantita: 5 }],
      });

      orders.cambiaStato(ord.id, 'in preparazione');

      // Passaggio a 'spedito' DEVE fallire ed elencare la mancanza
      expect(() => {
        orders.cambiaStato(ord.id, 'spedito');
      }).toThrowError(/giacenza insufficiente/);

      // Stato ordine deve rimanere 'in preparazione'
      const ordDb = storage.ordini().find((o) => o.id === ord.id)!;
      expect(ordDb.stato).toBe('in preparazione');
    });
  });

  describe('LIVELLO 4 - Profili e Permessi RBAC', () => {
    it('Magazziniere non deve poter vedere i prezzi e non deve poter creare prodotti o ordini', () => {
      auth.switchUser('magazziniere');

      expect(auth.canViewPrices()).toBe(false);
      expect(auth.canManageProducts()).toBe(false);
      expect(auth.canCreateOrders()).toBe(false);
      expect(auth.canManageMovements()).toBe(true);
      expect(auth.canAdvanceOrderStatus()).toBe(true);

      // Chiamata diretta a creaProdotto da magazziniere -> deve lanciare eccezione
      expect(() => {
        inventory.creaProdotto({
          sku: 'MAG-9999',
          nome: 'Prodotto Magazziniere Abusivo',
          descrizione: '-',
          categoriaId: 'cat-1',
          fornitoreId: 'forn-1',
          prezzoVendita: 10,
          scortaMinima: 1,
          attivo: true,
        });
      }).toThrowError(/ACCESSO NEGATO/);
    });

    it('Commerciale non deve poter registrare carichi o scarichi', () => {
      auth.switchUser('commerciale');

      expect(auth.canViewPrices()).toBe(true);
      expect(auth.canCreateOrders()).toBe(true);
      expect(auth.canManageMovements()).toBe(false);

      expect(() => {
        inventory.registraMovimento({
          prodottoId: 'prod-01',
          tipo: 'carico',
          quantita: 10,
          causale: 'Carico commerciale abusivo',
        });
      }).toThrowError(/ACCESSO NEGATO/);
    });
  });
});
