import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StorageService } from '../../services/storage.service';
import { OrderService } from '../../services/order.service';
import { AuthService } from '../../services/auth.service';
import { Ordine, StatoOrdine } from '../../models/entities';

@Component({
  selector: 'app-orders-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './orders-list.component.html',
})
export class OrdersListComponent {
  searchQuery = signal<string>('');
  selectedStato = signal<'all' | StatoOrdine>('all');

  // Error/Success alerts
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // Selected order for detailed modal
  selectedOrder = signal<Ordine | null>(null);

  constructor(
    public storage: StorageService,
    public orderService: OrderService,
    public auth: AuthService
  ) {}

  readonly filteredOrders = computed(() => {
    const list = this.storage.ordini();
    const q = this.searchQuery().trim().toLowerCase();
    const st = this.selectedStato();

    return list.filter((o) => {
      if (st !== 'all' && o.stato !== st) {
        return false;
      }
      if (q) {
        const matchNum = o.numero.toLowerCase().includes(q);
        const matchCli = o.cliente.toLowerCase().includes(q);
        if (!matchNum && !matchCli) return false;
      }
      return true;
    });
  });

  getTotale(ordine: Ordine) {
    return this.orderService.calcolaTotali(ordine.righe);
  }

  getProductName(prodottoId: string): string {
    const prod = this.storage.prodotti().find((p) => p.id === prodottoId);
    return prod ? `${prod.sku} - ${prod.nome}` : prodottoId;
  }

  openOrderDetails(o: Ordine): void {
    this.selectedOrder.set(o);
  }

  closeOrderDetails(): void {
    this.selectedOrder.set(null);
  }

  eseguiAzione(ordine: Ordine, nuovoStato: StatoOrdine): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      this.orderService.cambiaStato(ordine.id, nuovoStato);
      this.successMessage.set(
        `Stato dell'ordine ${ordine.numero} aggiornato con successo a '${nuovoStato}'.`
      );
      if (this.selectedOrder()?.id === ordine.id) {
        const updated = this.storage.ordini().find((o) => o.id === ordine.id) || null;
        this.selectedOrder.set(updated);
      }
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Errore nel cambio stato');
    }
  }
}
