import { Injectable, signal, computed } from '@angular/core';
import {
  Categoria,
  Fornitore,
  Prodotto,
  Movimento,
  Ordine,
  Utente,
  OperazioneAudit,
  ProdottoConGiacenza,
  StatoScorta,
} from '../models/entities';
import {
  SEED_CATEGORIE,
  SEED_FORNITORI,
  SEED_PRODOTTI,
  SEED_MOVIMENTI,
  SEED_ORDINI,
  SEED_UTENTI,
} from '../data/seed.data';

const STORAGE_KEYS = {
  CATEGORIE: 'vallebruna_categorie',
  FORNITORI: 'vallebruna_fornitori',
  PRODOTTI: 'vallebruna_prodotti',
  MOVIMENTI: 'vallebruna_movimenti',
  ORDINI: 'vallebruna_ordini',
  UTENTI: 'vallebruna_utenti',
  CURRENT_USER: 'vallebruna_current_user',
  AUDIT_LOGS: 'vallebruna_audit_logs',
  LOCK: 'vallebruna_inventory_lock',
};

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  private broadcastChannel: BroadcastChannel | null = null;

  // Primary Signals
  readonly categorie = signal<Categoria[]>([]);
  readonly fornitori = signal<Fornitore[]>([]);
  readonly prodotti = signal<Prodotto[]>([]);
  readonly movimenti = signal<Movimento[]>([]);
  readonly ordini = signal<Ordine[]>([]);
  readonly utenti = signal<Utente[]>([]);
  readonly auditLogs = signal<OperazioneAudit[]>([]);

  // Simulation flags
  readonly concurrencySimEnabled = signal<boolean>(false);

  // COMPUTED SIGNALS: REGOLA NUMERO UNO
  // "La giacenza non è un dato che si scrive: si calcola sempre dai movimenti
  // (somma dei carichi meno somma degli scarichi)."
  readonly giacenzeMappa = computed(() => {
    const movs = this.movimenti();
    const mappa = new Map<string, number>();

    // Inizializza con zero per tutti i prodotti noti
    for (const p of this.prodotti()) {
      mappa.set(p.id, 0);
    }

    for (const m of movs) {
      const current = mappa.get(m.prodottoId) || 0;
      if (m.tipo === 'carico') {
        mappa.set(m.prodottoId, current + m.quantita);
      } else if (m.tipo === 'scarico') {
        mappa.set(m.prodottoId, current - m.quantita);
      }
    }
    return mappa;
  });

  readonly prodottiConGiacenza = computed<ProdottoConGiacenza[]>(() => {
    const prods = this.prodotti();
    const mappa = this.giacenzeMappa();
    const cats = new Map(this.categorie().map((c) => [c.id, c.nome]));
    const forns = new Map(this.fornitori().map((f) => [f.id, f.ragioneSociale]));

    return prods.map((p) => {
      const giacenza = mappa.get(p.id) ?? 0;
      let statoScorta: StatoScorta = 'Ok';

      if (giacenza === 0) {
        statoScorta = 'Esaurito';
      } else if (giacenza <= p.scortaMinima) {
        statoScorta = 'Sotto scorta';
      } else {
        statoScorta = 'Ok';
      }

      // Regola: Quantità da riordinare = 2 × scorta minima − giacenza (per esauriti o sotto scorta)
      let quantitaDaRiordinare = 0;
      if (statoScorta === 'Esaurito' || statoScorta === 'Sotto scorta') {
        quantitaDaRiordinare = Math.max(0, 2 * p.scortaMinima - giacenza);
      }

      return {
        ...p,
        giacenza,
        statoScorta,
        quantitaDaRiordinare,
        nomeCategoria: cats.get(p.categoriaId) || 'Non assegnata',
        nomeFornitore: forns.get(p.fornitoreId) || 'Non specificato',
      };
    });
  });

  // Prodotti da riordinare raggruppati per fornitore
  readonly daRiordinarePerFornitore = computed(() => {
    const all = this.prodottiConGiacenza();
    const daRiordinare = all.filter(
      (p) => (p.statoScorta === 'Esaurito' || p.statoScorta === 'Sotto scorta') && p.attivo
    );

    const fornitoreMap = new Map<
      string,
      { fornitore: Fornitore; prodotti: ProdottoConGiacenza[] }
    >();

    for (const p of daRiordinare) {
      const fornitore = this.fornitori().find((f) => f.id === p.fornitoreId) || {
        id: p.fornitoreId,
        ragioneSociale: p.nomeFornitore || 'Fornitore sconosciuto',
        email: '-',
        telefono: '-',
      };

      if (!fornitoreMap.has(fornitore.id)) {
        fornitoreMap.set(fornitore.id, { fornitore, prodotti: [] });
      }
      fornitoreMap.get(fornitore.id)!.prodotti.push(p);
    }

    return Array.from(fornitoreMap.values());
  });

  constructor() {
    this.initBroadcastChannel();
    this.initStorageListener();
    this.loadAll();
  }

  private initBroadcastChannel(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('vallebruna_cross_tab_sync');
      this.broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'SYNC') {
          this.loadAll();
        }
      };
    }
  }

  private initStorageListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key && event.key.startsWith('vallebruna_')) {
          this.loadAll();
        }
      });
    }
  }

  private notifyOtherTabs(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type: 'SYNC', timestamp: Date.now() });
    }
  }

  loadAll(): void {
    if (typeof window === 'undefined') return;

    // Se manca una chiave principale, inizializziamo con i SEED
    const existingCats = localStorage.getItem(STORAGE_KEYS.CATEGORIE);
    if (!existingCats) {
      this.resetToSeed();
      return;
    }

    try {
      this.categorie.set(JSON.parse(localStorage.getItem(STORAGE_KEYS.CATEGORIE) || '[]'));
      this.fornitori.set(JSON.parse(localStorage.getItem(STORAGE_KEYS.FORNITORI) || '[]'));
      this.prodotti.set(JSON.parse(localStorage.getItem(STORAGE_KEYS.PRODOTTI) || '[]'));
      this.movimenti.set(JSON.parse(localStorage.getItem(STORAGE_KEYS.MOVIMENTI) || '[]'));
      this.ordini.set(JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDINI) || '[]'));
      this.utenti.set(JSON.parse(localStorage.getItem(STORAGE_KEYS.UTENTI) || '[]'));
      this.auditLogs.set(JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS) || '[]'));
    } catch (e) {
      console.error('Errore nel caricamento da localStorage, ripristino seed:', e);
      this.resetToSeed();
    }
  }

  resetToSeed(): void {
    if (typeof window === 'undefined') return;

    localStorage.setItem(STORAGE_KEYS.CATEGORIE, JSON.stringify(SEED_CATEGORIE));
    localStorage.setItem(STORAGE_KEYS.FORNITORI, JSON.stringify(SEED_FORNITORI));
    localStorage.setItem(STORAGE_KEYS.PRODOTTI, JSON.stringify(SEED_PRODOTTI));
    localStorage.setItem(STORAGE_KEYS.MOVIMENTI, JSON.stringify(SEED_MOVIMENTI));
    localStorage.setItem(STORAGE_KEYS.ORDINI, JSON.stringify(SEED_ORDINI));
    localStorage.setItem(STORAGE_KEYS.UTENTI, JSON.stringify(SEED_UTENTI));
    localStorage.setItem(
      STORAGE_KEYS.AUDIT_LOGS,
      JSON.stringify([
        {
          id: 'audit-init',
          timestamp: new Date().toISOString(),
          operatore: 'Sistema',
          ruolo: 'amministratore',
          tipo: 'creazione_prodotto',
          descrizione: 'Inizializzazione archivio dati Livello 0',
          annullabile: false,
        },
      ])
    );

    this.categorie.set(SEED_CATEGORIE);
    this.fornitori.set(SEED_FORNITORI);
    this.prodotti.set(SEED_PRODOTTI);
    this.movimenti.set(SEED_MOVIMENTI);
    this.ordini.set(SEED_ORDINI);
    this.utenti.set(SEED_UTENTI);
    this.auditLogs.set([
      {
        id: 'audit-init',
        timestamp: new Date().toISOString(),
        operatore: 'Sistema',
        ruolo: 'amministratore',
        tipo: 'creazione_prodotto',
        descrizione: 'Inizializzazione archivio dati Livello 0',
        annullabile: false,
      },
    ]);

    this.notifyOtherTabs();
  }

  // --- SAVE METHODS WITH IMMEDIATE PERSISTENCE & REACTIVITY ---

  saveCategorie(cats: Categoria[]): void {
    localStorage.setItem(STORAGE_KEYS.CATEGORIE, JSON.stringify(cats));
    this.categorie.set(cats);
    this.notifyOtherTabs();
  }

  saveFornitori(forns: Fornitore[]): void {
    localStorage.setItem(STORAGE_KEYS.FORNITORI, JSON.stringify(forns));
    this.fornitori.set(forns);
    this.notifyOtherTabs();
  }

  saveProdotti(prods: Prodotto[]): void {
    localStorage.setItem(STORAGE_KEYS.PRODOTTI, JSON.stringify(prods));
    this.prodotti.set(prods);
    this.notifyOtherTabs();
  }

  saveMovimenti(movs: Movimento[]): void {
    localStorage.setItem(STORAGE_KEYS.MOVIMENTI, JSON.stringify(movs));
    this.movimenti.set(movs);
    this.notifyOtherTabs();
  }

  saveOrdini(ords: Ordine[]): void {
    localStorage.setItem(STORAGE_KEYS.ORDINI, JSON.stringify(ords));
    this.ordini.set(ords);
    this.notifyOtherTabs();
  }

  saveUtenti(usrs: Utente[]): void {
    localStorage.setItem(STORAGE_KEYS.UTENTI, JSON.stringify(usrs));
    this.utenti.set(usrs);
    this.notifyOtherTabs();
  }

  saveAuditLogs(logs: OperazioneAudit[]): void {
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs));
    this.auditLogs.set(logs);
    this.notifyOtherTabs();
  }

  addAuditLog(log: Omit<OperazioneAudit, 'id' | 'timestamp'>): OperazioneAudit {
    const newLog: OperazioneAudit = {
      ...log,
      id: 'audit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
    };
    const current = this.auditLogs();
    const updated = [newLog, ...current];
    this.saveAuditLogs(updated);
    return newLog;
  }

  // Atomically check fresh movements directly from localStorage (vital for concurrency prevention)
  getFreshMovimenti(): Movimento[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.MOVIMENTI) || '[]');
    } catch {
      return [];
    }
  }

  getFreshGiacenza(prodottoId: string): number {
    const movs = this.getFreshMovimenti();
    let giacenza = 0;
    for (const m of movs) {
      if (m.prodottoId === prodottoId) {
        if (m.tipo === 'carico') {
          giacenza += m.quantita;
        } else if (m.tipo === 'scarico') {
          giacenza -= m.quantita;
        }
      }
    }
    return giacenza;
  }

  // Mutex Lock for Concurrency Mitigation (Livello 4/5 - Problema Concorrenza)
  acquireLock(resourceName: string, timeoutMs: number = 3000): boolean {
    const lockKey = `${STORAGE_KEYS.LOCK}_${resourceName}`;
    const now = Date.now();
    const lockVal = localStorage.getItem(lockKey);

    if (lockVal) {
      const lockData = JSON.parse(lockVal);
      // If lock has not expired yet
      if (now < lockData.expiresAt) {
        return false;
      }
    }

    localStorage.setItem(
      lockKey,
      JSON.stringify({
        token: Math.random().toString(36),
        acquiredAt: now,
        expiresAt: now + timeoutMs,
      })
    );
    return true;
  }

  releaseLock(resourceName: string): void {
    const lockKey = `${STORAGE_KEYS.LOCK}_${resourceName}`;
    localStorage.removeItem(lockKey);
  }
}
