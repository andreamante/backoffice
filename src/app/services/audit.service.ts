import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';
import { OperazioneAudit } from '../models/entities';

@Injectable({
  providedIn: 'root',
})
export class AuditService {
  constructor(
    private storage: StorageService,
    private auth: AuthService
  ) {}

  annullaUltimaOperazione(): { success: boolean; message: string } {
    this.auth.assertPermission(this.auth.canManageAdministration(), 'Annullare operazioni di audit');

    const logs = this.storage.auditLogs();
    const indiceUltimaAnnullabile = logs.findIndex((l) => l.annullabile);

    if (indiceUltimaAnnullabile === -1) {
      return { success: false, message: 'Nessuna operazione recente annullabile trovata.' };
    }

    const op = logs[indiceUltimaAnnullabile];

    try {
      switch (op.tipo) {
        case 'creazione_prodotto': {
          // Elimina il prodotto creato
          if (op.entitaId) {
            const prods = this.storage.prodotti().filter((p) => p.id !== op.entitaId);
            this.storage.saveProdotti(prods);
          }
          break;
        }

        case 'modifica_prodotto': {
          // Ripristina i dati precedenti del prodotto
          if (op.entitaId && op.datiPrecedenti) {
            const prods = this.storage.prodotti().map((p) =>
              p.id === op.entitaId ? op.datiPrecedenti : p
            );
            this.storage.saveProdotti(prods);
          }
          break;
        }

        case 'eliminazione_prodotto': {
          // Ripristina il prodotto eliminato
          if (op.datiPrecedenti) {
            const prods = [...this.storage.prodotti(), op.datiPrecedenti];
            this.storage.saveProdotti(prods);
          }
          break;
        }

        case 'registrazione_movimento': {
          // Rimuove il movimento registrato
          if (op.entitaId) {
            const movs = this.storage.movimenti().filter((m) => m.id !== op.entitaId);
            this.storage.saveMovimenti(movs);
          }
          break;
        }

        case 'creazione_ordine': {
          // Rimuove l'ordine creato se era ancora 'nuovo'
          if (op.entitaId) {
            const ords = this.storage.ordini().filter((o) => o.id !== op.entitaId);
            this.storage.saveOrdini(ords);
          }
          break;
        }

        case 'cambio_stato_ordine':
        case 'annullamento_ordine': {
          // Ripristina lo stato precedente dell'ordine
          if (op.entitaId && op.datiPrecedenti) {
            const ords = this.storage.ordini().map((o) =>
              o.id === op.entitaId ? op.datiPrecedenti : o
            );
            this.storage.saveOrdini(ords);
          }
          break;
        }

        default:
          return { success: false, message: `Tipo operazione '${op.tipo}' non supporta l'annullamento.` };
      }

      // Segna l'operazione come non più annullabile
      const logsAggiornati = [...logs];
      logsAggiornati[indiceUltimaAnnullabile] = { ...op, annullabile: false };
      this.storage.saveAuditLogs(logsAggiornati);

      // Registra nel log l'annullamento effettuato
      const currentUser = this.auth.currentUser();
      this.storage.addAuditLog({
        operatore: currentUser?.nome || 'Amministratore',
        ruolo: currentUser?.ruolo || 'amministratore',
        tipo: 'modifica_prodotto',
        descrizione: `Annullata operazione: ${op.descrizione}`,
        annullabile: false,
      });

      return { success: true, message: `Operazione "${op.descrizione}" annullata con successo.` };
    } catch (err: any) {
      return { success: false, message: `Errore durante il rollback: ${err.message}` };
    }
  }
}
