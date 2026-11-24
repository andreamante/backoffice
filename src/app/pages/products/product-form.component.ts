import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StorageService } from '../../services/storage.service';
import { InventoryService } from '../../services/inventory.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './product-form.component.html',
})
export class ProductFormComponent implements OnInit {
  form!: FormGroup;
  isEditMode = signal<boolean>(false);
  productId = signal<string | null>(null);
  isSaving = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    public storage: StorageService,
    private inventory: InventoryService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.initForm();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.productId.set(id);
      this.loadProductData(id);
    }
  }

  private initForm(): void {
    this.form = this.fb.group({
      sku: [
        '',
        [
          Validators.required,
          // Formato ABC-0001 (3 lettere maiuscole, trattino, 4 cifre)
          Validators.pattern(/^[A-Z]{3}-\d{4}$/),
        ],
      ],
      nome: ['', [Validators.required, Validators.minLength(3)]],
      descrizione: [''],
      categoriaId: ['', [Validators.required]],
      fornitoreId: ['', [Validators.required]],
      prezzoVendita: [null, [Validators.required, Validators.min(0.01)]],
      scortaMinima: [
        0,
        [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)],
      ],
      attivo: [true],
    });
  }

  private loadProductData(id: string): void {
    const prod = this.storage.prodotti().find((p) => p.id === id);
    if (!prod) {
      this.errorMessage.set(`Prodotto con ID ${id} non trovato.`);
      return;
    }

    this.form.patchValue({
      sku: prod.sku,
      nome: prod.nome,
      descrizione: prod.descrizione,
      categoriaId: prod.categoriaId,
      fornitoreId: prod.fornitoreId,
      prezzoVendita: prod.prezzoVendita,
      scortaMinima: prod.scortaMinima,
      attivo: prod.attivo,
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isSaving.set(true);

    const formVal = this.form.value;
    const dati = {
      sku: formVal.sku.toUpperCase().trim(),
      nome: formVal.nome.trim(),
      descrizione: (formVal.descrizione || '').trim(),
      categoriaId: formVal.categoriaId,
      fornitoreId: formVal.fornitoreId,
      prezzoVendita: parseFloat(formVal.prezzoVendita),
      scortaMinima: parseInt(formVal.scortaMinima, 10),
      attivo: Boolean(formVal.attivo),
    };

    try {
      if (this.isEditMode()) {
        this.inventory.modificaProdotto(this.productId()!, dati);
      } else {
        this.inventory.creaProdotto(dati);
      }
      this.isSaving.set(false);
      this.router.navigate(['/prodotti']);
    } catch (err: any) {
      this.isSaving.set(false);
      this.errorMessage.set(err.message || 'Errore durante il salvataggio.');
    }
  }
}
