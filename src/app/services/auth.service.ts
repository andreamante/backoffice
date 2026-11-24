import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Utente, RuoloUtente } from '../models/entities';
import { StorageService } from './storage.service';

const CURRENT_USER_KEY = 'vallebruna_current_user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  // Current user signal
  readonly currentUser = signal<Utente | null>(null);

  // Computed helper signals for permissions
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly userRole = computed<RuoloUtente | null>(() => this.currentUser()?.ruolo ?? null);

  // Permission checks as reactive computed signals:
  // Matrix from Page 5:
  // Magazziniere:
  //   Vedere prodotti e giacenze: SÌ
  //   Vedere prezzi e totali: NO
  //   Creare, modificare, eliminare prodotti: NO
  //   Registrare carichi e scarichi: SÌ
  //   Creare ordini: NO
  //   Portare un ordine a "in preparazione" o "spedito": SÌ
  //   Annullare un ordine: NO
  //   Vista "Da riordinare": SÌ
  //   Gestire categorie, fornitori, utenti e profili: NO
  //
  // Commerciale:
  //   Vedere prodotti e giacenze: SÌ
  //   Vedere prezzi e totali: SÌ
  //   Creare, modificare, eliminare prodotti: NO
  //   Registrare carichi e scarichi: NO
  //   Creare ordini: SÌ
  //   Portare un ordine a "in preparazione" o "spedito": NO
  //   Annullare un ordine: SÌ
  //   Vista "Da riordinare": NO
  //   Gestire categorie, fornitori, utenti e profili: NO
  //
  // Amministratore:
  //   SÌ A TUTTO

  readonly canViewProducts = computed(() => {
    const role = this.userRole();
    return role === 'magazziniere' || role === 'commerciale' || role === 'amministratore';
  });

  readonly canViewPrices = computed(() => {
    const role = this.userRole();
    return role === 'commerciale' || role === 'amministratore';
  });

  readonly canManageProducts = computed(() => {
    return this.userRole() === 'amministratore';
  });

  readonly canManageMovements = computed(() => {
    const role = this.userRole();
    return role === 'magazziniere' || role === 'amministratore';
  });

  readonly canCreateOrders = computed(() => {
    const role = this.userRole();
    return role === 'commerciale' || role === 'amministratore';
  });

  readonly canAdvanceOrderStatus = computed(() => {
    const role = this.userRole();
    return role === 'magazziniere' || role === 'amministratore';
  });

  readonly canCancelOrders = computed(() => {
    const role = this.userRole();
    return role === 'commerciale' || role === 'amministratore';
  });

  readonly canViewReorderList = computed(() => {
    const role = this.userRole();
    return role === 'magazziniere' || role === 'amministratore';
  });

  readonly canManageAdministration = computed(() => {
    return this.userRole() === 'amministratore';
  });

  constructor(
    private storage: StorageService,
    private router: Router
  ) {
    this.restoreSession();
  }

  private restoreSession(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(CURRENT_USER_KEY);
      if (stored) {
        this.currentUser.set(JSON.parse(stored));
      } else {
        // Default login with admin for initial ease of inspection, or prompt login
        const defaultAdmin = this.storage.utenti().find((u) => u.ruolo === 'amministratore');
        if (defaultAdmin) {
          this.login(defaultAdmin.email, defaultAdmin.password);
        }
      }
    } catch {
      this.currentUser.set(null);
    }
  }

  login(email: string, password: string): { success: boolean; message?: string } {
    const users = this.storage.utenti();
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return { success: false, message: 'Utente non trovato' };
    }

    if (user.password !== password) {
      return { success: false, message: 'Password errata' };
    }

    this.currentUser.set(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    }
    return { success: true };
  }

  logout(): void {
    this.currentUser.set(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
    this.router.navigate(['/login']);
  }

  switchUser(role: RuoloUtente): void {
    const target = this.storage.utenti().find((u) => u.ruolo === role);
    if (target) {
      this.currentUser.set(target);
      if (typeof window !== 'undefined') {
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(target));
      }
    }
  }

  // Enforcement check at code execution level
  assertPermission(allowed: boolean, actionDescription: string): void {
    if (!allowed) {
      const currentRole = this.userRole() || 'non autenticato';
      throw new Error(
        `[ACCESSO NEGATO] Il profilo '${currentRole}' non ha il permesso di eseguire l'operazione: ${actionDescription}`
      );
    }
  }
}
