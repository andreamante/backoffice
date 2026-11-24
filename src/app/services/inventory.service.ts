import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';
import {
  Categoria,
  Fornitore,
  Prodotto,
  Movimento,
  TipoMovimento,
} from '../models/entities';

@Injectable({
  providedIn: 'root',
})
export class InventoryService {
  constructor(
    private storage: StorageService,
    private auth: AuthService
  ) {
    if (typeof window !== 'undefined') {
      (window as any).vallebrunaInventory = this;
    }
  }

  // ==========================================
  // PRODOTTI CRUD (Livello 1 & 4)
  // ==========================================

  creaProdotto(dati: Omit<Prodotto, 'id'>): Prodotto {
    // Controllo permessi a livello di codice (Livello 4)
    this.auth.assertPermission(this.auth.canManageProducts(), 'Creare prodotto');

    this.validaProdotto(dati);

    // Controllo SKU univoco
    const esisteSku = this.storage.prodotti().some(
      (p) => p.sku.toUpperCase() === dati.sku.toUpperCase()
    );
    if (esisteSku) {
      throw new Error(`Lo SKU '${dati.sku}' è già associato a un altro prodotto.`);
    }

    const nuovoProdotto: Prodotto = {
      ...dati,
      sku: dati.sku.toUpperCase().trim(),
      nome: dati.nome.trim(),
      id: 'prod-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
    };

    const aggiornati = [...this.storage.prodotti(), nuovoProdotto];
    this.storage.saveProdotti(aggiornati);

    // Tracciamento Audit
    const currentUser = this.auth.currentUser();
    this.storage.addAuditLog({
      operatore: currentUser?.nome || 'Operatore',
      ruolo: currentUser?.ruolo || 'amministratore',
      tipo: 'creazione_prodotto',
      descrizione: `Creato nuovo prodotto ${nuovoProdotto.sku} - ${nuovoProdotto.nome}`,
      datiNuovi: nuovoProdotto,
      entitaId: nuovoProdotto.id,
      annullabile: true,
    });

    return nuovoProdotto;
  }

