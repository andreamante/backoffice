import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StorageService } from '../../services/storage.service';
import { AuthService } from '../../services/auth.service';
import { InventoryService } from '../../services/inventory.service';
import { ProdottoConGiacenza } from '../../models/entities';

@Component({
  selector: 'app-reorder-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './reorder-list.component.html',
})
export class ReorderListComponent {
  constructor(
    public storage: StorageService,
    public auth: AuthService,
    private inventory: InventoryService
  ) {}

  quickRestock(p: ProdottoConGiacenza): void {
    const quantitaSuggerita = p.quantitaDaRiordinare;
    if (quantitaSuggerita <= 0) return;

    try {
      this.inventory.registraMovimento({
        prodottoId: p.id,
        tipo: 'carico',
        quantita: quantitaSuggerita,
        causale: `Carico riordino suggerito fornitore ${p.nomeFornitore}`,
      });
      alert(`Registrato carico di ${quantitaSuggerita} pezzi per ${p.sku} - ${p.nome}`);
    } catch (err: any) {
      alert(`Errore nel carico: ${err.message}`);
    }
  }
}
