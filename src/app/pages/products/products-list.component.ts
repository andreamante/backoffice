import { Component, signal, computed, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StorageService } from '../../services/storage.service';
import { AuthService } from '../../services/auth.service';
import { InventoryService } from '../../services/inventory.service';
import { ProdottoConGiacenza, StatoScorta } from '../../models/entities';

type SortField = 'sku' | 'nome' | 'categoria' | 'fornitore' | 'prezzo' | 'giacenza';

@Component({
  selector: 'app-products-list',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  templateUrl: './products-list.component.html',
})
export class ProductsListComponent {
  // Filter signals
  searchRaw = signal('');
  debouncedSearch = signal('');
  selectedCategoria = signal<string>('all');
  selectedAttivo = signal<'all' | 'true' | 'false'>('all');
  selectedStatoScorta = signal<'all' | StatoScorta>('all');

  // Sorting
  sortField = signal<SortField>('sku');
  sortAsc = signal<boolean>(true);

  // Pagination
  readonly pageSize = 10;
  currentPage = signal<number>(1);

  // States
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Delete modal state
  productToDelete = signal<ProdottoConGiacenza | null>(null);
  deleteError = signal<string | null>(null);

  private debounceTimer: any = null;

  constructor(
    public storage: StorageService,
    public auth: AuthService,
    private inventory: InventoryService
  ) {}

  onSearchChange(value: string): void {
    this.searchRaw.set(value);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    // Ricerca che parte a fine digitazione (debounce 300ms)
    this.debounceTimer = setTimeout(() => {
      this.debouncedSearch.set(value.trim().toLowerCase());
      this.currentPage.set(1);
    }, 300);
  }

  // Filtered & Sorted computed list
  readonly filteredProducts = computed(() => {
    const list = this.storage.prodottiConGiacenza();
    const query = this.debouncedSearch();
    const cat = this.selectedCategoria();
    const attivo = this.selectedAttivo();
    const scorta = this.selectedStatoScorta();
    const field = this.sortField();
    const asc = this.sortAsc();

    const filtered = list.filter((p) => {
      // Text search su nome e sku
      if (query) {
        const matchSku = p.sku.toLowerCase().includes(query);
        const matchNome = p.nome.toLowerCase().includes(query);
        if (!matchSku && !matchNome) return false;
      }

      // Categoria filter
      if (cat !== 'all' && p.categoriaId !== cat) {
        return false;
      }

      // Attivo filter
      if (attivo === 'true' && !p.attivo) return false;
      if (attivo === 'false' && p.attivo) return false;

      // Stato scorta filter (Livello 2)
      if (scorta !== 'all' && p.statoScorta !== scorta) {
        return false;
      }

      return true;
    });

    // Sorting
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (field) {
        case 'sku':
          cmp = a.sku.localeCompare(b.sku);
          break;
        case 'nome':
          cmp = a.nome.localeCompare(b.nome);
          break;
        case 'categoria':
          cmp = (a.nomeCategoria || '').localeCompare(b.nomeCategoria || '');
          break;
        case 'fornitore':
          cmp = (a.nomeFornitore || '').localeCompare(b.nomeFornitore || '');
          break;
        case 'prezzo':
          cmp = a.prezzoVendita - b.prezzoVendita;
          break;
        case 'giacenza':
          cmp = a.giacenza - b.giacenza;
          break;
      }
      return asc ? cmp : -cmp;
    });
  });

  // Paged slice
  readonly pagedProducts = computed(() => {
    const all = this.filteredProducts();
    const start = (this.currentPage() - 1) * this.pageSize;
    return all.slice(start, start + this.pageSize);
  });

  // Total pages
  readonly totalPages = computed(() => {
    const total = this.filteredProducts().length;
    return Math.max(1, Math.ceil(total / this.pageSize));
  });

  // Pagination string: «da X a Y di TOT»
  readonly paginationInfo = computed(() => {
    const total = this.filteredProducts().length;
    if (total === 0) return '0 risultati';
    const start = (this.currentPage() - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage() * this.pageSize, total);
    return `da ${start} a ${end} di ${total}`;
  });

  toggleSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortAsc.set(!this.sortAsc());
    } else {
      this.sortField.set(field);
      this.sortAsc.set(true);
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  // Delete modal handlers
  confirmDelete(p: ProdottoConGiacenza): void {
    this.deleteError.set(null);
    this.productToDelete.set(p);
  }

  cancelDelete(): void {
    this.productToDelete.set(null);
    this.deleteError.set(null);
  }

  executeDelete(): void {
    const p = this.productToDelete();
    if (!p) return;

    try {
      this.inventory.eliminaProdotto(p.id);
      this.productToDelete.set(null);
      this.deleteError.set(null);
      // Adjust current page if needed
      if (this.currentPage() > this.totalPages()) {
        this.currentPage.set(this.totalPages());
      }
    } catch (err: any) {
      this.deleteError.set(err.message || 'Errore durante l\'eliminazione');
    }
  }
}
