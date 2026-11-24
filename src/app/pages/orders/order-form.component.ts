import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { StorageService } from '../../services/storage.service';
import { OrderService, TotaliOrdine } from '../../services/order.service';
import { AuthService } from '../../services/auth.service';
import { ProdottoConGiacenza } from '../../models/entities';

export interface FormRow {
  prodottoId: string;
  quantita: number;
}

@Component({
  selector: 'app-order-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './order-form.component.html',
})
export class OrderFormComponent {
  cliente = signal<string>('');
  righe = signal<FormRow[]>([
    { prodottoId: '', quantita: 1 },
  ]);

  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  constructor(
    public storage: StorageService,
    private orderService: OrderService,
    public auth: AuthService,
    private router: Router
  ) {}

  // Computed row details with current price and current available stock
  readonly righeConDettaglio = computed(() => {
    const prodsMap = new Map(this.storage.prodottiConGiacenza().map((p) => [p.id, p]));

    return this.righe().map((r, index) => {
      const prod = prodsMap.get(r.prodottoId);
      const prezzoUnitario = prod ? prod.prezzoVendita : 0;
      const subtotale = (r.quantita || 0) * prezzoUnitario;
      const giacenzaDisponibile = prod ? prod.giacenza : 0;
      const stockInsufficiente = r.quantita > giacenzaDisponibile;

      return {
        ...r,
        index,
        prodotto: prod,
        prezzoUnitario,
        subtotale,
        giacenzaDisponibile,
        stockInsufficiente,
      };
    });
  });

  // Totali in tempo reale calcolati con la regola del Livello 3
  readonly totali = computed<TotaliOrdine>(() => {
    const items = this.righeConDettaglio().map((r) => ({
      quantita: r.quantita || 0,
      prezzoUnitario: r.prezzoUnitario,
    }));
    return this.orderService.calcolaTotali(items);
  });

  addRow(): void {
    this.righe.update((curr) => [...curr, { prodottoId: '', quantita: 1 }]);
  }

  removeRow(index: number): void {
    this.righe.update((curr) => curr.filter((_, i) => i !== index));
  }

  updateRowProduct(index: number, prodottoId: string): void {
    this.righe.update((curr) => {
      const copy = [...curr];
      copy[index] = { ...copy[index], prodottoId };
      return copy;
    });
  }

  updateRowQuantity(index: number, quantita: number): void {
    this.righe.update((curr) => {
      const copy = [...curr];
      copy[index] = { ...copy[index], quantita: Math.max(1, Math.floor(quantita || 1)) };
      return copy;
    });
  }

  onSubmit(): void {
    this.errorMessage.set(null);

    const nomeCliente = this.cliente().trim();
    if (!nomeCliente) {
      this.errorMessage.set('Il nome o ragione sociale del cliente è obbligatorio.');
      return;
    }

    const validRows = this.righe().filter((r) => r.prodottoId && r.quantita > 0);
    if (validRows.length === 0) {
      this.errorMessage.set('Aggiungi almeno una riga prodotto valida con quantità > 0.');
      return;
    }

    this.isSubmitting.set(true);

    try {
      this.orderService.creaOrdine({
        cliente: nomeCliente,
        righe: validRows,
      });

      this.isSubmitting.set(false);
      this.router.navigate(['/ordini']);
    } catch (err: any) {
      this.isSubmitting.set(false);
      this.errorMessage.set(err.message || "Errore durante la creazione dell'ordine.");
    }
  }
}
