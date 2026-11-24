import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StorageService } from '../../services/storage.service';
import { InventoryService } from '../../services/inventory.service';
import { AuthService } from '../../services/auth.service';
import { TipoMovimento, Movimento, ProdottoConGiacenza } from '../../models/entities';

@Component({
  selector: 'app-movements',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './movements.component.html',
})
export class MovementsComponent implements OnInit {
  // Form fields
  selectedProdottoId = signal<string>('');
  tipoMovimento = signal<TipoMovimento>('carico');
  quantita = signal<number>(1);
  causale = signal<string>('');
  dataMovimento = signal<string>('');

  // Status
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  isSubmitting = signal<boolean>(false);

  // Table filter
  filterProdottoId = signal<string>('all');
  filterTipo = signal<'all' | TipoMovimento>('all');

  // Currently selected product details
  readonly selectedProduct = computed<ProdottoConGiacenza | null>(() => {
    const id = this.selectedProdottoId();
    if (!id) return null;
    return this.storage.prodottiConGiacenza().find((p) => p.id === id) || null;
  });

  // Preview projected giacenza
  readonly projectedGiacenza = computed<number | null>(() => {
    const p = this.selectedProduct();
    if (!p) return null;
    const q = this.quantita() || 0;
    if (this.tipoMovimento() === 'carico') {
      return p.giacenza + q;
    } else {
      return p.giacenza - q;
    }
  });

  // Recent movements list
  readonly filteredMovements = computed(() => {
    let list = this.storage.movimenti();
    const pid = this.filterProdottoId();
    const tipo = this.filterTipo();

    if (pid !== 'all') {
      list = list.filter((m) => m.prodottoId === pid);
    }
    if (tipo !== 'all') {
      list = list.filter((m) => m.tipo === tipo);
    }

    const prodsMap = new Map(this.storage.prodotti().map((p) => [p.id, p]));

    return [...list]
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
      .map((m) => {
        const prod = prodsMap.get(m.prodottoId);
        return {
          ...m,
          nomeProdotto: prod ? prod.nome : 'Prodotto rimosso',
          skuProdotto: prod ? prod.sku : '-',
        };
      });
  });

  constructor(
    private route: ActivatedRoute,
    public storage: StorageService,
    private inventory: InventoryService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    // Imposta data e ora attuale in formato ISO per datetime-local (YYYY-MM-DDTHH:mm)
    const now = new Date();
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    this.dataMovimento.set(localIso);

    // Se passato via query param ?prodottoId=...
    this.route.queryParams.subscribe((params) => {
      if (params['prodottoId']) {
        this.selectedProdottoId.set(params['prodottoId']);
      }
    });
  }

  onSubmit(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const pid = this.selectedProdottoId();
    if (!pid) {
      this.errorMessage.set('Seleziona un prodotto per registrare il movimento.');
      return;
    }

    const q = this.quantita();
    if (!Number.isInteger(q) || q <= 0) {
      this.errorMessage.set('La quantità deve essere un numero intero maggiore di zero.');
      return;
    }

    const causaleVal = this.causale().trim();
    if (!causaleVal) {
      this.errorMessage.set('La causale del movimento è obbligatoria.');
      return;
    }

    // Verifica data non nel futuro
    const selectedTime = new Date(this.dataMovimento()).getTime();
    if (selectedTime > Date.now() + 60000) {
      this.errorMessage.set('La data del movimento non può essere nel futuro.');
      return;
    }

    this.isSubmitting.set(true);

    try {
      this.inventory.registraMovimento({
        prodottoId: pid,
        tipo: this.tipoMovimento(),
        quantita: q,
        causale: causaleVal,
        data: new Date(this.dataMovimento()).toISOString(),
      });

      this.successMessage.set(
        `Movimento di ${this.tipoMovimento()} (${q} pz) registrato con successo!`
      );
      this.causale.set('');
      this.quantita.set(1);
      this.isSubmitting.set(false);
    } catch (err: any) {
      this.isSubmitting.set(false);
      this.errorMessage.set(err.message || 'Errore durante la registrazione del movimento.');
    }
  }
}
