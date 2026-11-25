import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@core/i18n';
import { SheetPage } from './sheet-page';

/**
 * Stand-in for an area that exists in the prototype but is not ported yet.
 * Route data: `titleKey` (translation key) and `icon` (Tabler icon name).
 */
@Component({
  selector: 'app-coming-soon-page',
  imports: [SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page [section]="section" [title]="titleKey | translate">
      <div class="empty" [attr.data-section-test]="section + '-coming-soon'">
        <i class="ti" [class]="'ti-' + icon" aria-hidden="true"></i>
        <p>{{ 'app.common.coming_soon' | translate }}</p>
      </div>
    </app-sheet-page>
  `,
})
export class ComingSoonPage {
  private readonly data = inject(ActivatedRoute).snapshot.data;
  protected readonly titleKey: string = this.data['titleKey'];
  protected readonly section = this.titleKey?.split('.').pop() ?? 'page';
  protected readonly icon: string = this.data['icon'] ?? 'clock';
}
