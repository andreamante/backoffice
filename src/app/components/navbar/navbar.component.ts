import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgClass } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';
import { RuoloUtente } from '../../models/entities';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgClass],
  templateUrl: './navbar.component.html',
})
export class NavbarComponent {
  confirmResetModal = false;

  constructor(
    public auth: AuthService,
    public storage: StorageService
  ) {}

  switchRole(role: RuoloUtente): void {
    this.auth.switchUser(role);
  }

  openResetModal(): void {
    this.confirmResetModal = true;
  }

  closeResetModal(): void {
    this.confirmResetModal = false;
  }

  confirmReset(): void {
    this.storage.resetToSeed();
    this.confirmResetModal = false;
  }
}