  modificaProdotto(id: string, dati: Omit<Prodotto, 'id'>): Prodotto {
    this.auth.assertPermission(this.auth.canManageProducts(), 'Modificare prodotto');

    const prodotti = this.storage.prodotti();
    const index = prodotti.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Prodotto con ID ${id} non trovato.`);
    }

    this.validaProdotto(dati);

    // Controllo SKU univoco su altri prodotti
    const esisteSku = prodotti.some(
      (p) => p.id !== id && p.sku.toUpperCase() === dati.sku.toUpperCase()
    );
    if (esisteSku) {
      throw new Error(`Lo SKU '${dati.sku}' è già assegnato a un altro prodotto.`);
    }

    const datiPrecedenti = prodotti[index];
    const prodottoModificato: Prodotto = {
      ...dati,
      id,
      sku: dati.sku.toUpperCase().trim(),
      nome: dati.nome.trim(),
    };

    const aggiornati = [...prodotti];
    aggiornati[index] = prodottoModificato;
    this.storage.saveProdotti(aggiornati);

    const currentUser = this.auth.currentUser();
    this.storage.addAuditLog({
      operatore: currentUser?.nome || 'Operatore',
      ruolo: currentUser?.ruolo || 'amministratore',
      tipo: 'modifica_prodotto',
      descrizione: `Modificato prodotto ${prodottoModificato.sku} - ${prodottoModificato.nome}`,
      datiPrecedenti,
      datiNuovi: prodottoModificato,
      entitaId: id,
      annullabile: true,
    });

    return prodottoModificato;
  }

  eliminaProdotto(id: string): void {
    this.auth.assertPermission(this.auth.canManageProducts(), 'Eliminare prodotto');

    const prodotti = this.storage.prodotti();
    const prod = prodotti.find((p) => p.id === id);
    if (!prod) {
      throw new Error(`Prodotto con ID ${id} non trovato.`);
    }

    // Verifica se ci sono movimenti o righe d'ordine collegate
    const haMovimenti = this.storage.movimenti().some((m) => m.prodottoId === id);
    const haOrdini = this.storage.ordini().some((o) =>
      o.righe.some((r) => r.prodottoId === id)
    );

    if (haMovimenti || haOrdini) {
      throw new Error(
        `Impossibile eliminare il prodotto '${prod.nome}' (${prod.sku}): ` +
        `risultano ${haMovimenti ? 'movimenti di magazzino' : ''}` +
        `${haMovimenti && haOrdini ? ' e ' : ''}` +
        `${haOrdini ? 'ordini collegati' : ''}. Puoi disattivarlo disabilitando il campo "Attivo".`
      );
    }

    const aggiornati = prodotti.filter((p) => p.id !== id);
    this.storage.saveProdotti(aggiornati);

    const currentUser = this.auth.currentUser();
    this.storage.addAuditLog({
      operatore: currentUser?.nome || 'Operatore',
      ruolo: currentUser?.ruolo || 'amministratore',
      tipo: 'eliminazione_prodotto',
      descrizione: `Eliminato prodotto ${prod.sku} - ${prod.nome}`,
      datiPrecedenti: prod,
      entitaId: id,
      annullabile: true,
    });
  }

  private validaProdotto(p: Omit<Prodotto, 'id'>): void {
    if (!p.nome || p.nome.trim().length < 3) {
      throw new Error('Il nome del prodotto è obbligatorio e deve contenere almeno 3 caratteri.');
    }

    // Formato ABC-0001
    const skuRegex = /^[A-Z]{3}-\d{4}$/;
    if (!p.sku || !skuRegex.test(p.sku.trim().toUpperCase())) {
      throw new Error('Lo SKU è obbligatorio e deve rispettare il formato ABC-0001 (es. ELE-0001).');
    }

    if (typeof p.prezzoVendita !== 'number' || p.prezzoVendita <= 0) {
      throw new Error('Il prezzo di vendita deve essere maggiore di zero.');
    }

    if (
      typeof p.scortaMinima !== 'number' ||
      !Number.isInteger(p.scortaMinima) ||
      p.scortaMinima < 0
    ) {
      throw new Error('La scorta minima deve essere un numero intero maggiore o uguale a zero.');
    }

    if (!p.categoriaId) {
      throw new Error('La categoria è obbligatoria.');
    }

    if (!p.fornitoreId) {
      throw new Error('Il fornitore è obbligatorio.');
    }
  }

  // ==========================================
  // CATEGORIE CRUD (Livello 1)
  // ==========================================

  creaCategoria(nome: string): Categoria {
    this.auth.assertPermission(this.auth.canManageAdministration(), 'Gestire categorie');
    if (!nome || nome.trim().length < 2) {
      throw new Error('Il nome della categoria deve contenere almeno 2 caratteri.');
    }

    const nuova: Categoria = {
      id: 'cat-' + Date.now(),
      nome: nome.trim(),
    };

    this.storage.saveCategorie([...this.storage.categorie(), nuova]);
    return nuova;
  }

  modificaCategoria(id: string, nome: string): Categoria {
    this.auth.assertPermission(this.auth.canManageAdministration(), 'Gestire categorie');
    if (!nome || nome.trim().length < 2) {
      throw new Error('Il nome della categoria deve contenere almeno 2 caratteri.');
    }

    const cats = this.storage.categorie();
    const index = cats.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('Categoria non trovata.');

    const aggiornata = { ...cats[index], nome: nome.trim() };
    const lista = [...cats];
    lista[index] = aggiornata;
    this.storage.saveCategorie(lista);
    return aggiornata;
  }

  eliminaCategoria(id: string): void {
    this.auth.assertPermission(this.auth.canManageAdministration(), 'Gestire categorie');

    // Regola: "Una categoria con prodotti collegati non si può eliminare, e chi usa il sistema deve capire perché"
    const prodottiCollegati = this.storage.prodotti().filter((p) => p.categoriaId === id);
    if (prodottiCollegati.length > 0) {
      throw new Error(
        `Impossibile eliminare questa categoria: ci sono ${prodottiCollegati.length} prodotti associati. ` +
        `Riassegna o elimina prima i prodotti collegati.`
      );
    }

    this.storage.saveCategorie(this.storage.categorie().filter((c) => c.id !== id));
  }

  // ==========================================
  // FORNITORI CRUD (Livello 1)
  // ==========================================

  creaFornitore(dati: Omit<Fornitore, 'id'>): Fornitore {
    this.auth.assertPermission(this.auth.canManageAdministration(), 'Gestire fornitori');
    if (!dati.ragioneSociale || dati.ragioneSociale.trim().length < 2) {
      throw new Error('La ragione sociale deve contenere almeno 2 caratteri.');
    }

    const nuovo: Fornitore = {
      ...dati,
      id: 'forn-' + Date.now(),
      ragioneSociale: dati.ragioneSociale.trim(),
    };

    this.storage.saveFornitori([...this.storage.fornitori(), nuovo]);
    return nuovo;
  }

  modificaFornitore(id: string, dati: Omit<Fornitore, 'id'>): Fornitore {
    this.auth.assertPermission(this.auth.canManageAdministration(), 'Gestire fornitori');
    const forns = this.storage.fornitori();
    const index = forns.findIndex((f) => f.id === id);
    if (index === -1) throw new Error('Fornitore non trovato.');

    const aggiornato = { ...dati, id, ragioneSociale: dati.ragioneSociale.trim() };
    const lista = [...forns];
    lista[index] = aggiornato;
    this.storage.saveFornitori(lista);
    return aggiornato;
  }

  eliminaFornitore(id: string): void {
    this.auth.assertPermission(this.auth.canManageAdministration(), 'Gestire fornitori');

    // Regola: "Un fornitore con prodotti collegati non si può eliminare, e chi usa il sistema deve capire perché"
    const prodottiCollegati = this.storage.prodotti().filter((p) => p.fornitoreId === id);
    if (prodottiCollegati.length > 0) {
      throw new Error(
        `Impossibile eliminare questo fornitore: ci sono ${prodottiCollegati.length} prodotti associati. ` +
        `Riassegna o elimina prima i prodotti collegati.`
      );
    }

    this.storage.saveFornitori(this.storage.fornitori().filter((f) => f.id !== id));
  }

  // ==========================================
  // MOVIMENTI E GIACENZE (Livello 2 & Concorrenza)
  // ==========================================

  registraMovimento(params: {
    prodottoId: string;
    tipo: TipoMovimento;
    quantita: number;
    causale: string;
    data?: string;
    ordineId?: string;
  }): Movimento {
    this.auth.assertPermission(this.auth.canManageMovements(), 'Registrare carichi e scarichi');

    const { prodottoId, tipo, quantita, causale, ordineId } = params;
    const dataMovimento = params.data || new Date().toISOString();

    // Validazioni
    const prodotto = this.storage.prodotti().find((p) => p.id === prodottoId);
    if (!prodotto) {
      throw new Error(`Prodotto con ID ${prodottoId} non trovato.`);
    }

    if (!Number.isInteger(quantita) || quantita <= 0) {
      throw new Error('La quantità deve essere un numero intero maggiore di zero.');
    }

    if (!causale || causale.trim().length === 0) {
      throw new Error('La causale del movimento è obbligatoria.');
    }

    // Data non nel futuro
    const timestampMovimento = new Date(dataMovimento).getTime();
    if (timestampMovimento > Date.now() + 60000) { // Tolleranza 1 minuto
      throw new Error('La data del movimento non può essere nel futuro.');
    }

    // REGOLA SCARICO: Uno scarico che porterebbe la giacenza sotto zero viene rifiutato!
    // Usiamo il controllo fresco con Mutex Lock di StorageService per prevenire race conditions
    const lockAcquired = this.storage.acquireLock('stock_' + prodottoId);
    try {
      const giacenzaAttuale = this.storage.getFreshGiacenza(prodottoId);

      if (tipo === 'scarico') {
        if (quantita > giacenzaAttuale) {
          throw new Error(
            `Operazione rifiutata: lo scarico di ${quantita} pezzi supera la giacenza disponibile ` +
            `(${giacenzaAttuale} pezzi) per il prodotto '${prodotto.nome}' (${prodotto.sku}).`
          );
        }
      }

      const currentUser = this.auth.currentUser();
      const nuovoMovimento: Movimento = {
        id: 'mov-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        prodottoId,
        tipo,
        quantita,
        data: dataMovimento,
        causale: causale.trim(),
        ordineId,
        operatore: currentUser?.nome || 'Operatore Magazzino',
      };

      const movs = this.storage.getFreshMovimenti();
      this.storage.saveMovimenti([...movs, nuovoMovimento]);

      // Tracciamento Audit
      this.storage.addAuditLog({
        operatore: currentUser?.nome || 'Operatore Magazzino',
        ruolo: currentUser?.ruolo || 'magazziniere',
        tipo: 'registrazione_movimento',
        descrizione: `Registrato ${tipo} di ${quantita} pz per ${prodotto.sku} - Causale: ${causale}`,
        datiNuovi: nuovoMovimento,
        entitaId: nuovoMovimento.id,
        annullabile: true,
      });

      return nuovoMovimento;
    } finally {
      if (lockAcquired) {
        this.storage.releaseLock('stock_' + prodottoId);
      }
    }
  }

  // Storico movimenti con calcolo giacenza progressiva riga per riga per un prodotto
  getStoricoMovimentiConGiacenzaProgressiva(prodottoId: string): Array<{
    movimento: Movimento;
    variazione: number;
    giacenzaProgressiva: number;
  }> {
    const movs = this.storage
      .movimenti()
      .filter((m) => m.prodottoId === prodottoId)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    let runningGiacenza = 0;
    const storico: Array<{
      movimento: Movimento;
      variazione: number;
      giacenzaProgressiva: number;
    }> = [];

    for (const m of movs) {
      const variazione = m.tipo === 'carico' ? m.quantita : -m.quantita;
      runningGiacenza += variazione;
      storico.push({
        movimento: m,
        variazione,
        giacenzaProgressiva: runningGiacenza,
      });
    }

    // Restituisce ordinati dal più recente al più vecchio per visualizzazione comoda
    return storico.reverse();
  }
}
