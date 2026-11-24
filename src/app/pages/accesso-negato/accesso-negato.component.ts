import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-accesso-negato',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div style="min-height: 60vh; display: flex; align-items: center; justify-content: center; padding: 2rem;">
      <div class="card" style="max-width: 520px; width: 100%; text-align: center; padding: 2.5rem 1.5rem;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⛔</div>
        <h2 style="color: #991b1b; font-size: 1.4rem; font-weight: 800; margin-bottom: 0.5rem;">
          Accesso Negato (403)
        </h2>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.25rem;">
          Il tuo profilo attuale
          (<strong>{{ auth.currentUser()?.ruolo || 'non autorizzato' }}</strong>) non possiede i permessi
          necessari per consultare o interagire con questa schermata.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem; text-align: left; font-size: 0.8rem;">
          <strong>Regole permessi Vallebruna:</strong>
          <ul style="margin-left: 1.25rem; margin-top: 0.35rem; color: #475569;">
            <li><strong>Magazziniere:</strong> giacenze, carichi/scarichi, avanzamento ordini (prezzi nascosti).</li>
            <li><strong>Commerciale:</strong> consultazione catalogo con prezzi, creazione ordini, annullamento ordini.</li>
            <li><strong>Amministratore:</strong> gestione anagrafiche, configurazione e permessi globali.</li>
          </ul>
        </div>

        <div style="display: flex; gap: 0.75rem; justify-content: center;">
          <a routerLink="/prodotti" class="btn btn-primary">
            Torna all'Elenco Prodotti
          </a>
        </div>
      </div>
    </div>
  `,
})
export class AccessoNegatoComponent {
  constructor(public auth: AuthService) {}
}
