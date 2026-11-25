import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@core/i18n';

/** Frame of every page shown in the side sheet: title, close button, scrolling body. */
@Component({
  selector: 'app-sheet-page',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <h2 [attr.data-section-test]="section() + '-title'">{{ title() }}</h2>
      <a
        class="close"
        [attr.data-section-test]="section() + '-close'"
        routerLink="/"
        [attr.aria-label]="'app.common.close' | translate"
      >
        <i class="ti ti-x" aria-hidden="true"></i>
      </a>
    </header>
    <div class="body" [attr.data-section-test]="section() + '-body'"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 20px 8px;
    }
    h2 {
      font-size: 21px;
      font-weight: 700;
    }
    .close {
      background: var(--p2);
      color: var(--t);
      width: var(--touch);
      height: var(--touch);
      border-radius: 50%;
      font-size: 18px;
      display: grid;
      place-items: center;
      text-decoration: none;
    }
    .body {
      padding: 8px 20px 20px;
      overflow: auto;
      overscroll-behavior: contain;
      flex: 1;
    }
    @media (max-width: 600px), (max-width: 1023.98px) and (max-height: 500px) {
      header {
        padding: 8px 14px 4px;
      }
      .body {
        padding: 6px 14px 14px;
      }
    }
  `,
})
export class SheetPage {
  readonly title = input.required<string>();
  /** Prefix of the test hooks (data-section-test) of this page. */
  readonly section = input('page');
}
