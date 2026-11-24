import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StorageService } from '../../services/storage.service';
import { AuditService } from '../../services/audit.service';
import { AuthService } from '../../services/auth.service';
import { OperazioneAudit } from '../../models/entities';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './audit-log.component.html',
})
export class AuditLogComponent {
  actionMessage = signal<string | null>(null);
  actionError = signal<string | null>(null);

  constructor(
    public storage: StorageService,
    private auditService: AuditService,
    public auth: AuthService
  ) {}

  annullaUltima(): void {
    this.actionMessage.set(null);
    this.actionError.set(null);

    const res = this.auditService.annullaUltimaOperazione();
    if (res.success) {
      this.actionMessage.set(res.message);
    } else {
      this.actionError.set(res.message);
    }
  }
}
