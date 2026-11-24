import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StorageService } from '../../services/storage.service';
import { AuthService } from '../../services/auth.service';
import { OrderService } from '../../services/order.service';
import { InventoryService } from '../../services/inventory.service';
import { ProdottoConGiacenza, Ordine } from '../../models/entities';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  // Concurrency Simulation State
  simulationResult = signal<string | null>(null);
  simulationLog = signal<string[]>([]);
  isSimulating = signal<boolean>(false);

  constructor(
    public storage: StorageService,
    public auth: AuthService,
    private orderService: OrderService,
    private inventory: InventoryService
  ) {}

  // 1. Valore totale del magazzino (giacenza * prezzo)
  readonly valoreMagazzino = computed(() => {
    return this.storage.prodottiConGiacenza().reduce((acc, p) => {
      return acc + (p.giacenza * p.prezzoVendita);
    }, 0);
  });

  // 2. Numero prodotti sotto scorta ed esauriti
  readonly conteggioEsauriti = computed(() => {
    return this.storage.prodottiConGiacenza().filter((p) => p.statoScorta === 'Esaurito' && p.attivo).length;
  });

  readonly conteggioSottoScorta = computed(() => {
    return this.storage.prodottiConGiacenza().filter((p) => p.statoScorta === 'Sotto scorta' && p.attivo).length;
  });

  // 3. Ordini per stato
  readonly ordiniPerStato = computed(() => {
    const map = {
      nuovo: 0,
      'in preparazione': 0,
      spedito: 0,
      consegnato: 0,
      annullato: 0,
    };
    for (const o of this.storage.ordini()) {
      if (map[o.stato] !== undefined) {
        map[o.stato]++;
      }
    }
    return map;
  });

  // 4. I 5 prodotti più scaricati del mese con grafico SVG o CSS
  readonly topScaricatiMese = computed(() => {
    const movs = this.storage.movimenti();
    const scarichi = movs.filter((m) => m.tipo === 'scarico');

    const totaliPerProdotto = new Map<string, number>();
    for (const s of scarichi) {
      totaliPerProdotto.set(s.prodottoId, (totaliPerProdotto.get(s.prodottoId) || 0) + s.quantita);
    }

    const prodsMap = new Map(this.storage.prodotti().map((p) => [p.id, p]));

    const sorted = Array.from(totaliPerProdotto.entries())
      .map(([id, quantita]) => {
        const prod = prodsMap.get(id);
        return {
          id,
          sku: prod ? prod.sku : id,
          nome: prod ? prod.nome : 'Prodotto non trovato',
          quantita,
        };
      })
      .sort((a, b) => b.quantita - a.quantita)
      .slice(0, 5);

    const maxQta = sorted.length > 0 ? Math.max(...sorted.map((s) => s.quantita)) : 1;

    return sorted.map((item) => ({
      ...item,
      percentuale: Math.round((item.quantita / maxQta) * 100),
    }));
  });

  // 5. Esportazione CSV dei prodotti con la giacenza (Livello 5)
  // Nota: se l'utente è magazziniere, il prezzo viene escluso dal CSV
  esportaCSV(): void {
    const prodotti = this.storage.prodottiConGiacenza();
    const canSeePrices = this.auth.canViewPrices();

    const headers = canSeePrices
      ? ['SKU', 'Nome', 'Categoria', 'Fornitore', 'Prezzo Vendita', 'Giacenza', 'Scorta Minima', 'Stato Scorta', 'Attivo']
      : ['SKU', 'Nome', 'Categoria', 'Fornitore', 'Giacenza', 'Scorta Minima', 'Stato Scorta', 'Attivo'];

    const rows = prodotti.map((p) => {
      const base = [
        `"${p.sku}"`,
        `"${p.nome.replace(/"/g, '""')}"`,
        `"${p.nomeCategoria || ''}"`,
        `"${p.nomeFornitore || ''}"`,
      ];

      if (canSeePrices) {
        base.push(`"${p.prezzoVendita.toFixed(2)}"`);
      }

      base.push(
        `"${p.giacenza}"`,
        `"${p.scortaMinima}"`,
        `"${p.statoScorta}"`,
        `"${p.attivo ? 'Sì' : 'No'}"`
      );

      return base.join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `vallebruna_giacenze_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // 6. Test Suite Concorrenza: Riproduzione e Mitigazione del problema giacenza negativa
  // "Un prodotto ha una giacenza di 5 pezzi. Due nostri operatori, ciascuno davanti alla propria schermata,
  // spediscono nello stesso istante due ordini che richiedono 4 pezzi ciascuno..."
  async simulaProblemaConcorrenza(): Promise<void> {
    this.isSimulating.set(true);
    this.simulationLog.set([]);

    const log = (msg: string) => {
      this.simulationLog.update((l) => [...l, msg]);
    };

    log('--- INIZIO SIMULAZIONE SCENARIO CONCORRENZA ---');
    log('Scenario: Prodotto di test impostato con giacenza = 5 pezzi.');
    log('Due ordini A e B richiedono ciascuno 4 pezzi dello stesso prodotto.');

    // Creiamo un prodotto di test dedicato con giacenza 5
    const skuTest = 'CONC-' + Math.floor(1000 + Math.random() * 9000);
    const cat = this.storage.categorie()[0]?.id || 'cat-1';
    const forn = this.storage.fornitori()[0]?.id || 'forn-1';

    let testProd;
    try {
      testProd = this.inventory.creaProdotto({
        sku: skuTest,
        nome: `Prodotto Test Concorrenza (${skuTest})`,
        descrizione: 'Articolo creato per verificare la protezione contro giacenze negative concorrenti',
        categoriaId: cat,
        fornitoreId: forn,
        prezzoVendita: 10.0,
        scortaMinima: 2,
        attivo: true,
      });

      // Carichiamo esattamente 5 pezzi
      this.inventory.registraMovimento({
        prodottoId: testProd.id,
        tipo: 'carico',
        quantita: 5,
        causale: 'Carico iniziale test concorrenza (5 pz)',
      });

      log(`Creato prodotto ${testProd.sku} con giacenza iniziale: ${this.storage.getFreshGiacenza(testProd.id)} pz.`);

      // Creiamo Ordine 1 (richiede 4 pz)
      const ord1 = this.orderService.creaOrdine({
        cliente: 'Operatore 1 (Schermata A)',
        righe: [{ prodottoId: testProd.id, quantita: 4 }],
      });
      // Portiamo in preparazione
      this.orderService.cambiaStato(ord1.id, 'in preparazione');

      // Creiamo Ordine 2 (richiede 4 pz)
      const ord2 = this.orderService.creaOrdine({
        cliente: 'Operatore 2 (Schermata B)',
        righe: [{ prodottoId: testProd.id, quantita: 4 }],
      });
      this.orderService.cambiaStato(ord2.id, 'in preparazione');

      log(`Creati Ordine ${ord1.numero} (4 pz) e Ordine ${ord2.numero} (4 pz) in stato "in preparazione".`);
      log('Simulazione click simultaneo "Spedisci" da entrambi gli operatori...');

      // Esecuzione concorrente simulata
      const eseguiSpedizione = (ordineId: string, nomeOperatore: string) => {
        return new Promise<string>((resolve, reject) => {
          setTimeout(() => {
            try {
              this.orderService.cambiaStato(ordineId, 'spedito');
              resolve(`[SUCCESSO] ${nomeOperatore} ha completato la spedizione.`);
            } catch (err: any) {
              reject(`[BLOCCATO DAL SISTEMA] ${nomeOperatore} respinto: ${err.message}`);
            }
          }, Math.floor(Math.random() * 20)); // Quasi simultaneo
        });
      };

      const [res1, res2] = await Promise.allSettled([
        eseguiSpedizione(ord1.id, 'Operatore 1'),
        eseguiSpedizione(ord2.id, 'Operatore 2'),
      ]);

      if (res1.status === 'fulfilled') log(res1.value);
      else log(res1.reason);

      if (res2.status === 'fulfilled') log(res2.value);
      else log(res2.reason);

      const giacenzaFinale = this.storage.getFreshGiacenza(testProd.id);
      log(`--- ESITO FINALE: Giacenza rimanente del prodotto: ${giacenzaFinale} pz ---`);

      if (giacenzaFinale >= 0) {
        log('🛡️ VERIFICA SUPERATA: La giacenza NON è mai scesa sotto zero (-3 scongiurato!).');
        this.simulationResult.set('SUCCESSO: La mitigazione ha impedito la giacenza negativa!');
      } else {
        log('❌ FALLIMENTO: La giacenza è diventata negativa.');
        this.simulationResult.set('ERRORE: Rilevata giacenza negativa.');
      }
    } catch (e: any) {
      log(`Errore setup simulazione: ${e.message}`);
    } finally {
      this.isSubmittingSimulation(false);
    }
  }

  private isSubmittingSimulation(status: boolean): void {
    this.isSimulating.set(status);
  }
}
