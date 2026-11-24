import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';
import { InventoryService } from './inventory.service';
import {
  Ordine,
  RigaOrdine,
  StatoOrdine,
  Movimento,
} from '../models/entities';

export interface TotaliOrdine {
  lordo: number;
  percentualeSconto: number;
  importoSconto: number;
  imponibile: number;
  iva: number;
  totale: number;
}

@Injectable({
  providedIn: 'root',
})
export class OrderService {
  constructor(
    private storage: StorageService,
    private auth: AuthService,
    private inventory: InventoryService
  ) {
    if (typeof window !== 'undefined') {
      (window as any).vallebrunaOrders = this;
    }
  }

  // ==========================================
  // CALCOLO TOTALI (Livello 3)
  // Regola:
  // Somma righe:
  // - meno di 500 €: sconto nessuno
  // - da 500 € a meno di 1.000 €: 5%
  // - 1.000 € o più: 10%
  // IVA 22% sull'importo scontato
  // Test confini: 499.99 € / 500 € / 999.99 € / 1.000 €
  // ==========================================
  calcolaTotali(righe: Array<{ quantita: number; prezzoUnitario: number }>): TotaliOrdine {
    const lordo = righe.reduce((sum, r) => sum + r.quantita * r.prezzoUnitario, 0);

    let percentualeSconto = 0;
    if (lordo >= 1000) {
      percentualeSconto = 10;
    } else if (lordo >= 500) {
      percentualeSconto = 5;
    } else {
      percentualeSconto = 0;
    }

    const importoSconto = (lordo * percentualeSconto) / 100;
    const imponibile = lordo - importoSconto;
    const iva = (imponibile * 22) / 100;
    const totale = imponibile + iva;

    return {
      lordo: Math.round(lordo * 100) / 100,
      percentualeSconto,
      importoSconto: Math.round(importoSconto * 100) / 100,
      imponibile: Math.round(imponibile * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      totale: Math.round(totale * 100) / 100,
    };
  }

  // Creazione ordine: commerciale o admin
  creaOrdine(dati: {
    cliente: string;
    righe: Array<{ prodottoId: string; quantita: number }>;
  }): Ordine {
    this.auth.assertPermission(this.auth.canCreateOrders(), 'Creare ordini');

    if (!dati.cliente || dati.cliente.trim().length < 2) {
      throw new Error('Il nome del cliente è obbligatorio (minimo 2 caratteri).');
    }

    if (!dati.righe || dati.righe.length === 0) {
      throw new Error("L'ordine deve contenere almeno una riga prodotto.");
    }

    // Congelamento del prezzo unitario dal prodotto attuale
    const prodottiMap = new Map(this.storage.prodotti().map((p) => [p.id, p]));
    const righeCongelate: RigaOrdine[] = [];

    for (const r of dati.righe) {
      const prod = prodottiMap.get(r.prodottoId);
      if (!prod) {
        throw new Error(`Prodotto con ID ${r.prodottoId} non valido.`);
      }
      if (!Number.isInteger(r.quantita) || r.quantita <= 0) {
        throw new Error(`Quantità per '${prod.nome}' non valida (deve essere intera > 0).`);
      }

      righeCongelate.push({
        prodottoId: r.prodottoId,
        quantita: r.quantita,
        prezzoUnitario: prod.prezzoVendita, // CONGELATO
      });
    }

    const ordini = this.storage.ordini();
    const numeroProgressivo = ordini.length + 1;
    const numeroOrdine = `ORD-2026-${String(numeroProgressivo).padStart(3, '0')}`;

    const nuovoOrdine: Ordine = {
      id: 'ord-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      numero: numeroOrdine,
      cliente: dati.cliente.trim(),
      data: new Date().toISOString(),
      stato: 'nuovo',
      righe: righeCongelate,
    };

    this.storage.saveOrdini([nuovoOrdine, ...ordini]);

    const currentUser = this.auth.currentUser();
    this.storage.addAuditLog({
      operatore: currentUser?.nome || 'Commerciale',
      ruolo: currentUser?.ruolo || 'commerciale',
      tipo: 'creazione_ordine',
      descrizione: `Creato ordine ${nuovoOrdine.numero} per cliente ${nuovoOrdine.cliente}`,
      datiNuovi: nuovoOrdine,
      entitaId: nuovoOrdine.id,
      annullabile: true,
    });

    return nuovoOrdine;
  }

  // ==========================================
  // TRANSIZIONI DI STATO DELL'ORDINE
  // nuovo -> in preparazione -> spedito -> consegnato
  // annullamento: solo da nuovo o da in preparazione
  // ==========================================
  cambiaStato(ordineId: string, nuovoStato: StatoOrdine): Ordine {
    const ordini = this.storage.ordini();
    const index = ordini.findIndex((o) => o.id === ordineId);
    if (index === -1) {
      throw new Error(`Ordine con ID ${ordineId} non trovato.`);
    }

    const ordine = ordini[index];
    const statoAttuale = ordine.stato;

    // Controllo transizioni vietate
    if (nuovoStato === 'annullato') {
      this.auth.assertPermission(this.auth.canCancelOrders(), 'Annullare ordini');
      if (statoAttuale !== 'nuovo' && statoAttuale !== 'in preparazione') {
        throw new Error(
          `Impossibile annullare l'ordine ${ordine.numero}: si può annullare solo dallo stato ` +
          `'nuovo' o 'in preparazione' (stato attuale: '${statoAttuale}').`
        );
      }
    } else {
      // Avanzamento stato (magazziniere o admin)
      this.auth.assertPermission(
        this.auth.canAdvanceOrderStatus(),
        'Avanzare stato ordine (in preparazione / spedito / consegnato)'
      );

      const transizioniValide: Record<StatoOrdine, StatoOrdine[]> = {
        'nuovo': ['in preparazione'],
        'in preparazione': ['spedito'],
        'spedito': ['consegnato'],
        'consegnato': [],
        'annullato': [],
      };

      const permesse = transizioniValide[statoAttuale] || [];
      if (!permesse.includes(nuovoStato)) {
        throw new Error(
          `Transizione vietata per l'ordine ${ordine.numero}: da '${statoAttuale}' a '${nuovoStato}'. ` +
          `Transizioni consentite: [${permesse.join(', ') || 'nessuna'}].`
        );
      }
    }

    // GESTIONE SPECIALE: PASSAGGIO A "SPEDITO"
    // "Passando a spedito si generano automaticamente i movimenti di scarico,
    // uno per riga, con causale «Ordine N». Se manca giacenza, il passaggio è
    // bloccato e si elencano i prodotti che mancano."
    if (nuovoStato === 'spedito') {
      this.eseguiSpedizioneConScaricoAutomatico(ordine);
    }

    // Aggiornamento stato
    const ordineAggiornato: Ordine = {
      ...ordine,
      stato: nuovoStato,
    };

    const aggiornati = [...ordini];
    aggiornati[index] = ordineAggiornato;
    this.storage.saveOrdini(aggiornati);

    const currentUser = this.auth.currentUser();
    this.storage.addAuditLog({
      operatore: currentUser?.nome || 'Operatore',
      ruolo: currentUser?.ruolo || 'magazziniere',
      tipo: nuovoStato === 'annullato' ? 'annullamento_ordine' : 'cambio_stato_ordine',
      descrizione: `Ordine ${ordine.numero}: stato cambiato da '${statoAttuale}' a '${nuovoStato}'`,
      datiPrecedenti: ordine,
      datiNuovi: ordineAggiornato,
      entitaId: ordine.id,
      annullabile: nuovoStato !== 'spedito', // La spedizione genera scarichi fisici
    });

    return ordineAggiornato;
  }

  private eseguiSpedizioneConScaricoAutomatico(ordine: Ordine): void {
    // 1. Acquisizione Lock globale per operazione atomica di magazzino
    const lockAcquired = this.storage.acquireLock('order_shipping_' + ordine.id);

    try {
      // 2. Controllo di freschezza giacenze per tutte le righe direttamente da storage
      const movsFreschi = this.storage.getFreshMovimenti();
      const prodotti = this.storage.prodotti();
      const mappaProdotti = new Map(prodotti.map((p) => [p.id, p]));

      // Calcola giacenze fresche
      const giacenzeFresche = new Map<string, number>();
      for (const m of movsFreschi) {
        const curr = giacenzeFresche.get(m.prodottoId) || 0;
        giacenzeFresche.set(
          m.prodottoId,
          curr + (m.tipo === 'carico' ? m.quantita : -m.quantita)
        );
      }

      // Raggruppa le quantità richieste per prodotto (caso in cui ci fossero più righe per lo stesso prodotto)
      const quantitaRichiestaPerProdotto = new Map<string, number>();
      for (const r of ordine.righe) {
        const cur = quantitaRichiestaPerProdotto.get(r.prodottoId) || 0;
        quantitaRichiestaPerProdotto.set(r.prodottoId, cur + r.quantita);
      }

      // Verifica se ci sono mancanze di stock
      const mancanze: string[] = [];
      for (const [prodottoId, richiesta] of quantitaRichiestaPerProdotto.entries()) {
        const giacenzaDisponibile = giacenzeFresche.get(prodottoId) || 0;
        if (richiesta > giacenzaDisponibile) {
          const p = mappaProdotti.get(prodottoId);
          const nomeProd = p ? `${p.sku} - ${p.nome}` : prodottoId;
          mancanze.push(
            `• ${nomeProd}: richiesti ${richiesta} pz, disponibili solo ${giacenzaDisponibile} pz (mancano ${richiesta - giacenzaDisponibile} pz)`
          );
        }
      }

      if (mancanze.length > 0) {
        throw new Error(
          `Impossibile spedire l'ordine ${ordine.numero}: giacenza insufficiente per i seguenti articoli:\n` +
          mancanze.join('\n')
        );
      }

      // 3. Generazione automatica dei movimenti di scarico per ogni riga
      const currentUser = this.auth.currentUser();
      const nuoviMovimenti: Movimento[] = ordine.righe.map((r, idx) => ({
        id: `mov-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
        prodottoId: r.prodottoId,
        tipo: 'scarico',
        quantita: r.quantita,
        data: new Date().toISOString(),
        causale: `Ordine ${ordine.numero}`,
        ordineId: ordine.id,
        operatore: currentUser?.nome || 'Spedizione automatica',
      }));

      // Salva atomicamente i nuovi movimenti
      this.storage.saveMovimenti([...movsFreschi, ...nuoviMovimenti]);
    } finally {
      if (lockAcquired) {
        this.storage.releaseLock('order_shipping_' + ordine.id);
      }
    }
  }

  // Azioni lecite a seconda dello stato per la UI
  getAzioniConsentite(ordine: Ordine): Array<{ label: string; nuovoStato: StatoOrdine; classe: string }> {
    const azioni: Array<{ label: string; nuovoStato: StatoOrdine; classe: string }> = [];

    if (ordine.stato === 'nuovo') {
      if (this.auth.canAdvanceOrderStatus()) {
        azioni.push({ label: 'Prepara Ordine', nuovoStato: 'in preparazione', classe: 'btn-secondary' });
      }
      if (this.auth.canCancelOrders()) {
        azioni.push({ label: 'Annulla Ordine', nuovoStato: 'annullato', classe: 'btn-danger' });
      }
    } else if (ordine.stato === 'in preparazione') {
      if (this.auth.canAdvanceOrderStatus()) {
        azioni.push({ label: 'Spedisci Merce', nuovoStato: 'spedito', classe: 'btn-success' });
      }
      if (this.auth.canCancelOrders()) {
        azioni.push({ label: 'Annulla Ordine', nuovoStato: 'annullato', classe: 'btn-danger' });
      }
    } else if (ordine.stato === 'spedito') {
      if (this.auth.canAdvanceOrderStatus()) {
        azioni.push({ label: 'Segna Consegnato', nuovoStato: 'consegnato', classe: 'btn-primary' });
      }
    }

    return azioni;
  }
}
