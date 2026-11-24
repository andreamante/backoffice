import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { AccessoNegatoComponent } from './pages/accesso-negato/accesso-negato.component';
import { ProductsListComponent } from './pages/products/products-list.component';
import { ProductFormComponent } from './pages/products/product-form.component';
import { ProductDetailComponent } from './pages/products/product-detail.component';
import { MovementsComponent } from './pages/movements/movements.component';
import { ReorderListComponent } from './pages/reorder/reorder-list.component';
import { OrdersListComponent } from './pages/orders/orders-list.component';
import { OrderFormComponent } from './pages/orders/order-form.component';
import { CategoriesSuppliersComponent } from './pages/categories-suppliers/categories-suppliers.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { AuditLogComponent } from './pages/audit/audit-log.component';

import {
  authGuard,
  adminGuard,
  movementsGuard,
  reorderGuard,
  ordersGuard,
} from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'accesso-negato', component: AccessoNegatoComponent },

  // Prodotti
  { path: 'prodotti', component: ProductsListComponent, canActivate: [authGuard] },
  { path: 'prodotti/nuovo', component: ProductFormComponent, canActivate: [adminGuard] },
  { path: 'prodotti/:id', component: ProductDetailComponent, canActivate: [authGuard] },
  { path: 'prodotti/:id/modifica', component: ProductFormComponent, canActivate: [adminGuard] },

  // Movimenti & Giacenza
  { path: 'movimenti', component: MovementsComponent, canActivate: [movementsGuard] },
  { path: 'da-riordinare', component: ReorderListComponent, canActivate: [reorderGuard] },

  // Ordini
  { path: 'ordini', component: OrdersListComponent, canActivate: [ordersGuard] },
  { path: 'ordini/nuovo', component: OrderFormComponent, canActivate: [ordersGuard] },

  // Cruscotto & Amministrazione
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'categorie-fornitori', component: CategoriesSuppliersComponent, canActivate: [adminGuard] },
  { path: 'audit', component: AuditLogComponent, canActivate: [adminGuard] },

  { path: '', redirectTo: 'prodotti', pathMatch: 'full' },
  { path: '**', redirectTo: 'prodotti' },
];
