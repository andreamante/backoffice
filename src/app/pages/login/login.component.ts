import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { RuoloUtente } from '../../models/entities';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  email = '';
  password = '';
  errorMessage = signal<string | null>(null);

  constructor(
    public auth: AuthService,
    private router: Router
  ) {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/prodotti']);
    }
  }

  onSubmit(): void {
    this.errorMessage.set(null);
    const res = this.auth.login(this.email, this.password);
    if (res.success) {
      this.router.navigate(['/prodotti']);
    } else {
      this.errorMessage.set(res.message || 'Credenziali non valide');
    }
  }

  quickLogin(role: RuoloUtente): void {
    if (role === 'magazziniere') {
      this.email = 'magazzino@vallebruna.it';
      this.password = 'password123';
    } else if (role === 'commerciale') {
      this.email = 'commerciale@vallebruna.it';
      this.password = 'password123';
    } else if (role === 'amministratore') {
      this.email = 'admin@vallebruna.it';
      this.password = 'password123';
    }
    this.onSubmit();
  }
}
