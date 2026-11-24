import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StorageService } from '../../services/storage.service';
import { InventoryService } from '../../services/inventory.service';
import { AuthService } from '../../services/auth.service';
import { ProdottoConGiacenza, Movimento } from '../../models/entities';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './product-detail.component.html',
})
export class ProductDetailComponent implements OnInit {
  productId = signal<string | null>(null);

  // Computed product details
  readonly product = computed<ProdottoConGiacenza | null>(() => {
    const id = this.productId();
    if (!id) return null;
    return this.storage.prodottiConGiacenza().find((p) => p.id === id) || null;
  });

  // Storico movimenti con giacenza progressiva riga per riga (Livello 2)
  readonly storicoMovimenti = computed(() => {
    const id = this.productId();
    if (!id) return [];
    return this.inventory.getStoricoMovimentiConGiacenzaProgressiva(id);
  });

  constructor(
    private route: ActivatedRoute,
    public storage: StorageService,
    private inventory: InventoryService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.productId.set(id);
  }
}
