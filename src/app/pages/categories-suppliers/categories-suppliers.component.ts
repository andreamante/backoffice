import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../../services/storage.service';
import { InventoryService } from '../../services/inventory.service';
import { AuthService } from '../../services/auth.service';
import { Categoria, Fornitore } from '../../models/entities';

@Component({
  selector: 'app-categories-suppliers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './categories-suppliers.component.html',
})
export class CategoriesSuppliersComponent {
  activeTab = signal<'categorie' | 'fornitori'>('categorie');

  // Category state
  newCategoryName = '';
  editingCategory = signal<Categoria | null>(null);
  editCategoryName = '';

  // Supplier state
  newSupplier = { ragioneSociale: '', email: '', telefono: '' };
  editingSupplier = signal<Fornitore | null>(null);
  editSupplierData = { ragioneSociale: '', email: '', telefono: '' };

  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  constructor(
    public storage: StorageService,
    private inventory: InventoryService,
    public auth: AuthService
  ) {}

  // Computed: Products count per category
  readonly productCountPerCategory = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.storage.prodotti()) {
      counts.set(p.categoriaId, (counts.get(p.categoriaId) || 0) + 1);
    }
    return counts;
  });

  // Computed: Products count per supplier
  readonly productCountPerSupplier = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.storage.prodotti()) {
      counts.set(p.fornitoreId, (counts.get(p.fornitoreId) || 0) + 1);
    }
    return counts;
  });

  clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  // --- Categorie Actions ---

  addCategory(): void {
    this.clearMessages();
    try {
      this.inventory.creaCategoria(this.newCategoryName);
      this.newCategoryName = '';
      this.successMessage.set('Categoria creata con successo.');
    } catch (e: any) {
      this.errorMessage.set(e.message);
    }
  }

  startEditCategory(c: Categoria): void {
    this.clearMessages();
    this.editingCategory.set(c);
    this.editCategoryName = c.nome;
  }

  cancelEditCategory(): void {
    this.editingCategory.set(null);
    this.editCategoryName = '';
  }

  saveEditCategory(): void {
    this.clearMessages();
    const c = this.editingCategory();
    if (!c) return;
    try {
      this.inventory.modificaCategoria(c.id, this.editCategoryName);
      this.editingCategory.set(null);
      this.successMessage.set('Categoria aggiornata con successo.');
    } catch (e: any) {
      this.errorMessage.set(e.message);
    }
  }

  deleteCategory(c: Categoria): void {
    this.clearMessages();
    try {
      this.inventory.eliminaCategoria(c.id);
      this.successMessage.set(`Categoria '${c.nome}' eliminata.`);
    } catch (e: any) {
      this.errorMessage.set(e.message);
    }
  }

  // --- Fornitori Actions ---

  addSupplier(): void {
    this.clearMessages();
    try {
      this.inventory.creaFornitore(this.newSupplier);
      this.newSupplier = { ragioneSociale: '', email: '', telefono: '' };
      this.successMessage.set('Fornitore creato con successo.');
    } catch (e: any) {
      this.errorMessage.set(e.message);
    }
  }

  startEditSupplier(f: Fornitore): void {
    this.clearMessages();
    this.editingSupplier.set(f);
    this.editSupplierData = {
      ragioneSociale: f.ragioneSociale,
      email: f.email,
      telefono: f.telefono,
    };
  }

  cancelEditSupplier(): void {
    this.editingSupplier.set(null);
  }

  saveEditSupplier(): void {
    this.clearMessages();
    const f = this.editingSupplier();
    if (!f) return;
    try {
      this.inventory.modificaFornitore(f.id, this.editSupplierData);
      this.editingSupplier.set(null);
      this.successMessage.set('Fornitore aggiornato con successo.');
    } catch (e: any) {
      this.errorMessage.set(e.message);
    }
  }

  deleteSupplier(f: Fornitore): void {
    this.clearMessages();
    try {
      this.inventory.eliminaFornitore(f.id);
      this.successMessage.set(`Fornitore '${f.ragioneSociale}' eliminato.`);
    } catch (e: any) {
      this.errorMessage.set(e.message);
    }
  }
}
