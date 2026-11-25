import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { hook } from '@shared/testing';
import { SheetPage } from './sheet-page';

@Component({
  imports: [SheetPage],
  template: `<app-sheet-page section="engine" title="Motor"
    ><p data-section-test="host-inner">content</p></app-sheet-page
  >`,
})
class Host {}

describe('SheetPage', () => {
  let root: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideI18nTesting()] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    fixture.detectChanges();
    root = fixture.nativeElement;
  });

  it('shows the title as heading', () => {
    expect(hook(root, 'engine-title').textContent).toBe('Motor');
  });

  it('closes by going back to the start route', () => {
    const close = hook<HTMLAnchorElement>(root, 'engine-close');

    expect(close.getAttribute('href')).toBe('/');
    expect(close.getAttribute('aria-label')).toBe('app.common.close');
  });

  it('projects its content into the scrolling body', () => {
    expect(hook(hook(root, 'engine-body'), 'host-inner').textContent).toBe('content');
  });
});
